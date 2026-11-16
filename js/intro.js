/* REDES VIVAS | cinematic lightweight 3D scene
   Projected 3D meshes painted in Canvas 2D. No remote assets or GPU frameworks.
   The lab engine in app.js remains independent. */
(() => {
  'use strict';
  const intro = document.getElementById('intro');
  const canvas = document.getElementById('intro-canvas');
  if (!intro || !canvas) return;
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) return;
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = matchMedia('(max-width: 750px)');
  const buttons = {
    skip: document.getElementById('intro-skip'),
    explore: document.getElementById('intro-explore'),
    demo: document.getElementById('intro-demo'),
    open: document.getElementById('intro-open')
  };
  const info = document.getElementById('intro-device-info');
  const help = document.getElementById('intro-help');
  const deviceNodes = [
    { id:'pc', name:'Seu PC', ip:'192.168.0.10', type:'laptop', x:-2.9, z:.8, tint:'#21b7ff', detail:'O computador envia pedidos e recebe respostas.' },
    { id:'switch', name:'Switch', ip:'REDE LOCAL', type:'switch', x:-1.38, z:.8, tint:'#26f6e1', detail:'O switch conecta equipamentos na mesma rede local.' },
    { id:'router', name:'Roteador', ip:'192.168.0.1', type:'router', x:.12, z:.8, tint:'#ac84ff', detail:'O roteador liga redes diferentes e encaminha pacotes.' },
    { id:'dns', name:'Servidor DNS', ip:'8.8.8.8', type:'server', x:.12, z:-1.38, tint:'#ffa654', detail:'O DNS encontra endereços IP a partir de nomes.' },
    { id:'web', name:'Servidor Web', ip:'203.0.113.10', type:'server', x:2.65, z:.8, tint:'#38f5a5', detail:'O servidor entrega os dados da página solicitada.' }
  ];
  const connections = [[0,1],[1,2],[2,3],[2,4]];
  const TAU = Math.PI*2;
  const clamp = (n,a,b) => Math.max(a, Math.min(b,n));
  let W=0,H=0,dpr=1,scale=90,raf=0,last=0, running=true;
  let yaw=.37, baseYaw=.37, tilt=.42, wantedTilt=.42, zoom=1;
  let pan=0, pointer=null, dragged=false, selected=-1, lite=false, elapsed=0, hits=[];
  const mobile = () => mqMobile.matches;
  const reduced = () => prefersReduced || lite;
  function rgba(hex,alpha) {
    const a=parseInt(hex.slice(1),16);
    return `rgba(${a>>16},${(a>>8)&255},${a&255},${alpha})`;
  }
  function resize() {
    W=Math.max(300,canvas.clientWidth); H=Math.max(300,canvas.clientHeight);
    dpr=Math.min(devicePixelRatio||1,lite ? 1 : mobile()?1.25:1.65);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    scale=Math.min(mobile()?W/5.65:W/10.2,H/(mobile()?7.8:5.9),mobile()?76:145)*zoom;
  }
  function proj(x,y,z) {
    const sy=Math.sin(yaw),cy=Math.cos(yaw),rx=x*cy-z*sy,rz=x*sy+z*cy;
    const persp=1/(1+rz*.043);
    const sc=scale*persp*(mobile()?.80:1);
    return {x:W*(mobile()?.53:.73)+rx*sc,
      y:H*(mobile()?.69:.705)+rz*sc*tilt-y*sc*.99,
      s:sc, depth:rz};
  }
  function polygon(coords,top,bottom,stroke='#25465f',lineWidth=.9) {
    const pts=coords.map(p=>proj(...p));
    const ys=pts.map(p=>p.y), min=Math.min(...ys),max=Math.max(...ys);
    const grad=ctx.createLinearGradient(0,min,0,max+1);
    grad.addColorStop(0,top);grad.addColorStop(1,bottom);
    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=grad;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
    return pts;
  }
  function edge(a,b,stroke,width=1) {
    const pa=proj(...a),pb=proj(...b);
    ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();
  }
  function point(a,r,tint,glow=1) {
    const p=proj(...a);if(glow&&!lite){
      const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*4);
      grad.addColorStop(0,rgba(tint,.25));grad.addColorStop(1,rgba(tint,0));
      ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p.x,p.y,r*4,0,TAU);ctx.fill();
    }
    ctx.fillStyle=tint;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();
  }
  function box(x,y,z,w,h,d,tint,variant='metal') {
    const l=x-w/2,r=x+w/2,b=z-d/2,f=z+d/2,top=y+h;
    const body=variant==='glass' ? ['#1c668b','#081a3b','#1f4967','#07182a'] :
      variant==='top' ? ['#376b81','#0b2b44','#2b4e66','#07172b'] :
      ['#203c5b','#07182f','#172f4b','#061122'];
    // True face polygons, drawn from geometry rather than a flat icon.
    const topPts=polygon([[l,top,b],[r,top,b],[r,top,f],[l,top,f]],body[0],body[1],rgba(tint,.55));
    if(yaw>=-.05) polygon([[r,y,b],[r,top,b],[r,top,f],[r,y,f]],body[2],body[3],rgba(tint,.38));
    else polygon([[l,y,b],[l,top,b],[l,top,f],[l,y,f]],body[2],body[3],rgba(tint,.38));
    polygon([[l,y,f],[r,y,f],[r,top,f],[l,top,f]],'#142e4c','#030c1c',rgba(tint,.5),1.1);
    edge([l,top,f],[r,top,f],rgba(tint,.82),1.55);
    edge([l,top,b],[r,top,b],rgba('#b8e8ff',.25),.65);
    return {l,r,b,f,top,topPts};
  }
  function front(x,y,z,w,h,c1,c2,stroke) {
    polygon([[x-w/2,y,z],[x+w/2,y,z],[x+w/2,y+h,z],[x-w/2,y+h,z]],c1,c2,stroke);
  }
  function deck(x,y,z,w,d,c1,c2,stroke) {
    polygon([[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2]],c1,c2,stroke);
  }
  function shadow(n,t) {
    const p=proj(n.x,-.08,n.z),r=p.s*(n.type==='server'?.82:.79);
    ctx.save();ctx.translate(p.x,p.y);
    ctx.scale(1,.42);
    let grad=ctx.createRadialGradient(0,0,1,0,0,r*1.22);
    grad.addColorStop(0,rgba(n.tint,.2));grad.addColorStop(.6,rgba(n.tint,.06));grad.addColorStop(1,rgba(n.tint,0));
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,r*1.22,0,TAU);ctx.fill();
    ctx.strokeStyle=rgba(n.tint,selected===deviceNodes.indexOf(n)?.95:.36);
    ctx.lineWidth=2.3;ctx.beginPath();ctx.ellipse(0,0,r,.48*r,0,0,TAU);ctx.stroke();
    if(!reduced()) {
      const pulse=(elapsed*.00028+deviceNodes.indexOf(n)*.21)%1;
      ctx.strokeStyle=rgba(n.tint,(1-pulse)*.25);ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(0,0,r*(.6+pulse*.68),r*(.3+pulse*.32),0,0,TAU);ctx.stroke();
    }
    ctx.restore();
  }
  function drawServer(n,bob) {
    const x=n.x,z=n.z,y=bob, tint=n.tint;
    // Tall metal rack with inset vents, rails, individual blades and power LEDs.
    box(x,y,z,.68,1.58,.59,tint);
    front(x,y+.07,z+.31,.54,1.42,'#12263e','#040c19','#34506a');
    for(let i=0;i<6;i++) {
      const yy=y+.15+i*.213;
      front(x,yy,z+.324,.46,.155,'#24415e','#091529',rgba(tint,.35));
      for(let j=0;j<3;j++) edge([x-.10,yy+.045+j*.033,z+.326],[x+.16,yy+.045+j*.033,z+.326],rgba(tint,.14),.9);
      point([x-.177,yy+.078,z+.336],1.7,i%3===0?'#ffae58':'#39f4af',1);
    }
    deck(x,y+1.59,z,.72,.61,'#395674','#102538',rgba(tint,.7));
    // Animated status beacon hovering over rack.
    const beacon=proj(x,y+1.89,z); const r=Math.max(4,beacon.s*.072);
    ctx.strokeStyle=rgba(tint,.7);ctx.lineWidth=1.25;
    ctx.beginPath();ctx.arc(beacon.x,beacon.y,r,0,TAU);ctx.stroke();
    point([x,y+1.89,z],2.8,tint,1);
  }
  function drawSwitch(n,bob) {
    const x=n.x,z=n.z,y=bob;
    box(x,y,z,1.1,.28,.67,n.tint);
    front(x,y+.07,z+.347,.99,.155,'#152a42','#07111c',rgba(n.tint,.5));
    for(let i=0;i<8;i++) {
      const xx=x-.415+i*.119;
      front(xx,y+.095,z+.36,.088,.082,'#0d1b2b','#010710','#37627d');
      if(i%2===0)point([xx,y+.232,z+.36],1.4,'#40ffc8',1);
    }
    deck(x,y+.29,z,.97,.5,'#276584','#13283d',rgba(n.tint,.42));
    edge([x-.35,y+.29,z-.07],[x+.23,y+.29,z-.07],rgba(n.tint,.5),1.8);
  }
  function drawRouter(n,bob) {
    const x=n.x,z=n.z,y=bob;
    box(x,y,z,.91,.32,.73,n.tint);
    deck(x,y+.33,z,.78,.6,'#284a71','#101d3b',rgba(n.tint,.72));
    const p=proj(x,y+.345,z),sc=p.s;
    ctx.beginPath();ctx.ellipse(p.x,p.y,sc*.2,sc*.075,0,0,TAU);
    ctx.strokeStyle=rgba(n.tint,.85);ctx.lineWidth=1.5;ctx.stroke();
    point([x,y+.348,z],2.5,n.tint,1);
    front(x,y+.08,z+.375,.8,.13,'#13223d','#060d1d',rgba(n.tint,.35));
    for(let k=0;k<5;k++)point([x-.27+k*.13,y+.19,z+.381],1.35,k===0?'#21efbd':n.tint,1);
    for(const dx of [-.31,.31]) {
      const from=[x+dx,y+.28,z-.26],to=[x+dx,y+1.16,z-.32];
      edge(from,to,'#7fb3dc',3.6);edge(from,to,rgba(n.tint,.75),1.25);
      point(to,2.5,n.tint,1);
    }
  }
  function drawLaptop(n,bob) {
    const x=n.x,z=n.z,y=bob;
    box(x,y,z,1.16,.09,.77,n.tint,'top');
    deck(x,y+.10,z,.99,.63,'#37637d','#0a263b',rgba(n.tint,.52));
    // LCD lid: real tall vertical mesh rather than a flat floating rectangle.
    box(x,y+.11,z-.35,.99,.81,.10,n.tint,'glass');
    front(x,y+.19,z-.287,.86,.66,'#0c3555','#020b1f',rgba(n.tint,.8));
    for(let i=0;i<3;i++) {
      edge([x-.34,y+.38+i*.13,z-.28],[x-.06+i*.06,y+.51+i*.075,z-.28],rgba(n.tint,.75),1.4);
    }
    edge([x-.34,y+.28,z-.28],[x+.29,y+.28,z-.28],rgba('#41efbd',.65),1.4);
    // Keyboard rows, drawn on the actual top plane.
    for(let row=0;row<3;row++)for(let col=0;col<7;col++) {
      const xx=x-.4+col*.134,zz=z+.02+row*.14;
      deck(xx,y+.105,zz,.094,.065,'#274054','#112236','#426685');
    }
    deck(x,y+.109,z+.31,.28,.105,'#334d62','#13273b',rgba(n.tint,.28));
  }
  function background() {
    const b=ctx.createLinearGradient(0,0,W,H);
    b.addColorStop(0,'#03070f');b.addColorStop(.6,'#071327');b.addColorStop(1,'#05101f');
    ctx.fillStyle=b;ctx.fillRect(0,0,W,H);
    const cx=W*(mobile()?.5:.76),cy=H*(mobile()?.77:.70);
    const light=ctx.createRadialGradient(cx,cy,0,cx,cy,W*.53);
    light.addColorStop(0,'rgba(28,105,174,.29)');light.addColorStop(.5,'rgba(18,66,135,.10)');light.addColorStop(1,'rgba(5,12,25,0)');
    ctx.fillStyle=light;ctx.fillRect(0,0,W,H);
    const seed=mobile()?25:75;
    for(let k=0;k<seed;k++) {
      const x=((k*139.73+49)%W),y=((k*53.11+21)%H);
      const alpha=.13+.22*((Math.sin(k*.83+elapsed*.00028)+1)*.5);
      ctx.fillStyle=`rgba(150,216,255,${alpha})`;
      ctx.fillRect(x,y,k%7===0?2:1,k%7===0?2:1);
    }
  }
  function grid() {
    // Layered circuit-board surface in perspective: deliberate 3D floor planes.
    polygon([[-4.05,-.17,-2.76],[4.05,-.17,-2.76],[4.05,-.17,2.85],[-4.05,-.17,2.85]],
      '#092138','#040e1c','rgba(23,134,212,.26)',1.3);
    ctx.lineWidth=.75;
    for(let i=-8;i<=8;i++) edge([i*.48,-.162,-2.72],[i*.48,-.162,2.79], 'rgba(60,154,217,.13)',.75);
    for(let j=-6;j<=6;j++) edge([-4.02,-.162,j*.44],[4.02,-.162,j*.44],'rgba(60,154,217,.13)',.75);
    const lines=[
      [[-4,-.155,-1.6],[-2,-.155,-1.6],[-2,-.155,-.55]],
      [[-3.8,-.155,2.1],[-2.5,-.155,2.1],[-2.5,-.155,1.48]],
      [[.8,-.155,-2.55],[.8,-.155,-2.2],[2.1,-.155,-2.2]],
      [[1.8,-.155,2.55],[1.8,-.155,1.75],[3.6,-.155,1.75]],
      [[-1.6,-.155,-2.55],[-1.6,-.155,-2.2],[-2.7,-.155,-2.2]]
    ];
    for(let i=0;i<lines.length;i++) {
      const ps=lines[i].map(v=>proj(...v));
      ctx.beginPath();ps.forEach((p,k)=>k?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.strokeStyle=i%2?'rgba(32,226,235,.42)':'rgba(86,113,254,.38)';ctx.lineWidth=1.7;ctx.stroke();
      const end=lines[i].at(-1);point(end,2.5,i%2?'#28e8e7':'#628bff',0);
    }
  }
  function cablePoint(a,b,k) {
    // Raised 3D cable following a slightly arched path between the hardware.
    const x=a.x+(b.x-a.x)*k,z=a.z+(b.z-a.z)*k;
    return [x,.07+.24*Math.sin(Math.PI*k),z];
  }
  function cables() {
    for(let i=0;i<connections.length;i++) {
      const [ai,bi]=connections[i],a=deviceNodes[ai],b=deviceNodes[bi];
      let prev=proj(...cablePoint(a,b,0));
      for(let j=1;j<=22;j++) {
        const now=proj(...cablePoint(a,b,j/22));
        ctx.lineWidth=lite?1.4:5;ctx.strokeStyle=rgba(i===3?'#3df9a5':'#3aabff',lite?.27:.105);
        ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(now.x,now.y);ctx.stroke();
        ctx.lineWidth=1.7;ctx.strokeStyle=rgba(i===2?'#ffa654':'#48ceff',.72);
        ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(now.x,now.y);ctx.stroke();
        prev=now;
      }
      if(!reduced()) for(let bead=0;bead<3;bead++) {
        const k=(elapsed*.00016*(1+i*.14)+bead/3+i*.17)%1;
        const p=cablePoint(a,b,k);
        point(p,bead===0?3.6:2.3,i===2?'#ffa654':'#54ecff',1);
        if(!lite) {const pp=proj(...cablePoint(a,b,Math.max(0,k-.04)));const cp=proj(...p);
          ctx.lineWidth=2;ctx.strokeStyle='rgba(192,245,255,.72)';ctx.beginPath();ctx.moveTo(pp.x,pp.y);ctx.lineTo(cp.x,cp.y);ctx.stroke();}
      }
    }
  }
  function drawLabels(n) {
    const index=deviceNodes.indexOf(n),p=proj(n.x,.05,n.z),top=proj(n.x,n.type==='server'?1.6:1.1,n.z);
    const isMob=mobile();
    const w=isMob?Math.max(57,Math.min(83,n.name.length*5.4)):Math.max(112,n.name.length*8.6);
    const h=isMob?22:34,x=p.x-w/2,y=p.y+(isMob?7:13);
    ctx.fillStyle='rgba(5,14,30,.92)';ctx.strokeStyle=rgba(n.tint,selected===index?.95:.48);ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.fill();ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#e8f8ff';ctx.font=`600 ${isMob?'9':'12'}px system-ui`;
    ctx.fillText(n.name,p.x,y+(isMob?7:6));
    if(!isMob){ctx.font='10px ui-monospace, monospace';ctx.fillStyle='#91aac7';ctx.fillText(n.ip,p.x,y+21);}
    hits.push({index,x:top.x,y:top.y+(p.y-top.y)*.4,r:Math.max(27,p.s*.7)});
  }
  function drawScene(ms) {
    if(!running)return;
    if(document.hidden){last=ms;raf=requestAnimationFrame(drawScene);return;}
    const delta=last?ms-last:16;
    if(last && delta<(mobile()?29:19)){raf=requestAnimationFrame(drawScene);return;}
    elapsed+=clamp(delta,0,80);last=ms;
    // Gentle continuous camera motion; gestures suspend auto orbit.
    const drift=pointer||reduced()?0:Math.sin(elapsed*.00023)*.10;
    yaw+=(baseYaw+drift-yaw)*.055;
    tilt+=(wantedTilt-tilt)*.055;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    background();
    grid();cables();
    hits=[];
    const sorted=deviceNodes.slice().sort((a,b)=>proj(a.x,0,a.z).depth-proj(b.x,0,b.z).depth);
    for(const n of sorted) {
      shadow(n,ms);
      const bob=reduced()?0:.026*Math.sin(elapsed*.0018+deviceNodes.indexOf(n)*1.35);
      if(n.type==='server')drawServer(n,bob);
      else if(n.type==='laptop')drawLaptop(n,bob);
      else if(n.type==='switch')drawSwitch(n,bob);
      else drawRouter(n,bob);
      drawLabels(n);
    }
    raf=requestAnimationFrame(drawScene);
  }
  function leave(module,autoplay=false) {
    if(!running)return;
    running=false;cancelAnimationFrame(raf);intro.hidden=true;document.body.classList.remove('intro-active');
    const app=document.getElementById('app');if(app)app.inert=false;
    const R=window.RedesVivas;
    if(R && module){R.App.abrir(module);if(autoplay && R.App.labAtivo)R.App.labAtivo.iniciar();}
  }
  function onDown(e) {
    if(e.pointerType==='mouse'&&e.button!==0)return;
    pointer={x:e.clientX,y:e.clientY,yaw:baseYaw,tilt:wantedTilt};dragged=false;
    canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if(!pointer)return;
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;
    if(dragged){baseYaw=clamp(pointer.yaw+dx*.0045,-.87,.87);wantedTilt=clamp(pointer.tilt+dy*.0018,.22,.62);}
  }
  function onUp(e) {
    if(!pointer)return;
    if(!dragged) {
      let best=null;
      for(const h of hits){const dist=Math.hypot(e.clientX-h.x,e.clientY-h.y);if(dist<h.r&&(!best||dist<best.dist))best={...h,dist};}
      if(best){selected=best.index;const n=deviceNodes[selected];info.textContent=`${n.name} • ${n.detail}`;info.hidden=false;help.textContent='Acompanhe os pacotes animados e abra um laboratório para testar os protocolos.';}
    }
    pointer=null;
  }
  function setup() {
    const app=document.getElementById('app');if(app)app.inert=true;
    info.hidden=true;
    const quality=document.createElement('button');quality.className='btn-topo';quality.type='button';quality.textContent='Modo leve: desligado';
    quality.title='Modo de baixo consumo: reduz animações e efeitos de luz';
    quality.addEventListener('click',()=>{
      lite=document.documentElement.classList.toggle('fx-lite');
      quality.textContent=`Modo leve: ${lite?'ligado':'desligado'}`;
      quality.setAttribute('aria-pressed',String(lite));resize();
    });
    const actions=document.querySelector('.topo-acoes');if(actions)actions.append(quality);
    resize();
    if(prefersReduced || (navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=2))quality.click();
    buttons.skip.addEventListener('click',()=>leave('inicio'));
    buttons.open.addEventListener('click',()=>leave('camadas'));
    buttons.demo.addEventListener('click',()=>leave('pagina-web',true));
    buttons.explore.addEventListener('click',()=>{
      const explorer=buttons.explore.getAttribute('aria-pressed')!=='true';
      buttons.explore.setAttribute('aria-pressed',String(explorer));
      baseYaw=explorer?-.47:.37;wantedTilt=explorer?.54:.42;
      buttons.explore.textContent=explorer?'Voltar à visão principal':'Explorar o universo';
      help.textContent=explorer?'Arraste ou deslize para girar a câmera • Clique nos equipamentos':'Gire a câmera e veja os pacotes viajando em tempo real';
    });
    document.addEventListener('keydown',e=>{if(running&&e.key==='Escape'){e.preventDefault();leave('inicio');}});
    canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);
    canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',()=>pointer=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom-e.deltaY*.0004,.7,1.32);resize();},{passive:false});
    window.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',()=>{last=0;});
    // A direct module link goes straight to the existing lab.
    if(location.hash&&location.hash!=='#inicio')leave();
    else raf=requestAnimationFrame(drawScene);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
