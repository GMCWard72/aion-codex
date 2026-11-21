const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {prepareTemplate,blocks,linkInfo,linkedChronicle,parse}=require('./model');
test('bundled template retains all user content, colours and notes while replacing linking identifiers',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','Template.md'),'utf8');
 const output=prepareTemplate(source,'','fresh');
 assert.equal(blocks(output).length,11);assert.deepEqual(linkedChronicle(output,'fresh').ages,linkedChronicle(source,'chronicle').ages);
 assert.equal(output.replace(/aion: fresh\//g,'aion: chronicle/'),source);
 assert.equal(parse(blocks(output)[6].source)[0].colour,'#008000');
 assert.equal(parse(blocks(output)[10].source)[0].title,'Ragnarök');
});
test('template insertion preserves separate chronicles and avoids existing identifiers on repeated insertion',()=>{
 const template='Before\n```aion-timeline\n<!-- aion: first/one -->\n# Dawn\n```\nBetween\n```aion-timeline\n<!-- aion: second/one -->\n# Dawn\n```\nAfter';
 const existing='```aion-timeline\n<!-- aion: fresh/one -->\n# Existing\n```\n';
 const output=prepareTemplate(template,existing,'fresh');const ids=blocks(output).map(b=>linkInfo(b.source).id);
 assert.deepEqual(ids,['fresh-2','fresh-3']);assert.ok(output.startsWith('Before\n'));assert.ok(output.includes('Between\n'));assert.ok(output.endsWith('After'));
 assert.notEqual(linkInfo(blocks(prepareTemplate(template,existing+output,'fresh'))[0].source).id,ids[0]);
});
test('templates with standalone Ages become split linked blocks; malformed or missing structures are refused',()=>{
 const converted=prepareTemplate('Heading\n```aion-timeline\n# First\n\n---\n\n# Second\n```\n');
 assert.equal(blocks(converted).length,2);assert.ok(blocks(converted).every(b=>parse(b.source).length===1));
 assert.throws(()=>prepareTemplate('Plain text'),/must contain/);
 assert.throws(()=>prepareTemplate('```aion-timeline\n# Age\n## Year\nMalformed\n```\n'),/Unrecognised/);
});
