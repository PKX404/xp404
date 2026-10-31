import test from 'node:test';import assert from 'node:assert/strict';
import {spectrumBands,nextGlow} from '../public/xparty/music-glow.js';
test('silence does not flash',()=>{const s=spectrumBands(new Uint8Array(512));assert.deepEqual(s,{bass:0,mid:0,treble:0});assert.equal(nextGlow(s).level,0);});
test('bass glows but is capped',()=>{const s=nextGlow({bass:1,mid:.1,treble:0},{bass:0,level:.1,beatAt:-Infinity},1000);assert.ok(s.level>.1&&s.level<=.48);assert.equal(s.hue,282);});
test('treble maps to cool hue',()=>{const bytes=new Uint8Array(512);bytes.fill(255,80,140);const s=nextGlow(spectrumBands(bytes));assert.equal(s.hue,193);assert.ok(s.level<=.48);});
