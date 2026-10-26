// Real MP4 decoding/upload/local playback; YouTube API is explicitly simulated.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {createXparty}=await import('../server.mjs'),base='http://127.0.0.1:8815';process.env.ALLOWED_ORIGINS=base;
 const app=createXparty();await new Promise(r=>app.server.listen(8815,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--renderer-process-limit=1','--num-raster-threads=1','--disable-gpu','--autoplay-policy=no-user-gesture-required','--js-flags=--max-old-space-size=128']});
 const out=path.resolve('../../deliverables/redesign'),bytes=fs.readFileSync(path.join(out,'cc0-flower.mp4')),errors=[];
 try{
  const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(30000);
  p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error'&&m.text().includes('Room event failed'))errors.push(m.text());});
  await p.addInitScript(()=>{localStorage.setItem('xparty-room-guide-v1','shown');localStorage.setItem('xparty-consent',JSON.stringify({essential:true,preferences:true}));localStorage.setItem('xparty-agreement',JSON.stringify({version:'2026-09-29-v1'}));localStorage.setItem('xparty-nickname',JSON.stringify({without:false,name:'Aster'}));const WS=WebSocket;window.WebSocket=class extends WS{constructor(...a){super(...a);window.roomSocket=this;}};});
  await p.route('https://api.country.is/**',r=>r.fulfill({json:{country:'IN'}}));await p.route('https://iptv-org.github.io/api/languages.json',r=>r.fulfill({json:[]}));await p.route('https://iptv-org.github.io/api/countries.json',r=>r.fulfill({json:[]}));
  await p.route('https://media.example.com/**',r=>r.fulfill({contentType:'video/mp4',headers:{'access-control-allow-origin':'*'},body:bytes}));
  await p.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'text/javascript',body:`window.YT={Player:class{constructor(id,o){this.o=o;this.state=2;this.position=0;this.frame=document.createElement('iframe');document.getElementById(id).append(this.frame);window.testYT=this;setTimeout(()=>o.events.onReady({target:this}),0);}getIframe(){return this.frame;}cueVideoById(id){this.id=id;this.position=0;this.state=2;}getCurrentTime(){return this.position;}getDuration(){return 180;}getPlayerState(){return this.state;}setVolume(){}unMute(){}loadModule(){}unloadModule(){}stopVideo(){this.state=2;}seekTo(p){this.position=p;}playVideo(){this.state=1;this.o.events.onStateChange({data:1});}pauseVideo(){this.state=2;this.o.events.onStateChange({data:2});}}};window.onYouTubeIframeAPIReady();` }));
  await p.goto(base,{waitUntil:'domcontentloaded'});await p.click('#create-toggle');await p.waitForSelector('#room:not([hidden])');
  assert.equal(await p.locator('#choose-room-video').isVisible(),true);assert.equal(await p.evaluate(()=>document.body.dataset.conversation),'chat');
  await p.click('#choose-room-video');await p.click('#quick-search-tab');await p.setInputFiles('#quick-local-file',{name:'Local.mp4',mimeType:'video/mp4',buffer:bytes});
  await p.waitForFunction(()=>document.querySelector('#device-local-player')?.videoWidth>0&&!document.querySelector('#device-local-player').paused);
  assert.equal(await p.locator('.watch-column').isVisible(),true);assert.equal(await p.evaluate(()=>document.body.classList.contains('room-empty-video')),false);assert.equal(await p.locator('#local-video-close').isVisible(),true);
  await p.screenshot({path:path.join(out,'restored-local-player-390.png')});await p.click('#local-video-close');assert.equal(await p.locator('#device-local-player').count(),0);
  await p.click('#close-video-sources');await p.click('#choose-room-video');await p.click('#quick-search-tab');await p.fill('#youtube-input','https://media.example.com/video.mp4');await p.getByRole('button',{name:'Play together',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#file-player').videoWidth>0&&!document.querySelector('#file-player').paused);assert.equal(await p.locator('#watch-stage').isVisible(),true);
  await p.locator('#file-player').evaluate(v=>v.pause());
  // Real upload path, independent of the private device-local player.
  await p.setInputFiles('#file-input',{name:'Shared.mp4',mimeType:'video/mp4',buffer:bytes});await p.waitForFunction(()=>document.querySelector('#file-player').src.startsWith('blob:')&&document.querySelector('#file-player').videoWidth>0);
  await p.locator('#file-player').evaluate(v=>v.pause());
  await p.evaluate(()=>roomSocket.send(JSON.stringify({type:'source',source:{type:'youtube',videoId:'dQw4w9WgXcQ',title:'YouTube contract fixture'}})));
  await p.waitForFunction(()=>window.testYT?.id==='dQw4w9WgXcQ'&&testYT.state===1);assert.equal(await p.locator('#youtube-wrap').isVisible(),true);assert.equal(await p.locator('#watch-stage').isVisible(),true);
  await p.click('#panel-chat');await p.fill('#message-input','Playback and chat stay separate.');await p.locator('#chat-form').evaluate(f=>f.requestSubmit());await p.waitForFunction(()=>document.querySelector('#messages').textContent.includes('Playback and chat stay separate.'));
  for(const [width,height]of [[320,568],[390,844],[390,450],[768,1024],[1024,768],[1366,900],[1920,1080],[568,320]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(180);
   const stage=await p.locator('#watch-stage').boundingBox(),form=await p.locator('#chat-form').boundingBox();assert(stage.width>100&&stage.height>50,JSON.stringify({width,height,stage}));assert(form.height<=(form.width<=280?76:50)&&form.y+form.height<=height,JSON.stringify({width,height,form}));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }
  await p.screenshot({path:path.join(out,'chat-composer-568.png')});
  assert.deepEqual(errors,[]);assert(!/action failed/i.test(await p.locator('#toast').textContent()));
  console.log('PASS: persistent playback destination; decoded local/direct/shared-file playback; YouTube API selection/autostart contract; chat composer survives; compact 320-1920px layouts and keyboard-height viewport. Real YouTube streaming not validated.');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
