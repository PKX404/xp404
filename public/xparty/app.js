import {initPlaybackData} from './playback-data.js';
import {initCallExperience} from '/xparty/call-experience.js';
import {applyBranding} from '/xparty/branding.js';
import {initWorldHome} from '/xparty/world-home.js';
import {initXpartyUI} from '/xparty/xparty-ui.js';
import {initSettingsDesign} from './settings-design.js';
import {MAX_VIDEO_BYTES,MAX_CALL_SEATS,MAX_FINITE_ROOM_CAPACITY,validRoomCapacity,validRoomCode,normalizeRoomCode,roomOccupancy} from './limits.js';
import {isCompanion,parseCompanionLink} from './companion-providers.js';
import {initCompanion} from './companion-client.js';
import {initProviderUI,providerName} from './provider-ui.js';
import {createHeartbeat,retryDelay,peerLabel} from '/xparty/connection-policy.js';
import {initRoomInteractions} from '/xparty/room-interactions.js';
import {initRoomDesign} from './room-design.js';
import {isEmbedded,isVideoElement,isLiveSource,parseProviderLink,createVimeoPlayer,createTwitchPlayer,createSoundCloudPlayer} from './providers.js';
import {initMemberProfiles} from './member-profiles.js';
import {queueOrder,orderedQueue} from './queue-policy.js';
import {initDiscovery,updateDiscovery} from './discovery.js';
import {initAmbient} from './ambient.js';
import {initFluidBackground} from './fluid.js';
import {initFullscreen} from './fullscreen.js';
import {initNativeVideo} from './native-video.js';
import {initSuggestions} from './suggestions.js';
import {initIPTV,createIPTVPlayer} from './iptv.js';
import {initExperience} from './experience.js';
import {initSkipVoting} from './skip-voting.js';
import {initSubtitles} from './subtitles.js';
import {ask,privacySettings,roomAgreement,nicknameChoice,rememberedNickname} from './ui-support.js';
import {icon} from './icons.js';
import {preferences,t,localize,savePreferences,resetPreferences} from './settings.js';
import {youtubeId, targetPosition, correction} from './sync.js';
const $ = id => document.getElementById(id);
const MAX_FILE = MAX_VIDEO_BYTES;
let base = (window.XPARTY_CONFIG?.backendUrl || location.origin).replace(/\/$/,'');
let suspended=false,localPaused=false,connectionState='idle',reconnectAttempts=0;
const heartbeat=createHeartbeat(),peerRetries=new Map();
function connectionStatus(state){connectionState=state;document.body.dataset.connection=state;const text=({connected:'Room connected',connecting:'Connecting to room',reconnecting:'Reconnecting to room',offline:'Offline - waiting for network',checking:'Checking room connection',idle:'Private watch rooms'})[state];$('network').lastChild.textContent=' '+text;document.dispatchEvent(new CustomEvent('xparty:connection-status',{detail:{state,text}}));}
function scheduleReconnect(){clearTimeout(reconnectTimer);if(intentionalClose||suspended||!token)return;if(!navigator.onLine){connectionStatus('offline');return;}connectionStatus('reconnecting');reconnectTimer=setTimeout(()=>connect({type:'resume',token}),retryDelay(reconnectAttempts++));}
let switching=false;const attachmentUrls=new Set();
let socket, me, token, room, preview = false, intentionalClose = false, reconnectTimer, connectTimer;
let iceServers=[], peers=new Map(), localStream=new MediaStream(), yt, ytReady=false, ytPromise;
let xpartyUI=null,wasLocalPaused=false,roomInteractions=null,callExperience=null,playbackData=null;
let nativeYouTube=null,vimeo=null,providerLoad=null,roomDesign,providerUI,fullscreen,suggestions,iptv,iptvPlayer;
let sourceId=null, pendingFile=null, ownedFile=null, ownedFileId=null, objectUrl=null, activePlayback;
let suppressUntil=0, lastCorrected=0, appliedRevision=-1, clockOffset=0, bestRTT=Infinity, lastAnchor=0, lastSeek=0;
let audioContext, movieGain, movieAudio, callVolume=1, movieVolume=.7, busyMedia=false;
let bufferTimer,bufferReported=false,autoDriftSince=0,lastPlayAttempt=0,nativeBufferTimer=null,nativeBuffering=false,lastNativePlayAttempt=0;let cameraFacing='user';let speakerOn=true,viewMode='default',joinLookup=0,lookupTimer;const observedMessages=new Set();
let recipient=null,unread=0,typingTimer,lastTyping=0;const typingPeople=new Map();let vcVisible=false,chatVisible=true,buffering=false,settleUntil=0;
let fileJob=null,loadedFileId=null,downloadId=null,readySent=null;
const SESSION='xparty-session-v2';
const filePlayer=$('file-player');
const memberProfiles=initMemberProfiles({getContext:()=>({room,me,send}),notify:toast});
const skipVoting=initSkipVoting({getContext:()=>({room,me,send})});
const nativeVideo=initNativeVideo({onAvailable:()=>{if(room?.source&&nativeVideo.handles(room.source))applySource(room.source);},onReady:()=>{readySent=sourceId;send('ready',{sourceId,ready:true,status:'Native video ready'});applyPlayback(true);if(iptv?.consumeAutoplay(room?.source))command(true,0);},onState:event=>{
  // Short IME-induced rebuffering must not pause everyone in the room.
  if(event.type==='buffering'){nativeBuffering=true;clearTimeout(nativeBufferTimer);const expected=sourceId;nativeBufferTimer=setTimeout(()=>{if(nativeBuffering&&sourceId===expected&&nativePlayback())reportBuffer(true);},1800);}
  if(event.type==='buffered'||event.type==='ready'){nativeBuffering=false;clearTimeout(nativeBufferTimer);nativeBufferTimer=null;reportBuffer(false);}
  ambient.update();
 },onEnded:()=>playbackEnded(),onError:message=>{status('Native video unavailable');send('ready',{sourceId,ready:false,status:'Native video unavailable'});toast(message);}});
