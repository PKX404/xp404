export function retryDelay(attempt,random=Math.random){
 return Math.round(Math.min(30000,1000*2**Math.min(Math.max(0,attempt),5))*(.8+random()*.4));
}
// A suspended tab must get a fresh response window before we declare it dead.
export function createHeartbeat({now=()=>performance.now(),idle=15000,grace=12000}={}){
 let heard=now(),probe=null,paused=false;
 return {
  heard(){heard=now();probe=null;},
  pause(){paused=true;probe=null;},
  resume(){paused=false;probe=null;},
  poll(){if(paused)return 'wait';const time=now();if(probe!==null)return time-probe>=grace?'reconnect':'wait';if(time-heard<idle)return 'wait';probe=time;return 'probe';}
 };
}
export function peerLabel({local,online,inCall,signaling,peerState,preview}){
 if(preview)return 'Preview';
 if(local)return signaling==='connected'?'You':signaling==='offline'?'You · Offline':'You · Reconnecting';
 if(!online)return peerState==='connected'?'Call connected - room reconnecting':'Reconnecting to room';
 if(!inCall)return 'Watching';
 if(peerState==='connected')return 'Connected';
 if(peerState==='failed')return 'Call failed · retrying';
 if(peerState==='disconnected')return 'Call interrupted · retrying';
 return 'Connecting call';
}
