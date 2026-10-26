import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createXparty} from '../server.mjs';
import {MAX_VIDEO_BYTES,MAX_CALL_SEATS,validRoomCapacity,roomIsFull,normalizeRoomCode,validRoomCode} from '../public/xparty/limits.js';

async function fixture(t){
 const app=createXparty();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());const port=app.server.address().port;
 async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:'http://127.0.0.1:8787'}),queue=[];ws.on('message',data=>queue.push(JSON.parse(data)));await once(ws,'open');return {ws,queue,send:(type,fields={})=>ws.send(JSON.stringify({type,...fields})),async next(type,filter=()=>true){for(let i=0;i<200;i++){const index=queue.findIndex(event=>event.type===type&&filter(event));if(index>=0)return queue.splice(index,1)[0];await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Missing '+type);}};}
 return {app,client,base:`http://127.0.0.1:${port}`};
}
test('explicit room capacity and exact seven-character codes reject ambiguous legacy input',()=>{
 assert.equal(MAX_VIDEO_BYTES,524288000);assert.equal(MAX_CALL_SEATS,6);
 assert.equal(validRoomCapacity(null),true);assert.equal(validRoomCapacity(2),true);assert.equal(validRoomCapacity(500),true);
 for(const value of [undefined,0,1,-1,501,'10','none',2.5])assert.equal(validRoomCapacity(value),false,String(value));
 assert.equal(roomIsFull(null,501),false);assert.equal(roomIsFull(2,2),true);assert.equal(roomIsFull(2,1),false);
 assert.equal(normalizeRoomCode(' abc2345 '),'ABC2345');assert.equal(validRoomCode('ABC2345'),true);
 for(const value of ['ABC234','ABC23456','ABC 234','ABC2301','abc2345',null])assert.equal(validRoomCode(value),false,String(value));
});
test('no room limit admits more than ten members while keeping six call seats, reservations and host capacity controls',async t=>{
 const {app,client,base}=await fixture(t),host=await client();host.send('create',{name:'Host'});const hw=await host.next('welcome');assert.equal(hw.room.capacity,null);const guests=[];
 for(let i=0;i<11;i++){const c=await client();c.send('join',{code:hw.room.code,name:'Guest '+i});guests.push({c,w:await c.next('welcome')});}
 const room=app.rooms.get(hw.room.code);assert.equal(room.people.size,12);assert.equal([...room.people.values()].filter(p=>p.inCall).length,6);
 const watcher=guests.at(-1);watcher.c.send('media',{mic:true,camera:true});watcher.c.send('call-join');assert.match((await watcher.c.next('error')).message,/six call seats/);assert.equal(room.people.get(watcher.w.id).mic,false);assert.equal(room.people.get(watcher.w.id).camera,false);
 watcher.c.send('capacity',{capacity:2});watcher.c.send('ping',{sent:1});await watcher.c.next('pong',m=>m.sent===1);assert.equal(room.capacity,null);
 host.send('capacity',{capacity:10});assert.match((await host.next('error')).message,/reserved reconnect seats/);assert.equal(room.capacity,null);
 watcher.c.ws.close();await once(watcher.c.ws,'close');await host.next('state',m=>m.room.people.some(p=>p.id===watcher.w.id&&!p.online));
 host.send('capacity',{capacity:11});assert.match((await host.next('error')).message,/reserved reconnect seats/);assert.equal(room.capacity,null);
 const resumed=await client();resumed.send('resume',{token:watcher.w.token});assert.equal((await resumed.next('welcome')).room.capacity,null);
 host.send('capacity',{capacity:12});await host.next('state',m=>m.room.capacity===12);assert.equal((await(await fetch(base+'/api/room-status?code='+hw.room.code)).json()).status,'full');
 host.send('room-directory',{visibility:'public',title:'Open party',language:'English'});await host.next('state',m=>m.room.visibility==='public');assert.equal((await(await fetch(base+'/api/rooms/public')).json()).rooms.length,0);
 host.send('lock',{locked:true});await host.next('state',m=>m.room.locked);host.send('capacity',{capacity:null});await host.next('state',m=>m.room.capacity===null&&!m.room.locked);const listing=(await(await fetch(base+'/api/rooms/public')).json()).rooms[0];assert.equal(listing.capacity,null);assert.equal(listing.people,12);
 const extra=await client();extra.send('join',{code:hw.room.code});await extra.next('welcome');assert.equal(room.people.size,13);assert.equal([...room.people.values()].filter(p=>p.inCall).length,6);
 guests[0].c.send('call-leave');await host.next('state',m=>!m.room.people.find(p=>p.id===guests[0].w.id).inCall);resumed.send('call-join');await host.next('state',m=>m.room.people.find(p=>p.id===watcher.w.id)?.seatRequested);host.send('review-seat',{target:watcher.w.id,approve:true});await resumed.next('call-seat-status',m=>m.status==='approved');assert.equal([...room.people.values()].filter(p=>p.inCall).length,6);
});
test('500 MB video sources are accepted, larger ones rejected and the server storage budget stays enforced',async t=>{
 const {app,client}=await fixture(t),a=await client();a.send('create',{capacity:2});const aw=await a.next('welcome');a.send('source',{source:{type:'file',title:'500 MB movie',size:MAX_VIDEO_BYTES,mime:'video/mp4'}});const source=(await a.next('state',m=>m.room.source?.size===MAX_VIDEO_BYTES)).room.source;
 a.send('source',{source:{type:'file',size:MAX_VIDEO_BYTES+1,mime:'video/mp4'}});a.send('ping',{sent:2});await a.next('pong',m=>m.sent===2);assert.equal(app.rooms.get(aw.room.code).source.id,source.id);
 const b=await client();b.send('create');await b.next('welcome');b.send('source',{source:{type:'file',size:MAX_VIDEO_BYTES,mime:'video/mp4'}});await b.next('state',m=>m.room.source?.size===MAX_VIDEO_BYTES);
 const c=await client();c.send('create');const cw=await c.next('welcome');c.send('source',{source:{type:'file',size:30*1024*1024,mime:'video/mp4'}});assert.match((await c.next('error')).message,/storage is busy/);assert.equal(app.rooms.get(cw.room.code).source,null);
});
test('lookup and WebSocket join consistently reject eight-character codes and serve shared limits at the short root',async t=>{
 const {client,base}=await fixture(t),host=await client();host.send('create');const hw=await host.next('welcome');assert.match(hw.room.code,/^[A-Z2-9]{7}$/);
 const response=await fetch(base+'/api/room-status?code='+hw.room.code+'A');assert.equal(response.status,400);assert.match((await response.json()).error,/7-character/);
 const guest=await client();guest.send('join',{code:hw.room.code+'A'});assert.match((await guest.next('error')).message,/7-character/);guest.send('join',{code:hw.room.code.toLowerCase()});assert.equal((await guest.next('welcome')).room.code,hw.room.code);
 assert.equal((await fetch(base+'/limits.js')).status,200);const html=await(await fetch(base+'/')).text();assert.match(html,/id="code" maxlength="7" pattern="\[A-Za-z2-9\]\{7\}"/);assert.match(html,/up to 500 MB/);
});
