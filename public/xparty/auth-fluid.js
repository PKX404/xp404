/* Xparty login-only fluid. Does NOT alter the room video, renderer or app fluid.
 * Self-contained WebGL ambient light shader adapted from Xparty's own low-resolution
 * procedural backdrop principles; no media capture, external images or tracking.
 */
(function () {
 'use strict';
 const dialog=document.getElementById('account-dialog');
 if(!dialog)return;
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
 const canvas=document.createElement('canvas');canvas.className='auth-fluid-canvas';
 canvas.setAttribute('aria-hidden','true');dialog.insertBefore(canvas,dialog.firstChild);
 let gl,shader,program,buffer,locations,frame=0,drawn=0,clock=0,previous=0,failed=false,active=false,sizeDirty=true;
 const vert='attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
 const frag=`precision mediump float;
 uniform vec2 r;uniform float t;
 float warp(vec2 p){return sin(p.x*2.5+sin(p.y*2.3+t*.35))*cos(p.y*2.1-cos(p.x*1.9-t*.38));}
 void main(){
  vec2 uv=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);
  float time=t*.53;
  vec2 v=uv;
  v+=.21*vec2(sin(v.y*2.8+time*.9),cos(v.x*2.5-time*.8));
  v+=.16*vec2(sin(v.y*3.5-time*.62+sin(v.x*2.)),cos(v.x*3.2+time*.63));
  v+=.13*vec2(cos(v.y*4.3+time*1.1),sin(v.x*3.9-time*.8));
  vec2 p1=v-vec2(-.63+.39*sin(time*.79),.54+.32*cos(time*.59));
  vec2 p2=v-vec2(.68+.45*cos(time*.48),-.17+.34*sin(time*.72));
  vec2 p3=v-vec2(-.32+.38*sin(time*.43),-.72+.28*cos(time*.65));
  vec2 p4=v-vec2(.34+.36*cos(time*.69),.82+.22*sin(time*.77));
  float w1=exp(-1.40*dot(p1,p1));float w2=exp(-1.28*dot(p2,p2));
  float w3=exp(-1.75*dot(p3,p3));float w4=exp(-1.85*dot(p4,p4));
  float wave=.5+.5*warp(v+sin(time)*.06);
  vec3 navy=vec3(.037,.058,.15);
  vec3 coral=vec3(.77,.28,.35);
  vec3 purple=vec3(.43,.17,.77);
  vec3 ocean=vec3(.045,.36,.67);
  vec3 aqua=vec3(.065,.54,.61);
  vec3 colour=(navy*.48+coral*w1*.91+purple*w2*.95+ocean*w3*.95+aqua*w4*.55)/(.83+.27*w1+.20*w2+.19*w3+.27*w4);
  colour+=.09*wave*(ocean+purple);
  colour=mix(colour,colour.bgr,.10+.08*sin(time*.45));
  colour=mix(colour,navy,.15*smoothstep(.4,1.6,length(uv)));
  float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  gl_FragColor=vec4(colour+(grain-.5)/255.,1.);
 }`;
 function compile(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('shader');return s;}
 function init(){
  if(gl||failed)return !!gl;
  try{
   gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
   if(!gl)throw Error('webgl');
   const vs=compile(gl.VERTEX_SHADER,vert),fs=compile(gl.FRAGMENT_SHADER,frag);
   program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('link');
   gl.deleteShader(vs);gl.deleteShader(fs);
   buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   gl.useProgram(program);
   const a=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
   locations={r:gl.getUniformLocation(program,'r'),t:gl.getUniformLocation(program,'t')};
   return true;
  }catch(_){failed=true;gl=null;canvas.hidden=true;return false;}
 }
 function resize(){
  const rect=dialog.getBoundingClientRect();
  const w=rect.width||innerWidth,h=rect.height||innerHeight;
  const scale=Math.min(.75,512/Math.max(w,h));
  const x=Math.max(1,Math.round(w*scale)),y=Math.max(1,Math.round(h*scale));
  if(canvas.width!==x||canvas.height!==y){canvas.width=x;canvas.height=y;}
 }
 function draw(){if(!gl)return;if(!dialog.classList.contains('auth-fluid-ready'))dialog.classList.add('auth-fluid-ready');if(sizeDirty){resize();sizeDirty=false;}gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.uniform2f(locations.r,canvas.width,canvas.height);gl.uniform1f(locations.t,clock);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
 function tick(now){
  frame=0;
  if(!active||document.hidden||reduce.matches)return;
  if(!previous)previous=now;
  if(now-drawn>=40){clock+=Math.min(.085,(now-previous)/1000);previous=now;drawn=now;draw();}
  frame=requestAnimationFrame(tick);
 }
 function halt(){if(frame)cancelAnimationFrame(frame);frame=0;previous=0;}
 function update(){
  active=dialog.open&&dialog.classList.contains('auth-landing');
  const paused=!active||document.hidden||reduce.matches;if(dialog.classList.contains('auth-fluid-paused')!==paused)dialog.classList.toggle('auth-fluid-paused',paused);
  if(!active){halt();return;}
  if(!init())return;
  draw();if(reduce.matches||document.hidden){halt();return;}
  if(!frame)frame=requestAnimationFrame(tick);
 }
 const observer=new MutationObserver(update);
 observer.observe(dialog,{attributes:true,attributeFilter:['class','open']});
 document.addEventListener('visibilitychange',update);
 const resizeObserver=new ResizeObserver(()=>{sizeDirty=true;if(active)draw();});resizeObserver.observe(dialog);
 window.addEventListener('resize',()=>{sizeDirty=true;if(active)draw();},{passive:true});
 reduce.addEventListener?.('change',update);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();halt();dialog.classList.remove('auth-fluid-ready');gl=null;failed=true;});
 canvas.addEventListener('webglcontextrestored',()=>{failed=false;gl=null;sizeDirty=true;canvas.hidden=false;update();});
 // The CSS fallback remains visible if WebGL is unavailable.
 update();
})();
