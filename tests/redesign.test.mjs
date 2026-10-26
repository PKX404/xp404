import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {parseProviderLink,publicVideoURL,validProviderId} from '../public/xparty/providers.js';
import {profileData,commonInterests} from '../public/xparty/profile-data.js';
import {tickTogether,togetherView} from '../together.mjs';
import {createXparty} from '../server.mjs';

test('provider parsing accepts supported sources and rejects spoofed hosts, private endpoints and executable URLs',()=>{
 assert.equal(parseProviderLink('https://youtu.be/dQw4w9WgXcQ').type,'youtube');
 assert.deepEqual(parseProviderLink('https://vimeo.com/76979871'),{type:'vimeo',videoId:'76979871',title:'Vimeo video'});
 assert.equal(parseProviderLink('https://player.vimeo.com/video/76979871').videoId,'76979871');
 assert.equal(parseProviderLink('https://cdn.example.com/movie.mp4?signature=abc').type,'direct');
 for(const value of ['javascript:alert(1)','https://vimeo.com.evil.org/76979871','https://vimeo.com/1','https://user:pass@cdn.example.com/movie.mp4','https://127.0.0.1/movie.mp4','https://[::1]/movie.mp4','https://service.local/movie.mp4','http://cdn.example.com/movie.mp4','https://cdn.example.com/page.html'])assert.equal(parseProviderLink(value),null,value);
 assert.equal(publicVideoURL('https://cdn.example.com:444/movie.mp4'),null);assert.equal(validProviderId('vimeo',76979871),false);
});

test('profiles bound user content and strip unrelated identity and credential fields',()=>{
 const p=profileData({bio:'a'.repeat(300),interests:['Films','Films',...Array.from({length:20},(_,i)=>String(i))],likes:['a'.repeat(99)],photo:'data:image/svg+xml;base64,AAAA',accountId:'forged',token:'secret'});
 assert.equal(p.bio.length,240);assert.equal(p.interests.length,8);assert.equal(p.likes[0].length,30);assert.equal(p.photo,null);assert.equal(p.accountId,undefined);assert.equal(p.token,undefined);
 assert.deepEqual(commonInterests({interests:['Films','Music']},{interests:['films']}),['Films']);
});

test('shared watching excludes offline, stale, paused and buffering devices; mutual friends reveal only the intersection',()=>{
 const a={id:'a',watchSource:'s',watchingAt:1000},b={id:'b',watchSource:'s',watchingAt:1000},c={id:'c',watchSource:'s',watchingAt:1000};
 const r={source:{id:'s',title:'A film',type:'vimeo'},playback:{playing:true},people:new Map([['a',a],['b',b],['c',c]]),friendRequests:[{from:'a',to:'c',status:'accepted'},{from:'c',to:'b',status:'accepted'}]};
 tickTogether(r,p=>p.id!=='c',1000);tickTogether(r,p=>p.id!=='c',1500);
 assert.equal(togetherView(r,'a','b').milliseconds,500);assert.equal(togetherView(r,'a','c').milliseconds,0);assert.equal(togetherView(r,'a','b').mutualFriends[0].id,'c');
 r.playback.playing=false;tickTogether(r,()=>true,2000);r.playback.playing=true;r.playback.waitingFor=['b'];tickTogether(r,()=>true,2500);assert.equal(togetherView(r,'a','b').milliseconds,500);
 r.playback.waitingFor=[];tickTogether(r,()=>true,12000);assert.equal(togetherView(r,'a','b').milliseconds,500);
});

async function connect(port){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:'http://127.0.0.1:8787'}),queue=[];ws.on('message',raw=>queue.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {ws,queue,send:(type,fields={})=>ws.send(JSON.stringify({type,...fields})),async next(type,filter=()=>true){for(let i=0;i<200;i++){const idx=queue.findIndex(m=>m.type===type&&filter(m));if(idx>=0)return queue.splice(idx,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing '+type);}};}

test('room protocols share self-owned profiles, keep details private and require host approval for new providers',async()=>{
 const app=createXparty();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{
  const port=app.server.address().port,a=await connect(port),b=await connect(port);a.send('create',{name:'Host',capacity:3});const aw=await a.next('welcome');b.send('join',{code:aw.room.code,name:'Guest'});const bw=await b.next('welcome');
  b.send('profile-update',{target:aw.id,profile:{bio:'Hello',interests:['Films'],token:'secret'}});const updated=(await a.next('state',m=>m.room.people.find(p=>p.id===bw.id)?.profile.bio==='Hello')).room;
  assert.equal(updated.people.find(p=>p.id===aw.id).profile.bio,'');assert.equal(updated.people.find(p=>p.id===bw.id).profile.token,undefined);
  b.send('source',{source:{type:'vimeo',videoId:'76979871',title:'Vimeo test'}});const pending=(await a.next('state',m=>m.room.requests?.some(q=>q.action.source?.type==='vimeo'))).room.requests.at(-1);assert.equal(app.rooms.get(aw.room.code).source,null);
  a.send('review-request',{id:pending.id,approve:true});const chosen=(await b.next('state',m=>m.room.source?.type==='vimeo')).room.source;assert.equal(chosen.videoId,'76979871');
  a.send('source',{source:{type:'direct',url:'https://cdn.example.com/video.mp4',title:'Direct'}});await b.next('state',m=>m.room.source?.type==='direct');const sourceId=app.rooms.get(aw.room.code).source.id;
  a.send('source',{source:{type:'direct',url:'https://127.0.0.1/a.mp4'}});a.send('profile-details',{target:bw.id});const details=await a.next('profile-details');assert.equal(details.target,bw.id);assert.equal(details.together.milliseconds,0);assert.equal(app.rooms.get(aw.room.code).source.id,sourceId);
  assert.equal(b.queue.some(m=>m.type==='profile-details'),false);
 }finally{await app.close();}
});
