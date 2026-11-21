const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {linkAndSplit,linkedChronicle,linkedLayout,linkInfo}=require('./model');
function fixture(extraAges=0,overrideSource=null){
 const timers=new Map(),frames=new Map();let id=0;
 const win={setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(key){timers.delete(key);},requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(key){frames.delete(key);}};
 win.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 const doc={defaultView:win};
 class Element{
  constructor(){this.children=[];this.listeners=new Map();this.ownerDocument=doc;this.styles={};this.style={setProperty:(key,value)=>{this.styles[key]=value;}};this.classList={add(){},remove(){}};this.attributes={};}
  createEl(tag,options={}){const child=new Element();child.tag=tag;child.cls=options.cls;child.textContent=options.text||'';this.appendChild(child);return child;}
  createDiv(options){return this.createEl('div',typeof options==='string'?{cls:options}:options);}
  appendChild(child){if(child.parentNode){const at=child.parentNode.children.indexOf(child);if(at>=0)child.parentNode.children.splice(at,1);}child.parentNode=this;this.children.push(child);return child;}
  getBoundingClientRect(){return this.rect||{top:0,bottom:0,left:0,width:0};}
  contains(child){for(let node=child;node;node=node.parentNode)if(node===this)return true;return false;}
  addEventListener(name,fn){this.listeners.set(name,fn);}removeEventListener(name){this.listeners.delete(name);}
  setAttribute(name,value){this.attributes[name]=value;}focus(){doc.activeElement=this;}
  addClass(){}removeClass(){}toggleClass(){}empty(){this.children=[];}
  remove(){if(this.parentNode){const at=this.parentNode.children.indexOf(this);if(at>=0)this.parentNode.children.splice(at,1);this.parentNode=null;}}
  set textContent(value){this.text=value;this.children=[];}get textContent(){return this.text;}
 }
 class Component{
  constructor(){this.children=[];this.callbacks=[];}
  addChild(child){this.children.push(child);return child;}
  removeChild(child){child.unload();this.children.splice(this.children.indexOf(child),1);return child;}
  register(fn){this.callbacks.push(fn);}
  registerDomEvent(el,name,fn){el.addEventListener(name,fn);this.register(()=>el.removeEventListener(name));}
  unload(){this.onunload?.();for(const child of this.children)child.unload();for(const fn of this.callbacks)fn();this.children=[];this.callbacks=[];}
 }
 class Child extends Component{constructor(el){super();this.containerEl=el;}}
 const opened=[],notices=[];
 const api={Component,MarkdownRenderChild:Child,Plugin:class{},PluginSettingTab:class{},Modal:class{open(){opened.push(this);}},Notice:class{constructor(message){notices.push(message);}},setIcon(){},MarkdownRenderer:{render(){return Promise.resolve();}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestView=TimelineView;',{module,require:()=>api});
 const plugin=new Component();plugin.app={};plugin.settings={yearWidth:150,gap:10,accent:'#af0000',eventTextSize:80,panels:true};
 plugin.timelineViews=new Set();const group={query:''};
 let note=linkAndSplit('```aion-timeline\n# One\n## Year\n### Circa\n- First event\n\n---\n\n# Two\n## Year\n### Circa\n- Needle second event\n\n---\n\n# Three\n## Year\n### Circa\n- Needle third event\n```\n');
 if(overrideSource!==null)note=linkAndSplit('```aion-timeline\n'+overrideSource+'\n```\n');
 if(extraAges){
  const model=require('./model'),initial=model.linkedChronicle(note,'chronicle');
  const additions=Array.from({length:extraAges},(_,i)=>({title:'Age '+(i+4),position:'normal',colour:'',years:[{label:'Year '+(i+4),image:'',groups:[{title:'Date '+(i+4),events:[{text:'Distant Event '+(i+4)}]}]}]}));
  note=model.writeLinkedChronicle(note,'chronicle',initial.snapshot,[...initial.ages,...additions]);
 }
 const state=linkedChronicle(note,'chronicle');
 const create=index=>{
  const part=linkInfo(state.members[index].source).part,el=new Element();
  const view=new module.exports.TestView(plugin,state.source,el,{sourcePath:'note.md'});
  view.linked={id:'chronicle',part,group,snapshot:state.snapshot,...linkedLayout(state,part)};view.onload();return view;
 };
 const tick=()=>{const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();};
 const nodes=node=>[node,...node.children.flatMap(nodes)];
 const byTag=(view,tag)=>nodes(view.containerEl).filter(node=>node.tag===tag);
 const body=view=>view.containerEl.children[2];
 return {plugin,group,create,tick,nodes,byTag,body,opened,notices,setOverlayRoot:()=>{doc.body=new Element();return doc.body;}};
}
test('each block renders only its Age while the first toolbar counts the entire chronicle',()=>{
 const f=fixture(),views=[f.create(0),f.create(1),f.create(2)];
 assert.deepEqual(views.map(view=>f.byTag(view,'h2').map(node=>node.textContent)),[['One'],['Two'],['Three']]);
 assert.deepEqual(views.map(view=>f.byTag(view,'li').length),[1,1,1]);
 assert.deepEqual(views.map(view=>view.containerEl.children[0].hidden),[false,true,true]);
 assert.match(views[0].containerEl.children[1].textContent,/^3 Events/);
 assert.equal(f.nodes(f.body(views[0])).some(node=>node.cls==='aion-age-end'),false);
 assert.equal(f.nodes(f.body(views[2])).some(node=>node.cls==='aion-age-end'),false);
 assert.ok(views.every(view=>f.nodes(f.body(view)).find(node=>node.cls==='aion-drop-indicator').hidden));
});
test('search gathers all matches at the first block and clears back to separate Ages',()=>{
 const f=fixture(),first=f.create(0),second=f.create(1);
 const field=first.containerEl.children[0].children[0].children[0];field.value='Needle';field.listeners.get('input')();f.tick();
 assert.equal(f.byTag(first,'li').length,2);assert.equal(f.byTag(second,'li').length,0);
 assert.match(first.containerEl.children[1].textContent,/^2 Events found/);assert.equal(f.group.query,'Needle');
 second.unload();const reloaded=f.create(1),later=f.create(2);
 assert.equal(reloaded.query,'Needle');assert.equal(later.query,'Needle');assert.equal(f.byTag(reloaded,'li').length,0);assert.equal(f.byTag(later,'li').length,0);
 const clear=first.containerEl.children[0].children[0].children[1];clear.listeners.get('click')();
 assert.equal(f.group.query,'');assert.equal(f.byTag(first,'li').length,1);assert.equal(reloaded.query,'');
});
test('event dragging crosses linked block boundaries and clears shared drag state',()=>{
 const f=fixture(),first=f.create(0),second=f.create(1);
 const sourceText=f.byTag(first,'li')[0].children[0],targetText=f.byTag(second,'li')[0].children[0];
 f.body(first).listeners.get('dragstart')({target:sourceText,stopPropagation(){},dataTransfer:{setData(){}}});
 assert.equal(first.currentDrag().ai,0);assert.equal(second.currentDrag().ai,0);
 let moved;second.move=(drag,target)=>{moved={drag,target};};
 f.body(second).listeners.get('drop')({target:targetText,preventDefault(){},stopPropagation(){}});
 assert.equal(moved.drag.ai,0);assert.equal(moved.target.ai,1);assert.equal(f.plugin.linkedDrag,null);assert.equal(first.drag,null);
});
test('dragging cannot cross into a different chronicle or use a stale snapshot',()=>{
 const f=fixture(),first=f.create(0),second=f.create(1);
 f.body(first).listeners.get('dragstart')({target:f.byTag(first,'li')[0].children[0],stopPropagation(){},dataTransfer:{setData(){}}});
 second.linked.group={query:''};assert.equal(second.currentDrag(),null);
 second.linked.group=first.linked.group;second.linked.snapshot='changed';assert.equal(second.currentDrag(),null);
 first.unload();assert.equal(f.plugin.linkedDrag,null);
});


test('search finds the thirteenth Age before its block has ever been created',()=>{
 const f=fixture(10),first=f.create(0);
 assert.equal(f.plugin.timelineViews.size,1);
 const field=first.containerEl.children[0].children[0].children[0];
 for(const query of ['Distant Event 13','Age 13','Year 13','Date 13']){
  field.value=query;field.listeners.get('input')();f.tick();
  assert.equal(f.byTag(first,'li').length,1);
  assert.equal(f.byTag(first,'h2')[0].textContent,'Age 13');
  assert.match(first.containerEl.children[1].textContent,/^1 Event found/);
 }
 const row=f.byTag(first,'li')[0];f.body(first).listeners.get('mouseover')({target:row.children[0]});
 const actions=f.nodes(row).find(node=>node.cls==='aion-event-actions');
 actions.children[1].listeners.get('click')();
 assert.equal(f.opened.at(-1).context.ai,12);assert.equal(f.opened.at(-1).context.event.text,'Distant Event 13');
 const later=f.create(12);assert.equal(f.byTag(later,'li').length,0);
 const clear=first.containerEl.children[0].children[0].children[1];clear.listeners.get('click')();
 assert.equal(f.byTag(first,'h2')[0].textContent,'One');assert.equal(f.byTag(later,'h2')[0].textContent,'Age 13');
 assert.equal(f.byTag(first,'li').length,1);assert.equal(f.byTag(later,'li').length,1);
});

test('Event insertion lines select the gap, top and bottom without adding drag handles or spacer boxes',()=>{
 const source='# One\n## Named Year\n### Rainwake\n- A\n- B\n- C';const f=fixture(0,source),view=f.create(0);
 const rows=f.byTag(view,'li');rows.forEach((row,i)=>{row.rect={top:120+i*30,bottom:140+i*30,left:100,width:400};});
 const panel=f.nodes(f.body(view)).find(node=>node.cls==='aion-panel');panel.rect={top:100,bottom:220,left:80,width:440};
 const indicator=f.nodes(f.body(view)).find(node=>node.cls==='aion-drop-indicator');
 const start=()=>f.body(view).listeners.get('dragstart')({target:rows[0].children[0],stopPropagation(){},dataTransfer:{setData(){}}});
 start();let prevented=false;
 f.body(view).listeners.get('dragover')({target:panel,clientY:175,preventDefault(){prevented=true;},stopPropagation(){},dataTransfer:{}});
 assert.equal(prevented,true);assert.equal(indicator.hidden,false);assert.equal(indicator.styles.top,'170px');
 let moved;view.move=(drag,target)=>{moved={drag,target};};
 f.body(view).listeners.get('drop')({target:panel,clientY:175,preventDefault(){},stopPropagation(){}});
 assert.equal(moved.target.ei,2);assert.equal(moved.target.gi,0);assert.equal(indicator.hidden,true);
 for(const [clientY,expected] of [[101,0],[219,3]]){
  start();f.body(view).listeners.get('drop')({target:panel,clientY,preventDefault(){},stopPropagation(){}});assert.equal(moved.target.ei,expected);
 }
 assert.equal(f.nodes(f.body(view)).some(node=>/handle|age-end/.test(node.cls||'')),false);
});

test('normal Age dragging moves the heading between Dates and keeps Events in source order',()=>{
 const source='# Dawn\n## Named Year\n### Frostmoot\n- A\n### Rainwake\n- B\n\n---\n\n# Titans\n<!-- colour: #445566 -->\n\nOverview.\n\n## Named Year\n### Emberwane\n- C';
 const f=fixture(0,source),first=f.create(0),second=f.create(1);
 const dates=f.nodes(f.body(first)).filter(node=>node.cls==='aion-date-group');
 dates[1].rect={top:200,bottom:260,left:100,width:400};let saved;
 first.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};
 f.body(second).listeners.get('dragstart')({target:f.byTag(second,'h2')[0],ctrlKey:false,stopPropagation(){},dataTransfer:{setData(){}}});
 f.body(first).listeners.get('drop')({target:dates[1],clientY:201,ctrlKey:false,preventDefault(){},stopPropagation(){}});
 assert.equal(saved[0].years[0].groups.length,1);assert.deepEqual(saved[1].years[0].groups.map(group=>group.title),['Rainwake','Emberwane']);
 assert.equal(saved[1].description,'Overview.');assert.equal(saved[1].colour,'#445566');
 assert.deepEqual(saved.flatMap(age=>age.years.flatMap(year=>year.groups.flatMap(group=>group.events.map(event=>event.text)))),['A','B','C']);
});

test('Ctrl can be held at drop to move the complete Age after another Age',()=>{
 const f=fixture(),first=f.create(0),last=f.create(2);
 const section=f.byTag(last,'section')[0];section.rect={top:200,bottom:400,left:50,width:500};let saved;
 last.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};
 f.body(first).listeners.get('dragstart')({target:f.byTag(first,'h2')[0],ctrlKey:false,stopPropagation(){},dataTransfer:{setData(){}}});
 f.body(last).listeners.get('drop')({target:section,clientY:398,ctrlKey:true,preventDefault(){},stopPropagation(){}});
 assert.deepEqual(saved.map(age=>age.title),['Two','Three','One']);
 assert.equal(saved[0].starting,true);assert.equal(saved.filter(age=>age.starting).length,1);
 assert.equal(saved.at(-1).years[0].groups[0].events[0].text,'First event');
 assert.equal(f.plugin.linkedDrag,null);
});

