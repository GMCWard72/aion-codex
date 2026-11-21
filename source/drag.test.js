const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse,serialize}=require('./model');
const {moveTimelineItem,moveAgeBoundary}=require('./drag');
const source='# Dawn\n<!-- colour: #112233 -->\n\nThe first Age.\n\n## Named Year\n### Spring\n- A.\n### Summer\n- B.\n\n---\n\n# Titans\n<!-- colour: #445566 -->\n\nThe second Age.\n\n## Named Year\n### Summer\n- C.\n### Winter\n- D.\n\n---\n\n# Future\n## Unknown\n### Prophecy\n- E.\n';
const events=ages=>ages.flatMap(a=>a.years.flatMap(y=>y.groups.flatMap(g=>g.events.map(e=>[y.label,g.title,e.text]))));
test('moving an Age boundary splits a year and leaves event order intact',()=>{
 const ages=parse(source),next=moveAgeBoundary(ages,1,{kind:'group',ai:0,yi:0,gi:1,edge:'before'});
 assert.deepEqual(events(next),events(ages));
 assert.equal(next[0].years[0].groups.length,1);assert.equal(next[1].years[0].label,'Named Year');
 assert.deepEqual(next[1].years[0].groups.map(g=>g.title),['Summer','Winter']);
 assert.deepEqual(next[1].years[0].groups[0].events.map(e=>e.text),['B.','C.']);
 assert.equal(next[1].description,'The second Age.');assert.equal(next[1].colour,'#445566');
 assert.deepEqual(parse(serialize(next)),next);assert.equal(ages[0].years[0].groups.length,2);
});
test('moving a boundary later merges old events into the preceding Age and takes the new tail',()=>{
 const ages=parse(source),next=moveAgeBoundary(ages,1,{kind:'group',ai:2,yi:0,gi:0,edge:'before'});
 assert.deepEqual(events(next),events(ages));assert.deepEqual(next.map(a=>a.title),['Dawn','Future','Titans']);
 assert.deepEqual(next[0].years[0].groups.flatMap(g=>g.events.map(e=>e.text)),['A.','B.','C.','D.']);
 assert.deepEqual(next[1].years,[]);assert.equal(next[2].years[0].groups[0].events[0].text,'E.');
});
test('first Age boundary cannot orphan events, but Ctrl moves the whole Age safely',()=>{
 const ages=parse(source);
 assert.throws(()=>moveAgeBoundary(ages,0,{kind:'end'}),/without an Age/);
 const next=moveTimelineItem(ages,{kind:'age',ai:0,wholeAge:true},{kind:'end'});
 assert.deepEqual(next.map(a=>a.title),['Titans','Future','Dawn']);assert.deepEqual(next[2],ages[0]);
 assert.throws(()=>moveTimelineItem(ages,{kind:'age',ai:0,wholeAge:true},{kind:'group',ai:1,yi:0,gi:0}),/between Age sections/);
});
test('moving to the current boundary is a no-op and moving an empty Age preserves metadata',()=>{
 const ages=parse(source);assert.deepEqual(moveAgeBoundary(ages,1,{kind:'ageHeader',ai:1,edge:'before'}),ages);
 const empty=parse('# Empty\n\nOverview.\n\n---\n\n# Populated\n## Time\n### Date\n- Event.');
 const next=moveAgeBoundary(empty,0,{kind:'end'});assert.deepEqual(next.map(a=>a.title),['Populated','Empty']);assert.equal(next[1].description,'Overview.');
});
test('event insertion positions support the top, middle and bottom of a date group',()=>{
 const ages=parse('# Age\n## Year\n### Date\n- A.\n- B.\n- C.');
 const drag={kind:'event',ai:0,yi:0,gi:0,ei:0};
 assert.deepEqual(events(moveTimelineItem(ages,drag,{ai:0,yi:0,gi:0,ei:3})).map(e=>e[2]),['B.','C.','A.']);
 assert.deepEqual(events(moveTimelineItem(ages,{...drag,ei:2},{ai:0,yi:0,gi:0,ei:0})).map(e=>e[2]),['C.','A.','B.']);
 assert.deepEqual(moveTimelineItem(ages,drag,{ai:0,yi:0,gi:0,ei:1}),ages);
});
test('events can enter empty panels, while emptied source dates/years are cleaned up',()=>{
 const ages=parse('# One\n## Year\n### Date\n- Only.\n\n---\n\n# Two\n## Named Year');
 const next=moveTimelineItem(ages,{kind:'event',ai:0,yi:0,gi:0,ei:0},{ai:1,yi:0});
 assert.deepEqual(next[0].years,[]);assert.equal(next[1].years[0].groups[0].title,'Date');
 assert.equal(next[1].years[0].groups[0].events[0].text,'Only.');assert.deepEqual(parse(serialize(next)),next);
});
test('year and date moves retain content and handle downward insertion offsets',()=>{
 const ages=parse(source);
 const moved=moveTimelineItem(ages,{kind:'group',ai:0,yi:0,gi:0},{ai:0,yi:0,gi:2});
 assert.deepEqual(moved[0].years[0].groups.map(g=>g.title),['Summer','Spring']);
 const year=moveTimelineItem(ages,{kind:'year',ai:0,yi:0},{ai:2,yi:0});
 assert.deepEqual(year[0].years,[]);assert.deepEqual(year[2].years[0],ages[0].years[0]);
 assert.deepEqual(events(year).map(e=>e[2]).sort(),events(ages).map(e=>e[2]).sort());
});
test('all valid Age boundary destinations preserve every event and date label in source order',()=>{
 const ages=parse(source);
 const targets=[{kind:'end'}];
 ages.forEach((a,ai)=>{
  for(const edge of ['before','after']){
   targets.push({kind:'age',ai,edge},{kind:'ageHeader',ai,edge});
   a.years.forEach((y,yi)=>{targets.push({kind:'year',ai,yi,edge});y.groups.forEach((g,gi)=>targets.push({kind:'group',ai,yi,gi,edge}));});
  }
 });
 for(let from=1;from<ages.length;from++)for(const target of targets){
  const next=moveAgeBoundary(ages,from,target);assert.deepEqual(events(next),events(ages));
  assert.deepEqual(next.map(a=>a.title).sort(),ages.map(a=>a.title).sort());
  assert.deepEqual(parse(serialize(next)),next);
 }
});
test('an unchanged boundary does not merge intentionally separate repeated year labels',()=>{
 const ages=parse('# First\n## Same\n### Circa\n- One.\n## Same\n### Circa\n- Two.\n\n---\n\n# Second\n## Later\n### Date\n- Three.');
 assert.deepEqual(moveAgeBoundary(ages,1,{kind:'ageHeader',ai:1,edge:'before'}),ages);
});

