import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProviderLink,validProviderId,isEmbedded,isLiveSource,createTwitchPlayer,createSoundCloudPlayer} from '../public/xparty/providers.js';

test('Twitch parses canonical channels and VODs; SoundCloud accepts only public single-track permalinks',()=>{
 const live=parseProviderLink('https://www.twitch.tv/TwitchDev?referrer=share');
 assert.deepEqual(live,{type:'twitch',videoId:'channel:twitchdev',live:true,title:'twitchdev · Twitch live'});
 assert.equal(isLiveSource(live),true);assert.equal(isEmbedded(live),true);
 const vod=parseProviderLink('https://twitch.tv/videos/1234567890?t=1m');assert.equal(vod.videoId,'video:1234567890');assert.equal(isLiveSource(vod),false);
 const track=parseProviderLink('https://www.soundcloud.com/artist/song-title/?utm_source=clipboard');
 assert.equal(track.videoId,'https://soundcloud.com/artist/song-title');assert.equal(validProviderId(track.type,track.videoId),true);assert.equal(isEmbedded(track),true);
 for(const link of ['http://twitch.tv/twitchdev','https://twitch.tv:8443/twitchdev','https://user:pass@twitch.tv/twitchdev','https://twitch.tv.evil.test/twitchdev','https://twitch.tv/directory','https://clips.twitch.tv/AClip','https://twitch.tv/twitchdev/clip/AClip','https://twitch.tv/videos/0','https://soundcloud.com.evil.test/artist/song','https://soundcloud.com/artist/sets/album','https://soundcloud.com/artist/likes','https://soundcloud.com/artist/song/private-token','https://soundcloud.com/artist','https://on.soundcloud.com/short','https://soundcloud.com/artist/song#fragment','https://soundcloud.com/artist/%3Cscript%3E'])assert.equal(parseProviderLink(link),null,link);
 for(const id of ['channel:TwitchDev','channel:directory','video:0','channel:a/b','<iframe>'])assert.equal(validProviderId('twitch',id),false,id);
 for(const id of ['https://www.soundcloud.com/artist/song','https://soundcloud.com/artist/song?secret_token=x','javascript:alert(1)','https://soundcloud.com/artist/sets'])assert.equal(validProviderId('soundcloud',id),false,id);
});

function browser(t,extra={}){
 const previous={window:globalThis.window,document:globalThis.document};
 function element(tag){return {tag,children:[],attributes:{},append(child){child.parent=this;this.children.push(child);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);},setAttribute(name,value){this.attributes[name]=value;}};}
 globalThis.document={createElement:element,head:element('head')};globalThis.window={location:{hostname:'party.example.com'},...extra};
 t.after(()=>{for(const key of ['window','document'])if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];});
 return element('host');
}
function twitchMock({ready=true}={}){
 const instances=[];
 class Player{
  static READY='ready';static PLAY='play';static PLAYING='playing';static PAUSE='pause';static ENDED='ended';static PLAYBACK_BLOCKED='blocked';static OFFLINE='offline';
  constructor(id,options){this.id=id;this.options=options;this.handlers=new Map();this.calls=[];instances.push(this);if(ready)queueMicrotask(()=>this.emit(Player.READY));}
  addEventListener(event,handler){this.handlers.set(event,handler);}removeEventListener(event){this.handlers.delete(event);}emit(event){this.handlers.get(event)?.();}
  play(){this.calls.push(['play']);}pause(){this.calls.push(['pause']);}seek(value){this.calls.push(['seek',value]);}setVolume(value){this.calls.push(['volume',value]);}setMuted(value){this.calls.push(['muted',value]);}
  getCurrentTime(){return 18.25;}getDuration(){return 180;}
 }
 return {Twitch:{Player},instances};
}
test('Twitch VOD adapter uses current parent, seconds and official volume scale; disposal rejects late events',async t=>{
 const mock=twitchMock(),host=browser(t,mock),states=[],errors=[];
 const player=await createTwitchPlayer(host,'video:1234567890',event=>states.push(event.data),error=>errors.push(error));const raw=mock.instances[0];
 assert.deepEqual(raw.options.parent,['party.example.com']);assert.equal(raw.options.video,'v1234567890');assert.equal(raw.options.channel,undefined);assert.equal(player.canSeek,true);
 assert.equal(player.getCurrentTime(),18.25);assert.equal(player.getDuration(),180);player.seekTo(10.5);player.setVolume(40);player.unMute();
 assert.deepEqual(raw.calls,[['seek',10.5],['volume',0.4],['muted',false]]);
 raw.emit(mock.Twitch.Player.PLAY);raw.emit(mock.Twitch.Player.PLAYING);assert.deepEqual(states,[3,1]);assert.equal(player.getPlayerState(),1);
 const late=raw.handlers.get(mock.Twitch.Player.PLAYING);player.destroy();late();player.playVideo();assert.deepEqual(states,[3,1]);assert.equal(host.children.length,0);assert.equal(raw.calls.at(-1)[0],'pause');assert.deepEqual(errors,[]);
});
test('Twitch live streams never expose a fabricated duration or issue a seek',async t=>{
 const mock=twitchMock(),host=browser(t,mock);const player=await createTwitchPlayer(host,'channel:twitchdev');const raw=mock.instances[0];
 assert.equal(raw.options.channel,'twitchdev');assert.equal(raw.options.video,undefined);assert.equal(player.canSeek,false);assert.equal(player.isLive,true);assert.equal(player.getCurrentTime(),0);assert.equal(player.getDuration(),0);player.seekTo(95);assert.deepEqual(raw.calls,[]);player.destroy();
});
test('Twitch initialization cleans up a timeout and an aborted source change',async t=>{
 const mock=twitchMock({ready:false}),host=browser(t,mock);
 await assert.rejects(createTwitchPlayer(host,'video:1234567890',undefined,undefined,{timeoutMs:5}),/timed out/);assert.equal(host.children.length,0);
 const controller=new AbortController();const pending=createTwitchPlayer(host,'channel:twitchdev',undefined,undefined,{signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));assert.equal(host.children.length,1);controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(host.children.length,0);
});

