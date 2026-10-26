import {validProviderId,publicVideoURL,publicStreamURL,publicRadioURL} from './providers.js';
const KEY='xparty.saved-videos.v1';
export function savedSource(source){
 if(!source)return null;const title=String(source.title||'Saved video').slice(0,150),type=source.type;
 if(['youtube','vimeo','twitch','soundcloud'].includes(type)&&validProviderId(type,source.videoId))return {type,videoId:source.videoId,title};
 const url=type==='direct'?publicVideoURL(source.url):type==='iptv'?(source.radio?publicRadioURL(source.url):publicStreamURL(source.url)):null;
 return url?{type,url,title,...(source.radio?{radio:true}:{})}:null;
}
export const savedKey=source=>source?source.type+':'+(source.videoId||source.url):'';
export function createSavedVideos(storage){
 const list=()=>{try{const values=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(values)?values.slice(0,300).map(savedSource).filter(Boolean):[];}catch{return [];}};
 function has(source){const value=savedSource(source);return !!value&&list().some(v=>savedKey(v)===savedKey(value));}
 function set(source,enabled){const value=savedSource(source);if(!value)return false;const next=list().filter(v=>savedKey(v)!==savedKey(value));if(enabled)next.unshift(value);storage.setItem(KEY,JSON.stringify(next.slice(0,300)));return true;}
 return {list,has,set};
}
let library;
export function savedVideos(){if(!library){let storage;try{storage=localStorage;}catch{}library=createSavedVideos(storage||{getItem:()=>null,setItem:()=>{throw Error('Browser storage unavailable');}});}return library;}
export function saveVideo(source,enabled){const result=savedVideos().set(source,enabled);if(result)window.dispatchEvent(new Event('xparty:saved-videos'));return result;}
