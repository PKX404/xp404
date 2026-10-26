import test from 'node:test';
import assert from 'node:assert/strict';
import {createFramePump} from '../public/xparty/ambient.js';

test('presented-frame pump renders once per callback with no queued backlog and cancels immediately',()=>{
 let next=0,enabled=true;const callbacks=new Map(),seen=[];
 const video={requestVideoFrameCallback:f=>{callbacks.set(++next,f);return next;},cancelVideoFrameCallback:id=>callbacks.delete(id)};
 const pump=createFramePump(video,(_,m)=>seen.push(m.mediaTime),{active:()=>enabled});
 pump.start();pump.start();assert.equal(callbacks.size,1);
 for(let i=0;i<60;i++){const[id,callback]=callbacks.entries().next().value;callbacks.delete(id);callback(i*16.7,{mediaTime:i/60});assert.equal(callbacks.size,1);}
 assert.equal(seen.length,60);pump.stop();assert.equal(callbacks.size,0);assert.equal(pump.pending,false);
 pump.start();enabled=false;const callback=callbacks.values().next().value;callbacks.clear();callback(1010,{mediaTime:2});assert.equal(seen.length,60);assert.equal(callbacks.size,0);
 enabled=true;pump.start();assert.equal(callbacks.size,1);pump.stop();
});

test('animation-frame fallback skips duplicate video times and stops when rendering disables the pump',()=>{
 const callbacks=new Map();let next=0,count=0;const video={currentTime:0};
 const pump=createFramePump(video,()=>{if(++count===2)pump.stop();},{raf:f=>{callbacks.set(++next,f);return next;},caf:id=>callbacks.delete(id)});
 const frame=()=>{const[id,f]=callbacks.entries().next().value;callbacks.delete(id);f(0);};
 pump.start();frame();frame();assert.equal(count,1);video.currentTime=.033;frame();assert.equal(count,2);assert.equal(callbacks.size,0);
});

test('an offscreen player keeps supplying current frames without a second queued video callback',()=>{
 let time=0,next=0;const callbacks=new Map(),timers=new Map(),seen=[];
 const video={readyState:4,paused:false,ended:false,currentTime:0,requestVideoFrameCallback:f=>{callbacks.set(++next,f);return next;},cancelVideoFrameCallback:id=>callbacks.delete(id)};
 const pump=createFramePump(video,(_,m)=>seen.push(m.mediaTime),{now:()=>time,setTimer:f=>{timers.set(++next,f);return next;},clearTimer:id=>timers.delete(id)});
 const tick=()=>{time+=100;const[id,f]=timers.entries().next().value;timers.delete(id);f();};
 pump.start();video.currentTime=.1;tick();video.currentTime=.2;tick();tick();assert.deepEqual(seen,[.1,.2]);assert.equal(callbacks.size,1);assert.equal(timers.size,1);
 const[id,f]=callbacks.entries().next().value;callbacks.delete(id);f(time,{mediaTime:.3});assert.deepEqual(seen,[.1,.2,.3]);assert.equal(callbacks.size,1);
 pump.stop();assert.equal(callbacks.size,0);assert.equal(timers.size,0);
});
