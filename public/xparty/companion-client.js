import {isCompanion,normalizeCompanionSource,sanitizeCompanionSnapshot,sanitizeCompanionReport,validCompanionNonce} from './companion-providers.js';

const CHANNEL='xparty-companion-v1';
const nonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const labels={connecting:'Opening your service tab…','waiting-for-video':'Start this title in the service tab.',ready:'Companion connected',playing:'Playing with your room',paused:'Paused with your room','local-paused':'Paused on this device','autoplay-blocked':'Press Play in the service tab.','wrong-title':'Open the same title as your room.','ad-break':'Sync waits during adverts. Resume after the advert.','unavailable':'This player is not available to the companion.','disconnected':'Connect your service tab','setup-required':'Install XParty Companion on desktop Chrome or Edge.'};

export function initCompanion({getContext,notify=()=>{},onIntent=()=>{},onChange=()=>{}}) {
  let pair=null,disposed=false,connecting=false,lastSeq=-1,measurement=null;
  let state={connected:false,installed:false,status:'disconnected',message:labels.disconnected};
  const pending=new Map();
  function change(patch){state={...state,...patch};state.message=labels[state.status]||state.status;onChange({...state});}
  function post(type,fields={}){window.postMessage({channel:CHANNEL,direction:'to-extension',type,...fields},location.origin);}
  function request(type,fields={},timeout=5000){return new Promise((resolve,reject)=>{const requestId=nonce();const timer=setTimeout(()=>{pending.delete(requestId);reject(Error(type==='probe'?labels['setup-required']:'The companion did not respond. Reconnect your service tab.'));},timeout);pending.set(requestId,{resolve,reject,timer,nonce:fields.nonce});post(type,{requestId,...fields});});}
  function snapshot(force=false) {
    const c=getContext()||{},r=c.room,source=normalizeCompanionSource(r?.source);
    if(!source||!c.me||c.connected===false||!r?.source?.id)return null;
    const p=r.playback||{},elapsed=p.playing&&!p.waitingFor?.length?Math.max(0,Date.now()+(c.clockOffset||0)-(p.updatedAt||Date.now()))/1000:0;
    return sanitizeCompanionSnapshot({sourceId:r.source.id,provider:source.type,videoId:source.videoId,url:source.url,position:Math.min(604800,Math.max(0,(p.position||0)+elapsed)),playing:!!p.playing&&!p.waitingFor?.length,localPaused:!!c.localPaused,canControl:r.hostId===c.me||r.mode==='SHARED_CONTROL',revision:p.revision||0,sentAt:Date.now(),force});
  }
  function disconnect(){if(pair)post('disconnect',{nonce:pair.nonce,sourceId:pair.sourceId});pair=null;measurement=null;lastSeq=-1;change({connected:false,status:'disconnected'});}
  function applyPlayback(force=false){if(!pair||disposed)return;const next=snapshot(force);if(!next||next.sourceId!==pair.sourceId){disconnect();return;}post('snapshot',{nonce:pair.nonce,snapshot:next});}
  function update(){if(pair)applyPlayback(false);}
  async function connect() {
    if(disposed||connecting)return false;
    const first=snapshot(true);
    if(!first){notify('Join a room and choose a Netflix or Prime Video title first.');return false;}
    connecting=true;
    try {
      const probe=await request('probe',{},1200);if(!probe?.ok)throw Error(labels['setup-required']);
      change({installed:true});disconnect();
      const latest=snapshot(true);if(!latest||latest.sourceId!==first.sourceId)return false;
      pair={nonce:nonce(),sourceId:latest.sourceId};lastSeq=-1;
      change({status:'connecting'});
      const result=await request('connect',{nonce:pair.nonce,snapshot:latest});
      if(!pair||pair.sourceId!==latest.sourceId)return false;
      if(!result?.ok)throw Error(result?.error||'The companion could not connect.');
      change({connected:true,status:'waiting-for-video'});applyPlayback(true);return true;
    }catch(error){disconnect();change({status:state.installed?'disconnected':'setup-required'});notify(error.message);return false;}
    finally{connecting=false;}
  }
  async function focus(){if(!pair)return connect();try{const result=await request('focus',{nonce:pair.nonce,sourceId:pair.sourceId});if(!result?.ok)throw Error('Service tab closed. Connect it again.');return true;}catch(e){disconnect();notify(e.message);return false;}}
  function receive(event){
    if(event.source!==window||event.origin!==location.origin)return;
    const m=event.data;if(!m||m.channel!==CHANNEL||m.direction!=='from-extension')return;
    if(m.type==='response'&&validCompanionNonce(m.requestId)){
      const item=pending.get(m.requestId);if(!item||item.nonce&&item.nonce!==m.nonce)return;
      clearTimeout(item.timer);pending.delete(m.requestId);item.resolve(m.result);return;
    }
    if(m.type!=='event'||!pair||m.nonce!==pair.nonce||m.sourceId!==pair.sourceId||getContext()?.room?.source?.id!==pair.sourceId)return;
    if(m.disconnected){disconnect();return;}
    const report=sanitizeCompanionReport(m.report);if(!report||report.sourceId!==pair.sourceId||report.seq<=lastSeq)return;lastSeq=report.seq;
    if(report.kind==='status'){change({status:report.status,connected:true});return;}
    measurement={...report,at:Date.now()};
    if(report.kind==='intent')onIntent({playing:report.playing,position:report.position,intent:report.intent});
    else change({connected:true,status:report.playing?'playing':getContext()?.localPaused?'local-paused':'paused'});
  }
  const timer=setInterval(()=>applyPlayback(false),500);
  window.addEventListener('message',receive);window.addEventListener('pagehide',disconnect);
  return {connect,disconnect,focus,update,applyPlayback,
    currentTime:()=>measurement?Math.min(measurement.duration||604800,measurement.position+(measurement.playing?Math.max(0,Date.now()-measurement.at)/1000:0)):0,
    duration:()=>measurement?.duration||0,isPlaying:()=>!!measurement?.playing,
    getState:()=>({...state,provider:getContext()?.room?.source?.type,sourceId:pair?.sourceId||null}),
    dispose(){if(disposed)return;disconnect();disposed=true;clearInterval(timer);window.removeEventListener('message',receive);window.removeEventListener('pagehide',disconnect);for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Companion closed'));}pending.clear();}
  };
}
