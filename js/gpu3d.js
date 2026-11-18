/* Redes Vivas · hardware-accelerated 3D renderer (WebGL2, no dependencies).
 * Original geometry and shaders. Uses the existing simulation nodes, links and
 * packet timestamps; never creates events or replaces the teaching engine.
 * Geometry is cached on the GPU. Camera rotation updates only uniforms.
 */
(() => {
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const COLORS={
    dados:'#55f9ae',dns:'#ffab53',tcp:'#4abfff',udp:'#3ee5f0',cripto:'#ae99ff',
    ataque:'#ff6583',rede:'#ffe17d',bits:'#a5d4ff'
  };
  function rgb(hex){const h=/^#[\da-f]{6}$/i.test(hex)?hex:'#63c9e6';return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);}
  function color(c,f=1){return rgb(c).map(x=>clamp(x*f,0,1));}
  function shader(gl,type,code){
    const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(e);}
    return s;
  }
  function program(gl,vs,fs){
    const p=gl.createProgram();const a=shader(gl,gl.VERTEX_SHADER,vs),b=shader(gl,gl.FRAGMENT_SHADER,fs);
    gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);gl.deleteShader(a);gl.deleteShader(b);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
  }
  const VS=`#version 300 es
    precision highp float;
    in vec3 a_position; in vec3 a_color;
    uniform vec2 u_screen; uniform vec4 u_camera; uniform vec3 u_center;
    out vec3 v_color;
    void main(){
      float x=a_position.x-u_center.x, z=a_position.z-u_center.z;
      float y=a_position.y-u_center.y;
      float co=cos(u_camera.x),si=sin(u_camera.x);
      float rx=x*co-z*si,rz=x*si+z*co;
      float persp=1.0/(1.0+rz*.023), f=u_camera.y*persp;
      float px=u_screen.x*.5+rx*f;
      float py=u_screen.y*u_camera.w+(rz*u_camera.z-y*.91)*f;
      gl_Position=vec4(px/u_screen.x*2.0-1.0,1.0-py/u_screen.y*2.0,clamp(rz*.021,-.96,.96),1.0);
      v_color=a_color;
    }`;
  const FS=`#version 300 es
    precision mediump float;
    in vec3 v_color;out vec4 frag;
    void main(){frag=vec4(v_color,1.0);}`;
  class Mesh {
    constructor(){this.tri=[];this.lines=[];}
    tri3(a,b,c,col){for(const p of [a,b,c])this.tri.push(...p,...col);}
    quad(a,b,c,d,col){this.tri3(a,b,c,col);this.tri3(a,c,d,col);}
    line(a,b,col){this.lines.push(...a,...col,...b,...col);}
    box(x,y,z,w,h,d,tint,mul=1){
      const l=x-w/2,r=x+w/2,near=z+d/2,far=z-d/2,top=y+h;
      const front=color(tint,.68*mul),back=color(tint,.37*mul),side=color(tint,.48*mul),upper=color(tint,.94*mul);
      this.quad([l,y,near],[r,y,near],[r,top,near],[l,top,near],front);
      this.quad([r,y,far],[l,y,far],[l,top,far],[r,top,far],back);
      this.quad([r,y,near],[r,y,far],[r,top,far],[r,top,near],side);
      this.quad([l,y,far],[l,y,near],[l,top,near],[l,top,far],side);
      this.quad([l,top,near],[r,top,near],[r,top,far],[l,top,far],upper);
      this.quad([l,y,far],[r,y,far],[r,y,near],[l,y,near],back);
      const edge=color(tint,1.12);
      this.line([l,top,near],[r,top,near],edge);
      this.line([r,top,near],[r,top,far],edge);
      this.line([l,top,near],[l,top,far],edge);
    }
    disc(x,y,z,r,tint,segments=12){
      const c=color(tint,.35);
      for(let i=0;i<segments;i++){
        const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
        this.tri3([x,y,z],[x+r*Math.cos(a),y,z+r*Math.sin(a)],[x+r*Math.cos(b),y,z+r*Math.sin(b)],c);
      }
    }
    wire(a,b,hex,cut=false){
      const c=color(hex,cut?.46:1),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
      const nx=-dz/len*.026,nz=dx/len*.026,y=.014;
      if(!cut){this.quad([a.x+nx,y,a.z+nz],[b.x+nx,y,b.z+nz],[b.x-nx,y,b.z-nz],[a.x-nx,y,a.z-nz],c);}
      else for(const [from,to] of [[0,.43],[.57,1]]){
        const p={x:a.x+dx*from,z:a.z+dz*from},q={x:a.x+dx*to,z:a.z+dz*to};
        this.quad([p.x+nx,y,p.z+nz],[q.x+nx,y,q.z+nz],[q.x-nx,y,q.z-nz],[p.x-nx,y,p.z-nz],color('#ff758a'));
      }
    }
    equipment(n,p,tint){
      const x=p.x,z=p.z,id=n.tipo,off=!!n.desligado;
      const main=off?'#5f6170':tint;
      // Consistent raised base and glow-colored pedestal. Models use original
      // procedural geometry, not external assets or copied licensed files.
      this.disc(x,-.12,z,.65,main,20);
      this.box(x,-.10,z,1.18,.13,1.1,'#20394f');
      const dark='#17293b',steel='#3f627f',led=off?'#697082':'#55f8c1';
      switch(id){
        case 'servidor': {
          this.box(x,.06,z,.83,1.66,.76,'#354f6e');
          this.box(x,.13,z+.39,.71,1.53,.045,'#0d1a2b');
          for(let i=0;i<6;i++){
            const yy=.22+i*.222;
            this.box(x,yy,z+.418,.62,.155,.026,i%2?'#284963':'#385778');
            this.box(x-.24,yy+.065,z+.442,.06,.035,.018,i%3===0?'#ffa968':led);
            this.box(x+.11,yy+.063,z+.443,.23,.025,.018,'#5a96ad');
          }
          this.box(x,1.73,z,.87,.075,.82,steel);
          for(let i=0;i<4;i++)this.box(x-.25+i*.17,1.76,z+.05,.12,.015,.44,main);
          this.box(x,1.83,z,.16,.025,.17,led);
          break;
        }
        case 'pc': case 'laptop': {
          this.box(x,.11,z,1.32,.11,.97,'#314e68');
          this.box(x,.11,z+.40,1.26,.045,.12,main,.92);
          this.box(x,.22,z-.39,1.23,.90,.12,'#527e9c');
          this.box(x,.29,z-.317,1.08,.72,.018,'#0c344c');
          this.box(x,.46,z-.299,.62,.025,.013,main);
          this.box(x,.57,z-.299,.80,.017,.013,'#3b7695');
          for(let j=0;j<3;j++)for(let i=0;i<8;i++){
            this.box(x-.48+i*.137,.24,z-.01+j*.15,.11,.018,.09,'#486e85');
          }
          break;
        }
        case 'switch':case 'hub':{
          this.box(x,.1,z,1.48,.38,.82,'#244659');
          this.box(x,.20,z+.427,1.36,.19,.025,'#0b1a2c');
          for(let i=0;i<(id==='hub'?6:9);i++){
            const xx=x-.60+i*(id==='hub'?.23:.15);
            this.box(xx,.234,z+.449,.115,.086,.014,'#152d3d');
            this.box(xx,.356,z+.449,.046,.03,.016,i%3===0?'#ffb162':led);
          }
          this.box(x,.492,z,1.40,.06,.77,steel);
          break;
        }
        case 'roteador':{
          this.box(x,.11,z,1.20,.36,.93,'#304d76');
          this.box(x,.478,z,1.12,.055,.87,'#5075a6');
          for(let i=0;i<6;i++)this.box(x-.43+i*.17,.31,z+.488,.07,.045,.02,i%2?led:'#6ebeff');
          for(const sx of [-.44,.44]){
            this.box(x+sx,.49,z-.29,.095,.99,.095,'#709abf');
            this.box(x+sx,1.43,z-.29,.13,.08,.13,main);
          }
          break;
        }
        case 'firewall':{
          this.box(x,.10,z,.78,1.07,.80,'#684459');
          for(let i=0;i<5;i++)this.box(x,.21+i*.185,z+.42,.59,.11,.025,i%2?'#7c4765':'#a05f7a');
          this.box(x,1.19,z,.45,.09,.40,'#fa8297');break;
        }
        case 'ap':case 'controlador':case 'sensor':{
          this.box(x,.10,z,1.02,.50,.82,'#315c68');
          this.box(x,.60,z,.87,.065,.70,steel);
          this.box(x,.67,z,.10,.39,.12,'#4bcdb3');break;
        }
        case 'nuvem':case 'globo':{
          this.box(x,.12,z,.96,.55,.77,'#285e85');
          this.box(x,.68,z,.67,.18,.58,'#53b8e9');break;
        }
        default:{
          this.box(x,.11,z,.80,.83,.63,'#385c77');
          this.box(x,.22,z+.34,.64,.49,.023,main);break;
        }
      }
      if(off)this.box(x,1.65,z,.24,.09,.24,'#ff637a');
    }
  }
  function init(canvas){
    let gl;
    try{gl=canvas.getContext('webgl2',{alpha:true,depth:true,antialias:true,powerPreference:'default',premultipliedAlpha:true,preserveDrawingBuffer:false});
      if(!gl)return null;}catch{return null;}
    let p,buffer,linesBuffer,packetBuffer,attrs,uniforms;
    try{
      p=program(gl,VS,FS);buffer=gl.createBuffer();linesBuffer=gl.createBuffer();packetBuffer=gl.createBuffer();
      attrs={pos:gl.getAttribLocation(p,'a_position'),color:gl.getAttribLocation(p,'a_color')};
      uniforms={screen:gl.getUniformLocation(p,'u_screen'),camera:gl.getUniformLocation(p,'u_camera'),center:gl.getUniformLocation(p,'u_center')};
    }catch(e){console.warn('[Redes Vivas] GPU indisponível, voltando ao Canvas 2D:',e.message);return null;}
    let w=0,h=0,dpr=0,key='',triangles=0,lines=0,mesh=null,blocked=false,quality=1;
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();blocked=true;});
    canvas.addEventListener('webglcontextrestored',()=>{blocked=true;}); // fail safe: reload selects Canvas 2D
    function resize(W,H,qualityFactor){
      const ratio=Math.min(window.devicePixelRatio||1,Math.max(.58,Math.min(1.5,qualityFactor||quality)));
      const sw=Math.max(1,Math.round(W*ratio)),sh=Math.max(1,Math.round(H*ratio));
      if(canvas.width!==sw||canvas.height!==sh){canvas.width=sw;canvas.height=sh;gl.viewport(0,0,sw,sh);}
      w=W;h=H;dpr=ratio;
    }
    function upload(target,bufferRef,data){
      gl.bindBuffer(target,bufferRef);gl.bufferData(target,new Float32Array(data),gl.DYNAMIC_DRAW);
    }
    function draw(bufferRef,count,mode){
      if(!count)return;
      gl.bindBuffer(gl.ARRAY_BUFFER,bufferRef);
      gl.enableVertexAttribArray(attrs.pos);gl.vertexAttribPointer(attrs.pos,3,gl.FLOAT,false,24,0);
      gl.enableVertexAttribArray(attrs.color);gl.vertexAttribPointer(attrs.color,3,gl.FLOAT,false,24,12);
      gl.drawArrays(mode,0,count);
    }
    function build(scene){
      const m=new Mesh(), nodes=scene.nodes,loc=scene.locations;
      if(scene.mode==='layers'){
        const tints=['#44f1c4','#3be2d8','#52ceff','#479eff','#e9c962','#ad8bfa','#a4cde7'];
        for(const side of [-1,1])for(let i=0;i<7;i++){
          const x=side*2.65,y=.30+(6-i)*.65;
          const selected=scene.layerSelected===i, active=(side<0?scene.layerSource:scene.layerTarget)===i;
          const color=selected?'#68ebdf':tints[i];
          m.disc(x,y-.10,0,1.2,selected?'#49eec7':'#24486a',20);
          m.box(x,y,0,3.65,.48,1.36,color,active?1.36:(selected?1.14:.73));
          // Small physical highlight on the leading face of the active layer.
          if(active)m.box(x,y+.30,.70,2.60,.07,.035,'#f0fcff');
        }
        mesh=m;upload(gl.ARRAY_BUFFER,buffer,m.tri);upload(gl.ARRAY_BUFFER,linesBuffer,m.lines);
        triangles=m.tri.length/6;lines=m.lines.length/6;return;
      }
      let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
      for(const n of nodes){const v=loc.get(n);if(!v)continue;x0=Math.min(x0,v.x);x1=Math.max(x1,v.x);z0=Math.min(z0,v.z);z1=Math.max(z1,v.z);}
      if(!Number.isFinite(x0)){x0=-3;x1=3;z0=-2;z1=2;}
      const lx=x0-1,rx=x1+1,lz=z0-1.1,rz=z1+1.1;
      m.quad([lx,-.26,lz],[lx,-.26,rz],[rx,-.26,rz],[rx,-.26,lz],color('#0c283f'));
      for(let i=0;i<=10;i++){
        const x=lx+(rx-lx)*i/10;m.line([x,-.248,lz],[x,-.248,rz],color('#1e4f63',.8));
      }
      for(let i=0;i<=8;i++){
        const z=lz+(rz-lz)*i/8;m.line([lx,-.248,z],[rx,-.248,z],color('#1e4f63',.8));
      }
      for(const c of scene.cables){
        const a=scene.nodeMap.get(c.a),b=scene.nodeMap.get(c.b);
        if(!a||!b||a.oculto||b.oculto)continue;
        const A=loc.get(a),B=loc.get(b);if(!A||!B)continue;
        m.wire(A,B,c.estilo==='wifi'?'#61d8ff':'#32b6ed',!!c.cortado&&!c.disfarce);
      }
      // Informative fallback diagram for content that has no equipment nodes.
      if(!scene.hasRealNodes)for(let i=0;i<nodes.length-1;i++)m.wire(loc.get(nodes[i]),loc.get(nodes[i+1]),'#36b6ed');
      for(const n of nodes){
        const v=loc.get(n);if(v){
          m.equipment(n,v,scene.tint(n));
          if(n.id===scene.selectedId){
            m.disc(v.x,-.095,v.z,.88,'#3afad5',24);
            m.box(v.x,-.07,v.z,1.47,.025,1.35,'#32f1ce',.9);
          }
        }
      }
      mesh=m;upload(gl.ARRAY_BUFFER,buffer,m.tri);upload(gl.ARRAY_BUFFER,linesBuffer,m.lines);
      triangles=m.tri.length/6;lines=m.lines.length/6;
    }
    function render(scene,cam,W,H,scale,qualityFactor){
      if(blocked)return false;
      if(!W||!H)return false;
      resize(W,H,qualityFactor);
      gl.useProgram(p);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
      gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const signature=scene.signature;
      if(signature!==key||!mesh){build(scene);key=signature;}
      gl.uniform2f(uniforms.screen,W,H);
      gl.uniform4f(uniforms.camera,cam.yaw,scale,cam.pitch,W<650?.56:.62);
      gl.uniform3f(uniforms.center,cam.centerX,0,cam.centerZ);
      draw(buffer,triangles,gl.TRIANGLES);
      gl.enable(gl.DEPTH_TEST);draw(linesBuffer,lines,gl.LINES);
      const packet=new Mesh();
      for(const pk of scene.packets){
        if(!pk.vivo||!pk.caminho||pk.caminho.length<2)continue;
        const k=clamp(pk.k||0,0,1),i=clamp(pk.seg||0,0,pk.caminho.length-2);
        const a=pk.caminho[i],b=pk.caminho[i+1];
        const A=typeof a==='string'?scene.nodeMap.get(a):a,B=typeof b==='string'?scene.nodeMap.get(b):b;
        if(!A||!B)continue;
        const from=typeof a==='string'?scene.locations.get(A):{x:(a.x||.5)*7-3.5,z:(a.y||.5)*4-2};
        const to=typeof b==='string'?scene.locations.get(B):{x:(b.x||.5)*7-3.5,z:(b.y||.5)*4-2};
        if(!from||!to)continue;
        const x=from.x+(to.x-from.x)*k,z=from.z+(to.z-from.z)*k,y=.25+Math.sin(Math.PI*k)*.22;
        packet.box(x,y,z,.16,.16,.16,COLORS[pk.tipo]||'#b3f6ff');
      }
      if(packet.tri.length){upload(gl.ARRAY_BUFFER,packetBuffer,packet.tri);gl.enable(gl.DEPTH_TEST);draw(packetBuffer,packet.tri.length/6,gl.TRIANGLES);}
      return !gl.isContextLost();
    }
    return {render,resize,lose:()=>{blocked=true;try{gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{}},get active(){return !blocked},stats:()=>({triangles:triangles/3,lines:lines/2,pixelRatio:dpr})};
  }
  window.RedesVivasGPU={create:init};
})();
