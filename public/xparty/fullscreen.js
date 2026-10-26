// Keep the original player and WebRTC elements mounted throughout fullscreen.
export function clampBubble(box, viewport){
 const availableWidth=Math.max(1,viewport.width-16),availableHeight=Math.max(1,viewport.height-144);
 const width=Math.max(Math.min(176,availableWidth),Math.min(box.width,availableWidth,640));
 const height=Math.max(Math.min(140,availableHeight),Math.min(box.height,availableHeight,600));
 return {width,height,x:Math.max(8,Math.min(box.x,viewport.width-width-8)),y:Math.max(64,Math.min(box.y,viewport.height-height-80))};
}
export function initFullscreen({getContext,notify=()=>{},nativeVideo}){
 const $=id=>document.getElementById(id),root=document.documentElement,body=document.body,room=$('room'),call=document.querySelector('.call-panel');
 let active=false,native=false,sequence=0,previous=null,box={x:innerWidth-308,y:80,width:292,height:300},drag=null;
 const button=(label,action,id)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className='secondary';if(id)b.id=id;b.onclick=action;return b;};
 const enter=button('Fullscreen',()=>start(),'fullscreen-video');enter.setAttribute('aria-label','Fullscreen video with floating call');enter.setAttribute('aria-pressed','false');document.querySelector('.room-scene-tools').append(enter);
 const bar=document.createElement('div');bar.className='fullscreen-bar';bar.hidden=true;
 const title=document.createElement('span');title.className='fullscreen-title';
 const exit=button('Exit fullscreen',()=>stop(),'fullscreen-exit');
 const minimize=button('Minimize call',()=>{body.classList.toggle('fullscreen-call-minimized');sync();},'fullscreen-call-toggle');
 const sources=button('Watch sources',async()=>{await stop();$('browse').click();});bar.append(title,sources,minimize,exit);room.append(bar);
 const handle=button('Video call · drag to move',()=>{},'fullscreen-call-move');handle.className='fullscreen-call-move';handle.setAttribute('aria-label','Move video call bubble');
 const resize=button('↘',()=>{},'fullscreen-call-resize');resize.className='fullscreen-call-resize';resize.setAttribute('aria-label','Resize video call bubble');
 const actions=document.createElement('div');actions.className='fullscreen-call-actions';
 for(const [id,label]of [['mic','Mic'],['camera','Camera'],['call-seat','Call seat']]){const b=button(label,()=>$(id).click());b.dataset.mirror=id;actions.append(b);}
 const shape=button('▭',()=>{const rectangle=body.classList.toggle('fullscreen-call-rectangle');shape.setAttribute('aria-pressed',String(rectangle));shape.setAttribute('aria-label',rectangle?'Use rounded call bubble':'Use rectangular call bubble');},'fullscreen-call-shape');shape.setAttribute('aria-label','Use rectangular call bubble');shape.setAttribute('aria-pressed','false');actions.append(shape);
 call.prepend(handle);call.append(actions,resize);
 function layout(){box=clampBubble(box,{width:innerWidth,height:innerHeight});for(const [key,value]of Object.entries(box))call.style.setProperty('--bubble-'+key,value+'px');}
 function sync(){
  const c=getContext();title.textContent=c.room?.source?.title||'Your watch room';
  const minimized=body.classList.contains('fullscreen-call-minimized');minimize.textContent=minimized?'Show call':'Minimize call';minimize.setAttribute('aria-expanded',String(!minimized));
  for(const b of actions.querySelectorAll('[data-mirror]')){const original=$(b.dataset.mirror);b.setAttribute('aria-pressed',original.getAttribute('aria-pressed')||'false');b.disabled=original.disabled;}
  enter.disabled=!c.room||room.hidden;
 }
 async function start(){
  if(active||!getContext().room||room.hidden)return;const generation=++sequence;
  previous={cinema:body.classList.contains('cinema'),focus:body.classList.contains('focus-call'),scroll:scrollY,focusElement:document.activeElement};
  body.classList.remove('cinema','focus-call','browsing','fullscreen-call-minimized');body.classList.add('watch-fullscreen');active=true;bar.hidden=false;enter.setAttribute('aria-pressed','true');layout();sync();exit.focus();
  if(nativeVideo?.available){nativeVideo.setFullscreen(true);return;}
  try{if(!root.requestFullscreen)throw Error('Fullscreen unavailable');await root.requestFullscreen({navigationUI:'hide'});if(generation!==sequence){if(document.fullscreenElement===root)await document.exitFullscreen();return;}native=document.fullscreenElement===root;}
  catch{if(active)notify('Expanded video view is active. This browser did not allow system fullscreen.');}
 }
 function restore(){
  if(!active)return;nativeVideo?.setFullscreen(false);active=false;native=false;sequence++;drag=null;body.classList.remove('watch-fullscreen','fullscreen-call-minimized');bar.hidden=true;enter.setAttribute('aria-pressed','false');
  if(!room.hidden&&getContext().room){body.classList.toggle('cinema',previous?.cinema||false);body.classList.toggle('focus-call',previous?.focus||false);previous?.focusElement?.focus({preventScroll:true});window.scrollTo(0,previous?.scroll||0);}
  previous=null;
 }
 async function stop(){restore();if(document.fullscreenElement===root)try{await document.exitFullscreen();}catch{}}
 const changed=()=>{if(active&&document.fullscreenElement===root)native=true;else if(active&&native)restore();};
 const keydown=e=>{if(e.key==='Escape'&&active&&!document.querySelector('dialog[open]')){e.preventDefault();stop();}};
 for(const [control,sizing]of [[handle,false],[resize,true]]){
  control.onpointerdown=e=>{if(!active||!e.isPrimary||e.button!==0)return;e.preventDefault();e.stopPropagation();drag={id:e.pointerId,x:e.clientX,y:e.clientY,box:{...box},sizing};control.setPointerCapture(e.pointerId);};
  control.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const dx=e.clientX-drag.x,dy=e.clientY-drag.y;box=drag.sizing?{...drag.box,width:drag.box.width+dx,height:drag.box.height+dy}:{...drag.box,x:drag.box.x+dx,y:drag.box.y+dy};layout();};
  const finish=e=>{if(drag?.id===e.pointerId)drag=null;if(control.hasPointerCapture(e.pointerId))control.releasePointerCapture(e.pointerId);};control.onpointerup=control.onpointercancel=finish;control.onlostpointercapture=()=>drag=null;
  control.onkeydown=e=>{const deltas={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};if(!active||!deltas[e.key])return;e.preventDefault();e.stopPropagation();const [x,y]=deltas[e.key];if(sizing){box.width+=x;box.height+=y;}else{box.x+=x;box.y+=y;}layout();};
 }
 const resizeWindow=()=>{if(active)layout();};const roomChanged=()=>{sync();if(active&&room.hidden)stop();};
 const observer=new MutationObserver(roomChanged);observer.observe(room,{attributes:true,attributeFilter:['hidden']});
 const controlObserver=new MutationObserver(sync);for(const id of ['mic','camera','speaker','call-seat'])controlObserver.observe($(id),{attributes:true,attributeFilter:['aria-pressed','disabled']});
 document.addEventListener('fullscreenchange',changed);document.addEventListener('keydown',keydown);window.addEventListener('resize',resizeWindow);window.visualViewport?.addEventListener('resize',resizeWindow);window.addEventListener('pagehide',stop);sync();
 return {update:sync,exit:stop,destroy(){stop();observer.disconnect();controlObserver.disconnect();document.removeEventListener('fullscreenchange',changed);document.removeEventListener('keydown',keydown);window.removeEventListener('resize',resizeWindow);window.visualViewport?.removeEventListener('resize',resizeWindow);window.removeEventListener('pagehide',stop);for(const element of [enter,bar,handle,resize,actions])element.remove();}};
}
