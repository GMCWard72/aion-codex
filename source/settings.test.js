const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(extra={}){
 let focused;const controls=[],saves=[],notices=[];
 class Element{
  constructor(){this.children=[];this.listeners={};this.attributes={};this.value='';const classes=new Set();this.classList={add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)};}
  createEl(tag,options={}){const child=new Element();child.tag=tag;child.text=options.text;child.cls=options.cls;child.parent=this;this.children.push(child);return child;}
  createDiv(cls){return this.createEl('div',{cls});}setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,callback){this.listeners[name]=callback;}empty(){this.children=[];}focus(){focused=this;}
  blur(){this.listeners.change?.();}contains(other){for(let node=other;node;node=node.parent)if(node===this)return true;return false;}
  getBoundingClientRect(){return {top:0,bottom:20};}
 }
 class Setting{
  constructor(){controls.push(this);}setName(name){this.name=name;return this;}setDesc(){return this;}
  addSlider(callback){const control={setLimits(){return this;},setValue(value){this.value=value;return this;},setDynamicTooltip(){return this;},onChange(callback){this.change=callback;return this;}};callback(control);this.control=control;return this;}
  addColorPicker(callback){const control={setValue(){return this;},onChange(){return this;}};callback(control);return this;}
  addToggle(callback){const control={setValue(){return this;},onChange(){return this;}};callback(control);return this;}
 }
 class PluginSettingTab{constructor(app,plugin){this.plugin=plugin;this.containerEl=new Element();}}
 const api={Plugin:class{},PluginSettingTab,Setting,MarkdownRenderChild:class{},Modal:class{},setIcon(){},Notice:class{constructor(message){notices.push(message);}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.SettingsForTest=AionSettings;module.exports.normalizeForTest=normalizedSettings;',{module,require:()=>api});
 const settings={ageTextSize:140,yearTextSize:100,dateTextSize:120,eventTextSize:80,yearWidth:150,gap:10,accent:'#af0000',panels:true,...extra};
 const plugin={settings,async saveData(value){saves.push(JSON.parse(JSON.stringify(value)));}};
 const page=new module.exports.SettingsForTest({},plugin);page.display();
 const [title,navigation,general,sorting]=page.containerEl.children;
 const addRow=sorting.children.find(child=>child.cls==='aion-calendar-add'),list=sorting.children.find(child=>child.cls==='aion-month-list');
 return {settings,plugin,page,navigation,general,sorting,controls,saves,notices,addRow,list,get focused(){return focused;},normalize:value=>JSON.parse(JSON.stringify(module.exports.normalizeForTest(value)))};
}

test('General/Sorting switching preserves settings, supports keyboard navigation and does not save data',()=>{
 const f=fixture(),before=JSON.stringify(f.settings),[generalTab,sortingTab]=f.navigation.children;
 assert.equal(f.general.hidden,false);assert.equal(f.sorting.hidden,true);
 assert.deepEqual(f.controls.slice(0,4).map(control=>control.name),['Age Text Size','Year Text Size','Date Text Size','Event Text Size']);
 sortingTab.listeners.click();assert.equal(f.general.hidden,true);assert.equal(f.sorting.hidden,false);assert.equal(sortingTab.attributes['aria-selected'],'true');
 sortingTab.listeners.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(f.general.hidden,false);assert.equal(f.focused,generalTab);
 generalTab.listeners.keydown({key:'End',preventDefault(){}});assert.equal(f.sorting.hidden,false);assert.equal(f.focused,sortingTab);
 assert.equal(JSON.stringify(f.settings),before);assert.equal(f.saves.length,0);assert.equal(f.controls.length,8);
});

test('fixed Era fields default to BCE/CE, put labels on the right and save edits or blanks',async()=>{
 const f=fixture(),rows=f.sorting.children.filter(child=>child.cls==='aion-era-row');
 assert.deepEqual(rows.map(row=>row.children[0].value),['BCE','CE']);assert.deepEqual(rows.map(row=>row.children[1].text),['Negative Years.','Positive Years.']);
 assert.ok(rows.every(row=>!row.draggable&&!row.children[0].draggable));
 rows[0].children[0].value=' Before ';await rows[0].children[0].listeners.change();
 assert.deepEqual(f.saves.at(-1).eras,['Before','CE']);
 rows[1].children[0].value='';await rows[1].children[0].listeners.change();assert.deepEqual(f.saves.at(-1).eras,['Before','']);
 rows[1].children[0].value='before';await rows[1].children[0].listeners.change();assert.equal(f.saves.length,2);assert.equal(rows[1].children[0].value,'');assert.match(f.notices.at(-1),/distinct/);
});

test('Month plus and Enter add entries; edits and deletion persist and duplicate or empty names are refused',async()=>{
 const f=fixture(),[field,plus]=f.addRow.children;
 field.value=' Rainwake ';await plus.listeners.click();assert.deepEqual(f.saves.at(-1).months,['Rainwake']);assert.equal(field.value,'');assert.equal(f.focused,field);
 field.value='Frostmoot';field.listeners.keydown({key:'Enter',preventDefault(){}});await f.page.sortingSave;assert.deepEqual(f.saves.at(-1).months,['Rainwake','Frostmoot']);
 field.value='rainwake';await plus.listeners.click();assert.equal(f.saves.length,2);assert.match(f.notices.at(-1),/already/);
 field.value=' ';await plus.listeners.click();assert.equal(f.saves.length,2);
 const edit=f.list.children[0].children[2];edit.value='Emberwane';await edit.listeners.change();assert.deepEqual(f.saves.at(-1).months,['Emberwane','Frostmoot']);
 edit.value='frostmoot';await edit.listeners.change();assert.equal(edit.value,'Emberwane');assert.equal(f.saves.length,3);
 await f.list.children[1].children[3].listeners.click();assert.deepEqual(f.saves.at(-1).months,['Emberwane']);
});

test('Month drag order persists and rejects a drag made stale by an intervening edit',async()=>{
 const f=fixture({months:['One','Two','Three']}),event={clientY:19,preventDefault(){},stopPropagation(){},dataTransfer:{setData(){}}};
 f.list.children[0].children[0].listeners.dragstart(event);await f.list.children[2].listeners.drop(event);
 assert.deepEqual(f.saves.at(-1).months,['Two','Three','One']);
 f.list.children[0].children[0].listeners.dragstart(event);
 f.list.children[1].children[2].value='Edited';await f.list.children[1].children[2].listeners.change();
 const writes=f.saves.length;await f.list.children[2].listeners.drop(event);assert.equal(f.saves.length,writes);assert.match(f.notices.at(-1),/list changed/);
 assert.deepEqual(f.saves.at(-1).months,['Two','Edited','One']);
});

test('calendar normalization preserves blank Era slots and Month order without sharing mutable defaults',()=>{
 const f=fixture(),value=f.normalize({eras:['',' AD '],months:[' Rainwake ','rainwake','Frostmoot',null,4,'','bad\nline']});
 assert.deepEqual(value.eras,['','AD']);assert.deepEqual(value.months,['Rainwake','Frostmoot']);
 assert.deepEqual(f.normalize({eras:'bad'}).eras,['BCE','CE']);
 assert.deepEqual(f.normalize({eras:[]}).eras,['','']);
 assert.deepEqual(f.normalize({eras:['BE']}).eras,['BE','']);
 value.eras[0]='Changed';assert.deepEqual(f.normalize(null).eras,['BCE','CE']);
});
