/* XParty Global v31: one control layout, no extra ping/animation or polling player. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let initialized=false,sourceOn=false;
 function init(){
  if(initialized)return true;
  const shell=$('player-shell'),stage=$('watch-stage'),room=$('room'),bar=shell?.querySelector('.player-bar.playback-refined');
  const seek=$('seek'),time=$('time'),play=$('play'),full=$('fullscreen-video');
  if(!shell||!stage||!room||!bar||!seek||!time||!play||!full)return false;
  initialized=true;
  shell.classList.add('xparty-v31');
  // Remove duplicate readout widgets, not the underlying WebSocket clock-sync messages.
  document.querySelectorAll('#xparty-net-ping,#ping-status,.ping-duplicate,.xparty-ping-badge').forEach(n=>n.remove());
  // An earlier release wrapped the progress control, so its bottom layout CSS
  // was incorrectly targeting a seek bar which was no longer a direct child.
  const timeline=bar.querySelector('.xparty-timeline');
  if(timeline){seek.before(document.createComment('v31 removed seek wrapper'));bar.prepend(seek);timeline.remove();}
  else if(seek.parentElement!==bar)bar.prepend(seek);
  const row=bar.querySelector('.playback-row');
  if(row){
   if(play.parentElement!==row)row.prepend(play);
   const stack=time.closest('.xparty-time-stack');
   if(stack){row.insertBefore(time,row.querySelector('.xparty-player-toolstrip')||null);stack.remove();}
   else if(time.parentElement!==row)row.insertBefore(time,row.querySelector('.xparty-player-toolstrip')||null);
   const strip=bar.querySelector('.xparty-player-toolstrip');
   if(strip&&strip.parentElement!==row)row.append(strip);
   const family=strip?.querySelector('.xparty-player-tool-family:last-child')||strip?.querySelector('.xparty-player-tool-family');
   const restoreFamily=()=>{if(!strip)return;
    if(strip.parentElement!==row)row.append(strip);
    for(const button of [$('video-like'),$('xparty-scale-cycle'),$('playback-more'),document.querySelector('.xparty-volume-toggle')]){
     if(family&&button&&button.parentElement!==family)family.append(button);
    }
   };
   restoreFamily();
   // Some earlier room updates physically moved playback buttons into the call rail.
   // Watch the two tiny action rows rather than observing/rebuilding the whole room.
   const preserve=new MutationObserver(restoreFamily);
   preserve.observe(row,{childList:true,subtree:true});
   const callRow=document.querySelector('.call-seat-row');if(callRow)preserve.observe(callRow,{childList:true});
  }
  // Only ONE true fullscreen action. Keep its existing enter/exit handler.
  let top=shell.querySelector('.xparty-player-topline');
  if(!top){top=document.createElement('div');top.className='xparty-player-topline';shell.append(top);}
  top.prepend(full);full.classList.add('xparty-top-fullscreen');
  const status=$('controls-toggle');if(status){top.append(status);status.classList.add('xparty-top-playing');}
  const enterIcon='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H3v6m0-6 7 7m5 11h6v-6m0 6-7-7"/></svg>';
  const exitIcon='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  let lastFullscreen;
  const syncFullscreen=()=>{const active=document.body.classList.contains('watch-fullscreen');if(active===lastFullscreen)return;lastFullscreen=active;full.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');full.title=active?'Exit fullscreen':'Enter fullscreen';full.setAttribute('aria-pressed',String(active));full.innerHTML=active?exitIcon:enterIcon;};
  syncFullscreen();
  new MutationObserver(syncFullscreen).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('fullscreenchange',syncFullscreen);
  window.addEventListener('xparty:fullscreen',syncFullscreen);
  // v30 added a second timer and an ellipsis control, remove both artifacts.
  $('xparty-v30-reveal')?.remove();
  const hasVideo=()=>!room.hidden&&(document.body.classList.contains('room-has-source')||document.body.classList.contains('device-local-video'));
  const syncSource=()=>{const next=hasVideo();if(sourceOn===next)return;sourceOn=next;shell.classList.toggle('v31-has-video',next);if(next){shell.classList.remove('controls-hidden');}};
  syncSource();
  new MutationObserver(syncSource).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncSource).observe(room,{attributes:true,attributeFilter:['hidden']});
  // One click/tap reveal. The original app owns its sole 2.8s auto-hide timer.
  // Don't create a second timer or any video seek/reload callbacks.
  stage.addEventListener('pointerdown',()=>{if(hasVideo())shell.classList.remove('controls-hidden');},{passive:true});
  // Chat must scroll to the most recent message when keyboard steals vertical space.
  const input=$('message-input'),messages=$('messages'),chatForm=$('chat-form');
  if(input&&messages&&chatForm){
   let raf=0,delayed=0,followEnd=true;
   const nearEnd=()=>messages.scrollHeight-messages.scrollTop-messages.clientHeight<72;
   messages.addEventListener('scroll',()=>{followEnd=nearEnd();},{passive:true});
   const scrollNewest=()=>{if(room.hidden||!followEnd)return;
    const active=document.activeElement===input||document.body.classList.contains('room-keyboard-open');
    if(active)messages.scrollTop=messages.scrollHeight;};
   const schedule=()=>{if(raf||!followEnd)return;raf=requestAnimationFrame(()=>{raf=0;scrollNewest();});};
   const focus=()=>{followEnd=nearEnd();schedule();clearTimeout(delayed);delayed=setTimeout(schedule,160);};
   input.addEventListener('focus',focus);
   // Typing changes no message geometry; do not force scroll/layout per keystroke.
   window.visualViewport?.addEventListener('resize',schedule,{passive:true});
   window.addEventListener('resize',schedule,{passive:true});
   window.addEventListener('xparty:native-insets',schedule);
   chatForm.addEventListener('submit',()=>{followEnd=true;schedule();});

  }
  return true;
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 let attempts=0;const interval=setInterval(()=>{if(init()||++attempts>=20)clearInterval(interval);},160);
})();
