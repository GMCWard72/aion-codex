const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, serialize, saveEvent } = require('./model');
const ctx = { ai: 0, yi: 0, gi: 0, ei: 0, event: { text: 'Old event.' } };
const base = { ai: 0, ageTitle: 'Age', colour: '#abcdef', yearLabel: '100 CE', date: 'Circa', text: 'Updated event.' };
const source = '# Age\n## 100 CE\n### Circa\n- Old event.\n';
function events(ages) { return ages.flatMap(a=>a.years.flatMap(y=>y.groups.flatMap(g=>g.events.map(e=>e.text)))); }
test('editing text replaces the event at its existing position', () => {
 const ages=parse(source+'- Second event.\n');
 const next=saveEvent(ages,ctx,base);
 assert.deepEqual(events(next),['Updated event.','Second event.']);
 assert.deepEqual(events(ages),['Old event.','Second event.']);
 assert.deepEqual(parse(serialize(next)),next);
});
test('renaming a sole event year and date updates the panel in place without empty headings', () => {
 const ages=parse(source+'\n## Later\n### Winter\n- Later event.\n');
 const next=saveEvent(ages,ctx,{...base,yearLabel:'101 CE',date:'Spring'});
 assert.deepEqual(next[0].years.map(y=>y.label),['101 CE','Later']);
 assert.deepEqual(next[0].years[0].groups.map(g=>g.title),['Spring']);
 assert.deepEqual(events(next),['Updated event.','Later event.']);
});
test('moving the sole event to an existing year removes its empty old year', () => {
 const next=saveEvent(parse(source+'\n## 101 CE\n### Spring\n- Existing event.\n'),ctx,{...base,yearLabel:'101 CE',date:'Spring'});
 assert.equal(next[0].years.length,1);
 assert.equal(next[0].years[0].groups.length,1);
 assert.deepEqual(events(next),['Existing event.','Updated event.']);
});
test('moving between dates removes only the emptied source group and keeps sibling events', () => {
 const next=saveEvent(parse(source+'### Spring\n- Existing event.\n'),ctx,{...base,date:'Spring'});
 assert.equal(next[0].years.length,1);
 assert.deepEqual(next[0].years[0].groups.map(g=>g.title),['Spring']);
 assert.deepEqual(events(next),['Existing event.','Updated event.']);
 const shared=saveEvent(parse(source+'- Keep me.\n'),ctx,{...base,yearLabel:'New year'});
 assert.equal(shared[0].years.length,2);assert.deepEqual(events(shared),['Keep me.','Updated event.']);
});
test('moving across Ages keeps Age metadata and clears the old empty panel', () => {
 const next=saveEvent(parse(source+'\n---\n\n# Destination\n<!-- colour: #112233 -->\n'),ctx,{...base,ai:1,ageTitle:'Destination',colour:'#112233'});
 assert.equal(next[0].years.length,0);assert.equal(next.length,2);
 assert.equal(next[1].colour,'#112233');assert.deepEqual(events(next),['Updated event.']);
});
test('adding an event still appends normally and Use Default persists no override', () => {
 const next=saveEvent(parse(source),{},{...base,colour:''});
 assert.deepEqual(events(next),['Old event.','Updated event.']);
 assert.equal(next[0].colour,'');assert.ok(!serialize(next).includes('<!-- colour:'));
});
test('duplicate year and date labels do not move an unchanged event into a different group', () => {
 const ages=parse(source+'## 100 CE\n### Circa\n- Target.\n');
 const next=saveEvent(ages,{...ctx,yi:1},base);
 assert.deepEqual(events(next),['Old event.','Updated event.']);
 assert.equal(next[0].years.length,2);
});
test('Add Event beside an event inserts immediately after it under the same year and date',()=>{
 const ages=parse(source+'- Next event.\n');
 const next=saveEvent(ages,{ai:0,yi:0,gi:0,ei:0,insertAfter:true},base);
 assert.equal(next[0].years.length,1);assert.equal(next[0].years[0].groups.length,1);
 assert.deepEqual(events(next),['Old event.','Updated event.','Next event.']);
 assert.deepEqual(parse(serialize(next)),next);
 const moved=saveEvent(ages,{ai:0,yi:0,gi:0,ei:0,insertAfter:true},{...base,yearLabel:'Different Year'});
 assert.deepEqual(moved[0].years[0].groups[0].events.map(e=>e.text),['Old event.','Next event.']);
 assert.deepEqual(moved[0].years[1].groups[0].events,[{text:'Updated event.'}]);
});
