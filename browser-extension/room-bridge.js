(()=>{
  const P=globalThis.XPartyCompanionProtocol,CHANNEL='xparty-companion-v1';
  if(!P.isCompanionRoomURL(location.href)||window!==top)return;
  let lastGesture=0;
  document.addEventListener('click',e=>{if(e.isTrusted)lastGesture=Date.now();},true);
  const emit=value=>window.postMessage({channel:CHANNEL,direction:'from-extension',...value},location.origin);
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin)return;
    const m=event.data;if(!m||m.channel!==CHANNEL||m.direction!=='to-extension')return;
    if(m.type==='probe'&&P.validCompanionNonce(m.requestId)){emit({type:'response',requestId:m.requestId,result:{ok:true,version:'0.1.0'}});return;}
    if(!P.validCompanionNonce(m.nonce))return;
    let payload;
    if(m.type==='connect'||m.type==='snapshot'){
      const snapshot=P.sanitizeCompanionSnapshot(m.snapshot);if(!snapshot)return;
      if(m.type==='connect'&&Date.now()-lastGesture>2500){emit({type:'response',requestId:m.requestId,nonce:m.nonce,result:{ok:false,error:'Click Connect in your XParty room to open a service tab.'}});return;}
      payload={type:'room-'+m.type,nonce:m.nonce,snapshot};
    }else if(['disconnect','focus'].includes(m.type)&&P.validCompanionSourceId(m.sourceId))payload={type:'room-'+m.type,nonce:m.nonce,sourceId:m.sourceId};
    else return;
    chrome.runtime.sendMessage(payload).then(result=>{
      if(P.validCompanionNonce(m.requestId))emit({type:'response',requestId:m.requestId,nonce:m.nonce,result});
    }).catch(()=>{if(P.validCompanionNonce(m.requestId))emit({type:'response',requestId:m.requestId,nonce:m.nonce,result:{ok:false,error:'Reload XParty after installing or updating the companion.'}});});
  });
  chrome.runtime.onMessage.addListener(message=>{if(message?.type==='companion-event'&&P.validCompanionNonce(message.nonce))emit({type:'event',nonce:message.nonce,sourceId:message.sourceId,report:message.report,disconnected:message.disconnected===true});});
})();
