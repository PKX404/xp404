import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export function createOwnerControl({rooms,online,originOK,rate,send,state,remove,endRoom}){
 const sessions=new Map(),audit=[];let admissions=true,maxRooms=100,requests=0,signalBytesIn=0,signalBytesOut=0,messages=0;const started=Date.now();
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const record=(action,room,target)=>{audit.unshift({at:Date.now(),action,room:room||null,target:target||null});audit.splice(100);};
 async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw Error('Request too large');}return JSON.parse(text||'{}');}
 function authenticated(req){const raw=String(req.headers.cookie||'').match(/(?:^|;\s*)xparty_owner=([A-Za-z0-9_-]+)/)?.[1],expires=raw&&sessions.get(hash(raw));if(!expires||expires<Date.now()){if(raw)sessions.delete(hash(raw));return false;}return true;}
 return {countRequest(){requests++;},observeMessage(bytes){messages++;signalBytesIn+=bytes;},observeOutput(bytes){signalBytesOut+=bytes;},admissionsOpen:()=>admissions,roomLimit:()=>maxRooms,async handle(req,res,url,json,clientIp){
  if(!url.pathname.startsWith('/api/owner/'))return false;
  if(req.method!=='GET'&&!originOK(req)){json(403,{error:'Origin not allowed'});return true;}
  const cookie=value=>res.setHeader('Set-Cookie',`xparty_owner=${value}; Path=/api/owner; HttpOnly; SameSite=Strict; ${process.env.RENDER?'Secure; ':''}Max-Age=${value?28800:0}`);
  try{
   if(url.pathname==='/api/owner/login'&&req.method==='POST'){
    if(!rate('owner-login:'+clientIp,5,15*60000)){json(429,{error:'Wait 15 minutes before trying again.'});return true;}
    const expected=process.env.ADMIN_KEY_HASH||'',input=hash(String((await body(req)).key||''));
    if(!/^[a-f0-9]{64}$/.test(expected)){json(503,{error:'Owner access has not been configured.'});return true;}
    if(!timingSafeEqual(Buffer.from(input),Buffer.from(expected))){json(401,{error:'Invalid owner key.'});return true;}
    const token=randomBytes(32).toString('base64url');if(sessions.size>100)sessions.clear();sessions.set(hash(token),Date.now()+8*3600000);cookie(token);record('Owner signed in');json(200,{ok:true});return true;
   }
   if(!authenticated(req)){json(401,{error:'Owner sign-in required.'});return true;}
   if(url.pathname==='/api/owner/logout'&&req.method==='POST'){const token=String(req.headers.cookie||'').match(/(?:^|;\s*)xparty_owner=([A-Za-z0-9_-]+)/)?.[1];if(token)sessions.delete(hash(token));cookie('');json(200,{ok:true});return true;}
   if(url.pathname==='/api/owner/status'&&req.method==='GET'){
    json(200,{uptimeSeconds:Math.floor((Date.now()-started)/1000),requests,messages,signalBytesIn,signalBytesOut,admissions,maxRooms,memoryMB:Math.round(process.memoryUsage().rss/1048576),accountsConfigured:!!(process.env.SUPABASE_URL&&process.env.SUPABASE_ANON_KEY),relayConfigured:!!(process.env.TURN_URLS&&process.env.TURN_SECRET||process.env.ICE_SERVERS_JSON?.includes('turn')),rooms:[...rooms.values()].map(r=>({code:r.code,locked:r.locked,capacity:r.capacity,hostId:r.hostId,people:[...r.people.values()].map(p=>({id:p.id,name:p.name,online:online(p),inCall:!!p.inCall,mic:!!p.mic,camera:!!p.camera,cameraAllowed:!!p.cameraAllowed,chatBlocked:!!p.chatBlocked,micBlocked:!!p.micBlocked}))})),audit});return true;
   }
   if(url.pathname==='/api/owner/action'&&req.method==='POST'){
    if(!rate('owner-action:'+clientIp,60,60000)){json(429,{error:'Too many actions.'});return true;}
    const m=await body(req);
    if(m.action==='admissions'){if(typeof m.enabled!=='boolean'){json(400,{error:'Choose enabled or disabled.'});return true;}admissions=m.enabled;record('New admissions '+(admissions?'opened':'paused'));json(200,{ok:true});return true;}
    if(m.action==='room-limit'){if(!Number.isInteger(m.limit)||m.limit<1||m.limit>100){json(400,{error:'Room limit must be 1–100.'});return true;}maxRooms=m.limit;record('Room limit '+maxRooms);json(200,{ok:true});return true;}
    const r=rooms.get(String(m.room||''));if(!r){json(404,{error:'Room no longer exists.'});return true;}
    if(m.action==='lock'){if(typeof m.enabled!=='boolean'){json(400,{error:'Choose locked or unlocked.'});return true;}r.locked=m.enabled;state(r);}
    else if(m.action==='end-room')endRoom(r,'The service owner ended this room.');
    else if(['remove','mute','allow-mic','block-chat','allow-chat','camera-off','allow-camera'].includes(m.action)){const p=r.people.get(m.target);if(!p){json(404,{error:'Participant no longer exists.'});return true;}if(m.action==='remove'){send(p.ws,{type:'kicked',message:'The service owner removed you from this room.'});const ws=p.ws;remove(p,true);if(ws){ws.person=null;ws.close(1000,'Removed');}}else{if(m.action==='mute'){p.micBlocked=true;p.mic=false;send(p.ws,{type:'owner-moderation',action:'mute'});}if(m.action==='allow-mic')p.micBlocked=false;if(m.action==='block-chat')p.chatBlocked=true;if(m.action==='allow-chat')p.chatBlocked=false;if(m.action==='allow-camera')p.cameraAllowed=true;if(m.action==='camera-off'){p.cameraAllowed=false;p.camera=false;send(p.ws,{type:'owner-moderation',action:'camera-off'});}state(r);}}
    else{json(400,{error:'Unknown owner action.'});return true;}
    record(m.action,r.code,m.target);json(200,{ok:true});return true;
   }
   json(404,{error:'Not found'});return true;
  }catch{json(400,{error:'Invalid owner request.'});return true;}
 }};
}
