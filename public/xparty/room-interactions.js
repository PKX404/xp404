const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
const button=(text,fn,cls='')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
export function initRoomInteractions({getContext,send,notify,base,profiles,friendAction,refreshAudio,conversation,icon}){
 const $=id=>document.getElementById(id);let roomCode=null,selected=null,muted=new Set(),blocked=new Set(),requested=null,controller=null,ballotKey='';
 const header=node('header','mobile-room-header');header.setAttribute('aria-label','Watch room');
 for(const [id,label,glyph]of [['nav-home','Home','close'],['nav-settings','Settings','settings'],['brand','Xparty',null],['browse','Quick search and sources','search'],['people-button','Participants','people']]){
   if(id==='brand'){header.append(node('strong','mobile-room-brand','xparty'));continue;}
   const b=id==='people-button'?$(id):button(label,()=>$(id)?.click());icon(b,glyph,label);header.append(b);
 }$('room').prepend(header);
 const countBadge=node('span','participant-count-badge');countBadge.setAttribute('aria-hidden','true');$('people-button').append(countBadge);
 const ticker=node('div','room-comment-ticker');ticker.hidden=true;ticker.setAttribute('aria-hidden','true');$('player-shell').after(ticker);
 const floatingChat=node('div','call-message-overlay');floatingChat.setAttribute('aria-hidden','true');document.querySelector('.call-panel').append(floatingChat);
 const reduced=matchMedia('(prefers-reduced-motion:reduce)'),wide=matchMedia('(orientation:landscape) and (min-width:700px)');
 const commentQueue=[],floatTimers=new Set();let tickerAnimation=null,tickerTimer=null,tickerBusy=false,headerTimer=null,headerKey='';
 function clearTicker(){commentQueue.length=0;clearTimeout(tickerTimer);tickerAnimation?.cancel();tickerBusy=false;ticker.hidden=true;ticker.replaceChildren();}
 function clearMessageEffects(){clearTicker();for(const timer of floatTimers)clearTimeout(timer);floatTimers.clear();floatingChat.replaceChildren();}
 function nextComment(){if(tickerBusy||!commentQueue.length||!getContext().room?.source)return;tickerBusy=true;ticker.hidden=false;const line=node('span','',commentQueue.shift());ticker.replaceChildren(line);
  const done=()=>{tickerBusy=false;ticker.hidden=true;nextComment();};
  if(reduced.matches){tickerTimer=setTimeout(done,4000);return;}
  const distance=ticker.clientWidth+line.scrollWidth;tickerAnimation=line.animate([{transform:'translateX('+ticker.clientWidth+'px)'},{transform:'translateX(-'+line.scrollWidth+'px)'}],{duration:Math.min(12000,Math.max(5000,distance*15)),easing:'linear'});tickerAnimation.onfinish=done;
 }
 function showLiveComment(m,live){const {room,me}=getContext();if(!live||!room||m.from===me||m.to||!m.text||blocked.has(m.from)||document.hidden||$('room').hidden)return;const text=m.name+': '+m.text.slice(0,240);
  if(room.source){if(commentQueue.length>=4)commentQueue.shift();commentQueue.push(text);nextComment();}
  if(document.body.dataset.conversation==='call'){const line=node('p','call-floating-message',text);floatingChat.append(line);while(floatingChat.children.length>3)floatingChat.firstChild.remove();if(!reduced.matches)line.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,offset:.15},{opacity:0,transform:'translateY(-'+Math.max(30,floatingChat.clientHeight-12)+'px)'}],{duration:5500,easing:'ease-out',fill:'forwards'});const timer=setTimeout(()=>{line.remove();floatTimers.delete(timer);},5500);floatTimers.add(timer);}
 }
 function canHideHeader(){const {room}=getContext();return !!room?.source&&room.playback?.playing&&wide.matches&&!document.hidden&&!$('room').hidden&&!document.body.matches('.browsing,.room-people-open,.watch-fullscreen')&&!document.querySelector('dialog[open]')&&!header.contains(document.activeElement);}
 function revealHeader(){document.body.classList.remove('room-header-idle');clearTimeout(headerTimer);if(canHideHeader())headerTimer=setTimeout(()=>{if(canHideHeader())document.body.classList.add('room-header-idle');},3500);}
 document.addEventListener('pointermove',revealHeader,{passive:true});document.addEventListener('pointerdown',revealHeader,{passive:true});document.addEventListener('keydown',revealHeader,true);document.addEventListener('visibilitychange',revealHeader);wide.addEventListener('change',revealHeader);
 const connection=node('div','room-connection-status');connection.setAttribute('role','status');connection.hidden=true;header.after(connection);document.addEventListener('xparty:connection-status',e=>{connection.textContent=e.detail.text;connection.hidden=['connected','idle'].includes(e.detail.state);});
 const lighting=node('p','room-lighting-status');lighting.hidden=true;lighting.setAttribute('role','status');$('watch-stage').after(lighting);
 const frameLayer=document.querySelector('.room-ambient-layer');if(frameLayer)new MutationObserver(()=>{const source=getContext().room?.source;lighting.hidden=source?.type!=='youtube'||['native','video'].includes(frameLayer.dataset.mode);}).observe(frameLayer,{attributes:true,attributeFilter:['data-mode']});
 const callVolume=$('call-volume'),speaker=$('speaker');speaker.classList.add('room-speaker');const speakerLabel=callVolume.closest('label');speakerLabel.prepend(speaker);
 const moreDialog=node('dialog','room-report');moreDialog.setAttribute('aria-label','Call and playback options');moreDialog.append(node('h2','','Room controls'),button('Close',()=>moreDialog.close()));moreDialog.addEventListener('click',e=>{if(e.target.closest('button'))moreDialog.close();});document.body.append(moreDialog);
 const callRow=document.querySelector('.call-seat-row'),more=button('More',()=>moreDialog.showModal(),'room-more-call');icon(more,'more','More call options');callRow.append(more);
 const compact=matchMedia('(min-width:0px)'),moved=[];
 function compactControls(){if(compact.matches){const extras=['captions-toggle','load-subtitles','previous-video','resync','back10','forward10','room-menu'].map($).filter(Boolean);for(const control of [...callRow.children,...extras]){if(['call-seats','call-seat','speaker','expand-call'].includes(control.id)||control===more||control.parentElement===moreDialog)continue;const marker=document.createComment('call control');control.before(marker);moved.push([control,marker]);moreDialog.append(control);}more.hidden=false;}else{for(const [control,marker]of moved.splice(0)){marker.replaceWith(control);}more.hidden=true;moreDialog.close();}}
 compact.addEventListener('change',compactControls);compactControls();
 const pin=node('aside','chat-pinned');pin.setAttribute('aria-label','Pinned message');pin.hidden=true;
 const pinCopy=node('div'),pinLabel=node('small','','PINNED'),pinText=node('blockquote'),unpin=button('×',()=>send('pin-message',{id:null}));unpin.setAttribute('aria-label','Unpin message');pinCopy.append(pinLabel,pinText);pin.append(pinCopy,unpin);$('messages').before(pin);
 const mini=node('dialog','room-mini-profile');mini.setAttribute('aria-label','Participant profile');document.body.append(mini);
 const closeMini=()=>mini.close();mini.addEventListener('click',e=>{if(e.target===mini){const r=mini.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeMini();}});
 function save(){try{sessionStorage.setItem('xparty.room-controls.'+roomCode,JSON.stringify({muted:[...muted],blocked:[...blocked]}));}catch{}refreshAudio();filterMessages();}
 function filterMessages(){for(const el of $('messages').querySelectorAll('[data-sender]'))el.hidden=blocked.has(el.dataset.sender);pin.hidden=!getContext().room?.pinnedQuote||blocked.has(getContext().room.pinnedQuote.from);}
 function open(id){
   const {room,me}=getContext(),person=room?.people.find(p=>p.id===id);if(!person)return;selected=id;
   $('participants-drawer').open=false;mini.replaceChildren();
   const close=button('×',closeMini,'mini-close');close.setAttribute('aria-label','Close participant profile');
   const portrait=button('',()=>{mini.close();profiles.open(person);},'mini-avatar');portrait.setAttribute('aria-label','Open full profile');
   const photo=person.profile?.photo;if(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo||'')&&photo.length<=40000){const img=node('img');img.src=photo;img.alt='';portrait.append(img);}else portrait.textContent=person.name?.slice(0,1).toUpperCase()||'?';
   mini.append(close,portrait,node('h2','',person.name),node('p','mini-role',id===room.hostId?'Room host':'Room participant'));
   const actions=node('div','mini-actions');actions.append(button('Profile',()=>{closeMini();profiles.open(person);}));
   if(id!==me){
     const friend=button('Add friend',()=>{});friendAction(person,friend);friend.addEventListener('click',()=>mini.close());const label=friend.getAttribute('aria-label')||'Add friend';friend.replaceChildren(document.createTextNode(label.replace(': '+person.name,'').replace(' '+person.name,'')));actions.append(friend);
     actions.append(button(muted.has(id)?'Unmute':'Mute',()=>{muted.has(id)?muted.delete(id):muted.add(id);save();open(id);}),button(blocked.has(id)?'Unblock':'Block',()=>{blocked.has(id)?blocked.delete(id):blocked.add(id);save();open(id);}),button('Report',()=>showReport(person)));
     mini.append(node('p','mini-scope','Mute and block apply to you in this room. Reports go to the room host.'));
   }for(const [i,b]of [...actions.children].entries()){const glyph=node('span','mini-action-icon');icon(glyph,['person','person-add','volume','close','info'][i], '');glyph.setAttribute('aria-hidden','true');b.prepend(glyph);}mini.append(actions);if(!mini.open)mini.showModal();
 }
 function showReport(person){
   mini.replaceChildren(node('h2','','Report '+person.name),node('p','mini-scope','Sent only to this room’s host.'));
   const reason=node('textarea');reason.maxLength=500;reason.rows=4;reason.placeholder='What happened?';reason.setAttribute('aria-label','Reason for reporting');
   const submit=button('Send to room host',()=>{if(!reason.value.trim()){reason.focus();return;}if(send('member-report',{target:person.id,reason:reason.value.trim()}))mini.close();});
   mini.append(reason,submit,button('Back',()=>open(person.id)));reason.focus();
 }
 document.addEventListener('xparty:mini-profile',e=>open(e.detail));
 $('participants').addEventListener('click',e=>{if(e.target.closest('button,input,video,[role=separator]'))return;const tile=e.target.closest('[data-id]');if(tile)open(tile.dataset.id);});
 function decorateMessage(el,m,live=true){
   showLiveComment(m,live);
   el.dataset.sender=m.from;el.hidden=blocked.has(m.from);
   const name=el.querySelector('small');if(name){const identity=button(m.name,()=>open(m.from),'chat-member-name');const details=(m.to?' → '+m.toName+' · Private':'')+' · '+new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});name.replaceChildren(identity,document.createTextNode(details));}
   const portrait=button('',()=>open(m.from),'chat-member-avatar');portrait.setAttribute('aria-label','View '+m.name+' profile');const photo=getContext().room?.people.find(p=>p.id===m.from)?.profile?.photo;if(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo||'')&&photo.length<=40000){const img=node('img');img.src=photo;img.alt='';portrait.append(img);}else portrait.textContent=m.name?.slice(0,1).toUpperCase()||'?';el.prepend(portrait);
   if(m.text&&!m.to){const b=button('Pin',()=>send('pin-message',{id:m.id}),'message-pin');b.setAttribute('aria-label','Pin message from '+m.name);b.hidden=getContext().room?.hostId!==getContext().me;el.append(b);}
 }
 const ending=node('section','end-suggestions');ending.hidden=true;ending.setAttribute('aria-label','Vote for the next video');
 const endHeading=node('div','end-heading'),countdown=node('span'),dismiss=button('×',()=>{const v=getContext().room?.endVote;if(v)send('end-dismiss',{roundId:v.id});});dismiss.setAttribute('aria-label','Dismiss suggestions');endHeading.append(countdown,dismiss);
 const cards=node('div','end-cards');cards.setAttribute('aria-label','Suggestions; swipe for more');
 const note=node('p','end-note');note.setAttribute('role','status');const retry=button('Retry suggestions',()=>{requested=null;loadSuggestions();});
 ending.append(endHeading,cards,note,retry);$('watch-stage').append(ending);
 async function loadSuggestions(){
   const {room,me,token}=getContext(),v=room?.endVote;if(!v||v.closed||v.candidates.length||room.hostId!==me||requested===v.id)return;
   requested=v.id;controller?.abort();controller=new AbortController();retry.hidden=true;note.textContent='Finding the next watch…';
   try{const query=room.source?.type==='youtube'?room.source.title:'music live performances';const response=await fetch(base+'/api/search?q='+encodeURIComponent((query||'music live performances').slice(0,100)),{headers:{Authorization:'Bearer '+token},signal:controller.signal});
     const data=await response.json();if(!response.ok)throw Error(data.error||'Suggestions unavailable.');if(getContext().room?.endVote?.id!==v.id)return;
     const items=(data.items||[]).filter(x=>x.id!==room.source.videoId);if(!items.length)throw Error('No suggestions found. Choose another video from search.');send('end-suggestions',{roundId:v.id,items});
   }catch(error){if(error.name!=='AbortError'&&getContext().room?.endVote?.id===v.id){note.textContent=error.message;retry.hidden=false;}}
 }
 function updateBallot(){
   const {room,me}=getContext(),v=room?.endVote;ending.hidden=!v||(v.closed&&!v.candidates.length);if(ending.hidden){controller?.abort();ballotKey='';return;}
   dismiss.hidden=room.hostId!==me;const key=JSON.stringify([v,room.hostId,me,room.autoAdvance]);
   if(key!==ballotKey){ballotKey=key;const focused=document.activeElement?.dataset.voteId;cards.replaceChildren();
     for(const item of v.candidates){const card=node('article','end-card'),pick=button('',()=>send('end-vote',{roundId:v.id,id:item.id}),'end-pick');pick.dataset.voteId=item.id;pick.disabled=v.closed;pick.setAttribute('aria-pressed',String(v.votes[me]===item.id));pick.setAttribute('aria-label','Vote for '+item.title);
       if(item.source.type==='youtube'){const img=node('img');img.src='https://i.ytimg.com/vi/'+item.source.videoId+'/mqdefault.jpg';img.alt='';img.loading='lazy';pick.append(img);}else pick.append(node('span','end-provider',item.source.type.toUpperCase()));
       pick.append(node('span','end-title',item.title),node('span','end-count',item.count+' vote'+(item.count===1?'':'s')));card.append(pick);
       if(room.hostId===me)card.append(button('Play now',()=>send('end-play',{roundId:v.id,id:item.id}),'end-play'));cards.append(card);
     }if(focused)[...cards.querySelectorAll('[data-vote-id]')].find(b=>b.dataset.voteId===focused)?.focus({preventScroll:true});
     note.textContent=v.candidates.length?(v.closed?'Voting ended · host can choose a video.':room.autoAdvance===false?'Vote for your favourite · host starts the next video.':'Most votes plays next · ties use suggestion order.'):room.hostId===me?'Finding the next watch…':'Waiting for the host’s suggestions…';retry.hidden=true;
   }loadSuggestions();updateCountdown();
 }
 function updateCountdown(){const {room}=getContext(),v=room?.endVote;if(!v||ending.hidden)return;const remaining=v.deadline?Math.max(0,Math.ceil((v.deadline-(Date.now()+(room.serverTime?clockOffset:0)))/1000)):null;countdown.textContent=v.closed?'Up next':remaining!==null?'Vote next · '+remaining+'s':'Up next';}
 let clockOffset=0;setInterval(updateCountdown,1000);
 function update(){
   const {room,me}=getContext();if(room?.code!==roomCode){clearMessageEffects();roomCode=room?.code||null;muted=new Set();blocked=new Set();try{const cache=JSON.parse(sessionStorage.getItem('xparty.room-controls.'+roomCode)||'{}');muted=new Set(cache.muted||[]);blocked=new Set(cache.blocked||[]);}catch{}requested=null;controller?.abort();mini.close();if(room)conversation('chat');}
   const nextHeaderKey=[room?.source?.id,room?.playback?.playing,document.body.classList.contains('browsing'),document.body.classList.contains('room-people-open')].join(':');if(nextHeaderKey!==headerKey){headerKey=nextHeaderKey;revealHeader();}if(!room?.source)clearTicker();
   if(!room){mini.close();ending.hidden=true;connection.hidden=true;document.body.classList.remove('room-video-pinned','room-empty-video');return;}const activeSource=getContext().source||room.source;document.body.classList.toggle('room-video-pinned',!!activeSource);document.body.classList.toggle('room-empty-video',!activeSource);const frameMode=document.querySelector('.room-ambient-layer')?.dataset.mode;lighting.hidden=room.source?.type!=='youtube'||['native','video'].includes(frameMode);lighting.textContent='YouTube ambient colours · live frame lighting requires the Android app.';clockOffset=(room.serverTime||Date.now())-Date.now();
   const peopleCount=room.people.filter(p=>p.online).length;countBadge.textContent=peopleCount>99?'99+':String(peopleCount);$('people-button').setAttribute('aria-label','Participants · '+peopleCount);const heading=document.querySelector('.room-participants-label');if(heading)heading.dataset.count=peopleCount+' here';
   const quote=room.pinnedQuote;pin.hidden=!quote||blocked.has(quote.from);if(quote){pinText.textContent=quote.name+': '+quote.text;unpin.hidden=room.hostId!==me;}
   for(const b of $('messages').querySelectorAll('.message-pin'))b.hidden=room.hostId!==me;
   if(mini.open&&!room.people.some(p=>p.id===selected))mini.close();filterMessages();updateBallot();
 }
 return {update,decorateMessage,isMuted:id=>muted.has(id)||blocked.has(id),onEvent(m){if(m.type==='report-sent')notify('Report delivered to the room host.');if(m.type==='member-report'){const dialog=node('dialog','room-report');dialog.setAttribute('aria-label','Participant report');dialog.append(node('h2','','Room report'),node('p','',m.name+' reported '+m.targetName),node('p','',m.reason),button('Review participants',()=>{dialog.close();$('people-button').click();}),button('Close',()=>dialog.close()));document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();}},open};
}
