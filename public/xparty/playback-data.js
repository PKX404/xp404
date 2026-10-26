import {preferences,savePreferences} from './settings.js';
import {getDataMode,setDataMode} from './data-mode.js';
export function initPlaybackData({getContext}){
 const select=document.getElementById('data-mode'),hint=document.getElementById('data-mode-status');
 setDataMode(preferences.dataMode);select.value=getDataMode();
 function update(){
  const {source,player,native}=getContext();
  hint.textContent=!source?'Auto adapts supported streams. Mid targets 720p / 1.5 Mbps; Low targets 360p / 0.5 Mbps, when available.':
   player?.dataInfo?player.dataInfo():source.type==='iptv'?'This device controls stream quality automatically. Manual data caps require adaptive browser playback.':
   ['file','direct'].includes(source.type)?'This file has one quality. Data modes cannot compress it; a local file uses no streaming data.':
   native?'Native playback controls quality on this device.':
   'This provider controls quality. Use its player quality menu; XParty cannot enforce a data cap here.';
 }
 select.onchange=()=>{preferences.dataMode=setDataMode(select.value);savePreferences();update();};
 document.addEventListener('xparty:stream-quality',update);update();return {update};
}
