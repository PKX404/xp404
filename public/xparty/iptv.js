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
export async function createIPTVPlayer(video,url,{signal,audioOnly=false,onError=()=>{}}={}){
 if(!(audioOnly?publicRadioURL(url):publicStreamURL(url)))throw Error('Use a secure stream address.');
 let player=null,dataMode=null,disposed=false,mediaRecovery=0,live=true;
 const healthy=()=>recordHealth(url,{playing:true});video.addEventListener('playing',healthy);
 const destroy=()=>{if(disposed)return;disposed=true;video.removeEventListener('playing',healthy);signal?.removeEventListener('abort',destroy);dataMode?.destroy();player?.destroy();};
 signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted){destroy();throw Error('IPTV selection changed.');}
 video.crossOrigin='anonymous';
 if(audioOnly&&!/\.m3u8(?:\?|$)/i.test(url)){video.src=url;video.load();return {destroy,goLive(){}};}
 const goLive=()=>{if(disposed||!live)return;const edge=player?.liveSyncPosition;if(Number.isFinite(edge))video.currentTime=edge;else if(video.duration===Infinity&&video.seekable.length)video.currentTime=Math.max(video.seekable.start(video.seekable.length-1),video.seekable.end(video.seekable.length-1)-3);};
 try{
  const Hls=await loadHLS();if(disposed)throw Error('IPTV selection changed.');
  if(Hls.isSupported()){
   player=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:30,liveSyncDurationCount:3,liveMaxLatencyDurationCount:6,maxLiveSyncPlaybackRate:1.05});
   dataMode=bindHlsDataMode(player,Hls,()=>document.dispatchEvent(new Event('xparty:stream-quality')));
   player.on(Hls.Events.LEVEL_LOADED,(_,data)=>{live=!!data.details.live;});
   player.on(Hls.Events.ERROR,(_,data)=>{if(disposed||!data.fatal)return;if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecovery++<1){player.recoverMediaError();return;}player.stopLoad();recordHealth(url,{status:data.response?.code||0,fromPlayback:true});onError('This channel is unavailable here. It may be offline, region restricted, or block browser playback. Try another channel or Retry.');});
   player.attachMedia(video);player.loadSource(url);
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;video.load();}
  else throw Error('HLS playback is unavailable in this browser. Try Chrome, Edge, or Safari.');
  return {destroy,goLive,dataInfo:()=>dataMode?.info()||'This browser manages HLS quality automatically; manual data caps are unavailable.'};
 }catch(error){destroy();throw error;}
}
export {initIPTV} from './iptv-browser.js';
export {fetchRadioChannels} from './radio-directory.js';
