import {publicRadioURL} from './providers.js';
const cache=new Map(),pending=new Map(),queue=[];let active=0;
export const healthLabels={green:'Stream responds',yellow:'Unchecked, temporarily unavailable, restricted or browser blocked',red:'Stream not found or repeatedly unavailable'};
export function healthFor(url){const v=cache.get(url);return v&&v.until>Date.now()?v:{color:'yellow',reason:'Not checked yet',checkedAt:0};}
export function recordHealth(url,{status=0,playing=false,reachable=false,fromPlayback=false}={}){
 const recent=cache.get(url);if(!playing&&!fromPlayback&&recent?.playingAt>Date.now()-30000)return recent;
 const old=cache.get(url),missing=[404,410].includes(status),failures=playing||reachable?0:status>=500?(old?.failures||0)+1:0;
 const color=playing||reachable?'green':missing||failures>=3?'red':'yellow';
 const reason=playing?'Playback verified on this device':reachable?'Playlist and media respond; playback may still depend on your device':missing?'Stream returned '+status+' here':status===401||status===403?'Access denied here; sign-in or region restrictions may apply':failures>=3?'Repeated server failures':'Could not verify: temporary failure, network restriction or browser access policy';
 const value={color,reason,failures,playingAt:playing?Date.now():0,checkedAt:Date.now(),until:Date.now()+(color==='red'?900000:300000)};cache.set(url,value);if(cache.size>400)cache.delete(cache.keys().next().value);
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('xparty:channel-health',{detail:{url,...value}}));return value;
}
async function prefix(url,signal,max){
 const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok){await response.body?.cancel();return {status:response.status,text:''};}
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
 try{while(size<max){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;text+=decoder.decode(chunk.value.subarray(0,Math.max(0,max-(size-chunk.value.byteLength))),{stream:true});}return {status:response.status,text};}finally{await reader.cancel().catch(()=>{});}
}
async function probe(url){
 if(!publicRadioURL(url))return healthFor(url);
 try{
  const signal=AbortSignal.timeout(4500);let current=url;
  for(let depth=0;depth<3;depth++){
   const result=await prefix(current,signal,depth===2?1024:32768);if(result.status>=400)return recordHealth(url,{status:result.status});
   if(!result.text.trimStart().startsWith('#EXTM3U'))return recordHealth(url,{reachable:depth>0||!/\.m3u8(?:\?|$)/i.test(url)});
   const first=result.text.split(/\r?\n/).map(line=>line.trim()).find(line=>line&&!line.startsWith('#'));if(!first)return recordHealth(url,{});
   current=publicRadioURL(new URL(first.trim(),current).href);if(!current)return recordHealth(url,{});
  }
  return recordHealth(url,{});
 }catch{return recordHealth(url,{});}
}
function pump(){while(active<2&&queue.length){const job=queue.shift();active++;probe(job.url).then(job.resolve).finally(()=>{pending.delete(job.url);active--;pump();});}}
export function checkChannel(url){const cached=healthFor(url);if(cached.checkedAt)return Promise.resolve(cached);if(pending.has(url))return pending.get(url);if(queue.length>=12)return Promise.resolve(cached);
 const result=new Promise(resolve=>queue.push({url,resolve}));pending.set(url,result);pump();return result;
}
export function healthDot(url){const dot=document.createElement('span');dot.className='channel-health-dot';dot.dataset.healthUrl=url;updateHealthDot(dot,url);return dot;}
export function updateHealthDot(dot,url){const v=healthFor(url);dot.dataset.health=v.color;dot.title=v.reason;dot.setAttribute('role','img');dot.setAttribute('aria-label',v.reason);}
