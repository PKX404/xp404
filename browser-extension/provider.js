(()=>{
  if(window!==top)return;
  const P=globalThis.XPartyCompanionProtocol;
  let pair=null,sequence=0,video=null,lastStatus='',suppressUntil=0,lastSeek=0,lastRevision=-1,helloPending=false,appliedPlay=false,lastGesture=0;
  const send=message=>chrome.runtime.sendMessage(message).catch(()=>null);
  function report(value){if(!pair)return;send({type:'provider-report',nonce:pair.nonce,report:{...value,sourceId:pair.snapshot.sourceId,seq:++sequence}});}
  function status(value){if(lastStatus!==value){lastStatus=value;report({kind:'status',status:value});}}
  function visible(element){const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(element).visibility!=='hidden';}
  function findVideo(){return [...document.querySelectorAll('video')].filter(visible).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0]||null;}
  function advert(){return [...document.querySelectorAll('[data-uia="ad-badge"],[data-uia="ad-timer"],[data-testid="ad-countdown"],.atvwebplayersdk-ad-timer,.atvwebplayersdk-admessage-text')].some(visible);}
  function sameTitle(){const source=P.parseCompanionLink(location.href);return source?.type===pair?.snapshot.provider&&source?.videoId===pair?.snapshot.videoId;}
  function detach(){pair=null;video=null;lastStatus='';sequence=0;lastRevision=-1;appliedPlay=false;}
  async function hello(){if(helloPending)return;helloPending=true;try{const result=await send({type:'provider-hello'});if(result?.ok&&P.validCompanionNonce(result.nonce)){const snapshot=P.sanitizeCompanionSnapshot(result.snapshot);if(snapshot){if(pair?.nonce!==result.nonce){sequence=0;lastRevision=-1;lastStatus='';}pair={nonce:result.nonce,snapshot};apply();}}}finally{helloPending=false;}}
  function apply(){
    if(!pair)return;
    const s=pair.snapshot;
    if(Date.now()-s.sentAt>8000){detach();return;}
    if(!sameTitle()){status('wrong-title');return;}
    video=findVideo();if(!video||video.readyState<1||!Number.isFinite(video.duration)||video.duration<=0){status('waiting-for-video');return;}
    if(advert()){status('ad-break');return;}
    // No access to DRM, media URLs, provider internals, page script state or video pixels.
    const playing=s.playing&&!s.localPaused;
    const target=Math.min(Math.max(0,video.duration-.05),s.position+(playing?Math.max(0,Date.now()-s.sentAt)/1000:0));
    const changed=s.revision!==lastRevision;
    if((s.force||changed||Date.now()-lastSeek>5000)&&Math.abs(video.currentTime-target)>1.5){
      let seekable=false;for(let i=0;i<video.seekable.length;i++)if(target>=video.seekable.start(i)&&target<=video.seekable.end(i))seekable=true;
      if(seekable){suppressUntil=Date.now()+1200;try{video.currentTime=target;lastSeek=Date.now();}catch{status('unavailable');return;}}
    }
    lastRevision=s.revision;
    if(playing&&video.paused&&!appliedPlay){suppressUntil=Date.now()+1200;appliedPlay=true;Promise.resolve(video.play()).catch(()=>status('autoplay-blocked')).finally(()=>{appliedPlay=false;});}
    if(!playing&&!video.paused){suppressUntil=Date.now()+1200;video.pause();}
    if(lastStatus!=='autoplay-blocked'||!video.paused)status(s.localPaused?'local-paused':video.paused?'paused':'playing');
  }
  function mediaEvent(event){
    if(!pair||event.target!==video||Date.now()<suppressUntil||Date.now()-lastGesture>2500||!sameTitle()||advert()||!Number.isFinite(video.duration))return;
    const intent=event.type==='seeked'?'seek':event.type==='play'?'play':'pause';
    report({kind:'intent',intent,playing:!video.paused&&!video.ended,position:video.currentTime,duration:video.duration});
  }
  for(const type of ['click','keydown'])document.addEventListener(type,event=>{if(event.isTrusted)lastGesture=Date.now();},true);
  for(const type of ['play','pause','seeked'])document.addEventListener(type,mediaEvent,true);
  chrome.runtime.onMessage.addListener(message=>{
    if(message?.type==='detach'&&message.nonce===pair?.nonce){detach();return;}
    if(message?.type!=='snapshot')return;
    const snapshot=P.sanitizeCompanionSnapshot(message.snapshot);if(!snapshot)return;
    if(!pair){hello();return;}
    if(message.nonce!==pair.nonce||snapshot.sourceId!==pair.snapshot.sourceId||snapshot.provider!==pair.snapshot.provider||snapshot.videoId!==pair.snapshot.videoId)return;
    pair.snapshot=snapshot;apply();
  });
  setInterval(()=>{
    if(!pair){hello();return;}
    if(!sameTitle()){status('wrong-title');hello();return;}
    apply();
    if(pair&&video&&Number.isFinite(video.duration)&&video.duration>0&&!advert()&&Date.now()-pair.snapshot.sentAt<=8000)report({kind:'sample',position:Math.max(0,video.currentTime),duration:video.duration,playing:!video.paused&&!video.ended});
  },1000);
  hello();
})();
