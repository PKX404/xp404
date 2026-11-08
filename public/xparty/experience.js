import {normalizeRoomCode,validRoomCode,ROOM_CODE_LENGTH} from './limits.js';
import {icon} from './icons.js';
import {providerName} from './provider-ui.js';
import {serviceIcon} from './service-icons.js';

// Shared app navigation. Actions retain the room and account permission checks.
export function initExperience({getContext,notify=()=>{}}){
 const $=id=>document.getElementById(id),body=document.body,lobby=$('lobby'),room=$('room');
 let pendingProvider=null,previousFocus=null,sheetOpen=false;
 window.addEventListener('xparty:create-empty',()=>{pendingProvider=null;});
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
  if(getContext().room){$('return-room').click();showPending();}else $('create').click();
 };
 for(const[key,note,mark]of providers){
  const button=action('',()=>openProvider(key),'home-service');button.dataset.service=key;
  button.setAttribute('aria-label','Watch with '+providerName(key));
  button.append(serviceIcon(key),element('strong','',providerName(key)),element('span','service-note',note));grid.append(button);
 }
 home.append(heading,grid);lobby.prepend(home);
 const card=lobby.querySelector('.entry-card');card.querySelector('.card-kicker').textContent='MAKE IT YOUR ROOM';card.querySelector('h2').textContent='Start the party.';
 card.querySelector(':scope > p.muted').textContent='Start with chat. Add a video whenever you want.';
 card.querySelector('.divider span').textContent='HAVE AN INVITATION?';
 $('preview').textContent='Explore a demo room';
 const topbar=document.querySelector('.topbar'),topNav=element('nav','home-top-nav');topNav.setAttribute('aria-label','Main navigation');
 for(const[label,name,id]of [['Explore','home','nav-home'],['Friends','people','nav-friends'],['Messages','message','nav-messages'],['Profile','person','open-profile']]){const b=action('',()=>{pendingProvider=null;$(id).click();},'home-nav-action');b.dataset.destination=id;icon(b,name,label,2.4);b.append(element('span','',label));topNav.append(b);}topbar.append(topNav);
 const dock=element('nav','app-dock');dock.setAttribute('aria-label','Create or join a room');
 const createButton=action('',()=>{pendingProvider=null;$('create-toggle').click();},'dock-action dock-create');createButton.dataset.destination='create-toggle';icon(createButton,'plus','Create a room',2.5);createButton.append(element('span','dock-label','Create room'));
 const joinDialog=element('dialog','home-join-dialog'),joinHeading=element('div','dialog-heading'),joinTitle=element('h2','','Join your people'),joinClose=action('',()=>joinDialog.close(),'close-dialog');joinTitle.id='join-room-title';joinDialog.setAttribute('aria-labelledby',joinTitle.id);icon(joinClose,'close','Close join room',2.4);joinHeading.append(joinTitle,joinClose);
 const joinForm=element('form','home-join-form'),joinLabel=element('label','','Room code'),joinInput=element('input'),joinNote=element('p','small','Enter the 7-character code shared by your host.'),joinSubmit=element('button','primary','Continue');joinInput.id='home-join-code';joinInput.maxLength=ROOM_CODE_LENGTH;joinInput.autocomplete='off';joinInput.autocapitalize='characters';joinInput.spellcheck=false;joinInput.required=true;joinInput.setAttribute('aria-label','Room code');joinInput.setAttribute('aria-describedby','home-join-note');joinNote.id='home-join-note';joinInput.placeholder='ENTER ROOM CODE';joinSubmit.type='submit';joinLabel.append(joinInput);joinForm.append(joinLabel,joinNote,joinSubmit);joinDialog.append(joinHeading,joinForm);body.append(joinDialog);
 joinInput.oninput=()=>joinInput.setCustomValidity('');joinForm.onsubmit=e=>{e.preventDefault();const code=normalizeRoomCode(joinInput.value);if(!validRoomCode(code)){joinInput.setCustomValidity('Use the 7 letters and numbers from your room invitation.');joinInput.reportValidity();return;}pendingProvider=null;$('code').value=code;$('code').dispatchEvent(new Event('input',{bubbles:true}));joinDialog.close();$('join-form').requestSubmit();};
 const joinButton=action('',()=>{if(joinDialog.open)return;joinInput.value='';joinInput.setCustomValidity('');joinDialog.showModal();joinInput.focus();},'dock-action dock-join');joinButton.dataset.destination='join-room';icon(joinButton,'leave','Join a room',2.4);joinButton.append(element('span','dock-label','Join room'));dock.append(createButton,joinButton);body.append(dock);
 const sizeHeader=()=>{if(!body.classList.contains('in-room'))document.documentElement.style.setProperty('--home-header-height',Math.ceil(topbar.getBoundingClientRect().height)+'px');};const headerObserver=new ResizeObserver(sizeHeader);headerObserver.observe(topbar);sizeHeader();
 function showPending(){if(!pendingProvider||room.hidden)return;const selected=pendingProvider;pendingProvider=null;$('browse').click();document.querySelector('.provider-picker [data-provider="'+selected+'"]')?.click();}
 const panel=$('source-panel'),shade=action('',()=> $('back-video').click(),'source-sheet-shade');shade.hidden=true;shade.setAttribute('aria-label','Close video services');room.append(shade);
 function update(){
  dock.hidden=!room.hidden;showPending();
  const open=body.classList.contains('browsing')&&!room.hidden&&!body.classList.contains('watch-fullscreen');shade.hidden=!open;
  if(open!==sheetOpen){sheetOpen=open;if(open){previousFocus=document.activeElement;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Choose what to watch');}
   else{panel.removeAttribute('role');panel.removeAttribute('aria-modal');panel.removeAttribute('aria-label');if(panel.contains(document.activeElement)&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;}}
  for(const button of topNav.children){const id=button.dataset.destination;const selected=id==='nav-home'&&!location.hash||id==='nav-friends'&&location.hash==='#friends'||id==='nav-messages'&&location.hash==='#messages'||id==='open-profile'&&location.hash==='#profile';button.toggleAttribute('aria-current',selected);if(selected)button.setAttribute('aria-current','page');}
 }
 const observer=new MutationObserver(update);observer.observe(room,{attributes:true,attributeFilter:['hidden']});observer.observe(body,{attributes:true,attributeFilter:['class']});
 const keydown=e=>{if(!sheetOpen||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();$('back-video').click();return;}if(e.key!=='Tab')return;const focusable=[...panel.querySelectorAll('button,input,select,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first.focus();}};
 document.addEventListener('keydown',keydown);window.addEventListener('hashchange',update);update();
 return {destroy(){observer.disconnect();headerObserver.disconnect();topNav.remove();joinDialog.remove();document.removeEventListener('keydown',keydown);window.removeEventListener('hashchange',update);if(dedication)dedicationParent.insertBefore(dedication,dedicationNext);home.remove();dock.remove();shade.remove();body.classList.remove('app-experience');}};
}
