import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createXparty} from '../server.mjs';
async function client(port){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:'http://127.0.0.1:8787'}),queue=[];ws.on('message',v=>queue.push(JSON.parse(v)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return{send:(type,fields={})=>ws.send(JSON.stringify({type,...fields})),async next(type,filter=()=>true){for(let i=0;i<200;i++){const index=queue.findIndex(v=>v.type===type&&filter(v));if(index>=0)return queue.splice(index,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing '+type);}};}
test('new providers cross real room transport, preserve approval, normalize companion URLs and keep live channels out of seek/buffer holds',async()=>{
 const app=createXparty();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{const port=app.server.address().port,a=await client(port),b=await client(port);a.send('create',{name:'Host'});const host=await a.next('welcome');b.send('join',{name:'Guest',code:host.room.code});await b.next('welcome');const state=app.rooms.get(host.room.code);
  b.send('source',{source:{type:'netflix',url:'https://www.netflix.com/title/81234567?track=secret'}});const pending=(await a.next('state',m=>m.room.requests?.some(q=>q.action.source?.type==='netflix'))).room.requests.at(-1);assert.equal(state.source,null);assert.equal(pending.action.source.url,'https://www.netflix.com/watch/81234567');a.send('review-request',{id:pending.id,approve:true});const netflix=(await b.next('state',m=>m.room.source?.type==='netflix')).room.source;
  b.send('playback',{sourceId:netflix.id,position:10,playing:true,intent:'play'});await b.next('error');assert.equal(state.playback.playing,false);
  a.send('queue-add',{provider:'prime',url:'https://www.primevideo.com/detail/B012345678?ref=test',title:'Prime title'});const queued=(await a.next('state',m=>m.room.queue?.some(q=>q.provider==='prime'))).room.queue.at(-1);assert.equal(queued.url,'https://www.primevideo.com/detail/B012345678');a.send('queue-play',{id:queued.id});await b.next('state',m=>m.room.source?.type==='prime');
  for(const source of [{type:'twitch',videoId:'video:1234567890'},{type:'soundcloud',videoId:'https://soundcloud.com/artist/song'},{type:'twitch',videoId:'channel:twitchdev'}]){a.send('source',{source});await b.next('state',m=>m.room.source?.videoId===source.videoId);assert.equal(state.source.type,source.type);}
  const id=state.source.id;a.send('playback',{sourceId:id,position:0,playing:true,intent:'play'});await b.next('playback',m=>m.playback.playing);b.send('buffering',{sourceId:id,buffering:true});b.send('resync');const live=await b.next('playback',m=>m.resync);assert.deepEqual(live.playback.waitingFor||[],[]);
  a.send('source',{source:{type:'netflix',url:'https://www.netflix.com.evil.test/watch/81234567'}});a.send('profile-details',{target:host.id});await a.next('profile-details');assert.equal(state.source.id,id);
  const zip=await fetch(`http://127.0.0.1:${port}/companion-extension.zip`);assert.equal(zip.status,200);assert.equal(new Uint8Array(await zip.arrayBuffer())[0],80);
 }finally{await app.close();}
});