test('moving the first Age heading alone refuses to orphan Events and does not save',()=>{
 const f=fixture(),first=f.create(0),second=f.create(1);let writes=0;second.save=()=>{writes++;};
 const target=f.nodes(f.body(second)).find(node=>node.cls==='aion-age-heading');
 f.body(first).listeners.get('dragstart')({target:f.byTag(first,'h2')[0],ctrlKey:false,stopPropagation(){},dataTransfer:{setData(){}}});
 f.body(second).listeners.get('drop')({target,clientY:0,ctrlKey:false,preventDefault(){},stopPropagation(){}});
 assert.equal(writes,0);assert.match(f.notices.at(-1),/Events without an Age/);
});

test('cancelling a linked drag clears insertion lines in the target Age',()=>{
 const f=fixture(),first=f.create(0),second=f.create(1);
 const row=f.byTag(second,'li')[0];row.rect={top:100,bottom:120,left:50,width:400};
 f.body(first).listeners.get('dragstart')({target:f.byTag(first,'li')[0].children[0],stopPropagation(){},dataTransfer:{setData(){}}});
 f.body(second).listeners.get('dragover')({target:row.children[0],clientY:119,preventDefault(){},stopPropagation(){}});
 const indicator=f.nodes(f.body(second)).find(node=>node.cls==='aion-drop-indicator');assert.equal(indicator.hidden,false);
 f.body(first).listeners.get('dragend')();assert.equal(indicator.hidden,true);assert.equal(f.plugin.linkedDrag,null);
});


