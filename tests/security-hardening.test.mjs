import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createXparty} from '../server.mjs';

async function fixture(){
 const app=createXparty(),pending=[];
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const port=app.server.address().port;
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws',{origin:'http://localhost:8787'});
 ws.on('message',raw=>pending.push(JSON.parse(raw)));
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const send=(type,fields={})=>ws.send(JSON.stringify({type,...fields}));
 const next=async(type,condition=()=>true)=>{
  const until=Date.now()+1500;
  while(Date.now()<until){
   const index=pending.findIndex(message=>message.type===type&&condition(message));
   if(index!==-1)return pending.splice(index,1)[0];
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('No '+type);
 };
 send('create',{name:'Host'});
 const welcome=await next('welcome');
 return {app,ws,pending,send,next,welcome,port,close:async()=>{
  ws.terminate();
  await app.close();
 }};
}

test('guards untrusted pong payloads while preserving numerical room RTT probes',async()=>{
 const f=await fixture();
 try{
  f.pending.length=0;
  f.send('ping',{sent:{oversized:'untrusted object'}});
  f.send('ping',{sent:'not-a-timestamp'});
  f.send('ping',{sent:Date.now()});
  const pong=await f.next('pong');
  assert.equal(typeof pong.sent,'number');
  await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(f.pending.some(event=>event.type==='pong'),false,'invalid ping payload should never be echoed');
 }finally{await f.close();}
});

test('chat floods are throttled without allowing replay messages to duplicate',async()=>{
 const f=await fixture();
 try{
  const code=f.welcome.room.code;
  f.pending.length=0;
  for(let i=0;i<14;i++)f.send('chat',{text:'test message '+i});
  await f.next('error',m=>/too quickly/i.test(m.message));
  const room=f.app.rooms.get(code);
  assert.equal(room.history.filter(x=>x.type==='chat').length,12);
  const last=room.history.at(-1);
  assert.equal(last.text,'test message 11');
  f.send('chat',{text:'another after limit'});
  await f.next('error',m=>/too quickly/i.test(m.message));
  assert.equal(room.history.filter(x=>x.type==='chat').length,12);
 }finally{await f.close();}
});

test('excessive rename requests cannot force unlimited room-state broadcasts',async()=>{
 const f=await fixture();
 try{
  const room=f.app.rooms.get(f.welcome.room.code);
  for(let i=1;i<=7;i++)f.send('rename',{name:'New Name '+i});
  await new Promise(resolve=>setTimeout(resolve,140));
  assert.equal(room.people.get(f.welcome.id).name,'New Name 4');
 }finally{await f.close();}
});

test('duplicate readiness messages do not create another state broadcast',async()=>{
 const f=await fixture();
 try{
  const room=f.app.rooms.get(f.welcome.room.code);
  f.send('source',{source:{type:'youtube',videoId:'dQw4w9WgXcQ',title:'Test video'}});
  await f.next('state',m=>m.room.source?.type==='youtube');
  f.pending.length=0;
  const id=room.source.id;
  f.send('ready',{sourceId:id,ready:true,status:'Ready'});
  await f.next('state',m=>m.room.people[0].ready===true);
  f.pending.length=0;
  f.send('ready',{sourceId:id,ready:true,status:'Ready'});
  await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(f.pending.filter(m=>m.type==='state').length,0);
 }finally{await f.close();}
});

test('attachment names remove Unicode direction overrides',async()=>{
 const f=await fixture();
 try{
  const bytes=Buffer.from('test');
  const filename='proof\u202ecod.exe.png';
  const result=await fetch('http://127.0.0.1:'+f.port+'/api/attachment',{
   method:'POST',headers:{Authorization:'Bearer '+f.welcome.token,'X-Attachment-Name':encodeURIComponent(filename)},
   body:bytes
  });
  assert.equal(result.status,201);
  const data=await result.json();
  assert.equal(data.attachment.name.includes('\u202e'),false);
 }finally{await f.close();}
});
