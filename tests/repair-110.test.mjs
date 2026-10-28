import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {createXparty} from '../server.mjs';

async function client(port){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:'http://localhost:8787'}),queue=[];ws.on('message',v=>queue.push(JSON.parse(v)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {queue,send:(type,data={})=>ws.send(JSON.stringify({type,...data})),async next(type,fn=()=>true){for(let n=0;n<200;n++){const i=queue.findIndex(m=>m.type===type&&fn(m));if(i>=0)return queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing '+type);}};}

test('chat retries stay idempotent and reactions obey private message visibility',async()=>{
 const app=createXparty();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{
  const port=app.server.address().port,a=await client(port),b=await client(port),c=await client(port);a.send('create');const aw=await a.next('welcome');b.send('join',{code:aw.room.code});const bw=await b.next('welcome');c.send('join',{code:aw.room.code});await c.next('welcome');
  const clientId=randomUUID();a.send('chat',{text:'Once only',clientId});const publicMessage=await b.next('chat');await a.next('chat');await c.next('chat');a.send('chat',{text:'Once only',clientId});const repeat=await a.next('chat');assert.equal(repeat.id,publicMessage.id);assert.equal(app.rooms.get(aw.room.code).history.filter(m=>m.text==='Once only').length,1);
  b.send('message-reaction',{id:publicMessage.id,emoji:'❤️',active:true});const reacted=await a.next('message-update');assert.deepEqual(reacted.message.reactions['❤️'],[bw.id]);await c.next('message-update');b.send('message-reaction',{id:publicMessage.id,emoji:'❤️',active:false});const unreacted=await a.next('message-update',m=>!m.message.reactions['❤️']);assert.equal(unreacted.message.id,publicMessage.id);
  a.send('chat',{text:'Private',to:bw.id,clientId:randomUUID()});const privateMessage=await b.next('chat',m=>m.text==='Private');a.queue.length=0;c.queue.length=0;c.send('message-reaction',{id:privateMessage.id,emoji:'👍',active:true});c.send('ping',{sent:56});await c.next('pong',m=>m.sent===56);assert.equal(app.rooms.get(aw.room.code).history.find(m=>m.id===privateMessage.id).reactions,undefined);b.send('message-reaction',{id:privateMessage.id,emoji:'👍',active:true});await a.next('message-update',m=>m.message.id===privateMessage.id);b.send('ping',{sent:57});await b.next('pong',m=>m.sent===57);assert.equal(c.queue.some(m=>m.type==='message-update'&&m.message.id===privateMessage.id),false);
 }finally{await app.close();}
});
