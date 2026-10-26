import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {COMPANION_PROVIDERS,parseCompanionLink,normalizeCompanionSource,isCompanionRoomURL,sanitizeCompanionSnapshot,sanitizeCompanionReport} from '../public/xparty/companion-providers.js';
import {companionExtensionZip,handleCompanionDownload} from '../companion.mjs';
import {initCompanion} from '../public/xparty/companion-client.js';

const base=new URL('../browser-extension/',import.meta.url);
const netflix='https://www.netflix.com/watch/81234567';
const sourceId='f5183460-6b19-49dc-b37a-37d077db7912';
const nonce='a'.repeat(32);
const snapshot=(now=Date.now())=>({sourceId,provider:'netflix',videoId:'81234567',url:netflix,position:20,playing:true,localPaused:false,canControl:true,revision:1,sentAt:now});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('companion URLs accept exact providers and canonicalize tracking without accepting lookalikes',()=>{
  assert.deepEqual(COMPANION_PROVIDERS.map(p=>p.id),['netflix','prime']);
  assert.deepEqual(parseCompanionLink('https://www.netflix.com/title/81234567?trackId=secret#fragment'),{type:'netflix',videoId:'81234567',url:netflix,title:'Netflix'});
  assert.equal(parseCompanionLink('https://www.primevideo.com/detail/Some-Title/0ABCDEFGHIJK123456789?ref=abc').url,'https://www.primevideo.com/detail/0ABCDEFGHIJK123456789');
  assert.equal(parseCompanionLink('https://www.amazon.in/gp/video/detail/B0ABCDEFGH/ref=atv_dp').videoId,'B0ABCDEFGH');
  for(const url of ['http://www.netflix.com/watch/81234567','https://www.netflix.com.evil.test/watch/81234567','https://evil.test/?url='+netflix,'https://user:secret@www.netflix.com/watch/81234567','https://www.netflix.com:8443/watch/81234567','https://www.netflix.com/watch/123','https://www.primevideo.com/detail/abc','https://www.amazon.com/dp/B0ABCDEFGH','javascript:alert(1)'])assert.equal(parseCompanionLink(url),null,url);
  assert.equal(normalizeCompanionSource({type:'prime',url:netflix}),null);
  assert.equal(normalizeCompanionSource({type:'netflix',url:netflix,videoId:'88888888'}),null);
});

test('room allowlist is exact and protocol strips credentials, identifiers, and unrecognized commands',()=>{
  for(const url of ['https://pkxparty.onrender.com/','https://pkxparty.onrender.com/xparty/','https://pkx404.github.io/xparty/','http://127.0.0.1:8799/'])assert.equal(isCompanionRoomURL(url),true);
  for(const url of ['https://pkxparty.onrender.com.evil.test/','https://pkx404.github.io/other/','http://127.0.0.1:5555/','http://localhost:8787/untrusted/','https://name:password@pkxparty.onrender.com/','http://pkxparty.onrender.com/'])assert.equal(isCompanionRoomURL(url),false);
  const clean=sanitizeCompanionSnapshot({...snapshot(),token:'ROOM_TOKEN',roomCode:'SECRET',user:{id:'SECRET'},arbitrary:'command'});
  assert.equal('token' in clean,false);assert.equal('roomCode' in clean,false);assert.equal('user' in clean,false);assert.equal('arbitrary' in clean,false);
  assert.equal(sanitizeCompanionSnapshot({...snapshot(),position:Infinity}),null);
  assert.equal(sanitizeCompanionSnapshot({...snapshot(),sentAt:Date.now()-16000}),null);
  assert.equal(sanitizeCompanionSnapshot({...snapshot(),sourceId:'../script'}),null);
  assert.equal(sanitizeCompanionReport({sourceId,seq:1,kind:'eval',code:'alert(1)'}),null);
  assert.deepEqual(sanitizeCompanionReport({sourceId,seq:1,kind:'intent',intent:'seek',position:20,playing:true,duration:100,token:'secret'}),{sourceId,seq:1,kind:'intent',intent:'seek',position:20,playing:true,duration:100});
});