function soundcloudMock({ready=true}={}){
 const instances=[];const Events=Object.fromEntries(['READY','ERROR','PLAY_PROGRESS','SEEK','PLAY','PAUSE','FINISH'].map(name=>[name,name]));
 function Widget(iframe){const widget={iframe,handlers:new Map(),calls:[],bind(event,handler){this.handlers.set(event,handler);},unbind(event){this.handlers.delete(event);},emit(event,payload){this.handlers.get(event)?.(payload);},getDuration(callback){this.durationCallback=callback;callback(123456);},getPosition(callback){this.positionCallback=callback;},play(){this.calls.push(['play']);},pause(){this.calls.push(['pause']);},seekTo(value){this.calls.push(['seek',value]);},setVolume(value){this.calls.push(['volume',value]);}};instances.push(widget);if(ready)queueMicrotask(()=>widget.emit(Events.READY));return widget;}
 Widget.Events=Events;return {SC:{Widget},instances};
}
test('SoundCloud converts widget milliseconds to seconds and guards stale callbacks after seeking or destroying',async t=>{
 const mock=soundcloudMock(),host=browser(t,mock),states=[],errors=[];const player=await createSoundCloudPlayer(host,'https://soundcloud.com/artist/song',event=>states.push(event.data),error=>errors.push(error));const raw=mock.instances[0],iframe=host.children[0],url=new URL(iframe.src);
 assert.equal(url.origin,'https://w.soundcloud.com');assert.equal(url.searchParams.get('url'),'https://soundcloud.com/artist/song');assert.equal(url.searchParams.get('auto_play'),'false');assert.equal(player.getDuration(),123.456);
 raw.emit(mock.SC.Widget.Events.PLAY_PROGRESS,{currentPosition:15500});assert.equal(player.getCurrentTime(),15.5);raw.positionCallback(0);assert.equal(player.getCurrentTime(),15.5);
 player.seekTo(20.25);player.setVolume(35);assert.equal(player.getCurrentTime(),20.25);assert.deepEqual(raw.calls,[['seek',20250],['volume',35]]);
 raw.emit(mock.SC.Widget.Events.PLAY,{currentPosition:20300});assert.equal(player.getPlayerState(),1);assert.equal(player.getCurrentTime(),20.3);
 const late=raw.handlers.get(mock.SC.Widget.Events.PLAY_PROGRESS);player.destroy();late({currentPosition:90000});raw.durationCallback(999999);player.seekTo(90);assert.equal(player.getCurrentTime(),20.3);assert.equal(player.getDuration(),123.456);assert.equal(host.children.length,0);assert.deepEqual(states,[1]);assert.deepEqual(errors,[]);
});
test('SoundCloud readiness timeout removes its iframe and unbinds handlers',async t=>{
 const mock=soundcloudMock({ready:false}),host=browser(t,mock);await assert.rejects(createSoundCloudPlayer(host,'https://soundcloud.com/artist/song',undefined,undefined,{timeoutMs:5}),/timed out/);assert.equal(host.children.length,0);assert.equal(mock.instances[0].handlers.size,0);
});
