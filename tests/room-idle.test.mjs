import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyRoomExpired} from '../room-idle.mjs';

test('a quiet watch session never expires while a participant is connected',()=>{
 const room={people:new Map([['a',{online:true}]]),emptySince:0,playback:{playing:true}};
 assert.equal(emptyRoomExpired(room,p=>p.online,15*60*1000+1),false);
 assert.equal(room.emptySince,null);
});
test('a room closes after fifteen minutes without any connected participants',()=>{
 const room={people:new Map([['a',{online:false}]]),playback:{playing:true}};
 const online=p=>p.online,now=1700000000000,limit=15*60*1000;
 assert.equal(emptyRoomExpired(room,online,now,limit),false);
 assert.equal(room.emptySince,now);
 assert.equal(emptyRoomExpired(room,online,now+limit-1,limit),false);
 assert.equal(emptyRoomExpired(room,online,now+limit,limit),true);
});
test('rejoining resets the empty-room timer',()=>{
 const participant={online:false},room={people:new Map([['a',participant]])},online=p=>p.online,limit=900000,now=1000;
 emptyRoomExpired(room,online,now,limit);
 participant.online=true;
 assert.equal(emptyRoomExpired(room,online,now+limit,limit),false);
 participant.online=false;
 assert.equal(emptyRoomExpired(room,online,now+limit+1,limit),false);
 assert.equal(room.emptySince,now+limit+1);
});
