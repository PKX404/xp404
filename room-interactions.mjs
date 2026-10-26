import {randomUUID} from 'node:crypto';
import {isLiveSource} from './public/xparty/providers.js';

// Room-scoped controls. No account IDs, private messages, or authentication tokens
// are copied into public pins or voting candidates.
export function createRoomInteractions({send,state,choose,online,rate,now=Date.now,schedule=setTimeout}) {
  const active = r => r.endVote?.sourceId === r.source?.id ? r.endVote : null;
  function view(r) {
    const vote=active(r);
    return {pinnedQuote:r.pinnedQuote||null,endVote:vote?{
      id:vote.id,sourceId:vote.sourceId,deadline:vote.deadline,closed:vote.closed,
      candidates:vote.candidates.map(c=>({...c,count:Object.values(vote.votes).filter(id=>id===c.id).length})),
      votes:vote.votes
    }:null};
  }
  function play(r,v,id) {
    const host=r.people.get(r.hostId),item=v.candidates.find(c=>c.id===id);
    if(!item||!host||!online(host)||active(r)!==v)return false;
    const result=choose(r,host,item.source);
    if(result!==false){r.endVote=null;r.queue=r.queue.filter(q=>q.id!==item.queueId);r.playback={...r.playback,playing:true,updatedAt:now(),revision:(r.playback.revision||0)+1};state(r);return true;}
    return false;
  }
  function start(r,candidates) {
    const v=active(r);if(!v||v.candidates.length||!candidates.length)return;
    v.candidates=candidates.slice(0,12);v.deadline=now()+20000;
    schedule(()=>{
      if(active(r)!==v)return;
      v.closed=true;
      const counts=new Map();for(const id of Object.values(v.votes))counts.set(id,(counts.get(id)||0)+1);
      const winner=[...v.candidates].sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0))[0];
      if(r.autoAdvance!==false&&winner&&counts.get(winner.id)&&play(r,v,winner.id))return;
      state(r);
    },20000)?.unref?.();
  }
  function handle(r,p,m) {
    const host=p.id===r.hostId;
    if(m.type==='pin-message'){
      if(!host||!rate('pin:'+p.id,10,10000))return true;
      if(m.id===null)r.pinnedQuote=null;
      else {const msg=r.history.find(x=>x.id===m.id&&!x.to&&x.text);if(!msg)return true;
        r.pinnedQuote={id:msg.id,from:msg.from,name:msg.name,text:msg.text.slice(0,500)};}
      state(r);return true;
    }
    if(m.type==='member-report'){
      const target=r.people.get(m.target),owner=r.people.get(r.hostId),reason=String(m.reason||'').trim().slice(0,500);
      if(!target||target===p||!reason||!rate('report:'+p.id,3,60000))return true;
      if(!owner||!online(owner))return send(p.ws,{type:'error',message:'The room host is offline. Report was not sent.'}),true;
      if(target===owner)return send(p.ws,{type:'error',message:'This report goes to the room host. You can block them for yourself or leave the room.'}),true;
      send(owner.ws,{type:'member-report',from:p.id,name:p.name,target:target.id,targetName:target.name,reason});
      send(p.ws,{type:'report-sent'});return true;
    }
    if(m.type==='playback-ended'){
      if(!host||!r.source||m.sourceId!==r.source.id||isLiveSource(r.source)||active(r))return true;
      r.playback={...r.playback,playing:false,revision:(r.playback.revision||0)+1};
      r.endVote={id:randomUUID(),sourceId:r.source.id,candidates:[],votes:{},deadline:null,closed:false};
      start(r,(r.queue||[]).filter(q=>q.provider!=='file').map(q=>({id:q.id,queueId:q.id,title:q.title,
        source:{type:q.provider||'youtube',videoId:q.videoId,url:q.url,title:q.title,...(q.radio?{radio:true}:{})}})));
      state(r);return true;
    }
    if(m.type==='end-suggestions'){
      const v=active(r);if(!host||!v||m.roundId!==v.id||v.candidates.length||v.closed)return true;
      const seen=new Set();const items=(Array.isArray(m.items)?m.items:[]).slice(0,12).filter(x=>x&&/^[\w-]{11}$/.test(x.id||'')&&x.id!==r.source.videoId&&!seen.has(x.id)&&seen.add(x.id));
      start(r,items.map(x=>({id:randomUUID(),title:String(x.title||'YouTube video').slice(0,150),source:{type:'youtube',videoId:x.id,title:String(x.title||'YouTube video').slice(0,150)}})));
      state(r);return true;
    }
    if(['end-vote','end-play','end-dismiss'].includes(m.type)){
      const v=active(r);if(!v||m.roundId!==v.id)return true;
      if(m.type==='end-dismiss'){if(host){v.closed=true;v.candidates=[];v.deadline=null;state(r);}return true;}
      if(m.type==='end-play'){if(host)play(r,v,m.id);return true;}
      if(!v.closed&&v.deadline>now()&&!p.chatBlocked&&v.candidates.some(c=>c.id===m.id)&&rate('end-vote:'+p.id,12,10000)){
        v.votes[p.id]=m.id;state(r);
      }return true;
    }
    return false;
  }
  return {handle,view};
}