test('insertion overlay lives outside note transforms and is removed when its Age unloads',()=>{
 const f=fixture(),overlayRoot=f.setOverlayRoot(),first=f.create(0);
 const indicator=first.dropIndicator;assert.equal(indicator.parentNode,overlayRoot);
 const row=f.byTag(first,'li')[0];row.rect={top:120,bottom:140,left:100,width:400};
 f.body(first).listeners.get('dragstart')({target:row.children[0],stopPropagation(){},dataTransfer:{setData(){}}});
 f.body(first).listeners.get('dragover')({target:row.children[0],clientY:139,preventDefault(){},stopPropagation(){}});
 assert.equal(indicator.styles.top,'140px');assert.equal(indicator.styles.left,'100px');
 assert.equal(indicator.styles['--aion-accent-base'],'#af0000');
 first.unload();assert.equal(overlayRoot.children.length,0);assert.equal(first.dropIndicator,null);
});

test('Date dragging previews and inserts after a Date instead of highlighting its box',()=>{
 const source='# One\n## Named Year\n### Rainwake\n- A\n### Frostmoot\n- B';const f=fixture(0,source),view=f.create(0);
 const dates=f.nodes(f.body(view)).filter(node=>node.cls==='aion-date-group');
 dates[0].rect={top:100,bottom:150,left:80,width:400};dates[1].rect={top:170,bottom:220,left:80,width:400};
 f.body(view).listeners.get('dragstart')({target:f.byTag(view,'h3')[0],stopPropagation(){},dataTransfer:{setData(){}}});
 f.body(view).listeners.get('dragover')({target:f.byTag(view,'h3')[1],clientY:215,preventDefault(){},stopPropagation(){}});
 assert.equal(view.dropIndicator.hidden,false);assert.equal(view.dropIndicator.styles.top,'220px');
 let saved;view.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};
 f.body(view).listeners.get('drop')({target:f.byTag(view,'h3')[1],clientY:215,preventDefault(){},stopPropagation(){}});
 assert.deepEqual(saved[0].years[0].groups.map(group=>group.title),['Frostmoot','Rainwake']);
 assert.equal(saved[0].years[0].groups[1].events[0].text,'A');assert.equal(view.dropIndicator.hidden,true);
});

