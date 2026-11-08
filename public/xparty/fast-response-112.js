/* UI acknowledgement must appear on the same tap as user selection. */
(()=>{'use strict';
 const clickable='button,a[href],[role="tab"],[role="button"],summary,.provider-card';
 let active=null,restoreTimer=null;
 function remove(){if(active){active.classList.remove('xparty-tapped');active=null;}}
 document.addEventListener('pointerdown',e=>{
  if(e.button!==0||!e.isPrimary)return;
  const b=e.target.closest(clickable);
  if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;
  remove();active=b;b.classList.add('xparty-tapped');
 },{capture:true,passive:true});
 document.addEventListener('pointerup',()=>setTimeout(remove,170),{capture:true,passive:true});
 document.addEventListener('pointercancel',remove,{capture:true,passive:true});
 document.addEventListener('click',e=>{
  const b=e.target.closest(clickable);if(!b||b.disabled)return;
  const group=b.closest('.source-way-tabs,.provider-picker,.conversation-tabs,.source-way-tabs,.tabs,.home-source-ways,.quick-shortcuts,.source-panel,.playback-setting');
  if(!group)return;
  group.querySelectorAll('.xparty-choice-active:not([aria-busy])').forEach(n=>{if(n!==b)n.classList.remove('xparty-choice-active');});
  b.classList.add('xparty-choice-active');
  clearTimeout(restoreTimer);restoreTimer=setTimeout(()=>{if(!b.hasAttribute('aria-busy'))b.classList.remove('xparty-choice-active');},1500);
 },{capture:true});
})();
