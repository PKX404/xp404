import {paintRoomAvatar} from './room-identity.js';
const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const action=(label,fn,cls='')=>{const b=element('button',cls,label);b.type='button';b.onclick=fn;return b;};
const reactions=['❤️','😂','👏','🔥','😮','👍'];
const clock=at=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

export function initRoomChat({getContext,send,notify,decorate,renderAttachment,releaseAttachment,visible,onUnread,confirmDelete}){
 const log=document.getElementById('messages'),form=document.getElementById('chat-form'),input=document.getElementById('message-input');
 const messages=new Map(),pending=new Map(),timers=new Map(),unread=new Set();let identity='',reply=null,checking=false,restoring=false,readFrame=0;
 function scheduleRead(){if(readFrame||restoring)return;readFrame=requestAnimationFrame(()=>{readFrame=0;checkRead();});}
 log.setAttribute('role','log');log.setAttribute('aria-label','Room messages');log.setAttribute('aria-live','polite');log.setAttribute('aria-relevant','additions');
 const jump=action('',()=>{log.scrollTop=log.scrollHeight;checkRead();},'chat-new-messages'),jumpCount=element('span','chat-new-count'),jumpArrow=element('span','chat-new-arrow');jumpArrow.setAttribute('aria-hidden','true');jump.append(jumpCount,jumpArrow);jump.hidden=true;log.after(jump);
 const replyBar=element('div','chat-reply-draft');replyBar.hidden=true;replyBar.setAttribute('role','status');form.before(replyBar);
 const menu=element('dialog','message-actions');menu.setAttribute('aria-label','Message actions');document.body.append(menu);
 const viewer=element('dialog','chat-media-viewer');viewer.setAttribute('aria-label','Image preview');document.body.append(viewer);
 const viewerClose=action('Close image',()=>viewer.close(),'media-viewer-close');viewerClose.setAttribute('aria-label','Close image');viewerClose.textContent='×';
 viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close();});viewer.addEventListener('close',()=>viewer.replaceChildren());
 const nearEnd=()=>log.scrollHeight-log.scrollTop-log.clientHeight<56;
 function react(id,emoji,active){if(!getContext().room)return;send('message-reaction',{id,emoji,active});}
 function storageKey(){return 'xparty.chat.outbox.'+identity;}
 function save(){if(!identity)return;try{if(pending.size)sessionStorage.setItem(storageKey(),JSON.stringify([...pending.values()].slice(-50)));else sessionStorage.removeItem(storageKey());}catch{}}
 function announce(){if(restoring)return;jump.hidden=!unread.size||(nearEnd()&&visible());jumpCount.textContent=unread.size>99?'99+':String(unread.size);jump.setAttribute('aria-label',unread.size+' new messages. Jump to latest');onUnread(unread.size);}
 function anchor(){if(restoring)return {end:false,first:null};if(nearEnd())return {end:true,first:null,offset:0};const box=log.getBoundingClientRect();const first=[...log.children].find(e=>e.getBoundingClientRect().bottom>box.top);return {end:nearEnd(),first,offset:first?.getBoundingClientRect().top};}
 function restoreAnchor(a){if(a.end)log.scrollTop=log.scrollHeight;else if(a.first?.isConnected)log.scrollTop+=a.first.getBoundingClientRect().top-a.offset;}
 function trim(){while(log.children.length>200){const e=log.firstElementChild;if(e.dataset.pending)break;releaseAttachment(e);messages.delete(e.dataset.messageId);unread.delete(e.dataset.messageId);e.remove();}}
 let groupPending=false;function grouping(){if(groupPending)return;groupPending=true;requestAnimationFrame(()=>{groupPending=false;let prev=null,run=0;for(const row of log.children){const m=messages.get(row.dataset.messageId);if(!m){prev=null;run=0;continue;}const joined=!!prev&&!m.deleted&&!prev.deleted&&m.from===prev.from&&m.to===prev.to&&m.at-prev.at>=0&&m.at-prev.at<120000;run=joined?run+1:0;row.classList.toggle('message-grouped',joined&&run%2!==0);prev=m;}});}
 function receipt(row,m){const existing=row.querySelector('.read-receipt');if(!existing)return;const readers=m.readBy?.length||0,delivered=m.deliveredBy?.length||0;const status=m.localStatus|| (readers?'read':delivered?'delivered':'sent');
  const signature=status+':'+readers+':'+delivered;
  if(existing.dataset.receiptSignature===signature)return;
  existing.dataset.receiptSignature=signature;
  existing.dataset.state=status;
  if(status==='read'){
    existing.textContent='';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','13');
    svg.setAttribute('aria-hidden','true');
    const outline=document.createElementNS('http://www.w3.org/2000/svg','path');
    outline.setAttribute('d','M2 12s3.5-6.2 10-6.2S22 12 22 12s-3.5 6.2-10 6.2S2 12 2 12Z');
    outline.setAttribute('fill','none');outline.setAttribute('stroke','currentColor');outline.setAttribute('stroke-width','1.8');
    const pupil=document.createElementNS('http://www.w3.org/2000/svg','circle');
    pupil.setAttribute('cx','12');pupil.setAttribute('cy','12');pupil.setAttribute('r','3');pupil.setAttribute('fill','currentColor');
    svg.append(outline,pupil);existing.append(svg);
  }else existing.textContent=({sending:'◷',failed:'!',sent:'✓',delivered:'✓✓'})[status];
  const label=status==='read'?'Seen by '+readers:status==='delivered'?'Delivered to '+delivered:status==='sent'?'Sent to room server; awaiting delivery':status==='failed'?'Not sent — retry':'Sending';existing.setAttribute('aria-label',label);existing.title=label;
 }
 function render(m,live=false,media=null){
  const {me}=getContext(),row=element('div','message'+(m.from===me?' mine':'')+(m.to?' private':'')+(m.deleted?' message-deleted':''));row.dataset.messageId=m.id;
  if(m.localStatus)row.dataset.pending=m.clientId;
  const name=element('small');name.textContent=m.name;row.append(name);
  if(m.reply){const quote=action('',()=>{const target=[...log.children].find(e=>e.dataset.messageId===m.reply.id);if(target){target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});target.classList.add('message-highlight');setTimeout(()=>target.classList.remove('message-highlight'),1200);}else notify('The original message is no longer in this room’s recent history.');},'message-reply');quote.append(element('strong','',m.reply.name),element('span','',m.reply.text));row.insertBefore(quote,name);}
  if(m.text||m.deleted)row.append(element('p','message-body',m.deleted?'Message removed':m.text));
  if(m.attachment&&!m.deleted){if(media)row.append(media);else if(m.localStatus)row.append(element('p','',m.attachment.name));else renderAttachment(row,m.attachment);}
  if(m.poll){const card=element('div');card.dataset.pollId=m.poll.id;row.append(card);document.dispatchEvent(new CustomEvent('xparty:render-poll',{detail:{card,poll:m.poll}}));}
  decorate(row,m,live);if(m.deleted)row.querySelector('.message-pin')?.remove();
  const small=row.querySelector('small');if(small){const identityButton=small.querySelector('.chat-member-name');small.replaceChildren(...(identityButton?[identityButton]:[document.createTextNode(m.name)]));if(m.to)small.append(document.createTextNode(' · Private'));}
  const meta=element('div','message-meta'),time=element('time','message-time',clock(m.at));time.dateTime=new Date(m.at).toISOString();time.title=new Date(m.at).toLocaleString();meta.append(time);
  if(m.from===me&&!m.deleted){const inline=row.querySelector('.message-body');(inline||meta).append(element('span','read-receipt'));receipt(row,m);}
  // Action controls are deliberately contextual: no permanent menu or emoji buttons.
  // Rave-reference text composition: username and text flow on the same line when possible.
  const wordBody=row.querySelector(':scope > .message-body');
  const memberLabel=row.querySelector(':scope > small');
  if(memberLabel&&wordBody){
    const line=element('div','xp-v23-inline-text');
    row.insertBefore(line,memberLabel);line.append(memberLabel,wordBody);
  }
  row.append(meta);
  if(m.localStatus==='failed'){const retry=action('Not sent · Retry',()=>retryMessage(m.clientId),'message-retry');retry.title=m.error||'Retry the same message';row.append(retry);}
  const chips=element('div','message-reactions');for(const [emoji,people] of Object.entries(m.reactions||{})){if(!reactions.includes(emoji)||!people.length)continue;const chip=action(emoji,()=>react(m.id,emoji,!people.includes(me)),'message-reaction');chip.setAttribute('aria-label',emoji+', '+people.length+' reaction'+(people.length===1?'':'s'));chip.setAttribute('aria-pressed',String(people.includes(me)));chips.append(chip);}if(chips.children.length)row.append(chips);
  // Only message text/media can open the contextual sheet, not user avatars or empty spaces.
  let pressTimer=0,pressPoint=null,lastLongPress=0;
  const cancelPress=()=>{if(pressTimer)clearTimeout(pressTimer);pressTimer=0;pressPoint=null;};
  row.addEventListener('pointerdown',e=>{
    if(e.button!==0||!e.target.closest('.message-body,.xp-v23-inline-text,.message-reply,.attachment-card,.message-reactions'))return;
    if(e.target.closest('button,a,input,textarea,video,[role=button],.chat-member-avatar'))return;
    cancelPress();pressPoint={x:e.clientX,y:e.clientY};
    pressTimer=setTimeout(()=>{pressTimer=0;pressPoint=null;lastLongPress=Date.now();
      try{navigator.vibrate?.(18);}catch{}openActions(m.id);
    },500);
  },{passive:true});
  row.addEventListener('pointermove',e=>{if(pressPoint&&Math.hypot(e.clientX-pressPoint.x,e.clientY-pressPoint.y)>12)cancelPress();},{passive:true});
  for(const type of ['pointerup','pointercancel','pointerleave'])row.addEventListener(type,cancelPress,{passive:true});
  row.addEventListener('contextmenu',e=>{if(e.target.closest('a,video,button,.chat-member-avatar'))return;
    e.preventDefault();if(Date.now()-lastLongPress>800)openActions(m.id);
  });
  row.addEventListener('load',()=>{if(nearEnd())log.scrollTop=log.scrollHeight;},true);
  return row;
 }
 function put(m,live=false){const a=anchor();const old=[...log.children].find(e=>e.dataset.messageId===m.id||(m.clientId&&e.dataset.pending===m.clientId));const media=!m.deleted&&m.attachment?.id&&m.attachment.id===messages.get(old?.dataset.messageId)?.attachment?.id?old?.querySelector('.attachment-card'):null;if(media)media.remove();if(old){releaseAttachment(old);messages.delete(old.dataset.messageId);}messages.set(m.id,m);const row=render(m,live&&!old,media);if(old)old.replaceWith(row);else log.append(row);trim();grouping();restoreAnchor(a);return row;}
 function receive(m,live=true){
  const {me}=getContext();
  // Older room servers omit clientId from their chat acknowledgement. Match a
  // same-sender, same-recipient, same-content message to the oldest pending
  // send before declaring it unsent or showing it twice.
  if(m.from===me&&!m.clientId&&typeof m.text==='string'){
   const local=[...pending.values()].find(item=>item.text===m.text&&
     (item.to||null)===(m.to||null)&&
     !!item.attachment===!!m.attachment&&Math.abs((m.at||0)-item.at)<60000);
   if(local)m={...m,clientId:local.clientId};
  }
  if(m.clientId&&m.from===me){clearTimeout(timers.get(m.clientId));timers.delete(m.clientId);pending.delete(m.clientId);save();}
  const isNew=!messages.has(m.id);put(m,live);
  if(m.from!==me&&!m.deleted){if(!m.deliveredBy?.includes(me)&&getContext().connected)send('delivered',{ids:[m.id]});if(!m.readBy?.includes(me))unread.add(m.id);}
  announce();if(isNew)scheduleRead();
 }
 function checkRead(){if(!unread.size||checking||!visible()||document.querySelector('dialog[open]')||!getContext().connected)return;checking=true;
  try{const box=log.getBoundingClientRect(),ids=[],rows=new Map([...log.children].map(row=>[row.dataset.messageId,row]));for(const id of unread){const row=rows.get(id);if(!row||row.hidden)continue;const r=row.getBoundingClientRect();if(r.width&&r.height&&r.bottom>Math.max(box.top,0)&&r.top<Math.min(box.bottom,innerHeight))ids.push(id);}
   // When the newest part of chat is viewed, clear the notification badge
   // for all previously accumulated unread messages, not just visible rows.
   if(nearEnd()&&document.body.dataset.conversation!=='call')for(const id of unread)if(!ids.includes(id))ids.push(id);
   if(ids.length&&send('read',{ids})){for(const id of ids)unread.delete(id);announce();}
  }finally{checking=false;}
 }
 function updateStatus(id,status,error){const m=pending.get(id);if(!m)return;m.localStatus=status;m.error=error||'';put(m);save();}
 function retryMessage(id){const m=pending.get(id);if(!m||m.localStatus==='sending'&&timers.has(id))return;clearTimeout(timers.get(id));timers.delete(id);updateStatus(id,'sending');
  if(!getContext().connected||!send('chat',{clientId:id,text:m.text,to:m.to,replyTo:m.reply?.id,attachmentId:m.attachment?.id})){updateStatus(id,'failed','Reconnect to retry.');return;}
  timers.set(id,setTimeout(()=>updateStatus(id,'failed','No acknowledgement. Check the room before retrying.'),12000));
 }
 function submit({text='',to=null,attachment=null}={}){const {room,me,connected}=getContext();if(!room||!me)return false;if(!connected){notify('Reconnecting. Your message is still in the box.');return false;}if(pending.size>=50){notify('Retry or remove pending messages before sending more.');return false;}
  const clientId=crypto.randomUUID(),person=room.people.find(p=>p.id===me),target=room.people.find(p=>p.id===to);
  const m={type:'chat',id:'local-'+clientId,clientId,from:me,name:person?.name||'You',to,toName:target?.name||null,text,at:Date.now(),localStatus:'sending',...(reply?{reply:{id:reply.id,name:reply.name,text:reply.text.slice(0,180)||reply.attachment?.name||'Media'}}:{}),...(attachment?{attachment}: {})};
  pending.set(clientId,m);put(m);log.scrollTop=log.scrollHeight;clearReply();retryMessage(clientId);return true;
 }
 function clearReply(){reply=null;replyBar.hidden=true;replyBar.replaceChildren();}
 function beginReply(m){reply=m;const words=element('div');words.append(element('strong','','Reply to '+m.name),element('span','',m.text.slice(0,160)||m.attachment?.name||'Media'));replyBar.replaceChildren(words,action('×',clearReply,'chat-reply-cancel'));replyBar.lastChild.setAttribute('aria-label','Cancel reply');replyBar.hidden=false;document.dispatchEvent(new CustomEvent('xparty:reply-recipient',{detail:m.to?(m.from===getContext().me?m.to:m.from):null}));input.focus();}
 function openActions(id){const m=messages.get(id);if(!m||m.deleted)return;menu.replaceChildren(element('h2','','Message'));
  const closeThen=fn=>()=>{menu.close();fn();};
  if(!m.localStatus){const emojis=element('div','message-emoji-options');for(const emoji of reactions)emojis.append(action(emoji,closeThen(()=>react(id,emoji,!m.reactions?.[emoji]?.includes(getContext().me)))));menu.append(emojis,action('Reply',closeThen(()=>beginReply(m))));}
  if(m.text)menu.append(action('Copy text',closeThen(async()=>{try{await navigator.clipboard.writeText(m.text);notify('Text copied.');}catch{notify('Copy is unavailable in this browser. Select the message text to copy.');}})));
  if(!m.localStatus&&getContext().room?.hostId===getContext().me&&!m.to)menu.append(action('Pin message',closeThen(()=>send('pin-message',{id}))));
  if(m.localStatus)menu.append(action('Retry',closeThen(()=>retryMessage(m.clientId))),action('Remove unsent message',closeThen(()=>{clearTimeout(timers.get(m.clientId));pending.delete(m.clientId);messages.delete(id);[...log.children].find(e=>e.dataset.messageId===id)?.remove();save();grouping();})));
  else if(m.from===getContext().me||!m.to&&getContext().room?.hostId===getContext().me)menu.append(action('Delete message',closeThen(async()=>{if(!await confirmDelete())return;const ctx=getContext();if(ctx.room?.features?.messageControls)send('message-delete',{id});else if(m.from===ctx.me)send('chat-delete',{id});else notify('Host deletion needs the room service update.');})));
  menu.append(action('Cancel',()=>menu.close()));menu.showModal();
 }
 function onEvent(event){if(event.type==='chat-error'){if(event.clientId)updateStatus(event.clientId,'failed',event.message);else notify(event.message);return true;}
  if(event.type==='message-update'){const a=anchor();receive(event.message,false);restoreAnchor(a);return true;}
  if(event.type==='chat-updated'){const m=messages.get(event.id);if(m){m.text=event.text??m.text;m.deleted=event.deleted===true;m.edited=event.edited===true;put(m);}return true;}
  if(['read','delivered'].includes(event.type)){const m=messages.get(event.id);if(!m)return true;m.deliveredBy=event.deliveredBy||m.deliveredBy||[];m.readBy=event.readBy||m.readBy||[];const field=event.type==='read'?'readBy':'deliveredBy';if(event.by&&!m[field].includes(event.by))m[field].push(event.by);const row=[...log.children].find(e=>e.dataset.messageId===m.id);if(row)receipt(row,m);return true;}return false;
 }
 function restore(history=[]){const {room,me}=getContext(),key=room.code+':'+me;if(identity!==key){for(const timer of timers.values())clearTimeout(timer);timers.clear();pending.clear();identity=key;clearReply();try{for(const m of JSON.parse(sessionStorage.getItem(storageKey())||'[]'))if(m.from===me&&Date.now()-m.at<86400000)pending.set(m.clientId,{...m,localStatus:'failed'});}catch{}}
  restoring=true;
  try{for(const child of log.children)releaseAttachment(child);log.replaceChildren();messages.clear();unread.clear();for(const m of history)receive(m,false);for(const m of pending.values()){m.localStatus='failed';put(m);}}finally{restoring=false;}
  log.scrollTop=log.scrollHeight;announce();scheduleRead();
 }
 function reconcile(history=[]){
  // A resumed connection must not discard currently rendered media or redraw
  // each reaction chip unless the server actually changed that message.
  const {me}=getContext();
  for(const m of history){
   if(!m?.id)continue;
   const old=messages.get(m.id);
   if(!old){receive(m,false);continue;}
   if(old.text!==m.text||old.deleted!==m.deleted||old.edited!==m.edited||
      old.attachment?.id!==m.attachment?.id||
      (old.readBy?.length||0)!==(m.readBy?.length||0)||
      (old.deliveredBy?.length||0)!==(m.deliveredBy?.length||0)||
      JSON.stringify(old.reactions||{})!==JSON.stringify(m.reactions||{})){
    receive(m,false);
   }
  }
  announce();scheduleRead();
 }
 function presence(events){const a=anchor();for(const p of events){const {room,me}=getContext(),person=p.person||room?.people.find(x=>x.id===p.id)||{id:p.id,name:p.name},row=element('div','message system presence-message'+(p.id===me?' presence-self':'')),portrait=action('',()=>document.dispatchEvent(new CustomEvent('xparty:mini-profile',{detail:p.id})),'presence-avatar'),chip=action('',()=>document.dispatchEvent(new CustomEvent('xparty:mini-profile',{detail:p.id})),'presence-chip'),small=element('span','presence-chip-avatar');small.dataset.identityRole='inline';portrait.setAttribute('aria-label','View '+p.name+' profile');chip.setAttribute('aria-label','View '+p.name+' profile');paintRoomAvatar(portrait,person,{hostId:room?.hostId});paintRoomAvatar(small,person,{hostId:null,mic:false});chip.append(small,element('strong','',p.name));const verb=element('span','presence-verb',({joined:'joined the room',returned:'reconnected',left:'left the room',kicked:'was removed by the host',disconnected:'lost connection · reconnecting…'}[p.kind])||p.kind);row.append(portrait,chip,verb);row.setAttribute('role','status');row.dataset.presence=p.kind;log.append(row);}trim();grouping();restoreAnchor(a);}

 function activity({kind,name,emoji}){
  if(kind!=='reaction')return;
  const a=anchor();
  const row=element('div','message system rave-room-activity');
  row.setAttribute('role','status');
  const safeName=String(name||'Someone').slice(0,48);
  const safeEmoji=String(emoji||'❤️').slice(0,8);
  row.append(element('strong','',safeName),element('span','', ' reacted '+safeEmoji));
  log.append(row);trim();restoreAnchor(a);
 }
 function disconnected(){for(const id of pending.keys()){clearTimeout(timers.get(id));updateStatus(id,'failed','Connection interrupted. Retry when connected.');}}
 function reset(){if(readFrame)cancelAnimationFrame(readFrame);readFrame=0;for(const timer of timers.values())clearTimeout(timer);timers.clear();pending.clear();save();identity='';messages.clear();unread.clear();clearReply();menu.close();viewer.close();announce();}
 let scrollReadScheduled=false;log.addEventListener('scroll',()=>{if(scrollReadScheduled)return;scrollReadScheduled=true;requestAnimationFrame(()=>{scrollReadScheduled=false;checkRead();announce();});},{passive:true});window.addEventListener('focus',checkRead);document.addEventListener('visibilitychange',checkRead);document.addEventListener('close',()=>requestAnimationFrame(checkRead),true);
 log.addEventListener('click',e=>{const trigger=e.target.closest('.chat-image-preview'),img=trigger?.querySelector('img')||e.target.closest('.attachment-card img');if(!img||viewer.open)return;const picture=element('img');picture.src=img.src;picture.alt=img.alt;picture.tabIndex=0;picture.setAttribute('aria-label',img.alt+'. Tap to zoom');const zoom=()=>picture.classList.toggle('zoomed');picture.onclick=zoom;picture.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();zoom();}};viewer.replaceChildren(viewerClose,picture,element('p','',img.alt));viewer.showModal();viewerClose.focus({preventScroll:true});});
 return {receive,submit,onEvent,restore,reconcile,checkRead,presence,activity,disconnected,reset};
}
