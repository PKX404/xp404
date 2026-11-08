import {providerMark} from './auth-provider-icons.js';
import {registerRoomEntry,finishRoomEntry,signedInRoomEntry} from './room-entry.js';
import {MAX_VIDEO_BYTES} from './limits.js';
import {createAccountGate,accountRoute} from './account-gate.js';
import {createAccountRepo} from '/xparty/account-repo.js';
// Optional account layer. Guest rooms have no dependency on the auth provider.
const $=id=>document.getElementById(id),base=(window.XPARTY_CONFIG?.backendUrl||location.origin).replace(/\/$/,'');
let accountGeneration=0,otpChallenge=null;
let googleAvailable=null;
let repo,client,session,friend=null,pollBusy=false,call=null,pc=null,stream=null,signalAfter=0,pendingIce=[],signalBusy=false;let photoData=null;
const status=text=>$('account-status').textContent=text;
const gate=createAccountGate({verify:async token=>{const response=await fetch(base+'/api/accounts/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const data=await response.json();if(!response.ok){const error=new Error(data.error||'Unable to verify sign-in.');error.status=response.status;throw error;}return data.user;},onChange:state=>{
 accountGeneration++;delete $('friends-list').dataset.signature;document.documentElement.dataset.accountState=state.status;
 $('account-profile').hidden=state.status!=='authenticated';$('auth-form').hidden=state.status==='authenticated'||state.status==='loading';
 if(state.status!=='authenticated'&&state.status!=='loading'){clearProfileFields();$('direct-input').value='';$('friend-id').value='';$('google-results').replaceChildren();window.dispatchEvent(new Event('xparty:account-cleared'));friend=null;$('direct-chat').hidden=true;$('direct-messages').replaceChildren();$('friends-list').replaceChildren();delete $('friends-list').dataset.signature;delete $('direct-messages').dataset.signature;$('friend-code').textContent='';$('profile-name').value='';$('profile-age').value='';photoData=null;showPhoto();if(state.status==='anonymous')sessionStorage.removeItem('xparty-google-token');if(call)run(()=>endCall(false));}
 if(state.status==='loading')status('Checking your sign-in...');else if(state.status==='error')status(state.message||'Unable to verify sign-in. Try again.');else if(state.status==='anonymous')status(state.message||'Sign in to open your saved profile, friends and messages. Guest rooms are still available.');
 if(state.status==='authenticated'){const enteringRoom=signedInRoomEntry();const route=gate.takePending()||accountRoute(sessionStorage.getItem('xparty.auth.return'));sessionStorage.removeItem('xparty.auth.return');if(!enteringRoom&&route&&sessionStorage.getItem('xparty.oauth.started')==='true'){sessionStorage.removeItem('xparty.oauth.started');if(!$('account-dialog').open)$('account-dialog').showModal();showSocialView(route);}else if(!enteringRoom&&route&&$('account-dialog').open)showSocialView(route);if(enteringRoom)sessionStorage.removeItem('xparty.oauth.started');run(refreshProfile);}
}});
registerRoomEntry(()=>gate.state.status==='authenticated');
function acceptSession(next){if(session?.user?.id&&next?.user?.id!==session.user.id)gate.clear();session=next;if(next?.provider_token)sessionStorage.setItem('xparty-google-token',next.provider_token);return gate.setSession(next);}

async function run(fn){try{await fn();}catch(e){if(e.code!=='ACCOUNT_CHANGED')status(e.message||'Account action failed. Try again.');}}
function check(result){if(result.error)throw result.error;return result.data;}
function button(text,action){const b=document.createElement('button');b.className='secondary';b.textContent=text;b.onclick=()=>run(async()=>{b.disabled=true;try{requireAccount();await action();}finally{b.disabled=false;}});return b;}
function publicName(user){return user.user_metadata?.full_name?.slice(0,24)||'Friend '+user.id.slice(0,5);}
// Original Xparty identity screen: existing email/phone OTP stays as-is.
// All social sign-ins use real Supabase OAuth; unavailable providers never impersonate a session.
const AUTH_PROVIDERS=[
 {id:'facebook',title:'Facebook',short:'f'},
 {id:'twitter',title:'X',short:'𝕏'},
 {id:'google',title:'Google',short:'G'},
 {id:'vk',title:'VK',short:'vk'},
 {id:'apple',title:'Apple',short:'A'}
];
const socialButtons=new Map(), providerAvailability=new Map();
const providerGroup=document.createElement('div');providerGroup.className='auth-provider-grid';providerGroup.setAttribute('role','group');providerGroup.setAttribute('aria-label','Sign in with a connected account');
for(const provider of AUTH_PROVIDERS){
 const item=document.createElement('button');item.type='button';item.className='auth-provider auth-provider-'+provider.id;
 item.dataset.provider=provider.id;item.setAttribute('aria-label','Continue with '+provider.title);
 const mark=providerMark(provider);
 const label=document.createElement('small');label.textContent=provider.title;item.append(mark,label);
 item.onclick=()=>run(()=>signInProvider(provider.id));
 socialButtons.set(provider.id,item);providerGroup.append(item);
}
const authChoice=document.createElement('button');authChoice.type='button';authChoice.id='auth-email-toggle';authChoice.className='auth-email-toggle';authChoice.textContent='Continue with email or phone';authChoice.setAttribute('aria-expanded','false');
const methodBox=document.createElement('div');methodBox.className='auth-method-box';methodBox.id='auth-method-box';methodBox.hidden=true;
const authMethods=$('auth-form');
const legal=authMethods.querySelector('#privacy-consent')?.closest('label');
const authFields=[...authMethods.children].filter(child=>child!==legal);
methodBox.append(...authFields);
authMethods.prepend(providerGroup,authChoice,methodBox);
// Sign-in details use a dedicated mobile sheet instead of a cramped expanding card.
const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='auth-method-scrim';backdrop.hidden=true;backdrop.tabIndex=-1;backdrop.setAttribute('aria-label','Close sign-in sheet');
methodBox.before(backdrop);
methodBox.setAttribute('role','region');methodBox.setAttribute('aria-label','Sign in with email or phone');
const sheetHeader=document.createElement('div');sheetHeader.className='auth-sheet-header';
const sheetHeading=document.createElement('div');
sheetHeading.innerHTML='<small>WELCOME TO XPARTY</small><h3>Continue your party</h3><p>One secure code. No password to remember.</p>';
const sheetClose=document.createElement('button');sheetClose.type='button';sheetClose.className='auth-sheet-close';sheetClose.textContent='×';sheetClose.setAttribute('aria-label','Close sign-in');
sheetHeader.append(sheetHeading,sheetClose);methodBox.prepend(sheetHeader);
const methods=document.createElement('div');methods.className='auth-method-tabs';methods.setAttribute('role','group');methods.setAttribute('aria-label','Choose sign-in method');
const emailTab=document.createElement('button');emailTab.type='button';emailTab.textContent='✉  Email';emailTab.dataset.method='email';
const phoneTab=document.createElement('button');phoneTab.type='button';phoneTab.textContent='◈  Phone';phoneTab.dataset.method='phone';
methods.append(emailTab,phoneTab);sheetHeader.after(methods);
const sheetFeedback=document.createElement('p');sheetFeedback.className='auth-sheet-feedback';sheetFeedback.setAttribute('role','status');methodBox.append(sheetFeedback);
const sheetLegal=document.createElement('label');sheetLegal.className='auth-sheet-consent';
const sheetLegalInput=document.createElement('input');sheetLegalInput.type='checkbox';
sheetLegal.append(sheetLegalInput,document.createTextNode(' I am 18 or older and agree to the privacy notice.'));methodBox.append(sheetLegal);
function syncSheetLegal(){sheetLegalInput.checked=!!$('privacy-consent').checked;}
sheetLegalInput.addEventListener('change',()=>{$('privacy-consent').checked=sheetLegalInput.checked;});
$('privacy-consent').addEventListener('change',syncSheetLegal);
function syncMethod(){
 const method=$('auth-method').value,phoneSupported=!$('auth-method').querySelector('[value=phone]').disabled;
 for(const tab of [emailTab,phoneTab])tab.setAttribute('aria-pressed',String(tab.dataset.method===method));
 phoneTab.disabled=!phoneSupported;
 phoneTab.title=phoneSupported?'Continue with phone number':'Phone sign-in is not configured yet';
 const address=$('auth-address');address.placeholder=method==='phone'?'+91 98765 43210':'name@example.com';
 address.type=method==='phone'?'tel':'email';address.inputMode=method==='phone'?'tel':'email';
 const label=address.closest('label');if(label)label.firstChild.textContent=method==='phone'?'Phone number':'Email address';
}
for(const tab of [emailTab,phoneTab])tab.onclick=()=>{if(tab.disabled)return;$('auth-method').value=tab.dataset.method;syncMethod();$('auth-address').focus();};
function closeSheet(){methodBox.hidden=true;backdrop.hidden=true;authChoice.setAttribute('aria-expanded','false');authChoice.focus({preventScroll:true});}
function openSheet(){methodBox.hidden=false;backdrop.hidden=false;authChoice.setAttribute('aria-expanded','true');syncMethod();syncSheetLegal();sheetFeedback.textContent='';requestAnimationFrame(()=>$('auth-address').focus({preventScroll:true}));}
sheetClose.onclick=closeSheet;backdrop.onclick=closeSheet;
authChoice.onclick=()=>methodBox.hidden?openSheet():closeSheet();
const accountDialog=$('account-dialog');
accountDialog.addEventListener('close',()=>{if(accountDialog.open)return;accountDialog.classList.remove('room-entry-auth');methodBox.hidden=true;backdrop.hidden=true;authChoice.setAttribute('aria-expanded','false');});
accountDialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&!methodBox.hidden){e.stopPropagation();e.preventDefault();closeSheet();}});
new MutationObserver(()=>{if(!methodBox.hidden)sheetFeedback.textContent=$('account-status').textContent;}).observe($('account-status'),{childList:true,characterData:true,subtree:true});
syncMethod();

