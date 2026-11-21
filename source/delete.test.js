const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, serialize, deleteAge, deleteEvent, saveEvent } = require('./model');
const source = '# First\n<!-- colour: #123456 -->\n## Year\n### Circa\n- One.\n- Two.\n### Spring\n- Three.\n\n---\n\n# Second\n## Later\n### Winter\n- Four.\n';
test('deleting an Age removes its entire subtree and preserves every other Age',()=>{
 const ages=parse(source), next=deleteAge(ages,0);
 assert.deepEqual(next,[ages[1]]);assert.equal(ages.length,2);
 assert.deepEqual(parse(serialize(next)),next);
 assert.deepEqual(parse(serialize(deleteAge(next,0))),[]);
 assert.throws(()=>deleteAge(ages,-1),/no longer/);
});
test('deleting an event preserves siblings and cleans only containers it empties',()=>{
 const ages=parse(source);
 const next=deleteEvent(ages,{ai:0,yi:0,gi:0,ei:0});
 assert.deepEqual(next[0].years[0].groups[0].events,[{text:'Two.'}]);
 const withoutGroup=deleteEvent(next,{ai:0,yi:0,gi:0,ei:0});
 assert.deepEqual(withoutGroup[0].years[0].groups.map(g=>g.title),['Spring']);
 const withoutYear=deleteEvent(withoutGroup,{ai:0,yi:0,gi:0,ei:0});
 assert.equal(withoutYear[0].years.length,0);assert.equal(withoutYear[0].colour,'#123456');
 assert.deepEqual(withoutYear[1],ages[1]);assert.deepEqual(parse(serialize(withoutYear)),withoutYear);
 assert.equal(ages[0].years[0].groups[0].events.length,2);
 assert.throws(()=>deleteEvent(ages,{ai:0,yi:0,gi:0,ei:-1}),/no longer/);
});
test('the separate Event form preserves source and destination Age metadata',()=>{
 const ages=parse(source);
 const next=saveEvent(ages,{ai:0,yi:0,gi:0,ei:0,event:{text:'One.'}}, {ai:1,yearLabel:'Later',date:'Winter',text:'Moved.'});
 assert.equal(next[0].title,'First');assert.equal(next[0].colour,'#123456');
 assert.equal(next[1].title,'Second');assert.equal(next[1].colour,'');
 assert.deepEqual(next[1].years[0].groups[0].events,[{text:'Four.'},{text:'Moved.'}]);
});
