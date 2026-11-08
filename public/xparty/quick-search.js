import {channelPlaylist,defaultCountry,channelMatches} from './channel-directory.js';
export async function quickChannels(query){
 const {code}=await defaultCountry();
 const channels=await channelPlaylist(code?'countries':'categories',code||'general');
 return channels.filter(c=>channelMatches(c,{query})).slice(0,8);
}
