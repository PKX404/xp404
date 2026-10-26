// Reads room.skipVoting from the server snapshot; never advances playback locally.
export function initSkipVoting({getContext,container=document.querySelector('.queue-heading')}={}){
 if(!container||typeof getContext!=='function')return {update(){},destroy(){}};
 const controls=document.createElement('div');controls.className='skip-voting-controls';
 const label=document.createElement('label');label.className='switch-row';const setting=document.createElement('input');setting.type='checkbox';setting.setAttribute('role','switch');label.append(document.createTextNode('Majority skip'),setting);
 const vote=document.createElement('button');vote.type='button';vote.className='secondary';const status=document.createElement('span');status.className='skip-voting-status';status.setAttribute('role','status');controls.append(label,vote,status);container.append(controls);let destroyed=false;
 function update(){if(destroyed)return;const {room,me}=getContext()||{},s=room?.skipVoting;controls.hidden=!room;label.hidden=room?.hostId!==me;setting.checked=s?.enabled===true;vote.hidden=!s?.enabled;status.hidden=!s?.enabled;vote.disabled=!s?.available||s?.eligible<2;vote.textContent=s?.votes?.includes(me)?'Undo skip vote':'Vote to skip';vote.setAttribute('aria-pressed',String(!!s?.votes?.includes(me)));status.textContent=!s?.available?'Queue a video to enable skip votes':s?.eligible<2?'Two online members needed':`${s.count} / ${s.threshold} votes to skip`;}
 function configure(){const c=getContext()||{};c.send?.('skip-settings',{enabled:setting.checked});}
 function toggle(){const c=getContext()||{};if(c.room?.skipVoting?.available)c.send?.('skip-vote',{sourceId:c.room.source?.id});}
 setting.addEventListener('change',configure);vote.addEventListener('click',toggle);update();
 return {update,destroy(){if(destroyed)return;destroyed=true;setting.removeEventListener('change',configure);vote.removeEventListener('click',toggle);controls.remove();}};
}
