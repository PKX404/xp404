import {publicRadioURL} from './providers.js';
import {cachedDirectory,boundedText} from './channel-directory.js';
export function fetchRadioChannels(country,signal){
 if(!/^[a-z]{2}$/i.test(country||''))return Promise.reject(Error('Choose a country for radio.'));
 if(signal?.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
 return cachedDirectory('radio:'+country.toLowerCase(),async()=>{
  const response=await fetch('https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/'+country.toUpperCase()+'?hidebroken=true&limit=200&order=clickcount&reverse=true',{credentials:'omit',signal:AbortSignal.timeout(15000)});
  const values=JSON.parse(await boundedText(response));return values.slice(0,200).map(c=>({id:c.stationuuid,title:String(c.name||'Radio').slice(0,150),group:'Radio',url:publicRadioURL(c.url_resolved),logo:publicRadioURL(c.favicon),radio:true})).filter(c=>c.url);
 });
}