test('packaged protocol is generated from the server and app source without drift',async()=>{
  const source=await readFile(new URL('../public/xparty/companion-providers.js',import.meta.url),'utf8');
  const names=[...source.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map(m=>m[1]);
  const expected='// Generated from public/xparty/companion-providers.js by build.mjs.\n(()=>{\n'+source.replace(/export\s+(?=const|function)/g,'')+'\nglobalThis.XPartyCompanionProtocol=Object.freeze({'+names.join(',')+'});\n})();\n';
  assert.equal(await readFile(new URL('protocol.js',base),'utf8'),expected);
});

test('download ZIP contains only the fixed companion package and route refuses writes',async()=>{
  const zip=await companionExtensionZip(),contents=new Map();let position=0;
  while(zip.readUInt32LE(position)===0x04034b50){const length=zip.readUInt32LE(position+18),nameLength=zip.readUInt16LE(position+26),extra=zip.readUInt16LE(position+28),name=zip.subarray(position+30,position+30+nameLength).toString(),start=position+30+nameLength+extra;contents.set(name,zip.subarray(start,start+length));position=start+length;}
  assert.equal(contents.size,9);assert.equal(zip.readUInt32LE(position),0x02014b50);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
  const manifest=JSON.parse(contents.get('xparty-companion/manifest.json'));
  assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['storage']);assert.equal(manifest.host_permissions.includes('<all_urls>'),false);
  const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  assert.equal(await handleCompanionDownload({method:'POST'},response,new URL('https://x/companion-extension.zip')),true);assert.equal(response.status,405);
  assert.equal(await handleCompanionDownload({method:'HEAD'},response,new URL('https://x/companion-extension.zip')),true);assert.equal(response.status,200);assert.equal(response.body,undefined);
  assert.equal(await handleCompanionDownload({method:'GET'},response,new URL('https://x/browser-extension/../secret')),false);
});

async function workerHarness(){
  let listener,nextTabId=50;const sent=[],created=[],stored=[];let now=Date.now();
  const callbacks={};
  const chrome={runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:fn=>{listener=fn;}}},storage:{session:{get:async()=>({pairs:[]}),set:async value=>{stored.push(value);}}},tabs:{create:async value=>{created.push(value);return {id:nextTabId++,windowId:1};},remove:async()=>{},sendMessage:async(id,message)=>{sent.push({id,message});},update:async id=>({id,windowId:1}),onRemoved:{addListener:fn=>{callbacks.remove=fn;}},onUpdated:{addListener:fn=>{callbacks.update=fn;}}},windows:{update:async()=>{}}};
  class Clock extends Date{static now(){return now;}}
  const context=vm.createContext({chrome,Date:Clock,URL,console});
  vm.runInContext(await readFile(new URL('protocol.js',base),'utf8'),context);
  vm.runInContext((await readFile(new URL('worker.js',base),'utf8')).replace("import './protocol.js';",''),context);
  const send=(message,sender)=>new Promise(resolve=>listener(message,sender,resolve));
  return {send,sent,created,stored,callbacks,setNow:value=>{now=value;},get now(){return now;}};
}
const roomSender={tab:{id:1},frameId:0,documentId:'room-document',url:'https://pkxparty.onrender.com/xparty/'};
const providerSender={tab:{id:50},frameId:0,documentId:'provider-document',url:netflix};

test('worker pairs only approved room top documents and strips every extra field before the provider',async()=>{
  const h=await workerHarness();
  assert.equal((await h.send({type:'room-connect',nonce,snapshot:snapshot(h.now)},{...roomSender,url:'https://evil.test/'})).ok,false);
  assert.equal((await h.send({type:'room-connect',nonce,snapshot:snapshot(h.now)},{...roomSender,frameId:1})).ok,false);
  assert.equal(h.created.length,0);
  assert.equal((await h.send({type:'room-connect',nonce,snapshot:{...snapshot(h.now),token:'secret'}},roomSender)).ok,true);
  assert.equal(h.created[0].url,netflix);
  const ready=await h.send({type:'provider-hello'},providerSender);assert.equal(ready.ok,true);assert.equal(ready.nonce,nonce);assert.equal('token' in ready.snapshot,false);
  assert.equal((await h.send({type:'provider-hello'},{...providerSender,tab:{id:51}})).ok,false);
  assert.equal((await h.send({type:'room-snapshot',nonce,snapshot:snapshot(h.now)},{...roomSender,documentId:'stale-room-document'})).ok,false);
  assert.equal((await h.send({type:'room-snapshot',nonce,snapshot:{...snapshot(h.now),sourceId:'different-source-id'}},roomSender)).ok,false);
});

