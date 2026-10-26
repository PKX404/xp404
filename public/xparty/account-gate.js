export const protectedAccountRoutes=new Set(['profile','friends','messages']);
export function accountRoute(hash){const value=String(hash||'').replace(/^#\/?/,'');return protectedAccountRoutes.has(value)?value:null;}
export function createAccountGate({verify,onChange}){
 let revision=0,state={status:'loading',user:null},pending=null;
 function publish(next){state=next;onChange?.(state);}
 return {
  get state(){return state;},get pending(){return pending;},
  request(route){if(!protectedAccountRoutes.has(route))return false;pending=route;return state.status==='authenticated';},
  takePending(){if(state.status!=='authenticated')return null;const route=pending;pending=null;return route;},
  dismiss(){pending=null;},
  async setSession(session){const current=++revision;if(!session?.access_token){publish({status:'anonymous',user:null});return;}publish({status:'loading',user:null});try{const user=await verify(session.access_token);if(!user?.id||session.user?.id&&user.id!==session.user.id){const error=new Error('Sign in again to verify your account.');error.status=401;throw error;}if(current===revision)publish({status:'authenticated',user});}catch(e){if(current===revision)publish({status:e.status===401?'anonymous':'error',user:null,message:e.message});}},
  clear(){revision++;pending=null;publish({status:'anonymous',user:null});}
 };
}
