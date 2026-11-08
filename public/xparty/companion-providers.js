// Shared, credential-free protocol. Keep browser-extension/protocol.js generated with build.mjs.
export const COMPANION_PROVIDERS = Object.freeze([
  Object.freeze({id:'netflix',name:'Netflix',home:'https://www.netflix.com/browse',mode:'companion',label:'Desktop companion'}),
  Object.freeze({id:'prime',name:'Prime Video',home:'https://www.primevideo.com/',mode:'companion',label:'Desktop companion'})
]);
const PRIME_HOSTS = new Set(['primevideo.com','www.primevideo.com','www.amazon.com','www.amazon.co.uk','www.amazon.de','www.amazon.co.jp','www.amazon.in']);
export const isCompanion = source => source?.type === 'netflix' || source?.type === 'prime';
export const BROWSE_PROVIDERS = Object.freeze({
  netflix:'https://www.netflix.com/browse',prime:'https://www.primevideo.com/',
  twitch:'https://www.twitch.tv/directory',vimeo:'https://vimeo.com/watch',soundcloud:'https://soundcloud.com/discover'
});
// Only public title identifiers cross the extension bridge. Never forward queries,
// cookies, tokens, arbitrary URLs, or URLs from tabs not opened by the picker.
export function normalizeBrowseSelection(provider,value) {
  if(!Object.hasOwn(BROWSE_PROVIDERS,provider)||typeof value!=='string'||value.length>2048)return null;
  let u;try{u=new URL(value);}catch{return null;}
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(provider==='netflix'||provider==='prime'){
    const source=parseCompanionLink(u.origin+u.pathname);return source?.type===provider?source:null;
  }
  if(provider==='twitch'&&['twitch.tv','www.twitch.tv','m.twitch.tv'].includes(u.hostname)){
    const video=u.pathname.match(/^\/videos\/([1-9][0-9]{0,19})\/?$/)?.[1];
    if(video)return {type:provider,videoId:'video:'+video,url:'https://www.twitch.tv/videos/'+video,title:'Twitch video',live:false};
    const channel=u.pathname.match(/^\/([a-zA-Z0-9_]{1,25})\/?$/)?.[1]?.toLowerCase();
    if(channel&&!['directory','downloads','jobs','p','settings','subscriptions','turbo','videos','search','inventory','wallet','friends','messages','login','signup','clip','clips','collections'].includes(channel))return {type:provider,videoId:'channel:'+channel,url:'https://www.twitch.tv/'+channel,title:channel+' · Twitch live',live:true};
  }
  if(provider==='vimeo'&&['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)){
    const id=u.pathname.match(/^\/(?:video\/)?([1-9][0-9]{5,11})\/?$/)?.[1];
    if(id)return {type:provider,videoId:id,url:'https://vimeo.com/'+id,title:'Vimeo video'};
  }
  if(provider==='soundcloud'&&['soundcloud.com','www.soundcloud.com'].includes(u.hostname)){
    const path=u.pathname.match(/^\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,99})\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,254})\/?$/);
    const reserved=['sets','likes','reposts','tracks','albums','popular-tracks','followers','following','comments','recommended','discover','stream','search','charts','you','upload','pages','terms','settings','stations'];
    if(path&&!reserved.includes(path[1].toLowerCase())&&!reserved.includes(path[2].toLowerCase())){const url='https://soundcloud.com/'+path[1]+'/'+path[2];return {type:provider,videoId:url,url,title:path[2].replaceAll('-',' ')+' · SoundCloud'};}
  }
  return null;
}
export function parseCompanionLink(value) {
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
export function normalizeCompanionSource(source) {
  if(!isCompanion(source))return null;
  const parsed=parseCompanionLink(source.url);
  if(!parsed||parsed.type!==source.type||source.videoId!==undefined&&source.videoId!==parsed.videoId)return null;
  return parsed;
}
export function isCompanionRoomURL(value) {
  try {
    const u=new URL(value);
    if(u.username||u.password)return false;
    const local=u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&['8787','8799','8801'].includes(u.port);
    const hosted=u.protocol==='https:'&&!u.port&&['pkxparty.onrender.com','xp404.onrender.com'].includes(u.hostname);
    const pages=u.protocol==='https:'&&!u.port&&u.hostname==='pkx404.github.io'&&/^\/xparty(?:\/|$)/.test(u.pathname);
    return (local||hosted)&&/^\/(?:xparty(?:\/index\.html|\/)?|index\.html)?$/.test(u.pathname)||pages;
  }catch{return false;}
}
export const validCompanionNonce = value => typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export const validCompanionSourceId = value => typeof value==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(value);
const seconds = value => typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=604800;
export function sanitizeCompanionSnapshot(value,now=Date.now()) {
  if(!value||!validCompanionSourceId(value.sourceId)||!seconds(value.position)||typeof value.playing!=='boolean'||typeof value.localPaused!=='boolean'||typeof value.canControl!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isFinite(value.sentAt)||Math.abs(now-value.sentAt)>15000)return null;
  const source=normalizeCompanionSource({type:value.provider,url:value.url,videoId:value.videoId});
  if(!source)return null;
  return {sourceId:value.sourceId,provider:source.type,videoId:source.videoId,url:source.url,position:value.position,playing:value.playing,localPaused:value.localPaused,canControl:value.canControl,revision:value.revision,sentAt:value.sentAt,force:value.force===true};
}
export function sanitizeCompanionReport(value) {
  if(!value||!validCompanionSourceId(value.sourceId)||!Number.isSafeInteger(value.seq)||value.seq<0)return null;
  const statuses=['waiting-for-video','ready','playing','paused','local-paused','autoplay-blocked','unavailable','wrong-title','ad-break'];
  if(value.kind==='status'&&statuses.includes(value.status))return {kind:'status',sourceId:value.sourceId,seq:value.seq,status:value.status};
  if(!['sample','intent'].includes(value.kind)||!seconds(value.position)||!seconds(value.duration)||typeof value.playing!=='boolean')return null;
  if(value.kind==='intent'&&!['play','pause','seek'].includes(value.intent))return null;
  return {kind:value.kind,sourceId:value.sourceId,seq:value.seq,position:value.position,duration:value.duration,playing:value.playing,...(value.kind==='intent'?{intent:value.intent}:{})};
}
