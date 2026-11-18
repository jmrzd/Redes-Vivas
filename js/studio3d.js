/* Redes Vivas | Explorador 3D cinematográfico e leve.
 * Renderização de geometria projetada em Canvas 2D (sem WebGL/dependências).
 * Usa o mesmo Cena do laboratório: nós, cabos e pacotes reais da simulação.
 */
(() => {
  'use strict';
  const TAU=Math.PI*2, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const prefersLess=matchMedia('(prefers-reduced-motion: reduce)');
  const modal=document.createElement('div');
  modal.className='rvstudio'; modal.hidden=true;
  modal.innerHTML=`<section class="rvstudio-shell" role="dialog" aria-modal="true" aria-labelledby="rvstudio-title">
    <header class="rvstudio-head"><div class="rvstudio-brand"><span class="rvstudio-logo">⬡</span><div>
      <strong id="rvstudio-title">REDE VIVA <span>3D</span></strong><small id="rvstudio-module">Laboratório de redes</small>
    </div></div><div class="rvstudio-head-buttons"><button id="rvstudio-lite" type="button" aria-pressed="false">Modo leve</button>
    <button id="rvstudio-close" type="button" aria-label="Fechar explorador 3D">✕ Fechar</button></div></header>
    <div class="rvstudio-stage"><canvas id="rvstudio-canvas" aria-label="Mapa tridimensional interativo dos equipamentos e pacotes desta simulação" tabindex="0"></canvas>
      <div class="rvstudio-hint" aria-hidden="true">ARRASTE PARA GIRAR <span>·</span> TOQUE NOS EQUIPAMENTOS</div>
      <div class="rvstudio-status"><span class="rvstudio-light"></span><span id="rvstudio-state">REDE ATIVA</span>
        <span id="rvstudio-packets">0 PACOTES</span></div>
      <div class="rvstudio-device" id="rvstudio-device" aria-live="polite"><b>EXPLORADOR DE REDE</b><span>Selecione um equipamento para ver detalhes.</span></div>
      <div class="rvstudio-controls"><button type="button" id="rvstudio-left" aria-label="Girar para a esquerda">◀</button><button type="button" id="rvstudio-reset" aria-label="Centralizar câmera">Centralizar</button><button type="button" id="rvstudio-right" aria-label="Girar para a direita">▶</button><span aria-hidden="true">│</span><button type="button" id="rvstudio-out" aria-label="Afastar câmera">−</button><output id="rvstudio-zoom">100%</output><button type="button" id="rvstudio-in" aria-label="Aproximar câmera">+</button></div>
    </div><footer class="rvstudio-footer"><span>CANVAS 2D · CENA 3D PROJETADA · SEM BIBLIOTECAS</span><span>O TRÁFEGO ACOMPANHA A SIMULAÇÃO ORIGINAL</span></footer>
  </section>`;
  document.body.append(modal);
  const $=s=>modal.querySelector(s),modalCanvas=$('#rvstudio-canvas');
  const modalUi={name:$('#rvstudio-module'),state:$('#rvstudio-state'),packets:$('#rvstudio-packets'),device:$('#rvstudio-device'),zoom:$('#rvstudio-zoom'),lite:$('#rvstudio-lite')};
  // One reusable inline canvas shared between laboratories: no second 3D engine.
  const inline=document.createElement('div');inline.className='rvstudio-inline';inline.hidden=true;
  inline.innerHTML=`<canvas class="rvstudio-inline-canvas" aria-label="Laboratório 3D interativo, arraste para girar e toque em equipamentos" tabindex="0"></canvas>
    <div class="rvstudio-inline-head"><strong>REDE VIVA <em>3D</em></strong><span>ARRASTE PARA GIRAR · TOQUE NOS EQUIPAMENTOS</span><button type="button" class="rvstudio-render-toggle" aria-label="Alternar entre 3D acelerado e desenho clássico" aria-pressed="true">GPU</button></div>
    <div class="rvstudio-inline-state"><span class="rvstudio-light"></span><span id="rvstudio-inline-state">PRONTO</span><span id="rvstudio-inline-packets">0 PACOTES</span></div>
    <div class="rvstudio-inline-device" aria-live="polite"><b>EXPLORADOR DE REDE</b><span>Clique em um equipamento para inspecionar.</span></div>
    <div class="rvstudio-inline-controls">
      <button type="button" data-camera="left" aria-label="Girar à esquerda">◀</button>
      <button type="button" data-camera="reset" aria-label="Centralizar">Centralizar</button>
      <button type="button" data-camera="right" aria-label="Girar à direita">▶</button>
      <button type="button" data-camera="out" aria-label="Afastar">−</button>
      <output id="rvstudio-inline-zoom">100%</output>
      <button type="button" data-camera="in" aria-label="Aproximar">+</button>
    </div>`;
  const webPreview=document.createElement('div');
  webPreview.className='rv-web-preview';
  webPreview.hidden=true;
  // The original simulator constructs the page from four arriving HTTP pieces.
  // Mirror that state in the *visible* 3D stage: do not invent packet delivery.
  webPreview.setAttribute('aria-label','Página web montada progressivamente com os pacotes HTTP');
  webPreview.innerHTML=`<div class="rv-web-address"><span class="rv-web-url" aria-label="Endereço digitado"></span></div>
    <div class="rv-web-status" aria-live="polite"></div>
    <div class="rv-web-page">
      <div class="rv-web-part rv-web-header" data-part="1"><span class="rv-web-site-name"></span></div>
      <div class="rv-web-part rv-web-picture" data-part="2" aria-label="Imagem recebida">
        <span class="rv-web-sun"></span><span class="rv-web-mountain rv-web-mountain-one"></span>
        <span class="rv-web-mountain rv-web-mountain-two"></span>
      </div>
      <div class="rv-web-part rv-web-copy" data-part="3" aria-label="Texto recebido"><span class="rv-web-lines">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </span></div>
      <div class="rv-web-part rv-web-action" data-part="4" aria-label="Botão recebido"><span class="rv-web-cta"></span></div>
    </div>`;
  inline.append(webPreview);
  const inlineCanvas=inline.querySelector('canvas');
  // Hardware-accelerated layer behind the existing transparent interaction canvas.
  // The original Canvas 2D renderer remains as an instant fallback.
  const inlineGPUCanvas=document.createElement('canvas');
  inlineGPUCanvas.className='rvstudio-gpu-canvas';inlineGPUCanvas.hidden=true;
  inlineGPUCanvas.setAttribute('aria-hidden','true');
  inline.insertBefore(inlineGPUCanvas,inlineCanvas);
  const modalGPUCanvas=document.createElement('canvas');
  modalGPUCanvas.className='rvstudio-gpu-canvas';modalGPUCanvas.hidden=true;
  modalGPUCanvas.setAttribute('aria-hidden','true');
  modalCanvas.parentNode.insertBefore(modalGPUCanvas,modalCanvas);
  const gpuInstances=new WeakMap();
  let gpuFailed=false,lastGPU=false;
  let gpuEnabled=true;
  try{gpuEnabled=localStorage.getItem('rv-renderer-preference')!=='classic';}catch{}
  const gpuToggle=inline.querySelector('.rvstudio-render-toggle');
  function updateGpuToggle(){
    gpuToggle.textContent=gpuEnabled&&!gpuFailed?'GPU':'2D';
    gpuToggle.setAttribute('aria-pressed',String(gpuEnabled&&!gpuFailed));
    gpuToggle.title=gpuEnabled&&!gpuFailed?'Usar desenho clássico':'Tentar 3D acelerado';
  }
  gpuToggle.addEventListener('click',()=>{
    gpuEnabled=!gpuEnabled;gpuFailed=false;
    try{localStorage.setItem('rv-renderer-preference',gpuEnabled?'gpu':'classic');}catch{}
    updateGpuToggle();
  });
  updateGpuToggle();
  function gpuForCurrent(){
    const canvas=inlineMode?inlineGPUCanvas:modalGPUCanvas;
    if(!gpuEnabled||gpuFailed||!window.RedesVivasGPU||!mobile()||lab?.aba?.id==='camadas'){
      canvas.hidden=true;return null;
    }
    let gpu=gpuInstances.get(canvas);
    if(gpu===undefined){
      gpu=window.RedesVivasGPU.create(canvas);gpuInstances.set(canvas,gpu||null);
    }
    if(!gpu?.active){canvas.hidden=true;return null;}
    canvas.hidden=false;return gpu;
  }
  function gpuSceneData(){
    const ns=frameNodes;
    const signature=lab.aba?.id+'|'+ns.map(n=>[n.id,n.tipo,n.fx,n.fy,n.desligado,n.cor].join(':')).join(';')+'|'+
      lab.cena.cabos.map(c=>[c.a,c.b,c.cortado,c.estilo,c.disfarce].join(':')).join(';')+'|'+lastThemeSignature;
    return {signature,nodes:ns,nodeMap:lab.cena.nos,hasRealNodes:realNodes().length>0,
      locations:framePositions,cables:lab.cena.cabos,packets:lab.cena.pacotes,tint:tintOf};
  }
  function drawGpuLabels(){
    hotspots=[];cableHits=[];
    const nodes=frameNodes;
    if(realNodes().length)for(const c of lab.cena.cabos){
      const a=lab.cena.nos.get(c.a),b=lab.cena.nos.get(c.b);
      if(a&&b&&!a.oculto&&!b.oculto){const A=pos(a),B=pos(b);
        cableHits.push({c,a:proj(A.x,.035,A.z),b:proj(B.x,.035,B.z)});
      }
    }
    for(const n of nodes){
      const at=pos(n),tint=tintOf(n),center=proj(at.x,n.tipo==='servidor'?.82:.39,at.z);
      hotspots.push({n,x:center.x,y:center.y,rad:Math.max(32,center.s*.69)});
      const label=proj(at.x,-.34,at.z);
      ctx.save();ctx.textAlign='center';ctx.textBaseline='top';
      ctx.font=`600 ${W<355?9:10}px system-ui,sans-serif`;
      const txt=n.rotulo||n.tipo,ww=Math.min(ctx.measureText(txt).width+18,105);
      ctx.beginPath();ctx.roundRect(label.x-ww/2,label.y+9,ww,21,7);
      ctx.fillStyle='rgba(4,13,26,.91)';ctx.fill();
      ctx.strokeStyle='rgba(80,199,234,.58)';ctx.stroke();
      ctx.fillStyle='#e4f7ff';ctx.fillText(txt,label.x,label.y+13,ww-10);
      ctx.restore();
    }
  }
  
  const inlineUi={name:inline.querySelector('.rvstudio-inline-head strong'),state:inline.querySelector('#rvstudio-inline-state'),packets:inline.querySelector('#rvstudio-inline-packets'),device:inline.querySelector('.rvstudio-inline-device'),zoom:inline.querySelector('#rvstudio-inline-zoom'),lite:modalUi.lite};
  let cv=modalCanvas,ctx=cv.getContext('2d',{alpha:true}),ui=modalUi,inlineMode=false,inlineLab=null;
  let lab=null,raf=0,last=0,W=0,H=0,ratio=1,scale=65,cam={yaw:.54,target:.54,pitch:.55,zoom:1,centerX:0,centerZ:0},
      pointer=null,drag=false,chosen=null,hotspots=[],cableHits=[],previousFocus=null,lastTouch=0,
      perf={samples:0,elapsed:0,frameMs:0,drawMs:0,avgDrawMs:0,actualFps:0,autoLite:false};
  const mobile=()=>W<650;
  // Cache topology for the duration of one frame. Previously pos() rebuilt the
  // entire node list for EVERY projected polygon vertex on mobile (O(n²)).
  let frameNodes=[],framePositions=new Map(),frameBounds=null,needsResize=true;
  let bgGradient=null,softGradient=null,frameSimple=false;
  const resizeObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{needsResize=true;});
  if(resizeObserver){resizeObserver.observe(modalCanvas);resizeObserver.observe(inlineCanvas);}
  const simpleQuality=()=>lite()||frameSimple;
  const themeColorCache=new Map();let lastThemeSignature='';
  // Suspend rendering when the 3D canvas scrolls out of view. The simulation continues.
  const inView=new WeakMap();
  if(typeof IntersectionObserver!=='undefined'){
    const watch=new IntersectionObserver(entries=>{
      for(const entry of entries)inView.set(entry.target,entry.isIntersecting);
    },{threshold:.01});
    watch.observe(modalCanvas);watch.observe(inlineCanvas);
  }
  function captureTopology(){
    frameNodes=sceneNodes();framePositions.clear();
    const vertical=mobile();
    // On phones, six devices fit better in two wide rows than three
    // crowded two-column rows (which overlapped tall server racks).
    const cols=vertical && frameNodes.length>=5?3:frameNodes.length>7?3:2;
    const rows=Math.ceil(frameNodes.length/cols);
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    frameNodes.forEach((n,i)=>{
      const p=vertical
        ?{x:((i%cols)-(cols-1)/2)*(cols===3?3.05:2.9),z:(Math.floor(i/cols)-(rows-1)/2)*(cols===3?4.3:3.35)}
        :{x:((Number.isFinite(n.fx)?n.fx:.5)-.5)*7-((Number.isFinite(n.fy)?n.fy:.5)-.5)*1.4,
          z:((Number.isFinite(n.fy)?n.fy:.5)-.5)*4};
      framePositions.set(n,p);
      x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);
    });
    frameBounds=frameNodes.length?{ns:frameNodes,x0,x1,z0,z1}:{ns:[],x0:-3,x1:3,z0:-2,z1:2};
  }

  // Educational 3D vignette for Camadas OSI/TCP-IP: its teaching canvas has no device nodes.
  // This is explicitly illustrative; it never adds fictional packets to the simulation.
  const illustrative=[
    {id:'v-pc',tipo:'laptop',fx:.14,fy:.48,rotulo:'Origem',sub:'Camada de aplicação',illustrative:true,brilho:0},
    {id:'v-switch',tipo:'switch',fx:.38,fy:.48,rotulo:'Enlace',sub:'Quadros',illustrative:true,brilho:0},
    {id:'v-router',tipo:'roteador',fx:.62,fy:.48,rotulo:'Rede',sub:'Pacotes IP',illustrative:true,brilho:0},
    {id:'v-server',tipo:'servidor',fx:.86,fy:.48,rotulo:'Destino',sub:'Dados recebidos',illustrative:true,brilho:0}
  ];
  const realNodes=()=>[...lab.cena.nos.values()].filter(n=>!n.oculto&&n.tipo!=='junta'&&n.tipo!=='terminador');
  const sceneNodes=()=>{const ns=realNodes();return ns.length?ns:illustrative;};
  const lite=()=>document.documentElement.classList.contains('fx-lite');
  function tintOf(n){
    if(n.cor){
      let value=themeColorCache.get(n.cor);
      if(value===undefined){
        value=getComputedStyle(document.documentElement).getPropertyValue(n.cor).trim();
        themeColorCache.set(n.cor,value);
      }
      if(/^#[\da-f]{6}$/i.test(value))return value;
    }
    return ({servidor:'#ffae67',pc:'#33cefa',laptop:'#33cefa',switch:'#1dedcd',hub:'#20e5ba',roteador:'#a890ff',firewall:'#fb6179',nuvem:'#52c8ff',globo:'#51b2ef',celular:'#34d9ff',ap:'#27e5d6',espiao:'#ff798e',sensor:'#f5cc6d'})[n.tipo]||'#5bd7ff';
  }
  function rgba(hex,a){const t=parseInt(hex.slice(1),16);return `rgba(${t>>16},${t>>8&255},${t&255},${a})`}
  function pos(n){
    const cached=framePositions.get(n);
    if(cached)return cached;
    const px=Number.isFinite(n.fx)?n.fx:.5,py=Number.isFinite(n.fy)?n.fy:.5;
    return {x:(px-.5)*7-(py-.5)*1.4,z:(py-.5)*4};
  }
  function bounds(){return frameBounds||{ns:[],x0:-3,x1:3,z0:-2,z1:2};}
  function sizing(){
    if(!lab)return;
    // Reading layout every animation frame forces synchronous iOS Safari reflow.
    if(needsResize){
      const r=cv.getBoundingClientRect();W=Math.max(280,r.width);H=Math.max(300,r.height);
      ratio=Math.min(devicePixelRatio||1,lite()?1:(W<650?1:1.5));
      const width=Math.round(W*ratio),height=Math.round(H*ratio);
      if(cv.width!==width||cv.height!==height){cv.width=width;cv.height=height;}
      needsResize=false;bgGradient=null;softGradient=null;
    }
    // Mode-leve and browser pixel-density changes must update the backing store.
    const desiredRatio=Math.min(devicePixelRatio||1,lite()?1:(mobile()?1:1.5));
    if(desiredRatio!==ratio){
      ratio=desiredRatio;
      const width=Math.round(W*ratio),height=Math.round(H*ratio);
      if(cv.width!==width||cv.height!==height){cv.width=width;cv.height=height;}
      bgGradient=null;softGradient=null;
    }
    captureTopology();
    const b=bounds(),extentX=b.x1-b.x0+2.3,extentZ=b.z1-b.z0+3.3;
    scale=Math.min(mobile()?W/(extentX*1.20):W/(extentX*1.06),H/(extentZ*.65+2.05),mobile()?84:130)*cam.zoom;
    cam.centerX=(b.x0+b.x1)/2;cam.centerZ=(b.z0+b.z1)/2;
  }
  function proj(x,y,z){
    x-=cam.centerX;z-=cam.centerZ;
    const s=Math.sin(cam.yaw),c=Math.cos(cam.yaw),rx=x*c-z*s,rz=x*s+z*c;
    const perspective=1/(1+rz*.023);const f=scale*perspective;
    return {x:W*.5+rx*f,y:H*(mobile()?.56:.62)+(rz*cam.pitch-y*.91)*f,depth:rz,s:f};
  }
  function poly(points,fill,stroke,alpha=1){
    ctx.beginPath();points.forEach((p,i)=>{const q=proj(...p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath();
    ctx.fillStyle=fill;ctx.globalAlpha=alpha;ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke();}ctx.globalAlpha=1;
  }
  function edge(a,b,tint='#4c9dc3',width=1.5,dash=null){
    const A=proj(...a),B=proj(...b);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);
    ctx.strokeStyle=tint;ctx.lineWidth=width;ctx.setLineDash(dash||[]);ctx.stroke();ctx.setLineDash([]);
  }
  function point(x,y,z,r,fill,glow=false){
    const p=proj(x,y,z);
    if(glow&&!simpleQuality()){
      ctx.fillStyle=rgba(fill,.14);ctx.beginPath();ctx.arc(p.x,p.y,r*3,0,TAU);ctx.fill();
    }
    ctx.fillStyle=fill;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();
  }
  function box(x,y,z,w,h,d,tint,tone='metal'){
    const l=x-w/2,r=x+w/2,b=z-d/2,f=z+d/2,t=y+h;
    const sides=tone==='glass'?['#275b85','#132f50','#09182e']:
      tone==='red'?['#65435e','#32243c','#130f20']:
      tone==='teal'?['#285a67','#143742','#091c2d']:
      ['#3b5b7b','#1d3753','#0b1c32'];
    poly([[l,t,b],[r,t,b],[r,t,f],[l,t,f]],sides[0],rgba(tint,.62));
    if(Math.sin(cam.yaw)>=0)poly([[r,y,b],[r,t,b],[r,t,f],[r,y,f]],sides[1],rgba(tint,.35));
    else poly([[l,y,b],[l,t,b],[l,t,f],[l,y,f]],sides[1],rgba(tint,.35));
    poly([[l,y,f],[r,y,f],[r,t,f],[l,t,f]],sides[2],rgba(tint,.48));
    edge([l,t,f],[r,t,f],rgba(tint,.85),1.8);
  }
  function front(x,y,z,w,h,color='#071626',outline='#3b6987'){
    poly([[x-w/2,y,z],[x+w/2,y,z],[x+w/2,y+h,z],[x-w/2,y+h,z]],color,outline);
  }
  function deck(x,y,z,w,d,color='#18455e',outline='#3c8daa'){
    poly([[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2]],color,outline);
  }
  function device(n){
    const {x,z}=pos(n),tint=tintOf(n),active=lab.relogio&&!n.desligado;
    const time=lab.cena.t,blink=active?Math.sin(time*.009+x*6)*.33+.67:.25;
    const bob=active&&!prefersLess.matches&&!simpleQuality()?Math.sin(time*.0026+x*3)*.025:0;
    const highlight=n.brilho>0;
    // Shadow, volumetric plinth and pulsing port LEDs all use actual simulation state.
    const base=proj(x,0,z),rad=base.s*.52;
    ctx.save();ctx.beginPath();ctx.ellipse(base.x,base.y+4,rad,rad*.29,0,0,TAU);
    ctx.fillStyle=rgba(tint,lite()?.055:.13);ctx.fill();
    ctx.strokeStyle=rgba(tint,chosen===n?.95:highlight?.8:.4);
    ctx.lineWidth=chosen===n?3:1.5;ctx.stroke();ctx.restore();
    const y=bob+.09;
    const id=n.tipo;
    if(id==='servidor'){
      box(x,y,z,.69,1.57,.62,tint);
      front(x,y+.08,z+.321,.57,1.43,'#071525','#42627d');
      for(let i=0;i<6;i++){
        const yy=y+.15+i*.205;
        front(x,yy,z+.336,.49,.164,'#1b3550',rgba(tint,.42));
        for(let j=0;j<3;j++)edge([x-.1,yy+.035+j*.033,z+.339],[x+.17,yy+.035+j*.033,z+.339],'#47718d',.8);
        point(x-.175,yy+.073,z+.342,2,i%4===0?'#ffad62':highlight?'#9bffdf':'#36dbae',true);
      }
      deck(x,y+1.58,z,.73,.61,'#2e536d',rgba(tint,.65));
      point(x,y+1.9,z,3,tint,true);
    }else if(id==='pc'||id==='laptop'){
      box(x,y,z,1.05,.09,.73,tint,'metal');
      deck(x,y+.097,z,.99,.65,'#2a5970',rgba(tint,.6));
      box(x,y+.10,z-.34,.90,.83,.095,tint,'glass');
      front(x,y+.20,z-.287,.76,.64,'#05253c',rgba(tint,.9));
      for(let i=0;i<3;i++)edge([x-.29,y+.32+i*.12,z-.280],[x+.02+i*.04,y+.42+i*.105,z-.280],rgba(tint,.85),1.5);
      for(let j=0;j<3;j++)for(let k=0;k<6;k++)deck(x-.36+k*.145,y+.103,z+.02+j*.145,.107,.079,'#173147','#416982');
      point(x,y+.64,z-.275,2.2,'#40ffc1',false);
    }else if(id==='switch'||id==='hub'){
      box(x,y,z,1.06,.28,.63,tint,'teal');
      front(x,y+.065,z+.324,.95,.165,'#081522',rgba(tint,.7));
      for(let i=0;i<(id==='hub'?5:8);i++){
        const px=x-.418+i*(id==='hub'?.205:.119);
        front(px,y+.095,z+.334,.086,.078,'#010a15','#4a8ba5');
        point(px,y+.225,z+.337,1.8,i%4===0?'#ffaf5f':blink>.47?'#5affcc':'#164746');
      }
      deck(x,y+.291,z,.98,.58,'#275666','#4da9ac');
    }else if(id==='roteador'){
      box(x,y,z,.94,.34,.73,tint);
      deck(x,y+.345,z,.88,.65,'#223f64',rgba(tint,.7));
      front(x,y+.06,z+.375,.82,.135,'#09132a',rgba(tint,.5));
      for(let i=0;i<5;i++)point(x-.30+i*.15,y+.2,z+.38,1.8,blink>.52?'#65ffc6':tint,true);
      for(const dx of [-.31,.31]){
        edge([x+dx,y+.30,z-.26],[x+dx,y+1.13,z-.34],'#77b1d8',3.4);
        point(x+dx,y+1.14,z-.34,2.6,tint,true);
      }
    }else if(id==='firewall'){
      box(x,y,z,.68,.90,.64,tint,'red');
      for(let i=0;i<5;i++)front(x,y+.13+i*.145,z+.33,.50,.112,i%2?'#452038':'#542a40','#8b5267');
      point(x,y+.95,z,4,'#ff6a83',true);
    }else if(id==='nuvem'||id==='globo'){
      box(x,y,z,.84,.15,.78,tint,'glass');
      const p=proj(x,y+.44,z);
      ctx.save();ctx.fillStyle='#185d84';
      for(const [dx,dy,r] of [[-.26,-.01,.19],[-.03,-.12,.25],[.24,.01,.19]]){
        ctx.beginPath();ctx.arc(p.x+dx*p.s,p.y+dy*p.s,r*p.s,0,TAU);ctx.fill();
      }
      ctx.fillStyle='#39a9d2';ctx.fillRect(p.x-.38*p.s,p.y-.01*p.s,.76*p.s,.18*p.s);ctx.restore();
      point(x,y+.57,z+.12,2,'#88faff',true);
    }else if(id==='ap'||id==='sensor'||id==='controlador'){
      box(x,y,z,.70,.42,.64,tint,'teal');
      deck(x,y+.43,z,.64,.59,'#214e62',rgba(tint,.7));
      for(let i=1;i<4;i++){
        const p=proj(x,y+.5+i*.18,z);
        ctx.strokeStyle=rgba(tint,.65-i*.12);ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,p.s*i*.17,Math.PI*1.2,Math.PI*1.8);ctx.stroke();
      }
      point(x,y+.49,z+.2,2.6,'#59ffce',true);
    }else if(id==='celular'||id==='camera'||id==='ar'||id==='lampada'){
      box(x,y,z,.55,.87,.36,tint,'glass');
      front(x,y+.11,z+.195,.44,.64,'#08223c',rgba(tint,.8));
      for(let i=0;i<4;i++)edge([x-.16,y+.23+i*.1,z+.2],[x+.16,y+.23+i*.1,z+.2],rgba(tint,.62),1.5);
      point(x,y+.84,z+.2,2,'#72ffc7');
    }else{
      box(x,y,z,.70,.69,.62,tint,id==='espiao'?'red':'metal');
      front(x,y+.12,z+.32,.57,.42,'#152b48',rgba(tint,.64));
      point(x,y+.37,z+.34,3,tint,true);
    }
    // A device above the scene has real identity; no invented hardware data.
    if(n.desligado){
      const q=proj(x,y+1,z);ctx.strokeStyle='#ff6b79';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(q.x-7,q.y-7);ctx.lineTo(q.x+7,q.y+7);ctx.moveTo(q.x+7,q.y-7);ctx.lineTo(q.x-7,q.y+7);ctx.stroke();
    }
    const clickCenter=proj(x,id==='servidor'?.75:.38,z);
    hotspots.push({n,x:clickCenter.x,y:clickCenter.y,rad:Math.max(32,base.s*.66)});
    const label=proj(x,-.34,z);
    ctx.save();ctx.textAlign='center';ctx.textBaseline='top';ctx.font=`${mobile()?(W<355?'600 9px':'600 10px'):'600 12px'} system-ui,sans-serif`;
    const txt=n.rotulo||id;const w=Math.min(ctx.measureText(txt).width+18,mobile()?105:158);
    ctx.fillStyle='rgba(4,13,26,.89)';ctx.strokeStyle=rgba(tint,.55);
    ctx.beginPath();ctx.roundRect(label.x-w/2,label.y+9,w,21,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='#e1f8ff';ctx.fillText(txt,label.x,label.y+13,w-10);ctx.restore();
  }
  function ground(){
    const b=bounds(),x0=b.x0-1.1,x1=b.x1+1.1,z0=b.z0-1,z1=b.z1+1;
    poly([[x0,-.23,z0],[x1,-.23,z0],[x1,-.23,z1],[x0,-.23,z1]],'#091e34','#145472');
    const gx=(x1-x0)/10,gz=(z1-z0)/8;
    if(!frameSimple){
      ctx.save();for(let i=0;i<=10;i++)edge([x0+i*gx,-.225,z0],[x0+i*gx,-.225,z1],'rgba(66,145,192,.16)',.75);
      for(let j=0;j<=8;j++)edge([x0,-.225,z0+j*gz],[x1,-.225,z0+j*gz],'rgba(66,145,192,.16)',.75);ctx.restore();
    }
    for(const n of b.ns){
      const p=pos(n),t=tintOf(n),q=proj(p.x,-.21,p.z);
      ctx.beginPath();ctx.ellipse(q.x,q.y,scale*.48,scale*.20,0,0,TAU);
      ctx.strokeStyle=rgba(t,.24);ctx.lineWidth=1;ctx.stroke();
    }
  }
  function cables(){
    const map=lab.cena.nos;cableHits=[];
    if(!realNodes().length){
      for(let i=0;i<illustrative.length-1;i++){
        const a=pos(illustrative[i]),b=pos(illustrative[i+1]);
        edge([a.x,.04,a.z],[b.x,.04,b.z],'rgba(22,158,226,.18)',7);
        edge([a.x,.04,a.z],[b.x,.04,b.z],'#32bfe9',2.1);
      }
      return;
    }
    for(const c of lab.cena.cabos){
      const A=map.get(c.a),B=map.get(c.b);if(!A||!B||A.oculto||B.oculto)continue;
      const a=pos(A),b=pos(B),cut=c.cortado&&!c.disfarce;
      cableHits.push({c,a:proj(a.x,.035,a.z),b:proj(b.x,.035,b.z)});
      edge([a.x,.035,a.z],[b.x,.035,b.z],cut?'rgba(255,80,104,.37)':'rgba(19,166,226,.16)',7);
      if(cut){
        const mid=[(a.x+b.x)/2,(a.z+b.z)/2];
        edge([a.x,.04,a.z],[mid[0]-.13,.04,mid[1]],'#ff758a',2,[6,5]);
        edge([mid[0]+.13,.04,mid[1]],[b.x,.04,b.z],'#ff758a',2,[6,5]);
      }else{
        edge([a.x,.04,a.z],[b.x,.04,b.z],c.estilo==='wifi'?'#7de9ff':'#2aa9e4',2,c.estilo==='wifi'?[4,6]:null);
      }
    }
  }
  // Real simulation metadata rendered directly on each of the three transmission paths.
  function mediaLabels(){
    if(lab.aba?.id!=='meios')return;
    const kinds=[['cobre','PAR TRANÇADO (COBRE)','#45d6ff'],['fibra','FIBRA ÓPTICA','#ffb55e'],['wifi','WI-FI (ONDAS DE RÁDIO)','#72e9d6']];
    for(const [id,label,color] of kinds){
      const a=lab.cena.nos.get('tx-'+id),b=lab.cena.nos.get('rx-'+id);
      if(!a||!b)continue;
      const A=pos(a),B=pos(b),P=proj((A.x+B.x)/2,.19,(A.z+B.z)/2);
      const fs=mobile()?10:12;
      ctx.save();ctx.font=`700 ${fs}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      const width=Math.min(W*.72,ctx.measureText(label).width+18);
      ctx.fillStyle='rgba(3,13,27,.93)';ctx.strokeStyle=color;ctx.lineWidth=1;
      ctx.beginPath();ctx.roundRect(P.x-width/2,P.y-12,width,24,6);ctx.fill();ctx.stroke();
      ctx.fillStyle='#e6faff';ctx.fillText(label,P.x,P.y,width-12);ctx.restore();
    }
  }
  const layerNames=['Aplicação','Apresentação','Sessão','Transporte','Rede','Enlace','Física'];
  const layerColors=['#34e5ac','#34d4bd','#2cc6c9','#36b6f9','#f2d064','#a891ff','#a8c9df'];
  const layerInfo=[
    ['Dados','HTTP, DNS e aplicações'],
    ['Dados','Codificação, formato e criptografia'],
    ['Dados','Gerenciamento de sessões'],
    ['Segmento','TCP, UDP e portas'],
    ['Pacote','IP e roteamento'],
    ['Quadro','Ethernet, MAC e FCS'],
    ['Bits','Sinais elétricos, ópticos ou rádio']
  ];
  function layers3d(){
    hotspots=[];cableHits=[];
    const E=lab.cena.E||lab.cena.E,active=E?.ativaO??-1;
    const selected=Number.isInteger(E?.sel)?E.sel:-1;
    const cw=mobile()?W*.41:Math.min(210,W*.25);
    const gap=mobile()?8:Math.min(44,W*.09);
    const blockH=mobile()?Math.min(35,Math.max(19,(H-130)/7-5)):Math.min(43,H*.075);
    const total=7*(blockH+5);
    const left=W/2-gap/2-cw,right=W/2+gap/2;
    const top=Math.max(mobile()?52:74,(H-total)/2);
    ctx.save();ctx.textBaseline='middle';ctx.textAlign='center';
    for(let side=0;side<2;side++){
      const x=side?right:left;
      ctx.font=`700 ${mobile()?10:12}px system-ui,sans-serif`;
      ctx.fillStyle='#b5dfff';ctx.fillText(side?(mobile()?'DESTINO · RECEBE':'DESTINO · DESENCAPSULAMENTO'):(mobile()?'ORIGEM · ENVIA':'ORIGEM · ENCAPSULAMENTO'),x+cw/2,top-25,cw+8);
      for(let i=0;i<7;i++){
        const y=top+i*(blockH+5),c=layerColors[i],on=(side?E?.ativaD:E?.ativaO)===i;
        const d=mobile()?7:11;
        ctx.fillStyle=on?'#214e67':selected===i?'#21365d':'#102840';
        ctx.strokeStyle=on?c:'#3c7795';ctx.lineWidth=on?2:1;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+d,y-d);ctx.lineTo(x+cw+d,y-d);ctx.lineTo(x+cw,y);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#071525';ctx.beginPath();ctx.moveTo(x+cw,y);ctx.lineTo(x+cw+d,y-d);ctx.lineTo(x+cw+d,y+blockH-d);ctx.lineTo(x+cw,y+blockH);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle=on?'#174d54':'#10283c';ctx.fillRect(x,y,cw,blockH);ctx.strokeStyle=on?c:'#3d7492';ctx.strokeRect(x,y,cw,blockH);
        ctx.fillStyle=c;ctx.fillRect(x+3,y+3,4,blockH-6);
        ctx.fillStyle='#e9f8ff';ctx.font=`700 ${mobile()?10:12}px system-ui,sans-serif`;
        ctx.fillText((7-i)+' '+layerNames[i],x+cw/2,y+blockH/2,cw-14);
        hotspots.push({n:{rotulo:'Camada '+(7-i)+': '+layerNames[i],tipo:'camada',layer:i,illustrative:true},x:x+cw/2,y:y+blockH/2,rad:Math.max(blockH/2,cw*.42),rect:{x,y,w:cw,h:blockH}});
      }
    }
    const k=Number.isInteger(active)&&active>=0?active:0;
    const fy=top+k*(blockH+5)+blockH/2;
    const t=lab.cena.t||0;
    const px=W/2+Math.sin(t*.003)*gap*.22;
    ctx.fillStyle=layerColors[k];ctx.beginPath();ctx.arc(px,fy,4.5,0,TAU);ctx.fill();
    ctx.font=`700 ${mobile()?10:12}px system-ui,sans-serif`;ctx.fillStyle='#c6e9ff';
    ctx.fillText(layerInfo[k][0]+' · '+layerInfo[k][1],W/2,Math.min(H-20,top+total+18),W-18);
    ctx.restore();
  }
  let lastWebKey='';
  function webBrowser(){
    const visible=!!lab&&lab.aba?.id==='pagina-web';
    if(webPreview.hidden===visible)webPreview.hidden=!visible;
    if(!visible){lastWebKey='';return;}
    const E=lab.cena.E||{}, site=lab.cena.P?.site||'www.exemplo.com.br';
    const received=Array.from({length:4},(_,i)=>!!E.pedacos?.[i+1]);
    // Quantize the assembly progress so transitions are smooth without 60 DOM layouts/s.
    const assembly=Math.round(clamp(E.montada||0,0,1)*12)/12;
    const key=[site,E.digitado,E.status,E.falha,E.digitando,assembly,...received].join('|');
    if(key===lastWebKey)return;
    lastWebKey=key;
    const written=site.slice(0,clamp(E.digitado||0,0,site.length));
    webPreview.querySelector('.rv-web-url').textContent=written||'Digite um endereço...';
    webPreview.querySelector('.rv-web-status').textContent=E.status||(E.digitando?'Digitando endereço...':'Navegador de Ana');
    webPreview.querySelector('.rv-web-site-name').textContent=site.replace(/^www\./,'');
    received.forEach((hasPiece,i)=>{
      const part=webPreview.querySelector('[data-part="'+(i+1)+'"]');
      part.classList.toggle('received',hasPiece);
      part.setAttribute('aria-label',`Parte ${i+1} ${hasPiece?'recebida':'aguardando'}`);
    });
    webPreview.classList.toggle('has-error',!!E.falha);
    webPreview.classList.toggle('assembled',assembly>=1);
    webPreview.style.setProperty('--rv-web-gap',(4*(1-assembly)).toFixed(1)+'px');
  }
  function packets(){
    const scene=lab.cena;
    for(const pk of scene.pacotes){
      if(!pk.vivo||pk.caminho.length<2)continue;
      const i=clamp(pk.seg,0,pk.caminho.length-2),a=pk.caminho[i],b=pk.caminho[i+1];
      const A=typeof a==='string'?scene.nos.get(a):a,B=typeof b==='string'?scene.nos.get(b):b;
      if(!A||!B)continue;
      const p=typeof a==='string'?pos(A):{x:(a.x||.5)*7-3.5,z:(a.y||.5)*4-2};
      const q=typeof b==='string'?pos(B):{x:(b.x||.5)*7-3.5,z:(b.y||.5)*4-2};
      const k=clamp(pk.k,0,1),x=p.x+(q.x-p.x)*k,z=p.z+(q.z-p.z)*k;
      const colors={dns:'#ffab53',tcp:'#4abfff',udp:'#3ee5f0',dados:'#55f9ae',cripto:'#ae99ff',ataque:'#ff6583',rede:'#ffe17d',bits:'#a5d4ff'};
      const tint=colors[pk.tipo]||'#9ff0ff';point(x,.25+Math.sin(Math.PI*k)*.22,z,3.5,tint,true);
      if(!simpleQuality())for(let j=1;j<=3;j++)point(p.x+(x-p.x)*(1-j*.09),.23+Math.sin(Math.PI*k)*.2,p.z+(z-p.z)*(1-j*.09),Math.max(.8,3-j*.7),rgba(tint,.30),false);
    }
  }
  function tryGPU(){
    const gpu=gpuForCurrent();if(!gpu)return false;
    try{
      // Pixel ratio is intentionally capped on iOS. The GPU uses a cached mesh;
      // dragging updates camera uniforms instead of rebuilding every 3D face.
      const quality=frameSimple?.72:(lite()?.67:.92);
      if(!gpu.render(gpuSceneData(),cam,W,H,scale,quality))throw Error('WebGL context lost');
      return true;
    }catch(error){
      console.warn('[Redes Vivas] Falha no WebGL: Canvas 2D restaurado.',error);
      gpuFailed=true;updateGpuToggle();inlineGPUCanvas.hidden=true;modalGPUCanvas.hidden=true;
      return false;
    }
  }
  function render(now){
    if((modal.hidden&&!inlineMode)||!lab){raf=0;return;}
    raf=requestAnimationFrame(render);
    if(document.hidden||inView.get(cv)===false)return;
    const signature=document.documentElement.className+'|'+document.documentElement.getAttribute('data-theme');
    if(lastThemeSignature!==signature){themeColorCache.clear();lastThemeSignature=signature;}
    // Keep direct touch interaction responsive, while saving battery at rest.
    const touching=!!pointer&&drag;
    const delay=mobile()?(touching?(lastGPU?16:27):(lite()?50:34)):(lite()?50:17);
    if(now-last<delay)return;
    const start=performance.now();
    if(!perf.elapsed)perf.elapsed=now;
    last=now;sizing();
    frameSimple=mobile()&&touching;
    // On phones don't override the user's chosen camera with auto-orbit.
    if(!mobile()&&!lite()&&!prefersLess.matches&&now-lastTouch>5000){
      cam.target=.35+Math.sin(now*.00018)*.25;
    }
    // Touch tracks the finger immediately. Buttons retain a short smooth turn.
    cam.yaw+=(cam.target-cam.yaw)*(touching?1:(mobile()?.30:.12));
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const usingGPU=tryGPU();lastGPU=usingGPU;
    if(usingGPU){
      // Preserve labels/hit-testing, but draw all hardware and packet geometry
      // with a single batched WebGL renderer. No Canvas 2D scene overdraw.
      ctx.clearRect(0,0,W,H);
    }else{
      inlineGPUCanvas.hidden=true;modalGPUCanvas.hidden=true;
      if(!bgGradient){
        bgGradient=ctx.createLinearGradient(0,0,W,H);
        bgGradient.addColorStop(0,'#030811');bgGradient.addColorStop(.55,'#07172c');bgGradient.addColorStop(1,'#041025');
      }
      ctx.fillStyle=bgGradient;ctx.fillRect(0,0,W,H);
      if(!simpleQuality()){
        if(!softGradient){
          softGradient=ctx.createRadialGradient(W*.52,H*.61,10,W*.52,H*.61,W*.6);
          softGradient.addColorStop(0,'rgba(19,126,193,.17)');softGradient.addColorStop(1,'rgba(2,7,17,0)');
        }
        ctx.fillStyle=softGradient;ctx.fillRect(0,0,W,H);
      }
    }
    // Camadas is a lesson about protocol layers, NOT an equipment topology.
    // The previous release drew the illustrative hardware on TOP of the OSI
    // prisms and stole the layer hit targets. Keep only its own 3D diagram.
    if(lab.aba?.id==='camadas'){
      layers3d();
    }else if(usingGPU){
      drawGpuLabels();mediaLabels();
    }else{
      ground();cables();hotspots=[];
      const ns=frameNodes.slice().sort((a,b)=>{const p=pos(a),q=pos(b);return proj(q.x,0,q.z).depth-proj(p.x,0,p.z).depth});
      for(const n of ns)device(n);
      packets();
      mediaLabels();
    }
    webBrowser();
    const status=lab.relogio?'SIMULAÇÃO ATIVA':'SIMULAÇÃO PAUSADA';
    const packetCount=lab.aba?.id==='camadas'?'7 CAMADAS OSI':lab.cena.pacotes.filter(pk=>pk.vivo).length+' PACOTES';
    // Avoid DOM writes on every frame: on iOS they can force Canvas reflow.
    if(ui.state.textContent!==status)ui.state.textContent=status;
    if(ui.packets.textContent!==packetCount)ui.packets.textContent=packetCount;
    // Real frame timing is diagnostic and can trigger one-time adaptive quality fallback.
    const elapsed=performance.now()-start;
    perf.avgDrawMs=perf.samples?perf.avgDrawMs*.92+elapsed*.08:elapsed;
    perf.drawMs=elapsed;perf.samples++;
    if(now-perf.elapsed>=1200){perf.actualFps=perf.samples*1000/(now-perf.elapsed);perf.samples=0;perf.elapsed=now;}
    if(!perf.autoLite&&!lite()&&perf.samples>25&&perf.avgDrawMs>28){
      perf.autoLite=true;document.documentElement.classList.add('fx-lite');
      ui.lite.setAttribute('aria-pressed','true');
      document.documentElement.dispatchEvent(new Event('rvqualitychange'));
    }
  }
  function select(n){chosen=n;
    if(n?.layer!=null){
      ui.device.classList.add('is-selected');
      const i=n.layer;
      const name=layerNames[i];
      const info=layerInfo[i];
      lab.inspecionar('Camada '+(7-i)+': '+name,[['Unidade de dados',info[0]],['Função',info[1]]],{sub:'modelo OSI · representação 3D'});
      ui.device.replaceChildren();
      const b=document.createElement('b'),sp=document.createElement('span');
      b.textContent='CAMADA '+(7-i)+' · '+name.toUpperCase();sp.textContent=info[1];ui.device.append(b,sp);
      return;
    }
    if(!n){ui.device.classList.remove('is-selected');ui.device.innerHTML='<b>EXPLORADOR DE REDE</b><span>Selecione um equipamento para ver detalhes.</span>';return;}
    ui.device.classList.add('is-selected');
    ui.device.replaceChildren();
    const title=document.createElement('b'),detail=document.createElement('span');
    title.textContent=(n.rotulo||n.tipo).toUpperCase();
    detail.textContent=`${n.tipo.toUpperCase()}${n.sub?' · '+n.sub:''}${n.desligado?' · DESLIGADO':''}`;
    ui.device.append(title,detail);
    // Keep the original inspector working and reflect the same selected node.
    if(!n.illustrative&&n.clicavel&&lab.def.aoClicarNo&&lab.def.aoClicarNo(lab.cena,n,lab)!==false)return;
    const pairs=n.info?Object.entries(typeof n.info==='function'?n.info(lab.cena):n.info):n.sub?[['Endereço',n.sub]]:[];
    lab.inspecionar(n.rotulo||'Equipamento',pairs,{sub:n.illustrative?'diagrama ilustrativo · vista 3D':'equipamento · vista 3D'});
  }
  function open(l){
    if(!l||!l.cena)return;
    if(inlineMode){inline.hidden=true;inlineMode=false;}
    $('.rvstudio-stage').append(webPreview);
    lastWebKey='';webPreview.hidden=true;
    cv=modalCanvas;ctx=cv.getContext('2d',{alpha:true});ui=modalUi;
    activeTouchPoints.clear();pinchStart=null;pinchConsumed=false;
    previousFocus=document.activeElement;lab=l;chosen=null;
    ui.name.textContent=(l.aba?.titulo||l.def?.titulo||'Laboratório interativo')+(realNodes().length?'':' · representação ilustrativa');
    modal.hidden=false;document.body.classList.add('rvstudio-active');
    cam={yaw:innerWidth<650?.08:.54,target:innerWidth<650?.08:.54,pitch:.55,zoom:1,centerX:0,centerZ:0};
    ui.zoom.textContent='100%';ui.lite.setAttribute('aria-pressed',String(lite()));
    perf={samples:0,elapsed:0,frameMs:0,drawMs:0,avgDrawMs:0,actualFps:0,autoLite:false};
    select(null);last=0;lastTouch=performance.now();needsResize=true;sizing();webBrowser();if(!raf)raf=requestAnimationFrame(render);
    $('#rvstudio-close').focus();
  }
  function close(){
    modal.hidden=true;document.body.classList.remove('rvstudio-active');lab=null;
    if(raf){cancelAnimationFrame(raf);raf=0;}
    if(inlineLab?.mode3d)showInline(inlineLab);
    if(previousFocus?.focus)previousFocus.focus();
  }
  function showInline(l){
    // Called when a tab or the 3D / diagram toggle changes.
    if(!modal.hidden){inlineLab=l;return;}
    if(inline.parentElement){inline.parentElement.classList.remove('rv3d-immersive','rv-web-scene');}
    const previousLab=inlineLab;
    inline.hidden=true;inlineMode=false;inlineLab=null;
    if(raf){cancelAnimationFrame(raf);raf=0;}
    lab=null;
    if(!l||!l.cena||!l.elMoldura)return;
    activeTouchPoints.clear();pinchStart=null;pinchConsumed=false;
    inlineLab=l;lab=l;
    inline.classList.toggle('rv-layers',l.aba?.id==='camadas');
    inline.classList.toggle('rv-web-lab',l.aba?.id==='pagina-web');
    inline.append(webPreview);
    lastWebKey='';webPreview.hidden=true;
    l.elMoldura.append(inline);l.elMoldura.classList.add('rv3d-immersive');
    l.elMoldura.classList.toggle('rv-web-scene',l.aba?.id==='pagina-web');
    inline.hidden=false;inlineMode=true;
    cv=inlineCanvas;ctx=cv.getContext('2d',{alpha:true});ui=inlineUi;
    // Camera belongs to this scene. Carrying 225% zoom to another module
    // could push every object outside the viewport, looking like a black scene.
    if(previousLab!==l || !l._rv3dVisited){
      cam={yaw:mobile()?.08:.54,target:mobile()?.08:.54,pitch:.55,zoom:1,centerX:0,centerZ:0};
      l._rv3dVisited=true;
    }
    ui.zoom.textContent=Math.round(cam.zoom*100)+'%';
    chosen=null;select(null);last=0;lastTouch=performance.now();
    perf={samples:0,elapsed:0,frameMs:0,drawMs:0,avgDrawMs:0,actualFps:0,autoLite:false};
    needsResize=true;sizing();webBrowser();raf=requestAnimationFrame(render);
  }
  $('#rvstudio-close').addEventListener('click',close);
  $('#rvstudio-left').addEventListener('click',()=>{lastTouch=performance.now();cam.target=clamp(cam.target-.27,-1.25,1.25)});
  $('#rvstudio-right').addEventListener('click',()=>{lastTouch=performance.now();cam.target=clamp(cam.target+.27,-1.25,1.25)});
  $('#rvstudio-reset').addEventListener('click',()=>{lastTouch=performance.now();cam.target=mobile()?.08:.54;cam.zoom=1;ui.zoom.textContent='100%'});
  const zoom=d=>{lastTouch=performance.now();cam.zoom=clamp(Math.round((cam.zoom+d)*10)/10,.7,2.25);ui.zoom.textContent=Math.round(cam.zoom*100)+'%'};
  inline.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{
    const op=button.dataset.camera;lastTouch=performance.now();
    if(op==='left')cam.target=clamp(cam.target-.27,-1.25,1.25);
    if(op==='right')cam.target=clamp(cam.target+.27,-1.25,1.25);
    if(op==='reset'){cam.target=mobile()?.08:.54;cam.pitch=.55;cam.zoom=1;ui.zoom.textContent='100%';}
    if(op==='in')zoom(.2);if(op==='out')zoom(-.2);
  }));
  $('#rvstudio-in').addEventListener('click',()=>zoom(.2));
  $('#rvstudio-out').addEventListener('click',()=>zoom(-.2));
  ui.lite.addEventListener('click',()=>{document.documentElement.classList.toggle('fx-lite');ui.lite.setAttribute('aria-pressed',String(lite()));document.documentElement.dispatchEvent(new Event('rvqualitychange'));});
  // Two-finger pinch zoom: operates on the original camera shared by the
  // WebGL and 2D fallback renderers; never triggers an accidental cable tap.
  const activeTouchPoints=new Map();
  let pinchStart=null,pinchConsumed=false;
  function bindCanvasEvents(surface){
  surface.addEventListener('wheel',ev=>{ev.preventDefault();zoom(ev.deltaY>0?-.1:.1)},{passive:false});
  surface.addEventListener('pointerdown',ev=>{
    lastTouch=performance.now();
    if(ev.pointerType==='touch'){
      activeTouchPoints.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      if(activeTouchPoints.size===2){
        const [a,b]=[...activeTouchPoints.values()];
        pinchStart={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:cam.zoom};
        pinchConsumed=true;pointer=null;drag=true;
      }
    }
    if(!pinchStart){pointer={id:ev.pointerId,x:ev.clientX,y:ev.clientY,mx:ev.clientX,my:ev.clientY};drag=false;}
    try{surface.setPointerCapture(ev.pointerId);}catch{}
  });
  surface.addEventListener('pointermove',ev=>{
    if(activeTouchPoints.has(ev.pointerId)){
      activeTouchPoints.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      if(pinchStart&&activeTouchPoints.size===2){
        const [a,b]=[...activeTouchPoints.values()];
        cam.zoom=clamp(pinchStart.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinchStart.distance,.7,2.25);
        ui.zoom.textContent=Math.round(cam.zoom*100)+'%';
        lastTouch=performance.now();return;
      }
    }
    if(!pointer||pointer.id!==ev.pointerId)return;
    const dx=ev.clientX-pointer.x,dy=ev.clientY-pointer.y;
    if(Math.abs(ev.clientX-pointer.mx)+Math.abs(ev.clientY-pointer.my)>8)drag=true;
    if(drag){
      lastTouch=performance.now();
      cam.target=clamp(cam.target+dx*(mobile()?.011:.008),-1.25,1.25);
      cam.pitch=clamp(cam.pitch+dy*.003,.30,.72);
      if(ev.pointerType==='touch'||ev.pointerType==='pen')cam.yaw=cam.target;
    }
    pointer.x=ev.clientX;pointer.y=ev.clientY;
  });
  surface.addEventListener('pointerup',ev=>{
    if(activeTouchPoints.has(ev.pointerId))activeTouchPoints.delete(ev.pointerId);
    if(pinchConsumed){
      pointer=null;drag=false;
      if(activeTouchPoints.size<2)pinchStart=null;
      if(activeTouchPoints.size===0)pinchConsumed=false;
      return;
    }
    if(!pointer||pointer.id!==ev.pointerId)return;
    if(!drag){const rect=cv.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;
      const hit=hotspots.map(h=>({...h,d:h.rect&&x>=h.rect.x&&x<=h.rect.x+h.rect.w&&y>=h.rect.y&&y<=h.rect.y+h.rect.h?0:Math.hypot(h.x-x,h.y-y)})).sort((a,b)=>a.d-b.d)[0];
      // Click/tap the actual simulated cable to disconnect/reconnect it.
      const wires=cableHits.map(item=>{
        const ax=item.a.x,ay=item.a.y,bx=item.b.x,by=item.b.y,dx=bx-ax,dy=by-ay;
        const k=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);
        return {...item,d:Math.hypot(x-(ax+dx*k),y-(ay+dy*k)),k};
      }).filter(item=>item.k>.1&&item.k<.9).sort((a,b)=>a.d-b.d)[0];
      if(hit&&hit.d<Math.min(hit.rad*.85,42))select(hit.n);
      else if(wires&&wires.d<12){lab.alternarCabo(wires.c);select(null);}
      else if(hit&&hit.d<hit.rad*1.6)select(hit.n);
    }pointer=null;
  });
  surface.addEventListener('pointercancel',ev=>{
    activeTouchPoints.delete(ev.pointerId);pointer=null;drag=false;
    if(activeTouchPoints.size<2)pinchStart=null;
    if(activeTouchPoints.size===0)pinchConsumed=false;
  });
  }
  bindCanvasEvents(modalCanvas);bindCanvasEvents(inlineCanvas);
  modal.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){ev.preventDefault();close();}
    if(ev.key==='ArrowLeft'){lastTouch=performance.now();cam.target=clamp(cam.target-.23,-1.25,1.25);}
    if(ev.key==='ArrowRight'){lastTouch=performance.now();cam.target=clamp(cam.target+.23,-1.25,1.25);}
  });
  // Prevent keyboard shortcuts of the underlying simulator from running while the modal is open.
  modal.addEventListener('keydown',ev=>{if(ev.key===' '||ev.key==='PageUp'||ev.key==='PageDown'||ev.key==='r'||ev.key==='R')ev.stopPropagation()});
  window.RedesVivasStudio={open,close,showInline,isOpen:()=>!modal.hidden,shouldSkip:l=>!modal.hidden||(inlineMode&&l===inlineLab),stats:()=>({fps:Math.round(perf.actualFps),avgDrawMs:+perf.avgDrawMs.toFixed(2),lastDrawMs:+perf.drawMs.toFixed(2),lite:lite(),nodes:lab?sceneNodes().length:0,gpu:lastGPU,gpuFailed})};
})();
