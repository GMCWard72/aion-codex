const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse,serialize,moveAge,saveEvent,deleteEvent,locateBlock}=require('./model');
const source='# Titans\n<!-- colour: #b56b42 -->\n\nAn age of **primordial conflict**.\nThe titans shaped [[The World]].\n\nA second paragraph with more context.\n- An overview list item.\n\n## Named Year\n### Circa\n- Event.\n\n---\n\n# Empty Age\n\nAn overview without events.\n';
test('Age descriptions retain paragraphs, lists, emphasis and links on round trip',()=>{
 const ages=parse(source);
 assert.equal(ages[0].description,'An age of **primordial conflict**.\nThe titans shaped [[The World]].\n\nA second paragraph with more context.\n- An overview list item.');
 assert.equal(ages[1].description,'An overview without events.');
 assert.deepEqual(parse(serialize(ages)),ages);
});
test('descriptions stay with their Ages through event editing, deletion and Age dragging',()=>{
 const ages=parse(source);
 const edited=saveEvent(ages,{ai:0,yi:0,gi:0,ei:0,event:{text:'Event.'}},{ai:0,yearLabel:'Later',date:'Spring',text:'Updated.'});
 assert.equal(edited[0].description,ages[0].description);
 const deleted=deleteEvent(edited,{ai:0,yi:0,gi:0,ei:0});
 assert.equal(deleted[0].description,ages[0].description);assert.deepEqual(deleted[0].years,[]);
 const moved=moveAge(edited,0,2);assert.equal(moved[1].description,ages[0].description);
 assert.deepEqual(parse(serialize(moved)),moved);
});
test('save matching detects actual description changes',()=>{
 const note='```aion-timeline\n'+source+'```\n';
 assert.equal(locateBlock(note,serialize(parse(source))).lineStart,0);
 assert.throws(()=>locateBlock(note,source.replace('primordial conflict','peace')),/no longer matches/);
});
