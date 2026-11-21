const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parse, serialize, ordered, blocks, moveAge} = require('./model');
test('named years, arbitrary labels, formatting and multiline events round trip',()=>{
  const source='# Dawn\n<!-- position: start -->\n## Before memory\n<!-- image: Assets/dawn.png -->\n### Circa\n- A **light** and [[a link]].\n  A continuation.\n\n---\n\n# Kings\n## Year of the Star\n### Spring\n- A coronation.\n';
  const data=parse(source);assert.deepEqual(parse(serialize(data)),data);
  assert.equal(data[0].years[0].groups[0].events[0].text,'A **light** and [[a link]].\nA continuation.');
});
test('all Ages and years retain source order, including legacy special Ages',()=>{
 const data=parse('# Future\n<!-- position: end -->\n# Middle\n## 1 CE\n## 500 BCE\n# Beginning\n<!-- position: start -->');
 assert.deepEqual(ordered(data).map(a=>a.title),['Future','Middle','Beginning']);assert.deepEqual(data[1].years.map(y=>y.label),['1 CE','500 BCE']);
});
test('unsupported content fails instead of silently disappearing; old position comments remain compatible',()=>{
 assert.throws(()=>parse('# Age\n## Year\nUnstructured content'),/Unrecognised/);
 assert.equal(parse('# One\n<!-- position: start -->\n# Two\n<!-- position: start -->').length,2);
});
test('whole Ages move upward, downward, and to the end without losing their contents',()=>{
 const data=parse('# First\n<!-- position: start -->\n<!-- colour: #b56b42 -->\n## Named Year\n<!-- image: Assets/star.png -->\n### Circa\n- A [[link]].\n\n---\n\n# Second\n\n---\n\n# Third\n<!-- position: end -->');
 assert.deepEqual(moveAge(data,2,0).map(a=>a.title),['Third','First','Second']);
 assert.deepEqual(moveAge(data,0,2).map(a=>a.title),['Second','First','Third']);
 const moved=moveAge(data,0,data.length);
 assert.deepEqual(moved.map(a=>a.title),['Second','Third','First']);
 assert.deepEqual(parse(serialize(moved)),moved);
 assert.deepEqual(moved[2],data[0]);
 assert.deepEqual(moveAge(data,1,1),data);assert.deepEqual(moveAge(data,1,2),data);
 assert.deepEqual(data.map(a=>a.title),['First','Second','Third']);
 assert.throws(()=>moveAge(data,-1,0),/Invalid/);
});
test('Age colours survive editing, reordering and round trips; old blocks use the default',()=>{
 const data=parse('# First\n<!-- colour: #b56b42 -->\n## Named Year\n### Circa\n- Event.\n\n---\n\n# Second\n<!-- colour: #537cb8 -->\n\n---\n\n# Legacy');
 assert.equal(data[2].colour,'');
 data[0].years[0].groups[0].events[0].text='Edited event.';
 const moved=[data[1],data[0],data[2]];
 assert.deepEqual(parse(serialize(moved)),moved);
 assert.equal(parse(serialize(moved))[1].colour,'#b56b42');
 assert.throws(()=>parse('# Age\n<!-- colour: red; arbitrary-css -->'),/Unrecognised/);
});
test('block replacement preserves other blocks and surrounding content, including CRLF',()=>{
 for(const nl of ['\n','\r\n']){
  const text=['Before','```aion-timeline','# First','## Named Year','### Circa','- One','```','Between','~~~~aion-timeline','# Second','~~~~','After'].join(nl);
  const found=blocks(text);assert.equal(found.length,2);assert.equal(found[1].lineStart,8);
  const replaced=text.slice(0,found[0].start)+serialize(parse('# Changed')).replace(/\n/g,nl)+text.slice(found[0].end);
  assert.ok(replaced.startsWith('Before'+nl+'```aion-timeline'+nl+'# Changed'));
  assert.ok(replaced.endsWith(['Between','~~~~aion-timeline','# Second','~~~~','After'].join(nl)));
 }
});