test('worker rejects unpaired and stale provider messages and relays intents only to the bound room',async()=>{
  const h=await workerHarness();await h.send({type:'room-connect',nonce,snapshot:snapshot(h.now)},roomSender);await h.send({type:'provider-hello'},providerSender);
  const report={sourceId,seq:1,kind:'intent',intent:'pause',position:20,duration:100,playing:false,token:'secret'};
  for(const sender of [{...providerSender,frameId:1},{...providerSender,documentId:'old-document'},{...providerSender,url:'https://www.netflix.com/watch/99999999'},{...providerSender,tab:{id:77}}])assert.equal((await h.send({type:'provider-report',nonce,report},sender)).ok,false);
  assert.equal((await h.send({type:'provider-report',nonce:'b'.repeat(32),report},providerSender)).ok,false);
  assert.equal((await h.send({type:'provider-report',nonce,report:{...report,sourceId:'another-source-id'}},providerSender)).ok,false);
  const before=h.sent.length;assert.equal((await h.send({type:'provider-report',nonce,report},providerSender)).ok,true);
  assert.equal(h.sent.length,before+1);assert.equal(h.sent.at(-1).id,1);assert.equal(h.sent.at(-1).message.report.intent,'pause');assert.equal('token' in h.sent.at(-1).message.report,false);
  assert.equal((await h.send({type:'provider-report',nonce,report},providerSender)).ok,false);
  await h.send({type:'room-disconnect',nonce,sourceId},roomSender);
  assert.equal((await h.send({type:'provider-report',nonce,report:{...report,seq:2}},providerSender)).ok,false);
  assert.equal(h.sent.some(m=>m.id===50&&m.message.type==='detach'),true);
});

test('worker expires absent room heartbeats and tab close clears the pair',async()=>{
  const h=await workerHarness();await h.send({type:'room-connect',nonce,snapshot:snapshot(h.now)},roomSender);
  h.setNow(h.now+16000);assert.equal((await h.send({type:'provider-hello'},providerSender)).ok,false);
  assert.equal(h.sent.some(m=>m.id===1&&m.message.disconnected),true);
  await h.send({type:'room-connect',nonce,snapshot:snapshot(h.now)},roomSender);h.callbacks.remove(1);await flush();
  assert.equal((await h.send({type:'provider-hello'},{...providerSender,tab:{id:51}})).ok,false);
});

async function providerHarness(){
  let now=Date.now(),listener,interval,ad=false;const sent=[],events=new Map();
  const video={readyState:4,duration:100,currentTime:0,paused:true,ended:false,clientWidth:640,clientHeight:360,seekable:{length:1,start:()=>0,end:()=>100},getBoundingClientRect:()=>({width:640,height:360}),plays:0,pauses:0,play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.pauses++;this.paused=true;}};
  const location={href:netflix};
  const document={querySelectorAll:selector=>selector==='video'?[video]:ad?[video]:[],addEventListener:(name,fn)=>events.set(name,fn)};
  class Clock extends Date{static now(){return now;}}
  const chrome={runtime:{sendMessage:async m=>{sent.push(m);return m.type==='provider-hello'?{ok:true,nonce,snapshot:snapshot(now)}:{ok:true};},onMessage:{addListener:fn=>{listener=fn;}}}};
  const window={};const context=vm.createContext({chrome,Date:Clock,URL,console,document,window,top:window,location,getComputedStyle:()=>({visibility:'visible'}),setInterval:fn=>{interval=fn;}});
  vm.runInContext(await readFile(new URL('protocol.js',base),'utf8'),context);vm.runInContext(await readFile(new URL('provider.js',base),'utf8'),context);await flush();
  return {video,sent,events,location,message:m=>listener(m),tick:()=>interval(),setAd:value=>{ad=value;},setNow:value=>{now=value;},get now(){return now;}};
}

test('provider applies standard video controls without feedback and forwards only recent user actions',async()=>{
  const h=await providerHarness();assert.equal(h.video.currentTime,20);assert.equal(h.video.plays,1);
  h.events.get('play')({target:h.video});assert.equal(h.sent.some(m=>m.report?.kind==='intent'),false);
  h.setNow(h.now+2000);h.events.get('pause')({target:h.video});assert.equal(h.sent.some(m=>m.report?.kind==='intent'),false);
  h.events.get('click')({isTrusted:true});h.video.paused=true;h.events.get('pause')({target:h.video});assert.equal(h.sent.at(-1).report.intent,'pause');
  h.message({type:'snapshot',nonce,snapshot:{...snapshot(h.now),playing:false,revision:2}});assert.equal(h.video.plays,1);
  h.message({type:'snapshot',nonce:'b'.repeat(32),snapshot:{...snapshot(h.now),playing:true,revision:3}});assert.equal(h.video.plays,1);
});

