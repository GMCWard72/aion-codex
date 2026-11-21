const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ViewportRenderer,previewText,MarkdownPool,previewNodes,renderPreview}=require('./rendering');
function windowStub(withObserver=true){
 const frames=new Map();let id=0;
 const win={requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(i){frames.delete(i);}};
 if(withObserver)win.IntersectionObserver=class{
  constructor(callback){this.callback=callback;this.observed=new Set();win.observer=this;}
  observe(el){this.observed.add(el);}unobserve(el){this.observed.delete(el);}
  disconnect(){this.observed.clear();this.disconnected=true;}
 };
 return {win,frames,tick(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();}};
}
test('340 events format only near the viewport, at most 10 per frame, and never twice',()=>{
 const fake=windowStub(),calls=[];
 const queue=new ViewportRenderer(fake.win,(markdown,el)=>{calls.push(markdown);el.textContent='formatted '+markdown;});
 const elements=Array.from({length:340},()=>({textContent:''}));
 elements.forEach((el,i)=>queue.add('Event **'+i+'** with [[Note|Link]].',el));
 assert.equal(calls.length,0);assert.equal(fake.win.observer.observed.size,340);
 const visible=elements.slice(0,20).map(target=>({target,isIntersecting:true}));
 fake.win.observer.callback(visible);fake.win.observer.callback(visible);
 fake.tick();assert.equal(calls.length,10);
 fake.tick();assert.equal(calls.length,20);assert.equal(fake.frames.size,0);
 assert.equal(fake.win.observer.observed.size,320);
 assert.equal(elements[339].textContent,'Event 339 with Link.');
 fake.win.observer.callback(elements.slice(20).map(target=>({target,isIntersecting:true})));
 while(fake.frames.size)fake.tick();assert.equal(calls.length,340);
});
test('unloading cancels queued work and detaches visibility observation',()=>{
 const fake=windowStub();let calls=0;
 const queue=new ViewportRenderer(fake.win,()=>calls++);
 const el={textContent:''};queue.add('Event',el);
 fake.win.observer.callback([{target:el,isIntersecting:true}]);
 assert.equal(fake.frames.size,1);queue.dispose();fake.tick();
 assert.equal(calls,0);assert.equal(fake.frames.size,0);assert.equal(fake.win.observer.disconnected,true);
 fake.win.observer.callback([{target:el,isIntersecting:true}]);assert.equal(fake.frames.size,0);
});
test('environments without visibility observation still format all events in batches',()=>{
 const fake=windowStub(false);let calls=0;
 const queue=new ViewportRenderer(fake.win,()=>calls++);
 for(let i=0;i<24;i++)queue.add('Event '+i,{textContent:''});
 fake.tick();assert.equal(calls,10);fake.tick();assert.equal(calls,20);fake.tick();assert.equal(calls,24);
});
test('a Markdown renderer failure leaves readable event text',async()=>{
 const fake=windowStub(false),el={textContent:''};
 const queue=new ViewportRenderer(fake.win,()=>Promise.reject(new Error('render failed')));
 queue.add('A **bold** [[Note|link]].',el);fake.tick();await Promise.resolve();
 assert.equal(el.textContent,'A bold link.');
 assert.equal(previewText('[Label](https://example.com) and `code`'),'Label and code');
});
test('617-event view shares controls/listeners and preserves hover actions, dragging and cleanup',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const fake=windowStub();const timers=new Map();let timerId=0,activeListeners=0;
 fake.win.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};fake.win.clearTimeout=id=>timers.delete(id);
 const doc={defaultView:fake.win};
 class Element{
  constructor(){this.children=[];this.listeners=new Map();this.ownerDocument=doc;this.style={setProperty(){}};this.classList={add(){},remove(){}};this.attributes={};}
  createEl(tag,options={}){const el=new Element();el.parentNode=this;el.tag=tag;el.cls=options.cls;el.textContent=options.text||'';this.children.push(el);return el;}
  createDiv(options){return this.createEl('div',typeof options==='string'?{cls:options}:options);}
  appendChild(el){if(el.parentNode){const at=el.parentNode.children.indexOf(el);if(at>=0)el.parentNode.children.splice(at,1);}el.parentNode=this;this.children.push(el);return el;}
  contains(el){for(let node=el;node;node=node.parentNode)if(node===this)return true;return false;}
  addEventListener(name,fn){this.listeners.set(name,fn);}removeEventListener(name){this.listeners.delete(name);}
  setAttribute(name,value){this.attributes[name]=value;}
  focus(){doc.activeElement=this;}
  addClass(){}removeClass(){}toggleClass(){}empty(){this.children=[];}
  set textContent(value){this.text=value;this.children=[];}get textContent(){return this.text;}
 }
 class Component{
  constructor(){this.children=[];this.callbacks=[];}
  addChild(child){this.children.push(child);return child;}
  removeChild(child){child.unload();this.children.splice(this.children.indexOf(child),1);return child;}
  register(fn){this.callbacks.push(fn);}
  registerDomEvent(el,name,fn){activeListeners++;el.addEventListener(name,fn);this.register(()=>{activeListeners--;el.removeEventListener(name,fn);});}
  unload(){this.onunload?.();for(const child of this.children)child.unload();for(const fn of this.callbacks)fn();this.children=[];this.callbacks=[];}
 }
 class Child extends Component{constructor(el){super();this.containerEl=el;}}
 let formatted=0;const opened=[];
 const api={Component,MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{open(){opened.push(this);}},setIcon(){},MarkdownRenderer:{render(){formatted++;return Promise.resolve();}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;',{module,require:()=>api});
 const source='# Age\n## Year\n### Circa\n'+Array.from({length:617},(_,i)=>'- Event '+i).join('\n');
 const plugin=new Component();plugin.app={};plugin.settings={yearWidth:150,gap:18,accent:'#398f8c',eventTextSize:85,panels:true};
 const el=new Element();const view=new module.exports.TestView(plugin,source,el,{sourcePath:'test.md'});
 view.onload();assert.equal(formatted,0);const initialListeners=activeListeners,oldScope=view.contentScope,oldObserver=fake.win.observer;
 const nodes=node=>[node,...node.children.flatMap(nodes)];
 assert.equal(nodes(el).filter(n=>n.tag==='button').length,11);assert.equal(initialListeners,9);
 const body=el.children[2],rows=nodes(body).filter(n=>n.tag==='li');
 const actions=nodes(body).find(n=>n.cls==='aion-event-actions');
 body.listeners.get('mouseover')({target:rows[10].children[0]});assert.equal(actions.parentNode,rows[10]);
 body.listeners.get('pointerdown')({target:rows[11].children[0],pointerType:'touch'});assert.equal(actions.parentNode,rows[11]);
 body.listeners.get('mouseover')({target:rows[10].children[0]});
 actions.children[0].listeners.get('click')();assert.equal(opened.at(-1).context.ei,10);assert.equal(opened.at(-1).context.insertAfter,true);assert.equal(opened.at(-1).context.event,undefined);
 body.listeners.get('mouseover')({target:rows[616].children[0]});assert.equal(actions.parentNode,rows[616]);
 actions.children[1].listeners.get('click')();assert.equal(opened.at(-1).context.ei,616);assert.equal(opened.at(-1).context.event.text,'Event 616');
 actions.children[2].listeners.get('click')();assert.equal(opened.at(-1).title,'Delete Event');
 const afterDelete=opened.at(-1).makeNext();assert.equal(afterDelete[0].years[0].groups[0].events.length,616);assert.equal(afterDelete[0].years[0].groups[0].events.at(-1).text,'Event 615');
 assert.equal(nodes(el).filter(n=>n.tag==='button').length,11);
 const transfer={setData(){}};
 body.listeners.get('dragstart')({target:rows[10].children[0],dataTransfer:transfer,stopPropagation(){}});
 assert.equal(view.drag.ei,10);let moved;
 view.move=(drag,target)=>{moved={drag,target};};
 body.listeners.get('drop')({target:rows[20].children[0],preventDefault(){},stopPropagation(){}});
 assert.equal(moved.drag.ei,10);assert.equal(moved.target.ei,20);assert.equal(view.drag,null);
 body.listeners.get('dragstart')({target:rows[10].children[0],dataTransfer:transfer,stopPropagation(){}});
 moved=null;body.listeners.get('drop')({target:body});assert.equal(moved,null);assert.equal(view.drag,null);
 const searchBox=el.children[0].children[0],search=searchBox.children[0],clear=searchBox.children[1];
 assert.equal(clear.hidden,true);
 search.value='Event 33';search.listeners.get('input')();
 assert.equal(clear.hidden,false);
 for(const fn of [...timers.values()])fn();timers.clear();
 assert.equal(oldScope.callbacks.length,0);assert.equal(oldObserver.disconnected,true);
 clear.listeners.get('click')();assert.equal(search.value,'');assert.equal(view.query,'');assert.equal(clear.hidden,true);assert.equal(doc.activeElement,search);
 assert.equal(nodes(body).filter(node=>node.tag==='li').length,617);
 search.value='Event 99';search.listeners.get('input')();assert.equal(timers.size,1);
 clear.listeners.get('click')();assert.equal(timers.size,0);assert.equal(nodes(body).filter(node=>node.tag==='li').length,617);
 assert.equal(activeListeners,initialListeners);assert.equal(view.children.length,1);assert.equal(view.shellScope.children.length,1);
 view.render();assert.equal(activeListeners,initialListeners);assert.equal(view.children.length,1);
 view.unload();assert.equal(activeListeners,0);assert.equal(fake.win.observer.disconnected,true);assert.equal(fake.frames.size,0);assert.equal(plugin.children.length,0);
});
test('unchanged entries reuse the same formatted nodes and live components across refreshes',async()=>{
 let formatted=0,released=0;
 const pool=new MarkdownPool(()=>({alive:true}),scope=>{scope.alive=false;released++;},async(markdown,el)=>{formatted++;el.textContent='FORMATTED: '+markdown;});
 const parent=()=>({children:[],createDiv(){const el={textContent:''};this.children.push(el);return el;},appendChild(el){this.children.push(el);}});
 pool.begin(['**One**','Two']);
 const a=pool.acquire('**One**',parent()),b=pool.acquire('Two',parent());
 await pool.format('**One**',a.el);await pool.format('Two',b.el);
 pool.begin(['**One**','Two','New']);
 const same=pool.acquire('**One**',parent());
 assert.equal(same.el,a.el);assert.equal(same.scope,a.scope);assert.equal(same.el.textContent,'FORMATTED: **One**');
 await pool.format('**One**',same.el);assert.equal(formatted,2);assert.equal(released,0);
 const c=pool.acquire('New',parent());await pool.format('New',c.el);assert.equal(formatted,3);
 pool.begin(['Two','New']);assert.equal(released,1);assert.equal(a.scope.alive,false);assert.equal(b.scope.alive,true);
 pool.dispose();assert.equal(released,3);assert.equal(b.scope.alive,false);
});
test('identical event text gets independent nodes, and filtered entries remain cached',async()=>{
 let scopes=0;
 const pool=new MarkdownPool(()=>({id:++scopes}),()=>{},async(text,el)=>{el.textContent='rich';});
 const parent={createDiv(){return {textContent:''};},appendChild(){}};
 pool.begin(['Same','Same']);const first=pool.acquire('Same',parent),second=pool.acquire('Same',parent);
 assert.notEqual(first.el,second.el);await pool.format('Same',first.el);await pool.format('Same',second.el);
 pool.begin(['Same','Same']); // Search hides one entry without removing it from the source.
 pool.acquire('Same',parent);pool.begin(['Same','Same']);
 assert.equal(pool.acquire('Same',parent).el,first.el);assert.equal(pool.acquire('Same',parent).el,second.el);
 assert.equal(scopes,2);pool.dispose();
});
class PreviewElement {
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.attributes={};this.listeners={};}
 createEl(tag){const el=new PreviewElement(tag);this.children.push(el);return el;}
 createDiv(){return this.createEl('div');}
 appendText(text){this.children.push(text);}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(name,callback){this.listeners[name]=callback;}
 set textContent(text){this.children=text?[text]:[];}
 get textContent(){return this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
 replaceChildren(...children){this.children=children;}
 visibleText(){if(this.hidden)return '';return this.children.map(c=>typeof c==='string'?c:c.visibleText()).join('');}
 tags(){return this.children.flatMap(c=>typeof c==='string'?[]:[c.tag,...c.tags()]);}
}
test('previews render asterisk and underscore italics before full Markdown is available',()=>{
 const el=new PreviewElement();renderPreview('An *italic phrase* and _another phrase_.',el);
 assert.deepEqual(el.tags(),['em','em']);assert.equal(el.textContent,'An italic phrase and another phrase.');
 const mixed=new PreviewElement();renderPreview('**Bold** and ***both*** and *italic **bold** words*.',mixed);
 assert.deepEqual(mixed.tags(),['strong','strong','em','em','strong']);
 assert.equal(mixed.textContent,'Bold and both and italic bold words.');
});
test('previews leave escaped markers, code and identifiers literal and never interpret raw HTML',()=>{
 assert.equal(previewText('\\*literal\\* and snake_case_value and `*code*`'),'*literal* and snake_case_value and *code*');
 const el=new PreviewElement();renderPreview('<img src=x onerror=alert(1)> and *safe*',el);
 assert.deepEqual(el.tags(),['em']);assert.ok(el.textContent.startsWith('<img src=x'));
 assert.equal(previewText('[[Some Note|*Alias*]] and [**Link**](https://example.com)'), 'Alias and Link');
 assert.deepEqual(previewNodes('*unclosed'),['*unclosed']);
});
test('italic preview stays visible until asynchronous full formatting is ready',async()=>{
 let finish;
 const pool=new MarkdownPool(()=>({}),()=>{},async(markdown,target)=>{
   await new Promise(resolve=>{finish=resolve;});target.createEl('p').createEl('em').appendText('Finished');
 });
 const parent=new PreviewElement();pool.begin(['*Preview*']);const record=pool.acquire('*Preview*',parent);
 renderPreview('*Preview*',record.el);
 const formatting=pool.format('*Preview*',record.el);
 assert.equal(record.el.visibleText(),'Preview');assert.equal(record.el.children.at(-1).hidden,true);
 finish();await formatting;assert.equal(record.el.visibleText(),'Finished');
 assert.deepEqual(record.el.tags(),['div','p','em']);pool.dispose();
});
test('wiki-link previews use internal-link styling, aliases and unresolved state',()=>{
 const el=new PreviewElement(),opened=[];
 renderPreview('See [[Known|*Alias*]] and [[Missing]] and [[#Heading|section]].',el,{
  isUnresolved:path=>path==='Missing',openInternalLink:(path,event)=>opened.push([path,event.ctrlKey])
 });
 const links=el.children.filter(child=>typeof child!=='string');
 assert.equal(links.length,3);assert.equal(links[0].tag,'a');
 assert.equal(links[0].attributes.class,'internal-link');assert.equal(links[0].attributes['data-href'],'Known');
 assert.deepEqual(links[0].tags(),['em']);assert.equal(links[0].textContent,'Alias');
 assert.equal(links[1].attributes.class,'internal-link is-unresolved');
 assert.equal(links[2].attributes['data-href'],'#Heading');
 let prevented=false,stopped=false;
 links[0].listeners.click({ctrlKey:true,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(prevented,true);assert.equal(stopped,true);assert.deepEqual(opened,[['Known',true]]);
 const unsafe=new PreviewElement();renderPreview('[[javascript:alert(1)|label]]',unsafe);
 assert.equal(unsafe.children[0].attributes.href,'#');
});