test('nearest insertion edges distinguish before, between and after rows',()=>{
 const {nearestEdge}=require('./drag');
 const items=[{entry:'A',rect:{top:100,bottom:120}},{entry:'B',rect:{top:130,bottom:150}}];
 assert.deepEqual(nearestEdge(items,90),{...items[0],edge:'before'});
 assert.deepEqual(nearestEdge(items,126),{...items[1],edge:'before'});
 assert.deepEqual(nearestEdge(items,170),{...items[1],edge:'after'});
 assert.equal(nearestEdge([],100),null);
});

test('Age boundary moves round trip through linked blocks without sorting custom Dates',()=>{
 const {linkAndSplit,linkedChronicle,writeLinkedChronicle}=require('./model');
 const note=linkAndSplit('Before\n```aion-timeline\n'+source+'```\nAfter');const state=linkedChronicle(note,'chronicle');
 const next=moveAgeBoundary(state.ages,1,{kind:'group',ai:0,yi:0,gi:1,edge:'before'});
 const updated=writeLinkedChronicle(note,'chronicle',state.snapshot,next);
 assert.deepEqual(linkedChronicle(updated,'chronicle').ages,next);assert.deepEqual(events(next),events(state.ages));
 assert.ok(updated.startsWith('Before\n'));assert.ok(updated.endsWith('After'));
});

test('matching Years merge Dates and matching Dates merge Events at the chosen insertion side',()=>{
 const ages=parse('# One\n## Year of the Owl\n### Rainwake\n- Incoming\n### Emberwane\n- Later\n\n---\n\n# Two\n## Year of the Owl\n### Rainwake\n- Existing\n### Frostmoot\n- Last');
 const before=moveTimelineItem(ages,{kind:'year',ai:0,yi:0},{ai:1,yi:0});
 assert.equal(before[1].years.length,1);assert.deepEqual(before[1].years[0].groups.map(group=>group.title),['Rainwake','Emberwane','Frostmoot']);
 assert.deepEqual(before[1].years[0].groups[0].events.map(event=>event.text),['Incoming','Existing']);
 const after=moveTimelineItem(ages,{kind:'year',ai:0,yi:0},{ai:1,yi:1});
 assert.deepEqual(after[1].years[0].groups[0].events.map(event=>event.text),['Existing','Incoming']);
 assert.deepEqual(after[1].years[0].groups.map(group=>group.title),['Rainwake','Frostmoot','Emberwane']);
 assert.deepEqual(after[0].years,[]);assert.equal(ages[0].years.length,1);
});

test('matching Dates combine all Events without removing repeated Event text',()=>{
 const ages=parse('# One\n## First\n### Same Date\n- Repeated\n- Incoming\n\n---\n\n# Two\n## Other\n### Same Date\n- Repeated');
 const after=moveTimelineItem(ages,{kind:'group',ai:0,yi:0,gi:0},{ai:1,yi:0,gi:1});
 assert.equal(after[1].years[0].groups.length,1);assert.deepEqual(after[1].years[0].groups[0].events.map(event=>event.text),['Repeated','Repeated','Incoming']);
 assert.deepEqual(after[0].years,[]);
});

test('matching Years merge even when another Year separates them in the destination Age',()=>{
 const ages=parse('# One\n## Named\n### Zyth\n- Incoming\n\n---\n\n# Two\n## Named\n### Aster\n- Existing\n## Elsewhere\n### Moonfall\n- Unrelated');
 const next=moveTimelineItem(ages,{kind:'year',ai:0,yi:0},{ai:1,yi:2});
 assert.deepEqual(next[1].years.map(year=>year.label),['Named','Elsewhere']);
 assert.deepEqual(next[1].years[0].groups.map(group=>group.title),['Aster','Zyth']);
 assert.equal(next[1].years[1].groups[0].events[0].text,'Unrelated');
});
