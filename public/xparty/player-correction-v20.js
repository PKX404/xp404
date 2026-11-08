/* Controls: keep the Test17 original order exactly, moving existing live controls only. */
(()=>{'use strict';
 let done=false,tries=0;
 function position(){
  const family=document.querySelector('#player-shell .playback-row .xparty-player-tool-family');
  if(!family)return false;
  const buttons=['video-like','xparty-scale-cycle','playback-more'].map(id=>document.getElementById(id));
  const volume=document.querySelector('.xparty-volume-toggle');
  if(buttons.some(x=>!x)||!volume)return false;
  // Original Test 17 order: Heart -> Scaling -> Settings -> Speaker.
  const order=[...buttons,volume];
  if(order.some((button,i)=>family.children[i]!==button)){
   for(const button of order)family.appendChild(button);
  }
  done=true;
  return true;
 }
 function ready(){if(position()){setTimeout(position,600);setTimeout(position,1800);return;}
  if(++tries<=100)setTimeout(ready,75);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&done)position();});
})();
