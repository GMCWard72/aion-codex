const clone=value=>JSON.parse(JSON.stringify(value));
function checked(list,index,label){if(!Number.isInteger(index)||index<0||!list?.[index])throw new Error('The '+label+' is no longer available.');return list[index];}
function boundaryIndex(list,index){if(!Number.isInteger(index)||index<0||index>list.length)throw new Error('Invalid drop position.');return index;}
function nearestEdge(candidates,y){
 let result=null,distance=Infinity;
 for(const candidate of candidates)for(const edge of ['before','after']){
  const at=edge==='before'?candidate.rect.top:candidate.rect.bottom;
  const delta=Number.isFinite(y)?Math.abs(y-at):(edge==='before'?0:Infinity);
  if(delta<distance){distance=delta;result={...candidate,edge};}
 }
 return result;
}
function mergeDates(groups){
 const result=[],seen=new Map();
 for(const group of groups){
  const key=group.title.trim(),match=seen.get(key);
  if(match)match.events.push(...group.events);
  else{const copy={...group,events:[...group.events]};seen.set(key,copy);result.push(copy);}
 }
 return result;
}
function mergeYears(years){
 const result=[],seen=new Map();
 for(const year of years){
  const key=year.label.trim(),match=seen.get(key);
  if(match){match.groups=mergeDates([...match.groups,...year.groups]);if(!match.image&&year.image)match.image=year.image;}
  else{const copy={...year,groups:mergeDates(year.groups)};seen.set(key,copy);result.push(copy);}
 }
 return result;
}
function streamFor(ages){
 const stream=[];
 ages.forEach((age,ai)=>{
  stream.push({kind:'header',age,ai});
  age.years.forEach((year,yi)=>{
   if(!year.groups.length)stream.push({kind:'year',year,ai,yi});
   year.groups.forEach((group,gi)=>stream.push({kind:'group',year,group,ai,yi,gi}));
  });
 });return stream;
}
function insertionIndex(stream,target){
 if(target.kind==='end')return stream.length;
 const header=stream.findIndex(t=>t.kind==='header'&&t.ai===target.ai);
 if(header<0)throw new Error('The destination Age is no longer available.');
 if(target.kind==='ageHeader')return header+(target.edge==='after'?1:0);
 if(target.kind==='age'){
  if(target.edge!=='after')return header;
  const next=stream.findIndex((t,i)=>i>header&&t.kind==='header');return next<0?stream.length:next;
 }
 const positions=[];stream.forEach((t,i)=>{if(t.ai===target.ai&&t.yi===target.yi&&(target.kind==='year'||t.gi===target.gi))positions.push(i);});
 if(!positions.length)throw new Error('The destination Date/Year is no longer available.');
 return target.edge==='after'?positions.at(-1)+1:positions[0];
}
function rebuild(stream){
 const result=[];let age,year,origin,originAge;
 for(const token of stream){
  if(token.kind==='header'){age={...token.age,years:[]};result.push(age);year=null;origin=null;originAge=null;continue;}
  if(!age)throw new Error('This would leave Events without an Age. Hold Ctrl to move the first Age with its Events.');
  const {groups,...metadata}=token.year;
  const same=year&&(origin===token.year||originAge!==token.ai)&&JSON.stringify((({groups,...rest})=>rest)(year))===JSON.stringify(metadata);
  const crossed=origin&&origin!==token.year;
  if(!same){year={...metadata,groups:[]};age.years.push(year);}
  if(token.group){
   const last=year.groups.at(-1);
   if(same&&crossed&&last?.title===token.group.title)last.events.push(...token.group.events);
   else year.groups.push({...token.group,events:[...token.group.events]});
  }
  origin=token.year;originAge=token.ai;
 }
 return result;
}
function moveAgeBoundary(ages,from,target){
 const next=clone(ages);checked(next,from,'Age');
 const stream=streamFor(next);let at=insertionIndex(stream,target);
 const start=stream.findIndex(t=>t.kind==='header'&&t.ai===from);
 const [marker]=stream.splice(start,1);if(start<at)at--;
 stream.splice(at,0,marker);
 const result=rebuild(stream);
 for(const age of result){
  const original=next.find(item=>item.title===age.title);
  if(JSON.stringify(age.years)!==JSON.stringify(original.years))age.years=mergeYears(age.years);
 }
 return result;
}
function moveTimelineItem(ages,drag,target){
 if(drag.kind==='age'&&!drag.wholeAge)return moveAgeBoundary(ages,drag.ai,target);
 const next=clone(ages),source=checked(next,drag.ai,'Age');
 if(drag.kind==='age'){
  if(target.kind!=='age'&&target.kind!=='end')throw new Error('Drop a whole Age between Age sections. Release Ctrl to move its boundary between Dates.');
  let at=target.kind==='end'?next.length:boundaryIndex(next,target.ai)+(target.edge==='after'?1:0);
  next.splice(drag.ai,1);if(drag.ai<at)at--;next.splice(at,0,source);return next;
 }
 const destination=checked(next,target.ai,'destination Age');
 if(drag.kind==='year'){
  const item=checked(source.years,drag.yi,'Year');
  let at=target.yi===undefined?destination.years.length:boundaryIndex(destination.years,target.yi);
  source.years.splice(drag.yi,1);if(source===destination&&drag.yi<at)at--;destination.years.splice(at,0,item);
  destination.years=mergeYears(destination.years);return next;
 }
 const sourceYear=checked(source.years,drag.yi,'Year'),destYear=checked(destination.years,target.yi,'destination Year');
 if(drag.kind==='group'){
  const item=checked(sourceYear.groups,drag.gi,'Date group');
  let at=target.gi===undefined?destYear.groups.length:boundaryIndex(destYear.groups,target.gi);
  sourceYear.groups.splice(drag.gi,1);if(sourceYear===destYear&&drag.gi<at)at--;destYear.groups.splice(at,0,item);
  destYear.groups=mergeDates(destYear.groups);
 }else if(drag.kind==='event'){
  const sourceGroup=checked(sourceYear.groups,drag.gi,'Date group'),item=checked(sourceGroup.events,drag.ei,'Event');
  let destGroup=target.gi===undefined?null:checked(destYear.groups,target.gi,'destination Date group');
  if(!destGroup){destGroup={title:sourceGroup.title,events:[]};destYear.groups.push(destGroup);}
  let at=target.ei===undefined?destGroup.events.length:boundaryIndex(destGroup.events,target.ei);
  sourceGroup.events.splice(drag.ei,1);if(sourceGroup===destGroup&&drag.ei<at)at--;destGroup.events.splice(at,0,item);
  if(sourceGroup!==destGroup&&!sourceGroup.events.length)sourceYear.groups.splice(sourceYear.groups.indexOf(sourceGroup),1);
 }else throw new Error('Unknown drag type.');
 if(sourceYear!==destYear&&!sourceYear.groups.length)source.years.splice(source.years.indexOf(sourceYear),1);
 return next;
}
module.exports={moveAgeBoundary,moveTimelineItem,nearestEdge};
