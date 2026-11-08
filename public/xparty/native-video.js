// Android supplies a private message port to the top document after navigation.
export function initNativeVideo({onAvailable=()=>{},onReady=()=>{},onState=()=>{},onEnded=()=>{},onError=()=>{}}={}){
 let port=null,available=false,source=null,ready=false,active=false,state={position:0,duration:0,playing:false,at:0},volume=.7,qualityCap=0,scaleMode=0,lastLayout='',lastVisible,lastPlayAt=-Infinity,layoutTimer=null;
 let fastYoutube=false,embeddedAvailable=false,embeddedSource=null,embeddedOptions={},embeddedKey='',embeddedGeneration=0,ambientFrame=null,decoding=null,lastFrameSequence=-1;
 const video=document.getElementById('file-player'),stage=document.getElementById('watch-stage');
 function send(type,fields={}){if(port)port.postMessage(JSON.stringify({type,sourceId:source?.id,...fields}));}
 function isVisible(){return !document.hidden&&!document.getElementById('room').hidden;}
 function clearFrame(){ambientFrame=null;lastFrameSequence=-1;if(decoding){decoding.onload=null;decoding.onerror=null;decoding=null;}}
 function embeddedLayout(){
  if(!embeddedAvailable)return;
  const element=embeddedSource?.type==='youtube'?document.querySelector('#youtube-wrap iframe'):document.querySelector('#vimeo-player iframe');
  const rect=element?.getBoundingClientRect(),enabled=!!(embeddedSource&&embeddedOptions.enabled&&isVisible()&&element?.getClientRects().length&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth);
  const fields=enabled?{sourceId:embeddedSource.id,kind:embeddedSource.type,enabled:true,playing:!!embeddedOptions.playing,viewport:innerWidth,x:rect.x,y:rect.y,width:rect.width,height:rect.height}:{enabled:false};
  const key=JSON.stringify(fields);if(key===embeddedKey)return;embeddedKey=key;embeddedGeneration++;if(!enabled)clearFrame();
  send('ambient-watch',{...fields,generation:embeddedGeneration});
 }
 function watchEmbedded(value,options={}){const next=['youtube','vimeo','twitch'].includes(value?.type)?value:null;if(next?.id!==embeddedSource?.id){clearFrame();embeddedKey='';}embeddedSource=next;embeddedOptions=options;embeddedLayout();}
 function receiveFrame(message){
  if(message.sourceId!==embeddedSource?.id||message.generation!==embeddedGeneration||!embeddedOptions.enabled||!isVisible())return;
  if(message.type==='ambient-unavailable'){clearFrame();onState(message);return;}
  if(decoding||!Number.isSafeInteger(message.sequence)||message.sequence<=lastFrameSequence||typeof message.image!=='string'||message.image.length>4096||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(message.image))return;
  const image=new Image(),generation=embeddedGeneration;decoding=image;
  image.onload=()=>{if(decoding!==image)return;decoding=null;if(generation!==embeddedGeneration||!isVisible()||image.naturalWidth!==20||image.naturalHeight!==12)return;lastFrameSequence=message.sequence;ambientFrame={sourceId:message.sourceId,sequence:message.sequence,image};onState({type:'ambient-frame'});};
  image.onerror=()=>{if(decoding===image)decoding=null;};image.src=message.image;
 }
 function layout(){
  embeddedLayout();const displayNative=active&&isVisible();document.body.classList.toggle('native-media-active',displayNative);document.documentElement.classList.toggle('native-video-through',displayNative);
  if(!source)return;
  // Collapse geometry reads into one frame; do not put rotation behind an
  // IME debounce. The viewport module releases the old orientation's lock.
  if(layoutTimer!==null)return;
  layoutTimer=requestAnimationFrame(()=>{
   layoutTimer=null;if(!source)return;
   const visible=isVisible();
   if(lastVisible!==visible){lastVisible=visible;if(visible)lastLayout='';send('visible',{value:visible});}
   const r=stage.getBoundingClientRect(),geometry={viewport:innerWidth,x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)},key=JSON.stringify(geometry);
   if(lastLayout&&document.body.classList.contains('xparty-ime-lock')&&!document.body.classList.contains('watch-fullscreen')&&JSON.parse(lastLayout).viewport===innerWidth)return;
   if(lastLayout!==key){lastLayout=key;send('layout',geometry);}
  });
 }
 function receive(event){let message;try{message=JSON.parse(event.data);}catch{return;}if(message.type==='available'){available=true;fastYoutube=message.fastYoutube===true;embeddedAvailable=message.ambientSupported===true;onAvailable();onState(message);return;}if(message.type==='ambient-frame'||message.type==='ambient-unavailable'){receiveFrame(message);return;}if(message.sourceId!==source?.id)return;
  if(message.type==='error'){ready=false;active=false;state.playing=false;document.body.classList.remove('native-media-active');document.documentElement.classList.remove('native-video-through');onError(message.message);onState(message);return;}
  // Decoder progress events can omit ready, active, duration, or playing.
  // Missing values must never be interpreted as false and unmount the player.
  const now=performance.now(),position=Number.isFinite(message.position),duration=Number.isFinite(message.duration),playing=typeof message.playing==='boolean';
  if(position||duration||playing){state={position:position?Math.max(0,message.position):state.position+(state.playing?Math.max(0,now-state.at)/1000:0),duration:duration?Math.max(0,message.duration):state.duration,playing:playing?message.playing:state.playing,at:now};}
  if(typeof message.ready==='boolean')ready=message.ready;
  // Preserve the native surface once a stream has become visible. Transient
  // active:false decoder events during Android layout/buffering must not
  // toggle the WebView's transparent aperture over the playing frames.
  const wasActive=active;
  if(message.active===true||message.type==='ready'&&ready)active=true;
  if(message.type==='ended'&&message.active===false)active=false;
  // Progress changes the clock, not the Android surface bounds.
  if(wasActive!==active)layout();
  if(message.type==='ready')onReady();else if(message.type==='ended')onEnded();onState(message);
 }
 const connect=e=>{if(e.data!=='xparty-native-video-v1'||e.ports?.length!==1||e.source!==null||window!==window.top||!navigator.userAgent.includes('XpartyAndroid/'))return;port?.close();port=e.ports[0];port.onmessage=receive;port.start();send('hello');};window.addEventListener('message',connect);
 const onScroll=()=>{if(!document.body.classList.contains('xparty-ime-lock'))layout();};
 const observer=new ResizeObserver(layout);observer.observe(stage);window.addEventListener('resize',layout);window.addEventListener('xparty:native-resume',layout);window.addEventListener('xparty:ime-settled',layout);window.addEventListener('xparty:room-layout',layout);window.addEventListener('scroll',onScroll,{passive:true});document.addEventListener('visibilitychange',layout);
 const roomObserver=new MutationObserver(layout);roomObserver.observe(document.getElementById('room'),{attributes:true,attributeFilter:['hidden']});
 function stop(){cancelAnimationFrame(layoutTimer);layoutTimer=null;lastPlayAt=-Infinity;watchEmbedded(null,{enabled:false});if(source)send('stop');source=null;ready=false;active=false;lastLayout='';lastVisible=undefined;state={position:0,duration:0,playing:false,at:0};document.body.classList.remove('native-media-active');document.documentElement.classList.remove('native-video-through');}
 return {
  get available(){return available;},get active(){return active&&!document.getElementById('room').hidden;},get ready(){return ready;},get ambientFrame(){return ambientFrame;},watchEmbedded,handles(value){return available&&!!value&&(['file','direct','iptv'].includes(value.type)||value.type==='youtube'&&fastYoutube);},
  load(value,{base,token}){if(!available)return false;stop();source=value;if(video.hasAttribute('src')){video.pause();video.removeAttribute('src');video.load();}if(value.type==='file'&&!value.uploaded)return true;send('load',{kind:value.type,url:value.type==='file'?base+'/api/file/'+value.id:value.type==='youtube'?'https://www.youtube.com/watch?v='+value.videoId:value.url,token:value.type==='file'?token:undefined});send('volume',{value:volume});send('quality-cap',{value:qualityCap});send('scale-mode',{value:scaleMode});layout();return true;},
  currentTime(){return Math.min(state.duration||Infinity,state.position+(state.playing?(performance.now()-state.at)/1000:0));},duration(){return state.duration||0;},isPlaying(){return state.playing;},
  play(){const now=performance.now();if(now-lastPlayAt<1500)return;lastPlayAt=now;state.position=this.currentTime();state.playing=true;state.at=now;send('playback',{playing:true});},pause(){lastPlayAt=-Infinity;state.position=this.currentTime();state.playing=false;send('playback',{playing:false});},seek(position){if(!Number.isFinite(position))return;position=Math.max(0,Math.min(state.duration||Infinity,position));state.position=position;state.at=performance.now();send('playback',{position,playing:state.playing});},
  setVolume(value){if(!Number.isFinite(value))return;volume=Math.max(0,Math.min(1,value));send('volume',{value:volume});},setQuality(value){qualityCap=[0,240,360,720].includes(value)?value:0;if(source)send('quality-cap',{value:qualityCap});},setScale(value){scaleMode=[0,1,2,3,4].includes(value)?value:0;if(source)send('scale-mode',{value:scaleMode});},setSpeed(value){if(Number.isFinite(value)&&value>=.5&&value<=2&&source)send('speed',{value});},prefetchYoutube(id){if(fastYoutube&&/^[\w-]{11}$/.test(id))send('prefetch',{url:'https://www.youtube.com/watch?v='+id});},setFullscreen(value){send('fullscreen',{value:!!value});},stop,layout,
  destroy(){stop();port?.close();window.removeEventListener('message',connect);observer.disconnect();roomObserver.disconnect();window.removeEventListener('resize',layout);window.removeEventListener('xparty:native-resume',layout);window.removeEventListener('xparty:ime-settled',layout);window.removeEventListener('xparty:room-layout',layout);window.removeEventListener('scroll',onScroll);document.removeEventListener('visibilitychange',layout);}
 };
}
