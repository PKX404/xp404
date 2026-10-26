import {randomUUID} from 'node:crypto';

// A request grants no media access. Acceptance only grants camera permission in
// this room; each client must still acquire its own camera after user consent.
export function createVideoInvitations({online,send,state,rate,now=Date.now,schedule=setTimeout}){
 const rooms=new WeakMap();
 const pending=r=>{if(!rooms.has(r))rooms.set(r,new Map());return rooms.get(r);};
 function finish(r,q,status){
  if(!pending(r).delete(q.id))return;
  clearTimeout(q.timer);
  for(const id of [q.from,q.to])send(r.people.get(id)?.ws,{type:'video-call-result',id:q.id,status,from:q.from,to:q.to});
 }
 function handle(r,p,m){
  if(!['video-call-request','video-call-response','video-call-cancel'].includes(m.type))return false;
  const list=pending(r);
  for(const q of list.values())if(q.expiresAt<=now()||![q.from,q.to].every(id=>online(r.people.get(id)||{})&&r.people.get(id)?.inCall))finish(r,q,'expired');
  if(m.type==='video-call-request'){
   const target=r.people.get(m.to),error=message=>send(p.ws,{type:'error',message});
   if(!target||target===p||!online(target)||!p.inCall||!target.inCall){error('Both people need an available call seat before a video request.');return true;}
   if(p.id!==r.hostId&&target.id!==r.hostId&&r.mode!=='SHARED_CONTROL'&&(!p.cameraAllowed||!target.cameraAllowed)){error('Ask the host to approve camera access first.');return true;}
   if([...list.values()].some(q=>[q.from,q.to].some(id=>id===p.id||id===target.id))){error('A video request is already waiting.');return true;}
   if(!rate('video-invite:'+p.id,4,60000)){error('Please wait before sending another video request.');return true;}
   const q={id:randomUUID(),from:p.id,to:target.id,expiresAt:now()+30000};list.set(q.id,q);
   q.timer=schedule(()=>finish(r,q,'expired'),30000);q.timer?.unref?.();
   send(p.ws,{type:'video-call-outgoing',id:q.id,to:target.id,name:target.name,expiresAt:q.expiresAt});
   send(target.ws,{type:'video-call-incoming',id:q.id,from:p.id,name:p.name,expiresAt:q.expiresAt});return true;
  }
  const q=list.get(m.id);if(!q)return true;
  if(m.type==='video-call-cancel'){if(q.from===p.id)finish(r,q,'cancelled');return true;}
  if(q.to!==p.id)return true;
  if(m.accept!==true){finish(r,q,'declined');return true;}
  const caller=r.people.get(q.from);
  if(!caller||!online(caller)||!caller.inCall||!p.inCall){finish(r,q,'expired');return true;}
  // Recheck policy: host/membership can change while the request is pending.
  if(caller.id!==r.hostId&&p.id!==r.hostId&&r.mode!=='SHARED_CONTROL'&&(!caller.cameraAllowed||!p.cameraAllowed)){finish(r,q,'declined');return true;}
  caller.cameraAllowed=true;p.cameraAllowed=true;caller.cameraRequested=false;p.cameraRequested=false;
  state(r);finish(r,q,'accepted');return true;
 }
 return {handle};
}