const availabilityNote=document.createElement('p');availabilityNote.id='auth-provider-note';availabilityNote.className='auth-provider-note';availabilityNote.setAttribute('role','status');availabilityNote.textContent='Choose a provider or continue with email.';
methodBox.before(availabilityNote);
const consentIntro=document.createElement('p');consentIntro.className='auth-consent-intro';consentIntro.textContent='Review the privacy notice before signing in.';legal?.before(consentIntro);
const googleSignIn=socialButtons.get('google');
function syncAccountLanding(){
 const dialog=$('account-dialog');const showing=!authMethods.hidden&&gate.state.status!=='authenticated';
 dialog.classList.toggle('auth-landing',showing);
 if(!showing){methodBox.hidden=true;backdrop.hidden=true;authChoice.setAttribute('aria-expanded','false');}
}
new MutationObserver(syncAccountLanding).observe(authMethods,{attributes:true,attributeFilter:['hidden']});
$('account-dialog').addEventListener('toggle',syncAccountLanding);
function isAndroidWebView(){return /; wv\)|\bwv\b|Version\/[^ ]+ Chrome\//i.test(navigator.userAgent) || Boolean(window.XPARTY_ANDROID_APP);}
function providerReason(provider){
 if(provider==='vk')return 'VK sign-in needs a dedicated VK ID integration. It has not been configured for Xparty.';
 if(providerAvailability.get(provider)===false)return provider==='twitter'?'X sign-in needs credentials in Supabase Auth.':'Sign-in with '+AUTH_PROVIDERS.find(p=>p.id===provider)?.title+' has not been enabled by the Xparty administrator.';
 return null;
}
async function signInProvider(provider){
 if(!client)throw Error('Account connection is unavailable. You can still enter as a guest.');
 if(!$('privacy-consent').checked)throw Error('Confirm the eligibility and privacy notice before signing in.');
 const unavailable=providerReason(provider);
 if(unavailable){availabilityNote.textContent=unavailable;status(unavailable);return;}
 // Google forbids account sign-in inside embedded Android WebViews.
 // The Android wrapper routes non-Xparty HTTPS URLs to the system browser.
 const embeddedAndroid=isAndroidWebView();
 if(embeddedAndroid&&provider!=='google'){
  const message='Use email or phone to sign in. This social provider requires a separate native browser return flow.';
  availabilityNote.textContent=message;status(message);return;
 }
 const button=socialButtons.get(provider);button.disabled=true;
 sessionStorage.setItem('xparty.auth.return','profile');
 sessionStorage.setItem('xparty.oauth.started','true');
 try{
  const result=await client.auth.signInWithOAuth({
   provider,
   options:{
    // PKCE verifier stays in the Xparty WebView origin; never put tokens in a URL.
    redirectTo:location.origin+location.pathname,
    ...(provider==='google'?{queryParams:{prompt:'select_account'}}:{}),
    ...(embeddedAndroid?{skipBrowserRedirect:true}:{})
   }
  });
  const oauth=check(result);
  if(embeddedAndroid){
   if(!oauth?.url)throw Error('Google did not return a sign-in URL. Check the Google provider configuration.');
   const target=new URL(oauth.url);
   const providerHost=new URL(client.supabaseUrl).hostname;
   if(target.protocol!=='https:'||target.hostname!==providerHost||target.pathname!=='/auth/v1/authorize')
    throw Error('Google sign-in returned an unexpected authorization destination.');
   availabilityNote.textContent='Opening secure Google sign-in in your browser. After approval, return to Xparty.';
   // A top-level navigation is intercepted by the native WebView client and opens
   // an external browser, where Google OAuth is allowed.
   location.assign(target.toString());
  }
 }catch(error){sessionStorage.removeItem('xparty.oauth.started');throw error;}
 finally{button.disabled=false;}
}

