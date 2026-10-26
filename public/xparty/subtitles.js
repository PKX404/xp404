export function captionTime(value){
 const m=String(value).match(/^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{1,3})$/);
 if(!m||Number(m[2])>59||Number(m[3])>59)return null;
 return (Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3]))*1000+Number(m[4].padEnd(3,'0'));
}
const stamp=ms=>{const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');};
export function toWebVTT(input){
 const source=String(input).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');if(source.length>1024*1024)throw new Error('Choose subtitles smaller than 1 MB.');
 const cues=[];let skipped=0;
 for(const block of source.split(/\n[ \t]*\n/)){
  const lines=block.trim().split('\n');if(!block.trim()||/^(WEBVTT|NOTE(?:\s|$)|STYLE$|REGION$)/.test(lines[0]))continue;
  const i=lines.findIndex(line=>line.includes('-->'));if(i<0){skipped++;continue;}
  const match=lines[i].match(/^\s*(\S+)\s+-->\s+(\S+)(?:\s.*)?$/),start=match&&captionTime(match[1]),end=match&&captionTime(match[2]);
  const text=lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim();
  if(start===null||end===null||!match||end<=start||!text){skipped++;continue;}
  cues.push(stamp(start)+' --> '+stamp(end)+'\n'+text);if(cues.length>10000)throw new Error('This subtitle file has too many cues.');
 }
 if(!cues.length)throw new Error('No valid SRT or WebVTT captions were found.');
 return {text:'WEBVTT\n\n'+cues.join('\n\n')+'\n',cueCount:cues.length,skipped};
}
export function initSubtitles({getContext,onLoaded,notify}){
 const button=document.createElement('button');button.id='load-subtitles';button.type='button';button.className='quiet';button.textContent='Add subtitles';button.title='Load SRT or VTT captions on this device';document.getElementById('captions-toggle').after(button);
 const input=document.createElement('input');input.type='file';input.accept='.srt,.vtt,text/vtt';input.hidden=true;document.body.append(input);let track=null,url=null,key=null;
 function clear(){track?.remove();track=null;if(url)URL.revokeObjectURL(url);url=null;}
 function update(){const source=getContext()?.room?.source;button.hidden=source?.type!=='file';if(key!==source?.id){key=source?.id;clear();}}
 button.onclick=()=>input.click();input.onchange=async()=>{const file=input.files?.[0];input.value='';if(!file)return;const c=getContext(),id=c?.room?.source?.id;if(c?.room?.source?.type!=='file')return;if(file.size>1024*1024)return notify('Choose subtitles smaller than 1 MB.');
  try{const parsed=toWebVTT(await file.text());if(getContext()?.room?.source?.id!==id)return;clear();track=document.createElement('track');track.kind='subtitles';track.label=file.name;track.srclang='und';url=URL.createObjectURL(new Blob([parsed.text],{type:'text/vtt'}));track.src=url;track.default=true;track.onload=()=>{if(track){track.track.mode='showing';onLoaded();}};c.video.append(track);notify('Loaded '+parsed.cueCount+' subtitle cues on this device.'+(parsed.skipped?' Some invalid cues were skipped.':''));}
  catch(error){notify(error.message);}
 };
 update();return {update,destroy(){clear();button.remove();input.remove();}};
}
