// Keep dynamic country/language menus inside the app viewport, even in clipped sheets.
export function enhanceInternalSelect(select){
 if(!select||select.dataset.internalSelectEnhanced==='true')return;
 select.dataset.internalSelectEnhanced='true';select.classList.add('internal-select-source');
 const wrap=document.createElement('span');wrap.className='internal-select';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
 const menu=document.createElement('span');menu.id=(select.id||'select')+'-options';menu.className='select-options xparty-select-portal';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',select.getAttribute('aria-label')||select.id);trigger.setAttribute('aria-controls',menu.id);
 select.after(wrap);wrap.append(trigger);document.body.append(menu);
 const sync=()=>{trigger.textContent=select.selectedOptions[0]?.textContent||'Choose…';trigger.disabled=select.disabled;trigger.setAttribute('aria-label',(select.closest('label')?.firstChild?.textContent?.trim()||select.id)+': '+trigger.textContent);};
 const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');};
 const position=()=>{if(menu.hidden)return;const r=trigger.getBoundingClientRect(),gap=6,pad=10,below=innerHeight-r.bottom-pad,above=r.top-pad,openBelow=below>=Math.min(220,menu.scrollHeight+gap)||below>=above;menu.style.left=Math.max(pad,Math.min(r.left,innerWidth-r.width-pad))+'px';menu.style.right='auto';menu.style.width=Math.min(r.width,innerWidth-pad*2)+'px';menu.style.maxHeight=Math.max(100,Math.min(260,(openBelow?below:above)-gap))+'px';menu.style.top=openBelow?(r.bottom+gap)+'px':'auto';menu.style.bottom=openBelow?'auto':(innerHeight-r.top+gap)+'px';};
 const populate=()=>{menu.replaceChildren();for(const option of select.options){const item=document.createElement('button');item.type='button';item.setAttribute('role','option');item.disabled=option.disabled;item.textContent=option.textContent;item.setAttribute('aria-selected',String(option.selected));item.onclick=e=>{e.stopPropagation();select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();close();trigger.focus();};menu.append(item);}};
 trigger.onclick=e=>{e.stopPropagation();if(select.disabled)return;if(!menu.hidden){close();return;}for(const other of document.querySelectorAll('.xparty-select-portal')){other.hidden=true;other._xpartyTrigger?.setAttribute('aria-expanded','false');}populate();menu.hidden=false;trigger.setAttribute('aria-expanded','true');position();menu.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});};
 menu._xpartyTrigger=trigger;
 menu.addEventListener('keydown',e=>{const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close();trigger.focus();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[Math.max(0,Math.min(items.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.focus();}else if(e.key==='Home'||e.key==='End'){e.preventDefault();items[e.key==='Home'?0:items.length-1]?.focus();}});
 document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target)&&!menu.contains(e.target))close();});
 window.addEventListener('resize',position,{passive:true});window.addEventListener('scroll',position,{capture:true,passive:true});
 select.addEventListener('change',sync);new MutationObserver(()=>{sync();if(!menu.hidden)populate();}).observe(select,{attributes:true,attributeFilter:['disabled'],childList:true,subtree:true});sync();
 return {refresh:sync,close};
}
