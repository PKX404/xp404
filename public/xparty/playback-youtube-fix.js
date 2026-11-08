/* Repair of Test17 YouTube playback visibility and positioning; no player instances or room events changed. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let initialized=false,attempts=0;
 function init(){
  const shell=$('player-shell'),family=shell?.querySelector('.player-bar .xparty-player-tool-family'),
        strip=shell?.querySelector('.player-bar .xparty-player-toolstrip'),yt=$('youtube-wrap');
  if(!shell||!family||!strip||!yt)return false;
  if(!initialized){
   initialized=true;
   // Use EXACTLY the existing Xparty event handlers by moving real buttons, not cloning them.
   const volume=document.querySelector('.xparty-volume-toggle');
   const order=[$('video-like'),$('xparty-scale-cycle'),$('playback-more'),volume].filter(Boolean);
   for(const button of order)family.append(button);
   shell.classList.add('xp-playback-repaired');
   const syncProvider=()=>{
    const isYoutube=!yt.hidden&&!!$('room')&&!$('room').hidden;
    document.body.classList.toggle('xp-playing-youtube',isYoutube);
   };
   new MutationObserver(syncProvider).observe(yt,{attributes:true,attributeFilter:['hidden','style','class']});
   syncProvider();
   // The original fullscreen/main control logic remains in charge for non-YouTube sources.
   // When settings is open the auto-hide timer must not close a still-active menu.
   const options=$('playback-options');
   if(options){new MutationObserver(()=>{
     if(options.open&&shell.classList.contains('controls-hidden')){
       shell.classList.remove('controls-hidden');$('controls-toggle')?.setAttribute('aria-expanded','true');
     }
   }).observe(shell,{attributes:true,attributeFilter:['class']});}
   for(const b of family.querySelectorAll('button')){
    b.addEventListener('pointerdown',()=>{
      b.classList.add('xp-pressed');setTimeout(()=>b.classList.remove('xp-pressed'),130);
    },{passive:true});
   }
  }
  // The volume toggle is created by a separate deferred script, sometimes later than player-controls.js.
  const volume=document.querySelector('.xparty-volume-toggle');
  if(volume&&family.lastElementChild!==volume)family.append(volume);
  return true;
 }
 function boot(){if(init()){setTimeout(init,500);setTimeout(init,1700);return;}if(++attempts<120)setTimeout(boot,100);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
 window.addEventListener('pageshow',()=>{const yt=$('youtube-wrap');if(yt)document.body.classList.toggle('xp-playing-youtube',!yt.hidden);},{passive:true});
})();
