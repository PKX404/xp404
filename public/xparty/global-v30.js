(()=>{'use strict';
const $=id=>document.getElementById(id);
let finished=false;
function init(){
 if(finished)return true;
 const shell=$('player-shell'),room=$('room'),bar=shell?.querySelector('.player-bar.playback-refined'),
       top=shell?.querySelector('.xparty-player-topline'),full=$('fullscreen-video'),strip=shell?.querySelector('.xparty-player-toolstrip');
 if(!shell||!room||!bar||!top||!full||!strip||!$('play')||!$('empty-player'))return false;
 finished=true;shell.classList.add('xparty-v30-fixed');
 // Reuse the ONE native/fullscreen control. It toggles both enter and exit on its existing handler.
 top.insertBefore(full,top.firstChild);full.setAttribute('aria-label','Toggle fullscreen');
 full.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H3v6M3 3l7 7M15 21h6v-6m0 6-7-7"/></svg>';
 // Repair stripped controls if any older module moved them into the call panel.
 const family=strip.querySelector('.xparty-player-tool-family');
 const like=$('video-like'),scale=$('xparty-scale-cycle'),settings=$('playback-more'),volume=document.querySelector('.xparty-volume-toggle');
 for(const control of [like,scale,settings,volume])if(control&&family&&control.parentElement!==family)family.append(control);
 // Don't add duplicate timers to the native video renderer; leave main playback loop intact.
 const reveal=document.createElement('button');reveal.id='xparty-v30-reveal';reveal.type='button';reveal.textContent='⋯';reveal.setAttribute('aria-label','Show video controls');shell.append(reveal);
 const status=$('controls-toggle');const timerMs=3900;let timeout=null;
 function visibleSource(){return !room.hidden&&(document.body.classList.contains('room-has-source')||document.body.classList.contains('device-local-video'));}
 function show(){if(!visibleSource())return;shell.classList.remove('controls-hidden');status?.setAttribute('aria-expanded','true');clearTimeout(timeout);timeout=setTimeout(()=>{
   if(visibleSource()&&!document.querySelector('#playback-options[open]')&&!shell.matches(':focus-within')&&!document.hidden){shell.classList.add('controls-hidden');status?.setAttribute('aria-expanded','false');}
 },timerMs);}
 const activate=e=>{if(e.target.closest('button,input,textarea,select,dialog'))return;show();};
 // One capture handler: even taps on a nested stage/recommendation image reveal player actions.
 shell.addEventListener('pointerdown',activate,{passive:true,capture:true});
 reveal.addEventListener('pointerdown',e=>{e.stopPropagation();show();},{passive:true});
 reveal.addEventListener('click',e=>{e.stopPropagation();show();});
 bar.addEventListener('pointerdown',show,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)show();});
 const update=()=>{if(!visibleSource()){shell.classList.remove('controls-hidden');clearTimeout(timeout);}
  else if(!timeout)show();};
 new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['class']});
 new MutationObserver(update).observe(room,{attributes:true,attributeFilter:['hidden']});
 // Homepage-only dedication. Do not add branding to the watch room or chat.
 const lobby=$('lobby'),dedication=lobby?.querySelector('.dedication');
 if(lobby&&dedication){lobby.append(dedication);dedication.hidden=false;dedication.removeAttribute('aria-hidden');dedication.classList.add('xparty-v30-home-dedication');}
 // Native video may play underneath transparent HTML; keep stage size stable across rotation.
 const stage=$('watch-stage');if(stage){
  const orientation=()=>{stage.style.removeProperty('height');stage.style.removeProperty('width');};
  window.addEventListener('orientationchange',orientation,{passive:true});
 }
 update();return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
let tries=0;const interval=setInterval(()=>{if(init()||++tries>=40)clearInterval(interval);},200);
})();
