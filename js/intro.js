/* NETVERSE interactive projected-3D introduction; zero external dependencies. */
(() => {
  'use strict';
  const intro = document.getElementById('intro');
  const canvas = document.getElementById('intro-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!intro || !ctx) return;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 750px)').matches;
  const buttons = {
    skip: document.getElementById('intro-skip'), explore: document.getElementById('intro-explore'),
    demo: document.getElementById('intro-demo'), open: document.getElementById('intro-open')
  };
  const info = document.getElementById('intro-device-info');
  const help = document.getElementById('intro-help');
  const nodes = [
    { id: 'pc', name: 'Seu PC', ip: '192.168.0.10', type: 'laptop', x: -3.25, y: 0, z: .5, tint: '#318eff', detail: 'Origem dos pedidos: seu computador' },
    { id: 'switch', name: 'Switch', ip: 'Rede local', type: 'switch', x: -1.25, y: 0, z: .5, tint: '#14d7e3', detail: 'Encaminha quadros dentro da rede local' },
    { id: 'router', name: 'Roteador', ip: '192.168.0.1', type: 'router', x: .65, y: 0, z: .5, tint: '#a98aff', detail: 'Conecta redes e escolhe o próximo salto' },
    { id: 'dns', name: 'Servidor DNS', ip: '8.8.8.8', type: 'server', x: .65, y: .40, z: -1.4, tint: '#ff9b44', detail: 'Transforma nomes de sites em endereços IP' },
    { id: 'web', name: 'Servidor Web', ip: '203.0.113.10', type: 'server', x: 3.0, y: 0, z: .5, tint: '#33e59b', detail: 'Responde às requisições do navegador' }
  ];
  const connections = [[0, 1], [1, 2], [2, 3], [2, 4]];
  let width = 0, height = 0, dpr = 1, frame = 0, last = 0;
  let yaw = .08, targetYaw = .08, tilt = .2, targetTilt = .2, zoom = 1;
  let selected = -1, pointer = null, dragging = false, running = true, explore = false;
  let hitBoxes = [];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const color = (hex, alpha) => {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${alpha})`;
  };
  function size() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    dpr = Math.min(devicePixelRatio || 1, mobile ? 1.2 : 1.6);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function project(x, y, z) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), rx = x * cy - z * sy, rz = x * sy + z * cy;
    const sc = Math.min(width / (mobile ? 8 : 9), height / 5.3, 127) * zoom;
    const eye = 1 / (1 + rz * .04);
    const base = height * (mobile ? .69 : .80);
    return { x: width * .5 + rx * sc * eye, y: base + rz * sc * (.29 + tilt) - y * sc * .88 * eye, s: sc * eye, depth: rz };
  }
  function path(points, fill, stroke, lineWidth = 1) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  function line(a, b, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function glowDot(x, y, tint, radius) {
    ctx.beginPath(); ctx.arc(x, y, radius * 3.4, 0, Math.PI * 2);
    ctx.fillStyle = color(tint, .09); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill();
  }
  // Shaded projected 3D hardware, deliberately without heavy WebGL dependencies.
  function box(x, y, z, w, h, d, tint) {
    const pts = {
      a: project(x-w/2,y,z-d/2), b: project(x+w/2,y,z-d/2),
      c: project(x+w/2,y+h,z-d/2), e: project(x-w/2,y+h,z-d/2),
      f: project(x-w/2,y,z+d/2), g: project(x+w/2,y,z+d/2),
      i: project(x+w/2,y+h,z+d/2), j: project(x-w/2,y+h,z+d/2)
    };
    const face = (vertices, top, bottom, opacity) => {
      const xs=vertices.map(p=>p.x), ys=vertices.map(p=>p.y);
      const grad=ctx.createLinearGradient(Math.min(...xs),Math.min(...ys),Math.max(...xs)+1,Math.max(...ys)+1);
      grad.addColorStop(0,top);grad.addColorStop(1,bottom);
      path(vertices,grad,color(tint,opacity),1.1);
    };
    if(yaw>=0) face([pts.a,pts.f,pts.j,pts.e],'#193956','#09182d',.38);
    else face([pts.b,pts.g,pts.i,pts.c],'#183a56','#081729',.42);
    face([pts.e,pts.c,pts.i,pts.j],'#2d5878','#0c2743',.72);
    face([pts.a,pts.b,pts.c,pts.e],'#19334e','#071525',.65);
    line(pts.e,pts.c,color(tint,.76),1.6);
    return pts;
  }
  function floor(node, position) {
    const p = project(node.x, node.y, node.z);
    const r = position.s * .76;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * .18, r, r * .22, 0, 0, Math.PI * 2);
    ctx.fillStyle = color(node.tint, .11); ctx.fill();
    ctx.strokeStyle = color(node.tint, selected === nodes.indexOf(node) ? .96 : .56); ctx.lineWidth = 2;
    ctx.stroke();
    return p;
  }
  function server(n) {
    box(n.x,n.y,n.z, .55,.95,.46, n.tint);
    const c = project(n.x, n.y+.46, n.z-.244), s = c.s;
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = i === -1 ? '#30465e' : '#0b1e33';
      ctx.fillRect(c.x - s*.20, c.y+i*s*.22 - s*.045, s*.4, s*.08);
      glowDot(c.x - s*.14, c.y+i*s*.22 - s*.005, i===1?'#ff9944':'#31e59c', s*.017);
      line({x:c.x+s*.015, y:c.y+i*s*.22},{x:c.x+s*.15,y:c.y+i*s*.22},color(n.tint,.7),1.7);
    }
  }
  function laptop(n) {
    box(n.x,n.y,n.z, .95,.075,.67,n.tint);
    box(n.x,n.y+.34,n.z+.23, .81,.62,.09,n.tint);
    const c=project(n.x,n.y+.34,n.z+.17), s=c.s;
    const screen=ctx.createLinearGradient(c.x-s*.3,c.y-s*.2,c.x+s*.3,c.y+s*.2);screen.addColorStop(0,'#164f77');screen.addColorStop(.48,'#071b33');screen.addColorStop(1,'#030b19');ctx.fillStyle=screen; ctx.fillRect(c.x-s*.31,c.y-s*.24,s*.62,s*.43);
    ctx.strokeStyle=color(n.tint,.7);ctx.lineWidth=1.2;ctx.strokeRect(c.x-s*.31,c.y-s*.24,s*.62,s*.43);
    line({x:c.x-s*.23,y:c.y+s*.03},{x:c.x+s*.19,y:c.y-s*.13}, color(n.tint,.85),2);
  }
  function switchBox(n) {
    box(n.x,n.y,n.z,1,.28,.53,n.tint);
    const c=project(n.x,n.y+.14,n.z-.28),s=c.s;
    for(let i=0;i<7;i++){
      ctx.fillStyle='#021320';ctx.fillRect(c.x + (i-3.1)*s*.115-s*.03,c.y-s*.035,s*.068,s*.071);
      if(i%2===0)glowDot(c.x+(i-3)*s*.115,c.y+s*.08,'#21ecc5',s*.009);
    }
  }
  function router(n) {
    box(n.x,n.y,n.z,.70,.35,.68,n.tint);
    const c=project(n.x,n.y+.38,n.z),s=c.s;
    ctx.beginPath(); ctx.arc(c.x,c.y,s*.15,0,Math.PI*2); ctx.strokeStyle=color(n.tint,.8); ctx.lineWidth=2; ctx.stroke();
    glowDot(c.x,c.y,n.tint,s*.03);
    const l=project(n.x-.22,n.y+.4,n.z+.15),r=project(n.x+.22,n.y+.4,n.z+.15);
    const lt=project(n.x-.22,n.y+.8,n.z+.15),rt=project(n.x+.22,n.y+.8,n.z+.15);
    line(l,lt,color(n.tint,.78),2);line(r,rt,color(n.tint,.78),2);
    glowDot(lt.x,lt.y,'#5ad7ff',Math.max(1.2,s*.009));
    glowDot(rt.x,rt.y,'#5ad7ff',Math.max(1.2,s*.009));
  }
  function renderNode(n) {
    const p = project(n.x,n.y,n.z);
    floor(n,p);
    if(n.type==='laptop') laptop(n);
    else if(n.type==='switch') switchBox(n);
    else if(n.type==='router') router(n);
    else server(n);
    const label = project(n.x,n.y,n.z);
    const y = mobile && n.id === 'dns' ? label.y - label.s*1.07 : label.y + label.s*.59;
    ctx.font=(mobile?'600 9px':'600 11px')+' system-ui';
    const tw = mobile ? Math.min(95,Math.max(58,ctx.measureText(n.name).width+14)) : Math.max(112,ctx.measureText(n.name).width+26);
    const ht=mobile?23:32;
    ctx.fillStyle='rgba(6,15,29,.87)';ctx.strokeStyle=color(n.tint,.3);
    ctx.beginPath();ctx.roundRect(label.x-tw/2,y,tw,ht,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='#d8efff';ctx.textAlign='center';ctx.fillText(n.name,label.x,y+(mobile?15:13));
    if(!mobile){ctx.fillStyle='#8ba7bf';ctx.font='9px monospace';ctx.fillText(n.ip,label.x,y+26);}
    hitBoxes.push({x:label.x, y:label.y, r:label.s*.7, index:nodes.indexOf(n)});
  }
  function drawGrid() {
    const base = height * (mobile ? .69 : .8);
    ctx.strokeStyle='rgba(45,101,159,.13)';ctx.lineWidth=.9;
    for(let ring=1;ring<=4;ring++){
      ctx.beginPath();ctx.ellipse(width/2,base,ring*width*.2,ring*height*.10,0,Math.PI,0,true);ctx.stroke();
    }
    const stars = mobile?14:34;
    for(let i=0;i<stars;i++){
      const x=((i*147.32+38)%width),y=((i*61.57+72)%height);
      ctx.fillStyle='rgba(155,202,242,.28)';ctx.fillRect(x,y,1.15,1.15);
    }
  }
  function draw(t) {
    if(!running||document.hidden) return;
    if(t-last < (mobile ? 32 : 21)) {frame=requestAnimationFrame(draw);return;}
    last=t;
    yaw += (targetYaw - yaw)*.075;
    tilt += (targetTilt - tilt)*.06;
    const g=ctx.createLinearGradient(0,0,0,height);
    g.addColorStop(0,'#03060d');g.addColorStop(.55,'#050b19');g.addColorStop(1,'#081527');
    ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
    drawGrid();
    for(let i=0;i<connections.length;i++){
      const [ia,ib]=connections[i],na=nodes[ia],nb=nodes[ib];
      const a=project(na.x,na.y+.2,na.z),b=project(nb.x,nb.y+.2,nb.z);
      line(a,b,'rgba(21,100,177,.16)',6);
      line(a,b,'rgba(60,123,217,.53)',1.7);
      if(!prefersReduced){
        const k=(t*.00020*(1+i*.11)+i*.27)%1;
        const px=a.x+(b.x-a.x)*k,py=a.y+(b.y-a.y)*k;
        glowDot(px,py,i===2?'#ffa34d':'#32dfff',3.4);
      }
    }
    // Depth sort to keep the near-facing hardware in front of farther models.
    hitBoxes=[];
    nodes.slice().sort((a,b)=>project(a.x,a.y,a.z).depth-project(b.x,b.y,b.z).depth).forEach(renderNode);
    frame=requestAnimationFrame(draw);
  }
  function leave(destination, autoplay=false) {
    if (!running) return;
    running=false;cancelAnimationFrame(frame);intro.hidden=true;
    document.body.classList.remove('intro-active');
    const app=document.getElementById('app');if(app)app.inert=false;
    const R=window.RedesVivas;
    if(R && destination) {
      R.App.abrir(destination);
      if(autoplay && R.App.labAtivo) R.App.labAtivo.iniciar();
    }
  }
  function onDown(e) { if(e.button!==0&&e.pointerType!=='touch')return;pointer={x:e.clientX,y:e.clientY,yaw:targetYaw,tilt:targetTilt};dragging=false;canvas.setPointerCapture(e.pointerId); }
  function onMove(e) {
    if(!pointer) return;
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(Math.abs(dx)+Math.abs(dy)>6)dragging=true;
    if(dragging){targetYaw=clamp(pointer.yaw+dx*.0035,-.52,.52);targetTilt=clamp(pointer.tilt+dy*.0017,.05,.42);}
  }
  function onUp(e) {
    if(!pointer)return;
    if(!dragging){const x=e.clientX,y=e.clientY;let best=null;
      for(const h of hitBoxes){const d=Math.hypot(x-h.x,y-h.y);if(d<h.r &&(!best||d<best.d))best={h,d};}
      if(best){selected=best.h.index;const n=nodes[selected];info.textContent=`${n.name} • ${n.detail}`;help.textContent='Clique em “Iniciar demonstração” para acompanhar o caminho de uma página web.';info.hidden=false;}
    }
    pointer=null;
  }
  function setup() {
    const app=document.getElementById('app'); if(app)app.inert=true;
    size();info.hidden=true;
    frame=requestAnimationFrame(draw);
    buttons.skip.addEventListener('click',()=>leave('inicio'));
    buttons.open.addEventListener('click',()=>leave('camadas'));
    buttons.demo.addEventListener('click',()=>leave('pagina-web',true));
    buttons.explore.addEventListener('click',()=>{
      explore=!explore;
      targetYaw=explore?.38:.08;targetTilt=explore?.34:.2;
      help.textContent=explore?'Movimente o mouse ou arraste a rede para mudar o ângulo. Selecione um equipamento.':'Arraste a rede para mudar o ângulo • Clique nos equipamentos para conhecer cada um';
      buttons.explore.textContent=explore?'Voltar à visão inicial':'Explorar o universo';
    });
    document.addEventListener('keydown',e=>{if(running&&e.key==='Escape'){e.preventDefault();leave('inicio');}});
    canvas.addEventListener('pointerdown',onDown);
    canvas.addEventListener('pointermove',onMove);
    canvas.addEventListener('pointerup',onUp);
    canvas.addEventListener('pointercancel',()=>{pointer=null;});
    canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom-e.deltaY*.00045,.72,1.3);},{passive:false});
    window.addEventListener('resize',size);
    const quality=document.createElement('button');quality.className='btn-topo';quality.type='button';quality.textContent='Modo leve: desligado';
    quality.title='Reduz efeitos gráficos e melhora o desempenho em PCs mais lentos';
    quality.addEventListener('click',()=>{
      const isLite=document.documentElement.classList.toggle('fx-lite');
      quality.textContent='Modo leve: '+(isLite?'ligado':'desligado');
      quality.setAttribute('aria-pressed',String(isLite));
    });
    const actions=document.querySelector('.topo-acoes');if(actions)actions.append(quality);
    // Automatically choose lite mode on lower-power devices; user can turn it back off.
    if(prefersReduced || (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=2)) quality.click();
    // Direct deep links bypass the intro without losing the quality control.
    if (location.hash && location.hash !== '#inicio') leave();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();