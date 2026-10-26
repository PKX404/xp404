import {youtubeId} from './sync.js';
export const isEmbedded=source=>['youtube','vimeo','twitch','soundcloud'].includes(source?.type);
export const isVideoElement=source=>['file','direct','iptv'].includes(source?.type);
const twitchReserved=new Set(['directory','downloads','jobs','p','settings','subscriptions','turbo','videos','search','inventory','wallet','friends','messages','login','signup','clip','clips','collections']);
const soundcloudReserved=new Set(['sets','likes','reposts','tracks','albums','popular-tracks','followers','following','comments','recommended','discover','stream','search','charts','you','upload','pages','terms','settings','stations']);
function providerURL(input){try{if(typeof input!=='string'||input.length>2048)return null;const u=new URL(input);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash?u:null;}catch{return null;}}
function soundcloudTrack(input){const u=providerURL(input);if(!u||!['soundcloud.com','www.soundcloud.com'].includes(u.hostname))return null;const path=u.pathname.match(/^\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,99})\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,254})\/?$/);if(!path||soundcloudReserved.has(path[1].toLowerCase())||soundcloudReserved.has(path[2].toLowerCase()))return null;return `https://soundcloud.com/${path[1]}/${path[2]}`;}
export const isLiveSource=source=>source?.type==='iptv'||source?.type==='twitch'&&typeof source.videoId==='string'&&source.videoId.startsWith('channel:');
export function validProviderId(type,id){if(typeof id!=='string')return false;if(type==='youtube')return /^[\w-]{11}$/.test(id);if(type==='vimeo')return /^[1-9][0-9]{5,11}$/.test(id);if(type==='twitch')return /^video:[1-9][0-9]{0,19}$/.test(id)||(/^channel:[a-z0-9_]{1,25}$/.test(id)&&!twitchReserved.has(id.slice(8)));if(type==='soundcloud')return soundcloudTrack(id)===id;return false;}
export function publicVideoURL(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!u.hostname.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||/^\d+(\.\d+){3}$/.test(u.hostname)||u.hostname.includes(':')||! /\.(mp4|webm)$/i.test(u.pathname)||value.length>2048)return null;return u.href;}catch{return null;}
}
export function publicStreamURL(value){
 try{const u=providerURL(value);if(!u||!u.hostname.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||/^\d+(\.\d+){3}$/.test(u.hostname)||u.hostname.includes(':')||! /\.m3u8$/i.test(u.pathname))return null;return u.href;}catch{return null;}
}
export function publicRadioURL(value){try{const u=providerURL(value);if(!u||!u.hostname.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||/^\d+(\.\d+){3}$/.test(u.hostname)||u.hostname.includes(':'))return null;return u.href;}catch{return null;}}
export function parseProviderLink(input){
 if(typeof input!=='string'||input.length>2048)return null;input=input.trim();
 const id=youtubeId(input);if(id)return {type:'youtube',videoId:id,title:'YouTube video'};
 try{const u=providerURL(input);if(!u)return null;
 if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)){const id=u.pathname.match(/^\/(?:video\/)?([1-9][0-9]{5,11})\/?$/)?.[1];if(id)return {type:'vimeo',videoId:id,title:'Vimeo video'};}
 if(['twitch.tv','www.twitch.tv','m.twitch.tv'].includes(u.hostname)){const video=u.pathname.match(/^\/videos\/([1-9][0-9]{0,19})\/?$/)?.[1];if(video)return {type:'twitch',videoId:'video:'+video,live:false,title:'Twitch video'};const channel=u.pathname.match(/^\/([a-zA-Z0-9_]{1,25})\/?$/)?.[1]?.toLowerCase();if(channel&&!twitchReserved.has(channel))return {type:'twitch',videoId:'channel:'+channel,live:true,title:channel+' · Twitch live'};}
 const track=soundcloudTrack(input);if(track)return {type:'soundcloud',videoId:track,title:u.pathname.split('/').filter(Boolean).at(-1).replaceAll('-',' ')+' · SoundCloud'};
 const live=publicStreamURL(input);if(live)return {type:'iptv',url:live,title:'Live IPTV'};
 const url=publicVideoURL(input);if(url)return {type:'direct',url,title:decodeURIComponent(u.pathname.split('/').pop()).slice(0,150)};
 }catch{}return null;
}

