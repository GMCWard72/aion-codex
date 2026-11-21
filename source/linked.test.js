const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse,serialize,blocks,linkInfo,linkedChronicle,writeLinkedChronicle,linkAndSplit,moveAge,saveEvent,deleteAge}=require('./model');
const one='# First\n<!-- colour: #af0000 -->\n\nOverview with *italics*.\n\n## Year Name\n### Circa\n- [[Link|Event]]\n  Continued text.\n';
const two='# Second\n## Future\n### Soon\n- Another event\n';
const fence=body=>'```aion-timeline\n'+body+'```\n';
const original='Before\n'+fence(one+'\n---\n\n'+two)+'Between\n'+fence('# Empty\n')+'After';
test('conversion splits every Age, links existing split blocks, preserves note text and is idempotent',()=>{
 const converted=linkAndSplit(original);
 const found=blocks(converted);assert.equal(found.length,3);
 assert.ok(found.every(b=>parse(b.source).length===1));
 assert.equal(new Set(found.map(b=>linkInfo(b.source).part)).size,3);
 assert.deepEqual(linkedChronicle(converted,'chronicle').ages,blocks(original).flatMap(b=>parse(b.source)));
 assert.ok(converted.startsWith('Before\n'));assert.ok(converted.includes('Between\n'));assert.ok(converted.endsWith('After'));
 assert.equal(linkAndSplit(converted),converted);
});
test('linked writes support editing, adding, deleting, cross-Age event moves and Age reordering',()=>{
 let content=linkAndSplit(original),state=linkedChronicle(content,'chronicle');
 const originalEvent=state.ages[0].years[0].groups[0].events[0];
 let next=saveEvent(state.ages,{ai:0,yi:0,gi:0,ei:0,event:originalEvent},{ai:1,yearLabel:'Future',date:'Soon',text:originalEvent.text});
 content=writeLinkedChronicle(content,'chronicle',state.snapshot,next);state=linkedChronicle(content,'chronicle');
 assert.equal(state.ages[0].years.length,0);assert.equal(state.ages[1].years[0].groups[0].events.length,2);
 next=moveAge(state.ages,2,0);next.push({title:'New Age',position:'normal',colour:'#123456',years:[]});
 content=writeLinkedChronicle(content,'chronicle',state.snapshot,next);state=linkedChronicle(content,'chronicle');
 assert.deepEqual(state.ages.map(a=>a.title),['Empty','First','Second','New Age']);assert.equal(blocks(content).length,4);
 content=writeLinkedChronicle(content,'chronicle',state.snapshot,deleteAge(state.ages,1));state=linkedChronicle(content,'chronicle');
 assert.deepEqual(state.ages.map(a=>a.title),['Empty','Second','New Age']);assert.equal(blocks(content).length,3);
 assert.ok(blocks(content).every(b=>parse(b.source).length===1));assert.ok(content.includes('Between\n'));assert.ok(content.endsWith('After'));
});
test('stale edits, duplicate identifiers and malformed content fail without generating a replacement',()=>{
 const content=linkAndSplit(original),state=linkedChronicle(content,'chronicle');
 assert.throws(()=>writeLinkedChronicle(content.replace('Another event','Manual edit'),'chronicle',state.snapshot,state.ages),/changed/);
 const first=blocks(content)[0];assert.throws(()=>linkedChronicle(content+'\n'+content.slice(first.fullStart,first.fullEnd),'chronicle'),/duplicate/);
 assert.throws(()=>linkAndSplit(fence('# Age\n## Year\nUnexpected content\n')),/Unrecognised/);
 assert.throws(()=>linkAndSplit(original,'bad id'),/identifier/);
});
test('independent chronicles and unrelated fenced examples remain separate',()=>{
 const a=linkAndSplit(fence(one),'first'),b=linkAndSplit(fence(two),'second');
 const sample='````markdown\n'+fence('# Example\n')+'````\n';
 const note=a+'Between\n'+b+sample+fence('# Unlinked\n');
 assert.equal(blocks(note).length,3);
 const converted=linkAndSplit(note,'first');
 assert.deepEqual(blocks(converted).map(b=>linkInfo(b.source).id),['first','second','first-2']);
 const state=linkedChronicle(converted,'first');const result=writeLinkedChronicle(converted,'first',state.snapshot,[]);
 assert.equal(linkedChronicle(result,'first').ages.length,0);assert.ok(result.includes(b));assert.ok(result.includes(sample));
 const empty=linkedChronicle(result,'first');assert.equal(empty.members.length,1);
 assert.equal(linkedChronicle(writeLinkedChronicle(result,'first',empty.snapshot,parse(one)),'first').ages[0].title,'First');
});
test('CRLF, tilde fences and a closing fence without final newline remain safe',()=>{
 const source=('Top\n~~~aion-timeline\n'+one+'\n---\n\n'+two+'~~~').replace(/\n/g,'\r\n');
 const converted=linkAndSplit(source);assert.equal(/(?<!\r)\n/.test(converted),false);assert.equal(converted.endsWith('\n'),false);
 const state=linkedChronicle(converted,'chronicle');const result=writeLinkedChronicle(converted,'chronicle',state.snapshot,[state.ages[1]]);
 assert.equal(/(?<!\r)\n/.test(result),false);assert.equal(result.endsWith('\n'),false);assert.equal(linkedChronicle(result,'chronicle').ages[0].title,'Second');
});
test('617 events remain byte-for-byte equivalent in the parsed model after splitting and saving',()=>{
 const ages=Array.from({length:4},(_,i)=>({title:'Age '+i,position:'normal',colour:'',years:[{label:'Year '+i,image:'',groups:[{title:'Circa',events:Array.from({length:i===3?155:154},(_,j)=>({text:'Event '+i+'/'+j+' with **bold** and [[Link]]'}))}]}]}));
 const note=linkAndSplit(fence(serialize(ages)));const state=linkedChronicle(note,'chronicle');assert.deepEqual(state.ages,ages);
 assert.equal(state.members.length,4);assert.deepEqual(linkedChronicle(writeLinkedChronicle(note,'chronicle',state.snapshot,ages),'chronicle').ages,ages);
});