function usesEmbed(source){return isEmbedded(source)&&!nativeVideo.handles(source);}
function nativePlayback(){return nativeVideo.handles(room?.source);}
function playLocalVideo(){if(room?.source?.type==='iptv'&&!nativePlayback())iptvPlayer?.goLive();if(nativePlayback()){nativeVideo.play();return Promise.resolve();}return filePlayer.play();}
function pauseLocalVideo(){if(nativePlayback())nativeVideo.pause();else filePlayer.pause();}
const fluidBackground=initFluidBackground();
const ambient=initAmbient({frameBridge:nativeVideo,onMode:(mode,palette)=>fluidBackground.setMode(mode,palette),getContext:()=>({room:xpartyUI?.local?{...room,source:xpartyUI.local.source}:room,video:xpartyUI?.local?.video||(isVideoElement(room?.source)&&!room?.source?.radio&&!nativePlayback()?filePlayer:null),position:xpartyUI?.local?.video.currentTime??(room?.source?currentTime():0),nativeActive:!xpartyUI?.local&&nativeVideo.active,playing:xpartyUI?.local?!xpartyUI.local.video.paused:!!room?.playback?.playing&&!localPaused&&!room?.playback?.waitingFor?.length})});
const companion=initCompanion({getContext:()=>({room,me,clockOffset,localPaused,connected:socket?.readyState===1}),notify:toast,onIntent:({playing,position,intent})=>{if(!room)return;if(room.hostId!==me&&room.mode!=='SHARED_CONTROL'){if(intent==='pause'||intent==='play'){localPaused=!playing;companion.applyPlayback(true);}return;}send('playback',{sourceId,playing,position,intent});},onChange:state=>{providerUI?.update();if(isCompanion(room?.source)){status(state.message);const ready=['ready','playing','paused','local-paused'].includes(state.status);if(readySent!==ready){readySent=ready;send('ready',{sourceId,ready,status:state.message});}}}});
function toast(text) { $('toast').textContent=t(text);$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6500); }
function status(text) {const el=$('sync-status');el.setAttribute('data-localize-dynamic','');el.lastChild.textContent=' '+t(text);}
function notice(text) {$('connection-notice').textContent=text||'Connected. Share the room code privately.';}
function send(type, fields={}) {if(['playback','source','next','previous','party-mode'].includes(type))fields.eventId??=crypto.randomUUID();if(type==='playback'&&!fields.intent)fields.intent=Math.abs((fields.position||0)-currentTime())>1?'seek':fields.playing?'play':'pause';if(preview) {toast('This is a design preview. Create a room to connect.');return false;}if(socket?.readyState!==WebSocket.OPEN){toast('Room connection is offline. Reconnecting…');return false;}socket.send(JSON.stringify({type,...fields}));return true;}
function ping() {if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping',sent:Date.now()}));}
let serviceWarmup, preparingConnection=false;
const serviceStatus=document.createElement('p');serviceStatus.className='small';serviceStatus.setAttribute('role','status');serviceStatus.hidden=true;$('create').parentElement.append(serviceStatus);
function warmService(){
 if(serviceWarmup)return serviceWarmup;
 serviceWarmup=(async()=>{const deadline=Date.now()+100000;while(Date.now()<deadline){try{const response=await fetch(base+'/health',{cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await response.json();if(response.ok&&data.ok&&data.service==='Xparty')return;}catch{}await new Promise(resolve=>setTimeout(resolve,2000));}throw new Error('The party server is taking longer than expected. Please try again.');})().finally(()=>{serviceWarmup=null;});return serviceWarmup;
}
// One bounded warm-up per visit; no idle keep-alive traffic.
if(base!==location.origin)warmService().catch(()=>{});
async function connect(action) {
 if(preparingConnection||switching)return;
 if(!room&&action.type!=='resume'){preparingConnection=true;$('create').disabled=true;$('join-button').disabled=true;serviceStatus.hidden=false;serviceStatus.textContent=t('Connecting to the party server… First connection may take about a minute.');
 try{await warmService();}catch(error){toast(error.message);return;}finally{preparingConnection=false;serviceStatus.hidden=true;$('create').disabled=false;$('join-button').disabled=false;}}

  preview=false;intentionalClose=false;clearTimeout(reconnectTimer);clearTimeout(connectTimer);
  $('create').disabled=true;$('join-form').querySelector('button').disabled=true;
  let url;try{url=new URL(base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';}catch{toast('The room service address is invalid.');return;}
  if(switching)return;
  const oldSocket=socket, switchingRoom=!!room&&['create','join'].includes(action.type);
  switching=switchingRoom;
  if(!switchingRoom&&socket?.readyState<2)socket.close();
  const ws=new WebSocket(url);let welcomed=false;connectionStatus(action.type==='resume'?'reconnecting':'connecting');if(!switchingRoom)socket=ws;
  const handshakeTimer=setTimeout(()=>{if(!welcomed&&ws.readyState<2){ws.close(4001,'Room handshake timeout');if(!token)toast('The room service did not respond. Try again.');}},15000);connectTimer=handshakeTimer;
  ws.onopen=()=>{if(ws!==socket&&!switchingRoom){ws.close();return;}heartbeat.heard();bestRTT=Infinity;ws.send(JSON.stringify(action));if(ws===socket)ping();};
  ws.onmessage=e=>{if(ws!==socket&&!switchingRoom)return;if(ws===socket){heartbeat.heard();if(welcomed&&connectionState==='checking')connectionStatus('connected');}try{const message=JSON.parse(e.data);if(message.type==='welcome'){welcomed=true;clearTimeout(handshakeTimer);reconnectAttempts=0;connectionStatus('connected');}
    if(switchingRoom&&ws!==socket){
      if(message.type==='welcome'){socket=oldSocket;leave(true);socket=ws;intentionalClose=false;switching=false;}
      else if(message.type==='error'||message.type==='resume-failed'){switching=false;clearTimeout(connectTimer);ws.close();toast(message.message||'Unable to join this room.');$('create').disabled=false;$('join-button').disabled=false;return;}
      else return;
    }
    handle(message);}catch(error){console.error('Room event failed',error);toast('An action failed. Please retry.');}};
  ws.onerror=()=>{if(!room){$('setup-notice').hidden=false;toast('Unable to reach the room service. The portal needs a live backend.');}};
  ws.onclose=e=>{
    clearTimeout(handshakeTimer);if(ws!==socket){if(switchingRoom)switching=false;return;}$('create').disabled=false;$('join-form').querySelector('button').disabled=false;
    if(e.code===4000){const saved=readSession();leave(false);if(saved)try{localStorage.setItem(SESSION,JSON.stringify(saved));}catch{}toast("This session was opened in another connection.");return;}
    if(!intentionalClose && !suspended && token){scheduleReconnect();}
    else if(!intentionalClose&&!suspended){$('setup-notice').hidden=false;}
  };
}
function handle(m) {
  if(m.type==='request-status'){toast(m.request.status==='HOST_REVIEW'?'Request sent to the host.':m.request.status+': '+m.request.reason);return;}
  if(m.type==='error'){toast(m.message);$('create').disabled=false;$('join-form').querySelector('button').disabled=false;return;}
  if(m.type==='pong') {const rtt=Date.now()-m.sent;if(rtt<bestRTT+20){bestRTT=Math.min(bestRTT,rtt);clockOffset=m.serverTime-(m.sent+rtt/2);}return;}
  if(m.type==='typing'){if(m.active)typingPeople.set(m.from,{name:m.name,until:Date.now()+4500});else typingPeople.delete(m.from);renderTyping();return;}
  if(m.type==='resume-failed' || m.type==='ended' || m.type==='kicked'){sessionStorage.removeItem('xparty-owner-return');document.documentElement.removeAttribute('data-restoring');const msg=m.message||'This room expired. Create or join a room again.';leave(false);toast(msg);return;}
  if(m.type==='ptt-status'){toast(m.approved?t('Push to talk approved'):t('Push to talk declined'));return;}
  if(m.type==='call-seat-status'){toast(({pending:'Call seat requested. Waiting for the host.',approved:'Seat approved. You can turn on your camera or microphone.',declined:'The host declined your seat request.'})[m.status]);return;}
  if(m.type==='moderation'){toast(({mute:'The host muted your microphone.','allow-mic':'You can turn on your microphone again.','offer-mic':'The host offered you a microphone. Tap Mic when you are ready.','camera-off':'The host turned off your camera.','approve-camera':'Camera approved. Tap Camera to turn it on.','deny-camera':'Your camera request was declined.'})[m.action]);return;}
  if(m.type==='profile-details'){window.dispatchEvent(new CustomEvent('xparty:profile-details',{detail:m}));return;}
  if(m.type==='welcome') {connectionStatus('connected');setTimeout(showRoomGuide,600);
    for(const p of peers.values())closePeer(p);peers.clear();me=m.id;token=m.token;iceServers=m.iceServers;room=m.room;saveSession({token,base,code:m.room.code,id:m.id});$('active-room-banner').hidden=true;
    $('lobby').hidden=true;$('room').hidden=false;$('return-room').hidden=true;$('demo-banner').hidden=true;
    document.documentElement.removeAttribute('data-restoring');$('setup-notice').hidden=true;$('network').lastChild.textContent=' Room connected';
    notice(m.hasRelay?'':'Direct calls are available. A relay is not configured, so calls may fail across some networks.');
    $('youtube-input').placeholder='Search YouTube or paste a video link';
    friendRequests=m.friendRequests||[];renderRoomFriends();$('messages').replaceChildren();
    unread=0;updateUnread();updateRoom(m.room);if(localStream.getTracks().some(t=>t.readyState==='live')&&room.people.find(p=>p.id===me)?.inCall)updateMedia().catch(()=>{});for(const message of m.history||[])addMessage(message,false);if(room.source?.type==='file'&&loadedFileId===sourceId&&filePlayer.readyState>=1){readySent=null;fileReady();}return;
  }
  if(m.type==='owner-moderation'){const kind=m.action==='mute'?'audio':m.action==='camera-off'?'video':null;if(kind){for(const track of localStream.getTracks().filter(t=>t.kind===kind)){track.stop();localStream.removeTrack(track);}updateMedia().catch(()=>{});}return;}
  if(m.type==='state') {updateRoom(m.room);return;}
  if(m.type==='playback' || m.type==='anchor') {
    if(!room || m.sourceId!==room.source?.id)return;
    const newCommand=m.playback.revision!==activePlayback?.revision;room.playback=m.playback;activePlayback=m.playback;if(newCommand&&!localPaused&&usesEmbed(room.source)){clearTimeout(bufferTimer);bufferReported=false;if(m.playback.playing){if(!ytReady)reportBuffer(true);else if(yt.getPlayerState()===3)bufferTimer=setTimeout(()=>reportBuffer(true),1200);}}applyPlayback(newCommand||m.resync===true);ambient.update();return;
  }
  if(m.type==='reaction'){toast(m.name+' '+m.emoji);return;}
   if(m.type==='chat-updated'){const el=[...$('messages').querySelectorAll('[data-message-id]')].find(e=>e.dataset.messageId===m.id);if(el){let p=el.querySelector(':scope>p');if(!p){p=document.createElement('p');el.append(p);}p.textContent=m.deleted?'Message deleted':m.text;el.dataset.deleted=String(!!m.deleted);if(m.edited)el.dataset.edited='true';}return;}
  if(m.type.startsWith('video-call-')){callExperience?.onEvent(m);return;}
  if(m.type==='friend-state'){friendRequests=m.requests||[];renderRoomFriends();if(room){renderPeople();renderRequestNotices();}if(friendRequests.some(q=>q.to===me&&q.status==='pending'))toast('A friend request is waiting in Friends.');return;}if(m.type==='poll-update'){for(const e of document.querySelectorAll('[data-poll-id]'))if(e.dataset.pollId===m.poll.id)renderPoll(e,m.poll);return;}if(m.type==='chat'){addMessage(m);return;}if(['member-report','report-sent'].includes(m.type)){roomInteractions?.onEvent(m);return;}
  if(m.type==='read'||m.type==='delivered'){const node=document.querySelector('[data-message-id="'+CSS.escape(m.id)+'"] .read-receipt');if(node){if(m.type==='read'){node.dataset.state='read';node.textContent='◉';node.setAttribute('aria-label',t('Seen'));notifySound('read');}else if(node.dataset.state!=='read'){node.dataset.state='delivered';node.textContent='✓✓';node.setAttribute('aria-label',t('Delivered'));}}return;}
  if(m.type==='signal'){if(m.signal?.reset){const old=peers.get(m.from);if(old){closePeer(old);peers.delete(m.from);}ensurePeer(m.from);renderPeople();return;}const peer=ensurePeer(m.from);if(peer) peer.queue=peer.queue.then(()=>receiveSignal(peer,m.signal)).catch(error=>{console.warn(error);schedulePeerRecovery(peer);});}
}
function updateRoom(next) {
  const previous=room;room=next;activePlayback=room.playback;document.body.classList.toggle('in-room',!$('room').hidden);if(previous&&previous!==next){const before=previous.people.filter(p=>p.online).length,after=room.people.filter(p=>p.online).length;if(after!==before)notifySound(after>before?'join':'leave');} $('queue-order').value=queueOrder(room);$('queue-order').disabled=room.hostId!==me;$('auto-advance').checked=room.autoAdvance!==false;$('auto-advance').disabled=room.hostId!==me;$('guest-themes').checked=!!room.guestThemes;$('guest-themes').disabled=room.hostId!==me;renderCapacity();
  $('room-code').textContent=room.code;$('people-count').textContent=roomOccupancy(room.people.filter(p=>p.online).length,room.capacity);
  $('lock').hidden=room.hostId!==me;$('lock').textContent=t(room.locked?'Unlock room':'Lock room');$('lock').setAttribute('aria-checked',room.locked);$('lock-toggle').checked=room.locked;$('lock-switch').hidden=room.hostId!==me;$('capacity-control').hidden=room.hostId!==me;if(!$('room-settings-dialog').open)$('room-capacity').value=room.capacity===null?'none':String(room.capacity);renderCapacity();
  const host=room.hostId===me;renderPushToTalk();if(localPaused&&(host||room.mode==='SHARED_CONTROL'))localPaused=false;document.documentElement.dataset.theme=room.theme||preferences.theme;$('room-theme').value=room.theme||'';$('room-theme').disabled=!host&&!room.guestThemes;$('theme-select').disabled=!host&&!room.guestThemes;
  $('youtube-input').disabled=false;$('load-video').disabled=false;$('next-video').hidden=!host;$('file-input').disabled=!host;
  $('host-note').textContent=room.hostId===me?'You control this party. Change modes from the key menu.':'Playback follows the mode selected by your host.';
  const self=room.people.find(p=>p.id===me);$('message-input').disabled=!!self?.chatBlocked;$('message-input').placeholder=self?.chatBlocked?'Chat paused by the host':'Write a message…';let removed=false;for(const track of localStream.getTracks()){if(!self?.inCall||(track.kind==='audio'&&self?.micBlocked)||(track.kind==='video'&&!host&&!self?.cameraAllowed)){track.stop();localStream.removeTrack(track);removed=true;}}if(removed){$('mic').setAttribute('aria-pressed',localStream.getAudioTracks().some(t=>t.enabled&&t.readyState==='live'));$('camera').setAttribute('aria-pressed',localStream.getVideoTracks().some(t=>t.enabled&&t.readyState==='live'));updateMedia();}
  renderQueue();renderPartyControls();memberProfiles.update();updateDiscovery(preview?null:room,me);skipVoting.update();subtitles.update();
  for(const [id,p]of peers) {const person=room.people.find(x=>x.id===id);if(!self?.inCall||!person?.inCall||(!person.online&&person.reservedUntil<=Date.now())||p.session!==person.session){closePeer(p);peers.delete(id);}}
  if(!preview)for(const person of room.people)if(self?.inCall&&person.inCall&&person.id!==me && person.online)ensurePeer(person.id);
  renderPeople();updateChatMic();renderMembers();$('call-seat').setAttribute('aria-pressed',String(!!self?.inCall));$('call-seat').textContent=t(self?.inCall?'Leave call':'Join call');icon($('call-seat'),self?.inCall?'hangup':'phone',self?.inCall?'Drop call seat':self?.seatRequested?'Cancel seat request':'Take call seat');$('call-seats').textContent=room.people.filter(p=>p.inCall&&p.online).length+'/'+MAX_CALL_SEATS;$('mic').disabled=!self?.inCall;$('camera').disabled=!self?.inCall;if(recipient&&!room.people.some(p=>p.id===recipient.id))setRecipient(null);
  if((room.source?.id||null)!==sourceId) applySource(room.source);
  else if(room.source) applyPlayback(false);
  ambient.update();xpartyUI?.update();companion.update();providerUI?.update();roomDesign?.update();fullscreen?.update();suggestions?.update();iptv?.update();roomInteractions?.update();callExperience?.update();playbackData?.update();
  if(room.source?.type==='file')ensureFile();
  if(room.source?.type==='file' && room.source.uploaded && room.people.filter(p=>p.online).every(p=>p.ready)){$('transfer-label').textContent='Everyone has the file. Ready to play together.';status('Ready together');}
}
function renderPeople() {
  const people=(room?.people||[]).filter(p=>p.inCall||p.id===me);const container=$('participants');
  for(const child of [...container.children])if(!people.some(p=>child.dataset.id===p.id))child.remove();
  for(const person of people) {
    let tile=[...container.children].find(el=>el.dataset.id===person.id);
    if(!tile){tile=document.createElement('div');tile.className='participant';tile.dataset.id=person.id;tile.innerHTML='<span class="avatar"></span><video autoplay playsinline muted hidden></video><div class="person-label"><span></span><small></small></div>';container.append(tile);}
    tile.querySelector('.avatar').textContent=person.name.charAt(0).toUpperCase();
    tile.querySelector('.person-label>span').title=person.name;tile.querySelector('.person-label>span').textContent=person.name+(person.id===me?' · You':'');
    tile.querySelector('.host-crown')?.remove();if(person.id===room.hostId){const crown=document.createElement('span');crown.className='host-crown';crown.setAttribute('role','img');icon(crown,'crown',t('Host'));tile.querySelector('.person-label>span').prepend(crown);}
    let indicators=tile.querySelector('.media-status');if(!indicators){indicators=document.createElement('span');indicators.className='media-status';tile.querySelector('.person-label').append(indicators);}indicators.replaceChildren();for(const [name,on]of [['mic',person.mic],['camera',person.camera]]){const mark=document.createElement('span');icon(mark,name,t(name==='mic'?(on?'Mic on':'Mic off'):(on?'Camera on':'Camera off')));mark.setAttribute('role','img');mark.classList.toggle('off',!on);indicators.append(mark);}
    const p=peers.get(person.id), local=person.id===me;indicators.hidden=local;
    const state=peerLabel({local,online:person.online,inCall:person.inCall,signaling:connectionState,peerState:p?.pc.connectionState,preview});
    tile.querySelector('.person-label small').textContent=t(state);
    const video=tile.querySelector('video');const stream=local?localStream:p?.stream;
    if(stream && video.srcObject!==stream){video.srcObject=stream;video.play().catch(()=>{});}
    video.muted=true;video.hidden=!person.camera; // Audio is mixed independently through Web Audio.
    if(!local && p)attachRemoteAudio(p,video);
    if(local){let controls=tile.querySelector('.local-controls');if(!controls){controls=document.createElement('div');controls.className='local-controls';tile.append(controls);}controls.append($('mic'),$('camera'),$('camera-flip'));tile.classList.add('self');tile.dataset.facing=cameraFacing;}
    tile.classList.toggle('camera-active',person.camera);ensureParticipantPip(tile,person);
    tile.querySelector('.moderation')?.remove();
    tile.querySelector('.tile-friend')?.remove();
    if(room.source?.type==='file')tile.querySelector('.person-label small').textContent+=' · '+(person.ready?'Video ready':person.loadStatus||'Loading');
  }
  for(const [i,tile]of [...container.children].entries()){tile.classList.toggle('primary-call-tile',i<2);tile.classList.toggle('bubble-call-tile',i>=2);}
  const watchers=$('watching-members');watchers.replaceChildren();for(const person of room.people.filter(p=>p.online&&!p.inCall&&p.id!==me)){const item=document.createElement('span');item.textContent=person.name;item.setAttribute('aria-label',person.name+' is watching');watchers.append(item);}
  callPanel.dataset.active=String(people.filter(p=>p.camera).length);
  swapCamera.disabled=people.length<2;container.dataset.active=String(people.filter(p=>p.camera).length);container.dataset.count=String(people.length);container.classList.toggle('duo',people.length===2);$('camera-flip').disabled=!localStream.getVideoTracks().some(t=>t.readyState==='live');
  callExperience?.update();
  if(!callControlTimer)revealCallControls();
  const connected=[...peers.values()].filter(p=>p.pc.connectionState==='connected').length;
  $('call-status').textContent=preview?'Design preview — no camera or microphone is active.':peers.size?`${connected}/${peers.size} peer connections ready · Your mic ${localStream.getAudioTracks().some(t=>t.enabled)?'is on':'is off'}`:'Your microphone and camera are off.';
}
function ensurePeer(id) {
  if(preview || id===me || !room?.people.some(p=>p.id===id&&p.inCall)||!room?.people.some(p=>p.id===me&&p.inCall))return;
  if(peers.has(id))return peers.get(id);
  const pc=new RTCPeerConnection({iceServers});
  const p={id,pc,session:room.people.find(x=>x.id===id)?.session,stream:new MediaStream(),queue:Promise.resolve(),candidates:[],initiator:me.localeCompare(id)<0,sending:null,receive:null};peers.set(id,p);
  pc.onicecandidate=e=>{if(e.candidate)send('signal',{to:id,signal:{candidate:e.candidate}});};
  pc.ontrack=e=>{if(!p.stream.getTracks().some(t=>t.id===e.track.id))p.stream.addTrack(e.track);if(e.track.kind==='audio')e.track.onunmute=()=>attachRemoteAudio(p);renderPeople();};
  pc.onconnectionstatechange=()=>{renderPeople();if(pc.connectionState==='connected'){clearTimeout(p.recoveryTimer);p.recoveryAttempts=0;peerRetries.delete(p.id);}else if(['failed','disconnected'].includes(pc.connectionState))schedulePeerRecovery(p);};
  p.recoveryTimer=setTimeout(()=>{if(pc.connectionState!=='connected')recoverPeer(p);},12000);
  pc.oniceconnectionstatechange=()=>{if(['failed','disconnected'].includes(pc.iceConnectionState))schedulePeerRecovery(p);};
  pc.ondatachannel=e=>setupChannel(p,e.channel);
  if(p.initiator) {
    pc.addTransceiver('audio',{direction:'sendrecv'});pc.addTransceiver('video',{direction:'sendrecv'});
    setupChannel(p,pc.createDataChannel('xparty-file',{ordered:true}));
    pc.onnegotiationneeded=()=>{p.queue=p.queue.then(async()=>{if(peers.get(id)!==p||pc.signalingState!=='stable')return;await replaceTracks(p);await pc.setLocalDescription(await pc.createOffer());send('signal',{to:id,signal:{description:pc.localDescription}});}).catch(()=>schedulePeerRecovery(p));};
  }
  return p;
}
function schedulePeerRecovery(p){
  clearTimeout(p.recoveryTimer);
  if(peers.get(p.id)!==p||!['failed','disconnected','connecting','new'].includes(p.pc.connectionState))return;
  const attempts=peerRetries.get(p.id)||0;p.recoveryTimer=setTimeout(()=>recoverPeer(p),Math.max(p.pc.connectionState==='disconnected'?4000:800,retryDelay(attempts)));
}
function recoverPeer(p,force=false){
  if(peers.get(p.id)!==p||!room?.people.some(x=>x.id===p.id&&x.online&&x.inCall)||socket?.readyState!==WebSocket.OPEN)return;
  if(!force&&p.pc.connectionState==='connected')return;
  if(!force&&Date.now()-(p.lastRecovery||0)<3000){schedulePeerRecovery(p);return;}
  p.lastRecovery=Date.now();p.recoveryAttempts=(peerRetries.get(p.id)||0)+1;peerRetries.set(p.id,p.recoveryAttempts);
  if(p.initiator&&p.recoveryAttempts%3===0){send('signal',{to:p.id,signal:{reset:true}});closePeer(p);peers.delete(p.id);ensurePeer(p.id);renderPeople();return;}
  if(p.initiator)p.pc.restartIce();else send('signal',{to:p.id,signal:{restart:true}});
  clearTimeout(p.recoveryTimer);
  p.recoveryTimer=setTimeout(()=>{if(p.pc.connectionState!=='connected')recoverPeer(p);},retryDelay(p.recoveryAttempts));
}
window.addEventListener('online',()=>{heartbeat.resume();if(token&&(!socket||socket.readyState>=2)){clearTimeout(reconnectTimer);connect({type:'resume',token});}else{if(room)connectionStatus('checking');ping();}for(const p of peers.values())recoverPeer(p,true);});
window.addEventListener('offline',()=>{heartbeat.pause();clearTimeout(reconnectTimer);if(room)connectionStatus('offline');});
async function replaceTracks(p) {
  if(p.pc.signalingState==='closed')return;
  for(const t of p.pc.getTransceivers()) {
    const kind=t.receiver.track.kind;const track=localStream.getTracks().find(x=>x.kind===kind)||null;
    if(p.pc.signalingState==='closed')return;
    try{await t.sender.replaceTrack(track);}catch(error){if(p.pc.signalingState==='closed')return;throw error;}
    if(p.pc.signalingState==='closed')return;
    if(kind==='video' && track){try{const params=t.sender.getParameters();params.encodings??=[{}];params.encodings[0].maxBitrate=preferences.quality==='saver'?140000:300000;await t.sender.setParameters(params);}catch{}}
  }
}
async function receiveSignal(p,signal) {
  if(signal.restart){if(p.initiator)p.pc.restartIce();return;}
  if(signal.description){const d=signal.description;if(!['offer','answer'].includes(d.type)||p.pc.signalingState==='closed'||d.type==='answer'&&p.pc.signalingState!=='have-local-offer')return;
    await p.pc.setRemoteDescription(d);
    for(const c of p.candidates)await p.pc.addIceCandidate(c);p.candidates=[];
    if(d.type==='offer'){for(const t of p.pc.getTransceivers())t.direction='sendrecv';await replaceTracks(p);await p.pc.setLocalDescription(await p.pc.createAnswer());send('signal',{to:p.id,signal:{description:p.pc.localDescription}});}
  }else if(signal.candidate){if(p.pc.remoteDescription)await p.pc.addIceCandidate(signal.candidate);else p.candidates.push(signal.candidate);}
}
function closePeer(p) {clearTimeout(p.recoveryTimer);p.sending=null;p.receive=null;p.gain?.disconnect();p.audioSource?.disconnect();p.fallbackAudio?.remove();p.pc.close();}
async function unlockAudio() {
  try{
    audioContext??=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();
    for(const p of peers.values())attachRemoteAudio(p);
    if(!movieAudio&&!nativePlayback()){movieAudio=audioContext.createMediaElementSource(filePlayer);movieGain=audioContext.createGain();movieAudio.connect(movieGain).connect(audioContext.destination);}
    if(movieGain)movieGain.gain.value=movieVolume;nativeVideo.setVolume(movieVolume);filePlayer.volume=1;filePlayer.muted=false;if(ytReady){yt.unMute?.();yt.setVolume(movieVolume*100);}for(const p of peers.values()){p.fallbackAudio?.play().catch(()=>{});}
    $('enable-audio').textContent=t('Sound enabled');$('enable-audio').setAttribute('aria-pressed','true');$('settings-enable-audio').textContent=t('Sound enabled');
  }catch{filePlayer.volume=movieVolume;toast('Use your device sound controls if the volume sliders are restricted.');}
}
function attachRemoteAudio(p) {
  if(!p.stream.getAudioTracks().length)return;
  // One native audio element per peer: avoids duplicate output and allows browser call processing.
  p.gain?.disconnect();p.audioSource?.disconnect();p.gain=null;p.audioSource=null;
  if(!p.fallbackAudio){const audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;p.fallbackAudio=audio;document.body.append(audio);}
  const audio=p.fallbackAudio;if(audio.srcObject!==p.stream)audio.srcObject=p.stream;
  audio.volume=callVolume;audio.muted=!speakerOn||roomInteractions?.isMuted(p.id)||!room?.people.find(x=>x.id===p.id)?.mic;
  audio.play().then(()=>{p.audioBlocked=false;}).catch(()=>{p.audioBlocked=true;$('speaker').classList.add('audio-needs-tap');$('speaker').setAttribute('aria-label','Tap to enable call audio');});
}
async function toggleMedia(kind) {
  if(preview)return toast('Create a room to start a call.');if(busyMedia)return;
  const self=room?.people.find(p=>p.id===me);if(kind==='audio'&&room?.pttEnabled){openPushToTalk();return;}if(kind==='audio'&&self?.micBlocked)return toast('The host has disabled your microphone.');if(!self?.inCall)return toast('Join a call seat first. Up to six people can call.');if(kind==='audio'&&self?.micBlocked)return toast('The host has muted your microphone.');if(kind==='video'&&room?.hostId!==me&&!self?.cameraAllowed){send('request-camera');return toast('Camera request sent to the host.');}
  busyMedia=true;$('mic').disabled=true;$('camera').disabled=true;
  try {
    let track=localStream.getTracks().find(t=>t.kind===kind);
    if(track){track.enabled=false;track.stop();localStream.removeTrack(track);send('media',{mic:localStream.getAudioTracks().some(t=>t.enabled&&t.readyState==='live'),camera:localStream.getVideoTracks().some(t=>t.enabled&&t.readyState==='live')});}else{
      await unlockAudio();
      const stream=await navigator.mediaDevices.getUserMedia(kind==='audio'?{audio:{echoCancellation:preferences.echo,noiseSuppression:preferences.noise,autoGainControl:true,channelCount:1,latency:{ideal:.02}},video:false}:{video:{width:{ideal:preferences.quality==='saver'?240:360},height:{ideal:preferences.quality==='saver'?320:480},frameRate:{ideal:15,max:15},facingMode:'user'},audio:false});
      track=stream.getTracks()[0];localStream.addTrack(track);track.onended=()=>{localStream.removeTrack(track);updateMedia();};
    }
    await updateMedia();
  }catch(e){console.warn('Media permission or track error', e.name, e.message);toast(e.name==='NotAllowedError'?'Allow camera/microphone access in your browser, then try again.':'Camera or microphone is unavailable. Check permissions and whether another app is using it.');}
  finally{busyMedia=false;$('mic').disabled=false;$('camera').disabled=false;}
}
async function updateMedia(){
  await Promise.all([...peers.values()].map(replaceTracks));
  const mic=localStream.getAudioTracks().some(t=>t.enabled&&t.readyState==='live'),camera=localStream.getVideoTracks().some(t=>t.enabled&&t.readyState==='live');
  $('mic').textContent=t(mic?'Mic on':'Mic off');$('mic').setAttribute('aria-pressed',mic);$('camera').textContent=t(camera?'Camera on':'Camera off');$('camera').setAttribute('aria-pressed',camera);
  send('media',{mic,camera,ptt:pttHeld});renderPeople();updateChatMic();audioDiagnostics();
}
function setupChannel(p,dc){p.dc=dc;dc.onopen=()=>renderPeople();}
function transfer(text,percent){$('transfer').hidden=false;$('transfer-label').textContent=text;$('transfer-progress').value=percent;}
function fileReady(){if(!isVideoElement(room?.source)||filePlayer.readyState<1||readySent===sourceId)return;readySent=sourceId;send('ready',{sourceId,ready:true,status:'Ready'});applyPlayback(true);if(iptv?.consumeAutoplay(room?.source))command(true,0);}
async function uploadFile(file,id){
 const controller=fileJob=new AbortController();
 try{for(let offset=0;offset<file.size;){const chunk=file.slice(offset,offset+2*1024*1024);const res=await fetch(base+'/api/file/'+id,{method:'PUT',headers:{Authorization:'Bearer '+token,'X-File-Offset':String(offset)},body:chunk,signal:controller.signal});const data=await res.json();if(!res.ok)throw new Error(data.error);offset=data.offset;transfer('Uploading video · '+Math.round(offset*100/file.size)+'%',offset*100/file.size);}transfer('Uploaded. Guests are loading the video…',100);}catch(e){if(e.name!=='AbortError'){transfer('Upload interrupted. Select the file again to retry.',0);toast(e.message);}}
}
async function ensureFile(){
 const source=room?.source;if(source?.type!=='file'||!source.uploaded||loadedFileId===source.id||downloadId===source.id)return;
 if(nativeVideo.handles(source)){loadedFileId=source.id;nativeVideo.load(source,{base,token});return;}
 const id=source.id;downloadId=id;const controller=fileJob=new AbortController();
 try{transfer('Receiving '+source.title,0);const res=await fetch(base+'/api/file/'+id,{headers:{Authorization:'Bearer '+token},signal:controller.signal});if(!res.ok)throw new Error((await res.json()).error);const reader=res.body.getReader(),parts=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;parts.push(value);size+=value.length;transfer('Receiving video · '+Math.round(size*100/source.size)+'%',size*100/source.size);}if(id!==sourceId)return;if(size!==source.size)throw new Error('Incomplete download. Tap Resync to retry.');loadedFileId=id;setFileBlob(new Blob(parts,{type:source.mime}));transfer('Received. Loading video…',100);}catch(e){if(e.name!=='AbortError'){transfer('Could not receive video. Tap Resync to retry.',0);toast(e.message);}}finally{if(downloadId===id)downloadId=null;}
}
function setFileBlob(blob) {if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);filePlayer.src=objectUrl;filePlayer.load();}
async function applySource(source) {showControls();clearTimeout(nativeBufferTimer);nativeBufferTimer=null;nativeBuffering=false;lastNativePlayAttempt=0;nativeVideo.stop();
  document.body.classList.toggle('room-has-source',!!source);document.body.classList.remove('browsing');$('search-status').textContent='';
  localReplay=false;localPaused=false;clearTimeout(bufferTimer);bufferReported=false;buffering=false;settleUntil=0;autoDriftSince=0;fileJob?.abort();downloadId=null;loadedFileId=null;readySent=null;sourceId=source?.id||null;appliedRevision=-1;suppressUntil=Date.now()+1400;lastCorrected=0;
  providerLoad?.abort();iptvPlayer?.destroy();iptvPlayer=null;providerLoad=new AbortController();companion.disconnect();vimeo?.destroy();vimeo=null;yt=nativeYouTube;ytReady=!!nativeYouTube;const vimeoHost=$('vimeo-player');if(vimeoHost)vimeoHost.replaceChildren();$('vimeo-wrap').hidden=!['vimeo','twitch','soundcloud'].includes(source?.type);providerUI?.update();
  filePlayer.pause();filePlayer.removeAttribute('src');filePlayer.load();if(ytReady)yt.stopVideo();

  if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
  if(!['direct','iptv'].includes(source?.type))filePlayer.removeAttribute('crossorigin');
  $('transfer').hidden=true;$('empty-player').hidden=!!source;$('youtube-wrap').hidden=source?.type!=='youtube';filePlayer.hidden=!isVideoElement(source);
  $('stage-title').hidden=!source;$('stage-title').textContent=source?.title||'';if(!source){$('video-title').textContent='';status('Waiting for a video');return;}
  $('video-title').textContent=source.title;for(const card of document.querySelectorAll('.provider-card'))card.setAttribute('aria-pressed',String(card.dataset.provider===source.type));
  if(isCompanion(source)){status('Connect your service tab');companion.update();providerUI?.update();
  }else if(['vimeo','twitch','soundcloud'].includes(source.type)){
    const expected=source.id,name=providerName(source.type);status('Loading '+name);
    const create={vimeo:createVimeoPlayer,twitch:createTwitchPlayer,soundcloud:createSoundCloudPlayer}[source.type];
    try{const player=await create($('vimeo-player'),source.videoId,e=>{if(sourceId===expected)youtubeEvent(e);},()=>{if(sourceId===expected){reportBuffer(false);$('unlock-playback').hidden=false;status(name+' playback needs attention');toast(name+' could not play. Choose content that allows embedding.');}},{signal:providerLoad.signal});if(sourceId!==expected){player.destroy();return;}vimeo=player;yt=player;ytReady=true;applyPlaybackSound();send('ready',{sourceId,ready:true});applyPlayback(true);}catch(e){if(sourceId===expected){status(name+' unavailable');toast(e.message);}}
  }else if(source.type==='iptv'){
    const expected=source.id;status('Connecting to live IPTV');if(nativeVideo.handles(source))nativeVideo.load(source,{base,token});else try{iptvPlayer=await createIPTVPlayer(filePlayer,source.url,{audioOnly:source.radio===true,signal:providerLoad.signal,onError:message=>{if(sourceId!==expected)return;status('Channel unavailable');readySent=null;send('ready',{sourceId,ready:false,status:'Channel unavailable'});toast(message);}});}catch(error){if(sourceId===expected){status('IPTV unavailable');toast(error.message);}}
  }else if(source.type==='direct'){
    status('Loading video link');if(nativeVideo.handles(source))nativeVideo.load(source,{base,token});else{filePlayer.crossOrigin='anonymous';filePlayer.src=source.url;filePlayer.load();}
  }else if(source.type==='youtube'&&nativeVideo.handles(source)){
    status('Opening native YouTube');nativeVideo.load(source,{base,token});
  }else if(source.type==='youtube') {
    ownedFile=null;ownedFileId=null;pendingFile=null;status('Loading YouTube');
    try{await loadYouTube();if(sourceId!==source.id)return;yt=nativeYouTube;ytReady=true;yt.cueVideoById(source.videoId);applyCaptions();applyPlaybackSound();send('ready',{sourceId,ready:true});applyPlayback(true);}catch{toast('YouTube could not load. Check your connection or content blocker.');status('YouTube unavailable');}
  }else {
    status('Preparing shared file');
    if(me===source.owner && pendingFile){const file=pendingFile;pendingFile=null;if(nativeVideo.handles(source)){nativeVideo.load(source,{base,token});}else{loadedFileId=source.id;setFileBlob(file);}uploadFile(file,source.id);}else if(source.uploaded)ensureFile();else transfer('Waiting for the host to finish uploading…',0);
  }
}
function loadYouTube() {
  if(nativeYouTube){yt=nativeYouTube;ytReady=true;return Promise.resolve();}if(ytPromise)return ytPromise;
  ytPromise=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('YouTube timed out')),20000);
    function init(){const player=new YT.Player('youtube-player',{width:'100%',height:'100%',playerVars:{playsinline:1,controls:0,disablekb:1,fs:0,rel:0,origin:location.origin},events:{onReady:e=>{clearTimeout(timeout);nativeYouTube=e.target;if(room?.source?.type==='youtube'){yt=nativeYouTube;ytReady=true;}nativeYouTube.getIframe?.().setAttribute('tabindex','-1');resolve();},onApiChange:applyCaptions,onStateChange:youtubeEvent,onError:e=>{reportBuffer(false);status('Video unavailable');toast('YouTube cannot embed this video ('+e.data+'). Try another video.');},onAutoplayBlocked:()=>{reportBuffer(true);$('unlock-playback').hidden=false;toast('Tap the playback button on this device to enable sound and video.');}}});}
    if(window.YT?.Player)init();else{window.onYouTubeIframeAPIReady=init;const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);reject(new Error('YouTube blocked'));};document.head.append(script);}
  });ytPromise.catch(()=>{ytPromise=null;});return ytPromise;
}
function currentTime(){if(nativePlayback())return nativeVideo.currentTime();if(isCompanion(room?.source))return companion.currentTime();return usesEmbed(room?.source)?(ytReady?yt.getCurrentTime()||0:0):filePlayer.currentTime||0;}
function duration(){if(nativePlayback())return nativeVideo.duration();if(isCompanion(room?.source))return companion.duration();return usesEmbed(room?.source)?(ytReady?yt.getDuration()||0:0):(Number.isFinite(filePlayer.duration)?filePlayer.duration:0);}
function isPlaying(){if(nativePlayback())return nativeVideo.isPlaying();if(isCompanion(room?.source))return companion.isPlaying();return usesEmbed(room?.source)?ytReady&&yt.getPlayerState()===1:!filePlayer.paused&&!filePlayer.ended;}
function reportBuffer(value){if(isLiveSource(room?.source)||isCompanion(room?.source))return;clearTimeout(bufferTimer);if(bufferReported===value)return;bufferReported=value;send('buffering',{sourceId,buffering:value});}
function youtubeEvent(e){
 if(!usesEmbed(room?.source)||localReplay)return;
 if(e.data===3){if(localPaused)return;buffering=true;status('Buffering locally');clearTimeout(bufferTimer);bufferTimer=setTimeout(()=>{if(ytReady&&yt.getPlayerState()===3&&activePlayback?.playing)reportBuffer(true);},1200);return;}
 if(e.data===1){$('unlock-playback').hidden=true;buffering=false;reportBuffer(false);settleUntil=Date.now()+1000;return;}
 if(e.data===0)playbackEnded();
 // Native pause/play events never write back to the room timeline. Only app controls do.
}
function command(playing, position=currentTime()) {
  if(!room?.source || preview)return toast('Add a video in a live room first.');
  suppressUntil=Date.now()+1100;lastSeek=Date.now();send('playback',{sourceId,playing,intent:arguments.length>1?'seek':playing?'play':'pause',position:Math.max(0,position)});
}
function applyPlayback(force=false) {
  if(isCompanion(room?.source)){companion.applyPlayback(force);setPlayIcon(!!activePlayback?.playing&&!localPaused);providerUI?.update();return;}
  if(localReplay)return;
  if(localPaused){setPlayIcon(false);status('Paused on this device · Play rejoins the host');return;}
  if(!room?.source || !activePlayback || preview)return;
  if(usesEmbed(room.source) && !ytReady)return;
  if(nativePlayback()&&!nativeVideo.ready)return;
  if(isVideoElement(room.source) && !nativePlayback() && filePlayer.readyState<1)return;
  const p=activePlayback;let target=targetPosition(p,Date.now()+clockOffset);const total=duration();if(total>0)target=Math.min(target,total);
  const commandChanged=p.revision!==appliedRevision;
  if(commandChanged){suppressUntil=Date.now()+1000;appliedRevision=p.revision;}
  setPlayIcon(p.playing);$('play').title=t(p.playing?'Pause':'Play');$('play').setAttribute('aria-label',t(p.playing?'Pause':'Play'));
  if(p.playing&&p.waitingFor?.length){if(usesEmbed(room.source)&&ytReady&&yt.getPlayerState()===1&&bufferReported){reportBuffer(false);return;}const mine=p.waitingFor.includes(me);if(mine&&usesEmbed(room.source)&&ytReady&&![1,3].includes(yt.getPlayerState())&&$('unlock-playback').hidden&&Date.now()-lastPlayAttempt>1500){lastPlayAttempt=Date.now();yt.playVideo();}if(!mine&&isPlaying()){if(usesEmbed(room.source))yt.pauseVideo();else pauseLocalVideo();}status('Waiting for '+p.waitingFor.map(id=>room.people.find(x=>x.id===id)?.name||'a device').join(', '));return;}
  const diff=target-currentTime();
  // Seeking during YouTube buffering restarts loading. Preserve explicit commands,
  // but defer automatic corrections until the player has resumed and settled.
  if(usesEmbed(room.source)&&p.playing&&!commandChanged&&!force&&(yt.getPlayerState()===3||Date.now()<settleUntil))return;
  const mode=correction(diff,commandChanged || force,Date.now()-lastCorrected);
  if(Math.abs(diff)>.65){autoDriftSince||=Date.now();}else autoDriftSince=0;
  // Avoid repeated native decoder seeks while the chat keyboard changes layout.
   // Explicit room commands still seek immediately.
   const nativeSource=nativePlayback(),composingChat=document.activeElement===$('message-input');
   const shouldSeek=!isLiveSource(room.source)&&mode==='seek'&&(
    nativeSource
     ? ((commandChanged||force)?Math.abs(diff)>.5:!nativeBuffering&&!composingChat&&Math.abs(diff)>3&&Date.now()-lastCorrected>5000)
     : (commandChanged||force||isVideoElement(room.source)||(Date.now()-autoDriftSince>=750&&Date.now()-lastCorrected>2500))
   );
  if(shouldSeek){ suppressUntil=Date.now()+1000;if(usesEmbed(room.source))yt.seekTo(target,true);else if(nativePlayback())nativeVideo.seek(target);else filePlayer.currentTime=target;lastCorrected=Date.now();}
  if(isVideoElement(room.source)&&!nativePlayback()&&!isLiveSource(room.source))filePlayer.playbackRate=p.playing&&mode==='rate'?Math.max(.95,Math.min(1.05,1+diff*.025)):1;
  if(p.playing && !isPlaying()){
    // A buffering YouTube player must finish buffering without repeated play/seek commands.
    if(usesEmbed(room.source)){if(yt.getPlayerState()!==3&&Date.now()-lastPlayAttempt>1500){lastPlayAttempt=Date.now();suppressUntil=Date.now()+700;yt.playVideo();}}
    else if(!nativePlayback()||(!nativeBuffering&&Date.now()-lastNativePlayAttempt>1800)){
     if(nativePlayback())lastNativePlayAttempt=Date.now();
     suppressUntil=Date.now()+1000;playLocalVideo().catch(()=>toast('Tap Play or Enable sound to allow playback.'));
    }
  }else if(!p.playing && isPlaying()){suppressUntil=Date.now()+1000;if(usesEmbed(room.source))yt.pauseVideo();else pauseLocalVideo();}
  setPlayIcon(p.playing);status(isLiveSource(room.source)?(p.playing?'Live · device timing may differ':'Live paused on room devices'):p.playing?(Math.abs(diff)<.75?'Playing together':'Aligning playback'):'Paused together');
}
function tick(){
 if(xpartyUI?.local)return;
  if(!room?.source || preview)return;
  if(usesEmbed(room.source)&&ytReady&&bufferReported&&!localPaused&&yt.getPlayerState()===1)reportBuffer(false);
  const cur=currentTime(),total=duration();$('seek').style.setProperty('--played',(total?cur/total*100:0)+'%');$('time').textContent=isLiveSource(room.source)?'LIVE':formatTime(cur)+' / '+formatTime(total);
  if(document.activeElement!==$('seek'))$('seek').value=total?cur/total*1000:0;

  if(Date.now()>suppressUntil){
    applyPlayback(false);
  }
  tick.previous=cur;tick.at=Date.now();tick.source=sourceId;
}
function formatTime(s){s=Math.floor(s||0);return (s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(s>=3600?2:1,'0')+':'+String(s%60).padStart(2,'0');}
function chatIsVisible(){const rect=$('messages').getBoundingClientRect();return !document.hidden&&!$('room').hidden&&chatVisible&&rect.top<innerHeight&&rect.bottom>0;}
function updateUnread(){$('panel-unread').hidden=!unread;$('panel-unread').textContent=String(unread);$('chat-unread').hidden=!unread;$('chat-unread').textContent=unread>99?'99+':String(unread);}
function addMessage(m,live=true){if([...$('messages').querySelectorAll('[data-message-id]')].some(e=>e.dataset.messageId===m.id))return;typingPeople.delete(m.from);renderTyping();const welcome=$('messages').querySelector('.chat-welcome');welcome?.remove();const el=document.createElement('div');el.dataset.messageId=m.id;el.className='message'+(m.from===me?' mine':'')+(m.to?' private':'');const name=document.createElement('small');name.textContent=m.name+(m.to?' → '+m.toName+' · Private':'')+' · '+new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});const text=document.createElement('p');text.textContent=m.deleted?'Message deleted':m.text;el.append(name);if(m.text||m.deleted)el.append(text);if(m.attachment)renderAttachment(el,m.attachment);if(m.poll){const card=document.createElement('div');card.dataset.pollId=m.poll.id;el.append(card);renderPoll(card,m.poll);}if(m.from===me){const receipt=document.createElement('span');receipt.className='read-receipt';receipt.dataset.state=m.readBy?.length?'read':m.deliveredBy?.length?'delivered':'sent';receipt.textContent=m.readBy?.length?'◉':m.deliveredBy?.length?'✓✓':'✓';receipt.setAttribute('aria-label',t(m.readBy?.length?'Seen':m.deliveredBy?.length?'Delivered':'Sent'));el.append(receipt);}else if(m.id){el.dataset.unread='true';send('delivered',{ids:[m.id]});} roomInteractions?.decorateMessage(el,m,live);$('messages').append(el);
 const menu=document.createElement('button');menu.type='button';menu.className='message-more';menu.textContent='•••';menu.setAttribute('aria-label','Message actions');el.append(menu);
 menu.onclick=()=>{
  const choice=prompt('Message actions: copy, reply, pin, edit, delete');
  if(!choice)return;
  switch(choice.trim().toLowerCase()){
   case 'copy':if(m.text)navigator.clipboard.writeText(m.text).catch(()=>toast('Copy unavailable'));break;
   case 'reply':$('message-input').value='↳ '+m.name+': '+(m.text||'').slice(0,120)+'\\n';$('message-input').focus();break;
   case 'pin':if(room?.hostId===me)send('pin-message',{id:m.id});else toast('Only the host can pin.');break;
   case 'edit':if(m.from!==me)return toast('You can edit only your own messages.');{const value=prompt('Edit message',m.text||'');if(value?.trim())send('chat-edit',{id:m.id,text:value.trim()});}break;
   case 'delete':if(m.from!==me)return toast('You can delete only your own messages.');if(confirm('Delete message for everyone?'))send('chat-delete',{id:m.id});break;
   default:toast('Choose copy, reply, pin, edit or delete.');
  }
 };
 if(live)notifySound(m.from===me?'sent':'message');requestAnimationFrame(markVisibleRead);while($('messages').children.length>200)$('messages').firstChild.remove();$('messages').scrollTop=$('messages').scrollHeight;if(live&&m.from!==me&&!chatIsVisible()){unread++;updateUnread();}}
