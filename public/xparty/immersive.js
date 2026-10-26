// Independent two-pass Gaussian renderer. Pairing adjacent kernel samples takes
// advantage of hardware interpolation: 13 texture reads per pass instead of 25.
export function createImmersiveRenderer(host,{onContextChange=()=>{}}={}){
 const width=256,height=144,canvas=document.createElement('canvas');canvas.className='immersive-frame';canvas.hidden=true;canvas.width=width;canvas.height=height;canvas.setAttribute('aria-hidden','true');
 // A decoded frame still fills the room on devices without a usable WebGL context.
 // Canvas drawing needs no pixel readback, so this also handles origin-tainted media.
 let fallback=null,fallbackContext=null;
 function fallbackRenderer(){if(!fallback){fallback=document.createElement('canvas');fallback.className='immersive-frame immersive-frame-cpu';fallback.width=20;fallback.height=12;fallback.hidden=true;fallback.setAttribute('aria-hidden','true');fallbackContext=fallback.getContext('2d',{alpha:false,desynchronized:true});host.append(fallback);}return {get available(){return !!fallbackContext;},render(media,crop){if(!fallbackContext)return false;try{if(crop)fallbackContext.drawImage(media,crop.x,crop.y,crop.width,crop.height,0,0,20,12);else fallbackContext.drawImage(media,0,0,20,12);canvas.hidden=true;fallback.hidden=false;return true;}catch{return false;}},clear(){fallback.hidden=true;fallback.width=20;},destroy(){fallback.remove();}};}
 let gl;try{gl=canvas.getContext('webgl',{alpha:false,depth:false,antialias:false,desynchronized:true,preserveDrawingBuffer:false});if(!gl?.createShader)return fallbackRenderer();}catch{return fallbackRenderer();}
 const input=document.createElement('canvas');input.width=width;input.height=height;const ctx=input.getContext('2d',{alpha:false,desynchronized:true});if(!ctx)return fallbackRenderer();
 let lost=false,destroyed=false,canvasOnly=false,pipeline=null;
 function build(){
  const shaders=[],textures=[],buffers=[],programs=[],framebuffers=[];
  const release=()=>{for(const x of textures)gl.deleteTexture(x);for(const x of buffers)gl.deleteBuffer(x);for(const x of shaders)gl.deleteShader(x);for(const x of programs)gl.deleteProgram(x);for(const x of framebuffers)gl.deleteFramebuffer(x);};
  try{
   const compile=(type,source)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Shader unavailable');return s;};
   const kernel=Array.from({length:13},(_,i)=>Math.exp(-.5*i*i/64)),total=kernel[0]+2*kernel.slice(1).reduce((a,b)=>a+b,0);let samples=`vec3 color=texture2D(frame,uv).rgb*${(kernel[0]/total).toFixed(9)};`;
   for(let i=1;i<13;i+=2){const weight=kernel[i]+kernel[i+1],offset=(i*kernel[i]+(i+1)*kernel[i+1])/weight;samples+=`color+=(texture2D(frame,clamp(uv+direction*${offset.toFixed(7)},vec2(0.),vec2(1.))).rgb+texture2D(frame,clamp(uv-direction*${offset.toFixed(7)},vec2(0.),vec2(1.))).rgb)*${(weight/total).toFixed(9)};`;}
   const p=gl.createProgram();programs.push(p);gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'));
   gl.attachShader(p,compile(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 uv;uniform sampler2D frame;uniform vec2 direction;uniform float grade;void main(){${samples}
    if(grade>.5){float luma=dot(color,vec3(.213,.715,.072));color=mix(vec3(luma),color,1.5);float light=dot(color,vec3(.213,.715,.072));color*=min(1.,.75/max(light,.0001));}gl_FragColor=vec4(color,1.);}`));
   gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Shader unavailable');gl.useProgram(p);
   const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
   const texture=()=>{const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);for(const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,filter,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);return t;};
   const source=texture(),intermediate=texture(),fbo=gl.createFramebuffer();framebuffers.push(fbo);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,intermediate,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Framebuffer unavailable');
   const direction=gl.getUniformLocation(p,'direction'),grade=gl.getUniformLocation(p,'grade');gl.uniform1i(gl.getUniformLocation(p,'frame'),0);gl.viewport(0,0,width,height);
   return {release,draw(){gl.useProgram(p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,input);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.uniform2f(direction,1/width,0);gl.uniform1f(grade,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,intermediate);gl.uniform2f(direction,0,1/height);gl.uniform1f(grade,1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}};
  }catch{release();return null;}
 }
 pipeline=build();if(!pipeline)return fallbackRenderer();host.append(canvas);
 const onLost=event=>{event.preventDefault();lost=true;canvas.hidden=true;onContextChange(false);};const onRestored=()=>{if(destroyed)return;pipeline=build();lost=!pipeline;onContextChange(!lost);};canvas.addEventListener('webglcontextlost',onLost);canvas.addEventListener('webglcontextrestored',onRestored);
 return {
  get available(){return !!pipeline&&!lost&&!destroyed;},
  render(media,crop){if(destroyed)return false;if(canvasOnly||lost||!pipeline)return fallbackRenderer().render(media,crop);try{if(crop)ctx.drawImage(media,crop.x,crop.y,crop.width,crop.height,0,0,width,height);else ctx.drawImage(media,0,0,width,height);pipeline.draw();if(fallback)fallback.hidden=true;canvas.hidden=false;return true;}catch{canvasOnly=true;canvas.hidden=true;return fallbackRenderer().render(media,crop);}},
  clear(){canvas.hidden=true;canvasOnly=false;input.width=width;if(fallback){fallback.hidden=true;fallback.width=20;}},
  destroy(){if(destroyed)return;destroyed=true;if(!lost)pipeline?.release();canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);canvas.remove();fallback?.remove();}
 };
}
