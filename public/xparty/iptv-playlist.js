import {publicStreamURL,publicRadioURL} from './providers.js';

export function parseM3U(text){
 if(typeof text!=='string'||text.length>2*1024*1024)throw Error('Choose a playlist smaller than 2 MB.');
 if(!text.replace(/^\uFEFF/,'').trimStart().startsWith('#EXTM3U'))throw Error('This is not an M3U channel playlist.');
 if(/^#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE):/m.test(text))throw Error('This is an HLS stream. Paste its address into Stream URL instead.');
 const channels=[],seen=new Set();let title='',group='',logo='',id='',skip=false,skipped=0;
 for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(line.startsWith('#EXTINF:')){title=(line.match(/,(.*)$/)?.[1]||'Live channel').slice(0,150);group=(line.match(/group-title="([^"]*)"/)?.[1]||'').slice(0,80);logo=publicRadioURL(line.match(/tvg-logo="([^"]*)"/)?.[1])||'';id=(line.match(/tvg-id="([^"]*)"/)?.[1]||'').slice(0,100);skip=false;}
  else if(/^#(?:EXTVLCOPT|KODIPROP|EXTHTTP)/.test(line))skip=true;
  else if(line&&!line.startsWith('#')){const url=publicStreamURL(line);if(url&&!skip&&!seen.has(url)){seen.add(url);channels.push({title:title||'Live channel',group,url,...(logo?{logo}:{}),...(id?{id}:{})});if(channels.length>=1500)break;}else skipped++;title='';group='';logo='';id='';skip=false;}}
 return {channels,skipped};
}