function renderTyping(){for(const[id,p]of typingPeople)if(p.until<Date.now())typingPeople.delete(id);const names=[...typingPeople.values()].map(p=>p.name);$('typing').hidden=!names.length;$('typing').querySelector('span').textContent=names.slice(0,2).join(', ')+(names.length>2?' +'+(names.length-2):'')+(preferences.language==='hi'?' लिख रहे हैं':preferences.language==='kn'?' ಟೈಪ್ ಮಾಡುತ್ತಿದ್ದಾರೆ':' typing');}
function setRecipient(person){if(recipient)send('typing',{active:false,to:recipient.id});recipient=person;$('recipient-chip').hidden=!person;$('recipient-chip').querySelector('span').textContent=person?'Private → '+person.name:'';$('mentions').hidden=true;$('message-input').placeholder=person?'Message '+person.name:'Message';}
function showMentions(){const input=$('message-input'),value=input.value,match=value.match(/(?:^|\s)@([^@]*)$/);$('mentions').replaceChildren();if(!match){$('mentions').hidden=true;return;}const list=(room?.people||[]).filter(p=>p.id!==me&&p.name.toLowerCase().includes(match[1].toLowerCase()));for(const p of list){const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.textContent=p.name;button.onclick=()=>{const start=value.lastIndexOf('@');input.value=value.slice(0,start)+'@'+p.name+' ';$('mentions').hidden=true;input.focus();};$('mentions').append(button);}$('mentions').hidden=!list.length;}