// Official public embeds only. Provider URLs are constructed here, never supplied
// as arbitrary iframe HTML. An SDK readiness event is distinct from playable media.
const extraSDKs=new Map();let embedSequence=0;
function loadProviderSDK(key,src,getSDK){
 const available=getSDK();if(available)return Promise.resolve(available);
 if(extraSDKs.has(key))return extraSDKs.get(key);
 const promise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else{const sdk=getSDK();sdk?resolve(sdk):reject(Error(key+' player unavailable'));}};
  const timer=setTimeout(()=>finish(Error(key+' player timed out')),20000);
  script.src=src;script.async=true;script.onload=()=>finish();script.onerror=()=>finish(Error(key+' player unavailable'));document.head.append(script);
 }).catch(error=>{extraSDKs.delete(key);throw error;});extraSDKs.set(key,promise);return promise;
}
function bounded(promise,label,{signal,timeoutMs=20000}={}){
 return new Promise((resolve,reject)=>{let settled=false;const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};const abort=()=>finish(reject,Error(label+' cancelled'));const timer=setTimeout(()=>finish(reject,Error(label+' timed out')),Math.max(1,Math.min(60000,Number(timeoutMs)||20000)));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));});
}
const seconds=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const volume=value=>Math.max(0,Math.min(100,Number(value)||0));

export async function createTwitchPlayer(host,id,onState=()=>{},onError=()=>{},options={}){
 if(!validProviderId('twitch',id))throw Error('Use a Twitch channel or video link.');
 const Twitch=await bounded(loadProviderSDK('Twitch','https://player.twitch.tv/js/embed/v1.js',()=>window.Twitch?.Player?window.Twitch:null),'Twitch SDK',options);
 const hostname=window.location.hostname;if(!hostname)throw Error('Twitch requires a hosted page.');
 const mount=document.createElement('div');mount.id='xparty-twitch-'+(++embedSequence);mount.className='provider-embed-mount';host.append(mount);
 const live=id.startsWith('channel:');let player,disposed=false,state=2;const listeners=[];
 const fail=error=>{if(!disposed)onError(error instanceof Error?error:Error('Twitch playback unavailable'));};
 const call=(method,...args)=>{if(disposed)return;try{return player?.[method]?.(...args);}catch(error){fail(error);}};
 const bind=(event,handler)=>{if(!event)return;const guarded=(...args)=>{if(!disposed)handler(...args);};player.addEventListener(event,guarded);listeners.push([event,guarded]);};
 const change=value=>{state=value;onState({data:value});};
 const destroy=()=>{if(disposed)return;disposed=true;try{player?.pause();}catch{}for(const [event,handler]of listeners)try{player?.removeEventListener?.(event,handler);}catch{}mount.remove();};
 try{
  player=new Twitch.Player(mount.id,{width:'100%',height:'100%',parent:[hostname],autoplay:false,muted:false,...(live?{channel:id.slice(8)}:{video:'v'+id.slice(6)})});
  const ready=new Promise(resolve=>bind(Twitch.Player.READY,resolve));
  for(const [event,value]of [[Twitch.Player.PLAY,3],[Twitch.Player.PLAYING,1],[Twitch.Player.PAUSE,2],[Twitch.Player.ENDED,0]])bind(event,()=>change(value));
  bind(Twitch.Player.PLAYBACK_BLOCKED,()=>{change(2);fail(Error('Tap Play in the Twitch player to allow playback.'));});
  bind(Twitch.Player.OFFLINE,()=>{change(2);fail(Error('This Twitch channel is offline.'));});
  await bounded(ready,'Twitch video',options);
 }catch(error){destroy();throw error;}
 return {isLive:live,canSeek:!live,getCurrentTime:()=>live?0:seconds(call('getCurrentTime')),getDuration:()=>live?0:seconds(call('getDuration')),getPlayerState:()=>state,
  playVideo:()=>call('play'),pauseVideo:()=>call('pause'),stopVideo:()=>call('pause'),seekTo:t=>{if(!live)call('seek',seconds(t));},setVolume:v=>call('setVolume',volume(v)/100),unMute:()=>call('setMuted',false),destroy};
}

