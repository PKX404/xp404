import test from 'node:test';
import assert from 'node:assert/strict';
import {accountId,profileWrite,messageBody,createAccountRepo} from '../public/xparty/account-repo.js';
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
function fixture(responses=[]){const calls=[];let user={id:a,revision:1};const client={from(table){const call={table,steps:[]};calls.push(call);const q=new Proxy({}, {get(_target,key){if(key==='then')return (resolve,reject)=>Promise.resolve(responses.shift()??{data:[],error:null}).then(resolve,reject);return (...args)=>{call.steps.push([key,...args]);return q;};}});return q;},rpc(name,args){calls.push({name,args});return Promise.resolve(responses.shift()??{data:[]});}};return {repo:createAccountRepo(client,()=>user),calls,setUser(next){user=next;}};}
test('account input rejects filter injection, self-friends, empty names and oversized messages before sending',async()=>{
 assert.throws(()=>accountId('bad,requester.neq.anything'));assert.throws(()=>profileWrite({display_name:' '}));assert.throws(()=>messageBody('a'.repeat(1501)));
 assert.equal(messageBody(' hello '),'hello');const f=fixture();await assert.rejects(f.repo.requestFriend(a),/another person/);await assert.rejects(f.repo.sendMessage(b,' '));assert.equal(f.calls.length,0);
 f.setUser(null);await assert.rejects(f.repo.profile(),/Sign in/);assert.equal(f.calls.length,0);
});
test('profile saves whitelist editable fields, verify a returned row, and never write identity or email',async()=>{
 const f=fixture([{data:{id:a,display_name:'Aster'}}]);await f.repo.saveProfile({id:b,email:'private@example.test',display_name:'Aster',bio:'Cinema',interests:['Music','Music'],photo:null});
 const write=f.calls[0].steps.find(s=>s[0]==='update')[1];assert.deepEqual(Object.keys(write).sort(),['display_name','photo_data','bio','interests','likes','dislikes'].sort());assert.deepEqual(write.interests,['Music']);assert(f.calls[0].steps.some(s=>s[0]==='eq'&&s[1]==='id'&&s[2]===a));assert(f.calls[0].steps.some(s=>s[0]==='single'));
 const denied=fixture([{error:{code:'PGRST116',message:'No permitted row'}}]);await assert.rejects(denied.repo.saveProfile({display_name:'Aster'}),e=>e.code==='PGRST116');
});
test('simultaneous first profile creation reads the winner instead of overwriting it',async()=>{
 const f=fixture([{data:null},{error:{code:'23505'}},{data:{id:a,display_name:'Existing'}}]);assert.equal((await f.repo.ensureProfile('New')).display_name,'Existing');assert.equal(f.calls.length,3);assert(!f.calls.some(c=>c.steps.some(s=>s[0]==='upsert')));
});
test('stale reads after account switch are discarded',async()=>{
 let release;const pending=new Promise(r=>release=r),f=fixture([pending]);const reading=f.repo.profile();f.setUser({id:b,revision:2});release({data:{id:a}});await assert.rejects(reading,e=>e.code==='ACCOUNT_CHANGED');
});
test('friend actions use pending recipient filter and show duplicate-request errors',async()=>{
 const f=fixture([{data:{id:b,status:'accepted'}}]);await f.repo.answerFriend(b,true);assert(f.calls[0].steps.some(s=>s[0]==='eq'&&s[1]==='addressee'&&s[2]===a));assert(f.calls[0].steps.some(s=>s[0]==='eq'&&s[1]==='status'&&s[2]==='pending'));
 const duplicate=fixture([{error:{code:'23505'}}]);await assert.rejects(duplicate.repo.requestFriend(b),/connection already exists/);
});
test('messages bind the sender to the verified account and retrieve a bounded ordered conversation',async()=>{
 const f=fixture([{data:{id:'sent'}},{data:[{body:'new'},{body:'old'}]}]);await f.repo.sendMessage(b,'  hello  ');
 assert.deepEqual(f.calls[0].steps.find(s=>s[0]==='insert')[1],{sender:a,recipient:b,body:'hello'});
 assert.deepEqual(await f.repo.messages(b),[{body:'old'},{body:'new'}]);assert(f.calls[1].steps.some(s=>s[0]==='limit'&&s[1]===80));assert(f.calls[1].steps.find(s=>s[0]==='or')[1].includes(`sender.eq.${a},recipient.eq.${b}`));
});
