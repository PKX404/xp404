import {createImmersiveRenderer} from './immersive.js';

export function colorsFromPixels(data,width,height){
 const sums=Array.from({length:3},()=>[0,0,0,0]);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i+3]<128)continue;const s=sums[Math.min(2,Math.floor(x*3/width))];for(let c=0;c<3;c++)s[c]+=data[i+c];s[3]++;}
 return sums.map(s=>s[3]?s.slice(0,3).map(v=>Math.round(v/s[3])):[47,66,87]);
}
export function ambientActive({hidden,reduced,room,playing,visible=true}){return !!(!hidden&&!reduced&&room?.source&&playing&&visible);}

// One pending callback, driven by presented video frames rather than a slow timer.
export function createFramePump(video,onFrame,{active=()=>true,raf=globalThis.requestAnimationFrame,caf=globalThis.cancelAnimationFrame,setTimer=setTimeout,clearTimer=clearTimeout,now=()=>performance.now()}={}){
 let pending=null,watchdog=null,stopped=true,lastTime=-1,lastDelivery=0;const native=typeof video.requestVideoFrameCallback==='function';
 const request=native?fn=>video.requestVideoFrameCallback(fn):raf|| (fn=>setTimeout(()=>fn(performance.now()),16));
 const cancel=native?id=>video.cancelVideoFrameCallback?.(id):caf||clearTimeout;
 function schedule(){if(stopped||pending!==null||!active())return;pending=request((timeNow,metadata)=>{pending=null;if(stopped||!active())return;const time=metadata?.mediaTime??video.currentTime;if(native||time!==lastTime){lastTime=time;lastDelivery=now();onFrame(timeNow,metadata||{mediaTime:time});}schedule();});}
 // Chrome can suspend presented-frame callbacks when the player scrolls out of
 // view. The room background still needs the current decoded frame, at 10 Hz.
 function guard(){if(!native||watchdog!==null||stopped||!active())return;watchdog=setTimer(()=>{watchdog=null;if(stopped||!active())return;const timeNow=now();if(timeNow-lastDelivery>=100&&video.readyState>=2&&!video.paused&&!video.ended&&video.currentTime!==lastTime){lastTime=video.currentTime;lastDelivery=timeNow;onFrame(timeNow,{mediaTime:lastTime});}guard();},100);}
 return {start(){if(stopped)lastDelivery=now();stopped=false;schedule();guard();},stop(){stopped=true;if(pending!==null)cancel(pending);if(watchdog!==null)clearTimer(watchdog);pending=null;watchdog=null;},get pending(){return pending!==null;}};
}