function actionIcon(label,shape,action){const b=document.createElement('button');b.type='button';b.className='icon-control';icon(b,shape,t(label));b.onclick=action;return b;}
function renderMembers(){const container=$('member-list');container.replaceChildren();for(const person of room.people){
  const row=document.createElement('div');row.className='member-row';const label=document.createElement('span');label.textContent=person.name+(person.online?'':' · Away');if(person.id===room.hostId){const crown=document.createElement('span');crown.className='host-crown';crown.setAttribute('role','img');icon(crown,'crown',t('Host'));label.prepend(crown);}row.append(label);
  if(person.id!==me){row.append(actionIcon('Message '+person.name,'message',()=>{setRecipient(person);conversation('both');$('return-room').click();members.open=false;$('message-input').focus();}));
    if(me===room.hostId){const tools=document.createElement('div');tools.className='member-permissions';tools.hidden=true;
      row.append(actionIcon('Permissions for '+person.name,'settings',()=>{tools.hidden=!tools.hidden;keepMembers();}));
      for(const [title,on,yes,no]of [['Chat',!person.chatBlocked,'allow-chat','block-chat'],['Mic',!person.micBlocked,'allow-mic','mute'],['Camera',!!person.cameraAllowed,'approve-camera','camera-off']]){const label=document.createElement('label');label.className='switch-row';label.textContent=title;const input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.checked=on;input.onchange=()=>send('moderate',{target:person.id,action:input.checked?yes:no});label.append(input);tools.append(label);}
      if(person.online)tools.append(actionIcon('Transfer host to '+person.name,'key',()=>send('transfer-host',{target:person.id})));
      if(person.id!==room.ownerId)tools.append(actionIcon('Remove '+person.name,'leave',async()=>{if(await ask('Remove '+person.name+' from this room?'))send('kick',{target:person.id});}));row.append(tools);
    }
    if(me===room.hostId&&person.online)row.append(actionIcon('Offer microphone to '+person.name,'mic',()=>send('offer-mic',{target:person.id})));
    if(me===room.hostId&&person.seatRequested){const request=document.createElement('div');request.className='member-actions';request.textContent='Call seat';request.append(actionIcon('Approve call seat for '+person.name,'check',()=>send('review-seat',{target:person.id,approve:true})),actionIcon('Decline call seat for '+person.name,'close',()=>send('review-seat',{target:person.id,approve:false})));row.append(request);}
    if(me===room.hostId&&person.cameraRequested){const request=document.createElement('div');request.className='member-actions';request.textContent='Camera';request.append(actionIcon('Approve camera for '+person.name,'check',()=>send('moderate',{target:person.id,action:'approve-camera'})),actionIcon('Decline camera for '+person.name,'close',()=>send('moderate',{target:person.id,action:'deny-camera'})));row.append(request);}
  }container.append(row);
}renderRequestNotices();roomDesign?.update();}
function updateTheatre(){$('focus-call').setAttribute('aria-pressed',document.body.classList.contains('focus-call'));$('panel-both').setAttribute('aria-pressed',vcVisible&&chatVisible);document.body.dataset.conversation=vcVisible&&chatVisible?'both':chatVisible?'chat':'call';requestAnimationFrame(markVisibleRead);$('panel-call').setAttribute('aria-pressed',vcVisible&&!chatVisible);$('panel-chat').setAttribute('aria-pressed',chatVisible&&!vcVisible);document.body.classList.toggle('show-vc',vcVisible);document.body.classList.toggle('show-chat',chatVisible);$('toggle-vc').setAttribute('aria-pressed',vcVisible);$('toggle-chat').setAttribute('aria-pressed',chatVisible);if(chatVisible){unread=0;updateUnread();requestAnimationFrame(()=>$('messages').scrollTop=$('messages').scrollHeight);}}
function setTheatre(enabled){document.body.dataset.view=viewMode;document.body.classList.toggle('cinema',enabled);document.body.classList.remove('browsing');if(enabled){vcVisible=true;chatVisible=false;}$('room-menu').open=false;updateTheatre();if(!enabled){unread=0;updateUnread();}}
function leave(notify=true){
  providerLoad?.abort();companion.disconnect();
  localPaused=false;reconnectAttempts=0;peerRetries.clear();connectionStatus('idle');
  $('room-menu').open=false;document.querySelector('.member-list').open=false;
  if(notify&&room?.ownerId===me)sessionStorage.setItem('xparty-owner-return',JSON.stringify({code:room.code,token,base}));else if(!notify)sessionStorage.removeItem('xparty-owner-return');
  intentionalClose=true;clearTimeout(reconnectTimer);clearTimeout(connectTimer);if(notify&&socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'leave'}));socket?.close();
  clearSession();fileJob?.abort();loadedFileId=null;downloadId=null;readySent=null;token=null;for(const p of peers.values())closePeer(p);peers.clear();localStream.getTracks().forEach(t=>t.stop());localStream=new MediaStream();
  filePlayer.pause();filePlayer.removeAttribute('src');filePlayer.load();if(ytReady)yt.stopVideo();if(objectUrl)URL.revokeObjectURL(objectUrl);for(const url of attachmentUrls)URL.revokeObjectURL(url);attachmentUrls.clear();objectUrl=null;ownedFile=null;pendingFile=null;ownedFileId=null;
  recipient=null;typingPeople.clear();renderTyping();unread=0;updateUnread();$('recipient-chip').hidden=true;$('return-room').hidden=true;$('home-exit').hidden=true;document.querySelector('.entry-card').hidden=false;nativeVideo.stop();room=null;me=null;fullscreen?.exit();suggestions?.update();roomInteractions?.update();callExperience?.update();playbackData?.update();document.body.classList.remove('room-has-source');roomDesign?.update();providerUI?.update();updateChatMic();updateDiscovery(null,null);memberProfiles.update();ambient.update();skipVoting.update();subtitles.update();sourceId=null;activePlayback=null;preview=false;$('room').hidden=true;$('lobby').hidden=false;$('demo-banner').hidden=true;document.querySelector('.call-controls').append($('mic'),$('camera'),$('camera-flip'));document.body.classList.remove('in-room','call-expanded','focus-call');$('focus-call').textContent='Focus call';observedMessages.clear();$('theme-select').disabled=false;$('participants').replaceChildren();document.documentElement.dataset.theme=preferences.theme;
  $('mic').textContent=t('Mic off');$('mic').setAttribute('aria-pressed',false);$('camera').textContent=t('Camera off');$('camera').setAttribute('aria-pressed',false);$('network').lastChild.textContent=' Private watch rooms';document.body.classList.remove('cinema');$('create').disabled=false;$('join-form').querySelector('button').disabled=false;
}
$('create-toggle').onclick=()=>$('create').click();

$('stop').onclick=()=>{if(room?.hostId===me)send('playback',{sourceId,playing:false,position:0,intent:'stop'});};
$('resync').onclick=()=>{localPaused=false;lastPlayAttempt=0;settleUntil=0;autoDriftSince=0;ping();if(usesEmbed(room?.source)&&ytReady&&yt.getPlayerState()===1)reportBuffer(false);send('resync');if(room?.source?.type==='file'){if(filePlayer.readyState>=1){readySent=null;fileReady();}else ensureFile();}toast(t('Aligning playback'));};
$('browse').onclick=()=>{document.body.classList.add('browsing');$('source-panel').scrollIntoView({behavior:'smooth',block:'start'});$('youtube-input').focus({preventScroll:true});};
$('back-video').onclick=()=>{document.body.classList.remove('browsing');$('watch-stage').scrollIntoView({behavior:'smooth'});};
$('next-video').onclick=()=>send('next');
$('create').onclick=async()=>{if(!await roomAgreement('create'))return;const name=await nicknameChoice($('name').value);if(name===null)return;setEntryNickname(name);connect({type:'create',name,capacity:null});};
$('join-form').onsubmit=async e=>{e.preventDefault();if(!validRoomCode(normalizeRoomCode($('code').value))){$('join-status').textContent='Enter the 7-character room code using letters and numbers 2-9.';$('code').focus();return;}if(!await roomAgreement('join'))return;const name=await nicknameChoice($('name').value);if(name===null)return;setEntryNickname(name);const code=$('code').value.trim().toUpperCase();if(room?.code===code){$('return-room').click();return;}let owner;try{owner=JSON.parse(sessionStorage.getItem('xparty-owner-return')||'null');}catch{}const saved=readSession();connect(saved?.code===code&&saved.base===base?{type:'resume',token:saved.token}:owner?.code===code&&owner.base===base?{type:'resume',token:owner.token}:{type:'join',name,code});};
$('code').oninput=()=>{$('code').value=normalizeRoomCode($('code').value);$('code').setCustomValidity($('code').value&&!validRoomCode($('code').value)?'Enter exactly 7 letters or numbers (2-9).':'');scheduleRoomLookup();};
$('code').addEventListener('paste',event=>{const pasted=normalizeRoomCode(event.clipboardData?.getData('text')||'');if(pasted.length>7){event.preventDefault();$('join-status').textContent='Room codes have 7 characters. Ask the host to copy the code again.';}});
$('leave').onclick=()=>leave();$('lock').onclick=()=>send('lock',{locked:!room.locked});
$('copy').onclick=async()=>{if(preview)return toast('Preview code only. Create a live room for an invitation.');try{await navigator.clipboard.writeText(room.code);toast('Room code copied.');}catch{toast('Your room code: '+room.code);}};
$('mic').onclick=()=>toggleMedia('audio');$('camera').onclick=()=>toggleMedia('video');
const chatMic=document.createElement('button');chatMic.id='chat-mic';chatMic.type='button';chatMic.className='icon-control';icon(chatMic,'mic','Toggle microphone');$('chat-video').before(chatMic);chatMic.onclick=()=>toggleMedia('audio');
function updateChatMic(){const self=room?.people.find(p=>p.id===me);const muted=!!self?.micBlocked;chatMic.disabled=muted||!room;chatMic.setAttribute('aria-pressed',String(localStream.getAudioTracks().some(t=>t.enabled&&t.readyState==='live')));chatMic.setAttribute('aria-label',muted?'Microphone disabled by host':self?.inCall?'Toggle microphone':'Join the call to use microphone');}
$('retry-call').onclick=()=>{for(const p of peers.values())recoverPeer(p,true);toast('Reconnecting peer connections…');};
$('enable-audio').onclick=async()=>{await unlockAudio();if(activePlayback?.playing)applyPlayback(true);};
$('movie-volume').oninput=e=>{movieVolume=Number(e.target.value)/100;nativeVideo.setVolume(movieVolume);$('movie-level').textContent=e.target.value+'%';if(movieGain)movieGain.gain.value=movieVolume;else filePlayer.volume=movieVolume;if(ytReady)yt.setVolume(movieVolume*100);};
$('call-volume').oninput=e=>{callVolume=Number(e.target.value)/100;$('call-level').textContent=e.target.value+'%';for(const p of peers.values()){if(p.gain)p.gain.gain.value=callVolume;if(p.fallbackAudio)p.fallbackAudio.volume=callVolume;}};
$('chat-form').onsubmit=e=>{e.preventDefault();const text=$('message-input').value.trim();if(!text)return;if(send('chat',{text,to:recipient?.id,clientId:crypto.randomUUID()})){send('typing',{active:false,to:recipient?.id});$('message-input').value='';$('mentions').hidden=true;clearTimeout(typingTimer);}};
$('play').onclick=async()=>{await unlockAudio();if(isCompanion(room?.source)){if(room.hostId!==me&&room.mode!=='SHARED_CONTROL'){localPaused=!localPaused;applyPlayback(true);}else command(!activePlayback?.playing);return;}if(localReplay){if(usesEmbed(room?.source)&&ytReady){isPlaying()?yt.pauseVideo():yt.playVideo();}else{isPlaying()?pauseLocalVideo():playLocalVideo().catch(()=>{});}setPlayIcon(isPlaying());return;}if(!room?.source)return toast('Add a video first.');if(room.hostId!==me&&room.mode!=='SHARED_CONTROL'){localPaused=!localPaused;if(localPaused){reportBuffer(false);if(usesEmbed(room.source))ytReady&&yt.pauseVideo();else pauseLocalVideo();setPlayIcon(false);status('Paused on this device · Play rejoins the host');}else{lastPlayAttempt=0;applyPlayback(true);}return;}if(activePlayback?.playing&&!isPlaying()){suppressUntil=Date.now()+1000;if(usesEmbed(room.source))ytReady&&yt.playVideo();else playLocalVideo().catch(()=>toast('Unable to play this file on this device.'));applyPlayback(true);}else command(!activePlayback?.playing);};
$('back10').onclick=()=>command(activePlayback?.playing||false,currentTime()-10);$('forward10').onclick=()=>command(activePlayback?.playing||false,Math.min(duration(),currentTime()+10));
$('seek').onchange=()=>command(activePlayback?.playing||false,Number($('seek').value)/1000*duration());
$('theater').onclick=()=>setTheatre(!document.body.classList.contains('cinema'));$('exit-theatre').onclick=()=>setTheatre(false);$('toggle-vc').onclick=()=>{vcVisible=!vcVisible;updateTheatre();};$('toggle-chat').onclick=()=>{chatVisible=!chatVisible;updateTheatre();};
$('youtube-tab').onclick=()=>{$('youtube-form').hidden=false;$('file-form').hidden=true;$('youtube-tab').classList.add('active');$('file-tab').classList.remove('active');};
$('file-tab').onclick=()=>{$('youtube-form').hidden=true;$('file-form').hidden=false;$('file-tab').classList.add('active');$('youtube-tab').classList.remove('active');$('search-results').replaceChildren();};
function renderQueue(){const container=$('queue');container.replaceChildren();for(const item of orderedQueue(room||{})){const row=document.createElement('div');row.className='queue-item';const title=document.createElement('span');title.textContent=item.title;row.append(title);const vote=document.createElement('button');vote.className='secondary';vote.hidden=queueOrder(room)!=='votes';vote.textContent='♡ '+(item.votes?.length||0);vote.setAttribute('aria-label','Vote for '+item.title);vote.setAttribute('aria-pressed',!!item.votes?.includes(me));vote.onclick=()=>send('queue-vote',{id:item.id});row.append(vote);if(room.hostId===me&&queueOrder(room)==='fifo')for(const [label,direction]of [['Up',-1],['Down',1]]){const move=document.createElement('button');move.className='secondary';move.textContent=label;move.setAttribute('aria-label',(direction<0?'Move up: ':'Move down: ')+item.title);move.disabled=direction<0?room.queue[0].id===item.id:room.queue.at(-1).id===item.id;move.onclick=()=>send('queue-move',{id:item.id,direction});row.append(move);}if(room.hostId===me)for(const[label,type]of [['Play','queue-play'],['Remove','queue-remove']]){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.onclick=()=>send(type,{id:item.id});row.append(b);}container.append(row);}if(!container.children.length)container.textContent='';}

function searchResult(item){const row=document.createElement('div');row.className='result';row.addEventListener('pointerenter',()=>nativeVideo.prefetchYoutube(item.id),{once:true});row.addEventListener('focusin',()=>nativeVideo.prefetchYoutube(item.id),{once:true});const img=document.createElement('img');img.src=item.thumbnail||'https://i.ytimg.com/vi/'+item.id+'/mqdefault.jpg';img.alt='';const title=document.createElement('span');title.textContent=item.title+(item.channel?' · '+item.channel:'')+(item.duration?' · '+item.duration:'');row.append(img,title);const actions=document.createElement('div');if(room.hostId===me||room.mode!=='HOST_ONLY'){const play=document.createElement('button');play.className='primary';play.textContent=room.hostId===me?t('Play now'):'Request video';play.onclick=()=>{send('source',{source:{type:'youtube',videoId:item.id,title:item.title}});$('watch-stage').scrollIntoView({behavior:'smooth'});};actions.append(play);}const add=document.createElement('button');add.className='secondary';add.textContent=t('+ Queue');add.onclick=()=>{send('queue-add',{videoId:item.id,title:item.title});if(room.hostId===me)toast('Added to the room playlist.');};actions.append(add);row.append(actions);$('search-results').append(row);}
let searchTimer,searchHideTimer,searchAbort,searchSequence=0;
function keepSearchVisible(){clearTimeout(searchHideTimer);searchHideTimer=setTimeout(()=>{if(!document.querySelector('#youtube-form:focus-within, #search-results:focus-within'))$('search-results').hidden=true;else keepSearchVisible();},30000);}
async function searchVideos(explicit=false){
 clearTimeout(searchTimer);const sequence=++searchSequence;searchAbort?.abort();searchAbort=new AbortController();
 if(preview){if(explicit)toast('Create a room to add a video.');return;}
 const value=$('youtube-input').value.trim(),parsed=parseProviderLink(value)||parseCompanionLink(value),id=youtubeId(value);
 if(parsed&&parsed.type!=='youtube'){$('search-results').replaceChildren();$('search-results').hidden=false;const row=document.createElement('div');row.className='result';const label=document.createElement('span');label.textContent=parsed.title;const play=document.createElement('button');play.type='button';play.className='primary';play.textContent=room.hostId===me?'Play together':'Request video';play.onclick=()=>send('source',{source:parsed});const queue=document.createElement('button');queue.type='button';queue.className='secondary';queue.textContent='+ Queue';queue.onclick=()=>send('queue-add',{provider:parsed.type,videoId:parsed.videoId,url:parsed.url,title:parsed.title});row.append(label,play,queue);$('search-results').append(row);$('search-status').textContent='Ready to play with '+providerName(parsed.type)+'.';return;}
 if(/^https?:\/\//i.test(value)&&!parsed){$('search-status').textContent='Use a supported provider title link, or an HTTPS MP4/WebM link.';$('search-results').replaceChildren();return;}$('search-results').replaceChildren();$('search-results').hidden=false;$('search-results').setAttribute('aria-busy','false');$('search-status').classList.remove('searching');$('load-video').disabled=false;
 if(id){searchResult({id,title:'YouTube · '+id});$('search-status').textContent='Play this link now or add it to the playlist.';keepSearchVisible();return;}
 if(value.length<2){$('search-status').textContent='';return;}
 $('search-status').classList.add('searching');$('search-status').textContent='Searching YouTube…';$('search-results').setAttribute('aria-busy','true');
 try{const res=await fetch(base+'/api/search?q='+encodeURIComponent(value),{signal:searchAbort.signal,headers:{Authorization:'Bearer '+token}});const data=await res.json();if(sequence!==searchSequence)return;if(!res.ok)throw new Error(data.error||'Search unavailable.');for(const item of data.items)searchResult(item);$('search-status').textContent=data.items.length?'Choose a video or keep browsing while it plays.':'No videos found. Try another search.';keepSearchVisible();}catch(e){if(e.name!=='AbortError'&&sequence===searchSequence)$('search-status').textContent=e.message;}finally{if(sequence===searchSequence){$('search-status').classList.remove('searching');$('search-results').setAttribute('aria-busy','false');}}
}
$('youtube-form').onsubmit=e=>{e.preventDefault();searchVideos(true);};
$('youtube-input').addEventListener('input',()=>{clearTimeout(searchTimer);searchAbort?.abort();searchSequence++;searchTimer=setTimeout(()=>searchVideos(),300);});
$('youtube-input').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){const b=$('search-results').querySelector('button');if(b){e.preventDefault();$('search-results').hidden=false;b.focus();}}if(e.key==='Escape')$('search-results').hidden=true;});
$('search-results').addEventListener('keydown',e=>{const buttons=[...$('search-results').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const next=i+(e.key==='ArrowDown'?1:-1);if(next<0)$('youtube-input').focus();else buttons[Math.min(next,buttons.length-1)]?.focus();}if(e.key==='Escape'){$('search-results').hidden=true;$('youtube-input').focus();}});
$('file-input').onchange=()=>{const f=$('file-input').files[0];if(!f)return;if(preview)return toast('Create a room to share a file.');if(f.size>MAX_FILE || !f.size){$('file-input').value='';return toast('Choose a video between 1 byte and 500 MB.');}const mime=f.type||(/\.mp4$/i.test(f.name)?'video/mp4':/\.webm$/i.test(f.name)?'video/webm':'');if(!mime.startsWith('video/'))return toast('Choose a supported video file such as MP4 or WebM.');pendingFile=f;send('source',{source:{type:'file',title:f.name,size:f.size,mime}});$('file-input').value='';};
filePlayer.onloadedmetadata=fileReady;filePlayer.oncanplay=fileReady;
filePlayer.onerror=()=>{if(isVideoElement(room?.source) && filePlayer.getAttribute('src')){readySent=null;send('ready',{sourceId,ready:false,status:'Unsupported video format'});toast(room.source.type==='iptv'?'This channel could not play. Try another channel or Retry.':room.source.type==='direct'?'This video link could not load. It must allow cross-origin playback and use a supported codec.':'This device cannot decode the file. Try an MP4 with H.264 video and AAC audio.');}};
function playbackEnded(){reportBuffer(false);if(!room||isLiveSource(room.source))return;if(me===room.hostId){command(false,currentTime());send('playback-ended',{sourceId});}}
filePlayer.onended=()=>{if(room?.source?.type==='iptv'){status('Live broadcast ended');return;}if(isVideoElement(room?.source))playbackEnded();};
$('preview').onclick=()=>{preview=true;me='preview-host';$('lobby').hidden=true;$('room').hidden=false;$('demo-banner').hidden=false;notice('');updateRoom({code:'PREVIEW',hostId:me,capacity:null,locked:false,source:null,playback:{position:0,playing:false,updatedAt:Date.now(),revision:0},people:[{id:me,name:'You',online:true,mic:false,camera:false},{id:'preview-guest',name:'Your friend',online:true,mic:false,camera:false}]});};
setInterval(tick,200);setInterval(ping,3000);
window.addEventListener('pagehide',()=>{suspended=true;clearTimeout(reconnectTimer);if(socket?.readyState===WebSocket.OPEN)socket.close();localStream.getTracks().forEach(t=>t.stop());});
window.addEventListener('pageshow',e=>{suspended=false;if(e.persisted){localStream=new MediaStream();const saved=readSession();if(saved?.base===base)connect({type:'resume',token:saved.token});}});
if(location.hostname.endsWith('github.io')&&!window.XPARTY_CONFIG?.backendUrl)$('setup-notice').hidden=false;

