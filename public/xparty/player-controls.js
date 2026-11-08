import {icon} from './icons.js';
import {initClubMode} from './club-mode.js';

// Reuse the mounted player controls and their existing room permissions/events.
export function initPlayerControls({getContext=()=>({}),notify=()=>{}}={}){
 const $=id=>document.getElementById(id),bar=document.querySelector('.player-bar'),shell=$('player-shell');
 const row=document.createElement('div'),actions=document.createElement('div');
 row.className='playback-row';actions.className='playback-actions';
 const menu=document.createElement('dialog');menu.id='playback-options';menu.setAttribute('aria-label','Playback options');
 const heading=document.createElement('div');heading.className='playback-menu-heading';heading.textContent='Playback';
 const close=document.createElement('button');close.type='button';icon(close,'close','Close playback options');close.onclick=()=>menu.close();heading.append(close);menu.append(heading);
 let quality=0,scale=0,buffer='optimal',speed=1;
 const section=(title,options,onChoose)=>{const details=document.createElement('details');details.className='playback-setting';const summary=document.createElement('summary'),hint=document.createElement('small'),choices=document.createElement('div');summary.textContent=title;hint.className='playback-setting-hint';details.append(summary,hint,choices);for(const [value,label] of options){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.value=value;b.onclick=()=>{onChoose(value);refreshSettings();};choices.append(b);}menu.append(details);return {details,summary,hint,choices};};
 const speedSetting=section('Playback speed',[[.5,'0.5×'],[.75,'0.75×'],[1,'Normal'],[1.25,'1.25×'],[1.5,'1.5×'],[2,'2×']],v=>{const ctx=getContext();if(!ctx.local)return;speed=Number(v);ctx.video.playbackRate=speed;});
 const qualitySetting=section('Quality',[[0,'Auto'],[720,'Up to 720p'],[360,'Up to 360p'],[240,'Up to 240p']],v=>{const ctx=getContext();quality=Number(v);if(ctx.native)ctx.nativeVideo.setQuality(quality);else ctx.iptvPlayer?.setQuality(quality);});
 const scaleSetting=section('Scaling',[[0,'Standard'],[1,'Wide'],[2,'Stretched'],[3,'Fit to height'],[4,'Fit to width']],v=>{const ctx=getContext();scale=Number(v);shell.querySelector('#watch-stage').dataset.videoScale=String(scale);if(ctx.native)ctx.nativeVideo.setScale(scale);});
 const bufferSetting=section('Buffering',[['minimal','Minimal (weak devices)'],['optimal','Optimal'],['high','High'],['maximum','Maximum']],v=>{const ctx=getContext();if(ctx.iptvPlayer?.setBuffering(v))buffer=v;});
 const languageDetails=document.createElement('details');languageDetails.className='playback-setting';
 const languageTitle=document.createElement('summary');languageTitle.textContent='Audio language';
 const languageChoices=document.createElement('div');languageDetails.append(languageTitle,languageChoices);menu.append(languageDetails);
 function refreshLanguages(){
  const ctx=getContext(),tracks=ctx.iptvPlayer?.getAudioTracks?.()||[];
  languageChoices.replaceChildren();
  if(!tracks.length){const info=document.createElement('p');info.className='playback-language-note';info.textContent='No selectable audio languages provided by this source';languageChoices.append(info);return;}
  for(const track of tracks){const b=document.createElement('button');b.type='button';b.textContent=track.name;b.onclick=()=>{if(ctx.iptvPlayer?.setAudioTrack?.(track.index))refreshLanguages();};languageChoices.append(b);}
 }
 languageDetails.addEventListener('toggle',()=>{if(languageDetails.open)refreshLanguages();});
 const club=initClubMode({menu,getContext});
 const autoRow=document.createElement('label');autoRow.className='playback-auto-next';const autoText=document.createElement('span');autoText.textContent='Autoplay next episode';const auto=document.createElement('input');auto.type='checkbox';auto.setAttribute('aria-label','Autoplay next episode');auto.onchange=()=>{const original=$('auto-advance');original.checked=auto.checked;original.dispatchEvent(new Event('change',{bubbles:true}));};autoRow.append(autoText,auto);menu.append(autoRow);
 function refreshSettings(){club.refresh();const ctx=getContext();if(ctx.local&&ctx.video)speed=ctx.video.playbackRate;const source=ctx.source,adaptive=!!source&&!ctx.local&&(ctx.native&&['iptv','youtube'].includes(source.type)||ctx.iptvPlayer?.canAdjustStream),scalable=!!source&&(ctx.local||ctx.native||['file','direct','iptv'].includes(source.type)),canBuffer=!!ctx.iptvPlayer?.canAdjustStream&&!ctx.native&&!ctx.local;
  const configure=(part,value,available,hint)=>{part.hint.textContent=hint;for(const b of part.choices.children){b.disabled=!available;b.setAttribute('aria-pressed',String(b.dataset.value===String(value)));}const selected=[...part.choices.children].find(b=>b.dataset.value===String(value));part.summary.textContent=part.summary.textContent.split(' · ')[0]+' · '+(selected?.textContent||'Unavailable');};
  configure(speedSetting,speed,!!ctx.local,ctx.local?'Changes this device only.':'Speed is available for device-local videos; synced rooms and live channels stay aligned.');
  configure(qualitySetting,quality,adaptive,adaptive?'A maximum quality for adaptive streams; available variants vary.':'This source does not expose adjustable stream variants.');
  configure(scaleSetting,scale,scalable,scalable?'Changes the picture on this device.':'This provider controls its own picture.');
  configure(bufferSetting,buffer,canBuffer,canBuffer?'Changes the browser HLS buffer target.':'This player manages buffering automatically.');
  auto.checked=$('auto-advance').checked;auto.disabled=$('auto-advance').disabled;autoRow.title=auto.disabled?'Only the host can change autoplay.':'';
 }
 for(const [id,label] of [['back10','Back 10 seconds'],['forward10','Forward 10 seconds'],['previous-video','Previous video'],['replay-video','Replay video'],['resync','Sync with room'],['stop','Stop playback'],['theater','Cinema view']]){
  const control=$(id);if(!control)continue;
  control.textContent=label;control.classList.add('playback-menu-action');control.setAttribute('aria-label',label);menu.append(control);
 }
 const live=document.querySelector('.iptv-controls');if(live){live.querySelector('.live-badge')?.remove();menu.append(live);}
 const more=document.createElement('button');more.id='playback-more';more.type='button';icon(more,'settings','Playback settings');more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-expanded','false');
 const place=()=>{if(!menu.open)return;const anchor=more.getBoundingClientRect(),height=menu.getBoundingClientRect().height,width=menu.getBoundingClientRect().width,above=anchor.top-8,below=innerHeight-anchor.bottom-8;menu.style.left=Math.max(8,Math.min(innerWidth-width-8,anchor.right-width))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-height-8,above>=height?anchor.top-height-8:below>=height?anchor.bottom+8:above>below?anchor.top-height-8:anchor.bottom+8))+'px';};
 more.onclick=()=>{if(menu.open){menu.close();return;}refreshSettings();refreshLanguages();menu.showModal();more.setAttribute('aria-expanded','true');place();close.focus({preventScroll:true});};
 menu.addEventListener('close',()=>{more.setAttribute('aria-expanded','false');shell.dispatchEvent(new PointerEvent('pointermove'));});
 menu.addEventListener('click',e=>{if(e.target===menu){const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)menu.close();}else if(e.target.closest('.playback-menu-action,.iptv-controls button'))menu.close();});
 document.body.append(menu);
 // Test 13: Two balanced tool families. Move the existing buttons; never clone or
 // recreate media players, playback state, or any room handlers.
 const toolstrip=document.createElement('div');toolstrip.className='xparty-player-toolstrip';
 toolstrip.setAttribute('aria-label','Video controls');
 const leftTools=document.createElement('div'),rightTools=document.createElement('div');
 leftTools.className='xparty-player-tool-family';rightTools.className='xparty-player-tool-family';
 const scaleButton=document.createElement('button');scaleButton.type='button';
 scaleButton.id='xparty-scale-cycle';scaleButton.className='xparty-video-scale-control';
 scaleButton.setAttribute('aria-label','Change video scaling: Auto');
 scaleButton.title='Picture fit: Auto';
 scaleButton.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 12h11m-11 0 2.2-2.2m-2.2 2.2 2.2 2.2m8.8-2.2-2.2-2.2m2.2 2.2-2.2 2.2"/></svg><span class="xparty-scale-a" aria-hidden="true">A</span>';
 const scaleModes=[{label:'Auto',native:0,fit:'contain'},{label:'Fit',native:3,fit:'contain'},{label:'Fill',native:2,fit:'fill'},{label:'Crop',native:1,fit:'cover'}];
 let scaleCycleIndex=0,scaleLabelTimer;
 const scaleNotice=document.createElement('span');scaleNotice.className='xparty-scale-notice';scaleNotice.hidden=true;
 function applyCycleScale(){
  const ctx=getContext(),mode=scaleModes[scaleCycleIndex];
  shell.querySelector('#watch-stage').dataset.videoScale=String(mode.native);
  shell.dataset.xpartyFit=mode.label.toLowerCase();
  scale=mode.native;
  if(ctx.native&&ctx.nativeVideo?.setScale)ctx.nativeVideo.setScale(mode.native);
  else if(ctx.local&&ctx.video)ctx.video.style.setProperty('object-fit',mode.fit,'important');
  scaleButton.title='Picture fit: '+mode.label;
  scaleButton.setAttribute('aria-label','Change video scaling: '+mode.label);
  scaleButton.dataset.mode=mode.label.toLowerCase();
  scaleNotice.textContent=mode.label;scaleNotice.hidden=false;
  clearTimeout(scaleLabelTimer);scaleLabelTimer=setTimeout(()=>{scaleNotice.hidden=true},1150);
 }
 scaleButton.addEventListener('click',()=>{
  const ctx=getContext();if(!ctx.source)return;
  if(!(ctx.native||ctx.local||['file','direct','iptv'].includes(ctx.source.type))){notify('This video provider controls picture scaling.');return;}
  scaleCycleIndex=(scaleCycleIndex+1)%scaleModes.length;applyCycleScale();
 });
 const like=$('video-like');like.classList.add('xparty-hero-heart');
 const volume=document.querySelector('.xparty-volume-toggle');
 rightTools.append(like,scaleButton,more);
 if(volume)rightTools.append(volume);
 toolstrip.append(rightTools);shell.append(scaleNotice);
 $('play').dataset.localizeDynamic='';row.append($('play'),$('time'),toolstrip);
 // Preserve Browse for sources where it is permitted; it remains in the established room search.
 actions.append($('browse'));row.append(actions);shell.append($('fullscreen-video'));
 bar.prepend($('seek'),row);bar.classList.add('playback-refined');shell.classList.add('playback-refined-shell');
 // Existing room control timer owns controls-hidden; this toolbar follows that timer.
 const currentVisibility=()=>{
  const isHidden=shell.classList.contains('controls-hidden');
  if(isHidden&&menu.open)menu.close();
 };
 new MutationObserver(currentVisibility).observe(shell,{attributes:true,attributeFilter:['class']});
 const refresh=()=>{const live=!!document.querySelector('.iptv-controls:not([hidden])')&&!document.body.classList.contains('device-local-video');bar.classList.toggle('playback-live',live);for(const id of ['back10','forward10','previous-video','replay-video'])$(id)?.classList.toggle('unavailable-for-live',live);if($('room').hidden&&menu.open)menu.close();};
 new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['class']});
 new MutationObserver(refresh).observe($('room'),{attributes:true,attributeFilter:['hidden']});
 if(live)new MutationObserver(refresh).observe(live,{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('resize',place,{passive:true});refresh();
}
