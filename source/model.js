/* Pure Markdown model, shared by the plugin and its verification tests. */
function parse(source) {
  const ages = []; let age, year, group, event, pendingStarting=false;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    let m;
    if ((m=/^<!-- aion: [\w-]+\/([\w-]+) -->\s*$/.exec(line))) {pendingStarting=m[1]==='starting';continue;}
    if ((m = /^# (.+)$/.exec(line))) {
      age = { title: m[1], position: 'normal', colour: '', years: [] }; ages.push(age);
      if(pendingStarting){age.starting=true;pendingStarting=false;}
      year = group = event = null;
    } else if (/^---\s*$/.test(line)) { continue;
    } else if (/^<!-- starting: true -->\s*$/.test(line)&&age){age.starting=true;
    } else if ((m = /^<!-- position: (start|end|normal) -->\s*$/.exec(line)) && age) {
      age.position = m[1];
    } else if ((m = /^<!-- colour: (#[0-9a-fA-F]{6}) -->\s*$/.exec(line)) && age) {
      age.colour = m[1];
    } else if ((m = /^## (.+)$/.exec(line)) && age) {
      year = { label: m[1], image: '', groups: [] }; age.years.push(year); group = event = null;
    } else if ((m = /^<!-- image: (.*?) -->\s*$/.exec(line)) && year) { year.image = m[1];
    } else if ((m = /^### (.+)$/.exec(line)) && year) {
      group = { title: m[1], events: [] }; year.groups.push(group); event = null;
    } else if ((m = /^- (.*)$/.exec(line)) && group) {
      event = { text: m[1] }; group.events.push(event);
    } else if (/^ {2}/.test(line) && event) { event.text += '\n' + line.slice(2);
    } else if (age && !year && !/^#{1,6}\s|^<!--/.test(line)) {
      if (line.trim() || age.description) age.description = (age.description ? age.description + '\n' : '') + line;
    } else if (line.trim()) {
      throw new Error('Unrecognised timeline line: ' + line + '. Use # Age, ## Year, ### Date, and - Event.');
    }
  }
  for (const a of ages) if (a.description !== undefined) {
    a.description = a.description.trim();
    if (!a.description) delete a.description;
  }
  assertUniqueAgeTitles(ages);
  assertSingleStartingAge(ages);
  return ages;
}
function assertSingleStartingAge(ages){
  if(ages.filter(age=>age.starting).length>1)throw new Error('Only one Starting Age is allowed in a Chronicle.');
}
function orderStartingAge(ages){
  assertSingleStartingAge(ages);const index=ages.findIndex(age=>age.starting);
  if(index<=0)return ages;
  const next=[...ages];next.unshift(...next.splice(index,1));return next;
}
function setStartingAge(ages,index){
  if(!Number.isInteger(index)||!ages[index])throw new Error('The Starting Age is no longer available.');
  const next=JSON.parse(JSON.stringify(ages));for(const age of next)delete age.starting;
  next[index].starting=true;delete next[index].autoSort;
  return orderStartingAge(next);
}
function assertUniqueAgeTitles(ages){
  const seen=new Set();
  for(const age of ages){
    const key=age.title.trim().replace(/\s+/g,' ').toLowerCase();
    if(seen.has(key))throw new Error('Age titles must be unique. Rename the duplicate Age “'+age.title+'”.');
    seen.add(key);
  }
}
function serialize(ages) {
  return ages.map(a => ['# ' + a.title,
    ...(a.starting?['<!-- starting: true -->']:[]),
    ...(a.position !== 'normal' ? ['<!-- position: ' + a.position + ' -->'] : []),
    ...(a.colour ? ['<!-- colour: ' + a.colour + ' -->'] : []),
    ...(a.description?.trim() ? ['', a.description.trim()] : []),
    ...a.years.flatMap(y => ['', '## ' + y.label,
      ...(y.image ? ['<!-- image: ' + y.image + ' -->'] : []),
      ...y.groups.flatMap(g => ['### ' + g.title,
        ...g.events.map(e => '- ' + e.text.replace(/\n/g, '\n  '))])])
  ].join('\n')).join('\n\n---\n\n') + '\n';
}
function ordered(ages) {
  return [...ages];
}
// destination is an insertion boundary in the original array (length means append).
function moveAge(ages, from, destination) {
  const result = [...ages];
  if (!Number.isInteger(from) || !Number.isInteger(destination) || from < 0 || from >= ages.length || destination < 0 || destination > ages.length)
    throw new Error('Invalid Age move.');
  const [age] = result.splice(from, 1);
  result.splice(destination > from ? destination - 1 : destination, 0, age);
  return result;
}
function saveEvent(ages, context, draft) {
  const next = JSON.parse(JSON.stringify(ages));
  const sourceAge = context.event ? next[context.ai] : null;
  const sourceYear = sourceAge?.years[context.yi];
  const sourceGroup = sourceYear?.groups[context.gi];
  if (context.event && !sourceGroup?.events[context.ei]) throw new Error('The Event is no longer available. Reopen the editor.');
  let age = next[draft.ai];
  if (!age) {
    if (!draft.ageTitle) throw new Error('Choose an existing Age.');
    age = { title: draft.ageTitle.trim(), position: 'normal', colour: '', years: [] }; next.push(age);
  }
  if (draft.ageTitle !== undefined) age.title = draft.ageTitle.trim();
  if (draft.colour !== undefined) age.colour = draft.colour;
  const label = draft.yearLabel.trim(), date = draft.date.trim();
  let year = age === sourceAge && sourceYear.label === label ? sourceYear : age.years.find(y => y.label === label);
  if (!year) {
    if (age === sourceAge && sourceYear.groups.length === 1 && sourceGroup.events.length === 1) {
      year = sourceYear; year.label = label;
    } else {
      year = { label, image: '', groups: [] };
      const at = age === sourceAge ? age.years.indexOf(sourceYear) + 1 : age.years.length;
      age.years.splice(at, 0, year);
    }
  }
  let group = year === sourceYear && sourceGroup.title === date ? sourceGroup : year.groups.find(g => g.title === date);
  if (!group) {
    if (year === sourceYear && sourceGroup.events.length === 1) {
      group = sourceGroup; group.title = date;
    } else {
      group = { title: date, events: [] };
      const at = year === sourceYear ? year.groups.indexOf(sourceGroup) + 1 : year.groups.length;
      year.groups.splice(at, 0, group);
    }
  }
  if (sourceGroup) sourceGroup.events.splice(context.ei, 1);
  const entry = { text: draft.text.trim() };
  if (group === sourceGroup) group.events.splice(context.ei, 0, entry);
  else if (!context.event && context.insertAfter && draft.ai === context.ai && year === next[context.ai]?.years[context.yi] && group === year.groups[context.gi])
    group.events.splice(context.ei + 1, 0, entry);
  else group.events.push(entry);
  // Clean only containers emptied by this edit; unrelated empty groups remain intact.
  if (sourceGroup && sourceGroup !== group && !sourceGroup.events.length)
    sourceYear.groups.splice(sourceYear.groups.indexOf(sourceGroup), 1);
  if (sourceYear && sourceYear !== year && !sourceYear.groups.length)
    sourceAge.years.splice(sourceAge.years.indexOf(sourceYear), 1);
  return next;
}
function deleteAge(ages, ai) {
  if (!Number.isInteger(ai) || !ages[ai]) throw new Error('The Age is no longer available.');
  const next=ages.filter((_, i) => i !== ai);
  return ages[ai].starting&&next.length?setStartingAge(next,0):next;
}
function deleteEvent(ages, {ai, yi, gi, ei}) {
  const next = JSON.parse(JSON.stringify(ages));
  const age = next[ai], year = age?.years[yi], group = year?.groups[gi];
  if (!Number.isInteger(ei) || ei < 0 || !group?.events[ei]) throw new Error('The Event is no longer available.');
  group.events.splice(ei, 1);
  if (!group.events.length) year.groups.splice(gi, 1);
  if (!year.groups.length) age.years.splice(yi, 1);
  return next;
}
function blocks(text) {
  const lines = text.split('\n'); const result = []; let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    // Skip other fenced blocks as a whole, including examples containing Aion.
    const open = /^( {0,3})(`{3,}|~{3,})([^\r]*)\r?$/.exec(lines[i]);
    if (!open) { offset += lines[i].length + 1; continue; }
    const fullStart=offset, start = offset + lines[i].length + 1, lineStart = i;
    offset = start; let closed = false;
    for (i++; i < lines.length; i++) {
      const end = new RegExp('^ {0,3}' + open[2][0] + '{' + open[2].length + ',}\\s*$');
      if (end.test(lines[i])) {
        const fullEnd=Math.min(text.length,offset+lines[i].length+1);
        if(open[3].trim()==='aion-timeline')result.push({start, end: offset, fullStart, fullEnd, lineStart, lineEnd: i, source: text.slice(start, offset).replace(/\r\n/g, '\n').replace(/\n$/, '')});
        offset=fullEnd;closed=true;break;
      }
      offset += lines[i].length + 1;
    }
    if (!closed) break;
  }
  return result;
}
function linkInfo(source){
  const matches=[...source.matchAll(/^<!-- aion: ([\w-]+)\/([\w-]+) -->\s*$/gm)];
  if(matches.length>1)throw new Error('A timeline block has more than one linking comment. Keep only one.');
  return matches.length?{id:matches[0][1],part:matches[0][2]}:null;
}
function linkedChronicle(content,id){
  const members=blocks(content).filter(b=>linkInfo(b.source)?.id===id);
  if(!members.length)throw new Error('The linked Chronicle is no longer in this note. Reopen the note.');
  const parts=members.map(b=>linkInfo(b.source).part);
  if(parts.filter(part=>part==='starting').length>1)throw new Error('Only one Starting Age block is allowed in a Chronicle.');
  if(new Set(parts).size!==parts.length)throw new Error('Linked blocks have duplicate part identifiers. Use a different part for each block.');
  const chunks=members.map(b=>parse(b.source));
  if(chunks.some((ages,index)=>parts[index]==='starting'&&ages.length!==1))throw new Error('A Starting Age block must contain exactly one Age.');
  const ages=chunks.flat();
  assertUniqueAgeTitles(ages);
  assertSingleStartingAge(ages);
  return {members,ages,source:serialize(ages),snapshot:JSON.stringify(members.map((b,i)=>[parts[i],blockKey(b.source)]))};
}
function linkedLayout(state,part){
  let from=0;
  for(let i=0;i<state.members.length;i++){
    const member=state.members[i],count=parse(member.source).length;
    if(linkInfo(member.source).part===part)return {from,count,first:i===0,last:i===state.members.length-1,slot:i};
    from+=count;
  }
  return null;
}
function matchingEventCount(ages,query=''){
  const q=query.toLocaleLowerCase().trim();let count=0;
  for(const age of ages){
    const ageMatch=age.title.toLocaleLowerCase().includes(q)||(age.description||'').toLocaleLowerCase().includes(q);
    for(const year of age.years)for(const group of year.groups){
      const contextMatch=ageMatch||year.label.toLocaleLowerCase().includes(q)||group.title.toLocaleLowerCase().includes(q);
      count+=group.events.filter(event=>contextMatch||event.text.toLocaleLowerCase().includes(q)).length;
    }
  }
  return count;
}
function ageBlock(age,id,part,newline='\n'){
  const body=age?serialize([age]).replace(/^<!-- starting: true -->\n/gm,''):'';
  if(age?.starting)part='starting';
  if(/^ {0,3}(?:`{3,}|~{3,})/m.test(body))throw new Error('Fenced code inside Events is not supported.');
  return ('```aion-timeline\n<!-- aion: '+id+'/'+part+' -->\n'+body+'```\n').replace(/\n/g,newline);
}
function applyBlockChanges(content,changes){
  const finalNewline=content.endsWith('\n');
  for(const {block,replacement} of [...changes].sort((a,b)=>b.block.fullStart-a.block.fullStart))
    content=content.slice(0,block.fullStart)+replacement+content.slice(block.fullEnd);
  return finalNewline?content:content.replace(/(?:\r?\n)+$/,'');
}
function writeLinkedChronicle(content,id,snapshot,ages){
  ages=orderStartingAge(ages);
  assertUniqueAgeTitles(ages);
  const state=linkedChronicle(content,id);
  if(state.snapshot!==snapshot)throw new Error('The linked timeline changed. Close the dialog and reopen the note before editing.');
  const newline=content.includes('\r\n')?'\r\n':'\n';
  const parts=state.members.map(b=>linkInfo(b.source).part),used=new Set(parts);let serial=1;
  while(parts.length<Math.max(ages.length,1)){
    let part;do{part='age-'+serial++;}while(used.has(part));used.add(part);parts.push(part);
  }
  for(let i=0;i<parts.length;i++)if(parts[i]==='starting'&&!ages[i]?.starting){
    let part;do{part='age-'+serial++;}while(used.has(part));parts[i]=part;used.add(part);
  }
  const payloads=(ages.length?ages:[null]).map((age,i)=>ageBlock(age,id,parts[i],newline));
  return applyBlockChanges(content,state.members.map((block,i)=>{
    let replacement=i===state.members.length-1?payloads.slice(i).join(newline):(payloads[i]||'');
    if(replacement&&!content.slice(block.fullStart,block.fullEnd).endsWith('\n'))replacement=replacement.slice(0,-newline.length);
    return {block,replacement};
  }));
}
function linkAndSplit(content,requestedId='chronicle'){
  if(!/^[\w-]+$/.test(requestedId))throw new Error('Use letters, numbers, underscores or hyphens for a Chronicle identifier.');
  const found=blocks(content);if(!found.length)throw new Error('This note has no aion-timeline blocks.');
  const used=new Set(),ids=new Set();
  for(const b of found){const info=linkInfo(b.source);if(info){
    const key=info.id+'/'+info.part;if(used.has(key))throw new Error('Linked blocks have duplicate part identifiers.');
    used.add(key);ids.add(info.id);
  }}
  let id=requestedId,suffix=2;while(ids.has(id))id=requestedId+'-'+suffix++;
  const newline=content.includes('\r\n')?'\r\n':'\n';let serial=1;
  const grouped=new Map();
  const updated=applyBlockChanges(content,found.map(block=>{
    const info=linkInfo(block.source),group=info?.id||id,ages=parse(block.source);let first=true;
    const all=grouped.get(group)||[];all.push(...ages);grouped.set(group,all);
    let replacement=(ages.length?ages:[null]).map(age=>{
      let part=first&&info?info.part:null;first=false;
      if(!part){do{part='age-'+serial++;}while(used.has(group+'/'+part));used.add(group+'/'+part);}
      return ageBlock(age,group,part,newline);
    }).join(newline);
    if(!content.slice(block.fullStart,block.fullEnd).endsWith('\n'))replacement=replacement.slice(0,-newline.length);
    return {block,replacement};
  }));
  for(const ages of grouped.values()){assertUniqueAgeTitles(ages);assertSingleStartingAge(ages);}
  return updated;
}
function splitAddedAge(content,source,sectionLine,ages){
  ages=orderStartingAge(ages);
  assertUniqueAgeTitles(ages);
  const target=locateBlock(content,source,sectionLine);
  if(linkInfo(target.source))throw new Error('This block is already linked. Reopen the note before adding an Age.');
  const used=new Set(blocks(content).map(block=>linkInfo(block.source)?.id));
  let id='chronicle',suffix=2;while(used.has(id))id='chronicle-'+suffix++;
  const newline=content.includes('\r\n')?'\r\n':'\n';
  let replacement=ages.map((age,i)=>ageBlock(age,id,'age-'+(i+1),newline)).join(newline);
  if(!content.slice(target.fullStart,target.fullEnd).endsWith('\n'))replacement=replacement.slice(0,-newline.length);
  const updated=applyBlockChanges(content,[{block:target,replacement}]);
  return {content:updated,id,part:ages[0]?.starting?'starting':'age-1',state:linkedChronicle(updated,id)};
}
function prepareTemplate(template,existing='',prefix='chronicle'){
  let found=blocks(template);
  if(!found.length)throw new Error('Template.md must contain at least one aion-timeline block.');
  if(found.some(block=>!linkInfo(block.source)||parse(block.source).length>1)){
    template=linkAndSplit(template);found=blocks(template);
  }
  const ids=new Set(found.map(block=>linkInfo(block.source).id));
  for(const id of ids)linkedChronicle(template,id);
  const used=new Set(blocks(existing).map(block=>linkInfo(block.source)?.id));
  const replacements=new Map();let suffix=1;
  for(const id of ids){
    let fresh;do{fresh=prefix+(suffix===1?'':'-'+suffix);suffix++;}while(used.has(fresh)||ids.has(fresh));
    replacements.set(id,fresh);used.add(fresh);
  }
  for(const block of [...found].reverse()){
    const info=linkInfo(block.source),body=template.slice(block.start,block.end);
    const updated=body.replace(/^<!-- aion: [\w-]+\/[\w-]+ -->/m,'<!-- aion: '+replacements.get(info.id)+'/'+info.part+' -->');
    template=template.slice(0,block.start)+updated+template.slice(block.end);
  }
  return template;
}
function blockKey(source) {
  // Rendering can add/remove terminal newlines. Blank lines between headings
  // also have no meaning in our authoring format. Keep actual model data exact.
  return serialize(parse(source.replace(/\r\n?/g, '\n')));
}
function locateBlock(content, source, sectionLine) {
  const key = blockKey(source);
  const candidates = blocks(content);
  const matches = candidates.filter(b => {
    try { return blockKey(b.source) === key; } catch { return false; }
  });
  if (Number.isInteger(sectionLine)) {
    const atLine = candidates.find(b => b.lineStart <= sectionLine && sectionLine <= b.lineEnd);
    if (atLine) {
      if (matches.includes(atLine)) return atLine;
      throw new Error('This timeline was changed in the note. Close the dialog and reopen the note before editing.');
    }
  }
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error('The timeline source no longer matches the note. Close the dialog and reopen the note before editing.');
  throw new Error('Several identical timeline blocks were found. Reopen this note in Reading view to identify the block before editing.');
}
module.exports = { parse, serialize, ordered, blocks, moveAge, saveEvent, deleteAge, deleteEvent, locateBlock, linkInfo, linkedChronicle, linkedLayout, matchingEventCount, writeLinkedChronicle, linkAndSplit, splitAddedAge, assertUniqueAgeTitles, prepareTemplate, setStartingAge, orderStartingAge };
