export function tickTogether(room,online,now=Date.now()){
 const delta=Math.max(0,Math.min(1000,now-(room.togetherAt??now)));room.togetherAt=now;
 if(!room.source||!room.playback.playing||room.playback.waitingFor?.length)return;
 const people=[...room.people.values()].filter(p=>online(p)&&p.watchSource===room.source.id&&now-(p.watchingAt||0)<8000);
 room.together??={};
 for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
  const key=[people[i].id,people[j].id].sort().join(':');const pair=room.together[key]??={milliseconds:0,history:[]};pair.milliseconds+=delta;
  let entry=pair.history.find(x=>x.sourceId===room.source.id);if(!entry){entry={sourceId:room.source.id,title:room.source.title,type:room.source.type,startedAt:now,milliseconds:0};pair.history.unshift(entry);pair.history=pair.history.slice(0,20);}entry.milliseconds+=delta;entry.lastWatchedAt=now;
 }
}
export function togetherView(room,viewer,target){
 const key=[viewer,target].sort().join(':'),pair=room.together?.[key];
 const friends=id=>new Set((room.friendRequests||[]).filter(q=>q.status==='accepted'&&(q.from===id||q.to===id)).map(q=>q.from===id?q.to:q.from));
 const mine=friends(viewer),theirs=friends(target);
 return {milliseconds:pair?.milliseconds||0,history:pair?.history||[],mutualFriends:[...mine].filter(id=>theirs.has(id)&&room.people.has(id)).map(id=>({id,name:room.people.get(id).name}))};
}
