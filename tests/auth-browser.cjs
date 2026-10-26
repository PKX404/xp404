const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createXparty}=await import('../server.mjs');const port=8801,base='http://127.0.0.1:'+port;
 process.env.ALLOWED_ORIGINS=base;process.env.SUPABASE_URL='https://gydhasaztdanfidrysfp.supabase.co';process.env.SUPABASE_ANON_KEY='sb_publishable_fixture';
 const id='7922dc5a-b9c2-4b76-af73-b24b64f7748f';
 const app=createXparty({accountFetch:async(_url,options)=>new Response(JSON.stringify({id,role:'authenticated'}),{status:options.headers.Authorization==='Bearer fixture.access.token.signed'?200:401})});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,timeout:60000});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://esm.sh/@supabase/supabase-js@2.117.2',r=>r.fulfill({contentType:'text/javascript',body:`
  const id='${id}';let listener,session=null;window.fixtureReads=0;
  export function createClient(){return {auth:{onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session},error:null};},async signOut(){session=null;listener('SIGNED_OUT',null);return {error:null};}},from(table){window.fixtureReads++;const result=()=>({data:table==='xparty_profiles'?{id,display_name:'Aster',bio:'Account profile',photo_data:null,interests:['Cinema']}:table==='xparty_private_profiles'?{age:null}:[],error:null});const q={select(){return q;},eq(){return q;},or(){return q;},in(){return q;},gte(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return Promise.resolve(result());},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};return q;}};}
  window.fixtureLogin=()=>{session={access_token:'fixture.access.token.signed',user:{id,user_metadata:{}}};listener('SIGNED_IN',session);};
  `}));
  await page.goto(base+'/#friends');await page.waitForSelector('#account-dialog[open]');await page.waitForFunction(()=>document.documentElement.dataset.accountState==='anonymous');
  assert.equal(await page.locator('#account-profile').isVisible(),false);assert.equal(await page.locator('#auth-form').isVisible(),true);assert.equal(await page.evaluate(()=>fixtureReads),0);
  await page.evaluate(()=>fixtureLogin());await page.waitForFunction(()=>document.documentElement.dataset.accountState==='authenticated');await page.waitForFunction(()=>document.querySelector('#profile-name').value==='Aster');assert.equal(await page.locator('#auth-form').isVisible(),false);
  await page.evaluate(()=>location.hash='profile');await page.locator('#sign-out').evaluate(e=>e.click());await page.waitForFunction(()=>document.documentElement.dataset.accountState==='anonymous');
  assert.equal(await page.locator('#account-profile').isVisible(),false);assert.equal(await page.locator('#profile-name').inputValue(),'');assert.equal(await page.locator('#friends-list').textContent(),'');assert.equal(await page.locator('#direct-chat').isVisible(),false);
  await page.evaluate(()=>location.hash='messages');await page.waitForFunction(()=>document.querySelector('#account-dialog').dataset.socialView==='messages');assert.equal(await page.locator('#auth-form').isVisible(),true);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({protectedRoutes:['profile','friends','messages'],restoration:'verified via actual local account endpoint with simulated Supabase Auth',signedOutDataCleared:true,errors}));
 }finally{await browser?.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
