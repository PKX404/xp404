import {parseProviderLink} from './providers.js';

// Website browsing is local. Only validated provider/media URLs enter room sync.
export function safeBrowserURL(value) {
  try {
    if(typeof value!=='string'||value.trim().length>2048)return null;
    const raw=value.trim(),address=/^https?:\/\//i.test(raw)?raw:'https://'+raw;
    const url=new URL(address),host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||
       (url.port&&url.port!=='443')||!host.includes('.')||
       host===location.hostname.toLowerCase()||
       /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host)||
       /^[\d.]+$/.test(host)||host.includes(':')||url.href.length>2048)return null;
    return url.href;
  }catch{return null;}
}
export function initBrowserPlayer({getContext,send,notify}) {
  const $=id=>document.getElementById(id);
  const sourcePanel=$('source-panel'),picker=sourcePanel?.querySelector('.provider-picker');
  if(!sourcePanel||!picker)return;
  const panel=document.createElement('section');
  panel.id='xparty-browser-panel';panel.hidden=true;
  panel.innerHTML=`
    <div class="xp-browser-heading"><strong>Browser</strong>
      <span>Browse without leaving your watch room</span>
      <button type="button" class="xp-browser-close" aria-label="Close browser">×</button>
    </div>
    <form class="xp-browser-address">
      <label class="sr-only" for="xp-browser-url">Secure website address</label>
      <input id="xp-browser-url" inputmode="url" type="text" autocomplete="url"
        placeholder="https://example.com/video" maxlength="2048" spellcheck="false"
        aria-label="Website address" />
      <button type="submit" class="primary">Go</button>
    </form>
    <div class="xp-browser-actions">
      <button type="button" id="xp-browser-back" aria-label="Previous website">‹</button>
      <button type="button" id="xp-browser-forward" aria-label="Next website">›</button>
      <button type="button" id="xp-browser-refresh" aria-label="Refresh website">↻</button>
      <button type="button" id="xp-browser-open-external">Full browser ↗</button>
      <button type="button" class="primary" id="xp-browser-share">Play in room</button>
    </div>
    <p class="xp-browser-status" id="xp-browser-status" role="status">
      Paste an HTTPS website link. Browsing is private to your device.
    </p>
    <div class="xp-browser-viewport">
      <iframe id="xp-browser-frame" title="Website browser preview" loading="lazy"
        sandbox="allow-scripts allow-forms allow-same-origin allow-presentation allow-popups"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        referrerpolicy="no-referrer" allowfullscreen></iframe>
      <p class="xp-browser-placeholder" id="xp-browser-placeholder">
        Enter a website address above to start browsing.
      </p>
    </div>
    <p class="xp-browser-tip">Some sites block embedded playback or DRM-protected video.
      On supported Android builds, Full browser uses an in-app browser tab.
      Only supported YouTube, Vimeo, Twitch, SoundCloud, HLS, MP4 and WebM links
      can play in sync for everyone. XParty does not bypass site restrictions.</p>`;
  picker.after(panel);
  const input=$('xp-browser-url'),frame=$('xp-browser-frame');
  const status=$('xp-browser-status'),placeholder=$('xp-browser-placeholder');
  const history=[];let position=-1;
  const nativeBrowser=navigator.userAgent.includes('XpartyBrowser/1');
  const say=value=>status.textContent=value;
  function updateButtons(){
    $('xp-browser-back').disabled=position<=0;
    $('xp-browser-forward').disabled=position>=history.length-1;
    $('xp-browser-refresh').disabled=position<0;
  }
  function navigate(raw,{record=true,nativeOnly=false}={}){
    const url=safeBrowserURL(raw);
    if(!url){say('Use a public HTTPS address. Unsafe and local network links are blocked.');return false;}
    input.value=url;
    if(record&&history[position]!==url){history.splice(position+1);history.push(url);if(history.length>25)history.shift();position=history.length-1;}
    placeholder.hidden=true;updateButtons();
    if(nativeBrowser){
      window.location.href='xpartybrowser://open?url='+encodeURIComponent(url);
      say('Opening the built-in Android browser…');
    }else if(nativeOnly){
      window.open(url,'_blank','noopener,noreferrer');
      say('Opened in a separate browser tab because this Android shell has no in-app browser support.');
    }else{
      frame.src=url;
      say('Opening website. A blank page may mean the website blocks embedding.');
    }
    return true;
  }
  function open(){
    panel.hidden=false;sourcePanel.classList.add('xp-browser-mode');
    document.body.classList.add('browsing');
    input.focus({preventScroll:true});
    panel.scrollIntoView({block:'nearest',behavior:'auto'});
  }
  function close(){
    panel.hidden=true;sourcePanel.classList.remove('xp-browser-mode');
    frame.src='about:blank';placeholder.hidden=false;
  }
  function share(raw){
    const url=safeBrowserURL(raw),source=url&&parseProviderLink(url);
    if(!source){say('This page cannot synchronize directly. Paste a supported video, audio track or stream URL instead.');return;}
    if(!getContext()?.room){notify('Create or join a room to share a video.');return;}
    send('source',{source});say('Video submitted to room. Playback depends on the provider.');
    close();
  }
  $('xp-browser-close').onclick=close;
  panel.querySelector('form').onsubmit=e=>{e.preventDefault();navigate(input.value);};
  $('xp-browser-back').onclick=()=>{if(position>0)navigate(history[--position],{record:false});};
  $('xp-browser-forward').onclick=()=>{if(position+1<history.length)navigate(history[++position],{record:false});};
  $('xp-browser-refresh').onclick=()=>{if(position>=0)navigate(history[position],{record:false});};
  $('xp-browser-share').onclick=()=>share(input.value);
  $('xp-browser-open-external').onclick=()=>navigate(input.value,{nativeOnly:true});
  picker.addEventListener('click',event=>{
    const target=event.target.closest('[data-provider]');
    if(target&&target.dataset.provider!=='browser')close();
  });
  window.addEventListener('xparty:open-browser',open);
  window.addEventListener('xparty:browser-share',event=>share(event.detail?.url||''));
  document.addEventListener('krezi:room',event=>{
    if(!panel.hidden&&event.detail?.source)close();
  });
  updateButtons();
  return {open,close};
}