test('Date insertion supports top and bottom panel padding and empty Years in another Age',()=>{
 const f=fixture(0,'# One\n## Year\n### First\n- A\n### Second\n- B\n\n---\n\n# Two\n## Empty Year'),first=f.create(0),second=f.create(1);
 const dates=f.nodes(f.body(first)).filter(node=>node.cls==='aion-date-group');dates[0].rect={top:100,bottom:140,left:80,width:400};dates[1].rect={top:160,bottom:200,left:80,width:400};
 const panel=f.nodes(f.body(first)).find(node=>node.cls==='aion-panel');panel.rect={top:90,bottom:220,left:60,width:440};
 const start=()=>f.body(first).listeners.get('dragstart')({target:f.byTag(first,'h3')[0],stopPropagation(){},dataTransfer:{setData(){}}});
 let target;first.move=(drag,destination)=>{target=destination;};
 for(const [clientY,gi] of [[91,0],[219,2]]){start();f.body(first).listeners.get('drop')({target:panel,clientY,preventDefault(){},stopPropagation(){}});assert.equal(target.gi,gi);}
 start();let saved;second.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};
 const empty=f.nodes(f.body(second)).find(node=>node.cls==='aion-panel');empty.rect={top:300,bottom:340,left:80,width:400};
 f.body(second).listeners.get('drop')({target:empty,clientY:330,preventDefault(){},stopPropagation(){}});
 assert.equal(saved[1].years[0].groups[0].title,'First');assert.equal(saved[1].years[0].groups[0].events[0].text,'A');
 assert.equal(saved[0].years[0].groups[0].title,'Second');
});

