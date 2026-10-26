import {publicStreamURL,publicRadioURL} from './providers.js';
import {parseM3U} from './iptv-playlist.js';
import {countryList,languageList,defaultCountry,rememberCountry,channelPlaylist,channelMatches} from './channel-directory.js';
import {fetchRadioChannels} from './radio-directory.js';
import {healthDot,updateHealthDot,checkChannel} from './channel-health.js';
import {savedVideos,saveVideo} from './saved-videos.js';
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e;};
export function initIPTV({getContext,send,notify,retry,goLive}){
 const $=id=>document.getElementById(id),panel=node('section');panel.id='iptv-panel';panel.hidden=true;
 panel.innerHTML='<div class="iptv-heading"><span class="live-badge">LIVE TV</span><h2>Find your channel</h2></div><div class="iptv-filter-row"><label>Country<select id="iptv-country"><option value="">Worldwide</option></select></label><label>Language<select id="iptv-language"><option value="">Any language</option></select></label></div><p id="iptv-location-note" class="small"></p><label for="iptv-filter">Search channels</label><input type="search" id="iptv-filter" placeholder="Channel name or category" maxlength="100"/><p id="iptv-status" role="status" class="small"></p><p class="iptv-health-legend"><span data-health="green">Responding</span><span data-health="yellow">Unverified / restricted</span><span data-health="red">Unavailable</span></p><div id="iptv-channels"></div><button type="button" id="iptv-more" hidden>Show more channels</button><details class="iptv-custom"><summary>Your stream or playlist</summary><form id="iptv-stream-form"><label for="iptv-url">Stream URL</label><input id="iptv-url" type="url" required placeholder="https://…/live.m3u8" maxlength="2048"/><button class="primary" type="submit">Watch stream</button></form><label class="iptv-import" for="iptv-import">Import M3U playlist<input id="iptv-import" type="file" accept=".m3u,.m3u8,text/plain,audio/x-mpegurl"/></label><p class="small">Your playlist stays on this device.</p></details><p class="small iptv-attribution">Directory: <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noopener">IPTV-org</a>. Automatic country: <a href="https://country.is" target="_blank" rel="noopener">Country.is</a> uses your public IP; VPNs may change the result. You can change country anytime.</p>';
 $('source-panel').querySelector('.provider-picker').after(panel);
 const controls=node('div','iptv-controls');controls.hidden=true;controls.innerHTML='<span class="live-badge">LIVE</span><button type="button" class="secondary" id="iptv-go-live">Go live</button><button type="button" class="secondary" id="iptv-retry">Retry channel</button><button type="button" class="secondary" id="iptv-browse">Channels</button>';$('player-shell').after(controls);
 let channels=[],generation=0,setupPromise=null,category='All',pendingChannel=null,autoPlayUrl=null,limit=24,language=null,languageGeneration=0,searchTimer,loaded=false;
 const chips=node('div','iptv-category-chips');
 for(const label of ['All','Saved','Movies','Entertainment','News','Sports','Kids','Music','Radio']){
  const b=node('button','',label);b.type='button';b.setAttribute('aria-pressed',String(label==='All'));
  b.onclick=()=>{const reload=(category==='Radio')!==(label==='Radio');category=label;limit=24;for(const chip of chips.children)chip.setAttribute('aria-pressed',String(chip===b));if(reload)load();else render();};chips.append(b);
 }$('iptv-filter').before(chips);
 const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&!panel.hidden){const url=e.target.dataset.url;observer.unobserve(e.target);checkChannel(url);}}, {root:$('iptv-channels'),rootMargin:'24px'});
 function play(channel){const {room}=getContext();if(!room){pendingChannel=channel;document.querySelector('[data-service=iptv]')?.click();return;}autoPlayUrl=channel.url;send('source',{source:{type:'iptv',url:channel.url,title:channel.title,...(channel.radio?{radio:true}:{})}});}
 window.addEventListener('xparty:pick-channel',e=>{const c=e.detail;if(!c||!(c.radio?publicRadioURL(c.url):publicStreamURL(c.url)))return;if(getContext().room)$('return-room').click();play(c);});
 function source(c){return {type:'iptv',url:c.url,title:c.title,...(c.radio?{radio:true}:{})};}
 function render(){
  const box=$('iptv-channels'),scroll=box.scrollTop,{room,me}=getContext();observer.disconnect();
  const available=category==='Saved'?savedVideos().list().filter(c=>c.type==='iptv').map(c=>({...c,group:'Saved'})):channels;
  const matches=available.filter(c=>channelMatches(c,{query:$('iptv-filter').value,category,language:category==='Saved'?null:language}));
  const fragment=document.createDocumentFragment();
  for(const c of matches.slice(0,limit)){
   const card=node('article','iptv-card'),row=node('button','iptv-channel');row.type='button';row.dataset.url=c.url;row.disabled=!!room&&room.hostId!==me&&room.mode==='HOST_ONLY';
   const logo=node('span','iptv-logo');if(c.logo){const img=new Image();img.src=c.logo;img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>{img.remove();logo.textContent=c.title.slice(0,2).toUpperCase();};logo.append(img);}else logo.textContent=c.title.slice(0,2).toUpperCase();
   const meta=node('span','iptv-channel-copy');meta.append(node('strong','',c.title),node('span','',c.group||(c.radio?'Radio':'Live channel')));
   row.append(logo,meta,healthDot(c.url));row.classList.toggle('channel-playing',room?.source?.url===c.url&&room.playback?.playing);row.setAttribute('aria-label',(!room||room.hostId===me?'Watch ':'Request ')+c.title);row.onclick=()=>play(c);
   if(c.radio){const wave=node('span','radio-wave');wave.innerHTML='<i></i><i></i><i></i>';row.append(wave);}
   const saved=savedVideos().has(source(c)),heart=node('button','channel-save',saved?'♥':'♡');heart.type='button';heart.setAttribute('aria-pressed',String(saved));heart.setAttribute('aria-label',(saved?'Unsave ':'Save ')+c.title);
   heart.onclick=()=>{try{saveVideo(source(c),!savedVideos().has(source(c)));}catch{notify('Unable to save: browser storage is unavailable.');}};
   card.append(row,heart);fragment.append(card);
  }
  box.replaceChildren(fragment);box.scrollTop=scroll;for(const row of box.querySelectorAll('.iptv-channel'))observer.observe(row);
  $('iptv-status').textContent=matches.length+' '+(category==='Radio'?'stations':'channels')+(matches.length>limit?' · showing '+limit:'');$('iptv-more').hidden=matches.length<=limit;
 }
 async function load(){
  const current=++generation,country=$('iptv-country').value;channels=[];loaded=false;limit=24;render();$('iptv-status').textContent='Loading channels…';
  try{const values=category==='Radio'?await fetchRadioChannels(country):await channelPlaylist(country?'countries':'categories',country||'general');if(current!==generation)return;channels=values;loaded=true;render();if(!channels.length)$('iptv-status').textContent='No compatible HTTPS channels. Try another country or import a playlist.';}
  catch(e){if(current===generation)$('iptv-status').textContent=e.message+' Change country to retry, or paste a stream.';}
 }
 async function setup(){
  if(setupPromise)return setupPromise;
  setupPromise=(async()=>{
   const [countries,choice]=await Promise.all([countryList().catch(()=>[]),defaultCountry()]);
   for(const c of countries){const option=node('option','',c.name);option.value=c.code.toLowerCase();$('iptv-country').append(option);}
   if([...$('iptv-country').options].some(o=>o.value===choice.code))$('iptv-country').value=choice.code;
   $('iptv-location-note').textContent=choice.source==='automatic'?'Country selected automatically from your IP.':choice.source==='chosen'?'Using your chosen country.':'Automatic location unavailable · showing worldwide channels.';
   languageList().then(values=>{for(const l of values){const option=node('option','',l.name);option.value=l.code;$('iptv-language').append(option);}}).catch(()=>{});
   await load();
  })();return setupPromise;
 }
 $('iptv-country').onchange=()=>{rememberCountry($('iptv-country').value);$('iptv-location-note').textContent='Using your chosen country.';load();};
 $('iptv-language').onchange=async()=>{const code=$('iptv-language').value,current=++languageGeneration;limit=24;if(!code){language=null;render();return;}$('iptv-status').textContent='Loading language filter…';try{const values=await channelPlaylist('languages',code);if(current!==languageGeneration)return;language={ids:new Set(values.map(c=>c.id).filter(Boolean)),urls:new Set(values.map(c=>c.url))};render();}catch(e){if(current===languageGeneration){language=null;$('iptv-language').value='';render();$('iptv-status').textContent='Language directory unavailable; language filter cleared.';}}};
 $('iptv-filter').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{limit=24;render();},120);};
 $('iptv-more').onclick=()=>{limit+=24;render();};
 $('iptv-import').onchange=async()=>{const file=$('iptv-import').files?.[0];$('iptv-import').value='';if(!file)return;const current=++generation;if(file.size>2*1024*1024)return notify('Choose a playlist smaller than 2 MB.');try{const result=parseM3U(await file.text());if(current!==generation)return;channels=result.channels;loaded=true;category='All';for(const chip of chips.children)chip.setAttribute('aria-pressed',String(chip.textContent===category));$('iptv-country').value='';$('iptv-filter').value='';$('iptv-language').value='';language=null;languageGeneration++;limit=24;render();$('iptv-location-note').textContent='Your imported playlist.';}catch(e){notify(e.message);}};
 $('iptv-stream-form').onsubmit=e=>{e.preventDefault();const url=publicStreamURL($('iptv-url').value.trim());if(!url)return notify('Use an HTTPS HLS stream ending in .m3u8.');play({url,title:'Live IPTV'});};
 $('source-panel').addEventListener('click',e=>{const key=e.target.closest('[data-provider]')?.dataset.provider;if(!key)return;panel.hidden=key!=='iptv';if(key==='iptv'){setup().then(()=>{if(!loaded)load();});$('file-form').hidden=true;$('youtube-search-panel').hidden=true;$('youtube-suggestions-panel').hidden=true;document.querySelector('.discovery-tabs').hidden=true;}});
 for(const id of ['youtube-tab','file-tab'])$(id).addEventListener('click',()=>panel.hidden=true);
 $('iptv-go-live').onclick=goLive;$('iptv-retry').onclick=retry;$('iptv-browse').onclick=()=>{$('browse').click();document.querySelector('[data-provider=iptv]').click();};
 window.addEventListener('xparty:country',e=>{if(setupPromise&&$('iptv-country').value!==e.detail){$('iptv-country').value=e.detail;if(!panel.hidden)load();else loaded=false;}});
 window.addEventListener('xparty:saved-videos',()=>{if(!panel.hidden)render();});
 window.addEventListener('xparty:channel-health',e=>{for(const dot of panel.querySelectorAll('[data-health-url]'))if(dot.dataset.healthUrl===e.detail.url)updateHealthDot(dot,e.detail.url);});
 function update(){const {room}=getContext();if(pendingChannel&&room){const channel=pendingChannel;pendingChannel=null;play(channel);}for(const row of panel.querySelectorAll('.iptv-channel'))row.classList.toggle('channel-playing',!!room?.playback?.playing&&row.dataset.url===room?.source?.url);controls.hidden=room?.source?.type!=='iptv';}
 return {update,consumeAutoplay(source){if(source?.url&&source.url===autoPlayUrl){autoPlayUrl=null;return true;}return false;}};
}
