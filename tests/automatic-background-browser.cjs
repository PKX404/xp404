const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {createXparty}=await import('../server.mjs');const port=8803,base='http://127.0.0.1:'+port;process.env.ALLOWED_ORIGINS=base;const app=createXparty();await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[],output=path.resolve('../../deliverables/redesign');fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.captureRequests=0;navigator.mediaDevices.getDisplayMedia=()=>{window.captureRequests++;throw Error('Background must not ask for screen capture');};
   localStorage.setItem('xparty.ambient-chat','off');localStorage.setItem('xparty-room-guide-v1','shown');localStorage.setItem('xparty-consent',JSON.stringify({essential:true,preferences:false,analytics:false}));localStorage.setItem('xparty-agreement',JSON.stringify({version:'2026-09-29-v1'}));sessionStorage.setItem('xparty-nickname',JSON.stringify({without:false,name:'Aster'}));
  });
  await page.route('https://player.vimeo.com/api/player.js',r=>r.fulfill({contentType:'text/javascript',body:`window.Vimeo={Player:class{constructor(host){this.events={};host.textContent='Vimeo fixture';}on(n,f){this.events[n]=f;}ready(){return Promise.resolve();}getDuration(){return Promise.resolve(180);}setCurrentTime(){return Promise.resolve();}getPaused(){return Promise.resolve(true);}play(){this.events.play?.();return Promise.resolve();}pause(){this.events.pause?.();return Promise.resolve();}setVolume(){return Promise.resolve();}setMuted(){return Promise.resolve();}destroy(){return Promise.resolve();}}};`}));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('.site-fluid-layer')?.dataset.renderer==='webgl');
  assert.equal(await page.locator('.site-fluid-layer').getAttribute('data-mode'),'home');const before=await page.locator('.site-fluid-layer').getAttribute('data-time');await page.waitForFunction(t=>Number(document.querySelector('.site-fluid-layer').dataset.time)>Number(t)+.15,before);
  await page.screenshot({path:path.join(output,'fluid-home-1366.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const still=await page.locator('.site-fluid-layer').getAttribute('data-time');await page.waitForTimeout(200);assert.equal(await page.locator('.site-fluid-layer').getAttribute('data-time'),still);await page.emulateMedia({reducedMotion:'no-preference'});
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(output,'fluid-home-'+width+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);}
  await page.setViewportSize({width:1366,height:900});await page.click('#create-toggle');await page.waitForSelector('#room:not([hidden])');
  assert.equal(await page.locator('#immersive-toggle,#immersive-live-toggle').count(),0);assert.equal(await page.evaluate(()=>document.body.classList.contains('room-immersive-on')),true);assert.equal(await page.locator('.site-fluid-layer').getAttribute('data-mode'),'room');
  await page.locator('#browse').evaluate(e=>e.click());await page.fill('#youtube-input','https://vimeo.com/76979871');await page.locator('#load-video').evaluate(e=>e.click());await page.getByRole('button',{name:'Play together',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#vimeo-wrap').hidden);
  assert.equal(await page.locator('.room-ambient-layer').getAttribute('data-mode'),'fluid');assert.equal(await page.locator('.site-fluid-layer').getAttribute('data-mode'),'room');assert.equal(await page.evaluate(()=>captureRequests),0);
  await page.locator('#nav-home').evaluate(e=>e.click());await page.waitForFunction(()=>document.querySelector('.site-fluid-layer').dataset.mode==='home');assert.equal(await page.evaluate(()=>document.body.classList.contains('room-immersive-on')),false);
  await page.locator('#return-room').evaluate(e=>e.click());await page.waitForFunction(()=>document.querySelector('.site-fluid-layer').dataset.mode==='room');
  // Browser page lifecycle suspends work without consuming elapsed background time.
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));const hidden=await page.locator('.site-fluid-layer').getAttribute('data-time');await page.waitForTimeout(200);assert.equal(await page.locator('.site-fluid-layer').getAttribute('data-time'),hidden);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));await page.waitForFunction(t=>Number(document.querySelector('.site-fluid-layer').dataset.time)>Number(t),hidden);
  // Context loss has a motion-aware CSS fallback; restoration rebuilds the shader.
  const supportsLoss=await page.evaluate(()=>{const gl=document.querySelector('.site-fluid-canvas').getContext('webgl');window.fluidLoss=gl.getExtension('WEBGL_lose_context');fluidLoss?.loseContext();return !!fluidLoss;});
  if(supportsLoss){await page.waitForFunction(()=>document.querySelector('.site-fluid-layer').dataset.renderer==='css');await page.evaluate(()=>fluidLoss.restoreContext());await page.waitForFunction(()=>document.querySelector('.site-fluid-layer').dataset.renderer==='webgl');}
  assert.equal(await page.evaluate(()=>captureRequests),0);assert.deepEqual(errors,[]);console.log(JSON.stringify({home:'animated WebGL',reducedMotion:'still frame',oldOffPreference:'ignored',room:'always immersive',iframe:'automatic fluid fallback',captureRequests:0,viewports:[320,390,1366],errors}));
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
