import test from 'node:test';
import assert from 'node:assert/strict';
import {directorySettings,updateDirectory,publicRooms} from '../room-directory.mjs';
const online=p=>!!p?.online;
const occupied=r=>[...r.people.values()].filter(p=>p.online||p.reserved).length;
const room=(extra={})=>({code:'ABCDEFG',hostId:'host',title:'Movie night',visibility:'public',capacity:4,people:new Map([['host',{online:true,token:'secret',name:'Private name'}]]),...extra});
const list=r=>publicRooms(new Map([['room',r]]),{online,occupied});
test('legacy rooms without visibility stay private; only the real host can publish with a title',()=>{
 const r=room({visibility:undefined});assert.equal(directorySettings(r).visibility,'private');assert.deepEqual(list(r),[]);
 assert.equal(updateDirectory(r,'guest',{visibility:'public',title:'Oops'}),false);assert.equal(updateDirectory(r,'host',{visibility:'public',title:'  '}),false);
 assert.equal(updateDirectory(r,'host',{visibility:'public',title:' Movie\n night ',language:'English'}),true);assert.equal(r.title,'Movie night');assert.equal(list(r).length,1);
 assert.equal(updateDirectory(r,'host',{visibility:'private'}),true);assert.deepEqual(list(r),[]);
});
test('directory hides locked, full and host-offline rooms, including reserved seats',()=>{
 assert.equal(list(room({locked:true})).length,0);assert.equal(list(room({capacity:1})).length,0);
 assert.equal(list(room({people:new Map([['host',{online:false}]])})).length,0);
 assert.equal(list(room({capacity:2,people:new Map([['host',{online:true}],['guest',{online:false,reserved:true}]])})).length,0);
});
test('public results disclose only selected room metadata and never member credentials, names or file names',()=>{
 const r=room({source:{type:'file',title:'private-file.mp4',id:'secret-file'}});const item=list(r)[0];assert.deepEqual(Object.keys(item).sort(),['capacity','code','language','people','title','watching']);assert.equal(item.watching,null);assert.equal(JSON.stringify(item).includes('secret'),false);assert.equal(JSON.stringify(item).includes('Private name'),false);
 r.source={type:'youtube',videoId:'dQw4w9WgXcQ',title:'A song'};assert.equal(list(r)[0].watching.videoId,'dQw4w9WgXcQ');
});
test('search matches room title, language and video with a bounded stable result',()=>{
 const rooms=new Map(Array.from({length:60},(_,i)=>[i,room({code:String(i),title:'Party '+i,language:'Kannada',source:{type:'youtube',title:'Music'}})]));
 assert.equal(publicRooms(rooms,{online,occupied}).length,50);
 assert.equal(publicRooms(rooms,{online,occupied,query:'KANNADA',limit:2}).length,2);
 assert.equal(publicRooms(rooms,{online,occupied,query:'music',limit:1}).length,1);
 assert.equal(publicRooms(rooms,{online,occupied,query:'missing'}).length,0);
});
