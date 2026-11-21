const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {linkAndSplit,blocks,linkedChronicle,parse}=require('./model');
async function setup(note='# Note'){
 let template=fs.readFileSync(path.join(__dirname,'..','Template.md'),'utf8');
 let handler,mode='preview',source=true;const children=[],notices=[],commands=[],cleanup=[];let writes=0;
 class TFile{constructor(){this.extension='md';this.path='note.md';}}
 const file=new TFile();
 const view={file,getMode:()=>mode,getState:()=>({source}),getViewData:()=>note,containerEl:{contains:()=>true}};
 const workspace={activeLeaf:{view},getLeavesOfType:()=>[{view}]};
 const app={workspace,vault:{adapter:{read:async filePath=>{assert.equal(filePath,'.obsidian/plugins/aion-codex/Template.md');return template;}},getAbstractFileByPath:()=>file,cachedRead:async()=>note,read:async()=>note,process:async(f,edit)=>{assert.equal(f,file);note=edit(note);writes++;}}};
 class Plugin{
  constructor(){this.app=app;}
  async loadData(){return null;}addSettingTab(){}addCommand(command){commands.push(command);}register(fn){cleanup.push(fn);}
  registerMarkdownCodeBlockProcessor(language,callback){assert.equal(language,'aion-timeline');handler=callback;}
  registerMarkdownPostProcessor(){throw Error('Use native integration');}
  registerEditorExtension(){throw Error('Do not install syntax extensions');}
 }
 class Child{constructor(el){this.containerEl=el;}}
 const api={Plugin,TFile,PluginSettingTab:class{},MarkdownRenderChild:Child,Modal:class{},Notice:class{constructor(text){notices.push(text);}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8'),{module,require:()=>api});
 const plugin=new module.exports();await plugin.onload();
 const ctx={sourcePath:'note.md',addChild:child=>{children.push(child);plugin.timelineViews.add(child);}};
 const el=()=>({classes:[],errors:[],addClass(name){this.classes.push(name);},createEl(tag,options){this.errors.push(options.text);}});
 return {plugin,handler,ctx,children,commands,notices,el,cleanup,setTemplate:value=>{template=value;},setMode:(next,isSource=true)=>{mode=next;source=isSource;},setNote:value=>{note=value;},get note(){return note;},get writes(){return writes;}};
}
test('native integration supports Reading and Live Preview while Source constructs nothing',async()=>{
 const f=await setup();await f.handler('# Age',f.el(),f.ctx);assert.equal(f.children.length,1);
 f.setMode('source',true);await f.handler('# Age',f.el(),f.ctx);assert.equal(f.children.length,1);
 f.setMode('source',false);await f.handler('# Age',f.el(),f.ctx);assert.equal(f.children.length,2);
});
test('linked blocks construct separate Age views with shared chronicle state',async()=>{
 const note=linkAndSplit('```aion-timeline\n# One\n\n---\n\n# Two\n```\n');const f=await setup(note);
 const found=blocks(note),first=f.el(),second=f.el();
 await f.handler(found[0].source,first,f.ctx);await f.handler(found[1].source,second,f.ctx);
 assert.equal(f.children.length,2);assert.deepEqual(parse(f.children[0].source).map(a=>a.title),['One','Two']);
 assert.equal(f.children[0].linked.id,'chronicle');assert.equal(f.children[0].linked.group,f.children[1].linked.group);
 assert.equal(f.children[0].linked.from,0);assert.equal(f.children[1].linked.from,1);assert.equal(f.children[0].linked.count,1);
 assert.deepEqual(second.classes,[]);assert.equal(f.writes,0);
});
test('processing an edited member synchronizes existing linked models only when content changes',async()=>{
 const note=linkAndSplit('```aion-timeline\n# One\n\n---\n\n# Two\n```\n');const f=await setup(note);
 await f.handler(blocks(note)[0].source,f.el(),f.ctx);
 const peer=f.children[0];let refreshes=0;peer.render=()=>refreshes++;
 f.setNote(note.replace('# Two','# Two edited'));
 await f.handler(blocks(f.note)[1].source,f.el(),f.ctx);
 assert.equal(refreshes,1);assert.equal(parse(peer.source)[1].title,'Two edited');
 await f.handler(blocks(f.note)[1].source,f.el(),f.ctx);assert.equal(refreshes,1);
});
test('actual linked save path commits all Ages together and rejects external edits',async()=>{
 const note=linkAndSplit('Before\n```aion-timeline\n# One\n\n---\n\n# Two\n```\nAfter');const f=await setup(note);
 await f.handler(blocks(note)[0].source,f.el(),f.ctx);const timeline=f.children[0];timeline.scheduleRefresh=()=>{};
 const next=parse(timeline.source).reverse();next.push({title:'Three',position:'normal',colour:'',years:[]});
 assert.equal(await timeline.save(next),true);assert.equal(f.writes,1);assert.equal(blocks(f.note).length,3);
 assert.deepEqual(linkedChronicle(f.note,'chronicle').ages.map(a=>a.title),['Two','One','Three']);
 assert.ok(f.note.startsWith('Before\n'));assert.ok(f.note.endsWith('After'));
 assert.equal(await timeline.save(parse(timeline.source)),true);assert.equal(f.writes,2);
 f.setNote(f.note.replace('# One','# Manual edit'));
 assert.equal(await timeline.save(parse(timeline.source)),false);assert.equal(f.writes,2);assert.match(f.notices.at(-1),/changed/);
});
test('an asynchronous linked load cannot construct a component after plugin unload',async()=>{
 const note=linkAndSplit('```aion-timeline\n# One\n```\n');const f=await setup(note);
 f.plugin.app.workspace.getLeavesOfType=()=>[];
 let resolve;f.plugin.app.vault.cachedRead=()=>new Promise(done=>{resolve=done;});
 const pending=f.handler(blocks(note)[0].source,f.el(),f.ctx);
 // Only mark the plugin stopped: the other cleanups require loaded Component mocks.
 f.plugin.stopped=true;resolve(note);await pending;assert.equal(f.children.length,0);
});
test('insert example reads Template.md and creates fresh linked Age blocks',async()=>{
 const f=await setup();let inserted;
 await f.commands.find(c=>c.id==='insert-timeline').editorCallback({replaceSelection:text=>{inserted=text;}});
 const found=blocks(inserted);assert.equal(found.length,11);assert.ok(found.every(b=>parse(b.source).length===1));
 assert.equal(new Set(found.map(b=>/aion: ([^/]+)/.exec(b.source)[1])).size,1);
});


test('scrolling in unchanged later Ages never rebuilds the earlier views',async()=>{
 const note=linkAndSplit('```aion-timeline\n# One\n\n---\n\n# Two\n\n---\n\n# Three\n```\n');const f=await setup(note);
 const found=blocks(note);await f.handler(found[0].source,f.el(),f.ctx);
 const first=f.children[0];let builds=0;first.render=()=>builds++;
 for(let i=1;i<found.length;i++)await f.handler(found[i].source,f.el(),f.ctx);
 assert.equal(builds,0);assert.equal(f.children.length,3);assert.deepEqual(f.children.map(child=>child.linked.from),[0,1,2]);
 assert.equal(f.writes,0);
});

test('Add Age upgrades only its standalone timeline and subsequent additions stay split',async()=>{
 const note='Before\n```aion-timeline\n# One\n## Year\n### Circa\n- Event\n```\nBetween\n```aion-timeline\n# Independent\n```\nAfter';
 const f=await setup(note);await f.handler(blocks(note)[0].source,f.el(),f.ctx);
 const timeline=f.children[0];timeline.scheduleRefresh=()=>{};
 let next=parse(timeline.source);next.push({title:'Two',position:'normal',colour:'',description:'Overview',years:[]});
 assert.equal(await timeline.save(next,timeline.source,{splitAges:true}),true);
 assert.equal(timeline.linked.id,'chronicle');assert.equal(timeline.linked.count,1);
 assert.equal(blocks(f.note).length,3);assert.equal(blocks(f.note).filter(b=>b.source.includes('aion:')).length,2);
 assert.ok(f.note.includes('Between\n```aion-timeline\n# Independent\n```\nAfter'));
 assert.deepEqual(linkedChronicle(f.note,'chronicle').ages.map(a=>a.title),['One','Two']);
 next=parse(timeline.source);next.push({title:'Three',position:'normal',colour:'',years:[]});
 assert.equal(await timeline.save(next,timeline.source,{splitAges:true}),true);
 assert.equal(linkedChronicle(f.note,'chronicle').members.length,3);
 assert.equal(linkedChronicle(f.note,'chronicle').ages[1].description,'Overview');
 assert.ok(blocks(f.note).every(b=>parse(b.source).length===1));
});

test('Add Age starts an empty standalone timeline in linked format',async()=>{
 const note='```aion-timeline\n\n```\n';const f=await setup(note);
 await f.handler('',f.el(),f.ctx);const timeline=f.children[0];timeline.scheduleRefresh=()=>{};
 assert.equal(await timeline.save([{title:'First',position:'normal',colour:'#af0000',years:[]}],timeline.source,{splitAges:true}),true);
 assert.equal(linkedChronicle(f.note,'chronicle').members.length,1);
 assert.equal(linkedChronicle(f.note,'chronicle').ages[0].title,'First');
});

test('Add/Edit Age cannot save duplicate titles across linked blocks',async()=>{
 const f=await setup(linkAndSplit('```aion-timeline\n# Dawn\n\n---\n\n# Future\n```\n'));
 await f.handler(blocks(f.note)[0].source,f.el(),f.ctx);const timeline=f.children[0];timeline.scheduleRefresh=()=>{};
 let next=parse(timeline.source);next.push({title:' dawn ',position:'normal',colour:'',years:[]});
 assert.equal(await timeline.save(next,timeline.source,{splitAges:true}),false);assert.equal(f.writes,0);assert.match(f.notices.at(-1),/Age titles must be unique/);
 next=parse(timeline.source);next[1].title='DAWN';
 assert.equal(await timeline.save(next),false);assert.equal(f.writes,0);
 next=parse(timeline.source);next[0].description='Allowed edit';assert.equal(await timeline.save(next),true);assert.equal(f.writes,1);
});


test('Insert example rereads Template.md on each invocation and reports a missing template without inserting',async()=>{
 const f=await setup();const command=f.commands.find(c=>c.id==='insert-timeline');let note='';
 const editor={getValue:()=>note,replaceSelection:text=>{note+=text;}};
 f.setTemplate('```aion-timeline\n# Custom Age\n```\n');await command.editorCallback(editor);
 assert.equal(parse(blocks(note)[0].source)[0].title,'Custom Age');
 f.setTemplate('```aion-timeline\n# Updated Age\n```\n');await command.editorCallback(editor);
 assert.equal(parse(blocks(note)[1].source)[0].title,'Updated Age');
 const info=require('./model').linkInfo;assert.notEqual(info(blocks(note)[0].source).id,info(blocks(note)[1].source).id);
 const before=note;f.plugin.app.vault.adapter.read=async()=>{throw Error('File not found');};
 await command.editorCallback(editor);assert.equal(note,before);assert.match(f.notices.at(-1),/Template.md.*File not found/);
});

test('Insert example cannot replace text typed while Template.md is being read',async()=>{
 const f=await setup();let note='Original',resolve;
 f.plugin.app.vault.adapter.read=()=>new Promise(done=>{resolve=done;});
 const pending=f.commands.find(c=>c.id==='insert-timeline').editorCallback({getValue:()=>note,replaceSelection:text=>{note=text;}});
 note='User edited';resolve('```aion-timeline\n# Age\n```\n');await pending;
 assert.equal(note,'User edited');assert.match(f.notices.at(-1),/changed/);
});

test('Insert example leaves a changed selection and an invalid template untouched',async()=>{
 const f=await setup();let selection={line:0,ch:0},insertions=0,resolve;
 const editor={getValue:()=>'',getCursor:()=>({...selection}),replaceSelection:()=>{insertions++;}};
 f.plugin.app.vault.adapter.read=()=>new Promise(done=>{resolve=done;});
 const pending=f.commands.find(c=>c.id==='insert-timeline').editorCallback(editor);
 selection={line:0,ch:2};resolve('```aion-timeline\n# Age\n```\n');await pending;
 assert.equal(insertions,0);assert.match(f.notices.at(-1),/selection changed/);
 f.plugin.app.vault.adapter.read=async()=> 'Not a timeline';
 await f.commands.find(c=>c.id==='insert-timeline').editorCallback(editor);
 assert.equal(insertions,0);assert.match(f.notices.at(-1),/must contain/);
});

test('Starting Age saves and transfers its marker without breaking repeated linked saves',async()=>{
 const {setStartingAge,linkInfo}=require('./model');const f=await setup(linkAndSplit('```aion-timeline\n# One\n\n---\n\n# Two\n\n---\n\n# Three\n```\n'));
 await f.handler(blocks(f.note)[0].source,f.el(),f.ctx);const view=f.children[0];view.scheduleRefresh=()=>{};
 assert.equal(await view.save(setStartingAge(parse(view.source),1)),true);
 assert.equal(view.linked.part,'starting');assert.equal(linkedChronicle(f.note,'chronicle').ages[0].title,'Two');
 assert.equal(await view.save(setStartingAge(parse(view.source),2)),true);assert.equal(linkedChronicle(f.note,'chronicle').ages[0].title,'Three');
 const cleared=parse(view.source);delete cleared[0].starting;assert.equal(await view.save(cleared),true);
 assert.notEqual(view.linked.part,'starting');assert.equal(await view.save(parse(view.source)),true);
 assert.equal(blocks(f.note).filter(block=>linkInfo(block.source).part==='starting').length,0);
});

test('a Starting Age in a standalone timeline is saved with a linked starting marker',async()=>{
 const {setStartingAge}=require('./model');const f=await setup('```aion-timeline\n# One\n\n---\n\n# Two\n```\n');
 await f.handler(blocks(f.note)[0].source,f.el(),f.ctx);const view=f.children[0];view.scheduleRefresh=()=>{};
 assert.equal(await view.save(setStartingAge(parse(view.source),1)),true);
 assert.equal(view.linked.part,'starting');assert.equal(linkedChronicle(f.note,'chronicle').ages[0].title,'Two');
 assert.match(blocks(f.note)[0].source,/aion: chronicle\/starting/);
});