// Every visible room is immersive. Native media provides frames without capture.
export function initAmbient({getContext,frameBridge,panel=document.getElementById('room'),onMode=()=>{}}={}){
 if(!panel||typeof getContext!=='function')return {update(){},destroy(){}};
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const layer=document.createElement('div');layer.className='room-ambient-layer';layer.setAttribute('aria-hidden','true');panel.prepend(layer);
 const renderer=createImmersiveRenderer(layer,{onContextChange:()=>{failed=false;hasFrame=false;update();}}),fallback=document.createElement('canvas');fallback.width=12;fallback.height=8;const ctx=fallback.getContext('2d',{willReadFrequently:true});
 let key=null,image=null,failed=false,destroyed=false,hasFrame=false,idleTimer=null,frameVideo=null,pump=null,lastFallbackAt=-Infinity,palette=null,suspended=false,boundVideo=null,externalSequence=null;
 function visible(){return !suspended&&!document.hidden&&!panel.hidden&&panel.getClientRects().length>0;}
 function animated(){const c=getContext()||{};return ambientActive({hidden:document.hidden,reduced:motion.matches,room:c.room,playing:c.playing??c.room?.playback?.playing,visible:visible()});}
 function stopFrames(){pump?.stop();pump=null;frameVideo=null;}
 function fluid(){renderer.clear();layer.dataset.mode='fluid';onMode('room',palette);}
 function readPalette(media){ctx.drawImage(media,0,0,12,8);return colorsFromPixels(ctx.getImageData(0,0,12,8).data,12,8);}
 function sample(video,metadata){
  if(failed||destroyed||!visible())return;
  const start=performance.now();
  try{
   if(renderer.render(video)){hasFrame=true;layer.dataset.mode='video';layer.dataset.frameOrigin=metadata?.origin||'decoder';onMode('covered');}
   else if(!renderer.available&&ctx&&start-lastFallbackAt>=100){lastFallbackAt=start;palette=readPalette(video);hasFrame=true;fluid();}
   else if(renderer.available){failed=true;stopFrames();fluid();}
   layer.dataset.renderMs=(performance.now()-start).toFixed(2);if(metadata?.mediaTime!==undefined)layer.dataset.mediaTime=String(metadata.mediaTime);
  }catch{failed=true;stopFrames();fluid();}
 }
 function clear(){stopFrames();renderer.clear();if(image){image.onload=null;image.onerror=null;}key=null;image=null;failed=false;hasFrame=false;externalSequence=null;palette=null;fallback.width=12;delete layer.dataset.mediaTime;delete layer.dataset.frameOrigin;layer.dataset.mode='fluid';}
 const events=['loadeddata','seeked','play','pause','ended','emptied'];
 const videoChanged=()=>{failed=false;hasFrame=false;update();};
 function bindVideo(video){if(boundVideo===video)return;for(const event of events)boundVideo?.removeEventListener(event,videoChanged);stopFrames();boundVideo=video;failed=false;hasFrame=false;for(const event of events)boundVideo?.addEventListener(event,videoChanged);}
 function update(){
  clearTimeout(idleTimer);idleTimer=null;if(destroyed)return;
  const c=getContext()||{},source=c.room?.source,on=!!c.room&&visible();
  // The player supplies its frame source. Rendering does not depend on a provider list.
  bindVideo(c.video||null);
  frameBridge?.watchEmbedded(source,{enabled:on&&!c.nativeActive,playing:animated()});
  panel.classList.toggle('room-immersive-on',on);document.body.classList.toggle('room-immersive-on',on);
  if(!on){stopFrames();if(!c.room||panel.hidden){clear();onMode('home');}return;}
  if(c.nativeActive){stopFrames();renderer.clear();hasFrame=false;layer.dataset.mode='native';onMode('covered');if(!document.hidden)idleTimer=setTimeout(update,1000);return;}
  const nextKey=source?.id||source?.videoId||source?.url||'empty-room';
  if(key!==nextKey){clear();key=nextKey;fluid();
   if(source?.type==='youtube'&&source.videoId&&ctx){const expected=key;image=new Image();image.crossOrigin='anonymous';image.onload=()=>{if(destroyed||key!==expected)return;try{palette=readPalette(image);if(visible()&&!hasFrame)fluid();}catch{}};image.src='https://i.ytimg.com/vi/'+encodeURIComponent(source.videoId)+'/hqdefault.jpg';}
  }
  const video=c.video,external=frameBridge?.ambientFrame;
  if(video&&video.readyState>=2&&!failed){
   if(!hasFrame)sample(video);
   if(animated()&&!video.paused&&!video.ended){if(frameVideo!==video||!pump){stopFrames();frameVideo=video;pump=createFramePump(video,(_,metadata)=>sample(video,metadata),{active:()=>!destroyed&&!failed&&animated()&&frameVideo===video});}pump.start();}else stopFrames();
  }else if(external&&source?.id&&external.sourceId===source.id){stopFrames();if(!hasFrame||externalSequence!==external.sequence){sample(external.image,{origin:'android-player',mediaTime:c.position});externalSequence=external.sequence;}}
  else{stopFrames();fluid();}
  if(!document.hidden)idleTimer=setTimeout(update,1000);
 }
 const pagehide=()=>{suspended=true;stopFrames();clearTimeout(idleTimer);frameBridge?.watchEmbedded(null,{enabled:false});},pageshow=()=>{suspended=false;update();};
 window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);document.addEventListener('visibilitychange',update);motion.addEventListener('change',update);update();
 return {update,destroy(){if(destroyed)return;destroyed=true;clearTimeout(idleTimer);bindVideo(null);frameBridge?.watchEmbedded(null,{enabled:false});window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);document.removeEventListener('visibilitychange',update);motion.removeEventListener('change',update);clear();document.body.classList.remove('room-immersive-on');panel.classList.remove('room-immersive-on');renderer.destroy();layer.remove();onMode('home');}};
}