export async function createSoundCloudPlayer(host,id,onState=()=>{},onError=()=>{},options={}){
 if(!validProviderId('soundcloud',id))throw Error('Use a public SoundCloud track link.');
 const SC=await bounded(loadProviderSDK('SoundCloud','https://w.soundcloud.com/player/api.js',()=>window.SC?.Widget?window.SC:null),'SoundCloud SDK',options);
 const iframe=document.createElement('iframe');iframe.title='SoundCloud track player';iframe.allow='autoplay';iframe.scrolling='no';iframe.setAttribute('frameborder','0');iframe.className='provider-embed-mount soundcloud-embed';iframe.width='100%';iframe.height='100%';
 const url=new URL('https://w.soundcloud.com/player/');for(const [key,value]of Object.entries({url:id,auto_play:'false',visual:'true',show_artwork:'true',show_user:'true',show_comments:'false',single_active:'false',color:'#bca2ff'}))url.searchParams.set(key,value);iframe.src=url.href;host.append(iframe);
 let widget,disposed=false,time=0,duration=0,state=2,timeRevision=0;const events=new Set();
 const fail=error=>{if(!disposed)onError(error instanceof Error?error:Error('This SoundCloud track could not play. It may be unavailable or embedding may be disabled.'));};
 const call=(method,...args)=>{if(disposed)return;try{return widget?.[method]?.(...args);}catch(error){fail(error);}};
 const bind=(event,handler)=>{if(!event)return;widget.bind(event,(...args)=>{if(!disposed)handler(...args);});events.add(event);};
 const update=event=>{if(Number.isFinite(event?.currentPosition)){timeRevision++;time=Math.max(0,event.currentPosition/1000);}};
 const change=value=>{state=value;onState({data:value});};
 const readDuration=()=>call('getDuration',value=>{if(!disposed)duration=seconds(value)/1000;});
 const destroy=()=>{if(disposed)return;disposed=true;try{widget?.pause();}catch{}for(const event of events)try{widget?.unbind(event);}catch{}iframe.remove();};
 try{
  widget=SC.Widget(iframe);const E=SC.Widget.Events;
  const ready=new Promise((resolve,reject)=>{bind(E.READY,resolve);bind(E.ERROR,error=>{const issue=Error('This SoundCloud track could not play. It may be unavailable or embedding may be disabled.');reject(issue);fail(error instanceof Error?error:issue);});});
  bind(E.PLAY_PROGRESS,update);bind(E.SEEK,update);bind(E.PLAY,event=>{update(event);readDuration();change(1);});bind(E.PAUSE,event=>{update(event);change(2);});bind(E.FINISH,event=>{update(event);change(0);});
  await bounded(ready,'SoundCloud track',options);readDuration();const revision=timeRevision;call('getPosition',value=>{if(!disposed&&revision===timeRevision)time=seconds(value)/1000;});
 }catch(error){destroy();throw error;}
 return {isLive:false,canSeek:true,getCurrentTime:()=>time,getDuration:()=>duration,getPlayerState:()=>state,
  playVideo:()=>call('play'),pauseVideo:()=>call('pause'),stopVideo:()=>call('pause'),seekTo:t=>{if(!disposed){timeRevision++;time=seconds(t);call('seekTo',time*1000);}},setVolume:v=>call('setVolume',volume(v)),unMute:()=>{},destroy};
}
let sdk;
export async function createVimeoPlayer(host,id,onState,onError){
 const mount=document.createElement('div');host.append(mount);
 if(!sdk)sdk=new Promise((resolve,reject)=>{if(window.Vimeo?.Player)return resolve(window.Vimeo);const s=document.createElement('script');s.src='https://player.vimeo.com/api/player.js';const timeout=setTimeout(()=>reject(Error('Vimeo timed out')),20000);s.onload=()=>{clearTimeout(timeout);window.Vimeo?.Player?resolve(window.Vimeo):reject(Error('Vimeo unavailable'));};s.onerror=()=>{clearTimeout(timeout);reject(Error('Vimeo unavailable'));};document.head.append(s);}).catch(e=>{sdk=null;throw e;});
 const Vimeo=await sdk;const player=new Vimeo.Player(mount,{id:Number(id),autoplay:false,responsive:true,playsinline:true});let time=0,duration=0,state=2,disposed=false;
 const run=p=>Promise.resolve(p).catch(e=>{if(!disposed)onError(e);});
 player.on('timeupdate',e=>{time=e.seconds;duration=e.duration;});player.on('durationchange',e=>{duration=e.duration;});
 for(const [event,value]of [['play',1],['pause',2],['ended',0],['bufferstart',3]])player.on(event,()=>{if(!disposed){state=value;onState({data:value});}});
 player.on('bufferend',()=>run(player.getPaused().then(paused=>{if(!disposed){state=paused?2:1;onState({data:state});}})));
 player.on('error',onError);
 let readyTimeout;try{await Promise.race([player.ready(),new Promise((_,reject)=>{readyTimeout=setTimeout(()=>reject(Error('Vimeo video timed out')),20000);})]);duration=await player.getDuration();}catch(e){disposed=true;run(player.destroy());mount.remove();throw e;}finally{clearTimeout(readyTimeout);}
 return {getCurrentTime:()=>time,getDuration:()=>duration,getPlayerState:()=>state,
 playVideo:()=>run(player.play()),pauseVideo:()=>run(player.pause()),stopVideo:()=>run(player.pause()),seekTo:t=>{time=t;run(player.setCurrentTime(t));},setVolume:v=>run(player.setVolume(Math.max(0,Math.min(1,v/100)))),unMute:()=>run(player.setMuted(false)),
 destroy(){disposed=true;run(player.destroy());mount.remove();}};
}
