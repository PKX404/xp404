import {WebSocket} from 'ws';
import assert from 'node:assert/strict';

const host='https://xp404.onrender.com';
const wsUrl='wss://xp404.onrender.com/ws';
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function health(){
  let last;
  for(let attempt=1;attempt<=7;attempt++){
    const start=Date.now();
    try{
      const res=await fetch(host+'/health',{signal:AbortSignal.timeout(25000),cache:'no-store'});
      const body=await res.text();
      console.log('health',attempt,res.status,Date.now()-start+'ms',body.slice(0,160));
      if(res.ok){const j=JSON.parse(body);assert.equal(j.ok,true);return;}
      last=new Error('health HTTP '+res.status);
    }catch(e){last=e;console.log('health attempt failed',e.message);}
    await sleep(3500);
  }
  throw last;
}
async function attempt(origin){
  console.log('websocket attempt origin=',origin,'at',new Date().toISOString());
  const start=Date.now();
  const ws=new WebSocket(wsUrl,{origin,handshakeTimeout:20000});
  const messages=[];
  const opened=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('WS connect timeout')),25000);
    ws.once('open',()=>{clearTimeout(timer);resolve();});
    ws.once('unexpected-response',(request,response)=>{clearTimeout(timer);reject(new Error('HTTP upgrade '+response.statusCode));});
    ws.once('error',e=>{clearTimeout(timer);reject(e);});
  });
  try{
    await opened;
    console.log('WS opened',origin,Date.now()-start+'ms');
    ws.on('message',raw=>{try{messages.push(JSON.parse(raw.toString()));}catch{}});
    ws.send(JSON.stringify({type:'create',name:'Connection self-test'}));
    for(let i=0;i<120;i++){
      const welcome=messages.find(m=>m.type==='welcome');
      if(welcome){
        console.log('SUCCESS room welcome',origin,welcome.room.code);
        const res=await fetch(host+'/api/room-status?code='+welcome.room.code,{headers:{Origin:origin}});
        console.log('GET room status',res.status,'ACAO:',res.headers.get('access-control-allow-origin'));
        assert.equal(res.status,200);
        assert.equal(res.headers.get('access-control-allow-origin'),origin);
        ws.close();return;
      }
      const err=messages.find(m=>['error','resume-failed'].includes(m.type));
      if(err)throw new Error('Backend response '+JSON.stringify(err));
      await sleep(100);
    }
    throw new Error('No welcome within 12 seconds; got '+JSON.stringify(messages).slice(0,600));
  }finally{try{ws.terminate();}catch{}}
}
await health();
const cfg=await fetch(host+'/xparty/config.js',{signal:AbortSignal.timeout(20000)});
console.log('hosted client config',cfg.status,(await cfg.text()).slice(0,200));
await attempt('https://xp404.onrender.com');
await attempt('null');
console.log('LIVE SERVER WEBSOCKET AND ROOM API CHECK PASSED');
