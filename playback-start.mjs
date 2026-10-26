export function startSelectedPlayback(room,online,now=Date.now){
 const source=room.source,host=room.people.get(room.hostId);
 if(!source||room.autoStartSource!==source.id||!host?.ready||!online(host))return false;
 if(source.type==='file'&&(!source.uploaded||[...room.people.values()].some(p=>online(p)&&!p.ready)))return false;
 room.autoStartSource=null;room.playback={position:0,playing:true,updatedAt:now(),revision:room.playback.revision+1};return true;
}
