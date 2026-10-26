// Account credentials and guest-room resume credentials have separate authorities.
export function createAccountAuth({url,publicKey,fetcher=fetch}){
 let origin=null;try{const parsed=new URL(url);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&parsed.pathname==='/')origin=parsed.origin;}catch{}
 const enabled=!!(origin&&publicKey);
 async function verify(header){
  const match=typeof header==='string'&&header.match(/^Bearer ([A-Za-z0-9._~-]{16,8192})$/);
  if(!enabled)return {status:503,error:'Account sign-in is not configured on this server.'};
  if(!match)return {status:401,error:'Sign in to access your account.'};
  try{
   const response=await fetcher(origin+'/auth/v1/user',{method:'GET',headers:{apikey:publicKey,Authorization:'Bearer '+match[1]},signal:AbortSignal.timeout(7000),redirect:'error'});
   if([401,403].includes(response.status))return {status:401,error:'Your sign-in expired. Sign in again.'};
   if(!response.ok)return {status:503,error:'Account verification is unavailable. Try again shortly.'};
   const user=await response.json();
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id||'')||user.role!=='authenticated'||user.is_anonymous===true)return {status:401,error:'A signed-in account is required.'};
   return {status:200,user:{id:user.id,emailVerified:!!user.email_confirmed_at,providers:Array.isArray(user.app_metadata?.providers)?user.app_metadata.providers.filter(p=>typeof p==='string'):[]}};
  }catch{return {status:503,error:'Account verification is unavailable. Try again shortly.'};}
 }
 return {enabled,verify};
}
