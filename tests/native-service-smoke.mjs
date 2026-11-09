import {WebSocket} from 'ws';
import assert from 'node:assert/strict';

const host='https://xparty-native-room.onrender.com';
const wsUrl='wss://xparty-native-room.onrender.com/ws';
const origin=host;
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function liveHealth(){
  let last;
  for(let i=0;i<6;i++){
    try{
      const res=await fetch(host+'/health',{signal:AbortSignal.timeout(22000),cache:'no-store'});
      const body=await res.text();
      console.log('HEALTH',res.status,body.slice(0,180));
      if(res.ok){assert.equal(JSON.parse(body).ok,true);return;}
      last=Error('Backend HTTP '+res.status);
    }catch(e){last=e;console.log('Backend waking up:',e.message);}
    await delay(5000);
  }
  throw last;
}
async function connect(command){
  const socket=new WebSocket(wsUrl,{origin,handshakeTimeout:22000});
  const welcome=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Room response timeout')),28000);
    socket.once('open',()=>socket.send(JSON.stringify(command)));
    socket.once('error',e=>{clearTimeout(timer);reject(e);});
    socket.on('message',raw=>{
      try{
        const data=JSON.parse(raw.toString());
        if(data.type==='welcome'){clearTimeout(timer);resolve(data);}
        else if(data.type==='error'||data.type==='resume-failed'){
          clearTimeout(timer);reject(Error(JSON.stringify(data)));
        }
      }catch(e){clearTimeout(timer);reject(e);}
    });
  });
  console.log('WELCOME',command.type,welcome.room.code);
  return {socket,welcome};
}
await liveHealth();
const hostSession=await connect({type:'create',name:'Native smoke host'});
const guestSession=await connect({type:'join',name:'Native smoke guest',code:hostSession.welcome.room.code});
assert.equal(guestSession.welcome.room.code,hostSession.welcome.room.code);
const roomCode=hostSession.welcome.room.code;
const response=await fetch(host+'/api/room-status?code='+roomCode,{headers:{Origin:origin}});
console.log('ROOM STATUS',response.status,await response.text());
assert.equal(response.status,200);
guestSession.socket.send(JSON.stringify({type:'chat',text:'Native backend chat verification'}));
await delay(900);
guestSession.socket.send(JSON.stringify({type:'leave'}));
hostSession.socket.send(JSON.stringify({type:'end-room'}));
guestSession.socket.close();hostSession.socket.close();
console.log('NATIVE BACKEND HEALTH, CREATE, JOIN, CHAT, ROOM API PASS');