test('Year dragging shows before and after insertion lines and carries its Dates and Events',()=>{
 const f=fixture(0,'# One\n## Year of the Owl\n### Rainwake\n- A\n### Emberwane\n- B\n## Earlier Label\n### Frostmoot\n- C'),view=f.create(0);
 const years=f.nodes(f.body(view)).filter(node=>node.cls==='aion-year');
 years[0].rect={top:100,bottom:260,left:20,width:500};years[1].rect={top:280,bottom:400,left:20,width:500};
 const start=()=>f.body(view).listeners.get('dragstart')({target:years[0].children[0].children[0],stopPropagation(){},dataTransfer:{setData(){}}});
 start();f.body(view).listeners.get('dragover')({target:years[1],clientY:399,preventDefault(){},stopPropagation(){}});
 assert.equal(view.dropIndicator.hidden,false);assert.equal(view.dropIndicator.styles.top,'400px');
 let saved;view.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};
 f.body(view).listeners.get('drop')({target:years[1],clientY:399,preventDefault(){},stopPropagation(){}});
 assert.deepEqual(saved[0].years.map(year=>year.label),['Earlier Label','Year of the Owl']);
 assert.deepEqual(saved[0].years[1].groups.map(group=>group.title),['Rainwake','Emberwane']);
 assert.deepEqual(saved[0].years[1].groups.flatMap(group=>group.events.map(event=>event.text)),['A','B']);
 start();let target;view.move=(drag,destination)=>{target=destination;};
 f.body(view).listeners.get('drop')({target:years[1],clientY:281,preventDefault(){},stopPropagation(){}});assert.equal(target.yi,1);
});

