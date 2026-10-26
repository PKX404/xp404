// Generated from public/xparty/companion-providers.js by build.mjs.
(()=>{
// Shared, credential-free protocol. Keep browser-extension/protocol.js generated with build.mjs.
const COMPANION_PROVIDERS = Object.freeze([
  Object.freeze({id:'netflix',name:'Netflix',home:'https://www.netflix.com/browse',mode:'companion',label:'Desktop companion'}),
  Object.freeze({id:'prime',name:'Prime Video',home:'https://www.primevideo.com/',mode:'companion',label:'Desktop companion'})
]);
const PRIME_HOSTS = new Set(['primevideo.com','www.primevideo.com','www.amazon.com','www.amazon.co.uk','www.amazon.de','www.amazon.co.jp','www.amazon.in']);
const isCompanion = source => source?.type === 'netflix' || source?.type === 'prime';
function parseCompanionLink(value) {
  if(typeof value !== 'string' || value.length > 2048)return null;
  try {
    const u=new URL(value.trim());
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    if(['netflix.com','www.netflix.com'].includes(u.hostname)) {
      const videoId=u.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(?:watch|title)\/([0-9]{6,12})\/?$/)?.[1];
      return videoId?{type:'netflix',videoId,url:'https://www.netflix.com/watch/'+videoId,title:'Netflix'}:null;
    }
    if(PRIME_HOSTS.has(u.hostname)) {
      const prime=u.hostname==='primevideo.com'||u.hostname==='www.primevideo.com';
      const videoId=(prime?u.pathname.match(/^\/(?:[a-z]{2}(?:-[a-zA-Z]{2})?\/)?(?:detail|dp)\/(?:[^/]+\/)?([A-Za-z0-9]{10,32})\/?$/):u.pathname.match(/^\/gp\/video\/detail\/([A-Za-z0-9]{10,32})(?:\/ref=[^/]*)?\/?$/))?.[1]?.toUpperCase();
      if(videoId)return {type:'prime',videoId,url:prime?'https://www.primevideo.com/detail/'+videoId:'https://'+u.hostname+'/gp/video/detail/'+videoId,title:'Prime Video'};
    }
  }catch{}
  return null;
}
function normalizeCompanionSource(source) {
  if(!isCompanion(source))return null;
  const parsed=parseCompanionLink(source.url);
  if(!parsed||parsed.type!==source.type||source.videoId!==undefined&&source.videoId!==parsed.videoId)return null;
  return parsed;
}
function isCompanionRoomURL(value) {
  try {
    const u=new URL(value);
    if(u.username||u.password)return false;
    const local=u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&['8787','8799','8801'].includes(u.port);
    const hosted=u.protocol==='https:'&&!u.port&&u.hostname==='pkxparty.onrender.com';
    const pages=u.protocol==='https:'&&!u.port&&u.hostname==='pkx404.github.io'&&/^\/xparty(?:\/|$)/.test(u.pathname);
    return (local||hosted)&&/^\/(?:xparty(?:\/index\.html|\/)?|index\.html)?$/.test(u.pathname)||pages;
  }catch{return false;}
}
const validCompanionNonce = value => typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const validCompanionSourceId = value => typeof value==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(value);
const seconds = value => typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=604800;
function sanitizeCompanionSnapshot(value,now=Date.now()) {
  if(!value||!validCompanionSourceId(value.sourceId)||!seconds(value.position)||typeof value.playing!=='boolean'||typeof value.localPaused!=='boolean'||typeof value.canControl!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isFinite(value.sentAt)||Math.abs(now-value.sentAt)>15000)return null;
  const source=normalizeCompanionSource({type:value.provider,url:value.url,videoId:value.videoId});
  if(!source)return null;
  return {sourceId:value.sourceId,provider:source.type,videoId:source.videoId,url:source.url,position:value.position,playing:value.playing,localPaused:value.localPaused,canControl:value.canControl,revision:value.revision,sentAt:value.sentAt,force:value.force===true};
}
function sanitizeCompanionReport(value) {
  if(!value||!validCompanionSourceId(value.sourceId)||!Number.isSafeInteger(value.seq)||value.seq<0)return null;
  const statuses=['waiting-for-video','ready','playing','paused','local-paused','autoplay-blocked','unavailable','wrong-title','ad-break'];
  if(value.kind==='status'&&statuses.includes(value.status))return {kind:'status',sourceId:value.sourceId,seq:value.seq,status:value.status};
  if(!['sample','intent'].includes(value.kind)||!seconds(value.position)||!seconds(value.duration)||typeof value.playing!=='boolean')return null;
  if(value.kind==='intent'&&!['play','pause','seek'].includes(value.intent))return null;
  return {kind:value.kind,sourceId:value.sourceId,seq:value.seq,position:value.position,duration:value.duration,playing:value.playing,...(value.kind==='intent'?{intent:value.intent}:{})};
}

globalThis.XPartyCompanionProtocol=Object.freeze({COMPANION_PROVIDERS,isCompanion,parseCompanionLink,normalizeCompanionSource,isCompanionRoomURL,validCompanionNonce,validCompanionSourceId,sanitizeCompanionSnapshot,sanitizeCompanionReport});
})();
