const {test}=require('node:test'),assert=require('node:assert/strict');
const {parse,serialize,linkAndSplit,linkedChronicle,writeLinkedChronicle,setStartingAge,orderStartingAge,linkInfo,blocks,deleteAge}=require('./model');
const raw='# Dawn\n\nOverview.\n\n## Before time\n### Circa\n- A\n\n---\n\n# Titans\n<!-- colour: #112233 -->\n## Named Year\n### Rainwake\n- B\n\n---\n\n# Future\n## Unknown\n### Prophecy\n- C';
const note=()=>linkAndSplit('Before\n```aion-timeline\n'+raw+'\n```\nAfter');
test('Starting Age selection moves the whole Age first and round trips in the model',()=>{
 const ages=parse(raw),next=setStartingAge(ages,1);
 assert.deepEqual(next.map(age=>age.title),['Titans','Dawn','Future']);assert.equal(next[0].starting,true);
 assert.equal(next[0].colour,'#112233');assert.equal(next[0].years[0].groups[0].events[0].text,'B');
 assert.equal(next.filter(age=>age.starting).length,1);assert.deepEqual(parse(serialize(next)),next);assert.equal(ages.some(age=>age.starting),false);
 assert.deepEqual(setStartingAge(next,2).map(age=>age.title),['Future','Titans','Dawn']);
});
test('linked writes reserve the starting marker, support transferring and clearing it, and preserve surrounding text',()=>{
 let content=note(),state=linkedChronicle(content,'chronicle');
 content=writeLinkedChronicle(content,'chronicle',state.snapshot,setStartingAge(state.ages,1));state=linkedChronicle(content,'chronicle');
 assert.equal(linkInfo(state.members[0].source).part,'starting');assert.equal(state.ages[0].title,'Titans');
 assert.equal(content.includes('<!-- starting: true -->'),false);assert.ok(content.startsWith('Before\n'));assert.ok(content.endsWith('After'));
 content=writeLinkedChronicle(content,'chronicle',state.snapshot,setStartingAge(state.ages,2));state=linkedChronicle(content,'chronicle');
 assert.equal(state.ages[0].title,'Future');assert.equal(state.members.filter(b=>linkInfo(b.source).part==='starting').length,1);
 const cleared=state.ages.map(age=>{const copy={...age};delete copy.starting;return copy;});
 content=writeLinkedChronicle(content,'chronicle',state.snapshot,cleared);state=linkedChronicle(content,'chronicle');
 assert.equal(state.ages.some(age=>age.starting),false);assert.equal(state.members.some(b=>linkInfo(b.source).part==='starting'),false);
 assert.equal(new Set(state.members.map(b=>linkInfo(b.source).part)).size,3);
});
test('duplicate Starting Ages are refused and deleting the Starting Age transfers it to the new first Age',()=>{
 const ages=setStartingAge(parse(raw),0),invalid=JSON.parse(JSON.stringify(ages));invalid[1].starting=true;
 assert.throws(()=>orderStartingAge(invalid),/Only one Starting Age/);
 const duplicate='```aion-timeline\n<!-- aion: main/starting -->\n# One\n```\n```aion-timeline\n<!-- aion: main/starting -->\n# Two\n```\n';
 assert.throws(()=>linkedChronicle(duplicate,'main'),/Only one Starting Age/);
 const next=deleteAge(ages,0);assert.equal(next[0].title,'Titans');assert.equal(next[0].starting,true);
});
test('template insertion preserves the Starting Age marker while generating a fresh Chronicle identifier',()=>{
 const m=require('./model');let content=note(),state=linkedChronicle(content,'chronicle');content=writeLinkedChronicle(content,'chronicle',state.snapshot,setStartingAge(state.ages,0));
 const inserted=m.prepareTemplate(content,'','fresh');state=linkedChronicle(inserted,'fresh');assert.equal(state.ages[0].starting,true);assert.equal(linkInfo(state.members[0].source).part,'starting');
});

test('Age dialog checkbox selects the Starting Age without losing its contents',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const settings=[];
 class Element{
  constructor(){this.children=[];this.listeners={};this.attributes={};}
  createEl(tag,options={}){const child=new Element();child.tag=tag;child.type=options.type;child.cls=options.cls;this.children.push(child);return child;}
  createDiv(cls){return this.createEl('div',{cls});}setAttribute(key,value){this.attributes[key]=value;}addEventListener(name,callback){this.listeners[name]=callback;}addClass(){}empty(){this.children=[];}
 }
 class Setting{
  constructor(parent){this.settingEl=parent.createDiv('setting');this.controlEl=this.settingEl.createDiv('control');settings.push(this);}setName(name){this.name=name;return this;}setDesc(){return this;}
  addText(fn){fn({setValue(){return this;},onChange(){return this;}});return this;}
  addTextArea(fn){fn({inputEl:{},setValue(){return this;},onChange(){return this;}});return this;}
  addColorPicker(fn){fn({setValue(){return this;},onChange(){return this;}});return this;}
 }
 class Modal{constructor(){this.contentEl=new Element();}close(){this.onClose();}}
 const api={Plugin:class{},PluginSettingTab:class{},MarkdownRenderChild:class{},Modal,Setting,setIcon(){}};const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.TestAgeModal=AgeModal;',{module,require:()=>api});
 let saved;const view={app:{},plugin:{settings:{accent:'#af0000'}},ages:parse(raw),source:raw,async save(next,source,options){saved={next:JSON.parse(JSON.stringify(next)),source,options};return true;}};
 const dialog=new module.exports.TestAgeModal(view,1);dialog.onOpen();const checkbox=settings.find(setting=>setting.name==='Starting Age').controlEl.children[0];
 assert.equal(checkbox.type,'checkbox');assert.equal(checkbox.checked,false);checkbox.checked=true;checkbox.listeners.change();
 const actions=dialog.contentEl.children.find(child=>child.cls==='aion-dialog-actions');await actions.children.find(child=>child.attributes['aria-label']==='Save Age').listeners.click();
 assert.equal(saved.next[0].title,'Titans');assert.equal(saved.next[0].starting,true);assert.equal(saved.next[0].years[0].groups[0].events[0].text,'B');assert.equal(saved.options.splitAges,true);
 view.ages=saved.next;view.source=serialize(view.ages);const previous=settings.length;
 const edit=new module.exports.TestAgeModal(view,0);edit.onOpen();
 const checked=settings.slice(previous).find(setting=>setting.name==='Starting Age').controlEl.children[0];assert.equal(checked.checked,true);
 checked.checked=false;checked.listeners.change();
 const editActions=edit.contentEl.children.find(child=>child.cls==='aion-dialog-actions');await editActions.children.find(child=>child.attributes['aria-label']==='Save Age').listeners.click();
 assert.equal(saved.next.some(age=>age.starting),false);assert.equal(saved.next[0].title,'Titans');
});
