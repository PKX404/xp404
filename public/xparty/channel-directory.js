import {parseM3U} from './iptv-playlist.js';
const ROOT='https://iptv-org.github.io/',cache=new Map();
const storage=()=>{try{return localStorage;}catch{return null;}};
export async function boundedText(response,max=2*1024*1024){
 if(!response.ok)throw Error('Directory unavailable ('+response.status+').');
 const reader=response.body.getReader(),decoder=new TextDecoder();let count=0,text='';
 try{for(;;){const {value,done}=await reader.read();if(done)break;count+=value.byteLength;if(count>max)throw Error('Directory is too large. Narrow the selection.');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{await reader.cancel().catch(()=>{});}
}
export function cachedDirectory(key,loader,ttl=900000){
 const prior=cache.get(key);if(prior&&prior.until>Date.now())return prior.promise;
 const entry={until:Date.now()+ttl,promise:null};entry.promise=Promise.resolve().then(loader).catch(e=>{if(cache.get(key)===entry)cache.delete(key);throw e;});cache.set(key,entry);
 if(cache.size>16)cache.delete(cache.keys().next().value);return entry.promise;
}
export function countryList(){return cachedDirectory('countries',async()=>JSON.parse(await boundedText(await fetch(ROOT+'api/countries.json',{credentials:'omit',signal:AbortSignal.timeout(10000)}),512000)).filter(c=>/^[A-Z]{2}$/.test(c.code)&&typeof c.name==='string').sort((a,b)=>a.name.localeCompare(b.name)),86400000);}
export function languageList(){return cachedDirectory('languages',async()=>JSON.parse(await boundedText(await fetch(ROOT+'api/languages.json',{credentials:'omit',signal:AbortSignal.timeout(10000)}),512000)).filter(c=>/^[a-z]{3}$/.test(c.code)&&typeof c.name==='string').sort((a,b)=>a.name.localeCompare(b.name)),86400000);}
export function channelPlaylist(kind,code){
 if(!['countries','languages','categories'].includes(kind)||!/^[a-z]{2,20}$/.test(code))return Promise.reject(Error('Invalid channel selection.'));
 return cachedDirectory(kind+':'+code,async()=>parseM3U(await boundedText(await fetch(ROOT+'iptv/'+kind+'/'+code+'.m3u',{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)}))).channels);
}
export function rememberCountry(code){if(code!==''&&!/^[a-z]{2}$/.test(code||''))return;try{storage()?.setItem('xparty.iptv.country',code);}catch{}window.dispatchEvent(new CustomEvent('xparty:country',{detail:code}));}
export function defaultCountry(){
 let manual;try{manual=storage()?.getItem('xparty.iptv.country');}catch{}if(manual===''||/^[a-z]{2}$/.test(manual||''))return Promise.resolve({code:manual,source:'chosen'});
 return cachedDirectory('ip-country',async()=>{
  try{
   const old=JSON.parse(storage()?.getItem('xparty.iptv.auto-country')||'null');if(old?.until>Date.now()&&/^[a-z]{2}$/.test(old.code))return {code:old.code,source:'automatic'};
   const result=JSON.parse(await boundedText(await fetch('https://api.country.is/',{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(3500)}),8192));
   if(!/^[A-Z]{2}$/.test(result.country||''))throw Error('No country');const code=result.country.toLowerCase();
   try{storage()?.setItem('xparty.iptv.auto-country',JSON.stringify({code,until:Date.now()+86400000}));}catch{}
   return {code,source:'automatic'};
  }catch{return {code:'',source:'worldwide'};}
 },86400000);
}
export function languageMatches(channel,languageChannels){
 if(!languageChannels)return true;
 return languageChannels.urls.has(channel.url)||!!channel.id&&languageChannels.ids.has(channel.id);
}
export function channelMatches(channel,{query='',category='All',language=null}={}){
 if(!((channel.title||'')+' '+(channel.group||'')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))return false;
 if(!languageMatches(channel,language))return false;
 if(category==='All'||category==='Saved')return true;if(category==='Radio')return !!channel.radio;
 const groups=(channel.group||'').toLowerCase().split(/[;,/]/).map(x=>x.trim());
 return groups.includes(category.toLowerCase())||category==='Entertainment'&&(!groups[0]||groups.some(g=>['general','entertainment'].includes(g)));
}
