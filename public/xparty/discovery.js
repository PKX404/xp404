import {validRoomCode,normalizeRoomCode,roomOccupancy} from './limits.js';
let context={room:null,me:null};
let ui;
const $=id=>document.getElementById(id);
export function updateDiscovery(room,me){
 context={room,me};if(!ui)return;
 ui.invite.disabled=!room||!me;
 if(!ui.settings.open)populate();
}
function populate(){
 const {room,me}=context,host=!!room&&room.hostId===me;
 $('listing-fields').hidden=!host;$('listing-guest-note').hidden=host;
 $('listing-public').checked=room?.visibility==='public';$('listing-title').value=room?.title||'';$('listing-language').value=room?.language||'';
 $('listing-save').hidden=!host;$('listing-status').textContent=room?.visibility==='public'?'Public listing enabled. Locked, full, or host-offline rooms are hidden.':'Private room. Only people with your invitation can join.';
 const link=new URL(location.pathname,location.origin);if(room)link.searchParams.set('room',room.code);$('invite-link').value=room?link.href:'';
}
export function initDiscovery({base,send,join}){
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./discovery.css',import.meta.url);document.head.append(link);
 const panel=document.createElement('section');panel.id='room-directory';panel.className='room-directory';panel.innerHTML='<div class="directory-heading"><div><h2>Find a watch party</h2><p class="small">Join a room whose host has chosen to welcome everyone.</p></div><button class="secondary" id="directory-refresh" type="button">Refresh</button></div><form id="directory-search"><label for="directory-query">Search rooms, videos or languages</label><div class="join-row"><input id="directory-query" maxlength="100" placeholder="Movie night, music, English…"/><button class="secondary" type="submit">Search</button></div></form><p id="directory-status" class="small" role="status">Browse public rooms when you are ready.</p><div id="directory-results" class="directory-results"></div>';
 $('lobby').after(panel);
 // Follow the existing home/room visibility instead of starting background polling.
 const observer=new MutationObserver(()=>{panel.hidden=$('lobby').hidden;});observer.observe($('lobby'),{attributes:true,attributeFilter:['hidden']});panel.hidden=$('lobby').hidden;
 const settings=document.createElement('dialog');settings.id='listing-dialog';settings.className='settings-dialog';settings.innerHTML='<div class="dialog-heading"><h2>Room listing & invite</h2><button class="close-dialog" id="listing-close" type="button" aria-label="Close room listing">×</button></div><div id="listing-fields"><label class="switch-row">List this room publicly<input id="listing-public" type="checkbox" role="switch"/></label><p class="small">A public listing shares your room title, language, YouTube title, member count and join code with anyone. People can join available seats. Keep this off for a private watch party.</p><label>Room title<input id="listing-title" maxlength="80" placeholder="Give your watch party a name"/></label><label>Language (optional)<input id="listing-language" maxlength="24" placeholder="English"/></label></div><p id="listing-guest-note" class="small">The host chooses whether this room is public.</p><p id="listing-status" class="small" role="status"></p><button class="primary" id="listing-save" type="button">Save listing</button><label>Invitation link<input id="invite-link" readonly/></label><button class="secondary" id="invite-copy" type="button">Copy invitation link</button><p id="invite-status" class="small" role="status"></p>';
 document.body.append(settings);
 const invite=document.createElement('button');invite.type='button';invite.className='secondary';invite.textContent='Room listing & invite';invite.disabled=true;document.querySelector('.room-menu-content').append(invite);
 ui={settings,invite};invite.onclick=()=>{document.querySelector('.room-menu').open=false;populate();$('invite-status').textContent='';settings.showModal();};$('listing-close').onclick=()=>settings.close();
 $('listing-save').onclick=()=>{const title=$('listing-title').value.trim();if($('listing-public').checked&&!title){$('listing-status').textContent='Add a room title before listing publicly.';$('listing-title').focus();return;}if(send('room-directory',{visibility:$('listing-public').checked?'public':'private',title,language:$('listing-language').value.trim()})){$('listing-status').textContent='Listing update sent.';settings.close();}};
 $('invite-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);$('invite-status').textContent='Invitation copied.';}catch{$('invite-link').focus();$('invite-link').select();$('invite-status').textContent='Select and copy the invitation above.';}};
 let request=0,abort;
 async function refresh(){
  const version=++request;abort?.abort();abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),15000);$('directory-status').textContent='Finding public rooms…';$('directory-refresh').disabled=true;
  try{const url=new URL('/api/rooms/public',base);const query=$('directory-query').value.trim();if(query)url.searchParams.set('q',query);const res=await fetch(url,{signal:abort.signal,cache:'no-store'});if(!res.ok)throw new Error(res.status===429?'Please wait a moment before refreshing.':'Public rooms are unavailable. Try again.');const data=await res.json();if(version!==request)return;
   const box=$('directory-results');box.replaceChildren();for(const item of data.rooms||[]){if(!validRoomCode(item.code))continue;const card=document.createElement('article');card.className='directory-card';if(/^[\w-]{11}$/.test(item.watching?.videoId)){const img=document.createElement('img');img.src='https://i.ytimg.com/vi/'+item.watching.videoId+'/mqdefault.jpg';img.alt='';img.loading='lazy';card.append(img);}const text=document.createElement('div');const title=document.createElement('h3');title.textContent=item.title;const detail=document.createElement('p');detail.className='small';detail.textContent=[item.language,roomOccupancy(item.people,item.capacity)+' watching',item.watching?.title||'Choosing a video'].filter(Boolean).join(' · ');text.append(title,detail);const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Join party';button.onclick=()=>join(item.code);card.append(text,button);box.append(card);}
   $('directory-status').textContent=box.children.length?'Public rooms with available seats. Availability can change before you join.':query?'No public rooms match your search.':'No public rooms are open right now. Create a room and invite your friends.';
  }catch(error){if(version!==request)return;$('directory-status').textContent=error.name==='AbortError'?'The room directory took too long. Try again.':error.message;$('directory-results').replaceChildren();}
  finally{clearTimeout(timeout);if(version===request)$('directory-refresh').disabled=false;}
 }
 $('directory-search').onsubmit=e=>{e.preventDefault();refresh();};$('directory-refresh').onclick=refresh;
 const invitation=new URL(location.href).searchParams.get('room');if(invitation!==null){const code=normalizeRoomCode(invitation);if(validRoomCode(code)){$('code').value=code;$('code').dispatchEvent(new Event('input'));$('join-status').textContent='Invitation ready. Choose Join to enter this room.';}else $('join-status').textContent='This invitation needs a 7-character room code. Ask the host for a new link.';}
 populate();refresh();setInterval(()=>{if(!document.hidden&&!$('lobby').hidden)refresh();},15000);
}
