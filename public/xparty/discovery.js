import {createRoomPreviews} from './room-previews.js';
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
 const lobby=$('lobby');
 const browseRooms=document.createElement('button');browseRooms.type='button';browseRooms.className='secondary xparty-browse-public';
 browseRooms.textContent='Browse public rooms';browseRooms.setAttribute('aria-controls','room-directory');
 (lobby.querySelector('.entry-card')||lobby).append(browseRooms);
 browseRooms.addEventListener('click',()=>{
  if(panel.hidden)return;
  panel.scrollIntoView({behavior:'instant',block:'start'});
  // Reuse the existing directory refresh control and request cancellation.
  $('directory-refresh')?.click();
 });
 // Follow the existing home/room visibility instead of starting background polling.
 const observer=new MutationObserver(()=>{panel.hidden=$('lobby').hidden;});observer.observe($('lobby'),{attributes:true,attributeFilter:['hidden']});panel.hidden=$('lobby').hidden;
 const settings=document.createElement('dialog');settings.id='listing-dialog';settings.className='settings-dialog';settings.innerHTML='<div class="dialog-heading"><h2>Room listing & invite</h2><button class="close-dialog" id="listing-close" type="button" aria-label="Close room listing">×</button></div><div id="listing-fields"><label class="switch-row">List this room publicly<input id="listing-public" type="checkbox" role="switch"/></label><p class="small">A public listing shares your room title, language, playing video preview, member count and join code with anyone. People can join available seats. Keep this off for a private watch party.</p><label>Room title<input id="listing-title" maxlength="80" placeholder="Give your watch party a name"/></label><label>Language (optional)<input id="listing-language" maxlength="24" placeholder="English"/></label></div><p id="listing-guest-note" class="small">The host chooses whether this room is public.</p><p id="listing-status" class="small" role="status"></p><button class="primary" id="listing-save" type="button">Save listing</button><label>Invitation link<input id="invite-link" readonly/></label><button class="secondary" id="invite-copy" type="button">Copy invitation link</button><p id="invite-status" class="small" role="status"></p>';
 document.body.append(settings);
 const invite=document.createElement('button');invite.type='button';invite.className='secondary';invite.textContent='Room listing & invite';invite.disabled=true;document.querySelector('.room-menu-content').append(invite);
 ui={settings,invite};invite.onclick=()=>{document.querySelector('.room-menu').open=false;populate();$('invite-status').textContent='';settings.showModal();};$('listing-close').onclick=()=>settings.close();
 $('listing-save').onclick=()=>{const title=$('listing-title').value.trim();if($('listing-public').checked&&!title){$('listing-status').textContent='Add a room title before listing publicly.';$('listing-title').focus();return;}if(send('room-directory',{visibility:$('listing-public').checked?'public':'private',title,language:$('listing-language').value.trim()})){$('listing-status').textContent='Listing update sent.';settings.close();}};
 $('invite-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);$('invite-status').textContent='Invitation copied.';}catch{$('invite-link').focus();$('invite-link').select();$('invite-status').textContent='Select and copy the invitation above.';}};
 const previews=createRoomPreviews(),cards=new Map();
 let request=0,abort;
 function render(items){
  const box=$('directory-results'),keep=new Set();
  // Never invent people or timings. Display metadata only when the server provides it.
  const seconds=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
  for(const item of items){
   if(!validRoomCode(item.code)||keep.has(item.code))continue;keep.add(item.code);
   let entry=cards.get(item.code);
   if(!entry){
    const card=document.createElement('article');card.className='directory-card';card.dataset.roomCode=item.code;
    const preview=document.createElement('div');preview.className='directory-preview';
    const fallback=document.createElement('span');fallback.className='directory-preview-fallback';preview.append(fallback);
    const loader=document.createElement('span');loader.className='directory-bubble-loader';loader.setAttribute('aria-hidden','true');loader.innerHTML='<i></i><i></i><i></i>';preview.append(loader);
    const status=document.createElement('span');status.className='directory-preview-status';preview.append(status);
    const timeline=document.createElement('div');timeline.className='directory-preview-timeline';timeline.setAttribute('aria-label','Room playback timeline');
    const fill=document.createElement('span');fill.className='directory-preview-timeline-fill';timeline.append(fill);preview.append(timeline);
    const text=document.createElement('div');text.className='directory-info';
    const title=document.createElement('h3');title.className='directory-title';
    const detail=document.createElement('p');detail.className='directory-detail';
    const memberRow=document.createElement('div');memberRow.className='directory-members';memberRow.setAttribute('aria-label','Participants in room');
    const count=document.createElement('span');count.className='directory-count';
    const more=document.createElement('span');more.className='directory-more';more.hidden=true;
    const people=document.createElement('div');people.className='directory-people';people.setAttribute('aria-label','Room members');
    memberRow.append(people,more,count);
    const button=document.createElement('button');button.type='button';button.className='secondary directory-join';button.textContent='Join';button.onclick=()=>join(item.code);
    const footer=document.createElement('div');footer.className='directory-info-bottom';footer.append(memberRow,button);
    text.append(title,detail,footer);card.append(preview,text);box.append(card);
    entry={card,preview,fallback,title,detail,count,button,poster:null,posterId:null,fill,timeline,people,more,personsKey:''};cards.set(item.code,entry);
   }
   entry.title.textContent=item.watching?.title||item.title||'Public room';entry.button.setAttribute('aria-label','Join '+(item.title||'public room'));
   entry.detail.textContent=[item.title,item.language].filter(Boolean).join(' · ')||'Join the conversation';
   entry.button.title='Join room '+item.code;
   const count=Number(item.people)||0;entry.count.textContent=count+' watching';
   // Profile photos are displayed only when provided for public discovery by the server.
   const participants=Array.isArray(item.participants)?item.participants.slice(0,12):[];
   const key=JSON.stringify(participants.map(p=>[p.id,p.displayName,p.avatarUrl]));
   if(entry.personsKey!==key){
    entry.personsKey=key;entry.people.replaceChildren();
    for(const person of participants.slice(0,5)){
     const avatar=document.createElement('span');avatar.className='directory-person';
     const initials=String(person.displayName||'?').trim().slice(0,1).toUpperCase();avatar.textContent=initials;
     avatar.setAttribute('aria-label','Participant: '+String(person.displayName||'Member').slice(0,40));
     const src=String(person.avatarUrl||'');
     if(/^https:\/\//i.test(src)&&src.length<1024){const img=document.createElement('img');img.loading='lazy';img.referrerPolicy='no-referrer';img.alt='';img.src=src;img.onerror=()=>img.remove();avatar.append(img);}
     entry.people.append(avatar);
    }
   }
   const moreCount=Math.max(0,count-participants.slice(0,5).length);
   entry.more.hidden=moreCount===0;entry.more.textContent='+'+moreCount;
   entry.more.setAttribute('aria-label',moreCount+' more people');
   entry.people.classList.toggle('directory-people-empty',!participants.length);
   const watching=item.watching;
   const duration=Number(watching?.duration),position=Number(watching?.position);
   if(Number.isFinite(duration)&&duration>0&&Number.isFinite(position)&&position>=0){
    const progress=Math.min(100,Math.max(0,position/duration*100));
    entry.fill.style.width=progress+'%';entry.timeline.title=seconds(position)+' / '+seconds(duration);
    entry.timeline.setAttribute('aria-label','Current video '+seconds(position)+' of '+seconds(duration));
    entry.timeline.dataset.known='true';
   }else{entry.fill.style.width='0%';entry.timeline.removeAttribute('data-known');entry.timeline.title='Room progress unavailable';entry.timeline.setAttribute('aria-label','Room video timeline unavailable');}
   entry.fallback.textContent=watching?.title||'Room preview';
   const posterId=(!watching?.type||watching.type==='youtube')&&/^[\w-]{11}$/.test(watching?.videoId||'')?watching.videoId:null;
   if(entry.posterId!==posterId){entry.poster?.remove();entry.poster=null;entry.posterId=posterId;if(posterId){const img=document.createElement('img');img.src='https://i.ytimg.com/vi/'+posterId+'/mqdefault.jpg';img.alt='';img.loading='lazy';img.decoding='async';img.onerror=()=>img.remove();entry.preview.prepend(img);entry.poster=img;}}
   previews.observe(entry.preview,watching);
  }
  for(const [code,entry]of cards)if(!keep.has(code)){previews.remove(entry.preview);entry.card.remove();cards.delete(code);}
  // Preserve card nodes and active previews when reordering; no remount on refresh.
  let next=box.firstElementChild;
  for(const item of items){const entry=cards.get(item.code);if(!entry)continue;
   const {card,preview}=entry;if(card!==next){if(box.moveBefore)box.moveBefore(card,next);else{previews.remove(preview);box.insertBefore(card,next);previews.observe(preview,item.watching);}}next=card.nextElementSibling;
  }
 }
 async function refresh(){
  const version=++request;abort?.abort();const controller=new AbortController();abort=controller;const timeout=setTimeout(()=>controller.abort(),15000);if(!cards.size)$('directory-status').textContent='Finding public rooms…';$('directory-refresh').disabled=true;
  try{
   const url=new URL('/api/rooms/public',base),query=$('directory-query').value.trim();if(query)url.searchParams.set('q',query);
   const res=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!res.ok)throw new Error(res.status===429?'Please wait a moment before refreshing.':'Public rooms are unavailable. Try again.');const data=await res.json();if(version!==request)return;if(!Array.isArray(data.rooms))throw Error('Public rooms are unavailable. Try again.');
   render(data.rooms);
   $('directory-status').textContent=cards.size?'Public rooms · visible video previews play muted.':query?'No public rooms match your search.':'No public rooms are open right now. Create a room to start a watch party.';
  }catch(error){if(version!==request)return;previews.clear();cards.clear();$('directory-results').replaceChildren();$('directory-status').textContent=error.name==='AbortError'?'The room directory took too long. Try again.':error.message;}
  finally{clearTimeout(timeout);if(version===request)$('directory-refresh').disabled=false;}
 }
 $('directory-search').onsubmit=e=>{e.preventDefault();refresh();};$('directory-refresh').onclick=refresh;
 const invitation=new URL(location.href).searchParams.get('room');if(invitation!==null){const code=normalizeRoomCode(invitation);if(validRoomCode(code)){$('code').value=code;$('code').dispatchEvent(new Event('input'));$('join-status').textContent='Invitation ready. Choose Join to enter this room.';}else $('join-status').textContent='This invitation needs a 7-character room code. Ask the host for a new link.';}
 populate();refresh();setInterval(()=>{if(!document.hidden&&!$('lobby').hidden)refresh();},25000);
}
