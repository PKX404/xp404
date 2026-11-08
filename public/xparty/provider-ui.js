import {serviceIcon} from './service-icons.js';
import {isCompanion} from './companion-providers.js';

export const providerName = type => ({youtube:'YouTube',vimeo:'Vimeo',twitch:'Twitch',soundcloud:'SoundCloud',netflix:'Netflix',prime:'Prime Video',iptv:'Live IPTV',direct:'Video link',file:'Your files',drive:'Google Drive'})[type]||'Video';

export function initProviderUI({getContext,companion,base}) {
 let previousStatus,selected=null,previousSource,activeProvider=null;
 const $=id=>document.getElementById(id);
 const navigation=new Map();
 let manualProvider=null, lastMediaType=null, navigationRoom=null;
 function saveView(){
  if(!activeProvider)return;
  const results=$('search-results');
  navigation.set(activeProvider,{query:$('youtube-input').value,nodes:[...results.children],status:$('search-status').textContent,scroll:$('source-panel').scrollTop,resultScroll:results.scrollTop,visible:!results.hidden,suggestions:$('youtube-suggestions-panel')?.hidden===false});
 }
 function restoreView(key){
  const state=navigation.get(key);
  if(!state)return;
  if(key==='youtube'){
   $('youtube-input').value=state.query;
   $('search-results').replaceChildren(...state.nodes);$('search-results').hidden=!state.visible;
   $('search-status').textContent=state.status;
   if(state.suggestions)$('youtube-suggestions-tab')?.click();
   else if(state.query&&!state.nodes.length)$('youtube-input').dispatchEvent(new Event('input'));
  }
  requestAnimationFrame(()=>{if(activeProvider===key){$('source-panel').scrollTop=state.scroll;$('search-results').scrollTop=state.resultScroll;}});
 }
 $('source-panel').addEventListener('scroll',()=>{if(activeProvider&&document.body.classList.contains('browsing')){const s=navigation.get(activeProvider);if(s)s.scroll=$('source-panel').scrollTop;}},{passive:true});
 $('back-video').addEventListener('click',saveView,true);
 const panel=document.createElement('section');panel.id='companion-panel';panel.hidden=true;
 panel.innerHTML='<span class="provider-mode">DESKTOP COMPANION Â· PREVIEW</span><h2></h2><p>Watch in your own signed-in service tab and keep your room here for chat and calls.</p><p class="companion-status" role="status"></p><div class="companion-actions"><button type="button" class="primary" id="companion-connect">Connect service tab</button><button type="button" class="secondary" id="companion-focus">Open service tab</button><button type="button" class="secondary" id="companion-disconnect">Disconnect</button></div><details><summary>Set up XParty Companion</summary><p>Each person needs desktop Chrome or Edge, the companion, and access to the same title. Playback stays on the service website.</p><ol><li><a id="companion-download" download>Download companion</a> and extract the ZIP.</li><li>Open your browserâ€™s Extensions page, enable Developer mode, choose Load unpacked, and select the extracted xparty-companion folder.</li><li>Reload this room, connect your service tab, then start the same title there.</li></ol><p>Preview: signed-in provider playback has not been verified. Mobile and adverts are not validated. Protected video does not supply this roomâ€™s background. Adjust movie volume in the service tab.</p></details>';
 $('watch-stage').append(panel);$('companion-download').href=base+'/companion-extension.zip';
 $('companion-connect').onclick=()=>companion.connect();$('companion-focus').onclick=()=>companion.focus();$('companion-disconnect').onclick=()=>companion.disconnect();
 const picker=document.createElement('div');picker.className='provider-picker';picker.setAttribute('aria-label','Choose a video provider');
 $('source-panel').dataset.providerView='all';
 const entries=[['iptv','Live channels by country',''],['youtube','Search or paste a link','Search YouTube or paste a video link'],['netflix','Desktop companion','Paste a Netflix watch or title link'],['prime','Desktop companion','Paste an episodeâ€™s Prime Video link'],['twitch','Live channels & videos','Paste a Twitch channel or video link'],['soundcloud','Public music tracks','Paste a public SoundCloud track link'],['vimeo','Public video links','Paste a public Vimeo video link'],['drive','Your connected library',''],['direct','HTTPS MP4 or WebM','Paste an HTTPS MP4 or WebM link'],['file','Share from your device','']];
 for(const[key,description,placeholder]of entries){
  const b=document.createElement('button');b.type='button';b.className='provider-card';b.dataset.provider=key;b.setAttribute('aria-pressed','false');
  const title=document.createElement('strong');title.textContent=providerName(key);b.append(serviceIcon(key),title);b.onclick=()=>{if(activeProvider!==key)saveView();manualProvider=key;openProvider(key,placeholder);queueMicrotask(()=>restoreView(key));};picker.append(b);
 }
 $('source-panel').prepend(picker);
 const close=document.createElement('button');close.type='button';close.className='secondary provider-close';close.textContent='Back to room';close.onclick=()=>{if(activeProvider){showProviderGrid();return;}$('back-video').click();};picker.before(close);
 const serviceOpen=document.createElement('button');serviceOpen.type='button';serviceOpen.className='secondary provider-open-service';serviceOpen.hidden=true;
 const serviceMessage=document.createElement('p');serviceMessage.className='small provider-service-message';serviceMessage.hidden=true;picker.after(serviceOpen,serviceMessage);
 const serviceHomes={netflix:'https://www.netflix.com/browse',prime:'https://www.primevideo.com/',twitch:'https://www.twitch.tv/',soundcloud:'https://soundcloud.com/',vimeo:'https://vimeo.com/'};
 function showProviderGrid(){
  saveView();
  window.dispatchEvent(new Event('xparty:reset-quick-search'));
  activeProvider=null;selected=null;document.getElementById('source-panel').dataset.providerView='all';document.getElementById('source-panel').dataset.sourceWay='sources';picker.hidden=false;close.textContent='Back to room';close.setAttribute('aria-label','Back to room');serviceOpen.hidden=true;serviceMessage.hidden=true;
  for(const id of ['quick-search-tab','all-sources-tab','saved-videos-tab'])$(id)?.setAttribute('aria-selected',String(id==='all-sources-tab'));
  const iptvPanel=$('iptv-panel');if(iptvPanel)iptvPanel.hidden=true;$('file-form').hidden=true;document.querySelector('.tabs').hidden=false;$('youtube-tab').click();$('youtube-input').placeholder='Search YouTube or paste a video link';$('youtube-input').setAttribute('aria-label','Search YouTube or paste a link');
  for(const card of picker.children)card.setAttribute('aria-pressed','false');
 }
 function openProvider(key,placeholder=''){
  window.dispatchEvent(new Event('xparty:reset-quick-search'));
  activeProvider=key;selected=key;document.getElementById('source-panel').dataset.providerView=key;document.getElementById('source-panel').dataset.sourceWay='sources';picker.hidden=true;close.textContent='All sources';close.setAttribute('aria-label','Back to all sources');
  for(const id of ['quick-search-tab','all-sources-tab','saved-videos-tab'])$(id)?.setAttribute('aria-selected',String(id==='all-sources-tab'));
  for(const card of picker.children)card.setAttribute('aria-pressed',String(card.dataset.provider===key));
  const iptvPanel=$('iptv-panel');if(iptvPanel)iptvPanel.hidden=key!=='iptv';serviceOpen.hidden=!serviceHomes[key];serviceMessage.hidden=!serviceHomes[key];
  if(serviceHomes[key]){serviceOpen.textContent='Open '+providerName(key);serviceOpen.onclick=()=>window.open(serviceHomes[key],'_blank','noopener,noreferrer');serviceMessage.textContent=isCompanion({type:key})?'Choose a title with your own subscription, then paste its watch link. Playback uses the optional XParty desktop companion.':key==='twitch'?'Browse Twitch, then paste a channel or video link to play it in the room.':key==='soundcloud'?'Browse SoundCloud, then paste a public track link.':key==='vimeo'?'Browse Vimeo, then paste an embeddable video link.':'';}
  if(key==='drive'){$('back-video').click();$('open-profile').click();return;}
  if(key==='file'){$('youtube-tab').click();$('file-tab').click();$('file-form').hidden=false;$('youtube-search-panel').hidden=true;$('youtube-suggestions-panel').hidden=true;document.querySelector('.discovery-tabs').hidden=true;document.querySelector('.tabs').hidden=true;return;}
  if(key==='iptv'){$('youtube-tab').click();$('file-form').hidden=true;$('youtube-search-panel').hidden=true;$('youtube-suggestions-panel').hidden=true;document.querySelector('.discovery-tabs').hidden=true;document.querySelector('.tabs').hidden=true;return;}
  $('file-form').hidden=true;$('youtube-tab').click();$('youtube-search-panel').hidden=false;$('youtube-suggestions-panel').hidden=true;document.querySelector('.discovery-tabs').hidden=key!=='youtube';document.querySelector('.tabs').hidden=key!=='youtube';
  $('youtube-input').placeholder=placeholder||'Paste a '+providerName(key)+' video or channel link';$('youtube-input').setAttribute('aria-label',key==='youtube'?'Search YouTube or paste a link':'Paste a '+providerName(key)+' link');$('youtube-input').value='';$('search-results').replaceChildren();
  $('search-status').textContent=isCompanion({type:key})?'Open the service, choose a title, and paste its watch link. Your subscription stays with the service.':key==='youtube'?'Search YouTube videos and live streams.':key==='twitch'?'Open Twitch or paste a channel or video link.':key==='soundcloud'?'Open SoundCloud or paste a public track link.':key==='vimeo'?'Open Vimeo or paste an embeddable video link.':'Paste an HTTPS video link.';
 }
 window.addEventListener('xparty:restore-provider',()=>{
  const key=manualProvider||getContext()?.room?.source?.type;
  const card=[...picker.children].find(b=>b.dataset.provider===key);
  if(!card){showProviderGrid();return;}
  if(activeProvider===key&&$('source-panel').dataset.providerView===key)return;
  card.click();
 });
 window.addEventListener('xparty:provider-grid',showProviderGrid);
 window.addEventListener('xparty:provider-quick',()=>{window.dispatchEvent(new Event('xparty:reset-quick-search'));activeProvider=null;selected=null;document.getElementById('source-panel').dataset.providerView='quick';picker.hidden=true;serviceOpen.hidden=true;serviceMessage.hidden=true;const iptvPanel=$('iptv-panel');if(iptvPanel)iptvPanel.hidden=true;$('file-form').hidden=true;});
 const providerNote=document.createElement('p');providerNote.id='provider-playback-note';providerNote.className='small';providerNote.hidden=true;$('watch-stage').after(providerNote);
 function update(){
  const roomCode=getContext()?.room?.code;
  if(navigationRoom!==roomCode){
   navigationRoom=roomCode;navigation.clear();manualProvider=null;lastMediaType=null;activeProvider=null;previousSource=null;
  }
  const source=getContext()?.room?.source,state=companion.getState();panel.hidden=!isCompanion(source);$('watch-stage').dataset.provider=source?.type||'';if(isCompanion(source)){panel.querySelector('h2').textContent=providerName(source.type);panel.querySelector('.companion-status').textContent=state.message;$('companion-connect').hidden=state.connected;$('companion-focus').hidden=!state.connected;$('companion-disconnect').hidden=!state.connected;if(state.status==='setup-required'&&previousStatus!==state.status)panel.querySelector('details').open=true;previousStatus=state.status;}providerNote.hidden=source?.type!=='twitch';providerNote.textContent=source?.videoId?.startsWith('channel:')?'LIVE Â· Each device follows Twitchâ€™s live edge. Timing can differ. On small screens, scroll the player horizontally.':'Twitch needs a 400 Ã— 300 player. On small screens, scroll the player horizontally.';if(source?.id!==previousSource){previousSource=source?.id;if(source){if(source.type!==lastMediaType){lastMediaType=source.type;manualProvider=source.type;}selected=source.type;if(document.body.classList.contains('browsing'))$('back-video').click();}}for(const b of picker.children)b.setAttribute('aria-pressed',String(b.dataset.provider===selected));}
 update();return {update};
}
