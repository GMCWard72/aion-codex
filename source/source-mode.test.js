const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 let shown=false;const observers=[],callbacks=[];let writes=0;
 const pane={isShown:()=>shown,parentElement:null,classList:{contains:()=>false}};
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const win={IntersectionObserver:Observer,MutationObserver:Observer};
 class Child{
  constructor(el){this.containerEl=el;this.cleanup=[];}
  register(fn){this.cleanup.push(fn);}
  removeChild(child){child.unload?.();}
  registerEvent(ref){this.register(()=>ref.off());}
  unload(){this.onunload();for(const fn of this.cleanup)fn();}
 }
 const api={MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;', {module,require:()=>api});
 const el={ownerDocument:{defaultView:win},closest:selector=>selector==='.markdown-preview-view'?pane:null,removeClass(){}};
 const plugin={app:{workspace:{on(name,callback){assert.equal(name,'layout-change');callbacks.push(callback);return {off(){callbacks.splice(callbacks.indexOf(callback),1);}};}},vault:{process(){writes++;}}}};
 return {View:module.exports.TestView,plugin,el,observers,callbacks,setShown:value=>shown=value,get writes(){return writes;}};
}
test('hidden Reading pane does no timeline work while source text is being edited',()=>{
 const f=fixture();
 // Deliberately incomplete Markdown should not be parsed in the inactive pane.
 const view=new f.View(f.plugin,'# Age\n## Year\n### ',f.el,{sourcePath:'note.md'});
 view.onload();assert.equal(view.previewPaused,true);assert.equal(view.shellScope,undefined);assert.equal(view.markdownPool,undefined);assert.equal(f.writes,0);
 for(let i=0;i<20;i++)view.render();
 assert.equal(view.shellScope,undefined);assert.equal(view.source,'# Age\n## Year\n### ');assert.equal(f.writes,0);
 view.unload();assert.ok(f.observers.every(o=>o.disconnected));assert.equal(f.callbacks.length,0);
});
test('a deferred preview resumes once on returning to Reading view and pauses existing work on leaving',()=>{
 const f=fixture(),view=new f.View(f.plugin,'# Age',f.el,{sourcePath:'note.md'});
 view.onload();let builds=0,pauses=0;
 view.render=()=>{builds++;};
 f.setShown(true);f.observers[0].callback();assert.equal(builds,1);assert.equal(view.previewPaused,false);
 f.observers[1].callback();f.callbacks[0]();assert.equal(builds,1);
 view.contentScope={};view.shellScope={unload(){pauses++;}};
 f.setShown(false);f.observers[0].callback();assert.equal(pauses,1);assert.equal(view.contentScope,null);
 f.observers[1].callback();assert.equal(pauses,1);
 f.setShown(true);f.callbacks[0]();assert.equal(builds,2);assert.equal(f.writes,0);
 view.unload();
});
test('Live Preview widgets are not suppressed just because the note is editable',()=>{
 const f=fixture();f.el.closest=()=>null;
 const view=new f.View(f.plugin,'# Age',f.el,{sourcePath:'note.md'});let builds=0;
 view.render=()=>{builds++;};view.onload();assert.equal(builds,1);assert.equal(f.observers.length,0);assert.equal(view.isPreviewHidden(),false);
 view.unload();
});
test('actual Source Mode is inactive even when preview geometry says visible or no preview ancestor exists',()=>{
 for(const noPreviewAncestor of [false,true]){
  const f=fixture();f.setShown(true);let mode='source';
  if(noPreviewAncestor)f.el.closest=()=>null;
  const owner={file:{path:'note.md'},containerEl:{contains:el=>el===f.el},getMode:()=>mode,getState:()=>({source:true})};
  f.plugin.app.workspace.getLeavesOfType=()=>[{view:owner}];
  const view=new f.View(f.plugin,'# Age\n## Year\n### ',f.el,{sourcePath:'note.md'});
  view.onload();assert.equal(view.previewPaused,true);assert.equal(view.shellScope,undefined);
  assert.equal(f.observers.length,0);assert.equal(view.isSourceMode(),true);assert.equal(f.writes,0);
  let builds=0;view.render=()=>{builds++;};mode='preview';f.callbacks[0]();
  assert.equal(builds,1);assert.equal(view.previewPaused,false);view.unload();
 }
});
test('a visible Reading pane is independent of a Source pane for the same note',()=>{
 const f=fixture();f.setShown(true);
 const editor={file:{path:'note.md'},containerEl:{contains:()=>false},getMode:()=> 'source'};
 const reader={file:{path:'note.md'},containerEl:{contains:el=>el===f.el},getMode:()=> 'preview'};
 f.plugin.app.workspace.getLeavesOfType=()=>[{view:editor},{view:reader}];
 const view=new f.View(f.plugin,'# Age',f.el,{sourcePath:'note.md'});let builds=0;view.render=()=>{builds++;};
 view.onload();assert.equal(builds,1);assert.equal(view.isSourceMode(),false);view.unload();
});
test('a detached block in an unambiguous Source pane stays inactive; Live Preview remains available',()=>{
 const f=fixture();f.el.closest=()=>null;
 let live=false;
 const owner={file:{path:'note.md'},containerEl:{contains:()=>false},getMode:()=> 'source',getState:()=>({source:!live})};
 f.plugin.app.workspace.getLeavesOfType=()=>[{view:owner}];
 const view=new f.View(f.plugin,'# Age',f.el,{sourcePath:'note.md'});
 assert.equal(view.isSourceMode(),true);live=true;assert.equal(view.isSourceMode(),false);
});


test('pausing releases live Markdown scopes, pending saves and the entire toolbar exactly once',()=>{
 const f=fixture();const cancelled=[];f.el.ownerDocument.defaultView.clearTimeout=id=>cancelled.push(id);
 const view=new f.View(f.plugin,'# Age',f.el,{sourcePath:'note.md'});
 let scopeUnloads=0,poolDisposals=0;view.shellScope={unload(){scopeUnloads++;}};
 view.contentScope={};view.markdownPool={dispose(){poolDisposals++;}};view.refreshTimer=123;
 view.pausePreview();view.pausePreview();
 assert.equal(scopeUnloads,1);assert.equal(poolDisposals,1);assert.deepEqual(cancelled,[123]);
 assert.equal(view.shellScope,null);assert.equal(view.contentScope,null);assert.equal(view.markdownPool,null);
 assert.equal(view.refreshTimer,undefined);assert.equal(f.writes,0);
});
