/* Android 12/13 IME workaround. Use actual visible viewport rather than trusting
   adjustResize alone: some OEM WebViews report the inset but do not resize. */
(()=>{
 const root=document.documentElement,body=document.body;
 let last=0,raf=0,focused=false,expandedHeight=innerHeight;
 const form=()=>document.getElementById('chat-form');
 const chat=()=>document.getElementById('room-chat-panel');
 const viewportBottom=()=>{const v=window.visualViewport;return v?v.offsetTop+v.height:innerHeight;};
 function update(){raf=0;
  if(!body.classList.contains('in-room')){root.style.setProperty('--chat-ime-offset','0px');return;}
  const panel=chat(),input=document.getElementById('message-input'),bar=form();if(!panel||!bar)return;
  const vpBottom=Math.min(innerHeight,viewportBottom());
  const nativeInset=Math.max(0,Number(window.XPARTY_NATIVE_IME)||0);
  if(!focused&&nativeInset<75)expandedHeight=Math.max(expandedHeight,innerHeight);
  // With adjustResize the WebView height *already excludes the keyboard*.
  // Never subtract nativeInset a second time in that situation.
  const alreadyResized=expandedHeight-innerHeight>90;
  const keyboardLikely=nativeInset>85||innerHeight-vpBottom>85||(focused&&alreadyResized);
  const targetBottom=alreadyResized?vpBottom:(nativeInset>85?Math.min(vpBottom,innerHeight-nativeInset):vpBottom);
  // The composer is fixed relative to the visible viewport while typing.
  // adjustResize: visible viewport is already shortened => bottom 0.
  // adjustNothing: bottom equals actual IME obstruction.
  const floatingBottom=keyboardLikely&&!alreadyResized?Math.max(0,Math.round(innerHeight-targetBottom)):0;
  root.style.setProperty('--xparty-ime-bottom',floatingBottom+'px');
  if(last!==0){last=0;root.style.setProperty('--chat-ime-offset','0px');}
  body.classList.toggle('room-keyboard-open',keyboardLikely);

 }
 const schedule=()=>{if(!raf)raf=requestAnimationFrame(update)};
 document.addEventListener('focusin',e=>{if(e.target?.id==='message-input'){focused=true;schedule();setTimeout(schedule,100);setTimeout(schedule,320);}});
 document.addEventListener('focusout',e=>{if(e.target?.id==='message-input'){focused=false;setTimeout(schedule,100);setTimeout(schedule,250);}});
 window.addEventListener('xparty:native-insets',schedule);
 window.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('orientationchange',()=>{expandedHeight=innerHeight;schedule();});
 document.addEventListener('visibilitychange',schedule);
 document.addEventListener('DOMContentLoaded',schedule);schedule();
})();
