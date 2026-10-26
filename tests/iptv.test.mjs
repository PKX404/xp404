import test from 'node:test';import assert from 'node:assert/strict';
import {parseM3U} from '../public/xparty/iptv.js';
import {parseProviderLink,publicStreamURL,isLiveSource} from '../public/xparty/providers.js';
test('IPTV recognizes HLS sources and rejects credentials, private hosts and other protocols',()=>{
 const url='https://media.example.com/live/index.m3u8';assert.equal(publicStreamURL(url),url);assert.equal(parseProviderLink(url).type,'iptv');assert(isLiveSource({type:'iptv'}));
 for(const value of ['http://media.example.com/live.m3u8','https://localhost/a.m3u8','https://127.0.0.1/a.m3u8','https://[::1]/a.m3u8','https://user:pass@media.example.com/a.m3u8','file:///a.m3u8','https://media.example.com/a.mp4','https://media.example.com:8443/a.m3u8'])assert.equal(publicStreamURL(value),null,value);
});
test('M3U imports bounded names and categories, deduplicates and skips header-dependent streams',()=>{
 const result=parseM3U('#EXTM3U\r\n#EXTINF:-1 group-title="News",World News\r\nhttps://media.example.com/news.m3u8\n#EXTINF:-1,Duplicate\nhttps://media.example.com/news.m3u8\n#EXTINF:-1,Needs headers\n#EXTVLCOPT:http-referrer=https://example.com\nhttps://media.example.com/private.m3u8\n#EXTINF:-1,Unsafe\nhttp://localhost/a.m3u8');
 assert.deepEqual(result.channels,[{title:'World News',group:'News',url:'https://media.example.com/news.m3u8'}]);assert.equal(result.skipped,3);
 assert.throws(()=>parseM3U('#EXTM3U\n#EXT-X-TARGETDURATION:6\nclip.ts'),/HLS stream/);assert.throws(()=>parseM3U('<html>no</html>'),/not an M3U/);assert.throws(()=>parseM3U('x'.repeat(2*1024*1024+1)),/2 MB/);
});
