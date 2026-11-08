// Xparty PT Test17 Club mode — visual effect is local to this device.
// Web Audio is observed only when the existing movie mixer makes it available.
// Native/embedded providers do not expose PCM data: they get ambient color, not fake beat detection.
const KEY='xparty-pt-club-mode';
const cap=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
let instance=null,sharedNode=null,sharedContext=null;
export function binsToEnergy(data,rate=48000){
 const hz=rate/(data.length*2);
 const band=(low,high)=>{
  const first=Math.max(1,Math.floor(low/hz)),end=Math.min(data.length,Math.ceil(high/hz));
  if(first>=end)return 0;
  let sum=0;for(let k=first;k<end;k++)sum+=data[k];
  return sum/(end-first)/255;
 };
 return {low:band(45,220),mid:band(220,1800),high:band(1800,8200)};
}
export function nextClubPulse({low=0,mid=0,high=0},previous={low:0,level:0,beatAt:-Infinity},now=0){
 const energy=.58*low+.27*mid+.15*high;
 const beat=low>.14&&low-previous.low>.09&&now-previous.beatAt>430;
 const target=energy<.026?0:cap((energy-.025)*.61+(beat?.08:0),0,.34);
 return {low:previous.low*.65+low*.35,level:cap(previous.level*.72+target*.28,0,.34),
  beatAt:beat?now:previous.beatAt,hue:high>low*1.4?195:low>high*1.2?288:248};
}
export function connectClubAudio(movieGain,context){
 if(!movieGain||!context)return;
 sharedNode=movieGain;sharedContext=context;
 instance?.connect(movieGain,context);
}
function icon(){return `<svg class="club-icon-svg" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><path d="M5 23V9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity=".54"/><path d="M10 19V13M15 25V7M20 21V11M25 17V15" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/><path d="M7 26.5H25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".5"/><path d="m24.5 4 .9 2.5L28 7.4l-2.6 1-1 2.5-1-2.6L21 7.4l2.5-.9z" fill="currentColor"/></svg>`}
export function initClubMode({menu,getContext=()=>({})}={}){
 if(!menu||!document.querySelector('#watch-stage'))return {refresh(){},destroy(){}};
 const stage=document.querySelector('#watch-stage'),player=document.querySelector('#player-shell'),room=document.getElementById('room');
 const mq=matchMedia('(prefers-reduced-motion: reduce)');
 let enabled=false;try{enabled=localStorage.getItem(KEY)==='on';}catch{}
 let analyser=null,silentSink=null,gain=null,context=null,data=null,timer=null,disposed=false,level={low:0,level:0,beatAt:-Infinity},phase=0;
 const wash=document.createElement('div');wash.id='xparty-club-wash';wash.setAttribute('aria-hidden','true');stage.append(wash);
 const setting=document.createElement('button');setting.type='button';setting.id='xparty-club-setting';setting.className='xparty-club-setting';
 setting.setAttribute('role','switch');setting.setAttribute('aria-label','Club mode');
 const logo=document.createElement('span');logo.className='xparty-club-symbol';logo.innerHTML=icon();
 const copy=document.createElement('span');copy.className='xparty-club-copy';
 const title=document.createElement('strong');title.textContent='Club mode';
 const description=document.createElement('small');description.id='xparty-club-description';
 copy.append(title,description);
 const toggle=document.createElement('span');toggle.className='xparty-club-toggle';toggle.setAttribute('aria-hidden','true');toggle.innerHTML='<i></i>';
 setting.append(logo,copy,toggle);
 const target=menu.querySelector('.playback-auto-next');
 if(target)target.before(setting);else menu.append(setting);
 const playable=()=>{const ctx=getContext();return !!ctx.source;};
 const canSample=()=>{const ctx=getContext();return !!ctx.source&&!ctx.native&&!ctx.local&&
  ['file','direct','iptv'].includes(ctx.source.type)&&!!analyser&&context?.state==='running'&&
  !!document.getElementById('file-player')?.currentSrc;};
 const live=()=>enabled&&!disposed&&!mq.matches&&!document.hidden&&!room.hidden&&playable()&&
  !document.getElementById('file-player')?.ended;
 function display(value=0,hue=260){
  stage.style.setProperty('--club-level',String(cap(value,0,.34).toFixed(3)));
  stage.style.setProperty('--club-hue',String(hue));
  player.style.setProperty('--club-level',String(cap(value,0,.34).toFixed(3)));
  player.style.setProperty('--club-hue',String(hue));
  player.classList.toggle('xparty-club-active',value>.009);
 }
 function updateLabel(){
  setting.setAttribute('aria-checked',String(enabled));setting.dataset.enabled=String(enabled);
  const ctx=getContext(),analysing=canSample();
  description.textContent=!enabled?'Off · music-reactive lighting':mq.matches?'Paused · Reduce motion enabled':
   !ctx.source?'On · choose a video':analysing?'On · follows music frequencies':
   'On · ambient glow for this player';
 }
 function tick(){
  timer=null;if(!live()){display();return;}
  const ctx=getContext();let energy=0,hue=252;
  const video=ctx.local?ctx.video:document.getElementById('file-player');
  const playing=ctx.native?ctx.nativeVideo?.isPlaying?.():
   ctx.local?(!video.paused&&!video.ended):
   (ctx.source?.type==='youtube'||ctx.source?.type==='vimeo'||ctx.source?.type==='twitch'||ctx.source?.type==='soundcloud')?!!ctx.room?.playback?.playing:!video?.paused;
  if(playing&&canSample()){
   try{analyser.getByteFrequencyData(data);level=nextClubPulse(binsToEnergy(data,context.sampleRate),level,performance.now());
    energy=level.level;hue=level.hue;}catch{energy=0;}
  }else if(playing){
   // Visual-only fallback, NOT claimed to be beat tracking for native/embedded playback.
   phase+=.11;energy=.045+.022*(1+Math.sin(phase))*.5;
   hue=252+Math.round(Math.sin(phase*.23)*35);
  }
  display(energy,hue);timer=setTimeout(tick,85);
 }
 function refresh(){if(disposed)return;updateLabel();if(timer!==null){clearTimeout(timer);timer=null;}
  if(live())tick();else display();
 }
 function connect(node,ctx){
  if(disposed||!node||!ctx||(node===gain&&ctx===context))return;
  if(gain&&analyser){try{gain.disconnect(analyser);analyser.disconnect();silentSink?.disconnect();}catch{}}
  gain=node;context=ctx;
  try{analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.62;
   data=new Uint8Array(analyser.frequencyBinCount);silentSink=context.createGain();silentSink.gain.value=0;gain.connect(analyser);analyser.connect(silentSink);silentSink.connect(context.destination);
  }catch{analyser=null;}
  refresh();
 }
 function toggleOn(){enabled=!enabled;try{localStorage.setItem(KEY,enabled?'on':'off');}catch{}
  level={low:0,level:0,beatAt:-Infinity};refresh();
 }
 setting.addEventListener('click',toggleOn);
 for(const type of ['visibilitychange'])document.addEventListener(type,refresh);
 mq.addEventListener?.('change',refresh);
 const observer=new MutationObserver(refresh);observer.observe(room,{attributes:true,attributeFilter:['hidden']});
 // Refresh after the existing native-player state bridge reports a transition.
 document.addEventListener('xparty:native-playback-state',refresh);
 const video=document.getElementById('file-player');
 for(const e of ['play','playing','pause','ended','emptied','loadeddata'])video.addEventListener(e,refresh);
 if(sharedNode&&sharedContext)connect(sharedNode,sharedContext);
 instance={connect};refresh();
 return {refresh,destroy(){disposed=true;clearTimeout(timer);observer.disconnect();
  document.removeEventListener('visibilitychange',refresh);document.removeEventListener('xparty:native-playback-state',refresh);
  mq.removeEventListener?.('change',refresh);
  for(const e of ['play','playing','pause','ended','emptied','loadeddata'])video.removeEventListener(e,refresh);
  if(gain&&analyser){try{gain.disconnect(analyser);analyser.disconnect();silentSink?.disconnect();}catch{}}display();setting.remove();wash.remove();instance=null;
 }};
}