test('provider does not control a different title or detected adverts and stops with a stale source',async()=>{
  const h=await providerHarness();const plays=h.video.plays;
  h.video.paused=true;h.location.href='https://www.netflix.com/watch/99999999';h.message({type:'snapshot',nonce,snapshot:snapshot(h.now)});assert.equal(h.video.plays,plays);assert.equal(h.sent.at(-1).report.status,'wrong-title');
  h.location.href=netflix;h.setAd(true);h.message({type:'snapshot',nonce,snapshot:snapshot(h.now)});assert.equal(h.video.plays,plays);assert.equal(h.sent.at(-1).report.status,'ad-break');
  h.setAd(false);h.setNow(h.now+9000);h.tick();assert.equal(h.video.plays,plays);
});

test('room bridge requires the same top window and a real recent click before opening a provider',async()=>{
  let receive,gesture;const sent=[],posted=[];
  const window={addEventListener:(type,fn)=>{if(type==='message')receive=fn;},postMessage:message=>posted.push(message)};
  const location={href:'https://pkxparty.onrender.com/xparty/',origin:'https://pkxparty.onrender.com'};
  const chrome={runtime:{sendMessage:async message=>{sent.push(message);return {ok:true};},onMessage:{addListener:()=>{}}}};
  const context=vm.createContext({window,top:window,location,chrome,Date,URL,document:{addEventListener:(type,fn)=>{gesture=fn;}}});
  vm.runInContext(await readFile(new URL('protocol.js',base),'utf8'),context);vm.runInContext(await readFile(new URL('room-bridge.js',base),'utf8'),context);
  const data={channel:'xparty-companion-v1',direction:'to-extension',type:'connect',nonce,requestId:'b'.repeat(32),snapshot:{...snapshot(),token:'secret'}};
  receive({source:{},origin:location.origin,data});receive({source:window,origin:'https://evil.test',data});assert.equal(sent.length,0);
  receive({source:window,origin:location.origin,data});assert.equal(sent.length,0);assert.equal(posted.at(-1).result.ok,false);
  gesture({isTrusted:false});receive({source:window,origin:location.origin,data});assert.equal(sent.length,0);
  gesture({isTrusted:true});receive({source:window,origin:location.origin,data});await flush();assert.equal(sent.length,1);assert.equal('token' in sent[0].snapshot,false);assert.equal(sent[0].type,'room-connect');
});

test('app companion bridges only bounded playback and invalidates the old source on room changes',async()=>{
  const oldWindow=globalThis.window,oldLocation=globalThis.location;
  const handlers=new Map(),posted=[],intents=[],changes=[];
  const location={origin:'https://pkxparty.onrender.com'};
  const window={addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type),postMessage:message=>{
    posted.push(message);if(['probe','connect','focus'].includes(message.type))queueMicrotask(()=>receive({type:'response',requestId:message.requestId,nonce:message.nonce,result:{ok:true}}));
  }};
  const receive=message=>handlers.get('message')?.({source:window,origin:location.origin,data:{channel:'xparty-companion-v1',direction:'from-extension',...message}});
  globalThis.window=window;globalThis.location=location;
  const context={room:{code:'DO_NOT_FORWARD',hostId:'host',source:{...parseCompanionLink(netflix),id:sourceId},playback:{position:20,playing:true,revision:1,updatedAt:Date.now()}},me:'host',token:'DO_NOT_FORWARD',connected:true};
  let client;
  try{
    client=initCompanion({getContext:()=>context,onIntent:value=>intents.push(value),onChange:value=>changes.push(value)});
    assert.equal(await client.connect(),true);const pair=posted.find(m=>m.type==='connect');assert.equal(client.getState().connected,true);
    assert.equal(JSON.stringify(posted).includes('DO_NOT_FORWARD'),false);
    const report={kind:'intent',intent:'pause',position:25,duration:100,playing:false,seq:1,sourceId};
    receive({type:'event',nonce:'b'.repeat(32),sourceId,report});assert.equal(intents.length,0);
    receive({type:'event',nonce:pair.nonce,sourceId,report});assert.equal(intents.length,1);assert.equal(client.currentTime(),25);
    receive({type:'event',nonce:pair.nonce,sourceId,report});assert.equal(intents.length,1);
    context.room={...context.room,source:{...context.room.source,id:'different-source-id'}};client.update();assert.equal(client.getState().connected,false);assert.equal(client.currentTime(),0);assert.equal(posted.at(-1).type,'disconnect');
    receive({type:'event',nonce:pair.nonce,sourceId,report:{...report,seq:2}});assert.equal(intents.length,1);
  }finally{client?.dispose();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;}
});
