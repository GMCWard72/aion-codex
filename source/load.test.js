const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
test('packaged plugin loads with only the Obsidian API available', async () => {
  const calls = [];
  class Plugin {
    constructor() { this.app = {}; }
    async loadData() { return null; }
    addSettingTab(tab) { calls.push(['settings', tab]); }
    registerMarkdownCodeBlockProcessor(name, callback) { calls.push(['processor', name, callback]); }
    addCommand(command) { calls.push(['command', command]); }
  }
  class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
  const api = { Plugin, PluginSettingTab, MarkdownRenderChild: class {}, Modal: class {} };
  const module = { exports: {} };
  const sandbox = { module, require(name) { assert.equal(name, 'obsidian', 'Local imports must be bundled'); return api; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8'), sandbox);
  const instance = new module.exports(); await instance.onload();
  assert.equal(calls.find(c => c[0] === 'processor')[1], 'aion-timeline');
  assert.equal(calls.find(c => c[0] === 'settings')[1].plugin, instance);
  assert.ok(calls.some(c => c[0] === 'command' && c[1].id === 'insert-timeline'));
  assert.ok(!calls.some(c => c[0] === 'command' && c[1].id === 'link-and-split-ages'));
});
test('new defaults and slider ranges normalize legacy values without resetting valid preferences',()=>{
 const api={Plugin:class{},PluginSettingTab:class{},MarkdownRenderChild:class{},Modal:class{}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.normalizeForTest=normalizedSettings;',{module,require:()=>api});
 const normalize=value=>JSON.parse(JSON.stringify(module.exports.normalizeForTest(value)));
 assert.deepEqual(normalize(null),{yearWidth:150,gap:10,accent:'#af0000',panels:true,ageTextSize:140,yearTextSize:100,dateTextSize:120,eventTextSize:80,eras:['BCE','CE'],months:[]});
 assert.equal(normalize({eventTextSize:81}).eventTextSize,80);
 assert.equal(normalize({eventTextSize:93}).eventTextSize,95);
 assert.equal(normalize({eventTextSize:200}).eventTextSize,95);
 assert.equal(normalize({eventTextSize:0}).eventTextSize,75);
 assert.equal(normalize({yearWidth:260,gap:40}).yearWidth,250);
 assert.equal(normalize({yearWidth:260,gap:40}).gap,25);
 assert.equal(normalize({gap:4}).gap,5);
 const saved=normalize({yearWidth:180,gap:20,accent:'#123456',eventTextSize:85,panels:false});
 assert.deepEqual(saved,{yearWidth:180,gap:20,accent:'#123456',eventTextSize:85,panels:false,ageTextSize:140,yearTextSize:100,dateTextSize:120,eras:['BCE','CE'],months:[]});
 assert.equal(normalize({ageTextSize:148}).ageTextSize,150);
 assert.equal(normalize({yearTextSize:200}).yearTextSize,110);
 assert.equal(normalize({dateTextSize:NaN}).dateTextSize,120);
});
test('deletion confirmation does not write until confirmed, and Cancel never deletes', async()=>{
  class Element {
    constructor(){this.children=[];this.attributes={};this.listeners={};}
    createEl(tag, options={}){const child=new Element();child.tag=tag;child.text=options.text;this.children.push(child);return child;}
    createDiv(){return this.createEl('div');}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,v){this.listeners[k]=v;}
    focus(){this.focused=true;}
    empty(){this.children=[];}
  }
  class Modal {
    constructor(){this.contentEl=new Element();}
    open(){this.onOpen();}
    close(){this.closed=true;this.onClose();}
  }
  const api={Plugin:class{},PluginSettingTab:class{},MarkdownRenderChild:class{},Modal,setIcon:()=>{}};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8')+'\nmodule.exports.DeleteModalForTest=DeleteModal;', {module,require:()=>api});
  let writes=0,removed=0;
  const view={app:{},source:'original',async save(next,source){assert.equal(source,'original');writes++;return true;}};
  const Confirm=module.exports.DeleteModalForTest;
  const cancelled=new Confirm(view,'Delete Age','All associated events will be deleted.',()=>{removed++;return [];});
  cancelled.open();
  const actions=cancelled.contentEl.children[2];
  assert.equal(actions.children[0].attributes['aria-label'],'Cancel');assert.equal(actions.children[0].focused,true);
  assert.equal(writes,0);assert.equal(removed,0);
  actions.children[0].listeners.click();assert.equal(writes,0);assert.equal(removed,0);
  const confirmed=new Confirm(view,'Delete Age','All associated events will be deleted.',()=>{removed++;return [];});
  confirmed.open();await confirmed.contentEl.children[2].children[1].listeners.click();
  assert.equal(writes,1);assert.equal(removed,1);assert.equal(confirmed.closed,true);
});

