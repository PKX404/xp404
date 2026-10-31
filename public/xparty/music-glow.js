// Beat Glow: optional local music visualization; never reads the microphone.
const KEY='xparty-beat-glow-v1',clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function spectrumBands(bytes,rate=48000){
 const binHz=rate/(bytes.length*2);
 const average=(low,high)=>{
  const a=Math.max(1,Math.ceil(low/binHz)),b=Math.min(bytes.length,Math.ceil(high/binHz));
  let sum=0;for(let i=a;i<b;i++)sum+=bytes[i];
  return b>a?sum/(b-a)/255:0;
 };
 return {bass:average(40,220),mid:average(220,2000),treble:average(2000,8500)};
}
export function nextGlow({bass=0,mid=0,treble=0},old={bass:0,level:0,beatAt:-Infinity},now=0){
 const energy=.56*bass+.28*mid+.16*treble;
 const beat=bass>.13&&bass-old.bass>.085&&now-old.beatAt>420;
 const target=energy<.025?0:clamp((energy-.025)*.9+(beat?.13:0),0,.48);
 return {level:clamp(old.level*.67+target*.33,0,.48),bass:old.bass*.7+bass*.3,
  beatAt:beat?now:old.beatAt,hue:bass>treble*1.25?282:treble>bass*1.3?193:232};
}
export function initMusicGlow({video,stage,getSource,isNative=()=>false,hasLocalOverride=()=>false,requestSound=async()=>{}}={}){
 if(!video||!stage)return {connect(){},refresh(){},destroy(){}};
 const room=document.getElementById('room'),bar=stage.closest('#player-shell')?.querySelector('.player-bar');
 const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 let enabled=false;try{enabled=localStorage.getItem(KEY)==='on';}catch{}
 let audioNode=null,context=null,analyser=null,bytes=null,timer=null,destroyed=false;
 let history={bass:0,level:0,beatAt:-Infinity};
 const wash=document.createElement('div');wash.className='xparty-beat-wash';wash.setAttribute('aria-hidden','true');stage.append(wash);
 const button=document.createElement('button');button.type='button';button.id='xparty-beat-button';button.className='quiet xparty-beat-button';
 button.textContent='♫';button.title='Toggle music-reactive glow';button.setAttribute('aria-label','Toggle music-reactive glow');bar?.append(button);
 const section=document.querySelector('#settings-movie-volume')?.closest('section');
 const label=document.createElement('label');label.className='switch-row xparty-beat-setting';
 const name=document.createElement('span');name.textContent='Music-reactive glow';
 const check=document.createElement('input');check.type='checkbox';check.id='xparty-music-glow-setting';check.setAttribute('role','switch');label.append(name,check);
 const info=document.createElement('p');info.id='xparty-beat-info';info.className='small';info.setAttribute('role','status');section?.append(label,info);
 const supported=()=>!!getSource?.()&&['file','direct','iptv'].includes(getSource().type)&&!isNative()&&!hasLocalOverride();
 const active=()=>enabled&&!destroyed&&!document.hidden&&!room?.hidden&&!motion?.matches&&supported()
  &&!!analyser&&context?.state==='running'&&!video.paused&&!video.ended&&!!video.currentSrc;
 function paint(level=0,hue=232){stage.style.setProperty('--xparty-beat-level',level.toFixed(3));stage.style.setProperty('--xparty-beat-hue',String(hue));stage.classList.toggle('xparty-beat-active',level>.004);}
 function status(){
  button.setAttribute('aria-pressed',String(enabled));check.checked=enabled;
  info.textContent=!enabled?'Off · enable for soft beat-synced colors.':
   motion?.matches?'Paused · Reduce motion is enabled.':
   !supported()?'On · works with compatible in-app video, not embedded or Android native players.':
   !analyser?'On · tap Enable sound to activate audio analysis.':
   'On · reacts to the sound playing on this device, without microphone access.';
 }
 function tick(){
  timer=null;if(!active()){paint();return;}
  analyser.getByteFrequencyData(bytes);history=nextGlow(spectrumBands(bytes,context.sampleRate),history,performance.now());
  paint(history.level,history.hue);timer=setTimeout(tick,75);
 }
 function refresh(){if(timer!==null){clearTimeout(timer);timer=null;}
  if(active())tick();else{history={bass:0,level:0,beatAt:-Infinity};paint();}
  status();
 }
 async function setEnabled(next){enabled=!!next;try{localStorage.setItem(KEY,enabled?'on':'off');}catch{}
  if(enabled){try{await requestSound();}catch{}}refresh();
 }
 function connect(sourceNode,audioCtx){
  if(!sourceNode||!audioCtx||destroyed||audioNode===sourceNode&&context===audioCtx)return;
  if(audioNode&&analyser){try{audioNode.disconnect(analyser);}catch{}}
  audioNode=sourceNode;context=audioCtx;analyser=context.createAnalyser();
  analyser.fftSize=1024;analyser.smoothingTimeConstant=.55;bytes=new Uint8Array(analyser.frequencyBinCount);
  audioNode.connect(analyser); // Existing movie sound continues to the destination unchanged.
  refresh();
 }
 const onClick=()=>void setEnabled(!enabled),onCheck=()=>void setEnabled(check.checked),onMedia=()=>refresh();
 button.addEventListener('click',onClick);check.addEventListener('change',onCheck);
 for(const event of ['play','playing','pause','ended','emptied','loadeddata'])video.addEventListener(event,onMedia);
 document.addEventListener('visibilitychange',onMedia);motion?.addEventListener?.('change',onMedia);
 const observer=new MutationObserver(onMedia);if(room)observer.observe(room,{attributes:true,attributeFilter:['hidden']});
 refresh();return{connect,refresh,destroy(){destroyed=true;if(timer!==null)clearTimeout(timer);observer.disconnect();
  document.removeEventListener('visibilitychange',onMedia);motion?.removeEventListener?.('change',onMedia);
  for(const event of ['play','playing','pause','ended','emptied','loadeddata'])video.removeEventListener(event,onMedia);
  if(audioNode&&analyser){try{audioNode.disconnect(analyser);}catch{}}wash.remove();button.remove();label.remove();info.remove();paint();
 }};
}
