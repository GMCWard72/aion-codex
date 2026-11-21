/* Manual Year and Date sorting. Labels and Event contents are never rewritten. */
function numericYear(text){
  const normalized=text.trim().replace(/^\u2212/,'-');
  if(!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(normalized))return null;
  const value=Number(normalized.replace(/,/g,''));return Number.isSafeInteger(value)?value:null;
}
function yearKey(label,eras){
  const text=label.trim();
  for(let index=0;index<eras.length;index++){
    const era=eras[index];
    if(text.toLowerCase().endsWith(era.toLowerCase())){
      const number=numericYear(text.slice(0,-era.length));
      if(number!==null)return eras.length===2?[index,index===0?-Math.abs(number):Math.abs(number)]:[0,number];
    }
  }
  const bare=numericYear(text);
  if(bare!==null)return [eras.length===2?1:0,bare];
  if(eras.length<2){
    const match=/^([+\-\u2212]?(?:\d{1,3}(?:,\d{3})+|\d+))\s*([\p{L}][\p{L}\p{M}\s.'’()\-]*)$/u.exec(text);
    if(match){const number=numericYear(match[1]);if(number!==null)return [0,number];}
  }
  return null;
}
function sortAgeYears(ages,index,configuredEras=['BCE','CE']){
  const age=ages[index];if(!age)throw new Error('The Age is no longer available.');
  if(age.starting)return ages;
  const eras=(Array.isArray(configuredEras)?configuredEras:[]).slice(0,2).filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim());
  if(eras.length===2&&eras[0].toLowerCase()===eras[1].toLowerCase())throw new Error('The two Era names must be different before sorting Years.');
  const positions=[],sortable=[];
  age.years.forEach((year,position)=>{const key=yearKey(year.label,eras);if(key){positions.push(position);sortable.push({year,key,position});}});
  sortable.sort((a,b)=>a.key[0]-b.key[0]||a.key[1]-b.key[1]||a.position-b.position);
  const years=[...age.years];positions.forEach((position,i)=>{years[position]=sortable[i].year;});
  if(years.every((year,i)=>year===age.years[i]))return ages;
  return ages.map((entry,i)=>i===index?{...entry,years}:entry);
}
function dateKey(label,months){
  const text=label.trim().replace(/\s+/g,' ').toLowerCase();
  if(text==='circa')return [-1,0];
  const names=months.map((name,index)=>({name:name.trim().replace(/\s+/g,' ').toLowerCase(),index}));
  const only=names.find(month=>text===month.name);if(only)return [only.index,0];
  const day=value=>{const match=/^(\d+)(?:st|nd|rd|th)?$/.exec(value);if(!match)return null;const number=Number(match[1]);return Number.isSafeInteger(number)&&number>0?number:null;};
  for(const month of names.sort((a,b)=>b.name.length-a.name.length)){
    if(text.startsWith(month.name)){
      const number=day(text.slice(month.name.length).trim().replace(/^,\s*/,''));if(number!==null)return [month.index,number];
    }
    if(text.endsWith(month.name)){
      const number=day(text.slice(0,-month.name.length).trim());if(number!==null)return [month.index,number];
    }
  }
  return null;
}
function sortYearDates(ages,ageIndex,yearIndex,configuredMonths=[]){
  const age=ages[ageIndex];if(!age)throw new Error('The Age is no longer available.');
  if(age.starting)return ages;
  const year=age.years[yearIndex];if(!year)throw new Error('The Year is no longer available.');
  const months=(Array.isArray(configuredMonths)?configuredMonths:[]).filter(name=>typeof name==='string'&&name.trim()).map(name=>name.trim());
  const keys=months.map(name=>name.replace(/\s+/g,' ').toLowerCase());
  if(new Set(keys).size!==keys.length)throw new Error('Month names must be unique before sorting Dates.');
  const circa=[],remaining=[];
  for(const group of year.groups){const key=dateKey(group.title,months);if(key?.[0]===-1)circa.push(group);else remaining.push({group,key});}
  const positions=[],sortable=[];
  remaining.forEach((item,index)=>{if(item.key){positions.push(index);sortable.push({...item,index});}});
  sortable.sort((a,b)=>a.key[0]-b.key[0]||a.key[1]-b.key[1]||a.index-b.index);
  const groups=remaining.map(item=>item.group);positions.forEach((position,i)=>{groups[position]=sortable[i].group;});groups.unshift(...circa);
  if(groups.every((group,index)=>group===year.groups[index]))return ages;
  const years=age.years.map((entry,index)=>index===yearIndex?{...entry,groups}:entry);
  return ages.map((entry,index)=>index===ageIndex?{...entry,years}:entry);
}
module.exports={numericYear,yearKey,sortAgeYears,dateKey,sortYearDates};
