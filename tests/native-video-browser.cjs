// Bridge/lifecycle integration with a simulated Android message port; no GPU claim.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createXparty}=await import('../server.mjs'),base='http://127.0.0.1:8807';process.env.ALLOWED_ORIGINS=base;
 const app=createXparty();await new Promise(r=>app.server.listen(8807,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},userAgent:'Xparty bridge fixture XpartyAndroid/1.1'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('xparty-room-guide-v1','shown');localStorage.setItem('xparty-consent',JSON.stringify({essential:true,preferences:true}));localStorage.setItem('xparty-agreement',JSON.stringify({version:'2026-09-29-v1'}));localStorage.setItem('xparty-nickname',JSON.stringify({without:false,name:'Aster'}));});
  await page.goto(base);await page.waitForSelector('.home-services');
  assert.equal(await page.locator('.home-service').count(),10);
  await page.locator('[data-service=netflix]').click();assert(await page.locator('#room').evaluate(e=>e.hidden));assert.match(await page.locator('#toast').innerText(),/Android playback is not available/);
  // Iframe-style handshakes are rejected even when they copy the protocol name.
  await page.evaluate(()=>{const forged=new MessageChannel();window.forgedMessages=[];forged.port1.onmessage=e=>forgedMessages.push(e.data);window.postMessage('xparty-native-video-v1',location.origin,[forged.port2]);});
  await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>forgedMessages),[]);
  await page.evaluate(()=>{
   window.nativeCommands=[];const channel=new MessageChannel();window.engine=channel.port1;window.activeNativeSource=null;
   window.nativeEmit=message=>engine.postMessage(JSON.stringify({sourceId:activeNativeSource,ready:true,active:true,position:0,duration:120,playing:false,...message}));
   engine.onmessage=e=>{const m=JSON.parse(e.data);nativeCommands.push(m);if(m.type==='hello')nativeEmit({type:'available'});if(m.type==='load'){activeNativeSource=m.sourceId;nativeEmit({type:'ready',active:false});nativeEmit({type:'frame'});}};
   window.dispatchEvent(new MessageEvent('message',{data:'xparty-native-video-v1',source:null,ports:[channel.port2]}));
  });
  await page.waitForFunction(()=>nativeCommands.some(x=>x.type==='hello'));
  await page.locator('[data-service=direct]').click();await page.waitForSelector('#source-panel[role=dialog]');
  assert.equal(await page.locator('.provider-picker [data-provider=direct]').getAttribute('aria-pressed'),'true');
  await page.fill('#youtube-input','https://media.example.com/movie.mp4');await page.locator('#load-video').click();await page.getByRole('button',{name:'Play together',exact:true}).click();
  await page.waitForFunction(()=>document.body.classList.contains('native-media-active'));
  assert.equal(await page.locator('#file-player').getAttribute('src'),null);
  assert.equal(await page.locator('.room-ambient-layer').getAttribute('data-mode'),'native');
  assert.equal(await page.evaluate(()=>nativeCommands.filter(x=>x.type==='load').length),1);
  // Partial native events and typing do not unmount or reload the decoder.
  await page.evaluate(()=>engine.postMessage(JSON.stringify({type:'progress',sourceId:activeNativeSource,position:2.5})));
  await page.waitForTimeout(100);
  assert(await page.locator('body').evaluate(e=>e.classList.contains('native-media-active')));
  await page.locator('#message-input').fill('typing while native playback stays mounted');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>nativeCommands.filter(x=>x.type==='load').length),1);
  assert(await page.locator('body').evaluate(e=>e.classList.contains('native-media-active')));
  await page.locator('#playback-speaker').click();await page.waitForFunction(()=>nativeCommands.filter(x=>x.type==='volume').at(-1)?.value===0);
  await page.locator('#playback-speaker').click();await page.waitForFunction(()=>nativeCommands.filter(x=>x.type==='volume').at(-1)?.value>0);
  await page.click('#fullscreen-video');await page.waitForFunction(()=>nativeCommands.some(x=>x.type==='fullscreen'&&x.value));assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);assert(await page.locator('.call-panel').isVisible());
  await page.click('#fullscreen-exit');await page.waitForFunction(()=>nativeCommands.filter(x=>x.type==='fullscreen').at(-1)?.value===false);
  await page.locator('#nav-home').evaluate(e=>e.click());await page.waitForFunction(()=>!document.body.classList.contains('native-media-active'));assert.equal(await page.locator('.site-fluid-layer').getAttribute('data-mode'),'home');
  await page.locator('#return-room').evaluate(e=>e.click());await page.waitForFunction(()=>document.body.classList.contains('native-media-active'));assert.equal(await page.evaluate(()=>nativeCommands.filter(x=>x.type==='load').length),1);
  // Late events from a previous source cannot clear or replace current playback.
  await page.evaluate(()=>nativeEmit({type:'error',sourceId:'stale-source',message:'stale'}));await page.waitForTimeout(100);assert(await page.locator('body').evaluate(e=>e.classList.contains('native-media-active')));
  await page.evaluate(()=>nativeEmit({type:'error',message:'Decoder fixture failure',ready:false,active:false}));await page.waitForFunction(()=>!document.body.classList.contains('native-media-active'));assert.match(await page.locator('#toast').innerText(),/Decoder fixture/);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({scope:'simulated native port; not Android decoding',checks:['forged port rejected','service-first creation','native source without DOM decoder','mute','native fullscreen bubble','home/return without reload','stale events','decoder error'],errors}));
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