test('a Year can be inserted into an empty linked Age after its description',()=>{
 const f=fixture(0,'# One\n## Named Year\n### Date\n- Event\n\n---\n\n# Empty\n\nOverview.'),first=f.create(0),empty=f.create(1);
 const heading=f.nodes(f.body(empty)).find(node=>node.cls==='aion-age-heading');heading.rect={top:300,bottom:320,left:20,width:500};
 const overview=f.nodes(f.body(empty)).find(node=>node.cls==='aion-age-description');overview.rect={top:330,bottom:370,left:20,width:500};
 const year=f.nodes(f.body(first)).find(node=>node.cls==='aion-year');
 f.body(first).listeners.get('dragstart')({target:year.children[0].children[0],stopPropagation(){},dataTransfer:{setData(){}}});
 f.body(empty).listeners.get('dragover')({target:heading,clientY:315,preventDefault(){},stopPropagation(){}});
 assert.equal(empty.dropIndicator.styles.top,'370px');
 let saved;empty.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};
 f.body(empty).listeners.get('drop')({target:heading,clientY:315,preventDefault(){},stopPropagation(){}});
 assert.deepEqual(saved[0].years,[]);assert.equal(saved[1].description,'Overview.');
 assert.equal(saved[1].years[0].label,'Named Year');assert.equal(saved[1].years[0].groups[0].events[0].text,'Event');
});

test('Sort Years control excludes Starting Age and manually sorts only the selected Age',async()=>{
 const f=fixture(0,'# Beginning\n<!-- starting: true -->\n## 20 CE\n### Circa\n- Start\n## 1 CE\n### Circa\n- Start two\n\n---\n\n# History\n## 5 CE\n### Zyth\n- Five\n## 20 BCE\n### Rainwake\n- Twenty\n## 1 CE\n### Circa\n- One');
 const first=f.create(0),second=f.create(1);
 assert.equal(f.nodes(f.body(first)).some(node=>(node.attributes['aria-label']||'').startsWith('Sort Years in')),false);
 const sort=f.nodes(f.body(second)).find(node=>node.attributes['aria-label']==='Sort Years in History');assert.ok(sort);
 let saved;second.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};
 await sort.listeners.get('click')();
 assert.deepEqual(saved.map(age=>age.title),['Beginning','History']);assert.deepEqual(saved[0].years.map(year=>year.label),['20 CE','1 CE']);
 assert.deepEqual(saved[1].years.map(year=>year.label),['20 BCE','1 CE','5 CE']);assert.equal(saved[0].starting,true);
 saved=null;assert.equal(await second.sortYears(0),false);assert.equal(saved,null);assert.match(f.notices.at(-1),/Starting Age is never sorted/);
});

test('Sort Dates is manual, per-Year and absent from the Starting Age',async()=>{
 const f=fixture(0,'# Beginning\n<!-- starting: true -->\n## Time\n### Rainwake 20\n- A\n### Circa\n- B\n\n---\n\n# History\n## Later\n### Rainwake 20\n- C\n### Circa\n- D\n### Rainwake\n- E\n### 2 Rainwake\n- F\n## Earlier\n### Circa\n- G');
 const first=f.create(0),second=f.create(1);f.plugin.settings.months=['Rainwake'];
 assert.equal(f.nodes(f.body(first)).some(node=>(node.attributes['aria-label']||'').startsWith('Sort Dates in')),false);
 const sort=f.nodes(f.body(second)).find(node=>node.attributes['aria-label']==='Sort Dates in Later');assert.ok(sort);let saved;
 second.save=next=>{saved=JSON.parse(JSON.stringify(next));return Promise.resolve(true);};await sort.listeners.get('click')();
 assert.deepEqual(saved[1].years[0].groups.map(group=>group.title),['Circa','Rainwake','2 Rainwake','Rainwake 20']);
 assert.deepEqual(saved[1].years.map(year=>year.label),['Later','Earlier']);assert.equal(saved[0].years[0].groups[0].title,'Rainwake 20');
 saved=null;assert.equal(await second.sortDates(0,0),false);assert.equal(saved,null);assert.match(f.notices.at(-1),/Starting Age is never sorted/);
});
