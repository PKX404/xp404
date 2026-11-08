import {recordHealth} from './channel-health.js';
import {bindHlsDataMode} from './data-mode.js';
import {publicStreamURL,publicRadioURL} from './providers.js';

export {parseM3U} from './iptv-playlist.js';
let hlsSDK;
async function loadHLS(){
 if(window.Hls)return window.Hls;
 if(!hlsSDK)hlsSDK=new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(Error('The IPTV player took too long to load.'));},15000);script.src='/xparty/vendor/hls-1.7.3.min.js';script.onload=()=>{clearTimeout(timer);window.Hls?resolve(window.Hls):reject(Error('IPTV player unavailable.'));};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('The IPTV player could not load.'));};document.head.append(script);}).catch(error=>{hlsSDK=null;throw error;});
 return hlsSDK;
}
export async function createIPTVPlayer(video,url,{signal,audioOnly=false,preview=false,onError=()=>{},onRetry=()=>{},shouldRetry=()=>true,shouldPlay=()=>true}={}){
 if(!(audioOnly?publicRadioURL(url):publicStreamURL(url)))throw Error('Use a secure stream address.');
 let player=null,dataMode=null,disposed=false,mediaRecovery=0,live=true,retryCount=0,retryTimer=null,stallTimer=null,healthyTimer=null,qualityCap=0;
 const applyQuality=()=>{if(!player||!qualityCap)return;const levels=player.levels||[],eligible=levels.map((level,index)=>({level,index})).filter(x=>x.level.height>0&&x.level.height<=qualityCap);if(eligible.length){player.autoLevelCapping=eligible.reduce((a,b)=>(b.level.bitrate||0)>(a.level.bitrate||0)?b:a).index;player.nextLevel=-1;}};
 const healthy=()=>{recordHealth(url,{playing:true});clearTimeout(stallTimer);stallTimer=null;clearTimeout(healthyTimer);healthyTimer=setTimeout(()=>{retryCount=0;mediaRecovery=0;},30000);};video.addEventListener('playing',healthy);
 const scheduleRetry=()=>{if(disposed||retryTimer)return;clearTimeout(stallTimer);clearTimeout(healthyTimer);if(retryCount>=6){onError('This channel is still unavailable after automatic retries. Try again later or choose another channel.');return;}const delay=Math.min(20000,1500*Math.pow(2,retryCount));onRetry(retryCount+1);retryTimer=setTimeout(()=>{retryTimer=null;if(disposed)return;if(!shouldRetry()||!navigator.onLine){scheduleRetry();return;}retryCount++;try{if(player){player.stopLoad();player.loadSource(url);player.startLoad(-1);}else{video.src=url;video.load();}if(shouldPlay())video.play().catch(()=>{});}catch{scheduleRetry();}},delay);};
 const waiting=()=>{if(disposed||!live||stallTimer)return;stallTimer=setTimeout(()=>{stallTimer=null;if(!disposed&&shouldRetry()&&!video.paused)scheduleRetry();},18000);};
 const mediaError=()=>scheduleRetry(),ended=()=>{if(live)scheduleRetry();};video.addEventListener('waiting',waiting);video.addEventListener('stalled',waiting);video.addEventListener('error',mediaError);video.addEventListener('ended',ended);
 const destroy=()=>{if(disposed)return;disposed=true;clearTimeout(retryTimer);clearTimeout(stallTimer);clearTimeout(healthyTimer);video.removeEventListener('playing',healthy);video.removeEventListener('waiting',waiting);video.removeEventListener('stalled',waiting);video.removeEventListener('error',mediaError);video.removeEventListener('ended',ended);signal?.removeEventListener('abort',destroy);dataMode?.destroy();player?.destroy();};
 signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted){destroy();throw Error('IPTV selection changed.');}
 video.crossOrigin='anonymous';
 if(audioOnly&&!/\.m3u8(?:\?|$)/i.test(url)){video.src=url;video.load();return {destroy,goLive(){}};}
 const goLive=()=>{if(disposed||!live)return;const edge=player?.liveSyncPosition;if(Number.isFinite(edge))video.currentTime=edge;else if(video.duration===Infinity&&video.seekable.length)video.currentTime=Math.max(video.seekable.start(video.seekable.length-1),video.seekable.end(video.seekable.length-1)-3);};
 try{
  const Hls=await loadHLS();if(disposed)throw Error('IPTV selection changed.');
  if(Hls.isSupported()){
   player=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:30,liveSyncDurationCount:3,liveMaxLatencyDurationCount:6,maxLiveSyncPlaybackRate:1.05});
   dataMode=bindHlsDataMode(player,Hls,()=>{applyQuality();if(!preview)document.dispatchEvent(new Event('xparty:stream-quality'));},preview?'low':null);
   player.on(Hls.Events.LEVEL_LOADED,(_,data)=>{live=!!data.details.live;});
   player.on(Hls.Events.ERROR,(_,data)=>{if(disposed||!data.fatal)return;if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecovery++<1){player.recoverMediaError();return;}player.stopLoad();recordHealth(url,{status:data.response?.code||0,fromPlayback:true});scheduleRetry();});
   player.attachMedia(video);player.loadSource(url);
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;video.load();}
  else throw Error('HLS playback is unavailable in this browser. Try Chrome, Edge, or Safari.');
  return {destroy,goLive,getAudioTracks(){return (player?.audioTracks||[]).map((t,i)=>({index:i,name:t.name||t.lang||'Track '+(i+1),lang:t.lang||''}));},setAudioTrack(index){if(!player||!Number.isInteger(index)||!player.audioTracks?.[index])return false;player.audioTrack=index;return true;},get canAdjustStream(){return !!player;},setQuality(height){qualityCap=height;if(player){if(height)applyQuality();else dataMode?.refresh();}},setBuffering(level){if(!player)return false;const sizes={minimal:[10,20],optimal:[30,60],high:[60,120],maximum:[120,240]}[level];if(!sizes)return false;[player.config.maxBufferLength,player.config.maxMaxBufferLength]=sizes;return true;},dataInfo:()=>dataMode?.info()||'This browser manages HLS quality automatically; manual data caps are unavailable.'};
 }catch(error){destroy();throw error;}
}
export {initIPTV} from './iptv-browser.js';
export {fetchRadioChannels} from './radio-directory.js';
