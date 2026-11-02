/* Krezi / XParty v26 web refinements: use the existing player and room session. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let started=false,sourceKey='',artKey='',currentSource=null;
 function boot(){
  if(started)return true;
  const shell=$('player-shell'),full=$('fullscreen-video'),bar=shell?.querySelector('.player-bar');
  if(!shell||!full||!bar||!$('messages')||!$('seek')||!$('time'))return false;
  started=true;shell.classList.add('krezi-v26-player');
  const top=document.createElement('div');top.className='krezi-player-topline';
  full.classList.add('krezi-fullscreen');full.setAttribute('aria-label','Fullscreen');
  full.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7"/></svg>';
  const playing=$('controls-toggle');playing?.classList.add('krezi-playing-status');
  if(playing){playing.setAttribute('aria-label','Video playback status');playing.disabled=true;}
  top.append(full);if(playing)top.append(playing);shell.append(top);
  // The existing playback action stays in the video controls, not the call strip.
  const play=$('play');if(play&&play.parentElement!==bar)bar.prepend(play);
  const seek=$('seek'),time=$('time'),ping=$('ping-status');
  const timeline=document.createElement('div');timeline.className='krezi-timeline';
  seek.before(timeline);timeline.append(seek);
  const meta=document.createElement('div');meta.className='krezi-timeline-meta';
  meta.append(time);if(ping)meta.append(ping);timeline.append(meta);
  $('xparty-net-ping')?.remove();
  if(ping){
   const color=()=>{const value=Number((ping.textContent||'').match(/(\d+)\s*ms/)?.[1]);ping.dataset.quality=Number.isFinite(value)?value<140?'excellent':value<350?'good':value<700?'fair':'poor':'offline';if(!/\d+\s*ms/.test(ping.textContent||''))ping.dataset.quality='offline';};
   new MutationObserver(color).observe(ping,{childList:true,characterData:true,subtree:true});color();
   ping.title='Recent WebSocket round-trip time to the room server (not IPTV decoder delay)';
  }
  // Existing room playback clock/state controls this timer; no duplicate playback polling.
  const messages=$('messages'),card=document.createElement('section');
  card.id='krezi-watch-card';card.hidden=true;card.setAttribute('aria-label','Now watching');
  const art=document.createElement('img');art.className='krezi-watch-art';art.alt='Channel logo';art.loading='lazy';art.referrerPolicy='no-referrer';
  const info=document.createElement('div');info.className='krezi-watch-info';
  const caption=document.createElement('small');caption.textContent='Now watching';
  const title=document.createElement('strong');info.append(caption,title);
  const like=document.createElement('button');like.type='button';like.className='krezi-watch-like';like.textContent='♡';like.setAttribute('aria-label','Like this video');
  like.onclick=()=>$('video-like')?.click();
  card.append(art,info,like);messages.append(card);
  const observer=new MutationObserver(()=>{if(!card.isConnected&&messages.isConnected)queueMicrotask(()=>{if(!card.isConnected&&messages.isConnected)messages.append(card);});});
  observer.observe(messages,{childList:true});
  function updateRoom(detail){
   currentSource=detail?.source||null;
   card.hidden=!detail?.code||!currentSource;
   if(card.hidden){sourceKey='';return;}
   const source=currentSource,key=source.id||source.videoId||source.url||'';
   title.textContent=String(source.title||'Now playing').slice(0,160);
   caption.textContent=source.type==='iptv'?'Now watching · Live TV':source.type==='youtube'?'Now watching · YouTube':'Now watching';
   const image=source.type==='youtube'&&/^[\w-]{11}$/.test(source.videoId||'')?
     'https://i.ytimg.com/vi/'+source.videoId+'/mqdefault.jpg':
     [source.logo,source.logoUrl,source.thumbnail].find(v=>typeof v==='string'&&/^https:\/\//i.test(v))||'/xparty/brands/tv.svg';
   if(image!==artKey){artKey=image;art.onerror=()=>{art.onerror=null;art.src='/xparty/brands/tv.svg';};art.src=image;}
   if(key!==sourceKey){sourceKey=key;messages.append(card);}
   like.disabled=!$('video-like');
  }
  document.addEventListener('krezi:room',e=>updateRoom(e.detail));
  const room=$('room');new MutationObserver(()=>{if(room.hidden)card.hidden=true;}).observe(room,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('pointerdown',e=>{if(shell.contains(e.target)&&!e.target.closest('.krezi-player-topline'))shell.classList.remove('controls-hidden');},{passive:true});
  return true;
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
 let retries=0;const handle=setInterval(()=>{if(boot()||++retries>50)clearInterval(handle);},150);
})();
