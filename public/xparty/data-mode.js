export const DATA_MODES=['auto','high','mid','low'];
export const dataModeEvents=new EventTarget();
let mode='auto';
export function getDataMode(){return mode;}
export function setDataMode(value){mode=DATA_MODES.includes(value)?value:'auto';dataModeEvents.dispatchEvent(new Event('change'));return mode;}
const bitrate=level=>Number(level.bitrate||level.averageBitrate)||0;
// Select actual encoded variants. Never pretend that resizing saves transferred bytes.
export function levelForMode(levels,value){
 if(!levels?.length||value==='auto')return -1;
 const ranked=levels.map((level,index)=>({level,index})).sort((a,b)=>bitrate(a.level)-bitrate(b.level)||(a.level.height||0)-(b.level.height||0));
 if(value==='high')return ranked.at(-1).index;
 const height=value==='low'?360:720,budget=value==='low'?500000:1500000;
 const eligible=ranked.filter(({level})=>bitrate(level)>0&&bitrate(level)<=budget&&(!level.height||level.height<=height));
 return (eligible.at(-1)||ranked[0]).index;
}
export function bindHlsDataMode(player,Hls,onUpdate=()=>{}){
 const apply=()=>{
  const selected=levelForMode(player.levels,mode);
  player.autoLevelCapping=mode==='high'?-1:selected;
  // nextLevel switches at a segment boundary without restarting the media element.
  player.nextLevel=mode==='high'?selected:-1;
  onUpdate();
 };
 const info=()=>{
  const levels=player.levels||[],index=levelForMode(levels,mode),level=levels[index];
  if(!levels.length)return 'Checking available stream qualities.';
  if(levels.length===1)return 'This stream has one quality; lower-data versions are not available.';
  if(mode==='auto')return 'Auto adapts to measured download speed and buffering.';
  const quality=level?.height?`${level.height}p`:'available quality',rate=bitrate(level||{});
  return `${mode==='high'?'Original best available':'Up to'} ${quality}${rate?` · ${(rate/1000000).toFixed(2)} Mbps`:''}. Changes apply at the next segment boundary.`;
 };
 dataModeEvents.addEventListener('change',apply);
 const events=[Hls.Events.MANIFEST_PARSED,Hls.Events.LEVELS_UPDATED].filter(Boolean);
 for(const event of events)player.on(event,apply);
 apply();
 return {info,destroy(){dataModeEvents.removeEventListener('change',apply);for(const event of events)player.off(event,apply);}};
}
