import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createXparty} from '../server.mjs';

async function rejected(port, origin) {
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin});
  return await new Promise((resolve,reject)=>{
    ws.once('open',()=>{ws.terminate();reject(new Error('Unexpected WebSocket access from '+origin));});
    ws.once('error',()=>resolve(true));
  });
}

test('Android file-origin access is opt-in, limited to room APIs and websockets',async()=>{
  const old=process.env.ALLOW_ANDROID_FILE_ORIGIN;
  let app;
  try {
    delete process.env.ALLOW_ANDROID_FILE_ORIGIN;
    app=createXparty();
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    await rejected(app.server.address().port,'null');
    await app.close();app=null;

    process.env.ALLOW_ANDROID_FILE_ORIGIN='1';
    app=createXparty();
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const port=app.server.address().port, base=`http://127.0.0.1:${port}`;

    const health=await fetch(base+'/health',{headers:{Origin:'null'}});
    assert.equal(health.status,200);
    assert.equal(health.headers.get('access-control-allow-origin'),'null');
    const preflight=await fetch(base+'/api/room-status',{method:'OPTIONS',headers:{Origin:'null','Access-Control-Request-Method':'GET'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),'null');
    const adminPreflight=await fetch(base+'/owner',{method:'OPTIONS',headers:{Origin:'null','Access-Control-Request-Method':'POST'}});
    assert.equal(adminPreflight.status,403);
    const foreignPreflight=await fetch(base+'/api/room-status',{method:'OPTIONS',headers:{Origin:'https://evil.example'}});
    assert.equal(foreignPreflight.status,403);
    await rejected(port,'https://evil.example');

    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:'null'});
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    ws.send(JSON.stringify({type:'create',name:'Android test'}));
    const welcome=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('No room welcome from backend')),3000);
      ws.on('message',data=>{const msg=JSON.parse(data);if(msg.type==='welcome'){clearTimeout(timeout);resolve(msg);}});
    });
    assert.match(welcome.room.code,/^[A-Z2-9]{7}$/);
    ws.close();
  } finally {
    if(app)await app.close();
    if(old===undefined)delete process.env.ALLOW_ANDROID_FILE_ORIGIN;
    else process.env.ALLOW_ANDROID_FILE_ORIGIN=old;
  }
});
