/** Close only when every participant is disconnected; a quiet ongoing movie is active. */
export function emptyRoomExpired(room,online,now=Date.now(),timeoutMs=15*60*1000){
 if([...room.people.values()].some(online)){room.emptySince=null;return false;}
 room.emptySince??=now;
 return now-room.emptySince>=timeoutMs;
}
