export function presenceChanges(previous,next){
 if(!previous||previous.code!==next?.code)return [];
 const before=new Map(previous.people.map(p=>[p.id,p])),after=new Map(next.people.map(p=>[p.id,p])),events=[];
 for(const p of next.people){const old=before.get(p.id);if(p.online&&!old?.online)events.push({id:p.id,name:p.name,kind:old?'returned':'joined'});else if(old?.online&&!p.online)events.push({id:p.id,name:p.name,kind:p.presence==='LEFT'?'left':'disconnected'});}
 for(const p of previous.people)if(p.online&&!after.has(p.id))events.push({id:p.id,name:p.name,kind:'left'});
 return events;
}
export function appendPresence(log,events,self){
 for(const event of events){if(event.id===self)continue;const item=document.createElement('div');item.className='message system presence-message';item.setAttribute('role','status');item.textContent=event.name+({joined:' joined the room',returned:' reconnected',left:' left the room',disconnected:' lost connection. Reconnecting…'}[event.kind]);log.append(item);}
 while(log.children.length>200)log.firstChild.remove();if(events.length)log.scrollTop=log.scrollHeight;
}
