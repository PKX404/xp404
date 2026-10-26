import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountAuth} from '../account-auth.mjs';
import {accountRoute,createAccountGate} from '../public/xparty/account-gate.js';
import {createXparty} from '../server.mjs';
const id='7922dc5a-b9c2-4b76-af73-b24b64f7748f',token='test.access.token.with.signature';

test('account identity comes from Supabase and does not trust JWT payloads or guest-room credentials',async()=>{
 let requests=0;const auth=createAccountAuth({url:'https://gydhasaztdanfidrysfp.supabase.co',publicKey:'sb_publishable_test',fetcher:async(url,options)=>{
  requests++;assert.equal(url,'https://gydhasaztdanfidrysfp.supabase.co/auth/v1/user');assert.equal(options.headers.apikey,'sb_publishable_test');assert.equal(options.redirect,'error');
  return new Response(JSON.stringify({id,role:'authenticated',email:'private@example.com',email_confirmed_at:'2026-01-01',app_metadata:{providers:['google']},user_metadata:{role:'admin'}}),{status:options.headers.Authorization==='Bearer '+token?200:401});
 }});
 assert.equal((await auth.verify()).status,401);assert.equal(requests,0);
 assert.equal((await auth.verify('Bearer forged.room.resume.token')).status,401);
 const result=await auth.verify('Bearer '+token);assert.equal(result.user.id,id);assert.equal(result.user.email,undefined);assert.equal(result.user.role,undefined);assert.deepEqual(result.user.providers,['google']);
});

test('account verification fails closed for missing config, outages and anonymous identities',async()=>{
 assert.equal((await createAccountAuth({url:'http://example.test',publicKey:'key'}).verify('Bearer '+token)).status,503);
 const auth=fetcher=>createAccountAuth({url:'https://project.supabase.co',publicKey:'key',fetcher});
 assert.equal((await auth(async()=>{throw Error('offline');}).verify('Bearer '+token)).status,503);
 assert.equal((await auth(async()=>new Response(JSON.stringify({id,role:'authenticated',is_anonymous:true}))).verify('Bearer '+token)).status,401);
 assert.equal((await auth(async()=>new Response(JSON.stringify({id:'not-a-user',role:'authenticated'}))).verify('Bearer '+token)).status,401);
});

test('protected account routes wait for verification, preserve only known destinations and discard late sign-in after logout',async()=>{
 let resolve;const gate=createAccountGate({verify:()=>new Promise(r=>resolve=r)});
 assert.equal(accountRoute('#/friends'),'friends');assert.equal(accountRoute('#https://evil.test'),null);assert.equal(accountRoute('#/admin'),null);
 assert.equal(gate.request('messages'),false);const pending=gate.setSession({access_token:token,user:{id}});assert.equal(gate.state.status,'loading');gate.clear();resolve({id});await pending;assert.equal(gate.state.status,'anonymous');assert.equal(gate.pending,null);
 const good=createAccountGate({verify:async()=>({id})});good.request('friends');await good.setSession({access_token:token,user:{id}});assert.equal(good.state.status,'authenticated');assert.equal(good.takePending(),'friends');assert.equal(good.takePending(),null);
 await good.setSession({access_token:token,user:{id:'forged'}});assert.equal(good.state.status,'anonymous');assert.equal(good.state.user,null);
});

test('protected HTTP account route rejects missing and invalid credentials and enforces origin, method and no-store',async t=>{
 const prior={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_ANON_KEY};process.env.SUPABASE_URL='https://gydhasaztdanfidrysfp.supabase.co';process.env.SUPABASE_ANON_KEY='sb_publishable_test';
 t.after(()=>{for(const [key,value]of [['SUPABASE_URL',prior.url],['SUPABASE_ANON_KEY',prior.key]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
 const app=createXparty({accountFetch:async(_url,options)=>new Response(JSON.stringify(options.headers.Authorization==='Bearer '+token?{id,role:'authenticated'}:{message:'invalid'}),{status:options.headers.Authorization==='Bearer '+token?200:401})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  assert.equal((await fetch(base+'/api/accounts/me')).status,401);
  assert.equal((await fetch(base+'/api/accounts/me',{headers:{Authorization:'Bearer invalid.room.token'}})).status,401);
  const response=await fetch(base+'/api/accounts/me?user_id=someone-else',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);assert.equal((await response.json()).user.id,id);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'/api/accounts/me',{method:'POST',headers:{Authorization:'Bearer '+token}})).status,405);
  assert.equal((await fetch(base+'/api/accounts/me',{headers:{Authorization:'Bearer '+token,Origin:'https://evil.test'}})).status,403);
 }finally{await app.close();}
});
