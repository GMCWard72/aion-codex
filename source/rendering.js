// Keep rich Markdown work close to the viewport and spread it across frames.
// Placeholder text keeps the complete timeline readable and searchable immediately.
function previewNodes(markdown, depth=0) {
  if(depth>12)return [markdown];
  const nodes=[];let plain='';
  const push=node=>{if(plain){nodes.push(plain);plain='';}nodes.push(node);};
  for(let i=0;i<markdown.length;){
    const rest=markdown.slice(i);let m;
    if((m=/^\\([\\`*_[\]{}()#+.!>~-])/.exec(rest))){plain+=m[1];i+=m[0].length;continue;}
    if((m=/^(`+)([\s\S]*?)\1(?!`)/.exec(rest))){push({tag:'code',children:[m[2]]});i+=m[0].length;continue;}
    if((m=/^\[\[([^\]]+)\]\]/.exec(rest))){const parts=m[1].split('|');push({tag:'a',link:parts[0],children:previewNodes(parts.at(-1),depth+1)});i+=m[0].length;continue;}
    if((m=/^\[([^\]]+)\]\([^)]*\)/.exec(rest))){push({children:previewNodes(m[1],depth+1)});i+=m[0].length;continue;}
    if(markdown[i]==='*'||markdown[i]==='_'){
      const symbol=markdown[i],run=/^[*_]+/.exec(rest)[0];
      const length=run.split('').every(c=>c===symbol)?Math.min(run.length,3):1;
      const delimiter=symbol.repeat(length),start=i+length;
      if(!/\s/.test(markdown[start]||' ')&&(symbol!=='_'||!/[\w]/.test(markdown[i-1]||''))){
        let end=markdown.indexOf(delimiter,start);
        while(end!==-1){
          let escapes=0;for(let p=end-1;p>=0&&markdown[p]==='\\';p--)escapes++;
          if(end>start&&escapes%2===0&&!/\s/.test(markdown[end-1])&&markdown[end-1]!==symbol&&markdown[end+length]!==symbol&&
            (symbol!=='_'||!/[\w]/.test(markdown[end+length]||'')))break;
          end=markdown.indexOf(delimiter,end+1);
        }
        if(end!==-1){
          const children=previewNodes(markdown.slice(start,end),depth+1);
          push(length===3?{tag:'strong',children:[{tag:'em',children}]}:{tag:length===2?'strong':'em',children});
          i=end+length;continue;
        }
      }
    }
    plain+=markdown[i++];
  }
  if(plain)nodes.push(plain);return nodes;
}
function previewText(markdown) {
  const flatten=nodes=>nodes.map(node=>typeof node==='string'?node:flatten(node.children)).join('');
  return flatten(previewNodes(markdown));
}
function renderPreview(markdown, el, options={}) {
  if(typeof el.createEl!=='function'||typeof el.appendText!=='function'){el.textContent=previewText(markdown);return;}
  el.textContent='';
  const append=(nodes,parent)=>{for(const node of nodes){
    if(typeof node==='string')parent.appendText(node);
    else {
      const child=node.tag?parent.createEl(node.tag):parent;
      if(node.link!==undefined){
        const unresolved=options.isUnresolved?.(node.link)||false;
        child.setAttribute('class','internal-link'+(unresolved?' is-unresolved':''));
        child.setAttribute('data-href',node.link);
        // Use an inert URL: Obsidian's note resolver, rather than the browser,
        // opens the note while this short-lived preview is visible.
        child.setAttribute('href','#');
        child.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();options.openInternalLink?.(node.link,event);
        });
      }
      append(node.children,child);
    }
  }};
  append(previewNodes(markdown),el);
}
class ViewportRenderer {
  constructor(win, render, batchSize = 10, previewOptions = {}) {
    this.win = win; this.render = render; this.batchSize = batchSize;
    this.previewOptions=previewOptions;
    this.pending = new Map(); this.queue = []; this.frame = null; this.disposed = false;
    if (win.IntersectionObserver) this.observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) this.enqueue(entry.target);
    }, { rootMargin: '600px 0px' });
  }
  add(markdown, el) {
    if (this.disposed) return;
    renderPreview(markdown,el,this.previewOptions);
    this.pending.set(el, markdown);
    if (this.observer) this.observer.observe(el); else this.enqueue(el);
  }
  enqueue(el) {
    if (this.disposed || !this.pending.has(el)) return;
    this.observer?.unobserve(el);
    const markdown = this.pending.get(el); this.pending.delete(el);
    this.queue.push({ el, markdown });
    if (this.frame === null) this.frame = this.win.requestAnimationFrame(() => this.flush());
  }
  flush() {
    this.frame = null;
    if (this.disposed) return;
    for (let i = 0; i < this.batchSize && this.queue.length; i++) {
      const { el, markdown } = this.queue.shift();
      try {
        Promise.resolve(this.render(markdown, el)).catch(() => {
          if (!this.disposed) renderPreview(markdown,el,this.previewOptions);
        });
      } catch {
        renderPreview(markdown,el,this.previewOptions);
      }
    }
    if (this.queue.length) this.frame = this.win.requestAnimationFrame(() => this.flush());
  }
  dispose() {
    this.disposed = true; this.observer?.disconnect();
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.frame = null; this.pending.clear(); this.queue.length = 0;
  }
}
// Reuse live Markdown nodes (and their components), not cloned HTML. This keeps
// link behaviour intact and avoids replacing already formatted text with previews.
class MarkdownPool {
  constructor(createScope, releaseScope, render, previewOptions = {}) {
    this.createScope=createScope;this.releaseScope=releaseScope;this.render=render;
    this.previewOptions=previewOptions;
    this.entries=new Map();this.byElement=new WeakMap();this.cursors=new Map();this.disposed=false;
  }
  begin(markdowns) {
    this.cursors.clear();
    const counts=new Map();for(const text of markdowns)counts.set(text,(counts.get(text)||0)+1);
    for(const [text,records] of this.entries){
      const keep=counts.get(text)||0;
      for(const record of records.splice(keep)){record.retired=true;this.releaseScope(record.scope);}
      if(!records.length)this.entries.delete(text);
      for(const record of records)record.used=false;
    }
  }
  acquire(markdown,parent) {
    if(this.disposed)throw new Error('Markdown pool is unloaded.');
    let records=this.entries.get(markdown);
    if(!records){records=[];this.entries.set(markdown,records);}
    const index=this.cursors.get(markdown)||0;this.cursors.set(markdown,index+1);
    let record=records[index];
    if(!record){
      record={el:parent.createDiv('aion-markdown-content'),scope:this.createScope(),started:false,used:false};
      records.push(record);this.byElement.set(record.el,record);
    }else parent.appendChild(record.el);
    record.used=true;return record;
  }
  format(markdown,el) {
    const record=this.byElement.get(el);
    if(!record||record.started||this.disposed)return;
    record.started=true;
    const staged=typeof el.createDiv==='function'&&typeof el.replaceChildren==='function';
    const target=staged?el.createDiv('aion-rich-markdown'):el;
    if(staged)target.hidden=true;
    const failed=error=>{record.started=false;if(!this.disposed&&!record.retired)renderPreview(markdown,el,this.previewOptions);throw error;};
    try{return Promise.resolve(this.render(markdown,target,record.scope)).then(()=>{
      if(staged&&!this.disposed&&!record.retired){el.replaceChildren(target);target.hidden=false;}
    }).catch(failed);}
    catch(error){return failed(error);}
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const records of this.entries.values())for(const record of records){record.retired=true;this.releaseScope(record.scope);}
    this.entries.clear();
  }
}
module.exports = { ViewportRenderer, previewText, MarkdownPool, previewNodes, renderPreview };
