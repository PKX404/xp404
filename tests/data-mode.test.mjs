import test from 'node:test';
import assert from 'node:assert/strict';
import {bindHlsDataMode,levelForMode,setDataMode,getDataMode} from '../public/xparty/data-mode.js';
const levels=[{height:240,bitrate:240000},{height:360,bitrate:480000},{height:720,bitrate:1400000},{height:1080,bitrate:4500000}];
test('data modes select real encoded bitrate variants, with bounded fallback',()=>{
 assert.equal(levelForMode(levels,'low'),1);assert.equal(levelForMode(levels,'mid'),2);assert.equal(levelForMode(levels,'high'),3);assert.equal(levelForMode(levels,'auto'),-1);
 assert.equal(levelForMode([levels[3]],'low'),0);assert.equal(levelForMode([],'high'),-1);
 setDataMode('invalid');assert.equal(getDataMode(),'auto');
});
test('HLS mode changes cap adaptive quality without reloading or seeking, and detach listeners',()=>{
 const events=new Map(),player={levels,on:(e,f)=>events.set(e,f),off:e=>events.delete(e)},Hls={Events:{MANIFEST_PARSED:'manifest',LEVELS_UPDATED:'levels'}};
 const binding=bindHlsDataMode(player,Hls);setDataMode('low');assert.equal(player.autoLevelCapping,1);assert.equal(player.nextLevel,-1);assert.match(binding.info(),/360p.*0.48 Mbps/);
 setDataMode('high');assert.equal(player.autoLevelCapping,-1);assert.equal(player.nextLevel,3);
 setDataMode('auto');assert.equal(player.autoLevelCapping,-1);assert.equal(player.nextLevel,-1);
 player.levels=[levels[3]];events.get('levels')();assert.match(binding.info(),/one quality/);
 binding.destroy();setDataMode('mid');assert.equal(player.autoLevelCapping,-1);assert.equal(events.size,0);setDataMode('auto');
});
