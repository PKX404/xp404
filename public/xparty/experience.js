import {icon} from './icons.js';
import {providerName} from './provider-ui.js';
import {serviceIcon} from './service-icons.js';

// Shared app navigation. Actions retain the room and account permission checks.
export function initExperience({getContext,notify=()=>{}}){
 const $=id=>document.getElementById(id),body=document.body,lobby=$('lobby'),room=$('room');
 let pendingProvider=null,previousFocus=null,sheetOpen=false;
 const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 const action=(text,handler,className='')=>{const button=element('button',className,text);button.type='button';button.onclick=handler;return button;};
 body.classList.add('app-experience');
 const home=element('section','home-explore');home.setAttribute('aria-labelledby','home-explore-title');
 const heading=element('div','home-heading'),title=element('h1','','Watch together.');title.id='home-explore-title';
 heading.append(element('span','home-kicker','YOUR PEOPLE. YOUR PLAYLIST.'),title,element('p','','Pick a service. Start a room. Bring everyone along.'));
 // Preserve the user's original Made4Love / Aanchal dedication and styling.
 const dedication=lobby.querySelector('.intro .dedication'),dedicationParent=dedication?.parentNode,dedicationNext=dedication?.nextSibling;
 if(dedication)heading.append(dedication);
 const grid=element('div','home-services');grid.setAttribute('aria-label','Start watching with a service');
 const providers=[
  ['iptv','Channels by country','Live'],['youtube','Videos & music','YT'],['netflix','Desktop companion','N'],['prime','Desktop companion','prime'],
  ['twitch','Live streams','tw'],['soundcloud','Music & mixes','SC'],['vimeo','Films & creators','v'],
  ['drive','Your video library','Drive'],['file','From your device','Files'],['direct','Paste a video link','Link']
 ];
 const openProvider=key=>{
  if(navigator.userAgent.includes('XpartyAndroid/')&&['netflix','prime'].includes(key)){notify(providerName(key)+' currently uses the desktop companion. Android playback is not available yet.');return;}
  pendingProvider=key;
  if(getContext().room){$('return-room').click();showPending();}else $('create-toggle').click();
 };
 for(const[key,note,mark]of providers){
  const button=action('',()=>openProvider(key),'home-service');button.dataset.service=key;
  button.setAttribute('aria-label','Watch with '+providerName(key));
  button.append(serviceIcon(key),element('strong','',providerName(key)),element('span','service-note',note));grid.append(button);
 }
 home.append(heading,grid);lobby.prepend(home);
 const card=lobby.querySelector('.entry-card');card.querySelector('.card-kicker').textContent='MAKE IT YOUR ROOM';card.querySelector('h2').textContent='Start the party.';
 card.querySelector(':scope > p.muted').textContent='A private room for you and your friends.';
 card.querySelector('.divider span').textContent='HAVE AN INVITATION?';
 $('preview').textContent='Explore a demo room';
 const dock=element('nav','app-dock');dock.setAttribute('aria-label','Main navigation');
 for(const[label,name,id]of [['Explore','home','nav-home'],['Friends','people','nav-friends'],['Create','plus','create-toggle'],['Messages','message','nav-messages'],['Profile','person','open-profile']]){
  const button=action('',()=>{pendingProvider=null;$(id).click();},'dock-action');button.dataset.destination=id;
  icon(button,name,label);button.append(element('span','dock-label',label));if(id==='create-toggle')button.classList.add('dock-create');dock.append(button);
 }
 body.append(dock);
 function showPending(){if(!pendingProvider||room.hidden)return;const selected=pendingProvider;pendingProvider=null;$('browse').click();document.querySelector('.provider-picker [data-provider="'+selected+'"]')?.click();}
 const panel=$('source-panel'),shade=action('',()=> $('back-video').click(),'source-sheet-shade');shade.hidden=true;shade.setAttribute('aria-label','Close video services');room.append(shade);
 function update(){
  dock.hidden=!room.hidden;showPending();
  const open=body.classList.contains('browsing')&&!room.hidden&&!body.classList.contains('watch-fullscreen');shade.hidden=!open;
  if(open!==sheetOpen){sheetOpen=open;if(open){previousFocus=document.activeElement;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Choose what to watch');}
   else{panel.removeAttribute('role');panel.removeAttribute('aria-modal');panel.removeAttribute('aria-label');if(panel.contains(document.activeElement)&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;}}
  for(const button of dock.children){const selected=button.dataset.destination==='nav-home'&&!location.hash;button.toggleAttribute('aria-current',selected);if(selected)button.setAttribute('aria-current','page');}
 }
 const observer=new MutationObserver(update);observer.observe(room,{attributes:true,attributeFilter:['hidden']});observer.observe(body,{attributes:true,attributeFilter:['class']});
 const keydown=e=>{if(!sheetOpen||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();$('back-video').click();return;}if(e.key!=='Tab')return;const focusable=[...panel.querySelectorAll('button,input,select,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first.focus();}};
 document.addEventListener('keydown',keydown);window.addEventListener('hashchange',update);update();
 return {destroy(){observer.disconnect();document.removeEventListener('keydown',keydown);window.removeEventListener('hashchange',update);if(dedication)dedicationParent.insertBefore(dedication,dedicationNext);home.remove();dock.remove();shade.remove();body.classList.remove('app-experience');}};
}