const initialSession=readSession();if(initialSession?.base===base){if(performance.getEntriesByType('navigation')[0]?.type==='reload'){token=initialSession.token;connect({type:'resume',token});}else $('active-room-banner').hidden=false;}

$('clear-recipient').onclick=()=>setRecipient(null);
$('message-input').oninput=()=>{showMentions();const active=!!$('message-input').value.trim();if(Date.now()-lastTyping>1500||!active){send('typing',{active,to:recipient?.id});lastTyping=Date.now();}clearTimeout(typingTimer);typingTimer=setTimeout(()=>send('typing',{active:false,to:recipient?.id}),2500);};
$('message-input').onkeydown=e=>{if(e.key==='Escape'){$('mentions').hidden=true;}if(e.key==='ArrowDown'&&!$('mentions').hidden){e.preventDefault();$('mentions').querySelector('button')?.focus();}};
$('room-capacity').onchange=renderCapacity;
$('call-seat').onclick=()=>{const self=room?.people.find(p=>p.id===me);send(self?.inCall||self?.seatRequested?'call-leave':'call-join');};
$('nav-home').onclick=()=>{if(document.body.classList.contains('watch-fullscreen')){fullscreen?.exit();return;}document.body.classList.remove('in-room','focus-call');$('focus-call').textContent='Focus call';setTheatre(false);$('room').hidden=true;$('lobby').hidden=false;document.querySelector('.entry-card').hidden=false;$('create-details').hidden=true;$('create-toggle').disabled=false;$('create').disabled=false;$('create-toggle').classList.remove('dimmed');$('create-toggle').setAttribute('aria-expanded','false');$('return-room').hidden=!room;$('home-exit').hidden=!room;updateRoomNotification();ambient.update();};
$('return-room').onclick=()=>{document.body.classList.add('in-room');$('lobby').hidden=true;$('room').hidden=false;$('return-room').hidden=true;$('home-exit').hidden=true;updateRoomNotification();unread=0;updateUnread();ambient.update();};
for(const [button,dialog]of [['nav-settings','settings-dialog'],['theatre-settings','settings-dialog'],['nav-about','about-dialog']])$(button).onclick=()=>$(dialog).showModal();
for(const dialog of document.querySelectorAll('dialog'))dialog.querySelector('.close-dialog')?.addEventListener('click',()=>dialog.close());
const soundDetails=$('notification-settings').closest('.settings-section');const volumeDetails=$('settings-movie-volume').closest('.settings-section');volumeDetails.querySelector('section').append($('notification-settings'));soundDetails.remove();volumeDetails.querySelector('summary').textContent=t('Sound');
const oldNotifications=$('nav-notifications').closest('.settings-section');oldNotifications.hidden=true;
const soundMaster=document.createElement('label');soundMaster.className='switch-row';soundMaster.innerHTML='<span>'+t('Notification sounds')+'</span><input type="checkbox" role="switch" id="notification-master">';$('notification-settings').prepend(soundMaster);
const soundLevel=document.createElement('label');soundLevel.innerHTML=t('Notification volume')+'<input type="range" min="0" max="100" value="35" id="notification-volume">';$('notification-settings').append(soundLevel);
const displayLabel=document.createElement('label');displayLabel.className='switch-row';displayLabel.innerHTML='<span>'+t('Theme')+'</span><input id="display-toggle" type="checkbox" role="switch" checked>'; $('theme-select').closest('section').prepend(displayLabel);
const fitLabel=document.createElement('label');fitLabel.innerHTML=t('Video fit')+'<select id="theatre-fit"><option value="contain">'+t('Fit')+'</option><option value="cover">'+t('Fill screen')+'</option></select>';$('settings-dialog').querySelectorAll('.settings-section')[4]?.querySelector('section')?.append(fitLabel);
function populateSettings(){if($('notification-master')){$('notification-master').checked=preferences.notify_enabled!==false;$('notification-volume').value=preferences.notify_volume??35;$('display-toggle').checked=preferences.display!=='light';$('theatre-fit').value=preferences.theatreFit||'contain';}for(const key of ['join','leave','message','sent','read'])$('notify-'+key).checked=preferences['notify_'+key]===true;$('theme-select').value=preferences.theme;$('language-select').value=preferences.language;$('noise-setting').checked=preferences.noise;$('echo-setting').checked=preferences.echo;$('quality-select').value=preferences.quality;}
async function applyCallSettings(){for(const track of localStream.getAudioTracks())try{await track.applyConstraints({noiseSuppression:preferences.noise,echoCancellation:preferences.echo,autoGainControl:true,channelCount:1,latency:{ideal:.02}});}catch{toast('This browser could not change audio processing during the call. Toggle your mic to retry.');}for(const track of localStream.getVideoTracks())try{await track.applyConstraints({width:{ideal:preferences.quality==='saver'?240:360},height:{ideal:preferences.quality==='saver'?320:480},frameRate:{ideal:15,max:15}});}catch{}await Promise.all([...peers.values()].map(replaceTracks));}
$('save-settings').onclick=async()=>{preferences.notify_enabled=$('notification-master').checked;preferences.notify_volume=Number($('notification-volume').value);preferences.display=$('display-toggle').checked?'dark':'light';preferences.theatreFit=$('theatre-fit').value;for(const[id,key]of [['theme-select','theme'],['language-select','language'],['noise-setting','noise'],['echo-setting','echo'],['quality-select','quality']])preferences[key]=$(id).type==='checkbox'?$(id).checked:$(id).value;for(const key of ['join','leave','message','sent','read'])preferences['notify_'+key]=$('notify-'+key).checked;savePreferences();if(room)updateRoom(room);await applyCallSettings();audioDiagnostics();$('settings-dialog').close();toast('Settings saved on this device.');};
$('reset-settings').onclick=()=>{resetPreferences();populateSettings();if(room)updateRoom(room);applyCallSettings();};populateSettings();
setInterval(renderTyping,1000);

for(const kind of ['movie','call']){$('settings-'+kind+'-volume').oninput=e=>{$(kind+'-volume').value=e.target.value;$(kind+'-volume').dispatchEvent(new Event('input'));};$(kind+'-volume').addEventListener('input',e=>$('settings-'+kind+'-volume').value=e.target.value);}$('settings-enable-audio').onclick=()=>$('enable-audio').click();

$('room-settings-button').onclick=()=>{$('room-capacity').value=room.capacity===null?'none':String(room.capacity);$('room-theme').value=room.theme||'';$('guest-themes').checked=!!room.guestThemes;renderCapacity();$('room-settings-dialog').showModal();};
$('room-theme').onchange=()=>{};
$('panel-call').onclick=()=>conversation('call');$('panel-chat').onclick=()=>conversation('chat');$('panel-both').onclick=()=>conversation('both');
$('camera-power').onclick=()=>{$('camera-menu').hidden=true;toggleMedia('video');};
$('camera-flip').onclick=async()=>{if(busyMedia)return;busyMedia=true;$('camera-menu').hidden=true;const old=localStream.getVideoTracks()[0];if(!old){busyMedia=false;return;}const previous=cameraFacing;cameraFacing=previous==='user'?'environment':'user';old.onended=null;old.stop();localStream.removeTrack(old);try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing},width:{ideal:360},height:{ideal:480},frameRate:{ideal:15,max:15}},audio:false});const track=stream.getVideoTracks()[0];localStream.addTrack(track);track.onended=()=>{localStream.removeTrack(track);updateMedia();};}catch{cameraFacing=previous;toast('Camera switching is unavailable on this device. Tap Camera to restart it.');}finally{await updateMedia();busyMedia=false;}};
$('unlock-playback').onclick=async()=>{await unlockAudio();lastPlayAttempt=0;if(isCompanion(room?.source))return companion.focus();if(ytReady&&usesEmbed(room?.source))yt.playVideo();else playLocalVideo().catch(()=>{});};
for(const[id,name,label]of [['mic','mic','Microphone'],['camera','camera','Camera options'],['retry-call','refresh','Reconnect call'],['room-settings-button','settings','Room settings'],['stop','stop','Stop for everyone'],['back10','back','Back 10 seconds'],['forward10','forward','Forward 10 seconds'],['resync','refresh','Resync this device'],['browse','search','Browse videos'],['theater','sofa','Theatre'],['enable-audio','volume','Enable sound']])icon($(id),name,label);
function movieSize(value){value=Math.max(24,Math.min(75,value));document.documentElement.style.setProperty('--movie-size',value+'dvh');$('movie-resizer').setAttribute('aria-valuenow',Math.round(value));}
$('movie-resizer').onpointerdown=e=>{e.preventDefault();$('movie-resizer').setPointerCapture(e.pointerId);const start=e.clientY,height=$('watch-stage').getBoundingClientRect().height;const move=ev=>movieSize((height+ev.clientY-start)/innerHeight*100);$('movie-resizer').onpointermove=move;$('movie-resizer').onpointerup=$('movie-resizer').onpointercancel=()=>{$('movie-resizer').onpointermove=null;};};
$('movie-resizer').onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();movieSize(Number($('movie-resizer').getAttribute('aria-valuenow'))+(e.key==='ArrowDown'?3:-3));}};

updateTheatre();

window.addEventListener('xparty:queue',e=>{if(!room)return toast('Join a room before adding a playlist.');send('queue-add',e.detail);});
window.addEventListener('xparty:share-file',e=>{if(!room||room.hostId!==me)return toast('Create a room as host before sharing a Drive video.');const file=e.detail;if(!file||!file.size||file.size>MAX_FILE)return toast('Choose a video between 1 byte and 500 MB.');pendingFile=file;send('source',{source:{type:'file',title:file.name,size:file.size,mime:file.type}});});

window.XPARTY_SESSION_STATE=()=>({inRoom:!!room,isHost:!!room&&room.hostId===me});

// Interface and call controls intentionally separate from playback timing.
function audioDiagnostics(){const settings=localStream.getAudioTracks()[0]?.getSettings();$('audio-diagnostics').textContent=settings?'Microphone processing reported by this browser — echo cancellation: '+(settings.echoCancellation===true?'on':settings.echoCancellation===false?'off':'not reported')+' · noise suppression: '+(settings.noiseSuppression===true?'on':settings.noiseSuppression===false?'off':'not reported'):'Microphone is off. Audio processing depends on your browser and device.';}
function notifySound(event){if(preferences.notify_enabled===false||Number(preferences.notify_volume)===0||!preferences['notify_'+event]||!audioContext||audioContext.state!=='running')return;const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.frequency.value={join:660,leave:330,message:780,sent:520,read:920}[event]||600;gain.gain.setValueAtTime(.07*(preferences.notify_volume??35)/100,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.12);oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+.13);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}
function markVisibleRead(){if(!chatIsVisible())return;if(unread){unread=0;updateUnread();}const box=$('messages').getBoundingClientRect(),ids=[];for(const el of $('messages').querySelectorAll('[data-unread]')){const rect=el.getBoundingClientRect();if(rect.bottom>Math.max(0,box.top)&&rect.top<Math.min(innerHeight,box.bottom)&&!observedMessages.has(el.dataset.messageId)){ids.push(el.dataset.messageId);observedMessages.add(el.dataset.messageId);delete el.dataset.unread;}}if(ids.length)send('read',{ids});}
$('messages').addEventListener('scroll',markVisibleRead,{passive:true});document.addEventListener('visibilitychange',markVisibleRead);
function conversation(mode){if(mode!=='chat'&&callExperience&&!callExperience.canOpen()){callExperience.open();return;}vcVisible=mode!=='chat';chatVisible=mode!=='call';updateTheatre();}
let swipeStart;
const swipePanel=document.querySelector('.together-column');
swipePanel.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0||e.target.closest('input,button,select,textarea,a,[role=separator],.call-pip-preview'))return;swipeStart={id:e.pointerId,x:e.clientX,y:e.clientY};swipePanel.setPointerCapture(e.pointerId);});
swipePanel.addEventListener('pointermove',e=>{if(!swipeStart||e.pointerId!==swipeStart.id)return;const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){swipeStart=null;return;}if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.4){e.preventDefault();swipeStart=null;conversation(dx<0?'chat':'call');}});
function finishSwipe(e){if(swipeStart&&e.pointerId===swipeStart.id){const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;swipeStart=null;if(e.type==='pointerup'&&Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.4)conversation(dx<0?'chat':'call');}if(swipePanel.hasPointerCapture(e.pointerId))swipePanel.releasePointerCapture(e.pointerId);}
swipePanel.addEventListener('pointerup',finishSwipe);swipePanel.addEventListener('pointercancel',finishSwipe);swipePanel.addEventListener('lostpointercapture',()=>swipeStart=null);
$('speaker').onclick=async()=>{const blocked=[...peers.values()].some(p=>p.audioBlocked);if(blocked){speakerOn=true;await unlockAudio();$('speaker').classList.remove('audio-needs-tap');}else speakerOn=!speakerOn;$('speaker').setAttribute('aria-pressed',speakerOn);for(const p of peers.values())attachRemoteAudio(p);};
$('expand-call').onclick=()=>{const expanded=document.body.classList.toggle('call-expanded');$('expand-call').setAttribute('aria-pressed',expanded);if(expanded)conversation('call');};
$('theatre-view').onchange=()=>{viewMode=$('theatre-view').value;document.body.dataset.view=viewMode;if(viewMode==='call')conversation('call');else conversation('both');};
$('queue-order').onchange=()=>send('queue-order',{order:$('queue-order').value});
$('auto-advance').onchange=()=>send('auto-advance',{enabled:$('auto-advance').checked});
function setEntryNickname(name){$('name').value=name;$('join-nickname').value=name;$('nickname-toggle').setAttribute('aria-label',name?'Edit nickname: '+name:'Optional nickname');}
setEntryNickname(rememberedNickname());$('nickname-toggle').onclick=async()=>{const name=await nicknameChoice($('name').value,true);if(name!==null)setEntryNickname(name);};
function scheduleRoomLookup(){clearTimeout(lookupTimer);const request=++joinLookup,code=$('code').value;const button=$('join-button');const saved=readSession();if(!validRoomCode(code)){button.disabled=true;button.dataset.state='pending';$('join-status').textContent=code?'Enter exactly 7 letters or numbers (2-9).':'';return;}if(saved?.base===base&&saved.code===code){button.disabled=false;button.dataset.state='available';$('join-status').textContent='Return to your existing room seat';return;}button.disabled=true;button.dataset.state='pending';$('join-status').textContent=code.length<7?'':'Checking room…';if(!validRoomCode(code))return;lookupTimer=setTimeout(async()=>{try{const response=await fetch(base+'/api/room-status?code='+encodeURIComponent(code));const data=await response.json();if(request!==joinLookup)return;button.disabled=data.status!=='available';button.dataset.state=data.status==='available'?'available':'blocked';$('join-status').textContent=({available:'Room available · ready to join',full:'Room is full · ask the host for another seat',locked:'Room is locked · ask the host to unlock',limited:'Please wait before checking again'})[data.status]||'Room unavailable · check the code';}catch{if(request===joinLookup){button.disabled=false;button.dataset.state='pending';$('join-status').textContent='Could not check availability. You can still try joining.';}}},350);}
$('code').addEventListener('focus',scheduleRoomLookup);
function renderCapacity(){const box=$('capacity-options');if(!box.dataset.ready){box.dataset.ready='true';box.replaceChildren();box.style.gridTemplateColumns='1fr';const label=document.createElement('label');label.className='switch-row';const unlimited=document.createElement('input');unlimited.type='checkbox';unlimited.id='room-unlimited';label.append(document.createTextNode(t('No room limit')),unlimited);const number=document.createElement('input');number.type='number';number.id='room-capacity-number';number.min='2';number.max=String(MAX_FINITE_ROOM_CAPACITY);number.step='1';number.setAttribute('aria-label',t('Maximum room members'));number.value='10';unlimited.onchange=()=>{$('room-capacity').value=unlimited.checked?'none':String(Math.max(2,Number(number.value)||10,room?.people.filter(p=>p.online||p.reservedUntil>Date.now()).length||0));renderCapacity();};number.oninput=()=>{$('room-capacity').value=number.value;};const value=document.createElement('output');box.append(label,number,value);}const unlimited=$('room-unlimited'),number=$('room-capacity-number'),noLimit=$('room-capacity').value==='none';unlimited.checked=noLimit;unlimited.disabled=room?.hostId!==me;number.disabled=noLimit||room?.hostId!==me;number.hidden=noLimit;if(!noLimit)number.value=$('room-capacity').value;box.querySelector('output').value=noLimit?t('Everyone can watch and chat. Six call seats.'):'2-500 '+t('people');}
$('save-room-settings').onclick=()=>{if(room?.hostId===me){const capacity=$('room-capacity').value==='none'?null:Number($('room-capacity').value);if(!validRoomCapacity(capacity))return toast('Choose No room limit or a whole number from 2 to 500.');send('capacity',{capacity});send('theme-access',{enabled:$('guest-themes').checked});}if(room?.hostId===me||room?.guestThemes)send('room-theme',{theme:$('room-theme').value});$('room-settings-dialog').close();};
$('reset-room-settings').onclick=()=>{$('room-theme').value='';$('guest-themes').checked=false;$('room-capacity').value='none';renderCapacity();};
$('room-notifications').onclick=()=>{$('room-settings-dialog').close();populateSettings();$('settings-dialog').showModal();$('notification-settings').scrollIntoView({block:'nearest'});};
$('test-sound').onclick=async()=>{await unlockAudio();const previous=preferences.notify_message;preferences.notify_message=true;notifySound('message');preferences.notify_message=previous;};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
document.querySelector('.brand').onclick=e=>{e.preventDefault();$('nav-home').click();};
$('new-room').onclick=()=>{$('nav-home').click();$('create-toggle').click();};
$('privacy-open').onclick=()=>$('privacy-dialog').showModal();
for(const[id,name,label]of [['nav-home','home','Home'],['nav-settings','settings','Settings'],['nav-about','info','About'],['control-key','key','Room controls'],['people-button','people','Participants'],['nav-friends','people','Friends'],['nav-messages','message','Messages'],['nav-notifications','bell','Notifications'],['room-add-friend','person-add','Add friend'],['rename','edit','Edit your name'],['new-room','plus','Create room'],['camera-flip','flip','Switch front / rear camera'],['speaker','volume','Call speaker on / off'],['expand-call','expand','Expand video call'],['nickname-toggle','person','Optional nickname']])icon($(id),name,label);
for(const details of document.querySelectorAll('.room-tools details'))details.addEventListener('toggle',()=>{if(!details.open)return;for(const other of document.querySelectorAll('.room-tools details'))if(other!==details)other.open=false;const panel=details.querySelector('.room-menu-content,#member-list,p');if(!panel)return;const rect=details.getBoundingClientRect();Object.assign(panel.style,{position:'fixed',top:Math.min(rect.bottom+6,innerHeight-150)+'px',left:Math.max(8,Math.min(rect.left,innerWidth-290))+'px',width:'min(280px, calc(100vw - 16px))',maxHeight:'min(360px, calc(100dvh - 80px))',overflow:'auto',zIndex:80});});
document.addEventListener('click',e=>{for(const d of document.querySelectorAll('.room-tools details[open]'))if(!d.contains(e.target))d.open=false;});
audioDiagnostics();