async function init(){
 const response=await fetch(base+'/api/accounts/config',{cache:'no-store'});if(!response.ok)throw Error('Account connection is unavailable. Reload to retry.');const config=await response.json();
 if(!config.enabled){gate.clear();$('auth-form').hidden=false;for(const control of $('auth-form').querySelectorAll('input,select,button'))control.disabled=true;status('Email and phone sign-in are awaiting provider setup. Guest rooms are ready to use. No account details are collected here until setup is complete.');return;}
 const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.117.2');client=createClient(config.url,config.publicKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
 for(const button of socialButtons.values())button.disabled=false;
 fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.publicKey},signal:AbortSignal.timeout(7000)})
  .then(async response=>{
   if(!response.ok)return;
   const settings=await response.json();
   for(const p of AUTH_PROVIDERS){
    const enabled=p.id==='vk'?false:settings.external?.[p.id]===true;
    providerAvailability.set(p.id,enabled);
    const button=socialButtons.get(p.id);button.dataset.configured=String(enabled);
    button.title=enabled?'Continue with '+p.title:providerReason(p.id);
    if(!enabled)button.setAttribute('aria-description',providerReason(p.id));
   }
   googleAvailable=providerAvailability.get('google');
  }).catch(()=>{availabilityNote.textContent='Provider availability could not be verified. Email sign-in may still work.';});
 repo=createAccountRepo(client,()=>gate.state.status==='authenticated'&&session?.user?.id===gate.state.user?.id?{id:session.user.id,revision:accountGeneration}:null);
 $('auth-method').querySelector('[value=phone]').disabled=!config.phoneEnabled;syncMethod();
 client.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>run(()=>acceptSession(next)),0);});await acceptSession(check(await client.auth.getSession()).session);
 setInterval(()=>run(poll),2500);
}
function clearProfileFields(){for(const key of ['bio','interests','likes','dislikes'])$('profile-'+key).value='';}
function presentProfile(profile){
 $('profile-name').value=profile.display_name;photoData=profile.photo_data||null;showPhoto();
 for(const key of ['bio','interests','likes','dislikes'])$('profile-'+key).value=key==='bio'?profile[key]||'':(profile[key]||[]).join(', ');
 window.dispatchEvent(new CustomEvent('xparty:account-profile',{detail:{...profile,photo:profile.photo_data}}));
}
async function refreshProfile(){
 if(gate.state.status!=='authenticated'||session?.user?.id!==gate.state.user?.id)return;
 const generation=accountGeneration,profile=await repo.ensureProfile(publicName(session.user));if(generation!==accountGeneration)return;
 presentProfile(profile);const details=await repo.privateProfile();if(generation!==accountGeneration)return;
 $('profile-age').value=details?.age||'';$('friend-code').textContent='Your friend ID: '+session.user.id;status('Signed in as '+profile.display_name);await loadFriends();
}
function closeChat(){delete $('direct-messages').dataset.signature;friend=null;$('direct-chat').hidden=true;$('direct-messages').replaceChildren();$('direct-input').value='';}
async function loadFriends(){
 if(!session||gate.state.status!=='authenticated')return;
 const generation=accountGeneration,rows=await repo.friends();if(generation!==accountGeneration)return;
 if(friend&&!rows.some(row=>row.status==='accepted'&&[row.requester,row.addressee].includes(friend.id)))closeChat();
 const list=$('friends-list');
 // Keep keyboard focus and draft state during polling when the list is unchanged.
 const signature=JSON.stringify(rows);if(list.dataset.signature===signature)return;list.dataset.signature=signature;list.replaceChildren();
 if(!rows.length){const empty=document.createElement('p');empty.className='small';empty.textContent='No friends yet. Share your profile ID to connect.';list.append(empty);}
 for(const row of rows){
  const id=row.requester===session.user.id?row.addressee:row.requester,member=row.profile,name=member?.display_name||'Friend';
  const el=document.createElement('div');el.className='friend-row';el.dataset.friendId=id;
  if(member?.photo_data){const avatar=document.createElement('img');avatar.className='friend-avatar';avatar.src=member.photo_data;avatar.alt='';el.append(avatar);}
  const label=document.createElement('span');label.textContent=name+' · '+(row.status==='pending'?(row.requester===session.user.id?'Request sent':'Incoming request'):row.status);el.append(label);
  if(member)el.append(button('Profile',async()=>{const mutual=row.status==='accepted'?await repo.mutualFriends(id):[];if(generation!==accountGeneration)return;window.dispatchEvent(new CustomEvent('xparty:account-member',{detail:{...member,mutualFriends:mutual}}));}));
  if(row.status==='pending'&&row.addressee===session.user.id)el.append(button('Accept',async()=>{await repo.answerFriend(row.id,true);await loadFriends();}),button('Decline',async()=>{await repo.answerFriend(row.id,false);await loadFriends();}));
  if(row.status==='accepted')el.append(button('Chat',async()=>{closeChat();friend={id,name};showSocialView('messages');$('direct-name').textContent=name;$('direct-chat').hidden=false;await loadMessages();$('direct-input').focus();}));
  el.append(button('Remove',async()=>{await repo.removeFriend(row.id);if(friend?.id===id)closeChat();await loadFriends();}));list.append(el);
 }
}
async function loadMessages(){
 if(!friend||!session||gate.state.status!=='authenticated')return;
 const generation=accountGeneration,expectedFriend=friend.id,rows=await repo.messages(expectedFriend);
 if(generation!==accountGeneration||friend?.id!==expectedFriend)return;
 const box=$('direct-messages'),near=box.scrollHeight-box.scrollTop-box.clientHeight<60;
 const signature=expectedFriend+JSON.stringify(rows);if(box.dataset.signature===signature)return;box.dataset.signature=signature;box.replaceChildren();
 for(const row of rows){const p=document.createElement('p');p.className=row.sender===session.user.id?'direct-message own':'direct-message';p.textContent=(row.sender===session.user.id?'You: ':friend.name+': ')+row.body;box.append(p);}if(near)box.scrollTop=box.scrollHeight;
}
async function poll(){if(!session||gate.state.status!=='authenticated'||pollBusy||document.hidden)return;const generation=accountGeneration;pollBusy=true;try{if($('account-dialog').open){await loadFriends();await loadMessages();}if(generation!==accountGeneration)return;if(call){const updated=check(await client.from('xparty_calls').select('*').eq('id',call.id).single());if(generation!==accountGeneration)return;if(updated.status==='ended'){await endCall(false);return;}if(updated.status==='accepted'&&call.status!=='accepted'){call=updated;if(call.caller===session.user.id){await makePeer();await pc.setLocalDescription(await pc.createOffer());await signal({description:pc.localDescription});}}if(pc)await readSignals();}else{const rows=check(await client.from('xparty_calls').select('*').eq('callee',session.user.id).eq('status','ringing').gte('created_at',new Date(Date.now()-60000).toISOString()).order('created_at',{ascending:false}).limit(1));if(generation!==accountGeneration)return;if(rows[0]){call=rows[0];$('friend-call-status').textContent='Incoming private call';$('friend-answer').hidden=false;if(!$('friend-call-dialog').open)$('friend-call-dialog').showModal();}}}finally{pollBusy=false;}}
async function signal(payload){const recipient=call.caller===session.user.id?call.callee:call.caller;check(await client.from('xparty_signals').insert({call_id:call.id,sender:session.user.id,recipient,payload}));}
async function makePeer(){if(pc)return;stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:{width:360,height:480,frameRate:15}});$('friend-self').srcObject=stream;pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});for(const track of stream.getTracks())pc.addTrack(track,stream);pc.onicecandidate=e=>{if(e.candidate)run(()=>signal({candidate:e.candidate.toJSON()}));};pc.ontrack=e=>{$('friend-remote').srcObject=e.streams[0];$('friend-remote').play().catch(()=>{$('friend-call-status').textContent='Tap the remote video to enable call audio.';});};pc.onconnectionstatechange=()=>{$('friend-call-status').textContent=pc?.connectionState||'Call ended';};}
async function readSignals(){if(signalBusy||!call||!pc)return;signalBusy=true;try{const rows=check(await client.from('xparty_signals').select('*').eq('call_id',call.id).eq('recipient',session.user.id).gt('id',signalAfter).order('id'));for(const row of rows){const m=row.payload;if(m.description){await pc.setRemoteDescription(m.description);for(const candidate of pendingIce)await pc.addIceCandidate(candidate);pendingIce=[];if(m.description.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());await signal({description:pc.localDescription});}}else if(m.candidate){if(pc.remoteDescription)await pc.addIceCandidate(m.candidate);else pendingIce.push(m.candidate);}signalAfter=row.id;}}finally{signalBusy=false;}}
async function endCall(notify=true){const current=call;call=null;pc?.close();pc=null;stream?.getTracks().forEach(t=>t.stop());stream=null;signalAfter=0;pendingIce=[];$('friend-self').srcObject=null;$('friend-remote').srcObject=null;$('friend-call-dialog').close();if(notify&&current)check(await client.from('xparty_calls').update({status:'ended'}).eq('id',current.id));}
function requireAccount(){if(gate.state.status!=='authenticated'||!session||gate.state.user?.id!==session.user.id)throw new Error('Sign in to continue.');}
async function google(scopes='openid email profile'){requireAccount();const options={scopes,redirectTo:location.origin+location.pathname,queryParams:{prompt:'consent'}};check(await client.auth.linkIdentity({provider:'google',options}));}
async function googleFetch(url){const token=sessionStorage.getItem('xparty-google-token');if(!token)throw Error('Connect Google to allow access to your playlists and Drive.');const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Google access expired or permission is missing. Reconnect Google.');return r;}
async function libraries(){requireAccount();const token=sessionStorage.getItem('xparty-google-token');if(!token)return google('openid email profile https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/drive.readonly');const box=$('google-results');box.replaceChildren();box.append(button('Reconnect Google permissions',()=>google('openid email profile https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/drive.readonly')));const playlists=await(await googleFetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50')).json();for(const list of playlists.items||[])box.append(button('Playlist: '+list.snippet.title,async()=>{const result=await(await googleFetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId='+encodeURIComponent(list.id))).json();for(const item of result.items||[])if(item.snippet.resourceId?.videoId)window.dispatchEvent(new CustomEvent('xparty:queue',{detail:{videoId:item.snippet.resourceId.videoId,title:item.snippet.title}}));status('Added the first 50 playlist items to your current room, up to its queue limit.');}));const files=await(await googleFetch('https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q:"mimeType contains 'video/' and trashed=false",pageSize:'50',fields:'files(id,name,mimeType,size)'}))).json();for(const file of files.files||[])box.append(button('Share Drive video: '+file.name,async()=>{if(!window.XPARTY_SESSION_STATE?.().isHost)throw Error('Create a room as host before sharing a Drive video.');if(Number(file.size)>MAX_VIDEO_BYTES)throw Error('This file exceeds the 500 MB room limit.');if(!await window.XPARTY_ASK('Share this Drive video with everyone in your current room? It will be temporarily uploaded to the room server.'))return;const response=await googleFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media');const blob=await response.blob();window.dispatchEvent(new CustomEvent('xparty:share-file',{detail:new File([blob],file.name,{type:file.mimeType})}));}));}
for(const id of ['open-profile','open-friends'])$(id).onclick=()=>{$('account-dialog').showModal();};
$('account-guest').textContent='Skip & Continue as Guest';
$('account-guest').onclick=()=>{finishRoomEntry(true);$('account-dialog').close();};
$('send-otp').onclick=()=>run(async()=>{
 if(!client)throw Error('Sign-in is not ready. Try again.');
 if(!$('privacy-consent').checked)throw Error('Confirm that you are 18 or older and have read the privacy notice.');
 const method=$('auth-method').value,address=$('auth-address').value.trim();
 if(!['email','phone'].includes(method))throw Error('Choose email or phone.');
 if(method==='phone'&&!/^\+[1-9]\d{7,14}$/.test(address))throw Error('Use an international phone number, including the country code.');
 if(method==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('Enter a valid email address.');
 $('send-otp').disabled=true;try{check(await client.auth.signInWithOtp({[method]:address}));otpChallenge={method,address};$('otp-step').hidden=false;status('Code requested. Check your '+(method==='phone'?'phone':'email')+'.');}finally{$('send-otp').disabled=false;}
});
$('verify-otp').onclick=()=>run(async()=>{if(!client||!otpChallenge)throw Error('Request a code first.');const token=$('otp-code').value.trim();if(!/^\d{6,10}$/.test(token))throw Error('Enter the code from your email or phone.');$('verify-otp').disabled=true;try{check(await client.auth.verifyOtp({[otpChallenge.method]:otpChallenge.address,token,type:otpChallenge.method==='phone'?'sms':'email'}));$('otp-code').value='';otpChallenge=null;$('otp-step').hidden=true;}finally{$('verify-otp').disabled=false;}});
$('google-library').onclick=()=>run(libraries);
window.XPARTY_SAVE_ACCOUNT_PROFILE=async value=>{requireAccount();const profile=await repo.saveProfile(value);presentProfile(profile);status('Profile saved to your account.');return profile;};
$('save-profile').onclick=()=>run(async()=>{
 requireAccount();const age=$('profile-age').value?Number($('profile-age').value):null;if(age!==null&&(!Number.isInteger(age)||age<18||age>120))throw Error('Age must be between 18 and 120, or leave it blank.');
 const value={display_name:$('profile-name').value,photo:photoData,bio:$('profile-bio').value};for(const key of ['interests','likes','dislikes'])value[key]=$('profile-'+key).value.split(',');
 $('save-profile').disabled=true;try{await window.XPARTY_SAVE_ACCOUNT_PROFILE(value);try{await repo.saveAge(age);}catch(e){if(e.code==='ACCOUNT_CHANGED')throw e;throw Error('Profile saved, but age could not be saved. Try saving again.');}status('Profile saved.');}finally{$('save-profile').disabled=false;}
});
$('add-friend').onclick=()=>run(async()=>{requireAccount();$('add-friend').disabled=true;try{await repo.requestFriend($('friend-id').value.trim());$('friend-id').value='';await loadFriends();status('Friend request sent.');}finally{$('add-friend').disabled=false;}});
let sendingMessage=false;
$('direct-form').onsubmit=e=>{e.preventDefault();if(sendingMessage)return;run(async()=>{
 requireAccount();if(!friend)throw Error('Choose an accepted friend to start chatting.');const recipient=friend.id,body=$('direct-input').value;
 sendingMessage=true;const submit=$('direct-form').querySelector('button');submit.disabled=true;
 try{await repo.sendMessage(recipient,body);if(friend?.id===recipient&&$('direct-input').value===body)$('direct-input').value='';await loadMessages();}finally{sendingMessage=false;submit.disabled=false;}
});};
$('sign-out').onclick=()=>run(async()=>{await endCall().catch(()=>{});check(await client.auth.signOut({scope:'local'}));session=null;gate.clear();sessionStorage.removeItem('xparty.auth.return');sessionStorage.removeItem('xparty-google-token');friend=null;$('direct-chat').hidden=true;if(accountRoute(location.hash))history.replaceState(null,'',location.pathname+location.search);});
$('direct-call').onclick=()=>run(async()=>{requireAccount();if(window.XPARTY_SESSION_STATE?.().inRoom)throw Error('Exit your watch room before starting a private call.');if(call)throw Error('End the current call first.');call=check(await client.from('xparty_calls').insert({caller:session.user.id,callee:friend.id}).select().single());$('friend-answer').hidden=true;$('friend-call-status').textContent='Calling '+friend.name+'…';$('friend-call-dialog').showModal();});
$('friend-answer').onclick=()=>run(async()=>{requireAccount();await makePeer();check(await client.from('xparty_calls').update({status:'accepted'}).eq('id',call.id));$('friend-answer').hidden=true;});$('friend-hangup').onclick=()=>run(()=>endCall());$('friend-remote').onclick=()=>$('friend-remote').play();
$('friend-call-dialog').addEventListener('cancel',e=>{e.preventDefault();run(()=>endCall());});$('friend-call-dialog .close-dialog')?.addEventListener('click',()=>run(()=>endCall()));
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());pc?.close();});run(init);

