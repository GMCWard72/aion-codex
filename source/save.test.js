const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parse,serialize,locateBlock} = require('./model');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
test('a new empty Age saves despite rendered newline and heading-spacing differences',()=>{
 const raw='# Existing\n\n## Named Year\n### Circa\n- Event.\n';
 const note='Before\n```aion-timeline\n'+raw+'```\nAfter';
 const rendered='# Existing\n## Named Year\n### Circa\n- Event.\n\n';
 const target=locateBlock(note,rendered,null);
 const next=parse(rendered);next.push({title:'Empty Age',colour:'',position:'normal',years:[]});
 const saved=note.slice(0,target.start)+serialize(next)+note.slice(target.end);
 assert.equal(parse(locateBlock(saved,serialize(next)).source).at(-1).title,'Empty Age');
 assert.deepEqual(parse(locateBlock(saved,serialize(next)).source).at(-1).years,[]);
 assert.ok(saved.startsWith('Before\n'));assert.ok(saved.endsWith('```\nAfter'));
});
test('duplicate blocks require position; changed content is never overwritten',()=>{
 const source='# Age\n## Year\n### Circa\n- Event.';
 const block='```aion-timeline\n'+source+'\n```\n';
 const note=block+'Between\n'+block;
 assert.throws(()=>locateBlock(note,source),/identical/);
 assert.equal(locateBlock(note,source,9).lineStart,7);
 assert.throws(()=>locateBlock(note,source.replace('Event.','Changed.')),/no longer matches/);
 const changed=block.replace('Event.','Changed.')+'Between\n'+block;
 assert.throws(()=>locateBlock(changed,source,0),/changed in the note/);
});
test('empty blocks and CRLF notes can receive their first Age',()=>{
 for(const nl of ['\n','\r\n']){
  const note=['Before','```aion-timeline','','```','After'].join(nl);
  const target=locateBlock(note,'\n\n',2);
  assert.equal(target.lineStart,1);
  assert.equal(parse(serialize([{title:'First Age',position:'normal',colour:'',years:[]}]))[0].title,'First Age');
 }
});
test('actual save path accepts empty Ages and repeated saves without section metadata',async()=>{
 class TFile{}
 class Child{constructor(el){this.containerEl=el;}}
 const notices=[];
 const api={TFile,MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{},Notice:class{constructor(message){notices.push(message);}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;',{module,require:()=>api});
 const file=new TFile();let content='Before\n```aion-timeline\n\n```\nAfter';
 const plugin={app:{vault:{getAbstractFileByPath:()=>file,process:async(f,edit)=>{content=edit(content);}}}};
 const view=new module.exports.TestView(plugin,'\n\n',{}, {sourcePath:'test.md',getSectionInfo:()=>null});
 view.render=()=>{};
 const next=[{title:'First Age',position:'normal',colour:'',years:[]}];
 assert.equal(await view.save(next),true);assert.deepEqual(notices,[]);
 next.push({title:'Second Age',position:'normal',colour:'',years:[]});
 assert.equal(await view.save(next),true);assert.equal(parse(locateBlock(content,serialize(next)).source).length,2);
 assert.ok(content.startsWith('Before\n'));assert.ok(content.endsWith('```\nAfter'));
});
test('save fallback waits for Obsidian and is cancelled when the old view unloads',()=>{
 class Child{constructor(el){this.containerEl=el;}}
 const api={MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;',{module,require:()=>api});
 const timers=new Map();let id=0,rebuilds=0;
 const win={setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(i){timers.delete(i);}};
 const el={ownerDocument:{defaultView:win},isConnected:true};
 const view=new module.exports.TestView({app:{}},'',el,{});view.render=()=>{rebuilds++;el.inert=false;};
 view.scheduleRefresh();assert.equal(rebuilds,0);assert.equal(el.inert,true);
 view.onunload();assert.equal(timers.size,0);assert.equal(rebuilds,0);
 const retained=new module.exports.TestView({app:{}},'',el,{});retained.render=()=>{rebuilds++;el.inert=false;};
 retained.scheduleRefresh();for(const fn of timers.values())fn();
 assert.equal(rebuilds,1);assert.equal(el.inert,false);
});
test('Obsidian replacement views receive the existing Markdown pool without a plain-text reset',()=>{
 class Child{constructor(el){this.containerEl=el;}}
 const api={MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;',{module,require:()=>api});
 const timers=new Map();let id=0,disposed=0;
 const win={setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(i){timers.delete(i);}};
 const leaf={},otherLeaf={};
 const el=root=>({ownerDocument:{defaultView:win},closest:()=>root});
 const plugin={app:{}},ctx={sourcePath:'note.md',getSectionInfo:()=>({lineStart:3})};
 const next=serialize(parse('# Age\n## Year\n### Circa\n- Original.\n- New.'));
 const old=new module.exports.TestView(plugin,'# Age',el(leaf),ctx);
 const pool={dispose(){disposed++;}};old.markdownPool=pool;
 old.offerMarkdownPool(next);old.onunload();assert.equal(disposed,0);
 const otherPane=new module.exports.TestView(plugin,next,el(otherLeaf),ctx);otherPane.render=()=>{};otherPane.onload();
 assert.equal(otherPane.markdownPool,undefined);
 const replacement=new module.exports.TestView(plugin,next,el(leaf),ctx);replacement.render=()=>{};replacement.onload();
 assert.equal(replacement.markdownPool,pool);assert.equal(old.markdownPool,null);
 assert.equal(plugin.renderHandoffs.size,0);assert.equal(timers.size,0);assert.equal(disposed,0);
 replacement.onunload();assert.equal(disposed,1);
});
test('unclaimed formatting handoffs expire and release their components',()=>{
 class Child{constructor(el){this.containerEl=el;}}
 const api={MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;',{module,require:()=>api});
 let expire,disposed=0;
 const win={setTimeout(fn){expire=fn;return 1;},clearTimeout(){}};
 const leaf={},plugin={app:{}};
 const view=new module.exports.TestView(plugin,'# Age',{ownerDocument:{defaultView:win},closest:()=>leaf},{sourcePath:'note.md',getSectionInfo:()=>null});
 view.markdownPool={dispose(){disposed++;}};
 view.offerMarkdownPool(serialize(parse('# Age')));view.onunload();assert.equal(disposed,0);
 expire();assert.equal(disposed,1);assert.equal(plugin.renderHandoffs.size,0);assert.equal(view.markdownPool,null);
});

test('formatting handoffs stay with their linked Age part when section positions are unavailable',()=>{
 class Child{constructor(el){this.containerEl=el;}}
 const api={MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;',{module,require:()=>api});
 const root={},win={setTimeout(){return 1;},clearTimeout(){}},el=()=>({ownerDocument:{defaultView:win},closest:()=>root});
 const plugin={app:{}},ctx={sourcePath:'note.md',getSectionInfo:()=>null};
 const source=serialize(parse('# One\n\n---\n\n# Two'));
 const old=new module.exports.TestView(plugin,source,el(),ctx);old.linked={part:'age-1'};
 const pool={dispose(){}};old.markdownPool=pool;old.offerMarkdownPool(source);old.onunload();
 const wrong=new module.exports.TestView(plugin,source,el(),ctx);wrong.linked={part:'age-2'};wrong.claimMarkdownPool();
 assert.equal(wrong.markdownPool,undefined);assert.equal(plugin.renderHandoffs.size,1);
 const right=new module.exports.TestView(plugin,source,el(),ctx);right.linked={part:'age-1'};right.claimMarkdownPool();
 assert.equal(right.markdownPool,pool);assert.equal(plugin.renderHandoffs.size,0);
});
