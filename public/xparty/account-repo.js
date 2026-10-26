import {profileData} from './profile-data.js';

const PROFILE='id,display_name,photo_data,bio,interests,likes,dislikes';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function accountId(value){if(typeof value!=='string'||!UUID.test(value))throw Error('Paste a complete profile ID.');return value.toLowerCase();}
export function profileWrite(value){
 const display_name=String(value.display_name||'').trim();
 if(!display_name||Array.from(display_name).length>24)throw Error('Use a display name between 1 and 24 characters.');
 const photo=value.photo_data===undefined?value.photo:value.photo_data;
 if(photo!=null&&(typeof photo!=='string'||photo.length>=100000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)))throw Error('Choose a valid JPEG profile photo smaller than 100 KB.');
 const data=profileData(value);
 return {display_name,photo_data:photo||null,bio:data.bio,interests:data.interests,likes:data.likes,dislikes:data.dislikes};
}
export function messageBody(value){const body=String(value||'').trim();if(!body||Array.from(body).length>1500)throw Error('Write a message between 1 and 1500 characters.');return body;}

// The browser carries only the user's Supabase session. Every operation also runs
// through the installed database grants and RLS; this class never uses an admin key.
export function createAccountRepo(client,getIdentity){
 function identity(){const user=getIdentity();if(!user?.id)throw Error('Sign in to continue.');return {...user,id:accountId(user.id)};}
 function current(user){const next=getIdentity();if(next?.id!==user.id||next?.revision!==user.revision){const error=Error('Your account changed. Reopen this page.');error.code='ACCOUNT_CHANGED';throw error;}}
 async function result(query,user){const response=await query;current(user);if(response.error)throw response.error;return response.data;}
 function other(value,user){const id=accountId(value);if(id===user.id)throw Error('Choose another person.');return id;}
 return {
  async profile(){const user=identity();return result(client.from('xparty_profiles').select(PROFILE).eq('id',user.id).maybeSingle(),user);},
  async ensureProfile(name){
   const user=identity();let profile=await result(client.from('xparty_profiles').select(PROFILE).eq('id',user.id).maybeSingle(),user);if(profile)return profile;
   const response=await client.from('xparty_profiles').insert({id:user.id,...profileWrite({display_name:name})}).select(PROFILE).single();current(user);
   if(response.error?.code==='23505')return result(client.from('xparty_profiles').select(PROFILE).eq('id',user.id).single(),user);
   if(response.error)throw response.error;return response.data;
  },
  async saveProfile(value){const user=identity();return result(client.from('xparty_profiles').update(profileWrite(value)).eq('id',user.id).select(PROFILE).single(),user);},
  async privateProfile(){const user=identity();return result(client.from('xparty_private_profiles').select('age').eq('id',user.id).maybeSingle(),user);},
  async saveAge(age){const user=identity();if(age!==null&&(!Number.isInteger(age)||age<18||age>120))throw Error('Age must be between 18 and 120, or leave it blank.');return result(client.from('xparty_private_profiles').upsert({id:user.id,age}).select('age').single(),user);},
  async friends(){const user=identity();const rows=await result(client.from('xparty_friends').select('id,requester,addressee,status,created_at').or('requester.eq.'+user.id+',addressee.eq.'+user.id).order('created_at',{ascending:false}),user);const ids=rows.map(r=>r.requester===user.id?r.addressee:r.requester);const profiles=ids.length?await result(client.from('xparty_profiles').select(PROFILE).in('id',ids),user):[];return rows.map(row=>({...row,profile:profiles.find(p=>p.id===(row.requester===user.id?row.addressee:row.requester))}));},
  async requestFriend(value){const user=identity(),id=other(value,user);try{return await result(client.from('xparty_friends').insert({requester:user.id,addressee:id,status:'pending'}).select('id').single(),user);}catch(e){if(e.code==='23505')throw Error('A connection already exists. Check your incoming and outgoing requests.');if(e.code==='23503')throw Error('That profile is not available. Check the friend ID.');throw e;}},
  async answerFriend(id,accept){const user=identity();return result(client.from('xparty_friends').update({status:accept?'accepted':'declined'}).eq('id',accountId(id)).eq('addressee',user.id).eq('status','pending').select('id,status').single(),user);},
  async removeFriend(id){const user=identity();const rows=await result(client.from('xparty_friends').delete().eq('id',accountId(id)).select('id'),user);if(!rows?.length)throw Error('This connection has already changed. Refresh your friends.');},
  async mutualFriends(id){const user=identity();return result(client.rpc('xparty_mutual_friends',{target:other(id,user)}),user);},
  async messages(id){const user=identity(),recipient=other(id,user);const rows=await result(client.from('xparty_messages').select('id,sender,recipient,body,created_at').or(`and(sender.eq.${user.id},recipient.eq.${recipient}),and(sender.eq.${recipient},recipient.eq.${user.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(80),user);return rows.reverse();},
  async sendMessage(id,value){const user=identity(),recipient=other(id,user),body=messageBody(value);return result(client.from('xparty_messages').insert({sender:user.id,recipient,body}).select('id,sender,recipient,body,created_at').single(),user);}
 };
}
