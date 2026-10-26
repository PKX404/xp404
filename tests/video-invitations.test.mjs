import test from 'node:test';import assert from 'node:assert/strict';
import {createVideoInvitations} from '../video-invitations.mjs';
function setup(){
 const events=[],timers=[];let clock=0;
 const people=['h','g','o'].map(id=>({id,name:id,ws:{id},inCall:true,camera:false,mic:false,cameraAllowed:id==='h'}));
 const room={hostId:'h',mode:'HOST_APPROVAL',people:new Map(people.map(p=>[p.id,p]))};
 const invites=createVideoInvitations({online:p=>!!p.ws,send:(ws,m)=>{if(ws)events.push({recipient:ws.id,...m});},state:()=>events.push({type:'state'}),rate:()=>true,now:()=>clock,schedule:fn=>{timers.push(fn);return {unref(){}};}});
 return {room,events,timers,people,run:(id,m)=>invites.handle(room,room.people.get(id),m),advance:ms=>clock+=ms};
}
test('video request is targeted; only recipient can accept, and devices remain off',()=>{
 const f=setup();f.run('h',{type:'video-call-request',to:'g'});const q=f.events.find(e=>e.type==='video-call-incoming');assert.equal(q.recipient,'g');assert.equal(f.events.length,2);
 f.run('o',{type:'video-call-response',id:q.id,accept:true});assert.equal(f.people[1].cameraAllowed,false);
 f.run('g',{type:'video-call-response',id:q.id,accept:true});assert.equal(f.people[1].cameraAllowed,true);assert(f.people.every(p=>!p.camera&&!p.mic));assert.equal(f.events.filter(e=>e.status==='accepted').length,2);
 const length=f.events.length;f.run('g',{type:'video-call-response',id:q.id,accept:true});assert.equal(f.events.length,length);
});
test('decline, cancel and expiry cannot activate a call; late acceptance is ignored',()=>{
 for(const mode of ['decline','cancel','expiry']){const f=setup();f.run('h',{type:'video-call-request',to:'g'});const q=f.events[0];
  if(mode==='decline')f.run('g',{type:'video-call-response',id:q.id,accept:false});
  if(mode==='cancel')f.run('h',{type:'video-call-cancel',id:q.id});
  if(mode==='expiry'){f.advance(30001);f.timers[0]();}
  f.run('g',{type:'video-call-response',id:q.id,accept:true});assert.equal(f.people[1].cameraAllowed,false);assert(!f.events.some(e=>e.status==='accepted'));
 }
});
test('seat/host policy, offline recipients and pending requests are enforced',()=>{
 const f=setup();f.run('g',{type:'video-call-request',to:'o'});assert.equal(f.events.at(-1).type,'error');
 f.people[1].inCall=false;f.run('h',{type:'video-call-request',to:'g'});assert.equal(f.events.at(-1).type,'error');
 f.people[1].inCall=true;f.run('h',{type:'video-call-request',to:'g'});const q=f.events.at(-1);
 f.run('o',{type:'video-call-request',to:'h'});assert.equal(f.events.at(-1).type,'error');
 f.people[0].ws=null;f.run('g',{type:'video-call-response',id:q.id,accept:true});assert(!f.events.some(e=>e.status==='accepted'));
});
test('room and recipient binding prevent forged acceptance',()=>{
 const f=setup();f.run('h',{type:'video-call-request',to:'g'});const q=f.events[0];f.run('g',{type:'video-call-response',id:'forged',accept:true});assert.equal(f.people[1].cameraAllowed,false);
 f.room.hostId='o';f.run('g',{type:'video-call-response',id:q.id,accept:true});assert.equal(f.people[1].cameraAllowed,false);
});
