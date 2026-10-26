import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createXparty} from '../server.mjs';

const origin='http://localhost:8787';
async function client(port){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin});const queue=[];ws.on('message',d=>queue.push(JSON.parse(d)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return{ws,send:(type,data={})=>ws.send(JSON.stringify({type,...data})),async next(type,predicate=()=>true){const start=Date.now();while(Date.now()-start<2000){const i=queue.findIndex(m=>m.type===type&&predicate(m));if(i!==-1)return queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw new Error('Missing '+type);},queue};}

test('push to talk requires host enable and approval; force sync never changes the shared timeline',async()=>{
 const app=createXparty();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{
 const port=app.server.address().port,a=await client(port),b=await client(port);a.send('create');const aw=await a.next('welcome');b.send('join',{code:aw.room.code});const bw=await b.next('welcome');
 b.send('ptt-enable',{enabled:true});b.send('media',{mic:true,ptt:true});let state=(await a.next('state',m=>m.room.people.length===2&&m.room.people.find(p=>p.id===bw.id)?.mic===false)).room;
 b.send('ping',{sent:1});await b.next('pong',m=>m.sent===1);assert.equal(app.rooms.get(aw.room.code).pttEnabled,undefined);assert.equal(app.rooms.get(aw.room.code).people.get(bw.id).mic,false);
 a.send('ptt-enable',{enabled:true});await b.next('state',m=>m.room.pttEnabled);b.send('ptt-request');await a.next('state',m=>m.room.people.find(p=>p.id===bw.id)?.pttRequested);
 b.send('ptt-review',{target:bw.id,approve:true});b.send('ping',{sent:2});await b.next('pong',m=>m.sent===2);assert.equal(app.rooms.get(aw.room.code).people.get(bw.id).pttApproved,undefined);
 a.send('ptt-review',{target:bw.id,approve:true});await b.next('ptt-status',m=>m.approved);b.send('media',{mic:true,ptt:true});await a.next('state',m=>m.room.people.find(p=>p.id===bw.id)?.mic);
 a.send('ptt-enable',{enabled:false});await b.next('state',m=>!m.room.pttEnabled&&!m.room.people.find(p=>p.id===bw.id)?.mic);
 a.send('party-mode',{mode:'HOST_ONLY'});await b.next('state',m=>m.room.mode==='HOST_ONLY');const prior=JSON.stringify(app.rooms.get(aw.room.code).playback);b.send('resync');await b.next('playback',m=>m.resync);assert.equal(JSON.stringify(app.rooms.get(aw.room.code).playback),prior);assert.equal((app.rooms.get(aw.room.code).requests||[]).length,0);
 }finally{await app.close();}
});
test('buffering leases recover stale waits and the host can keep the timeline running',async()=>{
 const app=createXparty({bufferingLeaseMs:150});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{
 const port=app.server.address().port,a=await client(port),b=await client(port);a.send('create');const aw=await a.next('welcome');b.send('join',{code:aw.room.code});const bw=await b.next('welcome');a.send('source',{source:{type:'youtube',videoId:'dQw4w9WgXcQ'}});const source=(await b.next('state',m=>m.room.source)).room.source;
 assert.equal(aw.room.bufferTogether,false);a.send('buffer-policy',{enabled:true});await b.next('state',m=>m.room.bufferTogether);a.send('playback',{sourceId:source.id,playing:true,position:5});await b.next('playback',m=>m.playback.playing);await a.next('playback',m=>m.playback.playing);b.send('buffering',{sourceId:source.id,buffering:true});await a.next('playback',m=>m.playback.waitingFor?.includes(bw.id));await a.next('playback',m=>m.playback.waitingFor?.length===0);assert.equal(app.rooms.get(aw.room.code).playback.playing,true);
 b.send('buffer-policy',{enabled:false});b.send('ping',{sent:3});await b.next('pong',m=>m.sent===3);assert.equal(app.rooms.get(aw.room.code).bufferTogether,true);
 a.send('buffer-policy',{enabled:false});await b.next('state',m=>m.room.bufferTogether===false);b.send('buffering',{sourceId:source.id,buffering:true});b.send('ping',{sent:4});await b.next('pong',m=>m.sent===4);assert.deepEqual(app.rooms.get(aw.room.code).playback.waitingFor,[]);assert.equal(app.rooms.get(aw.room.code).playback.playing,true);
 }finally{await app.close();}
});
test('watch-only participants can request push to talk without bypassing the six-seat limit',async()=>{
 const app=createXparty();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{
 const port=app.server.address().port,a=await client(port);a.send('create',{capacity:7});const aw=await a.next('welcome');const guests=[];
 for(let i=0;i<6;i++){const c=await client(port);c.send('join',{code:aw.room.code});guests.push({c,w:await c.next('welcome')});}
 const last=guests[5],r=app.rooms.get(aw.room.code);assert.equal(r.people.get(last.w.id).inCall,false);a.send('ptt-enable',{enabled:true});await last.c.next('state',m=>m.room.pttEnabled);last.c.send('ptt-request');await a.next('state',m=>m.room.people.find(p=>p.id===last.w.id)?.pttRequested);
 a.send('ptt-review',{target:last.w.id,approve:true});await a.next('error',m=>m.message.includes('six call seats'));assert.equal(r.people.get(last.w.id).inCall,false);
 guests[0].c.send('call-leave');await a.next('state',m=>!m.room.people.find(p=>p.id===guests[0].w.id)?.inCall);a.send('ptt-review',{target:last.w.id,approve:true});await last.c.next('ptt-status',m=>m.approved);assert.equal(r.people.get(last.w.id).inCall,true);assert.equal([...r.people.values()].filter(p=>p.inCall).length,6);
 }finally{await app.close();}
});
test('delivery acknowledgements require an actual recipient and preserve seen state on resume',async()=>{
 const app=createXparty();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{
 const port=app.server.address().port,a=await client(port),b=await client(port),c=await client(port);a.send('create',{capacity:3});const aw=await a.next('welcome');b.send('join',{code:aw.room.code});const bw=await b.next('welcome');c.send('join',{code:aw.room.code});await c.next('welcome');a.send('chat',{text:'Private delivery',to:bw.id});const message=await b.next('chat');c.send('delivered',{ids:[message.id]});c.send('read',{ids:[message.id]});c.send('ping',{sent:19});await c.next('pong',m=>m.sent===19);const item=app.rooms.get(aw.room.code).history.find(x=>x.id===message.id);assert.equal(item.deliveredBy,undefined);assert.equal(item.readBy,undefined);b.send('delivered',{ids:[message.id]});assert.equal((await a.next('delivered')).id,message.id);b.send('read',{ids:[message.id]});assert.equal((await a.next('read')).id,message.id);assert.deepEqual(item.deliveredBy,[bw.id]);assert.deepEqual(item.readBy,[bw.id]);
 }finally{await app.close();}
});