for(const node of document.querySelectorAll('[title]')){if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',node.title);node.removeAttribute('title');}

function readSession(){try{return JSON.parse(sessionStorage.getItem(SESSION)||localStorage.getItem(SESSION)||'null');}catch{return null;}}
function saveSession(saved){try{const text=JSON.stringify(saved);sessionStorage.setItem(SESSION,text);localStorage.setItem(SESSION,text);}catch{toast('This browser could not save your rejoin session. Keep this tab open.');}}
function clearSession(){try{sessionStorage.removeItem(SESSION);localStorage.removeItem(SESSION);}catch{}$('active-room-banner').hidden=true;}
$('resume-saved').onclick=()=>{const saved=readSession();if(saved?.base===base)connect({type:'resume',token:saved.token});};
$('leave-saved').onclick=()=>{const saved=readSession();if(!saved)return;const url=new URL(base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';const ws=new WebSocket(url);ws.onopen=()=>ws.send(JSON.stringify({type:'resume',token:saved.token}));ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='welcome')ws.send(JSON.stringify({type:'leave'}));if(['welcome','resume-failed'].includes(m.type)){clearSession();ws.close();}};setTimeout(()=>ws.close(),10000);};
function renderPartyControls(){if(!room)return;const host=room.hostId===me,mode=room.mode||'HOST_APPROVAL';$('party-mode').value=mode;for(const b of document.querySelectorAll('[data-party-mode]'))b.setAttribute('aria-pressed',b.dataset.partyMode===mode);if(!host)$('approval-settings').hidden=true;$('participant-settings-button').hidden=!host;$('approval-policy').value=room.approvalPolicy||'manual';$('auto-approve-requests').checked=room.approvalPolicy==='approve';$('auto-decline-requests').checked=room.approvalPolicy==='reject';$('auto-sync').checked=!!room.autoSync;$('auto-pause').checked=!!room.autoPause;$('request-control').hidden=host||mode!=='SHARED_CONTROL';$('control-status').textContent=room.hostReconnecting?'Host reconnecting · seat reserved for 2 minutes':room.controller?((room.people.find(p=>p.id===room.controller.id)?.name||'Participant')+' has control · host can override'):host?'You can change modes at any time.':mode==='HOST_APPROVAL'?'Pause is local. Play catches up to the host. Video changes need approval.':mode==='HOST_ONLY'?'Pause is local. Play catches up to the host. Only the host changes shared playback.':'Shared playback · 10-second control turns.';$('stop').hidden=!host;for(const id of ['seek','back10','forward10','previous-video'])$(id).disabled=(!host&&mode!=='SHARED_CONTROL')||(id!=='previous-video'&&isLiveSource(room.source));for(const id of ['back10','forward10','previous-video'])$(id).hidden=!host&&mode!=='SHARED_CONTROL';$('play').disabled=false;$('play').setAttribute('aria-label',!host&&mode!=='SHARED_CONTROL'?'Pause or resume on this device':'Play or pause for everyone');$('party-actions').hidden=host||mode!=='HOST_APPROVAL';$('resync').disabled=false;const requests=(room.requests||[]).filter(q=>host||q.by===me);$('request-count').textContent=requests.filter(q=>q.status==='HOST_REVIEW').length+(host?room.people.filter(p=>p.seatRequested||p.cameraRequested).length:0);const box=$('request-list');document.querySelector('.member-list').classList.toggle('has-requests',room.people.some(p=>p.cameraRequested||p.seatRequested)||requests.some(q=>q.status==='HOST_REVIEW'));box.replaceChildren();const priority=q=>q.action.type==='resync'?0:q.action.type==='playback'?1:q.action.type==='party-mode'?3:2;for(const q of [...requests].sort((a,b)=>priority(a)-priority(b)||a.createdAt-b.createdAt).slice(-50)){const row=document.createElement('div');row.className='request-card';const text=document.createElement('p');text.textContent=q.name+' · '+(q.action.intent||q.action.type)+' · '+q.status;row.append(text);if(q.status==='HOST_REVIEW'){for(const [label,type,fields]of host?[['Approve','review-request',{approve:true}],['Reject','review-request',{approve:false}]]:[['Cancel','cancel-request',{}]]){const b=document.createElement('button');b.className='secondary';icon(b,label==='Approve'?'check':'close',label+' request');b.onclick=()=>send(type,{id:q.id,...fields});row.append(b);}}box.append(row);}if(!requests.length)box.textContent='';renderRequestNotices();}
$('party-mode').onchange=()=>send('party-mode',{mode:$('party-mode').value});for(const b of document.querySelectorAll('[data-party-mode]'))b.onclick=()=>{$('party-mode').value=b.dataset.partyMode;$('party-mode').dispatchEvent(new Event('change'));};$('request-control').onclick=()=>send('request-control');$('open-requests').onclick=e=>{e.stopPropagation();$('room-menu').open=false;document.querySelector('.member-list').open=true;};$('save-approval').onclick=()=>send('approval-settings',{policy:$('approval-policy').value,autoSync:$('auto-sync').checked,autoPause:$('auto-pause').checked});$('previous-video').onclick=()=>send('previous');
$('rename').onclick=()=>{$('rename-input').value=room?.people.find(p=>p.id===me)?.name||'';$('rename-dialog').showModal();};$('save-name').onclick=()=>{send('rename',{name:$('rename-input').value});$('rename-dialog').close();};
$('privacy-settings').onclick=privacySettings;
$('focus-call').onclick=()=>{const focused=document.body.classList.toggle('focus-call');$('focus-call').setAttribute('aria-pressed',focused);$('focus-call').setAttribute('aria-label',focused?'Exit focus':'Focus call');conversation('call');document.body.classList.remove('browsing');};
let callHeight=460;function resizeCall(value){callHeight=Math.max(220,Math.min(900,value));document.documentElement.style.setProperty('--call-height',callHeight+'px');document.documentElement.style.setProperty('--mobile-call-height',callHeight+'px');document.documentElement.style.setProperty('--focus-height',callHeight+'px');$('call-resizer').setAttribute('aria-valuenow',Math.round(callHeight));if(innerWidth>760&&Number($('participants').dataset.active)>0)document.documentElement.style.setProperty('--conversation-width',Math.min(innerWidth*.6,callHeight*.75+24)+'px');}
$('call-resizer').onpointerdown=e=>{e.preventDefault();const start=e.clientY,height=callHeight;$('call-resizer').setPointerCapture(e.pointerId);$('call-resizer').onpointermove=ev=>resizeCall(height+ev.clientY-start);$('call-resizer').onpointerup=$('call-resizer').onpointercancel=()=>{$('call-resizer').onpointermove=null;};};$('call-resizer').onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();resizeCall(callHeight+(e.key==='ArrowDown'?20:-20));}};

// Floating movie uses the existing player; moving it never reloads media.
const pipBox=document.querySelector('.watch-column');let pipWidth=280;
function constrainPip(){if(!document.body.classList.contains('focus-call'))return;const r=pipBox.getBoundingClientRect();pipWidth=Math.min(Math.max(200,r.width),innerWidth-16);pipBox.style.setProperty('--pip-width',pipWidth+'px');pipBox.style.left=Math.max(8,Math.min(r.left,innerWidth-pipWidth-8))+'px';pipBox.style.top=Math.max(58,Math.min(r.top,innerHeight-r.height-8))+'px';pipBox.style.right='auto';pipBox.style.bottom='auto';}
for(const [id,resize] of [['pip-handle',false],['pip-resize',true]]){const h=$(id);h.onpointerdown=e=>{e.preventDefault();constrainPip();const r=pipBox.getBoundingClientRect(),x=e.clientX,y=e.clientY;h.setPointerCapture(e.pointerId);h.onpointermove=v=>{if(resize)pipBox.style.setProperty('--pip-width',Math.max(200,Math.min(innerWidth-16,r.width+v.clientX-x))+'px');else{pipBox.style.left=Math.max(8,Math.min(innerWidth-r.width-8,r.left+v.clientX-x))+'px';pipBox.style.top=Math.max(58,Math.min(innerHeight-r.height-8,r.top+v.clientY-y))+'px';}};h.onpointerup=h.onpointercancel=()=>{h.onpointermove=null;constrainPip();};};h.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();constrainPip();const r=pipBox.getBoundingClientRect();if(resize)pipBox.style.setProperty('--pip-width',(r.width+(e.key==='ArrowRight'?20:-20))+'px');else{pipBox.style.left=(r.left+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0))+'px';pipBox.style.top=(r.top+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0))+'px';}constrainPip();};}
window.addEventListener('resize',constrainPip);
const members=document.querySelector('.member-list');let memberTimer;function keepMembers(){clearTimeout(memberTimer);if(members.open)memberTimer=setTimeout(()=>{if(!members.querySelector('select:focus,input:focus'))members.open=false;else keepMembers();},12000);}members.addEventListener('toggle',()=>{$('people-button').setAttribute('aria-expanded',members.open);keepMembers();});$('people-button').onclick=()=>{members.open=!members.open;$('room-menu').open=false;};$('close-participants').onclick=()=>members.open=false;$('participant-settings-button').onclick=()=>{const box=$('approval-settings');box.hidden=!box.hidden;$('participant-settings-button').setAttribute('aria-expanded',!box.hidden);keepMembers();};members.addEventListener('pointerdown',keepMembers);members.addEventListener('keydown',keepMembers);

for(const button of document.querySelectorAll('[data-party-intent]'))button.onclick=()=>{if(!room?.source)return toast('Add a video first.');const intent=button.dataset.partyIntent;send('party-request',{intent,sourceId,playing:intent==='play',position:intent==='seek'?Number($('request-seek-position').value):currentTime()});};

for(const b of document.querySelectorAll('[data-reaction]'))b.onclick=()=>send('reaction',{emoji:b.dataset.reaction});
// Audio activity comes from existing WebRTC statistics; no extra audio output or capture.
let speakerScan=false;
setInterval(async()=>{if(speakerScan||document.hidden||!room||!localStream.getTracks().length&&!peers.size)return;speakerScan=true;const speaking=new Set();try{await Promise.all([...peers].map(async([id,p])=>{try{const stats=await p.pc.getStats();stats.forEach(s=>{if(s.kind!=='audio'&&s.mediaType!=='audio')return;if(s.type==='inbound-rtp'&&s.audioLevel>.035)speaking.add(id);if(s.type==='media-source'&&s.audioLevel>.035&&localStream.getAudioTracks().some(t=>t.enabled&&t.readyState==='live'))speaking.add(me);});}catch{}}));for(const tile of $('participants').children){const active=speaking.has(tile.dataset.id)&&room?.people.some(p=>p.id===tile.dataset.id&&p.mic);tile.classList.toggle('speaking',!!active);}}finally{speakerScan=false;}},650);
const callPip=document.querySelector('.call-panel');
function clampCallPip(){const r=callPip.getBoundingClientRect();callPip.style.setProperty('--vc-width',Math.min(Math.max(200,r.width),innerWidth-16)+'px');callPip.style.left=Math.max(8,Math.min(r.left,innerWidth-callPip.offsetWidth-8))+'px';callPip.style.top=Math.max(110,Math.min(r.top,innerHeight-callPip.offsetHeight-8))+'px';}
function snapCallPip(corner){clampCallPip();callPip.style.left=(corner.endsWith('r')?Math.max(8,innerWidth-callPip.offsetWidth-8):8)+'px';callPip.style.top=(corner.startsWith('b')?Math.max(110,innerHeight-callPip.offsetHeight-8):110)+'px';}
for(const b of document.querySelectorAll('[data-vc-corner]'))b.onclick=()=>snapCallPip(b.dataset.vcCorner);
for(const [id,resizing]of [['vc-pip-handle',false],['vc-pip-resize',true]]){const h=$(id);h.onpointerdown=e=>{e.preventDefault();clampCallPip();const r=callPip.getBoundingClientRect(),x=e.clientX,y=e.clientY;h.setPointerCapture(e.pointerId);h.onpointermove=v=>{if(resizing)callPip.style.setProperty('--vc-width',Math.max(200,Math.min(innerWidth-16,r.width+v.clientX-x))+'px');else{callPip.style.left=(r.left+v.clientX-x)+'px';callPip.style.top=(r.top+v.clientY-y)+'px';}clampCallPip();};h.onpointerup=h.onpointercancel=()=>h.onpointermove=null;};h.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();const r=callPip.getBoundingClientRect();if(resizing)callPip.style.setProperty('--vc-width',(r.width+(['ArrowRight','ArrowDown'].includes(e.key)?20:-20))+'px');else{callPip.style.left=(r.left+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0))+'px';callPip.style.top=(r.top+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0))+'px';}clampCallPip();};}
addEventListener('resize',()=>{if(document.body.classList.contains('cinema')&&viewMode==='movie')clampCallPip();});

// Compact UI shares the existing room, player and call. No second media output.
for(const [id,shape,label]of [['load-video','search','Search YouTube'],['next-video','next','Play next'],['back-video','back','Back to video'],['participant-settings-button','settings','Participant review settings'],['close-participants','close','Close participants'],['controls-toggle','more','Show playback controls'],['attach-chat','attach','Share photo, GIF, video or file']])icon($(id),shape,label);
for(const id of ['noise-setting','echo-setting','auto-sync','auto-pause','guest-themes'])$(id).setAttribute('role','switch');
const shell=$('player-shell');let controlsTimer;
function showControls(){shell.classList.remove('controls-hidden');$('controls-toggle').setAttribute('aria-expanded','true');clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>{if(!shell.querySelector('.player-bar :focus-visible')&&!shell.matches(':active')){shell.classList.add('controls-hidden');$('controls-toggle').setAttribute('aria-expanded','false');}},2800);}
shell.addEventListener('pointermove',e=>{if(!e.target.closest('#controls-toggle'))showControls();},{passive:true});shell.addEventListener('pointerdown',e=>{if(!e.target.closest('#controls-toggle'))showControls();},{passive:true});shell.addEventListener('keydown',e=>{if(!e.target.closest('#controls-toggle'))showControls();});shell.addEventListener('focusin',e=>{if(!e.target.closest('#controls-toggle'))showControls();});
$('controls-toggle').onclick=()=>{if(shell.classList.contains('controls-hidden'))showControls();else{clearTimeout(controlsTimer);shell.classList.add('controls-hidden');$('controls-toggle').setAttribute('aria-expanded','false');}};showControls();
const sections=[...$('settings-dialog').querySelectorAll('.settings-section')];let settingsTimer;
function settingsActivity(){clearTimeout(settingsTimer);if($('settings-dialog').open)settingsTimer=setTimeout(()=>{if(!$('settings-dialog').querySelector('input:focus,select:focus'))for(const d of sections)d.open=false;else settingsActivity();},18000);}
for(const d of sections)d.addEventListener('toggle',()=>{if(d.open)for(const other of sections)if(other!==d)other.open=false;settingsActivity();});
$('settings-dialog').addEventListener('pointerdown',settingsActivity);$('settings-dialog').addEventListener('keydown',settingsActivity);
$('room-notifications').addEventListener('click',()=>{$('notification-settings').closest('details').open=true;settingsActivity();});
document.addEventListener('pointerdown',e=>{if(members.open&&!members.contains(e.target)&&!$('people-button').contains(e.target)&&!e.target.closest('#toast,.approval-card'))members.open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){members.open=false;$('room-menu').open=false;}});
const splitter=$('conversation-resizer');let conversationWidth=360;
function resizeConversation(delta){if(innerWidth<=760){resizeCall(Math.max(220,callHeight+delta));document.documentElement.style.setProperty('--focus-height',callHeight+'px');}else{conversationWidth=Math.max(270,Math.min(innerWidth*.65,conversationWidth-delta));document.documentElement.style.setProperty('--conversation-width',conversationWidth+'px');}}
splitter.onpointerdown=e=>{e.preventDefault();let previous=innerWidth<=760?e.clientY:e.clientX;splitter.setPointerCapture(e.pointerId);splitter.onpointermove=v=>{const current=innerWidth<=760?v.clientY:v.clientX;resizeConversation(current-previous);previous=current;};splitter.onpointerup=splitter.onpointercancel=()=>splitter.onpointermove=null;};
splitter.onkeydown=e=>{if(e.key.startsWith('Arrow')){e.preventDefault();resizeConversation(['ArrowRight','ArrowDown'].includes(e.key)?20:-20);}};
$('call-resizer').addEventListener('pointermove',()=>document.documentElement.style.setProperty('--focus-height',callHeight+'px'));
function describeRequest(q){const a=q.action;return a.type==='source'?'Change video: '+(a.source?.title||'YouTube'):a.type==='playback'?({pause:'Pause the party',play:'Play for everyone',seek:'Seek to '+Math.round(a.position)+'s'})[a.intent]||'Playback':a.type==='party-mode'?'Change mode to '+a.mode:a.type==='request-control'?'Take playback control':a.type==='resync'?'Resync':'Playlist: '+a.type.replace('queue-','');}
const approvalTray=document.createElement('div');approvalTray.id='approval-tray';approvalTray.setAttribute('aria-label',t('Pending requests'));$('messages').before(approvalTray);
function renderRequestNotices(){if(!room)return;const host=room.hostId===me,visible=(room.requests||[]).filter(q=>host||q.by===me);const shown=[...visible.filter(q=>q.status==='HOST_REVIEW'),...visible.filter(q=>q.status!=='HOST_REVIEW').slice(-3)];const notices=shown.map(q=>({id:q.id,text:q.name+' · '+describeRequest(q),status:q.status,accept:()=>send('review-request',{id:q.id,approve:true}),decline:()=>send('review-request',{id:q.id,approve:false})}));
 if(host)for(const person of room.people.filter(p=>p.pttRequested))notices.push({id:'ptt-'+person.id,text:person.name+' · '+t('Push to talk'),status:'HOST_REVIEW',accept:()=>send('ptt-review',{target:person.id,approve:true}),decline:()=>send('ptt-review',{target:person.id,approve:false})});
 if(host)for(const person of room.people.filter(p=>p.seatRequested))notices.push({id:'seat-'+person.id,text:person.name+' · Take a call seat',status:'HOST_REVIEW',accept:()=>send('review-seat',{target:person.id,approve:true}),decline:()=>send('review-seat',{target:person.id,approve:false})});
 if(host)for(const person of room.people.filter(p=>p.cameraRequested))notices.push({id:'camera-'+person.id,text:person.name+' · Enable camera',status:'HOST_REVIEW',accept:()=>send('moderate',{target:person.id,action:'approve-camera'}),decline:()=>send('moderate',{target:person.id,action:'deny-camera'})});
 for(const request of friendRequests.filter(q=>q.to===me&&q.status==='pending')){const person=room.people.find(p=>p.id===request.from);notices.push({id:'friend-'+request.id,text:(person?.name||t('Friend'))+' · '+t('Friend request'),status:'HOST_REVIEW',canAct:true,accept:()=>send('friend-review',{id:request.id,accept:true}),decline:()=>send('friend-review',{id:request.id,accept:false})});}
 for(const el of document.querySelectorAll('.chat-panel [data-request]'))if(!notices.some(q=>q.id===el.dataset.request))el.remove();
 for(const q of notices){let el=[...document.querySelectorAll('.chat-panel [data-request]')].find(e=>e.dataset.request===q.id);const fresh=!el;if(!el){el=document.createElement('div');el.dataset.request=q.id;el.className='message system';$('messages').querySelector('.chat-welcome')?.remove();$('messages').append(el);}el.replaceChildren();const card=document.createElement('div');card.className='approval-card';const text=document.createElement('span');text.textContent=q.text;card.append(text);
   if((host||q.canAct)&&q.status==='HOST_REVIEW'){const actions=document.createElement('div');actions.className='request-actions';actions.append(actionIcon('Accept request','check',q.accept),actionIcon('Decline request','close',q.decline));card.append(actions);}else{const status=document.createElement('small');status.className='request-status';status.textContent=q.status==='HOST_REVIEW'?'Pending':q.status.toLowerCase().replaceAll('_',' ');card.append(status);}el.append(card);el.classList.toggle('expired-request',q.status!=='HOST_REVIEW');if(q.status==='HOST_REVIEW')$('approval-tray').append(el);else $('messages').append(el);if(fresh&&host){if(!chatIsVisible()){unread++;updateUnread();}notifySound('message');}
 }
}
function renderAttachment(el,attachment){const card=document.createElement('div');card.className='attachment-card';const button=document.createElement('button');button.type='button';button.textContent=attachment.name+' · '+(attachment.size/1048576).toFixed(1)+' MB';button.setAttribute('aria-label','Open attachment '+attachment.name);card.append(button);el.append(card);let loaded=false;
 button.onclick=async()=>{if(loaded)return;button.disabled=true;button.textContent='Loading…';const currentToken=token;try{const res=await fetch(base+'/api/attachment/'+attachment.id,{headers:{Authorization:'Bearer '+currentToken}});if(!res.ok)throw Error('Attachment unavailable. It may have been removed or the room restarted.');const blob=await res.blob();if(token!==currentToken)return;const url=URL.createObjectURL(new Blob([blob],{type:attachment.mime}));attachmentUrls.add(url);loaded=true;
   if(/^image\/(png|jpeg|gif|webp)$/.test(attachment.mime)){const img=document.createElement('img');img.src=url;img.alt=attachment.name;card.append(img);card.classList.remove('media-loading');}else if(/^video\/(mp4|webm)$/.test(attachment.mime)){const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='metadata';card.append(video);card.classList.remove('media-loading');}
   const link=document.createElement('a');link.href=url;link.download=attachment.name;link.textContent='Download '+attachment.name;card.append(link);button.remove();
 }catch(e){button.disabled=false;button.textContent='Retry · '+attachment.name;card.classList.remove('media-loading');toast(e.message);}};
 if(/^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm))$/.test(attachment.mime)){card.classList.add('chat-media','media-loading');button.textContent='Loading media…';button.click();}
}
$('attach-chat').onclick=()=>{if(!room||preview)return toast('Join a live room to share files.');$('chat-file').click();};
async function shareChatAttachment(input){const file=input.files[0];input.value='';if(!file)return;if(!room||preview)return toast('Join a live room to share files.');if(file.size>20*1048576||!file.size)return toast('Chat attachments must be between 1 byte and 20 MB. Use Local file for a longer shared movie.');const currentToken=token,to=recipient?.id||null;$('attach-chat').disabled=true;$('chat-camera').disabled=true;$('attachment-status').hidden=false;$('attachment-status').textContent='Uploading '+file.name+'…';try{const response=await fetch(base+'/api/attachment',{method:'POST',headers:{Authorization:'Bearer '+currentToken,'Content-Type':file.type||'application/octet-stream','X-Attachment-Name':encodeURIComponent(file.name),'X-Attachment-To':to||''},body:file});const result=await response.json();if(!response.ok)throw Error(result.error||'Upload failed');if(token!==currentToken)return;send('chat',{text:'',attachmentId:result.attachment.id,to});$('attachment-status').textContent='Shared '+file.name;}catch(e){$('attachment-status').textContent=e.message;toast(e.message);}finally{$('attach-chat').disabled=false;$('chat-camera').disabled=false;setTimeout(()=>$('attachment-status').hidden=true,5000);}};
$('chat-file').onchange=()=>shareChatAttachment($('chat-file'));
$('chat-camera-file').onchange=()=>shareChatAttachment($('chat-camera-file'));
$('chat-camera').onclick=()=>{if(!room||preview)return toast('Join a live room to share photos or videos.');$('chat-camera-file').click();};
$('chat-video').onclick=()=>conversation('call');
$('chat-mention').onclick=()=>{const input=$('message-input');input.value+=(input.value&&!/\s$/.test(input.value)?' ':'')+'@';input.focus();showMentions();};
icon($('chat-camera'),'photo','Take or share a photo or video');icon($('chat-video'),'camera','Open video call');


