// Native message-port and renderer contract. PixelCopy requires Android device QA.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{
 const {createXparty}=await import('../server.mjs'),base='http://127.0.0.1:8811',app=createXparty();await new Promise(r=>app.server.listen(8811,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({userAgent:'Xparty ambient fixture XpartyAndroid/1.1',viewport:{width:1000,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/health');await page.setContent('<style>#watch-stage{width:640px;height:360px}iframe{width:100%;height:100%;border:0}</style><div id="room"><div id="watch-stage"><div id="youtube-wrap"><iframe title="YouTube fixture" srcdoc="player"></iframe></div><div id="vimeo-player" hidden><iframe title="Vimeo fixture" srcdoc="player"></iframe></div><video id="file-player"></video></div></div>');await page.addStyleTag({url:base+'/xparty/ambient.css'});
  await page.evaluate(async()=>{
   // Force the real-frame fallback: this must not degrade to a palette animation.
   const context=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl'?null:context.call(this,kind,...args);};
   const {initNativeVideo}=await import('/xparty/native-video.js'),{initAmbient}=await import('/xparty/ambient.js');
   window.testRoom={source:null,playback:{playing:true}};
   window.bridge=initNativeVideo({onState:()=>ambient.update()});window.ambient=initAmbient({frameBridge:bridge,getContext:()=>({room:testRoom,playing:testRoom.playback.playing,position:3})});
   testRoom.source={type:'youtube',id:'youtube-source',videoId:'dQw4w9WgXcQ'};ambient.update();
   const channel=new MessageChannel();window.engine=channel.port1;window.commands=[];window.sequence=0;
   const canvas=document.createElement('canvas');canvas.width=20;canvas.height=12;canvas.getContext('2d').fillRect(0,0,20,12);window.fixtureImage=canvas.toDataURL();
   window.emitFrame=fields=>{const config=commands.filter(x=>x.type==='ambient-watch'&&x.enabled).at(-1);engine.postMessage(JSON.stringify({type:'ambient-frame',sourceId:config?.sourceId,generation:config?.generation,sequence:++sequence,image:fixtureImage,...fields}));};
   engine.onmessage=e=>{const m=JSON.parse(e.data);commands.push(m);if(m.type==='hello')engine.postMessage(JSON.stringify({type:'available',ambientSupported:true}));};
   window.dispatchEvent(new MessageEvent('message',{data:'xparty-native-video-v1',source:null,ports:[channel.port2]}));
  });
  await page.waitForFunction(()=>commands.some(x=>x.type==='ambient-watch'&&x.enabled&&x.kind==='youtube'));
  assert.equal(await page.locator('.room-ambient-layer').getAttribute('data-mode'),'fluid');
  await page.evaluate(()=>emitFrame({sourceId:'stale-source'}));await page.waitForTimeout(60);assert.equal(await page.locator('.room-ambient-layer').getAttribute('data-mode'),'fluid');
  await page.evaluate(()=>emitFrame());await page.waitForFunction(()=>document.querySelector('.room-ambient-layer').dataset.mode==='video');assert(await page.locator('.immersive-frame-cpu').isVisible());assert.equal(await page.locator('.room-ambient-layer').getAttribute('data-frame-origin'),'android-player');
  const previous=await page.evaluate(()=>commands.filter(x=>x.type==='ambient-watch'&&x.enabled).at(-1));
  await page.evaluate(()=>{testRoom.source={type:'vimeo',id:'vimeo-source',videoId:'12345678'};document.querySelector('#youtube-wrap').hidden=true;document.querySelector('#vimeo-player').hidden=false;ambient.update();});await page.waitForFunction(()=>commands.some(x=>x.type==='ambient-watch'&&x.enabled&&x.kind==='vimeo'));
  await page.evaluate(old=>emitFrame({sourceId:old.sourceId,generation:old.generation}),previous);await page.waitForTimeout(60);assert.equal(await page.locator('.room-ambient-layer').getAttribute('data-mode'),'fluid');await page.evaluate(()=>emitFrame());await page.waitForFunction(()=>document.querySelector('.room-ambient-layer').dataset.mode==='video');
  await page.evaluate(()=>{testRoom.playback.playing=false;ambient.update();});await page.waitForFunction(()=>commands.filter(x=>x.type==='ambient-watch').at(-1).playing===false);await page.evaluate(()=>{testRoom.playback.playing=true;ambient.update();});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>commands.filter(x=>x.type==='ambient-watch').at(-1).playing===false);
  await page.evaluate(()=>{document.querySelector('#room').hidden=true;ambient.update();});await page.waitForFunction(()=>commands.filter(x=>x.type==='ambient-watch').at(-1).enabled===false);assert.equal(await page.evaluate(()=>bridge.ambientFrame),null);
  await page.evaluate(()=>{document.querySelector('#room').hidden=false;ambient.update();});await page.waitForFunction(()=>commands.filter(x=>x.type==='ambient-watch').at(-1).enabled===true);await page.evaluate(()=>emitFrame());await page.waitForFunction(()=>document.querySelector('.room-ambient-layer').dataset.mode==='video');
  await page.evaluate(()=>emitFrame({type:'ambient-unavailable'}));await page.waitForFunction(()=>document.querySelector('.room-ambient-layer').dataset.mode==='fluid');await page.evaluate(()=>{ambient.destroy();bridge.destroy();});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scope:'Synthetic native-port payloads, real image decoding and canvas; no Android PixelCopy claim',checks:['YouTube and Vimeo shared renderer','no-WebGL full-frame fallback','stale source and generation rejected','pause','reduced motion','hide/return','unavailable fallback','cleanup'],errors}));
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
