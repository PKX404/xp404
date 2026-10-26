import test from 'node:test';
import assert from 'node:assert/strict';
import {ambientActive,colorsFromPixels} from '../public/xparty/ambient.js';
test('ambient pixel sampling averages each third and ignores transparent pixels',()=>{const pixels=new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,1,1,1,0,0,127,0,255,0,0,127,255]);assert.deepEqual(colorsFromPixels(pixels,3,2),[[255,0,0],[0,191,0],[0,0,191]]);});
test('ambient sampling safely handles empty/transparent colors',()=>{assert.deepEqual(colorsFromPixels(new Uint8ClampedArray(12),3,1),[[47,66,87],[47,66,87],[47,66,87]]);});
test('automatic native frame work stops for pause, leave, hidden document and reduced motion',()=>{const base={hidden:false,reduced:false,room:{source:{id:'video'}},playing:true};assert.equal(ambientActive(base),true);for(const patch of [{hidden:true},{reduced:true},{room:null},{room:{}},{playing:false},{visible:false}])assert.equal(ambientActive({...base,...patch}),false);});
