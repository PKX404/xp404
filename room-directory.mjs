import {roomIsFull} from './public/xparty/limits.js';
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
export function directorySettings(room){
 return {visibility:room.visibility==='public'?'public':'private',title:clean(room.title,80),language:clean(room.language,24)};
}
export function updateDirectory(room,personId,message){
 if(personId!==room.hostId||!['private','public'].includes(message.visibility))return false;
 const title=clean(message.title,80),language=clean(message.language,24);
 if(message.visibility==='public'&&!title)return false;
 Object.assign(room,{visibility:message.visibility,title,language});
 return true;
}
export function publicRooms(rooms,{online,occupied,query='',limit=50}){
 const search=clean(query,100).toLocaleLowerCase();const listings=[];
 for(const room of rooms.values()){
  if(room.visibility!=='public'||room.locked||!room.people.has(room.hostId)||!online(room.people.get(room.hostId))||roomIsFull(room.capacity,occupied(room)))continue;
  const settings=directorySettings(room);if(!settings.title)continue;
  const watching=room.source&&room.source.type!=='file'?{title:clean(room.source.title,150),type:room.source.type,...(room.source.type==='youtube'&&/^[\w-]{11}$/.test(room.source.videoId)?{videoId:room.source.videoId}:{})}:null;
  if(search&&![settings.title,settings.language,watching?.title||''].some(s=>s.toLocaleLowerCase().includes(search)))continue;
  const members=[...room.people.values()].filter(online);
  const previewMembers=members.filter(p=>p.directoryPreview===true).slice(0,5).map(p=>({name:clean(p.name,24),photo:p.profile?.photo?.length<=12000?p.profile.photo:null}));
  listings.push({previewMembers,code:room.code,title:settings.title,language:settings.language,watching,people:[...room.people.values()].filter(online).length,capacity:room.capacity});
 }
 return listings.sort((a,b)=>a.title.localeCompare(b.title)||a.code.localeCompare(b.code)).slice(0,Math.min(50,Math.max(0,limit)));
}

