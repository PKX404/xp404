// Keep one authorized track for a call. Mute is synchronous and sends silence;
// leaving the call, host moderation and page teardown release the device.
export function createMicrophone({getStream,isAllowed,onChange=()=>{},onError=()=>{},capture=constraints=>navigator.mediaDevices.getUserMedia(constraints),constraints=()=>({})}){
 let desired=false,pending=null,generation=0;
 const live=()=>getStream().getAudioTracks().find(track=>track.readyState==='live');
 const emit=tracksChanged=>onChange({enabled:!!live()?.enabled,pending:!!pending,desired,tracksChanged});
 async function toggle(){
  if(!isAllowed())return;
  const track=live();
  if(track){desired=!track.enabled;track.enabled=desired;emit(false);return;}
  desired=!desired;
  if(pending||!desired){emit(false);return;}
  const revision=generation;
  const job=(async()=>{
   let stream;
   try{
    try{stream=await capture({audio:true,video:false});}
    catch(error){if(error.name!=='NotReadableError'||revision!==generation||!desired)throw error;await new Promise(r=>setTimeout(r,200));if(revision!==generation||!desired||!isAllowed())return;stream=await capture({audio:{echoCancellation:{ideal:true}},video:false});}
    const audio=stream.getAudioTracks()[0];
    if(!audio)throw new DOMException('No microphone track','NotFoundError');
    if(revision!==generation||!desired||!isAllowed()){stream.getTracks().forEach(t=>t.stop());return;}
    audio.enabled=true;getStream().addTrack(audio);
    audio.onended=()=>{getStream().removeTrack(audio);desired=false;emit(true);};
    audio.applyConstraints?.(constraints())?.catch(()=>{});
    emit(true);
   }catch(error){stream?.getTracks().forEach(t=>t.stop());if(revision===generation&&desired){desired=false;onError(error);}}
  })();
  pending=job;emit(false);
  try{await job;}finally{if(pending===job){pending=null;emit(false);}}
 }
 function release(){const track=live();if(!track&&!pending&&!desired)return;generation++;desired=false;pending=null;if(track){track.enabled=false;track.onended=null;track.stop();getStream().removeTrack(track);}emit(true);}
 return {toggle,release,get pending(){return !!pending;},get enabled(){return !!live()?.enabled;}};
}
