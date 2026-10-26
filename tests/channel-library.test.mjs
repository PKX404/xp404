import test from 'node:test';import assert from 'node:assert/strict';
import {createSavedVideos,savedSource} from '../public/xparty/saved-videos.js';
import {channelMatches,cachedDirectory,defaultCountry} from '../public/xparty/channel-directory.js';
import {recordHealth,healthFor,checkChannel} from '../public/xparty/channel-health.js';
const storage=()=>{let value=null;return {getItem:()=>value,setItem:(_,next)=>value=next};};
test('saved channels and links survive new repository instances, deduplicate and whitelist source fields',()=>{
 const disk=storage(),first=createSavedVideos(disk),source={type:'iptv',url:'https://media.example.com/live.m3u8',title:'News',cookies:'secret',headers:{Authorization:'private'},id:'temporary'};
 first.set(source,true);first.set({...source,title:'News HD'},true);const second=createSavedVideos(disk);assert.equal(second.list().length,1);assert.deepEqual(second.list()[0],{type:'iptv',url:source.url,title:'News HD'});assert(second.has(source));second.set(source,false);assert.equal(first.list().length,0);
 for(const invalid of [{type:'file',url:'blob:x'},{type:'direct',url:'http://localhost/video.mp4'},{type:'youtube',videoId:'bad'},{type:'iptv',url:'https://user:password@media.example.com/live.m3u8'}])assert.equal(savedSource(invalid),null);
 assert.equal(savedSource({type:'youtube',videoId:'12345678901',title:'Video'}).type,'youtube');
});
test('movie and language filters intersect metadata IDs or stream URLs without inventing language matches',()=>{
 const film={id:'Film.in',url:'https://media.example.com/a.m3u8',title:'Cinema',group:'Movies;Entertainment'};
 assert(channelMatches(film,{category:'Movies',query:'cin'}));assert(!channelMatches(film,{category:'News'}));
 assert(channelMatches(film,{language:{ids:new Set(['Film.in']),urls:new Set()}}));assert(!channelMatches(film,{language:{ids:new Set(['Other.in']),urls:new Set()}}));
 assert(channelMatches({...film,group:'General'},{category:'Entertainment'}));
});
test('directory reads share one in-flight request and reuse the cached result',async()=>{
 let calls=0;const load=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return ['channel'];};
 const [a,b]=await Promise.all([cachedDirectory('test:one',load),cachedDirectory('test:one',load)]);assert.equal(calls,1);assert.equal(a,b);assert.equal(await cachedDirectory('test:one',load),a);
});
test('automatic country stores only country and expiry, and explicit choice takes precedence',async t=>{
 const data=new Map(),previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}});t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({country:'IN',ip:'192.0.2.1'}),{status:200}));
 assert.deepEqual(await defaultCountry(),{code:'in',source:'automatic'});assert(![...data.values()].join('').includes('192.0.2.1'));data.set('xparty.iptv.country','us');assert.deepEqual(await defaultCountry(),{code:'us',source:'chosen'});
});
test('status colors distinguish proven responses from restrictions and missing streams',()=>{
 const url='https://media.example.com/test.m3u8';assert.equal(healthFor(url).color,'yellow');assert.equal(recordHealth(url,{status:403}).color,'yellow');assert.equal(recordHealth(url,{status:404}).color,'red');assert.equal(recordHealth(url,{playing:true}).color,'green');assert.equal(recordHealth(url,{}).color,'green');assert.equal(recordHealth(url,{fromPlayback:true}).color,'yellow');
 for(let n=0;n<2;n++)assert.equal(recordHealth(url,{status:503}).color,'yellow');assert.equal(recordHealth(url,{status:503}).color,'red');
});
test('health probe is bounded, caches success and treats browser rejection as unknown',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async url=>{calls++;return new Response(url.endsWith('.m3u8')?'#EXTM3U\n#EXTINF:4,\npart.ts\n':'media',{status:200});});
 const url='https://media.example.com/probe.m3u8';assert.equal((await checkChannel(url)).color,'green');assert.equal(calls,2);await checkChannel(url);assert.equal(calls,2);
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch');});assert.equal((await checkChannel('https://media.example.com/blocked.m3u8')).color,'yellow');
});
