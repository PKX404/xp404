// Deterministic directory/stream probes. No third-party stream reliability claim.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const {createXparty}=await import('../server.mjs'),base='http://127.0.0.1:8816';process.env.ALLOWED_ORIGINS=base;
 const app=createXparty();await new Promise(r=>app.server.listen(8816,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--renderer-process-limit=1','--num-raster-threads=1','--disable-gpu','--js-flags=--max-old-space-size=128']});
 const errors=[],counts={country:0,india:0,geo:0};let p;
 const playlist='#EXTM3U\n#EXTINF:-1 tvg-id="Film.in" group-title="Movies",Film Hindi\nhttps://media.example.com/film.m3u8\n#EXTINF:-1 tvg-id="Gone.in" group-title="Movies",Gone Movie\nhttps://media.example.com/gone.m3u8\n#EXTINF:-1 tvg-id="World.in" group-title="News",World English\nhttps://media.example.com/restricted.m3u8\n'+Array.from({length:30},(_,i)=>'#EXTINF:-1 group-title="News",News '+i+'\nhttps://media.example.com/news'+i+'.m3u8\n').join('');
 try{
  p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(20000);
  p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error'&&m.text().includes('Room event failed'))errors.push(m.text());});
  await p.addInitScript(()=>{localStorage.setItem('xparty-room-guide-v1','shown');localStorage.setItem('xparty-consent',JSON.stringify({essential:true,preferences:true}));localStorage.setItem('xparty-agreement',JSON.stringify({version:'2026-09-29-v1'}));localStorage.setItem('xparty-nickname',JSON.stringify({without:false,name:'Aster'}));});
  await p.route('https://api.country.is/**',r=>{counts.geo++;return r.fulfill({json:{country:'IN',ip:'192.0.2.1'}});});
  await p.route('https://iptv-org.github.io/api/countries.json',r=>{counts.country++;return r.fulfill({json:[{code:'IN',name:'India'},{code:'US',name:'United States'}]});});
  await p.route('https://iptv-org.github.io/api/languages.json',r=>r.fulfill({json:[{code:'hin',name:'Hindi'},{code:'eng',name:'English'}]}));
  await p.route('https://iptv-org.github.io/iptv/**',r=>{if(r.request().url().includes('/countries/in.m3u'))counts.india++;return r.fulfill({body:r.request().url().includes('/languages/hin')?'#EXTM3U\n#EXTINF:-1 tvg-id="Film.in",Film Hindi\nhttps://media.example.com/film.m3u8\n':playlist});});
  await p.route('https://media.example.com/**',r=>{const u=r.request().url();return r.fulfill({status:u.includes('gone')?404:u.includes('restricted')?403:200,body:u.endsWith('.m3u8')?'#EXTM3U\n#EXTINF:4,\npart.ts\n':'media bytes'});});
  await p.goto(base,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('#world-country').value==='in');assert.equal(await p.locator('.world-location').textContent(),'India');
  await p.click('#create-toggle');await p.waitForSelector('#room:not([hidden])');assert.equal(await p.locator('#people-button .participant-count-badge').textContent(),'1');
  await p.getByRole('button',{name:'Quick search and sources',exact:true}).click();await p.click('[data-provider=iptv]');await p.waitForFunction(()=>document.querySelector('#iptv-country').value==='in'&&document.querySelectorAll('.iptv-channel').length===24);
  assert.deepEqual(counts,{country:1,india:1,geo:1});assert.equal(await p.locator('#iptv-more').isVisible(),true);
  await p.waitForSelector('.iptv-channel [data-health=green]');await p.waitForSelector('.iptv-channel [data-health=red]');assert(await p.locator('.iptv-channel [data-health=yellow]').count()>0);
  await p.locator('.iptv-category-chips').getByRole('button',{name:'Movies',exact:true}).click();assert.equal(await p.locator('.iptv-channel').count(),2);
  await p.selectOption('#iptv-language','hin');await p.waitForFunction(()=>document.querySelectorAll('.iptv-channel').length===1);assert.match(await p.locator('.iptv-channel').textContent(),/Film Hindi/);
  await p.getByRole('button',{name:'Save Film Hindi',exact:true}).click();await p.click('#saved-videos-tab');await p.waitForSelector('.saved-video-library:not([hidden])');assert.equal(await p.getByRole('button',{name:'Play saved Film Hindi',exact:true}).count(),1);
  await p.screenshot({path:path.resolve('../../deliverables/redesign/saved-library-390.png')});
  await p.click('#all-sources-tab');await p.click('[data-provider=iptv]');await p.selectOption('#iptv-language','');await p.selectOption('#iptv-country','us');await p.waitForFunction(()=>document.querySelector('#world-country').value==='us');
  await p.reload({waitUntil:'domcontentloaded'});await p.waitForSelector('#room:not([hidden])');await p.getByRole('button',{name:'Quick search and sources',exact:true}).click();await p.click('#saved-videos-tab');await p.waitForSelector('.saved-video-library:not([hidden])');assert.equal(await p.getByRole('button',{name:'Play saved Film Hindi',exact:true}).count(),1);
  await p.click('#all-sources-tab');await p.click('[data-provider=iptv]');await p.waitForFunction(()=>document.querySelector('#iptv-country').value==='us');assert.equal(counts.geo,1);
  await p.locator('.iptv-category-chips').getByRole('button',{name:'Movies',exact:true}).click();await p.screenshot({path:path.resolve('../../deliverables/redesign/iptv-library-390.png')});
  assert.deepEqual(errors,[]);console.log('PASS: country auto-detection/override, shared directory cache, bounded card rendering, verified health colors, Movies + language intersection, participant badge and Saved persistence after reload.');
 }catch(e){if(p)await p.screenshot({path:path.resolve('../../deliverables/redesign/iptv-library-failure.png')}).catch(()=>{});throw e;}finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
