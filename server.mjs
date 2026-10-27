import {createVideoInvitations} from './video-invitations.mjs';
import {startSelectedPlayback} from './playback-start.mjs';
import {handleCompanionDownload,normalizeCompanionSource} from './companion.mjs';
import {isCompanion} from './public/xparty/companion-providers.js';
import {createAccountAuth} from './account-auth.mjs';
import {tickTogether,togetherView} from './together.mjs';
import {validProviderId,publicVideoURL,publicStreamURL,publicRadioURL,isEmbedded,isLiveSource} from './public/xparty/providers.js';
import {profileData} from './public/xparty/profile-data.js';
import {queueOrder,configureQueue,nextQueued} from './public/xparty/queue-policy.js';
import {createOwnerControl} from './owner-control.mjs';
import {directorySettings,updateDirectory,publicRooms} from './room-directory.mjs';
import {skipState,configureSkip,resetSkipVotes} from './skip-voting.mjs';
import {createCallSeats} from './call-seats.mjs';
import {MAX_VIDEO_BYTES,MAX_CALL_SEATS,validRoomCapacity,roomIsFull,normalizeRoomCode,validRoomCode} from './public/xparty/limits.js';
import {createRoomInteractions} from './room-interactions.mjs';
import {createRoomSocial} from './room-social.mjs';
import http from 'node:http';
import {readFile,mkdtemp,rm,open} from 'node:fs/promises';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname,join,relative,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {createPartyControl,partyState} from './party-control.mjs';
import {searchYouTube} from './youtube-search.mjs';
import {createAttachmentStore} from './attachments.mjs';
const ROOT=fileURLToPath(new URL('./public',import.meta.url));
const MAX_FILE=MAX_VIDEO_BYTES,CHUNK=2*1024*1024,MAX_STORAGE=1024*1024*1024;
const clean=(v,n)=>String(v??'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,n);
const finite=(v,max=604800)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const code=()=>[...randomBytes(7)].map(x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
const secret=()=>randomBytes(32).toString('base64url');
const randomName=()=>['Happy','Sunny','Lucky','Cosmic','Mint','Peach','Silver','Mellow'][randomBytes(1)[0]%8]+' '+['Panda','Fox','Otter','Owl','Koala','Tiger','Robin','Deer'][randomBytes(1)[0]%8];
export function createXparty(options={}) {
 const graceMs=options.graceMs??120000;
 const rooms=new Map(),clients=new Map(),buckets=new Map(),files=new Map(),searchCache=new Map();let storage=0;
 const publicAuthKey=(()=>{const key=process.env.SUPABASE_ANON_KEY||'';if(key.startsWith('sb_publishable_'))return key;try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon')return key;}catch{}return null;})();
 const accountAuth=createAccountAuth({url:process.env.SUPABASE_URL,publicKey:publicAuthKey,fetcher:options.accountFetch});
 const statePath=options.statePath??process.env.STATE_PATH;let saveTimer;
 const allowed=new Set((process.env.ALLOWED_ORIGINS||'https://pkx404.github.io,http://localhost:8787,http://127.0.0.1:8787').split(',').map(x=>x.trim()));
 if(process.env.RENDER_EXTERNAL_URL)allowed.add(process.env.RENDER_EXTERNAL_URL);
 const originOK=req=>allowed.has(req.headers.origin);
 function persist(){if(!statePath)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{const data=[...rooms.values()].map(r=>({...r,people:[...r.people.values()].map(({ws,...p})=>({...p,ready:false,mic:false,camera:false})),source:r.source?.type==='file'?null:r.source,playback:{...r.playback,playing:false}}));writeFileSync(statePath+'.tmp',JSON.stringify(data),{mode:0o600});renameSync(statePath+'.tmp',statePath);}catch(e){console.error('Room checkpoint failed:',e.code);}},150);}
 if(statePath)try{for(const r of JSON.parse(readFileSync(statePath,'utf8'))){r.capacity=validRoomCapacity(r.capacity)?r.capacity:2;r.people=new Map(r.people.map(p=>{p.ws=null;clients.set(p.token,p);return[p.id,p];}));rooms.set(r.code,r);}}catch{}
 function rate(key,limit,ms){const now=Date.now();let b=buckets.get(key);if(!b||b.until<now){b={count:0,until:now+ms};buckets.set(key,b);}return ++b.count<=limit;}
 const ip=req=>process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
 function send(ws,obj){if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>1024*1024)return ws.close(1013,'Slow connection');const payload=JSON.stringify(obj);owner.observeOutput(Buffer.byteLength(payload));ws.send(payload);}}
 const online=p=>p.ws?.readyState===WebSocket.OPEN;
 const social=createRoomSocial({send,broadcast,online,rate,persist});
 const interactions=createRoomInteractions({send,state,choose,online,rate});
 const callSeats=createCallSeats({online,send,state,rate});
 const videoInvitations=createVideoInvitations({online,send,state,rate});
 const attachments=createAttachmentStore({online:p=>online(p)&&clients.get(p.token)===p&&rooms.has(p.code)});
 function broadcast(r,obj){for(const p of r.people.values())send(p.ws,obj);}
 function snapshot(r){return {code:r.code,...interactions.view(r),...directorySettings(r),skipVoting:skipState(r,online),hostId:r.hostId,ownerId:r.ownerId||r.hostId,...partyState(r),hostReconnecting:!online(r.people.get(r.hostId)||{}),bufferTogether:r.bufferTogether!==false,pttEnabled:!!r.pttEnabled,theme:r.theme||null,guestThemes:!!r.guestThemes,autoplay:queueOrder(r)==='fifo',queueOrder:queueOrder(r),autoAdvance:r.autoAdvance!==false,capacity:r.capacity,locked:r.locked,source:r.source,sourceLikes:r.sourceLikes||[],playback:r.playback,queue:r.queue||[],people:[...r.people.values()].map(p=>({id:p.id,name:p.name,profile:profileData(p.profile),session:p.session||0,online:online(p),presence:online(p)?'ACTIVE':p.left?'LEFT':'DISCONNECTED',reservedUntil:p.reservedUntil||null,inCall:!!p.inCall,mic:p.mic,camera:p.camera,ready:p.ready,loadStatus:p.loadStatus||'',chatBlocked:!!p.chatBlocked,micBlocked:p.micBlocked,cameraAllowed:p.cameraAllowed,cameraRequested:p.cameraRequested,pttApproved:!!p.pttApproved,pttRequested:!!p.pttRequested,seatRequested:!!p.seatRequested})),serverTime:Date.now()};}
 function state(r){startSelectedPlayback(r,online);if(skipState(r,online).ready){const item=nextQueued(r),host=r.people.get(r.hostId);if(item&&host&&online(host)){const previous=r.source&&r.source.type!=='file'?{provider:r.source.type,videoId:r.source.videoId,url:r.source.url,title:r.source.title}:null;r.queue=r.queue.filter(q=>q.id!==item.id);resetSkipVotes(r);control.cancel(r,'The room voted to skip.');choose(r,host,{type:item.provider||'youtube',videoId:item.videoId,url:item.url,title:item.title});r.previousSource=previous;return;}}syncBuffering(r);broadcast(r,{type:'state',room:snapshot(r)});persist();}
 function ice(id){const out=[{urls:'stun:stun.l.google.com:19302'}];if(process.env.TURN_URLS&&process.env.TURN_SECRET){const username=`${Math.floor(Date.now()/1000)+86400}:${id}`;out.push({urls:process.env.TURN_URLS.split(','),username,credential:createHmac('sha1',process.env.TURN_SECRET).update(username).digest('base64')});}if(process.env.ICE_SERVERS_JSON)out.push(...JSON.parse(process.env.ICE_SERVERS_JSON));return out;}
 function welcome(p,r){const iceServers=ice(p.id);send(p.ws,{type:'welcome',id:p.id,token:p.token,room:snapshot(r),friendRequests:social.view(r,p),history:(r.history||[]).filter(m=>!m.to||m.from===p.id||m.to===p.id),iceServers,hasRelay:iceServers.some(s=>[s.urls].flat().some(u=>/^turns?:/.test(u))),searchEnabled:true});}
 function dropFile(id){const f=files.get(id);if(f){files.delete(id);storage-=f.size;rm(f.dir,{recursive:true,force:true}).catch(()=>{});}}
 function choose(r,p,s){if(!s||!['youtube','vimeo','twitch','soundcloud','netflix','prime','direct','iptv','file'].includes(s.type))return false;if(isCompanion(s)&&!normalizeCompanionSource(s))return false;if(isEmbedded(s)&&!validProviderId(s.type,s.videoId))return false;if(s.type==='direct'&&!publicVideoURL(s.url)||s.type==='iptv'&&!(s.radio===true?publicRadioURL(s.url):publicStreamURL(s.url)))return false;if(s.type==='file'&&(!finite(s.size,MAX_FILE)||!s.size||!/^video\//.test(s.mime)))return false;
  if(s.type==='file'&&storage+s.size>MAX_STORAGE){send(p.ws,{type:'error',message:'Temporary video storage is busy. Try a smaller file or YouTube.'});return false;}
  if(r.source?.type==='file')dropFile(r.source.id);
  r.source={type:s.type,id:randomUUID(),title:clean(s.title,150)||'YouTube video',owner:p.id,...(isCompanion(s)?{videoId:normalizeCompanionSource(s).videoId,url:normalizeCompanionSource(s).url}:isEmbedded(s)?{videoId:s.videoId}:s.type==='iptv'?{url:s.radio===true?publicRadioURL(s.url):publicStreamURL(s.url),...(s.radio===true?{radio:true}:{})}:s.type==='direct'?{url:publicVideoURL(s.url)}:{size:s.size,mime:clean(s.mime,80),uploaded:false})};
  resetSkipVotes(r);r.sourceLikes=[];r.endVote=null;r.autoStartSource=r.source.id;
  if(s.type==='file'){storage+=s.size;files.set(r.source.id,{id:r.source.id,size:s.size,offset:0,busy:false,dir:null,path:null,code:r.code});}
  r.playback={position:0,playing:false,updatedAt:Date.now(),revision:r.playback.revision+1};for(const x of r.people.values()){x.ready=false;x.buffering=false;x.loadStatus=s.type==='file'?'Waiting for upload':'Loading';}state(r);return true;
 }
 function remove(p,kicked=false){const r=rooms.get(p.code);if(!r)return;clients.delete(p.token);r.people.delete(p.id);if(r.endVote)delete r.endVote.votes[p.id];r.queue=(r.queue||[]).map(q=>({...q,votes:(q.votes||[]).filter(x=>x!==p.id)}));
  if(!r.people.size){if(r.source?.type==='file')dropFile(r.source.id);attachments.clearRoom(r.code);rooms.delete(r.code);persist();return;}
  if(r.hostId===p.id){r.hostId=([...r.people.values()].find(online)||r.people.values().next().value).id;const h=r.people.get(r.hostId);h.cameraAllowed=true;h.micBlocked=false;}
  if(r.source?.owner===p.id&&r.source.type==='file'&&!r.source.uploaded){dropFile(r.source.id);r.source=null;r.playback.playing=false;}
  state(r);
 }
 function occupied(r,except=null){return [...r.people.values()].filter(x=>x.id!==except&&(online(x)||(!x.left&&x.reservedUntil>Date.now()))).length;}
 function syncBuffering(r){if(!(isEmbedded(r.source)||r.source?.type==='direct')||isLiveSource(r.source))return;const waiting=r.bufferTogether===false?[]:[...r.people.values()].filter(x=>online(x)&&x.buffering&&Date.now()-(x.bufferingAt||0)<(options.bufferingLeaseMs??15000)).map(x=>x.id);const old=r.playback.waitingFor||[];if(JSON.stringify(old)===JSON.stringify(waiting))return;const p=r.playback;const position=p.position+(p.playing&&!old.length?Math.max(0,Date.now()-p.updatedAt)/1000:0);r.playback={...p,position,updatedAt:Date.now(),waitingFor:waiting};broadcast(r,{type:'playback',sourceId:r.source.id,playback:r.playback,serverTime:Date.now()});}
 const authenticate=req=>{const p=clients.get(String(req.headers.authorization||'').replace(/^Bearer /,''));return p&&online(p)?p:null;};
 function endRoom(r,message){for(const p of r.people.values()){clients.delete(p.token);send(p.ws,{type:'ended',message});if(p.ws){p.ws.person=null;p.ws.close(1000,'Ended');}}if(r.source?.type==='file')dropFile(r.source.id);attachments.clearRoom(r.code);rooms.delete(r.code);persist();}
 const owner=createOwnerControl({rooms,online,originOK,rate,send,state,remove,endRoom});
 const server=http.createServer(async(req,res)=>{owner.countRequest();
  const url=new URL(req.url,'http://localhost');if(originOK(req)){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-File-Offset, X-Attachment-Name, X-Attachment-To');res.setHeader('Access-Control-Allow-Methods','GET, PUT, POST, OPTIONS');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(req.method==='OPTIONS'){res.writeHead(originOK(req)?204:403);return res.end();}
  if(await owner.handle(req,res,url,json,ip(req)))return;
  if(await handleCompanionDownload(req,res,url))return;
  if(url.pathname==='/health')return json(200,{ok:true,service:'Xparty',version:'0.10.0'});
  if(url.pathname==='/api/rooms/public'){if(req.method!=='GET')return json(405,{error:'Method not allowed'});if(!rate('directory:'+ip(req),60,60000))return json(429,{error:'Please wait before refreshing.'});return json(200,{rooms:publicRooms(rooms,{online,occupied,query:url.searchParams.get('q')||''})});}
  if(url.pathname==='/api/accounts/config')return json(200,{enabled:accountAuth.enabled,url:publicAuthKey?process.env.SUPABASE_URL||null:null,publicKey:publicAuthKey,phoneEnabled:process.env.SUPABASE_PHONE_ENABLED==='true'});
  if(url.pathname==='/api/accounts/me'){
   res.setHeader('Cache-Control','no-store');res.setHeader('Vary',req.headers.origin?'Origin, Authorization':'Authorization');
   if(req.method!=='GET')return json(405,{error:'Method not allowed'});
   if(req.headers.origin&&!originOK(req))return json(403,{error:'Origin not allowed'});
   if(!rate('account-auth:'+ip(req),60,60000))return json(429,{error:'Please wait before retrying sign-in.'});
   const identity=await accountAuth.verify(req.headers.authorization);
   return json(identity.status,identity.user?{user:identity.user}:{error:identity.error});
  }
  if(url.pathname==='/api/room-status'&&req.method==='GET'){
   if(req.headers.origin&&!originOK(req))return json(403,{error:'Origin not allowed'});
   if(!rate('lookup:'+ip(req),30,60000))return json(429,{status:'limited'});
   const c=normalizeRoomCode(url.searchParams.get('code'));if(!validRoomCode(c))return json(400,{status:'invalid',error:'Enter the 7-character room code using letters and numbers 2–9.'});
   const r=rooms.get(c);return json(200,{status:!r?'unavailable':r.locked?'locked':roomIsFull(r.capacity,occupied(r))?'full':'available'});
  }
  if(url.pathname.startsWith('/api/')){
   if(req.headers.origin&&!originOK(req))return json(403,{error:'Origin not allowed'});const p=authenticate(req);if(!p)return json(401,{error:'Your room connection is offline. Reconnect and retry.'});const r=rooms.get(p.code);
   if(url.pathname==='/api/attachment'&&req.method==='POST'&&!rate('attachment:'+p.id,6,60000))return json(429,{error:'Please wait before uploading another attachment.'});
   if(url.pathname.startsWith('/api/attachment/')&&req.method==='GET'&&!rate('attachment-download:'+p.id,60,60000))return json(429,{error:'Please wait before downloading again.'});
   if(await attachments.handle(req,res,url,p,r,json))return;
   if(url.pathname==='/api/search'&&req.method==='GET'){
    if(!rate('search:'+p.id,30,60000))return json(429,{error:'Please wait a moment before searching again.'});const q=clean(url.searchParams.get('q'),100);if(q.length<2)return json(400,{error:'Enter at least two characters'});
    const cache=searchCache.get(q.toLowerCase());if(cache&&Date.now()-cache.at<300000)return json(200,{items:cache.items});
    try{const items=await (options.searchYouTube||searchYouTube)(q);if(searchCache.size>100)searchCache.clear();searchCache.set(q.toLowerCase(),{at:Date.now(),items});return json(200,{items});}catch(e){return json(503,{error:e.message});}
   }
   const match=url.pathname.match(/^\/api\/file\/([\w-]+)$/);
   if(match){const id=match[1],f=files.get(id);if(!f||f.code!==r.code||r.source?.id!==id)return json(404,{error:'This file is no longer in the room.'});
    if(req.method==='PUT'){
     if(p.id!==r.source.owner)return json(403,{error:'Only the person sharing the file can upload it.'});
     const offset=Number(req.headers['x-file-offset']);if(!Number.isSafeInteger(offset)||offset!==f.offset)return json(409,{error:'Upload offset changed',offset:f.offset});if(f.busy)return json(409,{error:'An upload chunk is in progress',offset:f.offset});
     f.busy=true;try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>CHUNK||offset+size>f.size){json(413,{error:'Upload chunk too large'});req.destroy();return;}chunks.push(chunk);}if(!size)return json(400,{error:'Empty upload chunk'});
      if(files.get(id)!==f)return json(409,{error:'Video changed during upload'});
      if(!f.path){f.dir=await mkdtemp(join(tmpdir(),'xparty-'));f.path=join(f.dir,'video');}
      const h=await open(f.path,offset?'r+':'w',0o600);try{const data=Buffer.concat(chunks);let written=0;while(written<data.length){const result=await h.write(data,written,data.length-written,offset+written);written+=result.bytesWritten;}}finally{await h.close();}
      if(files.get(id)!==f)return json(409,{error:'Video changed during upload'});f.offset+=size;if(f.offset===f.size){r.source.uploaded=true;state(r);}return json(200,{offset:f.offset,complete:f.offset===f.size});
     }catch(e){if(!res.headersSent)return json(500,{error:'Upload interrupted. Retry sharing the file.'});}finally{f.busy=false;}return;
    }
    if(req.method==='GET'){if(f.offset!==f.size)return json(409,{error:'The host is still uploading this video.'});res.writeHead(200,{'Content-Type':r.source.mime,'Content-Length':f.size,'Cache-Control':'no-store'});const h=await open(f.path,'r');const stream=h.createReadStream();stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;}
   }
   return json(404,{error:'Not found'});
  }
  if(req.method!=='GET')return json(405,{error:'Method not allowed'});
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return json(400,{error:'Invalid URL'});}
  // Serve the application at the short root URL, retaining old /xparty/ links.
  if(pathname==='/owner'||pathname==='/owner/')pathname='/xparty/owner.html';else if(pathname==='/')pathname='/xparty/index.html';else if(!pathname.startsWith('/xparty/')&&/^\/(?:app.js|config.js|limits.js|style.css|compact.css|sync.js|settings.js|icons.js|accounts.js|ui-support.js|queue-policy.js|discovery.js|discovery.css|ambient.js|ambient.css|room-design.js|room-design.css|provider-ui.js|companion-client.js|companion-providers.js|immersive.js|fluid.js|native-video.js|fullscreen.js|fullscreen.css|suggestions.js|suggestions.css|experience.js|experience.css|iptv.js|iptv.css|iptv-browser.js|iptv-playlist.js|channel-directory.js|channel-health.js|radio-directory.js|saved-videos.js|service-icons.js|settings-design.js|settings-design.css|providers.js|profile-data.js|member-profiles.js|account-gate.js|redesign.css|skip-voting.js|skip-voting.css|subtitles.js|logo.svg|guidelines.html)$/.test(pathname))pathname='/xparty'+pathname;
  if(pathname.endsWith('/'))pathname+='index.html';const path=resolve(ROOT,'.'+pathname);const within=relative(ROOT,path);if(within==='..'||within.startsWith('..'+sep)||isAbsolute(within))return json(403,{error:'Forbidden'});
  try{const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);}catch{return json(404,{error:'Not found'});}
 });
 const control=createPartyControl({online:p=>!!p&&online(p),send,state,execute:(p,r,m)=>dispatch(p.ws,m,true),requestMs:options.requestMs??30000,lockMs:options.lockMs??10000});
 function dispatch(ws,m,approved=false){
   const p=ws.person,r=p&&rooms.get(p.code);if(!r||r.people.get(p.id)!==p||p.ws!==ws)return;const host=p.id===r.hostId||approved;if(videoInvitations.handle(r,p,m)||interactions.handle(r,p,m)||social.handle(r,p,m)||callSeats.handle(r,p,m))return;if(!approved&&control.handle(r,p,m))return;
   if(['skip-settings','skip-vote'].includes(m.type)){if(rate('skip:'+p.id,8,5000)&&configureSkip(r,p,m,online))state(r);return;}
   if(m.type==='room-directory'){if(updateDirectory(r,p.id,m))state(r);else send(ws,{type:'error',message:'Only the host can update the listing. Public rooms need a title.'});return;}
   if(m.type==='leave'){p.left=true;p.reservedUntil=null;control.cancel(r,'Participant left.');if(r.ownerId!==p.id){remove(p);}else{p.ws=null;p.buffering=false;p.inCall=false;p.mic=false;p.camera=false;p.ready=false;if(r.hostId===p.id){const next=[...r.people.values()].find(x=>x!==p&&online(x));if(next){r.hostId=next.id;next.cameraAllowed=true;next.micBlocked=false;}}state(r);}ws.person=null;return ws.close(1000,'Left');}
   if(m.type==='end-room'&&host){for(const x of r.people.values()){clients.delete(x.token);send(x.ws,{type:'ended',message:'The host ended the room.'});x.ws?.close(1000,'Ended');}if(r.source?.type==='file')dropFile(r.source.id);attachments.clearRoom(r.code);rooms.delete(r.code);persist();return;}
   if(m.type==='kick'&&host){const target=r.people.get(m.target);if(target&&target!==p&&target.id!==r.ownerId){send(target.ws,{type:'kicked',message:'The host removed you from the room.'});remove(target,true);target.ws?.close(4003,'Removed');}return;}
   if(m.type==='transfer-host'&&host){control.cancel(r,'Host changed.');const target=r.people.get(m.target);if(target&&target!==p&&online(target)){r.hostId=target.id;r.ownerId=target.id;target.cameraAllowed=true;target.micBlocked=false;state(r);}return;}
   if(m.type==='moderate'&&host){const target=r.people.get(m.target);if(!target||target===p)return;
    if(m.action==='block-chat'){target.chatBlocked=true;}else if(m.action==='allow-chat'){target.chatBlocked=false;}else if(m.action==='mute'){target.micBlocked=true;target.mic=false;}else if(m.action==='allow-mic')target.micBlocked=false;else if(m.action==='camera-off'){target.cameraAllowed=false;target.cameraRequested=false;target.camera=false;}else if(m.action==='approve-camera'){target.cameraAllowed=true;target.cameraRequested=false;}else if(m.action==='deny-camera'){target.cameraAllowed=false;target.cameraRequested=false;}else return;
    send(target.ws,{type:'moderation',action:m.action});state(r);return;
   }
   if(m.type==='request-camera'&&!host){p.cameraRequested=true;state(r);return;}
   if(m.type==='buffer-policy'){if(!host)return;r.bufferTogether=m.enabled===true;state(r);return;}
   if(m.type==='ptt-enable'){if(!host)return;r.pttEnabled=m.enabled===true;if(!r.pttEnabled)for(const x of r.people.values()){if(x.pttTalking)x.mic=false;x.pttTalking=false;}state(r);return;}
   if(m.type==='ptt-request'){if(!r.pttEnabled||p.micBlocked)return;if((!p.pttApproved||!p.inCall)&&rate('ptt:'+p.id,4,60000)){p.pttRequested=true;state(r);}return;}
   if(m.type==='ptt-review'){if(!host)return;const target=r.people.get(m.target);if(!target||!target.pttRequested||!r.pttEnabled||!online(target)||target.micBlocked)return;if(m.approve===true&&!target.inCall){if([...r.people.values()].filter(x=>online(x)&&x.inCall).length>=MAX_CALL_SEATS)return send(ws,{type:'error',message:'All six call seats are occupied. Free a seat before approving push to talk.'});target.inCall=true;target.callSeatApproved=true;target.seatRequested=false;target.session=(target.session||0)+1;}target.pttRequested=false;target.pttApproved=m.approve===true;send(target.ws,{type:'ptt-status',approved:target.pttApproved});state(r);return;}
   if(m.type==='media'){p.pttTalking=m.ptt===true;p.mic=m.mic===true&&!p.micBlocked&&p.inCall&&(!p.pttTalking||(r.pttEnabled===true&&(p.id===r.hostId||p.pttApproved===true)));p.camera=m.camera===true&&(host||p.cameraAllowed)&&p.inCall;state(r);return;}
   if(m.type==='typing'){if(p.chatBlocked)return;
    if(!rate('typing:'+p.id,4,2000))return;const target=m.to?r.people.get(m.to):null;if(m.to&&!target)return;const event={type:'typing',from:p.id,name:p.name,to:target?.id||null,active:m.active===true};if(target)send(target.ws,event);else for(const x of r.people.values())if(x!==p)send(x.ws,event);return;
   }
   if(m.type==='reaction'){if(['❤️','👏','😂','🎉'].includes(m.emoji)&&rate('reaction:'+p.id,3,3000))broadcast(r,{type:'reaction',name:p.name,emoji:m.emoji});return;}
   if(m.type==='queue-vote'){const item=r.queue.find(q=>q.id===m.id);if(item&&rate('vote:'+p.id,10,5000)){item.votes??=[];item.votes=item.votes.includes(p.id)?item.votes.filter(id=>id!==p.id):[...item.votes,p.id];state(r);}return;}
   if(m.type==='chat'){if(p.chatBlocked)return send(ws,{type:'error',message:'Chat is paused by the host.'});const text=clean(m.text,1500),target=m.to?r.people.get(m.to):null;if(m.to&&!target)return send(ws,{type:'error',message:'This participant is no longer in the room.'});const attachment=m.attachmentId?attachments.publish(m.attachmentId,p,target?.id):null;if(m.attachmentId&&!attachment)return send(ws,{type:'error',message:'This attachment cannot be shared with this recipient.'});if(text||attachment){const clientId=typeof m.clientId==='string'&&/^[a-f0-9-]{36}$/.test(m.clientId)?m.clientId:null;const existing=clientId&&r.history.find(x=>x.clientId===clientId&&x.from===p.id);if(existing){send(p.ws,existing);return;}const message={type:'chat',id:randomUUID(),...(clientId?{clientId}:{}),from:p.id,name:p.name,to:target?.id||null,toName:target?.name||null,text,at:Date.now(),...(attachment?{attachment}: {})};r.history.push(message);if(r.history.length>100){const old=r.history.shift();if(old.attachment)attachments.remove(old.attachment.id);}if(target){send(p.ws,message);if(target!==p)send(target.ws,message);}else broadcast(r,message);persist();}return;}
   if(m.type==='chat-edit'){const item=r.history.find(x=>x.id===m.id&&x.from===p.id);if(!item||item.attachment||item.poll||item.deleted||Date.now()-item.at>15*60*1000)return send(ws,{type:'error',message:'Message editing unavailable.'});const changed=clean(m.text,1500);if(!changed)return;item.text=changed;item.edited=true;const event={type:'chat-updated',id:item.id,text:changed,edited:true};if(item.to){send(p.ws,event);send(r.people.get(item.to)?.ws,event);}else broadcast(r,event);persist();return;}
    if(m.type==='chat-delete'){const item=r.history.find(x=>x.id===m.id&&x.from===p.id);if(!item)return;item.text='';item.deleted=true;if(item.attachment){attachments.remove(item.attachment.id);delete item.attachment;}const event={type:'chat-updated',id:item.id,text:'',deleted:true};if(item.to){send(p.ws,event);send(r.people.get(item.to)?.ws,event);}else broadcast(r,event);persist();return;}
    if(m.type==='theme-access'&&host){r.guestThemes=!!m.enabled;state(r);return;}
   if(m.type==='autoplay'&&host){r.autoplay=!!m.enabled;r.queueOrder=r.autoplay?'fifo':'votes';state(r);return;}
   if(['queue-order','auto-advance','queue-move'].includes(m.type)){if(configureQueue(r,p.id,m))state(r);return;}
   if(m.type==='delivered'&&Array.isArray(m.ids)){for(const id of m.ids.slice(0,100)){const item=r.history.find(x=>x.id===id);if(!item||item.from===p.id||(item.to&&item.to!==p.id))continue;item.deliveredBy??=[];if(item.deliveredBy.includes(p.id))continue;item.deliveredBy.push(p.id);send(r.people.get(item.from)?.ws,{type:'delivered',id,by:p.id});}persist();return;}
   if(m.type==='read'&&Array.isArray(m.ids)){for(const id of m.ids.slice(0,100)){const item=r.history.find(x=>x.id===id);if(!item||item.from===p.id||(item.to&&item.to!==p.id))continue;item.readBy??=[];if(item.readBy.includes(p.id))continue;item.readBy.push(p.id);const sender=r.people.get(item.from);send(sender?.ws,{type:'read',id,by:p.id,name:p.name});}persist();return;}
   if(m.type==='room-theme'&&(host||r.guestThemes)&&['','lime','violet','ocean','amber'].includes(m.theme)){r.theme=m.theme||null;state(r);return;}
   if(m.type==='capacity'&&host){const capacity=m.capacity;if(validRoomCapacity(capacity)&&(capacity===null||capacity>=occupied(r))){if(r.capacity!==null&&(capacity===null||capacity>r.capacity))r.locked=false;r.capacity=capacity;state(r);}else send(ws,{type:'error',message:'Choose No room limit or 2–500 people. The limit must include online members and reserved reconnect seats.'});return;}
   if(m.type==='lock'&&host){r.locked=m.locked===true;state(r);return;}
   if(m.type==='video-like'&&r.source&&m.sourceId===r.source.id&&typeof m.liked==='boolean'&&rate('video-like:'+p.id,20,10000)){const likes=new Set(r.sourceLikes||[]);if(m.liked)likes.add(p.id);else likes.delete(p.id);r.sourceLikes=[...likes];state(r);return;}
   if(m.type==='source'&&host){control.cancel(r,'Video changed.');return choose(r,p,m.source);}
   if(m.type==='queue-add'&&host){const provider=m.provider||'youtube',companion=normalizeCompanionSource({type:provider,url:m.url,videoId:m.videoId});if((!validProviderId(provider,m.videoId)&&!(provider==='direct'&&publicVideoURL(m.url))&&!(provider==='iptv'&&publicStreamURL(m.url))&&!companion)||r.queue.length>=50)return false;const item={...(provider==='youtube'?{}:{provider}),...(companion?{url:companion.url,videoId:companion.videoId}:provider==='iptv'?{url:publicStreamURL(m.url)}:provider==='direct'?{url:publicVideoURL(m.url)}:{videoId:m.videoId})};if(!r.queue.some(q=>(q.provider||'youtube')===provider&&(item.url?q.url===item.url:q.videoId===item.videoId)))r.queue.push({id:randomUUID(),...item,title:clean(m.title,150)||'Video',addedBy:p.name,createdAt:Date.now()});state(r);return true;}
   if(m.type==='vote')return;
   if(m.type==='queue-remove'&&host){r.queue=r.queue.filter(q=>q.id!==m.id);state(r);return true;}
   if(['queue-play','next','previous'].includes(m.type)&&host){const item=m.type==='previous'?r.previousSource:m.type==='next'?nextQueued(r,{automatic:m.automatic===true,sourceId:m.sourceId}):r.queue.find(q=>q.id===m.id);if(item){const previous=r.source&&r.source.type!=='file'?{provider:r.source.type,videoId:r.source.videoId,url:r.source.url,title:r.source.title}:null;r.queue=r.queue.filter(q=>q.id!==item.id);control.cancel(r,'Video changed.');const result=choose(r,p,{type:item.provider||'youtube',videoId:item.videoId,url:item.url,title:item.title});r.previousSource=previous;return result;}return false;}
   if(m.type==='ready'&&m.sourceId===r.source?.id){p.ready=m.ready===true;p.loadStatus=clean(m.status,100)||(p.ready?'Ready':'Loading');state(r);return;}
   if(m.type==='buffering'&&(isEmbedded(r.source)||r.source?.type==='direct')&&!isLiveSource(r.source)&&m.sourceId===r.source.id){p.buffering=m.buffering===true&&r.playback.playing;p.bufferingAt=Date.now();syncBuffering(r);return;}
   if(m.type==='watch-heartbeat'){p.watchSource=m.sourceId===r.source?.id&&m.active===true?m.sourceId:null;p.watchingAt=p.watchSource?Date.now():0;return;}
    if(m.type==='profile-details'){if(r.people.has(m.target)&&rate('profile-view:'+p.id,30,60000))send(ws,{type:'profile-details',target:m.target,together:togetherView(r,p.id,m.target)});return;}
    if(m.type==='profile-update'){if(rate('profile:'+p.id,6,60000)){p.profile=profileData(m.profile);state(r);}return;}
    if(m.type==='rename'){const name=clean(m.name,24);if(name){p.name=name;state(r);}return;}
   if(m.type==='resync'){send(ws,{type:'playback',resync:true,sourceId:r.source?.id,playback:r.playback,serverTime:Date.now()});return true;}
   if(m.type==='playback'&&isLiveSource(r.source)&&m.intent==='seek')return send(ws,{type:'error',message:'Live channels do not support timeline seeking.'});
   if(m.type==='playback'&&r.source&&m.sourceId===r.source.id&&finite(m.position)&&typeof m.playing==='boolean'){
    const waiting=[...r.people.values()].filter(x=>online(x)&&!x.ready);
    if(r.source.type==='file'&&m.playing&&(!r.source.uploaded||waiting.length))return send(ws,{type:'error',message:!r.source.uploaded?'The video is uploading. Progress is shown below the player.':'Waiting for '+waiting.map(x=>x.name+' ('+(x.loadStatus||'loading')+')').join(', ')});
    r.autoStartSource=null;for(const x of r.people.values())x.buffering=false;r.playback={position:m.position,playing:m.playing,updatedAt:Date.now(),waitingFor:[],revision:r.playback.revision+1};broadcast(r,{type:'playback',sourceId:r.source.id,playback:r.playback,from:p.id,serverTime:Date.now()});persist();return true;
   }
   if(m.type==='anchor'&&host&&m.sourceId===r.source?.id&&r.playback.playing&&finite(m.position)){r.playback={...r.playback,position:m.position,updatedAt:Date.now()};broadcast(r,{type:'anchor',sourceId:r.source.id,playback:r.playback,serverTime:Date.now()});return;}
   if(m.type==='signal'){const target=r.people.get(m.to);if(p.inCall&&target?.inCall&&online(target)&&target!==p&&m.signal&&typeof m.signal==='object')send(target.ws,{type:'signal',from:p.id,signal:m.signal});}

 }
 const wss=new WebSocketServer({noServer:true,maxPayload:64*1024,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{if(req.url!=='/ws'||!originOK(req)||!rate('connect:'+ip(req),60,60000)||wss.clients.size>=500){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');return socket.destroy();}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
 wss.on('connection',(ws,req)=>{
  ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});const timeout=setTimeout(()=>{if(!ws.person)ws.close(1008,'Join timeout');},20000);
  ws.on('message',raw=>{owner.observeMessage(raw.length);try{
   if(!rate('message:'+(ws.person?.id||ip(req)),240,10000))return send(ws,{type:'error',message:'Too many actions. Wait a moment.'});const m=JSON.parse(raw);if(!m||typeof m!=='object')return;
   if(m.type==='ping')return send(ws,{type:'pong',sent:m.sent,serverTime:Date.now()});
   if(['create','join','resume'].includes(m.type)){
    if(ws.person)return;if(!rate('join:'+ip(req),30,60000))return send(ws,{type:'error',message:'Too many join attempts. Try again in one minute.'});let r,p;
    if(m.type==='resume'){
     p=clients.get(m.token);if(!p)return send(ws,{type:'resume-failed',message:'This room is no longer available. It may have been cleared by a server restart, or you may have been removed.'});r=rooms.get(p.code);if(!r)return send(ws,{type:'resume-failed'});
     if(!online(p)&&!(p.reservedUntil>Date.now())&&roomIsFull(r.capacity,occupied(r,p.id)))return send(ws,{type:'resume-failed',message:'All room seats are occupied. Ask the host to increase capacity, then join again.'});
     // A valid saved token may replace the old socket during an immediate page refresh.
     if(p.ws&&p.ws!==ws){p.ws.person=null;p.ws.close(4000,'Session resumed in another connection');}p.ready=false;p.buffering=false;p.mic=false;p.camera=false;
    }else{
     if(!owner.admissionsOpen())return send(ws,{type:'error',message:'New room admissions are temporarily paused by the service owner. Existing rooms can reconnect.'});
     if(m.type==='create'){if(m.capacity!==undefined&&!validRoomCapacity(m.capacity))return send(ws,{type:'error',message:'Choose No room limit or a room size from 2 to 500.'});if(rooms.size>=owner.roomLimit())return send(ws,{type:'error',message:'Room capacity reached. End unused rooms first.'});let c;do{c=code();}while(rooms.has(c));r={code:c,hostId:null,visibility:'public',title:'Xparty room '+c,language:'',bufferTogether:false,capacity:m.capacity===undefined?null:m.capacity,locked:false,people:new Map(),source:null,queue:[],history:[],playback:{position:0,playing:false,updatedAt:Date.now(),revision:0}};rooms.set(c,r);}
     else{const requestedCode=normalizeRoomCode(m.code);if(!validRoomCode(requestedCode))return send(ws,{type:'error',message:'Enter the 7-character room code using letters and numbers 2–9.'});r=rooms.get(requestedCode);if(!r||r.locked)return send(ws,{type:'error',message:'Room unavailable. Check the code or ask the host to unlock it.'});if(roomIsFull(r.capacity,occupied(r)))return send(ws,{type:'error',message:'This room is full.'});}
     const host=!r.hostId;p={id:randomUUID(),token:secret(),name:clean(m.name,24)||(host?'Host':'Guest '+(r.guestCounter=(r.guestCounter||0)+1)),code:r.code,ws,mic:false,camera:false,ready:false,micBlocked:false,cameraAllowed:host,cameraRequested:false};r.people.set(p.id,p);clients.set(p.token,p);r.hostId??=p.id;r.ownerId??=p.id;
    }
    const initialAdmission=!p.joinedAt;p.left=false;p.reservedUntil=null;p.disconnectedAt=null;p.joinedAt??=Date.now();p.inCall=(!p.seatRequested&&(r.mode==='SHARED_CONTROL'||p.id===r.hostId||p.id===r.ownerId||initialAdmission&&r.mode!=='HOST_ONLY'||p.callSeatApproved===true))&&[...r.people.values()].filter(x=>x!==p&&online(x)&&x.inCall).length<MAX_CALL_SEATS;if(p.inCall)p.callSeatApproved=true;if(r.ownerId===p.id){if(r.hostId!==p.id)control.cancel(r,'Owner returned.');r.hostId=p.id;p.cameraAllowed=true;p.micBlocked=false;}p.session=(p.session||0)+1;p.ws=ws;ws.person=p;clearTimeout(timeout);welcome(p,r);state(r);return;
   }
   dispatch(ws,m);
  }catch{send(ws,{type:'error',message:'Invalid request'});}});
  ws.on('close',()=>{clearTimeout(timeout);const p=ws.person;if(p&&p.ws===ws&&clients.has(p.token)){p.ws=null;p.buffering=false;p.ready=false;p.disconnectedAt=Date.now();p.reservedUntil=Date.now()+graceMs;const r=rooms.get(p.code);if(r){if(r.controller?.id===p.id)r.controller=null;state(r);}}});
 });
 const recovery=setInterval(()=>{for(const r of rooms.values()){let expiredCall=false;for(const member of r.people.values()){if(!online(member)&&member.inCall&&member.reservedUntil&&member.reservedUntil<=Date.now()){member.inCall=false;member.mic=false;member.camera=false;expiredCall=true;}}if(expiredCall)state(r);tickTogether(r,online);syncBuffering(r);control.sweep(r);const host=r.people.get(r.hostId);if(host&&!online(host)&&host.reservedUntil&&host.reservedUntil<=Date.now()){const next=[...r.people.values()].filter(online).sort((a,b)=>a.joinedAt-b.joinedAt)[0];if(next){control.cancel(r,'Host reconnect window elapsed.');r.hostId=next.id;next.cameraAllowed=true;next.micBlocked=false;state(r);}}}},250);recovery.unref();
 const maintenance=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}for(const[key,b]of buckets)if(b.until<Date.now())buckets.delete(key);},30000);maintenance.unref();
 return {server,rooms,close:async()=>{clearInterval(maintenance);clearInterval(recovery);attachments.close();clearTimeout(saveTimer);for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));for(const id of files.keys())dropFile(id);}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const app=createXparty();app.server.listen(Number(process.env.PORT||8787),'0.0.0.0',()=>console.log('Xparty 0.10 listening on '+(process.env.PORT||8787)));const stop=()=>app.close().then(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);}
