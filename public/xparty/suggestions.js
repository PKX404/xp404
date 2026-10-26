// Room-context discovery using the existing authenticated YouTube search route.
// This is an independent ranking rule, not YouTube's private recommendation model.
export function rankSuggestions(items,{currentId,queuedIds=[],recentIds=[]}={}){
 const queued=new Set(queuedIds),recent=new Set(recentIds),seen=new Set();
 return items.filter(item=>/^[\w-]{11}$/.test(item.id||'')&&item.id!==currentId&&!seen.has(item.id)&&seen.add(item.id)).map((item,index)=>({item,score:index+(queued.has(item.id)?100:0)+(recent.has(item.id)?30:0)})).sort((a,b)=>a.score-b.score).slice(0,12).map(({item})=>item);
}
export function initSuggestions({getContext,base,send,notify=()=>{}}){
 const $=id=>document.getElementById(id),sourcePanel=$('source-panel');let provider='youtube',selected='search',lastQuery='',previousRoom=null,previousSource=null,recent=[],generation=0,controller=null,cache=new Map(),loadedKey='';
 const tabs=document.createElement('div');tabs.className='discovery-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','YouTube discovery');
 const search=document.createElement('section');search.id='youtube-search-panel';search.setAttribute('role','tabpanel');search.setAttribute('aria-labelledby','youtube-search-tab');
 const suggested=document.createElement('section');suggested.id='youtube-suggestions-panel';suggested.className='youtube-suggestions';suggested.setAttribute('role','tabpanel');suggested.setAttribute('aria-labelledby','youtube-suggestions-tab');suggested.hidden=true;
 $('youtube-form').before(tabs,search,suggested);search.append($('youtube-form'),$('search-status'),$('search-results'));
 const options=[['search','Search'],['suggestions','Suggestions']];
 for(const [id,label]of options){const button=document.createElement('button');button.type='button';button.id='youtube-'+id+'-tab';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',id==='search'?search.id:suggested.id);button.onclick=()=>select(id);button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=id==='search'?'suggestions':'search';select(e.key==='Home'?'search':e.key==='End'?'suggestions':next);tabs.querySelector('[aria-selected=true]').focus();};tabs.append(button);}
 const heading=document.createElement('div');heading.className='suggestion-heading';const copy=document.createElement('p');copy.className='small';copy.textContent='Find the next watch from this video, your search, or a topic.';
 const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary';refresh.textContent='Refresh';refresh.onclick=()=>load(true);heading.append(copy,refresh);
 const topics=document.createElement('div');topics.className='suggestion-topics';topics.setAttribute('aria-label','Explore a topic');let topic='';
 for(const [label,query]of [['For this room',''],['Music','music live performances'],['Comedy','comedy sketches'],['Gaming','gaming highlights'],['Science','science explained']]){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.setAttribute('aria-pressed',String(!query));b.onclick=()=>{topic=query;for(const x of topics.children)x.setAttribute('aria-pressed',String(x===b));load();};topics.append(b);}
 const status=document.createElement('p');status.className='small';status.setAttribute('role','status');const grid=document.createElement('div');grid.className='suggestion-grid';suggested.append(heading,topics,status,grid);
 function context(){const {room}=getContext();const title=room?.source?.type==='youtube'?room.source.title?.trim():'';return topic||lastQuery||(title&&!/^YouTube video|^[\w-]{11}$/.test(title)?title:'music live performances');}
 function cancel(){generation++;controller?.abort();controller=null;suggested.setAttribute('aria-busy','false');refresh.disabled=false;}
 function select(next){selected=next;const youtube=provider==='youtube';tabs.hidden=!youtube;search.hidden=youtube&&next==='suggestions'||provider==='file'||provider==='iptv';suggested.hidden=!youtube||next!=='suggestions';for(const b of tabs.children){const active=b.id==='youtube-'+next+'-tab';b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}if(!suggested.hidden)load();else cancel();}
 function render(items){
  grid.replaceChildren();const {room,me}=getContext();if(!room)return;
  const ranked=rankSuggestions(items,{currentId:room.source?.videoId,queuedIds:room.queue?.map(x=>x.videoId),recentIds:recent});
  for(const item of ranked){const card=document.createElement('article');card.className='suggestion-card';const image=document.createElement('img');image.src='https://i.ytimg.com/vi/'+item.id+'/mqdefault.jpg';image.alt='';image.loading='lazy';const title=document.createElement('h3');title.textContent=item.title;const meta=document.createElement('p');meta.textContent=[item.channel,item.duration].filter(Boolean).join(' · ');const actions=document.createElement('div');
   if(room.hostId===me||room.mode!=='HOST_ONLY'){const play=document.createElement('button');play.type='button';play.className='primary';play.textContent=room.hostId===me?'Play now':'Request video';play.onclick=()=>{send('source',{source:{type:'youtube',videoId:item.id,title:item.title}});};actions.append(play);}
   const add=document.createElement('button');add.type='button';add.className='secondary';add.textContent=room.queue?.some(x=>x.videoId===item.id)?'Queued':'+ Queue';add.disabled=add.textContent==='Queued';add.onclick=()=>{if(send('queue-add',{videoId:item.id,title:item.title})){add.textContent='Queued';add.disabled=true;notify('Added to the room playlist.');}};actions.append(add);card.append(image,title,meta,actions);grid.append(card);
  }status.textContent=ranked.length?'Suggestions for “'+context()+'”':'No suggestions found. Try a topic or another search.';
 }
 async function load(force=false){
  const c=getContext();if(suggested.hidden)return;if(!c.room||!c.token){status.textContent='Join a room to browse suggestions.';return;}
  const query=context().slice(0,100),key=c.room.code+'|'+query;if(!force&&loadedKey===key&&grid.childElementCount){const saved=cache.get(key);if(saved&&Date.now()-saved.at<300000){render(saved.items);return;}}cancel();const id=generation;controller=new AbortController();status.textContent='Finding your next watch…';suggested.setAttribute('aria-busy','true');refresh.disabled=true;grid.replaceChildren();
  try{let saved=cache.get(key);if(force||!saved||Date.now()-saved.at>300000){const response=await fetch(base+'/api/search?q='+encodeURIComponent(query),{signal:controller.signal,headers:{Authorization:'Bearer '+c.token}});const data=await response.json();if(!response.ok)throw Error(data.error||'Suggestions are unavailable. Try Search.');saved={at:Date.now(),items:data.items||[]};if(cache.size>=12)cache.delete(cache.keys().next().value);cache.set(key,saved);}if(id!==generation||getContext().room?.code!==c.room.code)return;loadedKey=key;render(saved.items);}
  catch(error){if(error.name!=='AbortError'&&id===generation){loadedKey='';status.textContent=error.message;}}
  finally{if(id===generation){suggested.setAttribute('aria-busy','false');refresh.disabled=false;}}
 }
 const choose=e=>{const button=e.target.closest('[data-provider]');if(!button)return;provider=button.dataset.provider;select(provider==='youtube'?selected:'search');};sourcePanel.addEventListener('click',choose);
 $('file-tab').addEventListener('click',()=>{provider='file';select('search');});$('youtube-tab').addEventListener('click',()=>{provider='youtube';select('search');});
 const remember=()=>{const value=$('youtube-input').value.trim();if(value.length>=2&&!/^https?:\/\//i.test(value)&&!/^[\w-]{11}$/.test(value)){lastQuery=value.slice(0,100);loadedKey='';}};$('youtube-form').addEventListener('submit',remember);$('youtube-input').addEventListener('change',remember);
 function update(){const {room}=getContext();if(room?.code!==previousRoom){cancel();cache.clear();grid.replaceChildren();loadedKey='';recent=[];lastQuery='';previousRoom=room?.code;previousSource=null;}const id=room?.source?.videoId;if(id&&id!==previousSource){if(previousSource)recent=[previousSource,...recent.filter(x=>x!==previousSource)].slice(0,20);previousSource=id;loadedKey='';if(!suggested.hidden)load();}if(!room)cancel();}
 select('search');return {update,destroy(){cancel();sourcePanel.removeEventListener('click',choose);tabs.remove();suggested.remove();search.replaceWith(...search.childNodes);}};
}