function setPlayIcon(playing){const shape=playing?"pause":"play";if($("play").dataset.shape!==shape){icon($("play"),shape,playing?"Pause playback":"Play playback");$("play").dataset.shape=shape;}}
setPlayIcon(false);icon($("previous-video"),"back","Previous video");

$('lock-toggle').onchange=()=>send('lock',{locked:$('lock-toggle').checked});

for(const [id,value,other]of [['auto-approve-requests','approve','auto-decline-requests'],['auto-decline-requests','reject','auto-approve-requests']])$(id).onchange=()=>{if($(id).checked)$(other).checked=false;$('approval-policy').value=$(id).checked?value:'manual';};

let menuTimer;function menuActivity(){clearTimeout(menuTimer);if($('room-menu').open)menuTimer=setTimeout(()=>{if(!$('room-menu').querySelector('input:focus,select:focus'))$('room-menu').open=false;else menuActivity();},12000);}$('room-menu').addEventListener('toggle',menuActivity);$('room-menu').addEventListener('pointerdown',menuActivity);$('room-menu').addEventListener('keydown',menuActivity);

function updateRoomNotification(){renderRoomFriends();const saved=readSession();const active=room||saved;const button=$('notification-return');button.hidden=!active;$('notification-exit').hidden=!active;$('notification-room-status').textContent=active?'Your room '+active.code+' is ready to return to.':'No active room.';}
$('nav-notifications').onclick=()=>{if($('settings-dialog').open)$('settings-dialog').close();updateRoomNotification();$('notifications-dialog').showModal();};$('home-exit').onclick=()=>leave();$('notification-exit').onclick=()=>{$('notifications-dialog').close();if(room)leave();else $('leave-saved').click();};icon($('home-exit'),'leave','Exit room');icon($('notification-exit'),'leave','Exit room');icon($('notification-return'),'home','Return to room');icon($('return-room'),'home','Return to room');
$('notification-return').onclick=()=>{$('notifications-dialog').close();if(room)$('return-room').click();else $('resume-saved').click();};

const roomSettingsLink=document.createElement('button');roomSettingsLink.className='secondary';roomSettingsLink.textContent='Room settings';roomSettingsLink.onclick=()=>{$('room-menu').open=false;$('room-settings-button').click();};document.querySelector('.room-menu-content').append(roomSettingsLink);
// Room social actions are independent of the playback clock.
let friendRequests=[];
function renderRoomFriends(){if(!room){$('room-friend-list').replaceChildren();$('friend-notifications').replaceChildren();$('nav-notifications').classList.remove('has-notice');$('nav-friends').classList.remove('has-notice');return;}const box=$('room-friend-list');box.replaceChildren();const notices=$('friend-notifications');notices.replaceChildren();for(const person of room.people.filter(p=>p.id!==me&&p.online)){
 const row=document.createElement('div');row.className='friend-row';const name=document.createElement('span');name.textContent=person.name;row.append(name);const request=friendRequests.find(q=>[q.from,q.to].includes(person.id)&&q.status!=='declined');
 if(request?.status==='accepted'){row.append(actionIcon('Message '+person.name,'message',()=>{$('room-friends-dialog').close();$('account-dialog').close();setRecipient(person);$('return-room').click();conversation('chat');$('message-input').focus();}));}
 else if(request?.status==='pending'&&request.to===me){for(const [label,accept,shape]of[['Accept friend',true,'check'],['Decline friend',false,'close']])row.append(actionIcon(label,shape,()=>send('friend-review',{id:request.id,accept})));const note=document.createElement('div');note.className='friend-row';const text=document.createElement('span');text.textContent=person.name+' wants to connect';note.append(text,actionIcon('Accept friend', 'check',()=>send('friend-review',{id:request.id,accept:true})),actionIcon('Decline friend','close',()=>send('friend-review',{id:request.id,accept:false})));notices.append(note);}
 else if(request?.status==='pending'){const pending=document.createElement('small');pending.textContent='Request sent';row.append(pending);}
 else row.append(actionIcon('Add '+person.name+' as friend','person-add',()=>send('friend-request',{target:person.id})));box.append(row);
 }if(!box.children.length)box.textContent='Invite someone with your room code to connect.';const pendingFriend=friendRequests.some(q=>q.to===me&&q.status==='pending');$('nav-notifications').classList.toggle('has-notice',pendingFriend);$('nav-settings').classList.toggle('has-notice',pendingFriend);$('nav-friends').classList.toggle('has-notice',pendingFriend);}
window.addEventListener('xparty:room-friends',()=>{renderRoomFriends();$('room-friends-dialog').append($('room-friend-list'));$('room-friends-dialog').showModal();});
function renderPoll(card,poll){card.className='poll-card';card.replaceChildren();const question=document.createElement('strong');question.textContent=poll.question;card.append(question);const total=Object.keys(poll.votes).length;poll.options.forEach((option,i)=>{const count=Object.values(poll.votes).filter(v=>v===i).length;const b=document.createElement('button');b.type='button';b.textContent=option+' · '+count;b.setAttribute('aria-pressed',poll.votes[me]===i);b.style.setProperty('--vote-share',(total?count/total*100:0)+'%');b.onclick=()=>send('poll-vote',{id:poll.id,choice:i});card.append(b);});const detail=document.createElement('small');detail.textContent=total+' vote'+(total===1?'':'s')+' · Tap to change your choice';card.append(detail);}
$('send-poll').onclick=()=>{const question=$('poll-question').value.trim(),options=$('poll-options').value.split('\n').map(s=>s.trim()).filter(Boolean);if(!question||options.length<2||options.length>6||new Set(options).size!==options.length)return toast('Add a question and 2–6 different choices.');send('poll-create',{question,options});$('poll-dialog').close();$('poll-question').value='';$('poll-options').value='';};icon($('exit-theatre'),'close','Exit theatre');icon($('call-controls-toggle'),'more','Show call controls');
const callPanel=document.querySelector('.call-panel');let callControlTimer;
function revealCallControls(){clearTimeout(callControlTimer);callPanel.classList.remove('call-controls-hidden');}
for(const event of['pointermove','pointerdown','focusin'])callPanel.addEventListener(event,e=>{if(!e.target.closest('#call-controls-toggle'))revealCallControls();});$('call-controls-toggle').onclick=()=>{if(callPanel.classList.contains('call-controls-hidden'))revealCallControls();else{callPanel.classList.add('call-controls-hidden');$('call-controls-toggle').setAttribute('aria-expanded','false');}};
const views=document.createElement('div');views.className='watch-view-options';views.innerHTML='<span>Watch view</span>';for(const [value,label]of[['default','Balanced'],['movie','Movie'],['call','Call']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.watchView=value;b.onclick=()=>{viewMode=value;$('theatre-view').value=value;setTheatre(true);if(value==='call')conversation('call');};views.append(b);}document.querySelector('.room-menu-content').append(views);
$('controls-toggle').classList.remove('icon-control');$('controls-toggle').style.removeProperty('--control-icon');$('controls-toggle').setAttribute('aria-label','Playback status; show or hide controls');
icon($('open-profile'),'person','Profile & sign in');
icon($('focus-call'),'focus','Focus call');
for(const id of ['panel-call','panel-chat','panel-both']){$(id).classList.add('view-underline');}



let screenLock=null,wakePending=false;
async function updateScreenLock(){
 const needed=!preview&&!document.hidden&&!$('room').hidden&&!!room&&(!!activePlayback?.playing||!!room.people.find(p=>p.id===me)?.inCall);
 if(!needed){await screenLock?.release().catch(()=>{});screenLock=null;return;}
 if(screenLock||wakePending||!navigator.wakeLock)return;
 wakePending=true;try{const lock=await navigator.wakeLock.request('screen');screenLock=lock;lock.addEventListener('release',()=>{if(screenLock===lock)screenLock=null;});}catch{}finally{wakePending=false;}
}
document.addEventListener('visibilitychange',updateScreenLock);setInterval(updateScreenLock,3000);

document.querySelector('.call-panel .panel-title').append(document.querySelector('.call-seat-row'));

let pttHeld=false,pttPreparing=false,pttTrack=null,pttOverlay,pttLaunch;
const pttButton=document.createElement('button');pttButton.id='push-to-talk';pttButton.className='icon-control';pttButton.type='button';icon(pttButton,'mic',t('Push to talk'));document.querySelector('.call-seat-row').append(pttButton);
const pttLabel=document.createElement('label');pttLabel.className='switch-row';pttLabel.textContent=t('Enable push to talk');const pttEnable=document.createElement('input');pttEnable.type='checkbox';pttEnable.role='switch';pttEnable.id='ptt-enable';pttLabel.append(pttEnable);$('approval-settings').append(pttLabel);pttEnable.onchange=()=>send('ptt-enable',{enabled:pttEnable.checked});
function renderPushToTalk(){const self=room?.people.find(p=>p.id===me);pttEnable.checked=!!room?.pttEnabled;pttEnable.disabled=room?.hostId!==me;pttButton.hidden=!room?.pttEnabled;pttButton.disabled=!!self?.micBlocked;pttButton.setAttribute('aria-label',t(self?.pttRequested?'Push to talk pending':room?.hostId===me||self?.pttApproved?'Hold to talk':'Request push to talk'));if(pttOverlay&&!room?.pttEnabled)pttOverlay.hidden=true;if(pttLaunch)pttLaunch.hidden=!room?.pttEnabled;if(pttHeld&&(!room?.pttEnabled||!self?.inCall||self.micBlocked||(room.hostId!==me&&!self.pttApproved)))stopPushToTalk();}
async function startPushToTalk(){const self=room?.people.find(p=>p.id===me);if(!room?.pttEnabled||!self||self.micBlocked)return;if(!self.inCall){if(room.hostId===me){send('call-join');return toast(t('Join a call seat, then hold to talk.'));}send('ptt-request');return toast(t('Push to talk pending'));}if(room.hostId!==me&&!self.pttApproved){send('ptt-request');return toast(t('Push to talk pending'));}pttHeld=true;pttButton.setAttribute('aria-pressed','true');if(pttPreparing)return;pttPreparing=true;try{let track=localStream.getAudioTracks()[0];if(!track){const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:preferences.echo,noiseSuppression:preferences.noise,autoGainControl:true},video:false});track=stream.getAudioTracks()[0];if(!pttHeld||!room){track.stop();return;}localStream.addTrack(track);}pttTrack=track;track.enabled=pttHeld;await unlockAudio();await updateMedia();}catch{pttHeld=false;pttButton.setAttribute('aria-pressed','false');toast(t('Allow microphone access to talk.'));}finally{pttPreparing=false;}}
function stopPushToTalk(){if(!pttHeld)return;pttHeld=false;pttButton.setAttribute('aria-pressed','false');if(pttTrack)pttTrack.enabled=false;if(room)updateMedia().catch(()=>{});}
pttButton.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();pttButton.setPointerCapture(e.pointerId);startPushToTalk();};pttButton.onpointerup=pttButton.onpointercancel=stopPushToTalk;pttButton.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)startPushToTalk();}};pttButton.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stopPushToTalk();}};pttButton.onblur=stopPushToTalk;window.addEventListener('blur',stopPushToTalk);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPushToTalk();});

// Every choice stays inside the application, preserving existing select values and handlers.
for(const select of document.querySelectorAll('select:not([hidden])')){
 select.classList.add('internal-select-source');const wrap=document.createElement('span');wrap.className='internal-select';const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');const menu=document.createElement('span');menu.className='select-options';menu.hidden=true;menu.role='listbox';select.after(wrap);wrap.append(trigger,menu);
 const sync=()=>{trigger.textContent=t(select.selectedOptions[0]?.textContent||'');trigger.disabled=select.disabled;trigger.setAttribute('aria-label',t(select.closest('label')?.firstChild?.textContent?.trim()||select.id)+': '+trigger.textContent);};
 trigger.onclick=e=>{e.stopPropagation();if(select.disabled)return;for(const other of document.querySelectorAll('.select-options'))if(other!==menu){other.hidden=true;other.previousSibling?.setAttribute('aria-expanded','false');}menu.replaceChildren();for(const option of select.options){const item=document.createElement('button');item.type='button';item.role='option';item.disabled=option.disabled;item.textContent=t(option.textContent);item.setAttribute('aria-selected',option.selected);item.onclick=v=>{v.stopPropagation();select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));menu.hidden=true;trigger.setAttribute('aria-expanded','false');sync();trigger.focus();};menu.append(item);}menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',!menu.hidden);if(!menu.hidden)menu.querySelector('[aria-selected=true]')?.focus();};
 menu.onkeydown=e=>{const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}if(e.key==='Escape'){menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}};
 document.addEventListener('click',e=>{sync();if(!wrap.contains(e.target)){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}});select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:['disabled'],childList:true,subtree:true});document.addEventListener('xparty:localized',sync);sync();
}
const roomHeader=document.querySelector('.topbar');let headerTimer;
const revealHeader=()=>{document.body.classList.remove('room-header-hidden');clearTimeout(headerTimer);if(!room||$('room').hidden)return;headerTimer=setTimeout(()=>{if(roomHeader.matches(':focus-within')||document.querySelector('dialog[open],.topbar details[open]')){revealHeader();return;}if(window.scrollY<2)document.body.classList.add('room-header-hidden');},4500);};
for(const event of ['pointermove','pointerdown','focusin'])roomHeader.addEventListener(event,revealHeader);
const headerHandle=document.createElement('button');headerHandle.className='header-reveal';headerHandle.type='button';headerHandle.setAttribute('aria-label',t('Show room controls'));headerHandle.textContent='⌄';document.body.append(headerHandle);headerHandle.onclick=revealHeader;document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&e.clientY<12&&room&&window.scrollY<2)revealHeader();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)revealHeader();});setInterval(()=>{if(room&&!headerTimer)revealHeader();if(!room){clearTimeout(headerTimer);headerTimer=null;document.body.classList.remove('room-header-hidden');}},2000);
$('room-notifications').hidden=true;
const brand=document.querySelector('.topbar .brand');if(brand){brand.tabIndex=0;brand.setAttribute('role','button');brand.setAttribute('aria-label',t('Home'));brand.onclick=e=>{e.preventDefault();$('nav-home').click();};brand.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();$('nav-home').click();}};}
icon($('nav-friends'),'person-add',t('Friends'));icon($('people-button'),'people',t('Participants'));icon($('resync'),'refresh',t('Force sync'));icon($('focus-call'),'focus',t('Focus call'));

const bufferLabel=document.createElement('label');bufferLabel.className='switch-row';bufferLabel.textContent=t('Pause together while buffering');const bufferSwitch=document.createElement('input');bufferSwitch.type='checkbox';bufferSwitch.role='switch';bufferSwitch.id='buffer-together';bufferSwitch.checked=true;bufferLabel.append(bufferSwitch);$('room-host-settings').append(bufferLabel);bufferSwitch.onchange=()=>send('buffer-policy',{enabled:bufferSwitch.checked});
setInterval(()=>{bufferSwitch.checked=room?.bufferTogether!==false;bufferSwitch.disabled=room?.hostId!==me;if(bufferReported&&usesEmbed(room?.source)&&socket?.readyState===WebSocket.OPEN)send('buffering',{sourceId,buffering:!document.hidden&&ytReady&&yt.getPlayerState()===3});},4000);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&bufferReported)reportBuffer(false);else if(!document.hidden&&room?.source){ping();settleUntil=Date.now()+600;applyPlayback(false);}});



document.addEventListener('visibilitychange',()=>{if(document.hidden)heartbeat.pause();else{heartbeat.resume();if(room&&navigator.onLine){ping();if(socket?.readyState>=2)scheduleReconnect();}}});
setInterval(()=>{if(document.hidden||suspended||!room||socket?.readyState!==WebSocket.OPEN||!navigator.onLine)return;const action=heartbeat.poll();if(action==='probe'){connectionStatus('checking');ping();}else if(action==='reconnect')socket.close(4001,'Heartbeat response timeout');},3000);

function roomFriendAction(person,button){const request=friendRequests.find(q=>[q.from,q.to].includes(person.id)&&[q.from,q.to].includes(me)&&q.status!=='declined');button.disabled=false;
 if(request?.status==='accepted'){icon(button,'message',t('Message')+' '+person.name);button.onclick=()=>{setRecipient(person);conversation('chat');};}
 else if(request?.status==='pending'&&request.from===me){icon(button,'check',t('Friend request sent'));button.disabled=true;}
 else if(request?.status==='pending'){icon(button,'person-add',t('Review friend request'));button.onclick=()=>{renderRoomFriends();$('room-friends-dialog').append($('room-friend-list'));$('room-friends-dialog').showModal();};}
 else{icon(button,'person-add',t('Add friend')+': '+person.name);button.onclick=()=>send('friend-request',{target:person.id});}
}

