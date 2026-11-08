(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let booted=false;
 function boot(){
  if(booted||!$('room')||!$('player-shell')||!$('room-directory')||!document.querySelector('.player-bar.playback-refined')||!$('fullscreen-video'))return false;
  booted=true;
  const shell=$('player-shell'),bar=shell.querySelector('.player-bar'),stage=$('watch-stage');
  shell.classList.add('xparty-global-player');
  // Top-aligned status + permanent fullscreen; never clone the actual control.
  const top=document.createElement('div');top.className='xparty-player-topline';
  const status=$('controls-toggle');if(status){status.classList.add('xparty-top-playing');top.append(status);}
  const full=$('fullscreen-video');if(full){full.classList.add('xparty-top-fullscreen');top.append(full);}
  shell.append(top);
  const play=$('play');if(play&&bar){const row=bar.querySelector('.playback-row');if(row)row.prepend(play);}
  const ping=$('ping-status'),seek=$('seek');if(ping&&seek&&bar){const timeline=document.createElement('div');timeline.className='xparty-timeline';seek.before(timeline);timeline.append(seek,ping);}
  // Leave the control timer intact; ensure tap/visibility restores controls for LIVE TV too.
  function reveal(){if(!$('room').hidden){shell.classList.remove('controls-hidden');status?.setAttribute('aria-expanded','true');}}
  stage?.addEventListener('pointerdown',reveal,{passive:true});
  shell.addEventListener('click',reveal,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reveal();});
  // Remove obsolete notification overlays once closed; do not leave invisible touch barriers.
  document.addEventListener('close',e=>{if(e.target?.matches('.room-mini-profile'))e.target.querySelectorAll('img').forEach(img=>img.removeAttribute('src'));},true);
  // Home: only two primary choices, with a real public-room discovery grid.
  const lobby=$('lobby'),entry=lobby.querySelector('.entry-card');
  if(entry){
   const launch=document.createElement('div');launch.className='xparty-home-choices';
   const explore=document.createElement('button');explore.type='button';explore.className='xparty-home-explore';explore.textContent='Explore';
   const invite=document.createElement('button');invite.type='button';invite.className='xparty-home-invite';invite.textContent='Join Invite';
   launch.append(explore,invite);entry.prepend(launch);
   const form=$('join-form');form.hidden=true;
   explore.onclick=()=>{$('room-directory').scrollIntoView({block:'start',behavior:'smooth'});$('directory-refresh')?.click();};
   invite.onclick=()=>{form.hidden=false;form.scrollIntoView({block:'center',behavior:'smooth'});$('code')?.focus({preventScroll:true});};
   // Retain creating rooms inside Explore, not as a competing home choice.
   const directory=$('room-directory');const create=document.createElement('button');create.className='xparty-explore-create';create.type='button';create.textContent='+ Start room';create.onclick=()=>$('create-toggle')?.click();directory.querySelector('.directory-heading')?.append(create);
   document.querySelector('.xparty-browse-public')?.remove();
   lobby.classList.add('xparty-global-home');
  }
  // Real open rooms only. Never fabricate participant counts or fake live thumbnails.
  const directory=$('room-directory');directory.classList.add('xparty-explore-feed');
  const title=directory.querySelector('.directory-heading h2');if(title)title.textContent='Explore';
  const info=directory.querySelector('.directory-heading p');if(info)info.textContent='Discover public watch parties around the world';
  return true;
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
 let tries=0;const timer=setInterval(()=>{if(boot()||++tries>30)clearInterval(timer);},250);
})();
