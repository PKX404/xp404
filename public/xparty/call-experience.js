const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
export function initCallExperience({getContext,send,notify,conversation,startCamera,icon}){
 const $=id=>document.getElementById(id),participants=$('participants');
 $('choose-room-video').onclick=()=>$('browse').click();
 const viewport=()=>document.documentElement.style.setProperty('--room-height',(window.visualViewport?.height||innerHeight)+'px');viewport();window.addEventListener('resize',viewport);window.visualViewport?.addEventListener('resize',viewport);
 let roomCode=null,accepted=false,awaitingSeat=false,pending=null,selected=null,drag=null,corner={x:1,y:0},timeout;
 const sheet=el('dialog','video-request-sheet');sheet.setAttribute('aria-label','Video call request');document.body.append(sheet);
 const makeButton=(label,fn)=>{const b=el('button','',label);b.type='button';b.onclick=fn;return b;};
 const request=$('panel-call');
 const hangup=$('call-seat');
 // Camera controls remain reachable when the self preview is small.
 const callControls=el('div','call-primary-controls');for(const id of ['mic','camera','camera-flip'])callControls.append($(id));document.querySelector('.call-panel').append(callControls);
 const sound=el('div','call-audio-control'),soundInput=$('call-volume'),soundLabel=soundInput.closest('label');
 sound.append($('speaker'),soundInput);soundLabel.remove();document.querySelector('.participant-strip').prepend(sound);
 soundInput.setAttribute('aria-orientation','horizontal');soundInput.setAttribute('aria-label','Call volume');
 function close(){clearTimeout(timeout);pending=null;selected=null;sheet.close();}
 function cancel(){if(pending)send(pending.kind==='incoming'?'video-call-response':'video-call-cancel',pending.kind==='incoming'?{id:pending.id,accept:false}:{id:pending.id});close();}
 sheet.addEventListener('cancel',e=>{e.preventDefault();cancel();});
 function open(){
  if(pending){if(!sheet.open)sheet.showModal();return;}
  const {room,me}=getContext();if(!room)return;
  const self=room.people.find(p=>p.id===me);if(!self?.inCall){awaitingSeat=send('call-join');if(awaitingSeat)notify('Requesting a call seat. Host approval may be needed.');return;}
  sheet.replaceChildren(el('h2','','Video call'),el('p','','Choose someone to invite. Their camera stays off until they accept.'));
  const list=el('div','video-request-people');for(const p of room.people.filter(p=>p.id!==me&&p.online&&p.inCall))list.append(makeButton(p.name,()=>{selected=p.id;send('video-call-request',{to:p.id});}));
  if(!list.children.length)list.append(el('p','','No other call participants are online yet.'));
  sheet.append(list,makeButton('Close',close));if(!sheet.open)sheet.showModal();
 }
 function onEvent(m){
  if(m.type==='video-call-incoming'||m.type==='video-call-outgoing'){
   pending={...m,kind:m.type==='video-call-incoming'?'incoming':'outgoing'};
   const incoming=pending.kind==='incoming';sheet.replaceChildren(el('h2','',incoming?'Incoming video request':'Calling '+m.name),el('p','',incoming?m.name+' would like to video call. Accept to turn on your camera.':'Waiting for an answer. Your camera is still off.'));
   if(incoming)sheet.append(makeButton('Accept video call',()=>{send('video-call-response',{id:m.id,accept:true});sheet.close();}));
   sheet.append(makeButton(incoming?'Decline':'Cancel',cancel));if(!sheet.open)sheet.showModal();
   clearTimeout(timeout);timeout=setTimeout(()=>{if(pending?.id===m.id)cancel();},31000);return;
  }
  if(m.type!=='video-call-result'||pending?.id!==m.id)return;
  close();if(m.status==='accepted'){accepted=true;conversation('call');startCamera();}else notify({declined:'Video request declined.',cancelled:'Video request cancelled.',expired:'Video request expired.'}[m.status]||'Video request ended.');
 }
 function currentSmall(){return participants.classList.contains('duo')?participants.querySelector(participants.classList.contains('self-large')?'.participant:not(.self)':'.participant.self'):null;}
 function place(){
  const tile=currentSmall();if(!tile||!participants.clientWidth)return;
  const pad=8,maxX=Math.max(pad,participants.clientWidth-tile.offsetWidth-pad),maxY=Math.max(pad,participants.clientHeight-tile.offsetHeight-pad);
  tile.style.setProperty('--pip-x',(pad+(maxX-pad)*corner.x)+'px');tile.style.setProperty('--pip-y',(pad+(maxY-pad)*corner.y)+'px');
 }
 function update(){
  const {room,me}=getContext();if(room?.code!==roomCode){roomCode=room?.code||null;accepted=false;awaitingSeat=false;corner={x:1,y:0};close();}
  if(!room){document.body.classList.remove('call-has-media','vc-active');return;}
  const self=room.people.find(p=>p.id===me);
  if(awaitingSeat&&self?.inCall){awaitingSeat=false;open();}
  const overVideo=!!room.source||document.body.classList.contains('device-local-video');sound.classList.toggle('over-video',overVideo);const soundHome=overVideo?document.querySelector('.video-volume-overlay'):document.querySelector('.participant-strip');if(sound.parentElement!==soundHome)soundHome.prepend(sound);
  if(!self?.inCall&&accepted){accepted=false;conversation('chat');}
  const active=room.people.some(p=>p.inCall&&p.camera),vcActive=!!self?.inCall&&(accepted||self.camera);
  document.body.classList.toggle('call-has-media',active);document.body.classList.toggle('vc-active',vcActive);
  document.querySelector('.participant-strip').hidden=!vcActive;
  sound.hidden=!vcActive;
  for(const tile of participants.children){
   const small=tile===currentSmall();tile.classList.toggle('call-pip-preview',small);tile.tabIndex=small?0:-1;
   if(small){tile.setAttribute('aria-label','Small video preview. Drag to move; arrow keys move; Enter swaps views.');tile.setAttribute('role','group');}else{tile.removeAttribute('aria-label');tile.removeAttribute('role');}
   const local=tile.querySelector('.local-controls');if(local)for(const child of [...local.children])callControls.append(child);
  }
  if(pending&&(!self?.online||![pending.from||me,pending.to||me].every(id=>room.people.some(p=>p.id===id&&p.online&&p.inCall))))close();
  request.setAttribute('aria-label',accepted?'Video call':'Request a video call');place();
 }
 participants.addEventListener('pointerdown',e=>{
  const tile=e.target.closest('.call-pip-preview');if(!tile||e.target.closest('button,input')||e.button!==0)return;
  e.preventDefault();e.stopPropagation();const r=tile.getBoundingClientRect(),box=participants.getBoundingClientRect();drag={tile,id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left-box.left,top:r.top-box.top};tile.setPointerCapture(e.pointerId);
 });
 participants.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;e.stopPropagation();
  const maxX=Math.max(8,participants.clientWidth-drag.tile.offsetWidth-8),maxY=Math.max(8,participants.clientHeight-drag.tile.offsetHeight-8);
  const x=Math.min(maxX,Math.max(8,drag.left+e.clientX-drag.x)),y=Math.min(maxY,Math.max(8,drag.top+e.clientY-drag.y));
  corner={x:maxX>8?(x-8)/(maxX-8):1,y:maxY>8?(y-8)/(maxY-8):0};place();
 });
 function finish(e){if(!drag||drag.id!==e.pointerId)return;const tile=drag.tile;drag=null;corner={x:corner.x<.5?0:1,y:corner.y<.5?0:1};place();if(tile.hasPointerCapture(e.pointerId))tile.releasePointerCapture(e.pointerId);}
 participants.addEventListener('pointerup',finish);participants.addEventListener('pointercancel',finish);participants.addEventListener('lostpointercapture',()=>{drag=null;});
 participants.addEventListener('keydown',e=>{if(!e.target.classList.contains('call-pip-preview'))return;const dirs={ArrowLeft:[0,corner.y],ArrowRight:[1,corner.y],ArrowUp:[corner.x,0],ArrowDown:[corner.x,1]};if(dirs[e.key]){e.preventDefault();corner={x:dirs[e.key][0],y:dirs[e.key][1]};place();}else if(e.key==='Enter'){e.preventDefault();$('swap-camera-view').click();update();}});
 $('swap-camera-view').addEventListener('click',()=>queueMicrotask(update));
 new ResizeObserver(place).observe(participants);
 hangup.addEventListener('click',()=>{if(accepted){accepted=false;conversation('chat');}});
 return {update,onEvent,open,canOpen:()=>accepted||getContext().room?.people.some(p=>p.inCall&&p.camera)};
}