test('standalone Add Age avoids existing chronicle identifiers and preserves line endings and stale-edit checks',()=>{
 const {splitAddedAge}=require('./model');
 const existing=linkAndSplit(fence(two),'chronicle');
 const standalone=fence(one).replace(/\n/g,'\r\n');
 const content=existing.replace(/\n/g,'\r\n')+'Between\r\n'+standalone+'After';
 const next=[...parse(one),{title:'Added',position:'normal',colour:'',years:[]}];
 const result=splitAddedAge(content,one,blocks(content)[1].lineStart,next);
 assert.equal(result.id,'chronicle-2');assert.deepEqual(result.state.ages,next);
 assert.equal(/(?<!\r)\n/.test(result.content),false);
 assert.ok(result.content.startsWith(existing.replace(/\n/g,'\r\n')+'Between\r\n'));
 assert.ok(result.content.endsWith('After'));
 assert.throws(()=>splitAddedAge(content.replace('Continued text.','Manual edit.'),one,blocks(content)[1].lineStart,next),/changed/);
});

test('Age titles are unique within a chronicle, ignoring case and incidental whitespace',()=>{
 const {assertUniqueAgeTitles}=require('./model');
 assert.throws(()=>assertUniqueAgeTitles([{title:'Dawn'},{title:' dawn '}]),/Age titles must be unique/);
 assert.throws(()=>parse('# Dawn\n\n---\n\n# DAWN'),/Age titles must be unique/);
 const a='```aion-timeline\n<!-- aion: main/one -->\n# Dawn\n```\n';
 const b='```aion-timeline\n<!-- aion: main/two -->\n# dawn\n```\n';
 assert.throws(()=>linkedChronicle(a+b,'main'),/Age titles must be unique/);
 assert.throws(()=>linkAndSplit('```aion-timeline\n# Dawn\n```\n```aion-timeline\n# dawn\n```\n'),/Age titles must be unique/);
 assert.doesNotThrow(()=>linkedChronicle(a+b.replace('main/two','other/two'),'main'));
});
