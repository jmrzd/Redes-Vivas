/* REDES VIVAS — Laboratório 3D leve (Canvas 2D).
 * Geometria original desenhada em vetores. Sem WebGL, CDN, fontes ou modelos externos.
 * A malha dos dispositivos é pré-renderizada e reutilizada entre quadros.
 * Os dados, hitboxes, roteiro e animação de pacotes continuam no motor original.
 */
(() => {
  'use strict';
  const cache = new Map();
  const SIZE = 224;
  const TYPES = new Set(['pc','laptop','servidor','switch','hub','roteador','firewall',
    'nuvem','ap','celular','sensor','lampada','camera','ar','pessoa','espiao',
    'controlador','globo']);
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const light = () => document.documentElement.classList.contains('fx-lite');
  const TAU = Math.PI * 2;

  function build(type, view, lite) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const c = canvas.getContext('2d');
    c.translate(SIZE / 2, SIZE / 2 - 1);
    c.scale(SIZE * .81, SIZE * .81);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const dir = view < 0 ? -1 : 1;
    const shift = dir * (.055 + Math.abs(view) * .044);
    const rise = .072 + Math.abs(view) * .014;
    const neon = '#38dffc', blue = '#63a9ff', violet = '#af98ff', green = '#54f8be';
    function path(points, fill, stroke, lw = .006) {
      c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();
      c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}
    }
    function grad(x,y,w,h,top,bottom) {
      if (lite) return bottom;
      const g=c.createLinearGradient(x,y,x+w*.65,y+h);
      g.addColorStop(0,top);g.addColorStop(1,bottom);return g;
    }
    function line(x,y,X,Y,color=neon,width=.012) {
      c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.lineWidth=width;c.strokeStyle=color;c.stroke();
    }
    function dot(x,y,r,color=green) {
      c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
    }
    function rect(x,y,w,h,fill,stroke,thickness=.005) {
      c.fillStyle=fill;c.fillRect(x,y,w,h);
      if(stroke){c.strokeStyle=stroke;c.lineWidth=thickness;c.strokeRect(x,y,w,h);}
    }
    // Front, top and visible side are real polygons in a projected 3D isometric volume.
    function cube(x,y,w,h,metal='blue',depth=1) {
      const sx=shift*depth, sy=rise*depth;
      const palette={
        blue:['#315775','#0a1a2d','#203f5a','#071525'],
        purple:['#564a8c','#141a38','#373565','#10172c'],
        teal:['#2b6d74','#092d36','#23545d','#081b28'],
        red:['#855068','#371722','#71374b','#221020'],
        silver:['#4b7794','#16263c','#29516c','#0b1828']
      }[metal] || ['#315775','#0a1a2d','#203f5a','#071525'];
      const top=grad(x+sx,y-sy,w,h*.3,palette[0],palette[1]);
      path([[x,y],[x+sx,y-sy],[x+w+sx,y-sy],[x+w,y]],top,'#567d99');
      const sideX = dir>0 ? x+w:x;
      path([[sideX,y],[sideX+sx,y-sy],[sideX+sx,y+h-sy],[sideX,y+h]],
        grad(sideX,y,Math.abs(sx),h,palette[2],palette[3]),'#3f6682');
      rect(x,y,w,h,grad(x,y,w,h,palette[2],palette[3]),'#4785ab',.007);
      line(x+.02,y+.016,x+w-.02,y+.016,'rgba(160,235,255,.42)',.009);
      return {x,y,w,h,sx,sy};
    }
    function plate(x,y,w,h,metal='blue') {
      cube(x,y,w,h,metal,.5);
      rect(x+.04,y+.03,w-.08,Math.max(.035,h-.06),'#091c30','#2b5870');
    }
    function ports(x,y,n,step=.096) {
      for(let i=0;i<n;i++){
        const px=x+i*step;
        rect(px,y,step*.69,.075,'#04101c','#3b91ad',.005);
        rect(px+.014,y+.015,step*.42,.019,'#142d46');
        dot(px+.014,y-.026,.009,i%4===1?'#ffc06d':green);
      }
    }
    function screen(x,y,w,h) {
      rect(x,y,w,h,grad(x,y,w,h,'#14496c','#020b1d'),'#18bce7',.01);
      // diagonal reflection / generated visual telemetry (no textures)
      path([[x+.018,y+.02],[x+w*.46,y+.02],[x+w*.27,y+h*.95],[x+.016,y+h*.95]],
        lite?'rgba(12,97,149,.24)':'rgba(70,191,253,.14)');
      for(let i=0;i<3;i++)line(x+w*.18,y+h*(.5+i*.1),x+w*(.66-i*.07),y+h*(.42+i*.11),i===1?green:neon,.01);
    }
    // All 18 icon families use solid geometry (not a flat line-icon fallback).
    switch(type){
      case 'servidor':{
        cube(-.285,-.37,.55,.72,'silver');
        rect(-.236,-.32,.45,.61,'#061326','#416b87');
        for(let i=0;i<5;i++){
          const y=-.27+i*.113;
          plate(-.215,y,.41,.093,'blue');
          for(let j=0;j<3;j++)line(-.10,y+.02+j*.018,.12,y+.02+j*.018,'#396889',.008);
          dot(-.157,y+.046,.014,i===3?'#ffb66b':green);
        }
        line(-.215,.305,.195,.305,neon,.012);
        dot(.16,-.43,.029,'#ffb969');
        break;
      }
      case 'pc':case 'laptop':{
        // Upright monitor and a thick physical keyboard/laptop base.
        cube(-.31,-.35,.62,.43,'silver',.55);
        screen(-.264,-.31,.53,.343);
        cube(-.37,.145,.74,.13,'blue',.55);
        path([[-.37,.145],[.37,.145],[.47,.25],[-.43,.25]],'#274763','#559bbb',.006);
        for(let r=0;r<3;r++)for(let i=0;i<7;i++)rect(-.30+i*.09,.165+r*.028,.055,.012,'#83aec8');
        rect(-.12,.245,.24,.018,'#17344f');
        break;
      }
      case 'switch':case 'hub':{
        cube(-.405,-.035,.79,.245,'teal',.85);
        ports(-.345,.075,type==='hub'?5:7,.095);
        rect(-.315,.035,.49,.017,'#27617b');
        break;
      }
      case 'roteador':{
        for(let x of [-.295,.255]){
          line(x,-.12,x+(x<0?-.03:.03),-.435,'#bedcfa',.027);
          dot(x+(x<0?-.03:.03),-.437,.014,neon);
        }
        cube(-.38,-.045,.72,.25,'purple',.8);
        for(let i=0;i<5;i++)dot(-.25+i*.115,.105,.013,i===0?green:violet);
        c.strokeStyle=violet;c.lineWidth=.014;c.beginPath();c.ellipse(0,-.011,.16,.068,0,0,TAU);c.stroke();
        line(-.12,-.016,.12,-.016,violet,.009);
        break;
      }
      case 'firewall':{
        cube(-.275,-.35,.55,.68,'red');
        for(let j=0;j<5;j++)for(let i=0;i<2;i++){
          rect(-.234+i*.233+(j%2)*.029,-.31+j*.13,.195,.092,'#50283d','#aa6b78',.006);
        }
        path([[0,-.17],[.125,-.12],[.12,.02],[0,.17],[-.12,.02],[-.125,-.12]],'#b83859','#ffc0c8');
        line(-.045,-.012,-.009,.025,'#fff',.019);line(-.009,.025,.057,-.071,'#fff',.019);
        break;
      }
      case 'nuvem':{
        // Extruded cloudy volume over a metallic connection node.
        cube(-.36,.15,.72,.125,'blue',.5);
        for(let j=1;j>=0;j--){
          const down=j*.07;
          for(const [x,y,r] of [[-.2,-.015,.15],[-.02,-.12,.19],[.20,-.012,.155]]){
            c.fillStyle=j?'#0c385b':grad(x-r,y-r,r*2,r*2,'#77dcfa','#16517c');
            c.beginPath();c.arc(x,y+down,r,0,TAU);c.fill();
          }
          rect(-.25,.025+down,.50,.125,j?'#124060':'#2877a0');
        }
        line(-.24,.04,.26,.04,'rgba(187,243,255,.7)',.013);
        break;
      }
      case 'ap':{
        cube(-.36,.08,.71,.19,'teal',.6);
        c.strokeStyle=neon;c.lineWidth=.019;
        for(let i=0;i<3;i++){c.beginPath();c.arc(0,.014,.072+i*.068,Math.PI*1.25,Math.PI*1.75);c.stroke();}
        dot(0,-.02,.016,green);break;
      }
      case 'celular':{
        cube(-.204,-.37,.40,.71,'silver',.5);
        screen(-.167,-.324,.329,.555);
        dot(0,.283,.015,green);
        break;
      }
      case 'sensor':{
        cube(-.23,-.215,.46,.47,'teal');
        c.strokeStyle=neon;c.lineWidth=.018;
        for(let i=0;i<3;i++){c.beginPath();c.arc(0,-.035,.055+i*.071,0,TAU);c.stroke();}
        dot(0,-.035,.024,green);ports(-.15,.18,3,.13);break;
      }
      case 'lampada':{
        cube(-.17,.15,.34,.17,'silver');
        c.fillStyle='#ffeeaa';c.beginPath();c.ellipse(0,-.095,.22,.235,0,0,TAU);c.fill();
        c.strokeStyle='#ffdf72';c.lineWidth=.016;c.stroke();
        line(-.09,-.01,.09,-.01,'#dba346');break;
      }
      case 'camera':{
        cube(-.29,-.23,.46,.34,'silver');
        path([[.165,-.14],[.41,-.28],[.41,.17],[.165,.035]],'#254e6f','#64c4e6');
        c.fillStyle='#0b1d35';c.beginPath();c.arc(-.067,-.06,.116,0,TAU);c.fill();
        c.strokeStyle=neon;c.lineWidth=.027;c.stroke();dot(-.067,-.06,.029,'#81dffe');
        break;
      }
      case 'ar':{
        cube(-.40,-.21,.80,.31,'silver',.7);
        for(let j=0;j<4;j++)line(-.30,-.08+j*.055,.31,-.08+j*.055,'#6196af',.012);
        dot(.27,-.165,.02,green);break;
      }
      case 'pessoa':case 'espiao':{
        cube(-.34,.24,.69,.14,type==='espiao'?'red':'blue',.5);
        c.fillStyle=type==='espiao'?'#a56b93':'#89d9ff';
        c.beginPath();c.arc(0,-.232,.117,0,TAU);c.fill();
        path([[-.28,.194],[-.24,.065],[-.13,-.063],[.13,-.063],[.24,.065],[.28,.194]],
          type==='espiao'?'#482940':'#285779','#58b0d3');
        if(type==='espiao'){
          rect(-.116,-.260,.23,.052,'#080e25');
          path([[-.20,-.335],[.20,-.335],[.265,-.278],[-.265,-.278]],'#1a1c31');
        }
        break;
      }
      case 'controlador':{
        cube(-.35,-.25,.70,.52,'purple');
        c.strokeStyle=violet;c.lineWidth=.03;
        for(let i=0;i<6;i++){
          const a=i*TAU/6;line(0,0,Math.cos(a)*.23,Math.sin(a)*.17,violet,.019);
          dot(Math.cos(a)*.24,Math.sin(a)*.18,.031,neon);
        }
        dot(0,0,.065,green);break;
      }
      case 'globo':{
        cube(-.34,.22,.68,.12,'blue',.6);
        c.beginPath();c.arc(0,-.085,.285,0,TAU);c.fillStyle=grad(-.25,-.3,.5,.5,'#3989bf','#0b274d');c.fill();
        c.strokeStyle='#69c7ed';c.lineWidth=.019;c.stroke();
        c.beginPath();c.ellipse(0,-.085,.11,.284,0,0,TAU);c.stroke();
        line(-.28,-.085,.28,-.085,neon,.017);break;
      }
      default: {
        cube(-.30,-.30,.60,.60,'blue');dot(0,0,.10,green);break;
      }
    }
    // Physically grounded metal plinth: tiny front bevel under each model.
    path([[-.39,.35],[.40,.35],[.48,.42],[-.45,.42]],'#183b59','#4aa5c5',.007);
    line(-.40,.375,.40,.375,'rgba(58,222,252,.54)',.012);
    return canvas;
  }
  function getSprite(type,view,lite) {
    const key = `${type}:${view}:${lite?1:0}`;
    if(!cache.has(key)){
      if(cache.size >= 85)cache.clear(); // bounded GPU memory on low-end mobile
      cache.set(key,build(type,view,lite));
    }
    return cache.get(key);
  }
  function paint(c,type,x,y,size,view=1,offline=false){
    if(!TYPES.has(type))return false;
    const q = Math.max(-2,Math.min(2,Math.round(view)));
    const sprite=getSprite(type,q,light());
    const len=size*1.44;
    c.save();
    if(offline)c.globalAlpha=.45;
    c.drawImage(sprite,x-len/2,y-len*.51,len,len);
    c.restore();return true;
  }
  function preview(label=''){
    const host=document.createElement('div');host.className='rv3d-preview';
    const header=document.createElement('div');header.className='rv3d-preview-heading';
    header.innerHTML='<span><b>REDE 3D AO VIVO</b> <small>PC → SWITCH → ROTEADOR → WEB</small></span>';
    const btn=document.createElement('button');btn.type='button';btn.textContent='Explorar transmissão →';
    btn.addEventListener('click',()=>window.RedesVivas?.App?.abrir('pagina-web'));
    header.append(btn);
    const cv=document.createElement('canvas');cv.className='rv3d-preview-canvas';cv.setAttribute('role','img');
    cv.setAttribute('aria-label','Prévia animada da rede 3D: computador, switch, roteador e servidor');
    host.append(header,cv);
    const c=cv.getContext('2d');let last=0,start=0;
    function frame(now){
      requestAnimationFrame(frame);
      if(document.hidden || !host.isConnected || !host.getClientRects().length || now-last<36)return;
      last=now;
      const rect=cv.getBoundingClientRect();const w=Math.max(270,rect.width), h= Math.max(130,rect.height);
      const dpr=Math.min(devicePixelRatio||1,1.35);
      if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)) {cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
      c.setTransform(dpr,0,0,dpr,0,0);
      c.clearRect(0,0,w,h);
      const grad=c.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#0a2545');grad.addColorStop(1,'#051027');
      c.fillStyle=grad;c.fillRect(0,0,w,h);
      const xs=[.13,.37,.62,.85].map(v=>w*v), cy=h*.56;
      const sz=Math.min(90,w/5.7,h*.72);
      c.strokeStyle='#1d729f';c.lineWidth=3;c.beginPath();c.moveTo(xs[0],cy);for(let i=1;i<4;i++)c.lineTo(xs[i],cy);c.stroke();
      for(let i=0;i<4;i++){
        c.beginPath();c.ellipse(xs[i],cy+sz*.35,sz*.48,sz*.12,0,0,TAU);c.strokeStyle='rgba(30,216,250,.40)';c.lineWidth=1.6;c.stroke();
        paint(c,['laptop','switch','roteador','servidor'][i],xs[i],cy,sz,1,false);
      }
      if(!reduced()&&!light()){
        const k=((now-start||0)%3300)/3300*3;
        const seg=Math.min(2,Math.floor(k)),alpha=k-seg;
        const x=xs[seg]+(xs[seg+1]-xs[seg])*alpha;
        c.fillStyle='#6cfdc2';c.shadowColor='#17e4ff';c.shadowBlur=9;
        c.beginPath();c.arc(x,cy,4,0,TAU);c.fill();c.shadowBlur=0;
      }
    }
    start=performance.now();requestAnimationFrame(frame);
    return host;
  }
  window.RedesVivas3D={paint,preview,types:TYPES,clear:()=>cache.clear(),version:'lab3d-2.0'};
})();
