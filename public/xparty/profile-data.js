const text=(v,n)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,'').trim().slice(0,n):'';
export function profileData(value={}){
 const tags=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,30)).filter(Boolean))].slice(0,8);
 return {bio:text(value.bio,240),interests:tags(value.interests),likes:tags(value.likes),dislikes:tags(value.dislikes),photo:typeof value.photo==='string'&&value.photo.length<=40000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.photo)?value.photo:null};
}
export function commonInterests(a,b){return (a?.interests||[]).filter(x=>(b?.interests||[]).some(y=>y.toLowerCase()===x.toLowerCase()));}
