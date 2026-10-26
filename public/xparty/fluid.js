const HOME=[[.22,.10,.66],[.73,.13,.42],[.04,.55,.60]];
const ROOM=[[.20,.14,.43],[.36,.12,.40],[.05,.31,.40]];

// Original, low-resolution procedural light field. No capture, cookies or network.
export function initFluidBackground(){
 const layer=document.createElement('div');layer.className='site-fluid-layer';layer.setAttribute('aria-hidden','true');
 const canvas=document.createElement('canvas');canvas.className='site-fluid-canvas';canvas.hidden=true;layer.append(canvas);document.body.prepend(layer);
 const motion=matchMedia('(prefers-reduced-motion: reduce)');let mode=null,palette=HOME,lastColors,frame=null,time=0,last=0,lastDraw=0,destroyed=false,suspended=false,lost=false,pipeline=null;
 let gl;try{gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,desynchronized:true});}catch{}
 function build(){
  if(!gl?.createShader)return null;
  const shaders=[];let program,buffer;
  const release=()=>{for(const shader of shaders)gl.deleteShader(shader);if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);};
  try{
   function compile(type,source){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Fluid shader unavailable');return shader;}
   program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}'));
   gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`precision mediump float;
    uniform vec2 resolution;uniform float clock;uniform vec3 first;uniform vec3 second;uniform vec3 third;
    void main(){
     vec2 p=(gl_FragCoord.xy-.5*resolution)/min(resolution.x,resolution.y);float t=clock*.17;
     vec2 q=p;
     for(int i=0;i<3;i++){float f=float(i)+1.;q+=.17*vec2(sin(q.y*1.7+t*.7+f*1.3),cos(q.x*1.5-t*.6+f*1.7));}
     vec2 a=q-vec2(-.55+.3*sin(t*.6),.25+.32*cos(t*.7));
     vec2 b=q-vec2(.55+.35*cos(t*.5),-.35+.27*sin(t*.8));
     vec2 c=q-vec2(.12+.48*sin(t*.4),.62+.18*cos(t*.6));
     float wa=exp(-1.2*dot(a,a)),wb=exp(-1.35*dot(b,b)),wc=exp(-1.7*dot(c,c));
     float fold=.5+.5*sin(q.x*2.4+q.y*1.8+.7*sin(q.y*2.3-t)+t*.5);
     vec3 light=(first*wa+second*wb+third*wc)/(wa+wb+wc+.22);
     light*=.56+.36*fold;
     light+=.035*pow(fold,7.)*(first+third);
     light*=1.-.20*smoothstep(.2,1.5,length(p));
     gl_FragColor=vec4(light,1.);
    }`));
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Fluid shader unavailable');gl.useProgram(program);
   buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   const attribute=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
   const uniforms=Object.fromEntries(['resolution','clock','first','second','third'].map(name=>[name,gl.getUniformLocation(program,name)]));
   return {release,draw(){gl.useProgram(program);gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform1f(uniforms.clock,time);['first','second','third'].forEach((name,i)=>gl.uniform3fv(uniforms[name],palette[i]));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);canvas.hidden=false;layer.dataset.time=time.toFixed(3);}};
  }catch{release();return null;}
 }
 function visible(){return !destroyed&&!suspended&&!document.hidden&&mode!=='covered';}
 function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;last=0;}
 function draw(){if(pipeline&&!lost){pipeline.draw();layer.dataset.renderer='webgl';}else{canvas.hidden=true;layer.dataset.renderer='css';}}
 function loop(now){frame=null;if(!visible()||motion.matches||!pipeline||lost)return;if(now-lastDraw>=32){time+=last?Math.min(.1,(now-last)/1000):0;last=now;lastDraw=now;draw();}frame=requestAnimationFrame(loop);}
 function update(){
  layer.dataset.mode=mode;layer.hidden=mode==='covered';layer.classList.toggle('fluid-paused',!visible()||motion.matches);
  if(!visible()||motion.matches||!pipeline||lost){stop();if(visible())draw();return;}
  if(frame===null){draw();frame=requestAnimationFrame(loop);}
 }
 function resize(){const scale=Math.min(1,480/Math.max(innerWidth,innerHeight));canvas.width=Math.max(1,Math.round(innerWidth*scale));canvas.height=Math.max(1,Math.round(innerHeight*scale));if(visible())draw();}
 function setMode(next,colors){
  if(next===mode&&(next==='covered'||next==='home'||colors===lastColors))return;
  lastColors=colors;
  const nextPalette=next==='home'?HOME:colors?.length===3?colors.map(rgb=>rgb.map(v=>Math.max(0,Math.min(1,v/255)))):ROOM;
  const changed=mode!==next||JSON.stringify(nextPalette)!==JSON.stringify(palette);mode=next;palette=nextPalette;
  palette.forEach((rgb,i)=>layer.style.setProperty('--fluid-'+i,'rgb('+rgb.map(v=>Math.round(v*255)).join(' ')+')'));
  if(changed){last=0;if(visible())draw();}update();
 }
 const pagehide=()=>{suspended=true;update();},pageshow=()=>{suspended=false;update();};
 const contextLost=event=>{event.preventDefault();lost=true;update();};const contextRestored=()=>{if(destroyed)return;pipeline=build();lost=!pipeline;resize();update();};
 canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
 document.addEventListener('visibilitychange',update);window.addEventListener('resize',resize);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);motion.addEventListener('change',update);
 pipeline=build();resize();setMode('home');
 return {setMode,destroy(){if(destroyed)return;destroyed=true;stop();if(!lost)pipeline?.release();document.removeEventListener('visibilitychange',update);window.removeEventListener('resize',resize);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);motion.removeEventListener('change',update);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);layer.remove();}};
}