function showPhoto(){$('profile-photo-preview').hidden=!photoData;$('profile-photo-preview').src=photoData||'';}
$('profile-photo').onchange=()=>run(async()=>{const file=$('profile-photo').files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>1024*1024)throw Error('Choose a JPG, PNG or WebP photo smaller than 1 MB.');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const size=Math.min(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,192,192);bitmap.close();photoData=canvas.toDataURL('image/jpeg',.8);showPhoto();status('Photo ready. Press Save profile to store it.');});
$('remove-photo').onclick=()=>{photoData=null;showPhoto();status('Press Save profile to remove the stored photo.');};
$('delete-account').onclick=()=>run(async()=>{if(!session)return;if(!await window.XPARTY_ASK('Permanently delete your Xparty account, profile, friendships, private messages and call records? This cannot be undone.'))return;await endCall();requireAccount();check(await client.rpc('xparty_delete_my_account'));await client.auth.signOut({scope:'local'}).catch(()=>{});gate.clear();sessionStorage.removeItem('xparty-google-token');session=null;friend=null;photoData=null;$('direct-chat').hidden=true;await refreshProfile();status('Your Xparty account and associated database records were deleted. Guest room data is separate.');});
// Navigation opens distinct destinations without leaving the app.
function showSocialView(view='profile'){
 $('account-dialog').dataset.socialView=view;
 $('account-dialog').querySelector('h2').textContent={profile:'Your profile',friends:'Friends',messages:'Messages'}[view];
 for(const b of document.querySelectorAll('[data-social-view]'))b.setAttribute('aria-selected',b.dataset.socialView===view);
 $('social-view-note').textContent=view==='friends'?'Add a friend by profile ID, or choose someone from your friends.':view==='messages'?'Choose a friend to open your private conversation.':'Your profile and privacy choices.';
 window.dispatchEvent(new CustomEvent('xparty:social-view',{detail:view}));
 if(!$('account-dialog').open)$('account-dialog').showModal();
}
function socialView(view='profile'){
 if(!['profile','friends','messages'].includes(view))return;
 const allowed=gate.request(view);showSocialView(view);
 if(!allowed){sessionStorage.setItem('xparty.auth.return',view);$('account-profile').hidden=true;$('auth-form').hidden=gate.state.status==='loading';status(gate.state.status==='loading'?'Checking your sign-in?':'Sign in to open your saved '+view+'.');}
 if(accountRoute(location.hash)!==view)history.replaceState(null,'',location.pathname+location.search+'#'+view);
}
window.addEventListener('hashchange',()=>{const route=accountRoute(location.hash);if(route)socialView(route);});
if(accountRoute(location.hash))history.replaceState(null,'',location.pathname+location.search);
$('account-dialog').addEventListener('close',()=>{if(accountDialog.open)return;gate.dismiss();sessionStorage.removeItem('xparty.auth.return');if(accountRoute(location.hash))history.replaceState(null,'',location.pathname+location.search);});
for(const b of document.querySelectorAll('[data-social-view]'))b.onclick=()=>socialView(b.dataset.socialView);
$('nav-friends').onclick=()=>socialView('friends');
$('room-add-friend').onclick=()=>{if(window.XPARTY_SESSION_STATE?.().inRoom){window.dispatchEvent(new Event('xparty:room-friends'));return;}socialView('friends');if(!$('friend-id').disabled&&!$('account-profile').hidden)$('friend-id').focus();};
$('nav-messages').onclick=()=>socialView('messages');
$('open-profile').onclick=()=>socialView('profile');$('open-friends').onclick=()=>socialView('friends');



// Optional sign-in opens when entering a room or choosing an account destination.
