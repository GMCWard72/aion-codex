const BUNDLED_TEMPLATE = require('./template.json');
const { Plugin, Component, MarkdownRenderChild, MarkdownRenderer, Modal, Setting, PluginSettingTab, Notice, TFile, setIcon } = require('obsidian');
const { parse, serialize, ordered, locateBlock, saveEvent, deleteAge, deleteEvent, linkInfo, linkedChronicle, linkedLayout, matchingEventCount, writeLinkedChronicle, splitAddedAge, prepareTemplate, setStartingAge, orderStartingAge } = require('./model');
const { ViewportRenderer, MarkdownPool } = require('./rendering');
const { moveTimelineItem, nearestEdge } = require('./drag');
const { sortAgeYears, sortYearDates } = require('./sorting');
const TEXT_SIZES = [
  ['ageTextSize','Age Text Size',100,150,140],
  ['yearTextSize','Year Text Size',90,110,100],
  ['dateTextSize','Date Text Size',100,120,120],
  ['eventTextSize','Event Text Size',75,95,80]
];
const DEFAULTS = { yearWidth: 150, gap: 10, accent: '#af0000', panels: true, ageTextSize:140, yearTextSize:100, dateTextSize:120, eventTextSize: 80, eras:['BCE','CE'], months:[] };
function normalizedSettings(saved){
  const settings={...DEFAULTS,...saved};
  const number=(value,fallback,min,max,step)=>Number.isFinite(value)?Math.max(min,Math.min(max,min+Math.round((value-min)/step)*step)):fallback;
  settings.yearWidth=number(settings.yearWidth,150,100,250,2);
  settings.gap=number(settings.gap,10,5,25,1);
  for(const [key,label,min,max,fallback] of TEXT_SIZES)settings[key]=number(settings[key],fallback,min,max,5);
  settings.eras=DEFAULTS.eras.map((fallback,index)=>!Array.isArray(saved?.eras)?fallback:typeof saved.eras[index]==='string'&&!/[\r\n]/.test(saved.eras[index])?saved.eras[index].trim():'');
  const seenMonths=new Set();
  settings.months=(Array.isArray(saved?.months)?saved.months:[]).filter(value=>{
    if(typeof value!=='string'||!safeInline(value))return false;
    const key=value.trim().replace(/\s+/g,' ').toLowerCase();if(seenMonths.has(key))return false;seenMonths.add(key);return true;
  }).map(value=>value.trim());
  return settings;
}
function button(parent, text, action, cls = '') {
  const b = parent.createEl('button', { text, cls }); b.type = 'button'; b.addEventListener('click', action); return b;
}
function safeInline(value) { return value.trim() && !/[\r\n]/.test(value); }
function owningMarkdownView(app,el,sourcePath){
  const leaves=app.workspace?.getLeavesOfType?.('markdown')||[];
  const containing=leaves.find(leaf=>leaf.view?.containerEl?.contains(el));
  if(containing)return containing.view;
  const matching=leaves.filter(leaf=>leaf.view?.file?.path===sourcePath);
  return matching.length===1?matching[0].view:null;
}
function fullSourceView(view){
  if(view?.getMode?.()!=='source')return false;
  const source=view.getState?.()?.source;
  if(typeof source==='boolean')return source;
  return !view.containerEl?.querySelector?.('.markdown-source-view.is-live-preview');
}
function sourceOnlyContext(app,el,sourcePath){
  return fullSourceView(owningMarkdownView(app,el,sourcePath));
}
function eventMarkdown(text){return text.replace(/!\[\[([^\]]+)\]\]/g,'[Embed omitted]').replace(/!\[[^\]]*\]\([^)]*\)/g,'[Image omitted]');}
function iconButton(parent, icon, label, action, cls = '') {
  const b = button(parent, '', action, 'aion-icon ' + cls);
  setIcon(b, icon); b.setAttribute('aria-label', label); return b;
}
class DeleteModal extends Modal {
  constructor(view, title, message, makeNext, afterDelete = () => {}) {
    super(view.app); this.view=view; this.title=title; this.message=message; this.makeNext=makeNext; this.afterDelete=afterDelete; this.source=view.source;
  }
  onOpen() {
    this.contentEl.createEl('h2',{text:this.title});
    this.contentEl.createEl('p',{text:this.message});
    const actions=this.contentEl.createDiv('aion-dialog-actions');
    const cancel=iconButton(actions,'x','Cancel',()=>this.close());
    iconButton(actions,'trash-2',this.title,async()=>{
      try { if(await this.view.save(this.makeNext(),this.source)){this.close();this.afterDelete();} }
      catch(e){new Notice('Aion Codex: '+e.message);}
    },'mod-warning');
    cancel.focus();
  }
  onClose(){this.contentEl.empty();}
}
function confirmAgeDelete(view, ai, afterDelete) {
  const age=view.ages[ai], ages=view.ages;
  const count=age.years.reduce((n,y)=>n+y.groups.reduce((m,g)=>m+g.events.length,0),0);
  new DeleteModal(view,'Delete Age',`Delete “${age.title}”? This also deletes ALL of its associated Years, Date groups and ${count} Event${count===1?'':'s'}. This cannot be undone within Aion Codex.`,()=>deleteAge(ages,ai),afterDelete).open();
}
function confirmEventDelete(view, context, afterDelete) {
  const ages=view.ages;
  new DeleteModal(view,'Delete Event','Delete this Event? Its Date and Year sections will also be removed if they become empty. This cannot be undone within Aion Codex.',()=>deleteEvent(ages,context),afterDelete).open();
}
class AgeModal extends Modal {
  constructor(view, ai = null){super(view.app);this.view=view;this.ai=ai;this.source=view.source;}
  onOpen(){
    const age=this.ai===null?null:this.view.ages[this.ai];
    let title=age?.title||'', colour=age?.colour||'', description=age?.description||'', starting=!!age?.starting, picker;
    const el=this.contentEl;el.createEl('h2',{text:age?'Edit Age':'Add Age'});
    new Setting(el).setName('Age Title').addText(t=>t.setValue(title).onChange(v=>title=v));
    const startingSetting=new Setting(el).setName('Starting Age').setDesc('Move this Age and its contents to the top of this Chronicle. Only one Age can be selected.');
    const startingBox=startingSetting.controlEl.createEl('input',{type:'checkbox'});startingBox.checked=starting;startingBox.setAttribute('aria-label','Starting Age');
    startingBox.addEventListener('change',()=>{starting=startingBox.checked;});
    const descriptionSetting=new Setting(el).setName('Age Description').setDesc('Optional overview for the Age.').addTextArea(t=>{t.inputEl.rows=7;t.setValue(description).onChange(v=>description=v);});
    descriptionSetting.settingEl.addClass('aion-wide-editor');
    const colourSetting=new Setting(el).setName('Age Timeline Colour').setDesc('Base colour for this Age’s dots and Event borders. Its shade adapts to Light and Dark modes. Use Default follows settings.');
    colourSetting.addColorPicker(c=>{picker=c;c.setValue(colour||this.view.plugin.settings.accent).onChange(v=>colour=v);});
    iconButton(colourSetting.controlEl,'rotate-ccw','Use Default',()=>{picker.setValue(this.view.plugin.settings.accent);colour='';});
    const actions=el.createDiv('aion-dialog-actions');
    if(age)iconButton(actions,'trash-2','Delete Age',()=>{
      if(this.view.source!==this.source)return new Notice('The timeline changed. Close and reopen this dialog.');
      confirmAgeDelete(this.view,this.ai,()=>this.close());
    },'mod-warning');
    iconButton(actions,'x','Cancel',()=>this.close());
    iconButton(actions,'check',age?'Save Age':'Add Age',async()=>{
      if(!safeInline(title))return new Notice('Enter a single-line Age Title.');
      if (/^ {0,3}(?:#{1,6}\s|---\s*$|`{3,}|~{3,}|<!--)/m.test(description))return new Notice('Use paragraphs, lists and links in the description. Timeline headings, separators, metadata comments and code fences are reserved.');
      let next=JSON.parse(JSON.stringify(this.view.ages));
      if(age){next[this.ai].title=title.trim();next[this.ai].colour=colour;}
      else next.push({title:title.trim(),colour,position:'normal',years:[]});
      const edited=age?next[this.ai]:next[next.length-1];
      if(description.trim())edited.description=description.trim();else delete edited.description;
      if(starting)next=setStartingAge(next,age?this.ai:next.length-1);else delete edited.starting;
      if(await this.view.save(next,this.source,{splitAges:!age||starting}))this.close();
    },'mod-cta');
  }
  onClose(){this.contentEl.empty();}
}
class EntryModal extends Modal {
  constructor(view, context = {}) { super(view.app); this.view = view; this.context = context; this.source=view.source; }
  onOpen() {
    const { contentEl: el } = this; el.createEl('h2', { text: this.context.event ? 'Edit Event' : 'Add Event' });
    const ages = this.view.ages; const ctx = this.context;
    if(!ages.length){el.createEl('p',{text:'Create an Age before adding Events.'});iconButton(el,'folder-plus','Add Age',()=>{this.close();new AgeModal(this.view).open();});return;}
    let ai = ctx.ai ?? 0;
    let yearLabel = ctx.year?.label || '', date = ctx.group?.title || 'Circa', text = ctx.event?.text || '';
    new Setting(el).setName('Age').addDropdown(d => {
      ages.forEach((a, i) => d.addOption(String(i), a.title));d.setValue(String(ai));
      d.onChange(v => ai=Number(v));
    });
    new Setting(el).setName('Year/Time Label').setDesc('Any text, including named Years and eras. Exact matching labels share a panel.').addText(t => t.setValue(yearLabel).onChange(v => yearLabel = v));
    new Setting(el).setName('Circa/Date Label').addText(t => t.setValue(date).onChange(v => date = v));
    const eventSetting=new Setting(el).setName('Event').setDesc('Event description.').addTextArea(t => { t.inputEl.rows = 8; t.setValue(text).onChange(v => text = v); });
    eventSetting.settingEl.addClass('aion-wide-editor');
    const actions=el.createDiv('aion-dialog-actions');
    if(ctx.event)iconButton(actions,'trash-2','Delete Event',()=>{
      if(this.view.source!==this.source)return new Notice('The timeline changed. Close and reopen this dialog.');
      confirmEventDelete(this.view,ctx,()=>this.close());
    },'mod-warning');
    iconButton(actions,'x','Cancel',()=>this.close());
    iconButton(actions,'check',ctx.event?'Save Event':'Add Event', async () => {
      if (![yearLabel, date].every(safeInline) || !text.trim() || !ages[ai]) return new Notice('Choose an Age, enter single-line labels and some Event text.');
      let next;
      try { next = saveEvent(ages, ctx, {ai, yearLabel, date, text}); }
      catch (e) { return new Notice('Aion Codex: ' + e.message); }
      if (await this.view.save(next,this.source)) this.close();
    }, 'mod-cta');
  }
  onClose() { this.contentEl.empty(); }
}
class TimelineView extends MarkdownRenderChild {
  constructor(plugin, source, el, ctx) { super(el); this.plugin=plugin; this.app=plugin.app; this.source=source.replace(/\r\n/g,'\n').replace(/\n$/,''); this.ctx=ctx; this.query=''; this.drag=null; this.busy=false; }
  applyTextSizes(){
    for(const [key,label,min,max,fallback] of TEXT_SIZES){
      const part=key.replace('TextSize','');
      this.containerEl.style.setProperty('--aion-'+part+'-size',((this.plugin.settings[key]??fallback)/100)+'em');
    }
  }
  onload() {
    this.disposed=false;
    (this.plugin.timelineViews||(this.plugin.timelineViews=new Set())).add(this);
    this.claimMarkdownPool();this.watchPreviewVisibility();this.render();
  }
  previewPane(){return this.containerEl.closest?.('.markdown-preview-view')||null;}
  owningMarkdownView(){
    return owningMarkdownView(this.app,this.containerEl,this.ctx.sourcePath);
  }
  isSourceMode(){
    return sourceOnlyContext(this.app,this.containerEl,this.ctx.sourcePath);
  }
  isPreviewHidden(){
    if(this.isSourceMode())return true;
    const pane=this.previewPane();
    return !!(pane&&typeof pane.isShown==='function'&&!pane.isShown());
  }
  pausePreview(){
    this.previewPaused=true;
    this.refreshContent=null;
    // A hidden preview must not retain live Markdown components: links and
    // embeds can subscribe to vault/metadata events even without visible DOM.
    const win=this.containerEl.ownerDocument?.defaultView;
    if(this.refreshTimer!==undefined){win?.clearTimeout(this.refreshTimer);this.refreshTimer=undefined;}
    for(const offer of [...(this.plugin.renderHandoffs||[])])if(offer.view===this)this.cancelMarkdownOffer(offer);
    if(this.shellScope){this.removeChild(this.shellScope);this.shellScope=null;}
    this.contentScope=null;
    if(this.markdownPool){this.markdownPool.dispose();this.markdownPool=null;}
  }
  watchPreviewVisibility(){
    const pane=this.previewPane(),win=this.containerEl.ownerDocument?.defaultView;
    if(!win)return;
    const sync=()=>{
      if(this.disposed)return;
      if(this.isPreviewHidden())this.pausePreview();
      else if(this.previewPaused){this.previewPaused=false;this.render();}
    };
    const workspace=this.app.workspace;
    let frame;
    const modeChanged=()=>{
      sync();
      if(win.requestAnimationFrame){
        if(frame!==undefined)win.cancelAnimationFrame(frame);
        frame=win.requestAnimationFrame(()=>{frame=undefined;sync();});
      }
    };
    if(workspace?.on&&this.registerEvent)this.registerEvent(workspace.on('layout-change',modeChanged));
    if(win.requestAnimationFrame)this.register(()=>{if(frame!==undefined)win.cancelAnimationFrame(frame);});
    // Full Source Mode needs only a mode-change subscription, not DOM observers
    // or geometry reads while CodeMirror is redrawing its editing surface.
    if(this.isSourceMode()||!pane){sync();return;}
    if(win.IntersectionObserver){
      const observer=new win.IntersectionObserver(sync);observer.observe(pane);this.register(()=>observer.disconnect());
    }
    if(win.MutationObserver){
      const observer=new win.MutationObserver(sync);
      for(let el=pane;el;el=el.parentElement){
        observer.observe(el,{attributes:true,attributeFilter:['style','class','hidden']});
        if(el.classList?.contains('workspace-leaf'))break;
      }
      this.register(()=>observer.disconnect());
    }
    sync();
  }
  onunload() {
    this.disposed=true;
    this.refreshContent=null;
    this.plugin.timelineViews?.delete(this);
    const win=this.containerEl.ownerDocument?.defaultView;
    if(this.refreshTimer!==undefined)win?.clearTimeout(this.refreshTimer);
    if(this.markdownPool&&![...(this.plugin.renderHandoffs||[])].some(offer=>offer.view===this)){
      this.markdownPool.dispose();this.markdownPool=null;
    }
  }
  ensureMarkdownPool(){
    if(this.markdownPool)return this.markdownPool;
    const owner=this.plugin.addChild?this.plugin:this;
    const app=this.app,sourcePath=this.ctx.sourcePath;
    this.markdownPool=new MarkdownPool(()=>owner.addChild(new Component()),scope=>owner.removeChild(scope),
      (markdown,target,scope)=>MarkdownRenderer.render(app,markdown,target,sourcePath,scope),{
        isUnresolved:target=>{const path=target.split('#')[0];return path?!(app.metadataCache?.getFirstLinkpathDest(path,sourcePath)):false;},
        openInternalLink:(target,event)=>app.workspace.openLinkText(target,sourcePath,event.ctrlKey||event.metaKey)
      });
    return this.markdownPool;
  }
  offerMarkdownPool(output){
    const root=this.containerEl.closest?.('.workspace-leaf');
    const win=this.containerEl.ownerDocument?.defaultView;
    if(!root||!win?.setTimeout||!this.markdownPool)return null;
    const offers=this.plugin.renderHandoffs||(this.plugin.renderHandoffs=new Set());
    for(const old of [...offers])if(old.view===this)this.cancelMarkdownOffer(old);
    let line;try{line=this.ctx.getSectionInfo(this.containerEl)?.lineStart;}catch{}
    const offer={view:this,pool:this.markdownPool,root,path:this.ctx.sourcePath,key:output,line,win,part:this.linked?.part};
    offers.add(offer);offer.timer=win.setTimeout(()=>this.cancelMarkdownOffer(offer),2000);
    return offer;
  }
  cancelMarkdownOffer(offer){
    if(!offer||!this.plugin.renderHandoffs?.delete(offer))return;
    offer.win.clearTimeout(offer.timer);
    if(offer.view.disposed&&offer.view.markdownPool===offer.pool){offer.pool.dispose();offer.view.markdownPool=null;}
  }
  claimMarkdownPool(){
    const root=this.containerEl.closest?.('.workspace-leaf'),offers=this.plugin.renderHandoffs;
    if(!root||!offers?.size)return;
    let line;try{line=this.ctx.getSectionInfo(this.containerEl)?.lineStart;}catch{}
    let key;try{key=serialize(parse(this.source));}catch{return;}
    const matches=[...offers].filter(o=>o.root===root&&o.path===this.ctx.sourcePath&&o.key===key&&o.part===this.linked?.part&&
      (!Number.isInteger(line)||!Number.isInteger(o.line)||o.line===line));
    if(matches.length!==1)return;
    const offer=matches[0];offers.delete(offer);offer.win.clearTimeout(offer.timer);
    offer.view.markdownPool=null;this.markdownPool=offer.pool;
  }
  scheduleRefresh() {
    const win=this.containerEl.ownerDocument?.defaultView;
    if(!win?.setTimeout){this.render();return;}
    // Obsidian normally replaces this child after the note changes. Only rebuild
    // ourselves if it survives that refresh; unloading cancels the fallback.
    this.containerEl.inert=true;
    if(this.refreshTimer!==undefined)win.clearTimeout(this.refreshTimer);
    this.refreshTimer=win.setTimeout(()=>{
      this.refreshTimer=undefined;
      if(!this.disposed&&this.containerEl.isConnected)this.render();
    },100);
  }
  async save(next, expectedSource = this.source, options = {}) {
    if (this.busy) return false; this.busy=true;
    let offer;
    try {
      if(this.source!==expectedSource)throw new Error('The timeline changed while this dialog was open. Close and reopen it before saving.');
      next=orderStartingAge(next);
      const output=serialize(next);
      if (/^ {0,3}(?:`{3,}|~{3,})/m.test(output)) throw new Error('Fenced code inside Events is not supported in this version.');
      parse(output);
      const file=this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
      if (!(file instanceof TFile)) throw new Error('The source note is unavailable.');
      let section;
      try { section=this.ctx.getSectionInfo(this.containerEl); } catch { section=null; }
      const promote=(options.splitAges||next.some(age=>age.starting))&&!this.linked;
      offer=promote?null:this.offerMarkdownPool(output);
      let promoted;
      await this.app.vault.process(file, content => {
        if(this.linked){
          const updated=writeLinkedChronicle(content,this.linked.id,this.linked.snapshot,next);
          this.savedLinkedState=linkedChronicle(updated,this.linked.id);
          return updated;
        }
        if(promote){
          promoted=splitAddedAge(content,this.source,section?.lineStart,next);
          return promoted.content;
        }
        const target=locateBlock(content,this.source,section?.lineStart);
        const newline=content.includes('\r\n')?'\r\n':'\n';
        return content.slice(0,target.start)+output.replace(/\n/g,newline)+content.slice(target.end);
      });
      if(promoted){
        const group=this.plugin.linkedGroupFor?.(this.owningMarkdownView(),this.containerEl,this.ctx,promoted.id)||{query:this.query};
        this.linked={id:promoted.id,part:promoted.part,group,snapshot:promoted.state.snapshot,...linkedLayout(promoted.state,promoted.part)};
        this.savedLinkedState=promoted.state;
      }
      if(this.linked){
        const member=this.savedLinkedState.members[this.linked.slot];
        if(member)this.linked.part=linkInfo(member.source).part;
        const layout=linkedLayout(this.savedLinkedState,this.linked.part);
        Object.assign(this.linked,layout||{from:0,count:0,first:false,last:false},{snapshot:this.savedLinkedState.snapshot});
      }
      this.source=output.replace(/\n$/,''); this.ages=next;
      if(this.linked)this.plugin.syncLinkedViews?.(this.linked.group,this.savedLinkedState,this,true);
      if(!offer||this.markdownPool===offer.pool)this.scheduleRefresh();
      return true;
    } catch(e) { this.cancelMarkdownOffer(offer);new Notice('Aion Codex: '+e.message); return false; }
    finally { this.busy=false; }
  }
  handle(el, kind, refs) {
    el.draggable=true; el.setAttribute('aria-label','Drag to move '+({age:'Age',year:'Year',group:'Date',event:'Event'}[kind]||kind));
    this.dragSources.set(el,{kind,...refs});
  }
  drop(el, accepts, action, placement=null) {
    const record={accepts,action,placement,el};
    this.dropTargets.set(el,record);
    if(placement)this.dropPositions.push(record);
    return record;
  }
  insertionDrop(d,record,y){
    const p=record.placement;if(!p)return null;
    if(p.kind==='body'&&!Number.isFinite(y))return null;
    const rect=el=>el.getBoundingClientRect?.()||{top:0,bottom:0,left:0,width:0};
    const bounds=entry=>{const box=rect(entry.el);return entry.afterEl?{top:box.top,bottom:rect(entry.afterEl).bottom,left:box.left,width:box.width}:box;};
    const position=(entry,edge)=>({entry,edge,rect:bounds(entry)});
    const nearest=entries=>nearestEdge(entries.map(entry=>({entry,rect:bounds(entry)})),y);
    if(d.kind==='year'){
      const years=p.kind==='year'?[record]:this.dropPositions.filter(entry=>entry.placement.kind==='year'&&(p.ai===undefined||entry.placement.ai===p.ai));
      const selected=nearest(years);
      if(selected){const {kind,...target}=selected.entry.placement;return {...selected,target:{...target,yi:target.yi+(selected.edge==='after'?1:0)}};}
      const headings=this.dropPositions.filter(entry=>entry.placement.kind==='ageHeader'&&(p.ai===undefined||entry.placement.ai===p.ai));
      const empty=nearest(headings);
      if(empty)return {...position(empty.entry,'after'),target:{ai:empty.entry.placement.ai,yi:0}};
      return null;
    }
    if(d.kind==='group'){
      const groups=p.kind==='group'?[record]:this.dropPositions.filter(entry=>entry.placement.kind==='group'&&(p.ai===undefined||entry.placement.ai===p.ai)&&(p.yi===undefined||entry.placement.yi===p.yi));
      const selected=nearest(groups);
      if(selected){const {kind,...target}=selected.entry.placement;return {...selected,target:{...target,gi:target.gi+(selected.edge==='after'?1:0)}};}
      const panels=this.dropPositions.filter(entry=>entry.placement.kind==='panel'&&(p.ai===undefined||entry.placement.ai===p.ai)&&(p.yi===undefined||entry.placement.yi===p.yi));
      const empty=nearest(panels);
      if(empty){const {kind,...target}=empty.entry.placement;return {...empty,target:{...target,gi:0}};}
      return null;
    }
    if(d.kind==='event'){
      let rows=p.kind==='event'?[record]:this.dropPositions.filter(entry=>entry.placement.kind==='event');
      if(p.ai!==undefined)rows=rows.filter(entry=>entry.placement.ai===p.ai);
      if(p.yi!==undefined)rows=rows.filter(entry=>entry.placement.yi===p.yi);
      if(p.gi!==undefined)rows=rows.filter(entry=>entry.placement.gi===p.gi);
      if(p.kind==='event')rows=[record];
      const selected=nearest(rows);
      if(selected){const {kind,...target}=selected.entry.placement;return {...selected,target:{...target,ei:target.ei+(selected.edge==='after'?1:0)}};}
      let groups=this.dropPositions.filter(entry=>entry.placement.kind==='group'&&(p.ai===undefined||entry.placement.ai===p.ai)&&(p.yi===undefined||entry.placement.yi===p.yi)&&(p.gi===undefined||entry.placement.gi===p.gi));
      const empty=nearest(groups);
      if(empty){const {kind,...target}=empty.entry.placement;return {...empty,target:{...target,ei:0}};}
      const panels=this.dropPositions.filter(entry=>entry.placement.kind==='panel'&&(p.ai===undefined||entry.placement.ai===p.ai)&&(p.yi===undefined||entry.placement.yi===p.yi));
      const panel=nearest(panels);
      if(panel){const {kind,...target}=panel.entry.placement;return {...panel,target};}
      return null;
    }
    if(d.kind!=='age')return null;
    if(d.wholeAge){
      if(p.kind==='ageHeader')return {...position(record,'before'),target:{kind:'age',ai:p.ai,edge:'before'}};
      const sections=this.dropPositions.filter(entry=>entry.placement.kind==='age'&&(p.ai===undefined||entry.placement.ai===p.ai));
      const selected=nearest(sections);
      if(!selected)return null;
      const boundary=selected.edge==='after'?selected.rect.bottom:selected.rect.top;
      if(Number.isFinite(y)&&Math.abs(y-boundary)>24)return null;
      return {...selected,target:{kind:'age',ai:selected.entry.placement.ai,edge:selected.edge}};
    }
    const eligible=entry=>['ageHeader','group','year'].includes(entry.placement.kind);
    let candidates=this.dropPositions.filter(entry=>eligible(entry)&&(p.ai===undefined||entry.placement.ai===p.ai));
    if(p.kind==='panel')candidates=candidates.filter(entry=>entry.placement.yi===p.yi);
    if(eligible(record))candidates=[record];
    const selected=nearest(candidates);
    if(!selected)return null;
    return {...selected,target:{...selected.entry.placement,edge:selected.edge}};
  }
  currentDrag(){
    if(!this.linked)return this.drag;
    const operation=this.plugin.linkedDrag;
    return operation?.group===this.linked.group&&operation.snapshot===this.linked.snapshot?operation.drag:null;
  }
  finishDrag(){
    if(this.linked&&this.plugin.linkedDrag?.group===this.linked.group){
      this.plugin.linkedDrag=null;
      for(const peer of this.plugin.timelineViews||[])if(peer.linked?.group===this.linked.group){
        peer.drag=null;peer.clearInsertion?.();peer.containerEl.removeClass('aion-dragging-age');
      }
    }
    this.drag=null;this.clearInsertion?.();this.containerEl.removeClass('aion-dragging-age');
  }
  shareSearch(){
    if(!this.linked){this.refreshContent?.();return;}
    this.linked.group.query=this.query;
    for(const peer of this.plugin.timelineViews||[])if(peer.linked?.group===this.linked.group&&!peer.disposed){
      peer.query=this.query;peer.refreshContent?.();
    }
  }
  bindInteractions(body,scope,eventRows){
    const find=(map,target,accept=()=>true)=>{
      for(let el=target;el;el=el.parentElement||el.parentNode){
        const record=map.get(el);if(record&&accept(record))return {el,record};
        if(el===body)break;
      }
      return null;
    };
    let dropElement=null,currentEvent=null;
    // Keep viewport coordinates independent of transforms on note sections.
    const indicator=(body.ownerDocument?.body||body).createDiv('aion-drop-indicator');indicator.hidden=true;
    this.dropIndicator=indicator;
    indicator.setAttribute('aria-hidden','true');
    const clearDrop=()=>{dropElement?.classList.remove('aion-drop');dropElement=null;indicator.hidden=true;};
    this.clearInsertion=clearDrop;
    const effectiveDrag=event=>{
      const drag=this.currentDrag();
      return drag?.kind==='age'?{...drag,wholeAge:typeof event.ctrlKey==='boolean'?event.ctrlKey:!!drag.wholeAge}:drag;
    };
    const showInsertion=insertion=>{
      const {rect,edge}=insertion;
      indicator.style.setProperty('--aion-accent-base',this.ages[insertion.target.ai]?.colour||this.plugin.settings.accent);
      indicator.style.setProperty('left',rect.left+'px');
      indicator.style.setProperty('top',(edge==='after'?rect.bottom:rect.top)+'px');
      indicator.style.setProperty('width',rect.width+'px');
      indicator.hidden=false;
    };
    const stopDrag=()=>{clearDrop();this.finishDrag();};
    scope.register(()=>{
      clearDrop();
      if(!this.linked||this.plugin.linkedDrag?.view===this)stopDrag();
      else this.containerEl.removeClass('aion-dragging-age');
      if(this.clearInsertion===clearDrop)this.clearInsertion=null;
      indicator.remove?.();
      if(this.dropIndicator===indicator)this.dropIndicator=null;
    });
    scope.registerDomEvent(body,'dragstart',event=>{
      const match=find(this.dragSources,event.target);if(!match)return;
      event.stopPropagation();this.drag={...match.record,wholeAge:match.record.kind==='age'&&!!event.ctrlKey};
      if(this.linked)this.plugin.linkedDrag={view:this,group:this.linked.group,snapshot:this.linked.snapshot,drag:this.drag};
      this.containerEl.toggleClass('aion-dragging-age',this.drag.kind==='age');
      event.dataTransfer.setData('text/plain','aion-codex');event.dataTransfer.effectAllowed='move';
    });
    scope.registerDomEvent(body,'dragend',stopDrag);
    scope.registerDomEvent(body,'dragover',event=>{
      const drag=effectiveDrag(event);if(!drag)return;
      this.containerEl.toggleClass('aion-dragging-age',drag.kind==='age');
      const match=find(this.dropTargets,event.target,record=>record.accepts(drag));
      clearDrop();if(!match)return;
      const insertion=this.insertionDrop(drag,match.record,event.clientY);
      if(['year','event','group','age'].includes(drag.kind)&&!insertion)return;
      event.preventDefault();event.stopPropagation();
      if(event.dataTransfer)event.dataTransfer.dropEffect='move';
      if(insertion)showInsertion(insertion);else match.el.classList.add('aion-drop');
      dropElement=match.el;
    });
    scope.registerDomEvent(body,'dragleave',event=>{if(dropElement&&!dropElement.contains(event.relatedTarget))clearDrop();});
    scope.registerDomEvent(body,'drop',event=>{
      const drag=effectiveDrag(event);if(!drag)return;
      const match=find(this.dropTargets,event.target,record=>record.accepts(drag));
      if(!match){stopDrag();return;}
      const insertion=this.insertionDrop(drag,match.record,event.clientY);
      if(['year','event','group','age'].includes(drag.kind)&&!insertion){stopDrag();return;}
      event.preventDefault();event.stopPropagation();stopDrag();
      if(insertion)this.move(drag,insertion.target);else match.record.action(drag);
    });
    // One live toolbar is reparented to the hovered/focused row. Its callbacks
    // resolve the current row, never an index captured by another event's buttons.
    const actions=body.createDiv('aion-event-actions');actions.hidden=true;
    iconButton(actions,'plus','Add Event under this Date and Year',()=>{if(currentEvent){const {event,...context}=currentEvent;new EntryModal(this,{...context,insertAfter:true}).open();}});
    iconButton(actions,'pencil','Edit Event',()=>{if(currentEvent)new EntryModal(this,currentEvent).open();});
    iconButton(actions,'trash-2','Delete Event',()=>{if(currentEvent)confirmEventDelete(this,currentEvent);},'aion-delete');
    const showActions=event=>{
      const match=find(eventRows,event.target);if(!match||currentEvent===match.record)return;
      currentEvent=match.record;actions.hidden=false;match.el.appendChild(actions);
    };
    scope.registerDomEvent(body,'mouseover',showActions);
    scope.registerDomEvent(body,'focusin',showActions);
    scope.registerDomEvent(body,'pointerdown',event=>{if(event.pointerType==='touch'||event.pointerType==='pen')showActions(event);});
  }
  move(d, target) {
    try{
      let next=moveTimelineItem(this.ages,d,target);
      if(d.kind==='age'&&next[0]?.title!==this.ages[0]?.title)next=setStartingAge(next,0);
      if(serialize(next)!==serialize(this.ages))this.save(next);
    }catch(error){new Notice('Aion Codex: '+error.message);}
  }
  async sortYears(index){
    if(this.ages[index]?.starting){new Notice('The Starting Age is never sorted.');return false;}
    if(this.query.trim()){new Notice('Clear search before sorting Years.');return false;}
    try{
      const next=sortAgeYears(this.ages,index,this.plugin.settings.eras||DEFAULTS.eras);
      if(next===this.ages){new Notice('No Year order changes needed. Named or unrecognised Years keep their positions.');return false;}
      return await this.save(next);
    }catch(error){new Notice('Aion Codex: '+error.message);return false;}
  }
  async sortDates(ageIndex,yearIndex){
    if(this.ages[ageIndex]?.starting){new Notice('The Starting Age is never sorted.');return false;}
    if(this.query.trim()){new Notice('Clear search before sorting Dates.');return false;}
    try{
      const months=this.plugin.settings.months||[],next=sortYearDates(this.ages,ageIndex,yearIndex,months);
      if(next===this.ages){new Notice(months.length?'No Date order changes needed. Unrecognised Dates keep their positions.':'Add Months in Sorting settings to sort Month-based Dates. Circa is always placed first.');return false;}
      const saved=await this.save(next);
      if(saved&&!months.length)new Notice('Circa placed first. Add Months in Sorting settings to sort Month-based Dates.');
      return saved;
    }catch(error){new Notice('Aion Codex: '+error.message);return false;}
  }
  render() {
    if(this.isPreviewHidden()){this.pausePreview();return;}
    this.previewPaused=false;
    if(this.shellScope)this.removeChild(this.shellScope);
    this.shellScope=this.addChild(new Component()); this.contentScope=null;
    const el=this.containerEl;el.inert=false;el.empty(); el.addClass('aion-codex');
    const s=this.plugin.settings;el.style.setProperty('--aion-year-width',s.yearWidth+'px');el.style.setProperty('--aion-gap',s.gap+'px');el.style.setProperty('--aion-accent-base',s.accent);this.applyTextSizes();el.toggleClass('aion-no-panels',!s.panels);
    try {this.ages=parse(this.source);} catch(e){el.createEl('p',{text:e.message,cls:'aion-error'});return;}
    if(this.linked)this.query=this.linked.group.query;
    const toolbar=el.createDiv('aion-toolbar');toolbar.hidden=!!(this.linked&&!this.linked.first);
    const searchBox=toolbar.createDiv('aion-search');
    const search=searchBox.createEl('input',{type:'search',placeholder:'Search Events, Dates, Years, or Ages…'});search.setAttribute('aria-label','Search timeline');search.value=this.query;
    const clearSearch=iconButton(searchBox,'x','Clear search',()=>{
      win.clearTimeout(searchTimer);this.query='';search.value='';clearSearch.hidden=true;this.shareSearch();search.focus();
    },'aion-search-clear');
    clearSearch.hidden=!search.value.length;
    iconButton(toolbar,'folder-plus','Add Age',()=>new AgeModal(this).open());
    iconButton(toolbar,'plus','Add Event',()=>new EntryModal(this).open(),'mod-cta');
    const status=el.createDiv('aion-status');status.setAttribute('aria-live','polite');status.hidden=toolbar.hidden;
    const body=el.createDiv('aion-body');
    const refresh=()=> {
      if(this.isPreviewHidden()){this.pausePreview();return;}
      search.value=this.query;clearSearch.hidden=!this.query.length;
      const q=this.query.toLocaleLowerCase().trim();
      // Search must not depend on which Reading sections Obsidian has loaded.
      // Put all matches in the first block while searching; leave each Age in
      // its own block again when the query is cleared.
      const displayed=!this.linked?this.ages:q?(this.linked.first?this.ages:[]):this.ages.slice(this.linked.from,this.linked.from+this.linked.count);
      if(this.contentScope)this.shellScope.removeChild(this.contentScope);
      this.contentScope=this.shellScope.addChild(new Component());
      const scope=this.contentScope;
      this.dragSources=new WeakMap();this.dropTargets=new WeakMap();this.dropPositions=[];const eventRows=new WeakMap();
      const win=el.ownerDocument.defaultView;
      const pool=this.ensureMarkdownPool();
      const markdowns=[];for(const a of displayed){if(a.description)markdowns.push(a.description);for(const y of a.years)for(const g of y.groups)for(const e of g.events)markdowns.push(eventMarkdown(e.text));}
      pool.begin(markdowns);
      const renderer=new ViewportRenderer(win,(markdown,target)=>pool.format(markdown,target),10,pool.previewOptions);
      const attachMarkdown=(markdown,parent)=>{const record=pool.acquire(markdown,parent);if(!record.started)renderer.add(markdown,record.el);};
      scope.register(()=>renderer.dispose());
      body.empty();let count=0;
      for(const age of ordered(displayed)) {
        const ai=this.ages.indexOf(age); const ageMatch=age.title.toLocaleLowerCase().includes(q)||(age.description||'').toLocaleLowerCase().includes(q);
        const visible=age.years.filter(y=>ageMatch||y.label.toLocaleLowerCase().includes(q)||y.groups.some(g=>g.title.toLocaleLowerCase().includes(q)||g.events.some(e=>e.text.toLocaleLowerCase().includes(q))));
        if(q&&!visible.length&&!ageMatch)continue;
        const section=body.createEl('section',{cls:'aion-age'});if(age.colour)section.style.setProperty('--aion-accent-base',age.colour);const heading=section.createDiv('aion-age-heading');const ageTitle=heading.createEl('h2',{text:age.title});
        if(!q){this.handle(ageTitle,'age',{ai});ageTitle.setAttribute('aria-label','Drag to move only this Age heading between Ages or Dates. Hold Ctrl to move the whole Age between Ages.');}
        iconButton(heading,'plus','Add Event to '+age.title,()=>new EntryModal(this,{ai}).open());
        if(!age.starting){const sort=iconButton(heading,'list-ordered','Sort Years in '+age.title,()=>this.sortYears(ai));sort.disabled=!!q;if(q)sort.setAttribute('aria-label','Clear search to sort Years in '+age.title);}
        iconButton(heading,'pencil','Edit Age '+age.title,()=>new AgeModal(this,ai).open());
        iconButton(heading,'trash-2','Delete Age '+age.title,()=>confirmAgeDelete(this,ai),'aion-delete');
        const headingDrop=this.drop(heading,d=>!q&&(d.kind==='year'||d.kind==='age'),d=>this.move(d,{ai}),{kind:'ageHeader',ai});
        this.drop(section,d=>!q&&(d.kind==='age'||d.kind==='year'),d=>this.move(d,{ai}),{kind:'age',ai});
        if(age.description){const overview=section.createDiv('aion-age-description');attachMarkdown(age.description,overview);headingDrop.afterEl=overview;}
        for(const year of visible) {
          const yi=age.years.indexOf(year);const row=section.createDiv('aion-year');const label=row.createDiv('aion-year-label');
          const labelText=label.createEl('strong',{text:year.label});if(!q)this.handle(labelText,'year',{ai,yi});
          this.drop(row,d=>!q&&(d.kind==='year'||d.kind==='group'||d.kind==='event'||(d.kind==='age'&&!d.wholeAge)),d=>this.move(d,{ai,yi}),{kind:'year',ai,yi});
          const panel=row.createDiv('aion-panel');
          if(!age.starting){const sort=iconButton(panel,'list-ordered','Sort Dates in '+year.label,()=>this.sortDates(ai,yi),'aion-panel-sort');sort.disabled=!!q;if(q)sort.setAttribute('aria-label','Clear search to sort Dates in '+year.label);}
          this.drop(panel,d=>!q&&(d.kind==='group'||d.kind==='event'||(d.kind==='age'&&!d.wholeAge)),d=>this.move(d,{ai,yi}),{kind:'panel',ai,yi});
          for(const group of year.groups) {
            const gi=year.groups.indexOf(group);const contextMatch=ageMatch||year.label.toLocaleLowerCase().includes(q)||group.title.toLocaleLowerCase().includes(q);
            const events=group.events.filter(e=>contextMatch||e.text.toLocaleLowerCase().includes(q)); if(q&&!events.length&&!contextMatch)continue;
            const groupEl=panel.createDiv('aion-date-group');const title=groupEl.createEl('h3',{text:group.title});if(!q)this.handle(title,'group',{ai,yi,gi});
            this.drop(groupEl,d=>!q&&(d.kind==='event'||d.kind==='group'||(d.kind==='age'&&!d.wholeAge)),d=>this.move(d,{ai,yi,gi}),{kind:'group',ai,yi,gi});
            const list=groupEl.createEl('ul',{cls:'aion-events'});
            for(const event of events){count++;const ei=group.events.indexOf(event);const li=list.createEl('li');li.setAttribute('tabindex','0');const text=li.createDiv('aion-event-text');
              const markdown=eventMarkdown(event.text);
              attachMarkdown(markdown,text);
              if(!q)this.handle(text,'event',{ai,yi,gi,ei});
              eventRows.set(li,{ai,yi,gi,ei,year,group,event});
              this.drop(li,d=>!q&&d.kind==='event',d=>this.move(d,{ai,yi,gi,ei}),{kind:'event',ai,yi,gi,ei});
            }
            if(!group.events.length)groupEl.createDiv({text:'Empty group — drop an Event here.',cls:'aion-empty'});
          }
          if(!year.groups.length)panel.createDiv({text:'Empty Year — drop a Date group here.',cls:'aion-empty'});
        }
        if(!age.years.length)section.createDiv({text:'Add an Event, or drop a Year onto this Age heading.',cls:'aion-empty'});
      }
      this.drop(body,d=>!q&&(d.kind==='age'||d.kind==='year'||d.kind==='group'||d.kind==='event'),()=>{},{kind:'body'});
      if(this.linked)count=matchingEventCount(this.ages,this.query);
      status.textContent=count+' Event'+(count===1?'':'s')+(q?' found · clear search to reorder':' · Drag to move · Age heading only; Ctrl-drag moves the whole Age');
      if(!body.children.length&&(!this.linked||this.linked.first))body.createEl('p',{text:q?'No matching Events.':'Your Chronicle begins here. Add your first Event.'});
      this.bindInteractions(body,scope,eventRows);
    };
    let searchTimer;
    const win=el.ownerDocument.defaultView;
    this.refreshContent=refresh;
    this.shellScope.register(()=>win.clearTimeout(searchTimer));
    this.shellScope.registerDomEvent(search,'input',()=>{this.query=search.value;clearSearch.hidden=!search.value.length;win.clearTimeout(searchTimer);searchTimer=win.setTimeout(()=>this.shareSearch(),120);});refresh();
  }
}
class AionSettings extends PluginSettingTab {
  display(){const el=this.containerEl;el.empty();el.createEl('h2',{text:'Aion Codex'});
    const navigation=el.createDiv('aion-settings-tabs');navigation.setAttribute('role','tablist');navigation.setAttribute('aria-label','Aion Codex settings');
    const prefix='aion-settings-'+Math.random().toString(36).slice(2),tabs=[];
    for(const [key,label] of [['general','General'],['sorting','Sorting']]){
      const tab=button(navigation,label,()=>select(key),'aion-settings-tab');
      tab.id=prefix+'-'+key+'-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',prefix+'-'+key+'-panel');
      const panel=el.createDiv('aion-settings-panel');panel.id=prefix+'-'+key+'-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
      tabs.push({key,tab,panel});
      tab.addEventListener('keydown',event=>{
        const index=tabs.findIndex(item=>item.key===key);let next;
        if(event.key==='ArrowRight')next=(index+1)%tabs.length;
        else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=tabs.length-1;
        else return;
        event.preventDefault();select(tabs[next].key);tabs[next].tab.focus();
      });
    }
    const select=key=>{
      this.activeTab=key;
      for(const item of tabs){const selected=item.key===key;item.tab.setAttribute('aria-selected',String(selected));item.tab.tabIndex=selected?0:-1;item.panel.hidden=!selected;}
    };
    this.displayGeneral(tabs[0].panel);
    this.displaySorting(tabs[1].panel);
    select(this.activeTab==='sorting'?'sorting':'general');
  }
  displayGeneral(el){
    for(const [key,label,min,max,fallback] of TEXT_SIZES)new Setting(el).setName(label).setDesc(`Percentage of document text size, in 5% steps. Default: ${fallback}%.`+(key==='ageTextSize'?' Age descriptions remain at 100%.':'')).addSlider(t=>t.setLimits(min,max,5).setValue(this.plugin.settings[key]).setDynamicTooltip().onChange(async value=>{
      this.plugin.settings[key]=value;
      for(const view of this.plugin.timelineViews||[])if(!view.disposed&&!view.isPreviewHidden())view.applyTextSizes();
      await this.plugin.saveData(this.plugin.settings);
    }));
    for(const [key,label,min,max,step] of [['yearWidth','Year Column Width',100,250,2],['gap','Space between Years',5,25,1]])new Setting(el).setName(label).addSlider(t=>t.setLimits(min,max,step).setValue(this.plugin.settings[key]).setDynamicTooltip().onChange(async v=>{this.plugin.settings[key]=v;await this.plugin.saveData(this.plugin.settings);}));
    new Setting(el).setName('Default Timeline Colour').setDesc('Base colour for Ages without a custom colour. Its shade adapts to Light and Dark modes. Choose Use Default in the Age dialog to follow this setting.').addColorPicker(t=>t.setValue(this.plugin.settings.accent).onChange(async v=>{this.plugin.settings.accent=v;await this.plugin.saveData(this.plugin.settings);}));
    new Setting(el).setName('Shaded Event panels').addToggle(t=>t.setValue(this.plugin.settings.panels).onChange(async v=>{this.plugin.settings.panels=v;await this.plugin.saveData(this.plugin.settings);}));
    el.createEl('p',{text:'Text sizes update immediately. Reopen the note for other appearance changes. Ages, Years and Events follow your Markdown order. Drag an Age heading to move its boundary; Ctrl-drag moves the whole Age.'});
  }
  saveSorting(){
    this.sortingSave=(this.sortingSave||Promise.resolve()).then(()=>this.plugin.saveData(this.plugin.settings)).catch(error=>{new Notice('Aion Codex: '+error.message);});
    return this.sortingSave;
  }
  displaySorting(el){
    const settings=this.plugin.settings;
    el.createEl('h3',{text:'Eras'});
    for(const [index,label] of ['Negative Years.','Positive Years.'].entries()){
      const row=el.createEl('label',{cls:'aion-era-row'});
      const input=row.createEl('input',{type:'text'});input.value=(settings.eras||DEFAULTS.eras)[index];
      input.setAttribute('aria-label',index===0?'First Era — Negative Years':'Second Era — Positive Years');
      row.createEl('span',{text:label});
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}});
      input.addEventListener('change',async()=>{
        const eras=[...(settings.eras||DEFAULTS.eras)],value=input.value.trim();
        if(/[\r\n]/.test(value)||(value&&value.toLowerCase()===eras[1-index].toLowerCase())){
          input.value=eras[index];new Notice('Use distinct, single-line Era names. Either field can be left blank.');return;
        }
        input.value=value;if(eras[index]===value)return;
        eras[index]=value;settings.eras=eras;await this.saveSorting();
      });
    }
    el.createEl('h3',{text:'Months'});
    const addRow=el.createDiv('aion-calendar-add');
    const field=addRow.createEl('input',{type:'text',placeholder:'Month name'});field.setAttribute('aria-label','Month name');
    const months=()=>settings.months||[];
    const validName=(value,except=-1)=>{
      if(!safeInline(value)){new Notice('Enter a single-line Month name.');return false;}
      if(months().some((name,index)=>index!==except&&name.replace(/\s+/g,' ').toLowerCase()===value.trim().replace(/\s+/g,' ').toLowerCase())){new Notice('That Month is already in the list.');return false;}
      return true;
    };
    const add=async()=>{
      const value=field.value.trim();if(!validName(value))return;
      settings.months=[...months(),value];field.value='';renderList();field.focus();await this.saveSorting();
    };
    iconButton(addRow,'plus','Add Month',add);
    field.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();add();}});
    el.createEl('p',{text:'List order defines the Month order. Drag the grip to reorder Months.'});
    const list=el.createDiv('aion-month-list');let drag=null;
    const clearDrop=()=>{for(const row of list.children){row.classList.remove('aion-month-before');row.classList.remove('aion-month-after');}};
    const renderList=()=>{
      list.empty();drag=null;
      if(!months().length){list.createEl('p',{text:'No Months added yet.',cls:'aion-empty'});return;}
      months().forEach((name,index)=>{
        const row=list.createDiv('aion-month-row');
        const grip=row.createEl('span',{cls:'aion-month-grip'});setIcon(grip,'grip-vertical');grip.draggable=true;grip.setAttribute('aria-label','Drag Month '+name);
        row.createEl('span',{text:String(index+1),cls:'aion-month-number'});
        const input=row.createEl('input',{type:'text'});input.value=name;input.setAttribute('aria-label','Edit Month '+name);
        input.addEventListener('change',async()=>{
          const value=input.value.trim();
          if(!validName(value,index)){input.value=months()[index];return;}
          input.value=value;if(months()[index]===value)return;
          settings.months=months().map((month,i)=>i===index?value:month);
          input.setAttribute('aria-label','Edit Month '+value);grip.setAttribute('aria-label','Drag Month '+value);remove.setAttribute('aria-label','Delete Month '+value);
          await this.saveSorting();
        });
        input.addEventListener('keydown',event=>{
          if(event.key==='Enter'){event.preventDefault();input.blur();}
          else if(event.key==='Escape'){input.value=months()[index];input.blur();}
        });
        const remove=iconButton(row,'trash-2','Delete Month '+name,async()=>{settings.months=months().filter((_,i)=>i!==index);renderList();await this.saveSorting();},'aion-delete');
        grip.addEventListener('dragstart',event=>{drag={index,snapshot:JSON.stringify(months())};event.stopPropagation();event.dataTransfer.setData('text/plain','aion-month');event.dataTransfer.effectAllowed='move';});
        grip.addEventListener('dragend',()=>{drag=null;clearDrop();});
        row.addEventListener('dragover',event=>{
          if(!drag)return;event.preventDefault();event.stopPropagation();clearDrop();
          const box=row.getBoundingClientRect();const after=event.clientY>(box.top+box.bottom)/2;
          row.classList.add(after?'aion-month-after':'aion-month-before');if(event.dataTransfer)event.dataTransfer.dropEffect='move';
        });
        row.addEventListener('dragleave',event=>{if(!row.contains(event.relatedTarget))clearDrop();});
        row.addEventListener('drop',async event=>{
          if(!drag)return;event.preventDefault();event.stopPropagation();clearDrop();
          const operation=drag;drag=null;if(operation.snapshot!==JSON.stringify(months())){new Notice('The Month list changed. Drag the Month again.');return;}
          const box=row.getBoundingClientRect();let at=index+(event.clientY>(box.top+box.bottom)/2?1:0);
          const next=[...months()],[item]=next.splice(operation.index,1);if(operation.index<at)at--;next.splice(at,0,item);
          if(JSON.stringify(next)===JSON.stringify(months()))return;
          settings.months=next;renderList();await this.saveSorting();
        });
      });
    };
    renderList();
    el.createEl('p',{text:'Sort Years beside an Age heading, or Sort Dates beside a Year. Month list order defines Date order, with Circa first. Starting Ages are never sorted. Sorting happens only when you click a button.'});
  }
}
module.exports=class AionCodex extends Plugin {
  linkedGroupFor(owner,el,ctx,id){
    const pane=owner||el.closest?.('.workspace-leaf')||ctx;
    let groups=this.linkedGroups.get(pane);
    if(!groups){groups=new Map();this.linkedGroups.set(pane,groups);}
    const key=ctx.sourcePath+'\n'+id;
    let group=groups.get(key);
    if(!group){group={query:''};groups.set(key,group);}
    return group;
  }
  syncLinkedViews(group,state,except=null,rekey=false){
    for(const peer of this.timelineViews){
      if(peer===except||peer.disposed||peer.linked?.group!==group||peer.linked.snapshot===state.snapshot)continue;
      if(rekey&&state.members[peer.linked.slot])peer.linked.part=linkInfo(state.members[peer.linked.slot].source).part;
      const layout=linkedLayout(state,peer.linked.part);
      peer.source=state.source.replace(/\n$/,'');peer.linked.snapshot=state.snapshot;
      if(!layout){peer.pausePreview();peer.containerEl.empty();continue;}
      Object.assign(peer.linked,layout);peer.render();
    }
  }
  async onload(){this.settings=normalizedSettings(await this.loadData());this.addSettingTab(new AionSettings(this.app,this));
    this.timelineViews=new Set();
    this.linkedGroups=new WeakMap();
    this.register?.(()=>{for(const view of [...this.timelineViews])view.unload();this.timelineViews.clear();});
    this.register?.(()=>{for(const offer of this.renderHandoffs||[]){offer.win.clearTimeout(offer.timer);offer.pool.dispose();offer.view.markdownPool=null;}this.renderHandoffs?.clear();});
    const handler=async(source,el,ctx)=>{
      // Do not even construct a timeline component or its observers in Source.
      if(sourceOnlyContext(this.app,el,ctx.sourcePath))return;
      try{
        const info=linkInfo(source);
        if(!info){ctx.addChild(new TimelineView(this,source,el,ctx));return;}
        const file=this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if(!(file instanceof TFile))throw new Error('The linked Chronicle source is unavailable.');
        const owner=owningMarkdownView(this.app,el,ctx.sourcePath);
        const current=owner?.file?.path===ctx.sourcePath?owner.getViewData?.():undefined;
        const content=typeof current==='string'?current:await this.app.vault.cachedRead(file);
        if(this.stopped||sourceOnlyContext(this.app,el,ctx.sourcePath))return;
        const state=linkedChronicle(content,info.id);
        if(!state.members.some(b=>linkInfo(b.source).part===info.part))throw new Error('This linked block changed. Reopen the note.');
        const group=this.linkedGroupFor(owner,el,ctx,info.id);
        // Scrolling in a later block is not a content change. Only synchronize
        // existing views if the note's structured snapshot actually differs.
        this.syncLinkedViews(group,state);
        const view=new TimelineView(this,state.source,el,ctx);
        view.linked={id:info.id,part:info.part,group,snapshot:state.snapshot,...linkedLayout(state,info.part)};
        ctx.addChild(view);
      }catch(error){el.createEl('p',{text:'Aion Codex: '+error.message,cls:'aion-error'});}
    };
    // Use Obsidian's normal Reading/Live Preview integration. No editor-mode
    // registry toggles or custom syntax extensions are needed.
    this.stopped=false;this.register?.(()=>{this.stopped=true;});
    this.registerMarkdownCodeBlockProcessor('aion-timeline',handler);
    this.addCommand({id:'insert-timeline',name:'Insert example Chronicle',editorCallback:async editor=>{
      const before=editor.getValue?.()||'';
      const selection=editor.getCursor?JSON.stringify([editor.getCursor('from'),editor.getCursor('to')]):null;
      const leaf=this.app.workspace?.activeLeaf;
      try{
        const directory=this.manifest?.dir||((this.app.vault.configDir||'.obsidian')+'/plugins/aion-codex');
        let template = BUNDLED_TEMPLATE;
        const templatePath = directory + '/Template.md';
        if (await this.app.vault.adapter.exists(templatePath)) {
          template = await this.app.vault.adapter.read(templatePath);
        }
        if(this.stopped)return;
        if((editor.getValue&&editor.getValue()!==before)||(selection&&JSON.stringify([editor.getCursor('from'),editor.getCursor('to')])!==selection)||this.app.workspace?.activeLeaf!==leaf)
          throw new Error('The note or selection changed. Run Insert example Chronicle again.');
        editor.replaceSelection(prepareTemplate(template,before,'chronicle-'+Date.now().toString(36)));
      }catch(error){new Notice('Aion Codex: Could not insert Template.md. '+error.message);}
    }});
  }
};
