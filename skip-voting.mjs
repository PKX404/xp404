// Votes are scoped to the current source and evaluated against current online members.
const eligible=(r,online)=>[...r.people.values()].filter(p=>online(p)).map(p=>p.id);
export function resetSkipVotes(r){r.skipVotes=[];r.skipSourceId=r.source?.id||null;}
export function skipState(r,online){
 const ids=eligible(r,online),sourceId=r.source?.id||null;
 const votes=r.skipEnabled&&r.skipSourceId===sourceId?[...new Set(r.skipVotes||[])].filter(id=>ids.includes(id)):[];
 const threshold=Math.floor(ids.length/2)+1;
 const available=!!(r.skipEnabled&&sourceId&&r.people.has(r.hostId)&&online(r.people.get(r.hostId))&&r.queue?.some(q=>/^[\w-]{11}$/.test(q.videoId)));
 return {enabled:r.skipEnabled===true,sourceId,votes,count:votes.length,eligible:ids.length,threshold,available,ready:available&&ids.length>=2&&votes.length>=threshold};
}
export function configureSkip(r,person,m,online){
 if(!person||r.people.get(person.id)!==person||!online(person))return false;
 if(m.type==='skip-settings'){
  if(person.id!==r.hostId||typeof m.enabled!=='boolean')return false;
  r.skipEnabled=m.enabled;resetSkipVotes(r);return true;
 }
 if(m.type!=='skip-vote'||!r.skipEnabled||!r.source?.id||m.sourceId!==r.source.id||!r.queue?.some(q=>/^[\w-]{11}$/.test(q.videoId)))return false;
 if(r.skipSourceId!==r.source.id)resetSkipVotes(r);
 const votes=skipState(r,online).votes;r.skipVotes=votes.includes(person.id)?votes.filter(id=>id!==person.id):[...votes,person.id];return true;
}
