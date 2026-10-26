const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const {createXparty}=await import('../server.mjs');const base='http://127.0.0.1:8803',project='https://gydhasaztdanfidrysfp.supabase.co';
 process.env.ALLOWED_ORIGINS=base;process.env.SUPABASE_URL=project;process.env.SUPABASE_ANON_KEY='sb_publishable_fixture';
 const id='10000000-0000-4000-8000-000000000001',pal='10000000-0000-4000-8000-000000000002',incoming='10000000-0000-4000-8000-000000000003';
 const friendId='20000000-0000-4000-8000-000000000001',requestId='20000000-0000-4000-8000-000000000002';
 const user={id,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture-signature';
 const app=createXparty({accountFetch:async(_url,options)=>new Response(JSON.stringify(user),{status:options.headers.Authorization==='Bearer '+jwt?200:401})});await new Promise(r=>app.server.listen(8803,'127.0.0.1',r));let browser;
 const profiles=[{id,display_name:'Aster',photo_data:null,bio:'Cinema',interests:['Space'],likes:[],dislikes:[]},{id:pal,display_name:'Fern',photo_data:null},{id:incoming,display_name:'Nova',photo_data:null}];
 const friends=[{id:friendId,requester:id,addressee:pal,status:'accepted'},{id:requestId,requester:incoming,addressee:id,status:'pending'}];
 const messages=[{id:'m1',sender:pal,recipient:id,body:'Welcome back',created_at:'2026-01-01T00:00:00Z'}];let failMessage=false,failProfile=false,otpRequests=0;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,timeout:60000});const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('xparty-consent',JSON.stringify({essential:true,preferences:true}));localStorage.setItem('xparty-agreement',JSON.stringify({version:'2026-09-29-v1'}));});
  const sdk=fs.readFileSync(path.resolve('node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'utf8');
  await page.route('https://esm.sh/@supabase/supabase-js@2.117.2',r=>r.fulfill({contentType:'text/javascript',body:sdk+'\nexport const createClient=supabase.createClient;'}));
  await page.route(project+'/**',async route=>{
   const req=route.request(),u=new URL(req.url()),method=req.method(),body=req.postDataJSON(),object=(req.headers().accept||'').includes('vnd.pgrst.object');
   const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(u.pathname==='/auth/v1/otp'){otpRequests++;return reply({});}
   if(u.pathname==='/auth/v1/verify')return reply({access_token:jwt,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user});
   if(u.pathname==='/auth/v1/user')return reply(user);
   if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204});
   const table=u.pathname.split('/').at(-1);
   if(table==='xparty_profiles'){
    let selected=profiles;if(u.searchParams.get('id')?.startsWith('eq.'))selected=profiles.filter(p=>p.id===u.searchParams.get('id').slice(3));
    if(method==='PATCH'){if(failProfile)return reply({message:'Fixture profile save failed',code:'FIXTURE'},503);Object.assign(selected[0],body);}
    return reply(object?selected[0]:selected);
   }
   if(table==='xparty_private_profiles')return reply(method==='POST'?[{age:body.age}]:object?{age:null}:[{age:null}]);
   if(table==='xparty_friends'){
    let selected=friends.filter(f=>!u.searchParams.get('id')||f.id===u.searchParams.get('id').slice(3));
    if(method==='PATCH')selected.forEach(f=>Object.assign(f,body));
    if(method==='DELETE'){for(const f of selected)friends.splice(friends.indexOf(f),1);}
    return reply(object?selected[0]:selected);
   }
   if(table==='xparty_messages'){
    if(method==='POST'){if(failMessage)return reply({message:'Fixture message send failed',code:'FIXTURE'},503);const row={...body,id:'m'+(messages.length+1),created_at:new Date().toISOString()};messages.push(row);return reply(object?row:[row]);}
    return reply([...messages].reverse());
   }
   if(table==='xparty_calls')return reply([]);
   if(table==='xparty_mutual_friends')return reply([]);
   throw Error('Unexpected Supabase request '+method+' '+u.pathname);
  });
  await page.route('https://iptv-org.github.io/**',r=>r.fulfill({contentType:'application/json',body:'[]'}));await page.route('https://raw.githubusercontent.com/**',r=>r.fulfill({body:'#EXTM3U'}));
  await page.goto(base+'/#profile',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.accountState==='anonymous').catch(async error=>{console.error('Account diagnostics',await page.locator('#account-status').textContent(),errors);throw error;});
  assert.equal(await page.locator('#google-login').count(),0);await page.fill('#auth-address','fixture@example.test');await page.check('#privacy-consent');await page.click('#send-otp');await page.waitForSelector('#otp-step:not([hidden])');await page.fill('#otp-code','123456');await page.click('#verify-otp');
  await page.waitForFunction(()=>document.querySelector('#profile-name').value==='Aster');assert.equal(otpRequests,1);
  await page.fill('#profile-name','Aster Updated');await page.fill('#profile-bio','Space and movie nights');await page.fill('#profile-interests','Cinema, Music');await page.click('#save-profile');await page.waitForFunction(()=>document.querySelector('#account-status').textContent==='Profile saved.');assert.equal(profiles[0].bio,'Space and movie nights');assert.deepEqual(profiles[0].interests,['Cinema','Music']);
  failProfile=true;await page.fill('#profile-bio','Unsaved draft');await page.click('#save-profile');await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Fixture profile save failed'));assert.equal(profiles[0].bio,'Space and movie nights');assert.equal(await page.inputValue('#profile-bio'),'Unsaved draft');failProfile=false;
  await page.click('[data-social-view=friends]');await page.locator(`[data-friend-id="${incoming}"]`).getByRole('button',{name:'Accept',exact:true}).click();await page.waitForFunction(id=>document.querySelector(`[data-friend-id="${id}"]`).textContent.includes('accepted'),incoming);assert.equal(friends[1].status,'accepted');
  await page.locator(`[data-friend-id="${pal}"]`).getByRole('button',{name:'Chat',exact:true}).click();await page.getByText('Fern: Welcome back',{exact:true}).waitFor();
  await page.fill('#direct-input','Hello <script>literal text</script>');await page.locator('#direct-form button').click();await page.getByText('You: Hello <script>literal text</script>',{exact:true}).waitFor();assert.equal(messages.at(-1).sender,id);assert.equal(await page.locator('#direct-messages script').count(),0);
  failMessage=true;await page.fill('#direct-input','Keep this draft');await page.locator('#direct-form button').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('Fixture message send failed'));assert.equal(await page.inputValue('#direct-input'),'Keep this draft');failMessage=false;
  const output=path.resolve('../../deliverables/redesign');fs.mkdirSync(output,{recursive:true});await page.locator('#account-dialog').screenshot({path:path.join(output,'supabase-messages.png')});
  await page.click('[data-social-view=profile]');await page.locator('#sign-out').click();await page.waitForFunction(()=>document.documentElement.dataset.accountState==='anonymous');assert.equal(await page.inputValue('#profile-name'),'');assert.equal(await page.inputValue('#profile-bio'),'');assert.equal(await page.inputValue('#direct-input'),'');assert.equal(await page.locator('#friends-list').textContent(),'');
  await page.locator('#account-guest').click();await page.waitForSelector('.world-home');
  for(const width of [390,1366]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Home overflow '+width);await page.screenshot({path:path.join(output,'home-supabase-'+width+'.png'),fullPage:true});}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({sdk:'real pinned supabase-js 2.117.2',backend:'isolated Auth and REST fixtures; no live account writes',otp:true,profile:true,friendAccept:true,messages:true,failedSaveRetainsDraft:true,logoutClearsData:true,homeViewports:[390,1366],errors}));
 }finally{await browser?.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
