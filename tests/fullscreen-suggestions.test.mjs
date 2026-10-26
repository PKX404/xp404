import test from 'node:test';import assert from 'node:assert/strict';
import {clampBubble} from '../public/xparty/fullscreen.js';
import {rankSuggestions} from '../public/xparty/suggestions.js';
test('call bubble stays inside portrait, landscape and resized viewports',()=>{
 for(const viewport of [{width:1366,height:900},{width:320,height:640},{width:844,height:390},{width:160,height:240}])for(const box of [{x:-900,y:-90,width:4000,height:9000},{x:2000,y:4000,width:10,height:10}]){
  const b=clampBubble(box,viewport);assert(b.x>=8);assert(b.y>=64);assert(b.x+b.width<=viewport.width-8);assert(b.y+b.height<=viewport.height-80);assert(b.width>0&&b.height>0);
 }
});
test('suggestions exclude the playing video and duplicates, while lowering queued and recently watched videos',()=>{
 const a={id:'aaaaaaaaaaa'},b={id:'bbbbbbbbbbb'},c={id:'ccccccccccc'},d={id:'ddddddddddd'};
 assert.deepEqual(rankSuggestions([a,b,c,c,d,{id:'invalid'}],{currentId:a.id,queuedIds:[b.id],recentIds:[c.id]}),[d,c,b]);
});