document.addEventListener('xparty:localized',()=>{pttLabel.firstChild.textContent=t('Enable push to talk');bufferLabel.firstChild.textContent=t('Pause together while buffering');renderPushToTalk();});
for(const details of document.querySelectorAll('details.info')){
 let timer;const closeSoon=()=>{clearTimeout(timer);if(details.open)timer=setTimeout(()=>{const focused=document.activeElement;if(details.contains(focused)&&focused!==details.querySelector('summary')){closeSoon();return;}details.open=false;},4000);};
 details.addEventListener('toggle',closeSoon);details.addEventListener('pointerenter',()=>clearTimeout(timer));details.addEventListener('pointerleave',closeSoon);document.addEventListener('pointerdown',e=>{if(!details.contains(e.target)){details.open=false;clearTimeout(timer);}});
}

// Labeled view controls share the upper corner; focus stays with playback tools.
const conversationTabs=document.querySelector('.conversation-tabs');conversationTabs.append($('call-controls-toggle'));$('player-shell').querySelector('.player-bar').append($('focus-call'));
icon($('call-controls-toggle'),'menu',t('Call controls'));icon($('notification-return'),'room',t('Return to room'));icon($('return-room'),'room',t('Return to room'));
$('room-settings-button').hidden=true;$('auto-sync').closest('label').hidden=true;
$('settings-dialog').addEventListener('toggle',()=>{if($('settings-dialog').open){populateSettings();document.dispatchEvent(new Event('xparty:localized'));}});

localize();

$('join-button').textContent=t('Join');const gate=document.createElement('span');gate.className='join-gate';gate.setAttribute('aria-hidden','true');gate.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V4h12v17M3 4l8-2v20l-8-1M15 21h6M15 12h7m-3-3 3 3-3 3"/><path d="M8 12h1"/></svg>';$('join-button').append(gate);
// Keep tabs and call actions in one compact header.
icon($('call-controls-toggle'),'menu',t('Show call controls'));

// Persistent participant/action row shared by Chat, Call and Both views.
const participantStrip=document.createElement('div');participantStrip.className='participant-strip';const participantHeading=document.querySelector('.call-panel .panel-title h2');participantStrip.append(participantHeading,document.querySelector('.call-seat-row'));swipePanel.insertBefore(participantStrip,conversationTabs.nextSibling);document.querySelector('.call-panel .panel-title').hidden=true;$('call-controls-toggle').hidden=true;callPanel.classList.remove('call-controls-hidden');
const viewMenu=document.createElement('span');icon(viewMenu,'menu',t('Video call, Chat or Both'));viewMenu.className+=' view-menu-icon';viewMenu.setAttribute('aria-hidden','true');conversationTabs.prepend(viewMenu);
const sendButton=$('chat-form').querySelector('[type=submit]');icon(sendButton,'send',t('Send message'));
icon($('resync'),'sync',t('Force sync'));
let localReplay=false;
const replay=document.createElement('button');replay.id='replay-video';replay.type='button';icon(replay,'refresh',t('Replay'));$('resync').before(replay);replay.onclick=async()=>{if(!room?.source)return;if(isLiveSource(room.source))return toast('Live streams cannot replay.');if(isCompanion(room.source)){if(room.hostId===me||room.mode==='SHARED_CONTROL')command(true,0);else toast('Use Force sync to rejoin the room timeline.');return;}await unlockAudio();if(room.hostId===me||room.mode==='SHARED_CONTROL'){localReplay=false;command(true,0);}else{reportBuffer(false);localReplay=true;localPaused=false;suppressUntil=Date.now()+1200;if(usesEmbed(room.source)&&ytReady){yt.seekTo(0,true);yt.playVideo();}else{if(nativePlayback())nativeVideo.seek(0);else filePlayer.currentTime=0;playLocalVideo().catch(()=>{});}toast(t('Replaying on this device. Force sync returns to the party.'));}};
$('resync').addEventListener('click',()=>{if(localReplay){localReplay=false;applyPlayback(true);}});
$('preview').textContent=t('Peek into the party hall');const peek=document.createElement('span');peek.className='peek-eyes';peek.textContent='👀';$('preview').prepend(peek);
const profileSettings=document.createElement('details');profileSettings.className='settings-section';const profileHeading=document.createElement('summary');profileHeading.textContent=t('Profile settings');profileSettings.append(profileHeading,$('open-profile'));$('settings-dialog').querySelector('.dialog-heading').after(profileSettings);


$('open-profile').addEventListener('click',()=>$('settings-dialog').close());

// Requested participant tools, kept independent of media transport.
document.querySelector('.call-seat-row').append($('focus-call'));
let selfLarge=false;const swapCamera=document.createElement('button');swapCamera.id='swap-camera-view';swapCamera.type='button';icon(swapCamera,'swap',t('Swap camera view'));document.querySelector('.call-seat-row').append(swapCamera);swapCamera.onclick=()=>{selfLarge=!selfLarge;$('participants').classList.toggle('self-large',selfLarge);swapCamera.setAttribute('aria-pressed',String(selfLarge));};
icon($('back-video'),'return-video',t('Back to video'));
const watchButtons=[...views.querySelectorAll('button')];views.setAttribute('role','group');views.setAttribute('aria-label',t('Watch view'));for(const button of watchButtons){const original=button.onclick;button.onclick=()=>{original();for(const other of watchButtons)other.setAttribute('aria-pressed',String(other===button));};}watchButtons[0].setAttribute('aria-pressed','true');
// Speaker switches control actual playback and call audio, independently.
let playbackSpeakerOn=true;const playbackSpeaker=document.createElement('button');playbackSpeaker.id='playback-speaker';playbackSpeaker.type='button';icon(playbackSpeaker,'volume',t('Playback sound'));playbackSpeaker.setAttribute('aria-pressed','true');const playbackRow=$('movie-volume').closest('label');playbackRow.append(playbackSpeaker);playbackSpeaker.onclick=async()=>{await unlockAudio();playbackSpeakerOn=!playbackSpeakerOn;playbackSpeaker.setAttribute('aria-pressed',String(playbackSpeakerOn));applyPlaybackSound();};
function applyPlaybackSound(){const volume=playbackSpeakerOn?movieVolume:0;nativeVideo.setVolume(volume);if(movieGain)movieGain.gain.value=volume;else filePlayer.volume=volume;if(ytReady)yt.setVolume(volume*100);}
$('movie-volume').addEventListener('input',applyPlaybackSound);const originalUnlock=unlockAudio;unlockAudio=async()=>{await originalUnlock();applyPlaybackSound();};
const callSpeaker=document.createElement('button');callSpeaker.id='call-speaker';callSpeaker.type='button';icon(callSpeaker,'volume',t('Call sound'));callSpeaker.onclick=()=>{$('speaker').click();};$('call-volume').closest('label').append(callSpeaker);new MutationObserver(()=>callSpeaker.setAttribute('aria-pressed',$('speaker').getAttribute('aria-pressed')||'true')).observe($('speaker'),{attributes:true,attributeFilter:['aria-pressed']});callSpeaker.setAttribute('aria-pressed',String(speakerOn));
playbackRow.append(document.querySelector('.sound-info'));const diagnostics=document.querySelector('.audio-diagnostic-panel');diagnostics.querySelector('summary').textContent='i';diagnostics.querySelector('summary').setAttribute('aria-label',t('Device audio info'));const callSettings=$('settings-call-volume').closest('label');callSettings.append(diagnostics);
// Approved PTT is a large floating hold control; mic buttons retain activity feedback.
pttOverlay=document.createElement('div');pttOverlay.id='ptt-overlay';pttOverlay.hidden=true;const pttClose=document.createElement('button');pttClose.type='button';icon(pttClose,'close',t('Close'));pttClose.onclick=()=>{stopPushToTalk();pttOverlay.hidden=true;};pttOverlay.append(pttClose,pttButton);document.body.append(pttOverlay);pttLaunch=document.createElement('button');pttLaunch.id='ptt-launch';pttLaunch.type='button';icon(pttLaunch,'mic',t('Push to talk'));pttLaunch.hidden=true;document.querySelector('.call-seat-row').append(pttLaunch);pttLaunch.onclick=openPushToTalk;
function openPushToTalk(){const self=room?.people.find(p=>p.id===me);if(!room?.pttEnabled||!self)return;if(self.micBlocked)return toast(t('The host has muted your microphone.'));if(room.hostId!==me&&!self.pttApproved){send('ptt-request');return toast(t('Push to talk pending'));}if(!self.inCall){send('call-join');return toast(t('Join a call seat, then hold to talk.'));}pttOverlay.hidden=false;pttButton.hidden=false;pttButton.focus();}
// Use the already-authorized local track for voice activity, never a second microphone capture.
let voiceTrack,voiceSource,voiceAnalyser;const voiceSamples=new Float32Array(256);setInterval(()=>{const track=localStream.getAudioTracks().find(t=>t.enabled&&t.readyState==='live');if(document.hidden||!track||!audioContext){voiceSource?.disconnect();voiceTrack=null;voiceAnalyser=null;for(const b of[$('mic'),pttButton])b.classList.remove('mic-speaking');return;}if(track!==voiceTrack){voiceSource?.disconnect();voiceTrack=track;voiceSource=audioContext.createMediaStreamSource(new MediaStream([track]));voiceAnalyser=audioContext.createAnalyser();voiceAnalyser.fftSize=256;voiceSource.connect(voiceAnalyser);}voiceAnalyser.getFloatTimeDomainData(voiceSamples);const level=Math.sqrt(voiceSamples.reduce((sum,x)=>sum+x*x,0)/voiceSamples.length);for(const b of[$('mic'),pttButton]){b.classList.toggle('mic-speaking',level>.018);b.style.setProperty('--voice-glow',Math.min(1,level*8));}},120);
// Reveal on a NEW downward gesture that starts after arriving at the document top.
let headerGesture;document.addEventListener('touchstart',e=>{if(!room||e.touches.length!==1||e.target.closest('.messages,dialog,input,button,[role=separator]')){headerGesture=null;return;}headerGesture={y:e.touches[0].clientY,atTop:window.scrollY<=1};},{passive:true});document.addEventListener('touchmove',e=>{if(headerGesture?.atTop&&e.touches[0].clientY-headerGesture.y>50){revealHeader();headerGesture=null;}},{passive:true});document.addEventListener('touchend',()=>headerGesture=null,{passive:true});addEventListener('wheel',e=>{if(room&&window.scrollY<=1&&e.deltaY<0&&!e.target.closest('.messages,dialog'))revealHeader();},{passive:true});
// Once-per-device guide: short, optional and inside the product.
function showRoomGuide(){if(preview||!room)return;try{if(localStorage.getItem('xparty-room-guide-v1'))return;localStorage.setItem('xparty-room-guide-v1','shown');}catch{}const guide=document.createElement('dialog');guide.id='room-guide';guide.className='settings-dialog';const title=document.createElement('h2');title.textContent=t('Your first party');guide.append(title);for(const text of ['Share the room code privately.','The host chooses who controls playback. Force sync catches you up.','Swipe between Video call and Chat. Mic and camera are always your choice.','The host can enable and approve push to talk in Participants.']){const p=document.createElement('p');p.textContent=t(text);guide.append(p);}const done=document.createElement('button');done.type='button';done.className='primary';done.textContent=t('Got it');done.onclick=()=>{guide.close();guide.remove();};guide.append(done);document.body.append(guide);guide.showModal();}

members.append($('rename'));$('call-seats').setAttribute('aria-label',t('Call seats'));


// The Friends tab includes guest requests; the top Messages button stays account-private.
window.addEventListener('xparty:social-view',e=>{const box=$('room-friend-list');if(e.detail==='friends'&&room){renderRoomFriends();$('guest-friends').append(box);$('guest-friends').hidden=false;}else{$('room-friends-dialog').append(box);$('guest-friends').hidden=true;}});
let captionsEnabled=false;
const captionsButton=document.createElement('button');captionsButton.id='captions-toggle';captionsButton.className='quiet';captionsButton.type='button';
function applyCaptions(){
 captionsButton.textContent='CC '+(captionsEnabled?'On':'Off');captionsButton.setAttribute('aria-pressed',String(captionsEnabled));captionsButton.setAttribute('aria-label','Closed captions '+(captionsEnabled?'on':'off'));
 if(room?.source?.type==='youtube'){if(captionsEnabled)yt?.loadModule?.('captions');else yt?.unloadModule?.('captions');}
 else for(const track of $('file-player').textTracks)track.mode=captionsEnabled?'showing':'disabled';
}
captionsButton.onclick=()=>{if(!room?.source){toast('Choose a video first.');return;}if(room.source.type==='vimeo'){toast('Use the captions menu inside the Vimeo player.');return;}if(room.source.type!=='youtube'&&!$('file-player').textTracks.length){toast('This video has no caption tracks.');return;}captionsEnabled=!captionsEnabled;applyCaptions();};
$('resync').before(captionsButton);applyCaptions();
$('file-player').addEventListener('loadedmetadata',applyCaptions);

// Individual call tiles can float without changing the room panel sizing.
function ensureParticipantPip(tile,person){
 if(tile.querySelector('.tile-pip'))return;
 const button=actionIcon('Float video for '+person.name,'expand',()=>{tile.classList.toggle('floating-participant');const floating=tile.classList.contains('floating-participant');button.setAttribute('aria-pressed',String(floating));if(floating){tile.style.setProperty('--tile-left',Math.max(8,innerWidth-190)+'px');tile.style.setProperty('--tile-top','80px');tile.style.setProperty('--tile-width','180px');tile.style.setProperty('--tile-height','240px');}else for(const property of ['--tile-left','--tile-top','--tile-width','--tile-height'])tile.style.removeProperty(property);});button.classList.add('tile-pip');button.setAttribute('aria-pressed','false');tile.append(button);
 const handle=document.createElement('button');handle.className='tile-move';handle.type='button';handle.textContent='⠿';handle.setAttribute('aria-label','Move floating participant video');tile.append(handle);
 const resize=document.createElement('button');resize.className='tile-resize';resize.type='button';resize.textContent='↘';resize.setAttribute('aria-label','Resize floating participant video');tile.append(resize);
 for(const [control,sizing]of[[handle,false],[resize,true]]){let drag;control.onpointerdown=e=>{if(!tile.classList.contains('floating-participant'))return;e.preventDefault();const r=tile.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top,width:r.width,height:r.height};control.setPointerCapture(e.pointerId);};control.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(sizing){tile.style.setProperty('--tile-width',Math.max(140,Math.min(innerWidth-drag.left-8,drag.width+dx))+'px');tile.style.setProperty('--tile-height',Math.max(180,Math.min(innerHeight-drag.top-8,drag.height+dy))+'px');}else{tile.style.setProperty('--tile-left',Math.max(8,Math.min(innerWidth-drag.width-8,drag.left+dx))+'px');tile.style.setProperty('--tile-top',Math.max(8,Math.min(innerHeight-drag.height-8,drag.top+dy))+'px');}};control.onpointerup=control.onpointercancel=()=>{drag=null;};control.onkeydown=e=>{const directions={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};if(!directions[e.key]||!tile.classList.contains('floating-participant'))return;e.preventDefault();const r=tile.getBoundingClientRect(),[dx,dy]=directions[e.key];if(sizing){tile.style.setProperty('--tile-width',Math.max(140,Math.min(innerWidth-r.left-8,r.width+dx))+'px');tile.style.setProperty('--tile-height',Math.max(180,Math.min(innerHeight-r.top-8,r.height+dy))+'px');}else{tile.style.setProperty('--tile-left',Math.max(8,Math.min(innerWidth-r.width-8,r.left+dx))+'px');tile.style.setProperty('--tile-top',Math.max(8,Math.min(innerHeight-r.height-8,r.top+dy))+'px');}};
 }
}
window.addEventListener('resize',()=>{for(const tile of document.querySelectorAll('.floating-participant')){const r=tile.getBoundingClientRect();tile.style.setProperty('--tile-width',Math.min(r.width,innerWidth-16)+'px');tile.style.setProperty('--tile-height',Math.min(r.height,innerHeight-16)+'px');tile.style.setProperty('--tile-left',Math.max(8,Math.min(r.left,innerWidth-Math.min(r.width,innerWidth-16)-8))+'px');tile.style.setProperty('--tile-top',Math.max(8,Math.min(r.top,innerHeight-Math.min(r.height,innerHeight-16)-8))+'px');}});
const roomExit=actionIcon('Exit room','leave',()=>leave());roomExit.id='room-exit';document.querySelector('.room-actions').append(roomExit);


initDiscovery({base,send,join:code=>{if(room&&room.code!==code){toast('Leave your current room before joining another party.');return;}$('code').value=code;$('code').dispatchEvent(new Event('input'));$('join-form').requestSubmit();}});

const subtitles=initSubtitles({getContext:()=>({room,video:filePlayer}),onLoaded:()=>{captionsEnabled=true;applyCaptions();},notify:toast});

// Visible playback reports support room-scoped shared watching history.
setInterval(()=>{if(room&&!preview&&socket?.readyState===WebSocket.OPEN)send('watch-heartbeat',{sourceId,active:!document.hidden&&!localPaused&&isPlaying()});},3000);
window.addEventListener('pagehide',()=>{if(room&&!preview&&socket?.readyState===WebSocket.OPEN)send('watch-heartbeat',{sourceId,active:false});});
providerUI=initProviderUI({getContext:()=>({room,me}),companion,base});
roomDesign=initRoomDesign({getContext:()=>({room,me})});
roomInteractions=initRoomInteractions({getContext:()=>({room,me,token,source:xpartyUI?.local?.source||room?.source}),send,notify:toast,base,profiles:memberProfiles,friendAction:roomFriendAction,refreshAudio:()=>{for(const p of peers.values())attachRemoteAudio(p);},conversation,icon});
fullscreen=initFullscreen({getContext:()=>({room,me}),notify:toast,nativeVideo});
suggestions=initSuggestions({getContext:()=>({room,me,token}),base,send,notify:toast});
iptv=initIPTV({getContext:()=>({room,me}),send,notify:toast,retry:()=>{if(room?.source?.type==='iptv')applySource(room.source);},goLive:()=>{if(room?.source?.type!=='iptv')return;if(nativePlayback())applySource(room.source);else iptvPlayer?.goLive();}});
initExperience({getContext:()=>({room,me}),notify:toast});
initSettingsDesign();
xpartyUI=initXpartyUI({getContext:()=>({room,me}),send,notify:toast,onLocalChange:state=>{if(state===true){wasLocalPaused=localPaused;localPaused=true;if(usesEmbed(room?.source)&&ytReady)yt.pauseVideo();else pauseLocalVideo();}else if(state===false){localPaused=wasLocalPaused;applyPlayback(true);}ambient.update();roomInteractions?.update();callExperience?.update();playbackData?.update();}});
initWorldHome();
window.addEventListener('xparty:native-selection',()=>{if(navigator.userAgent.includes('XpartyAndroid/'))setTimeout(()=>ambient.update(),0);});

window.addEventListener('xparty:profile-saved',e=>setEntryNickname(e.detail.display_name));

callExperience=initCallExperience({getContext:()=>({room,me}),send,notify:toast,conversation,icon,startCamera:()=>{if(!localStream.getVideoTracks().some(t=>t.readyState==='live'))toggleMedia('video');}});
applyBranding();

playbackData=initPlaybackData({getContext:()=>({source:xpartyUI?.local?.source||room?.source,player:xpartyUI?.local?null:iptvPlayer,native:!xpartyUI?.local&&nativeVideo.active})});
