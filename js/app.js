(function () {
'use strict';
/* ==========================================================================
   1. MOTOR — desenha a rede no <canvas> e anima os pacotes.
      Todas as abas usam as mesmas peças: nós (equipamentos), cabos,
      pacotes e efeitos. O tempo da animação é "virtual": ele só anda
      quando o relógio está ligado, e anda mais rápido ou mais devagar
      conforme o controle de Velocidade. É isso que faz Pausar funcionar.
   ========================================================================== */

const CFG = window.REDES_VIVAS || {};
const TAU = Math.PI * 2;
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const misturar = (a, b, k) => a + (b - a) * k;
const suave = k => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const saida = k => 1 - Math.pow(1 - k, 3);
const sortear = (a, b) => a + Math.random() * (b - a);
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/* Cria um elemento HTML: h('button', {class:'btn', onclick: f}, 'Texto') */
function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  return el;
}

/* ---------- Tema (claro/escuro): o canvas lê as cores das variáveis CSS ---------- */
const Tema = {
  _c: new Map(),
  cor(v) {
    if (!v) return '#888888';
    if (v[0] !== '-') return v;
    let c = this._c.get(v);
    if (c === undefined) {
      c = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888888';
      this._c.set(v, c);
    }
    return c;
  },
  limpar() { this._c.clear(); },
  ehEscuro() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  },
  alternar() {
    document.documentElement.setAttribute('data-theme', this.ehEscuro() ? 'light' : 'dark');
  },
  iniciar() {
    if (CFG.tema === 'claro') document.documentElement.setAttribute('data-theme', 'light');
    if (CFG.tema === 'escuro') document.documentElement.setAttribute('data-theme', 'dark');
    new MutationObserver(() => this.limpar()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const f = () => this.limpar();
      if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f);
    }
  }
};

/* Cor de texto (clara ou escura) que dá contraste sobre um fundo colorido. */
function corDeTexto(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.58 ? '#0B1220' : '#FFFFFF';
}

/* ---------- Som (opcional, começa desligado) ---------- */
const Som = {
  ligado: false, ctx: null, ultimo: 0,
  tocar(tipo) {
    if (!this.ligado) return;
    const agora = performance.now();
    if (agora - this.ultimo < 70) return;
    this.ultimo = agora;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const T = { chegou: [660, .07, 'sine'], perdido: [170, .16, 'sawtooth'], barrado: [120, .2, 'square'], acerto: [880, .14, 'triangle'], erro: [150, .22, 'sawtooth'] }[tipo] || [440, .05, 'sine'];
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = T[2]; o.frequency.value = T[0];
      g.gain.setValueAtTime(.05, c.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + T[1]);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + T[1] + .02);
    } catch (e) { /* sem áudio neste navegador: segue sem som */ }
  }
};

/* ---------- Cores dos pacotes: cada tipo tem uma cor fixa em todo o simulador ---------- */
const TIPOS = {
  dados: '--p-dados',     // verde: dados da aplicação (HTTP, mensagens)
  tcp: '--p-tcp',         // azul: controle (SYN, ACK, regras)
  dns: '--p-dns',         // laranja: DNS
  cripto: '--p-cripto',   // roxo: criptografado (HTTPS)
  udp: '--p-udp',         // ciano: UDP
  rede: '--p-rede',       // amarelo: ICMP (ping) e cópias de inundação
  ataque: '--p-ataque',   // vermelho: ataque ou erro
  bits: '--p-bits'        // cinza: bits no meio físico
};

/* ---------- Pequenos ajudantes de desenho ---------- */
function rr(c, x, y, w, hh, r) {
  r = Math.min(r, w / 2, hh / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + hh, r);
  c.arcTo(x + w, y + hh, x, y + hh, r);
  c.arcTo(x, y + hh, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function linha(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function seta(c, x1, y1, x2, y2, s) {
  s = s || .07;
  linha(c, x1, y1, x2, y2);
  const a = Math.atan2(y2 - y1, x2 - x1);
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - s * Math.cos(a - .5), y2 - s * Math.sin(a - .5));
  c.moveTo(x2, y2);
  c.lineTo(x2 - s * Math.cos(a + .5), y2 - s * Math.sin(a + .5));
  c.stroke();
}

/* ---------- Ícones dos equipamentos (desenhados à mão, dentro de um quadrado de lado 1) ---------- */
const ICONES = {
  pc(c) { rr(c, -.30, -.29, .60, .40, .05); c.stroke(); linha(c, 0, .11, 0, .23); linha(c, -.15, .25, .15, .25); },
  laptop(c) {
    rr(c, -.25, -.25, .50, .34, .04); c.stroke();
    c.beginPath(); c.moveTo(-.29, .09); c.lineTo(-.37, .22); c.lineTo(.37, .22); c.lineTo(.29, .09); c.stroke();
  },
  servidor(c, o) {
    for (let i = 0; i < 3; i++) {
      const y = -.31 + i * .215;
      rr(c, -.24, y, .48, .17, .04); c.stroke();
      c.save(); c.fillStyle = o.led; c.beginPath(); c.arc(-.15, y + .085, .03, 0, TAU); c.fill(); c.restore();
      linha(c, .0, y + .085, .15, y + .085);
    }
  },
  switch(c, o) {
    rr(c, -.37, -.16, .74, .32, .05); c.stroke();
    for (let i = 0; i < 5; i++) {
      const x = -.28 + i * .14;
      c.fillRect(x - .035, .01, .07, .07);
      c.save(); c.fillStyle = o.led; c.beginPath(); c.arc(x, -.07, .024, 0, TAU); c.fill(); c.restore();
    }
  },
  hub(c) {
    rr(c, -.37, -.16, .74, .32, .05); c.stroke();
    for (let i = 0; i < 4; i++) c.fillRect(-.275 + i * .16, .01, .07, .07);
    linha(c, -.10, -.07, .10, -.07);
  },
  roteador(c) {
    c.beginPath(); c.arc(0, 0, .31, 0, TAU); c.stroke();
    seta(c, -.04, 0, -.21, 0); seta(c, .04, 0, .21, 0);
    seta(c, 0, -.22, 0, -.05); seta(c, 0, .22, 0, .05);
  },
  firewall(c) {
    rr(c, -.32, -.27, .64, .54, .03); c.stroke();
    linha(c, -.32, -.09, .32, -.09); linha(c, -.32, .09, .32, .09);
    linha(c, 0, -.27, 0, -.09); linha(c, -.16, -.09, -.16, .09); linha(c, .16, -.09, .16, .09); linha(c, 0, .09, 0, .27);
  },
  nuvem(c) {
    c.beginPath();
    c.moveTo(-.20, .20);
    c.arc(-.20, .05, .15, Math.PI * .5, Math.PI * 1.5);
    c.arc(-.03, -.10, .18, Math.PI * 1.05, Math.PI * 1.85);
    c.arc(.19, .04, .16, Math.PI * 1.45, Math.PI * .5);
    c.closePath(); c.stroke();
  },
  ap(c) {
    rr(c, -.28, .09, .56, .17, .04); c.stroke();
    linha(c, 0, .09, 0, -.04);
    for (const r of [.10, .19]) { c.beginPath(); c.arc(0, -.06, r, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); }
  },
  celular(c) { rr(c, -.16, -.31, .32, .62, .06); c.stroke(); linha(c, -.05, .22, .05, .22); },
  sensor(c) {
    rr(c, -.055, -.31, .11, .40, .055); c.stroke();
    c.beginPath(); c.arc(0, .18, .11, 0, TAU); c.fill();
    linha(c, .13, -.21, .21, -.21); linha(c, .13, -.09, .21, -.09);
  },
  lampada(c) { c.beginPath(); c.arc(0, -.07, .19, 0, TAU); c.stroke(); rr(c, -.08, .15, .16, .12, .03); c.stroke(); },
  camera(c) {
    rr(c, -.31, -.15, .42, .30, .05); c.stroke();
    c.beginPath(); c.moveTo(.11, -.05); c.lineTo(.30, -.15); c.lineTo(.30, .15); c.lineTo(.11, .05); c.stroke();
  },
  ar(c) {
    rr(c, -.33, -.22, .66, .25, .05); c.stroke();
    linha(c, -.22, -.05, .22, -.05);
    for (const x of [-.18, 0, .18]) linha(c, x, .11, x - .04, .26);
  },
  pessoa(c) {
    c.beginPath(); c.arc(0, -.12, .13, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(-.25, .27); c.quadraticCurveTo(0, -.05, .25, .27); c.stroke();
  },
  espiao(c) {
    ICONES.pessoa(c);
    c.fillRect(-.14, -.17, .28, .075);
    linha(c, -.22, -.25, .22, -.25);
    rr(c, -.12, -.36, .24, .11, .03); c.stroke();
  },
  controlador(c) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = TAU * i / 6 - Math.PI / 2, x = Math.cos(a) * .31, y = Math.sin(a) * .31;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath(); c.stroke();
    c.beginPath(); c.arc(0, 0, .08, 0, TAU); c.fill();
    for (let i = 0; i < 3; i++) {
      const a = TAU * i / 3 - Math.PI / 2;
      linha(c, Math.cos(a) * .11, Math.sin(a) * .11, Math.cos(a) * .23, Math.sin(a) * .23);
    }
  },
  globo(c) {
    c.beginPath(); c.arc(0, 0, .29, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(0, 0, .12, .29, 0, 0, TAU); c.stroke();
    linha(c, -.29, 0, .29, 0);
  }
};

/* ----- Equipment-specific 3D-style sprites on the lab canvas -----
   Coordinates are normalized to [-.5,.5] and stay inside existing hitboxes.
   These are original shaded vector models, not external WebGL assets. */
function equipamento3D(c, tipo, led, t) {
  const enabled = ['pc','laptop','switch','hub','roteador','servidor'].includes(tipo);
  if (!enabled) return false;
  c.save();
  const face=(coords,a,b,outline='rgba(93,191,239,.65)')=>{
    const g=c.createLinearGradient(0,-.42,.15,.4);g.addColorStop(0,a);g.addColorStop(1,b);
    c.beginPath();coords.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();
    c.fillStyle=g;c.fill();c.strokeStyle=outline;c.lineWidth=.014;c.stroke();
  };
  const l=(x,y,X,Y,tinta,wide=.019)=>{c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.strokeStyle=tinta;c.lineWidth=wide;c.stroke();};
  const dot=(x,y,tinta,size=.022)=>{c.beginPath();c.arc(x,y,size,0,Math.PI*2);c.fillStyle=tinta;c.fill();};
  const pulse = .55 + .45*Math.sin(t*.004);
  if(tipo==='servidor') {
    face([[-.23,-.38],[.23,-.38],[.32,-.46],[-.13,-.46]],'#41637e','#1b314c');
    face([[.23,-.38],[.32,-.46],[.32,.29],[.23,.38]],'#26405d','#091c31');
    face([[-.23,-.38],[.23,-.38],[.23,.38],[-.23,.38]],'#28435d','#081426');
    for(let j=0;j<4;j++){
      const y=-.30+j*.18;
      face([[-.18,y],[.18,y],[.18,y+.14],[-.18,y+.14]],'#1b3750','#081529','#345b77');
      dot(-.115,y+.075,j===1?led:'#29e3ac',.017);
      l(-.06,y+.063,.115,y+.063,'rgba(93,207,242,.48)',.013);
    }
  } else if(tipo==='laptop'||tipo==='pc') {
    face([[-.30,.03],[.29,.03],[.43,.28],[-.42,.28]],'#366481','#102d45');
    face([[-.31,-.32],[.33,-.32],[.33,.09],[-.31,.09]],'#32628a','#0b1c37');
    face([[-.275,-.28],[.286,-.28],[.286,.032],[-.275,.032]],'#0c4969','#04112b','#24b9ec');
    l(-.22,-.05,.19,-.20,'#21d0ff',.018);
    l(-.22,-.02,.11,-.02,'#56f8cd',.014);
    for(let k=0;k<5;k++)l(-.23+k*.09,.155,-.20+k*.09,.19,'rgba(120,208,246,.60)',.015);
  } else if(tipo==='roteador') {
    l(-.24,-.18,-.25,-.44,'#99beed',.038);l(.23,-.18,.28,-.44,'#99beed',.038);
    dot(-.25,-.44,'#a887ff',.027);dot(.28,-.44,'#a887ff',.027);
    face([[-.38,-.13],[.28,-.13],[.41,-.02],[-.24,-.02]],'#45647f','#152945');
    face([[.28,-.13],[.41,-.02],[.41,.22],[.28,.12]],'#152a44','#071426');
    face([[-.38,-.13],[.28,-.13],[.28,.12],[-.38,.12]],'#1c3855','#081528');
    for(let k=0;k<4;k++)dot(-.23+k*.12,.02,k===0?led:'#a68dff',.019);
  } else {
    face([[-.42,-.19],[.31,-.19],[.43,-.05],[-.29,-.05]],'#45708a','#12293f');
    face([[.31,-.19],[.43,-.05],[.43,.18],[.31,.08]],'#162e48','#071425');
    face([[-.42,-.19],[.31,-.19],[.31,.08],[-.42,.08]],'#224260','#071629');
    for(let k=0;k<5;k++) {
      face([[-.33+k*.13,-.105],[-.24+k*.13,-.105],[-.24+k*.13,-.006],[-.33+k*.13,-.006]],'#183c52','#010c1b','#327d99');
      dot(-.285+k*.13,-.14,k===2?led:'#30ebcb',.012*pulse+.005);
    }
  }
  c.restore();
  return true;
}

/* ---------- Palco: o <canvas> e o seu tamanho na tela ---------- */
class Palco {
  constructor(moldura, canvas) {
    this.moldura = moldura; this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.dpr = 1; this.u = 40; this.estreito = false;
    this.proporcao = .56;
  }
  ajustar() {
    const W = Math.max(280, Math.floor(this.moldura.clientWidth));
    const estreito = W < 560;
    let H;
    const minimo = this.minimo || 300;
    if (estreito) H = Math.round(limitar(W * .95, minimo, 430));
    else {
      H = Math.round(limitar(W * this.proporcao, minimo, 580));
      H = Math.min(H, Math.max(minimo + 20, window.innerHeight - 286));   // cabe na tela sem rolar
    }
    // Cap high-DPI rendering to protect mobile GPU and preserve interactivity.
    const dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.25 : 1.7);
    if (W === this.W && H === this.H && dpr === this.dpr) return false;
    this.W = W; this.H = H; this.dpr = dpr; this.estreito = estreito;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.height = H + 'px';
    this.u = limitar(Math.min(W / 17.5, H / 6.8), 27, 56);        // tamanho base dos ícones
    return true;
  }
}

/* ---------- Cena: tudo o que existe no palco em um cenário ---------- */
class Cena {
  constructor(lab, def) {
    this.lab = lab; this.def = def; this.palco = lab.palco; this.P = lab.P;
    this.nos = new Map(); this.cabos = []; this.zonas = [];
    this.pacotes = []; this.efeitos = []; this.baloes = []; this.areas = [];
    this.tweens = []; this.t = 0; this.E = {}; this.numPac = 0;
    this.sel = null; this.sobre = null;
  }

  /* ----- montagem da rede ----- */
  no(id, tipo, x, y, rotulo, o) {
    o = o || {};
    const n = {
      id, tipo, fx: x, fy: y, mx: o.mx, my: o.my, rotulo: rotulo || '', sub: o.sub || '', cor: o.cor || null,
      desligado: false, brilho: 0, tam: o.tam || 1, info: o.info || null, clicavel: !!o.clicavel,
      oculto: !!o.oculto, acima: !!o.acima, selo: o.selo || '', dica: o.dica || ''
    };
    this.nos.set(id, n);
    return n;
  }
  cabo(a, b, o) {
    o = o || {};
    const cb = { id: a + '~' + b, a, b, estilo: o.estilo || 'cabo', rotulo: o.rotulo || '', cortavel: !!o.cortavel, cortado: false, disfarce: false, larg: o.larg || 3, cor: o.cor || null };
    this.cabos.push(cb);
    return cb;
  }
  zona(rotulo, x0, y0, x1, y1, o) { this.zonas.push(Object.assign({ rotulo, x0, y0, x1, y1 }, o || {})); }
  caboEntre(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return null;
    return this.cabos.find(c => (c.a === a && c.b === b) || (c.a === b && c.b === a)) || null;
  }

  /* liga/desliga o cabo entre dois equipamentos (usado pelos roteiros) */
  cortar(a, b, valor) { const cb = this.caboEntre(a, b); if (cb && cb.cortado !== !!valor) this.lab.alternarCabo(cb, valor); return cb; }

  /* ----- coordenadas: as posições são frações (0 a 1) do palco ----- */
  px(fx, fy) {
    const p = this.palco, u = p.u, ml = u * .8 + 8, mt = u * .62 + 10, mb = u * .62 + 32;
    return { x: ml + fx * (p.W - 2 * ml), y: mt + fy * (p.H - mt - mb) };
  }
  pos(n) {
    if (typeof n === 'string') n = this.nos.get(n);
    const e = this.palco.estreito;
    return this.px(e && n.mx != null ? n.mx : n.fx, e && n.my != null ? n.my : n.fy);
  }
  ponto(p) { return typeof p === 'string' ? this.pos(p) : (typeof p === 'function' ? p() : this.px(p.x, p.y)); }
  get velBase() { return this.palco.W * 0.00042; }   // pixels por milissegundo virtual

  /* ----- tempo: esperar e animar (só andam quando o relógio anda) ----- */
  esperar(ms) { return new Promise(res => this.tweens.push({ t0: this.t, dur: ms, res })); }
  animar(ms, fn, curva) { return new Promise(res => this.tweens.push({ t0: this.t, dur: ms, fn, curva, res })); }

  /* ----- pacotes ----- */
  enviar(o) {
    const pk = {
      id: ++this.numPac, rotulo: o.rotulo || '', tipo: o.tipo || 'dados', dados: o.dados || {},
      caminho: o.caminho.slice(), seg: 0, k: 0, vel: o.vel || 1, durSeg: o.durSeg || 0,
      pausa: o.atraso || 0, pausaNo: o.pausaNo == null ? 110 : o.pausaNo,
      manter: !!o.manter, parado: false, vivo: true, nasc: this.t, alfa: 1,
      cadeado: !!o.cadeado, desvio: o.desvio == null ? 9 : o.desvio, mini: !!o.mini, mudo: !!o.mudo,
      aoSaltar: o.aoSaltar || null, perderEm: o.perderEm || null, meta: o.meta || {}, rastro: [], res: null
    };
    const p = new Promise(res => { pk.res = res; });
    p.pac = pk;
    this.pacotes.push(pk);
    return p;
  }
  /* continua a viagem de um pacote que estava parado em um equipamento */
  seguir(pk, caminho, o) {
    o = o || {};
    pk.parado = false; pk.manter = !!o.manter; pk.caminho = caminho.slice(); pk.seg = 0; pk.k = 0; pk.pausa = 0;
    if (o.rotulo) pk.rotulo = o.rotulo;
    if (o.tipo) pk.tipo = o.tipo;
    if (o.aoSaltar !== undefined) pk.aoSaltar = o.aoSaltar;
    if (o.durSeg !== undefined) pk.durSeg = o.durSeg;
    pk.perderEm = o.perderEm || null;
    const p = new Promise(res => { pk.res = res; });
    p.pac = pk;
    return p;
  }
  tirar(pk) { const i = this.pacotes.indexOf(pk); if (i >= 0) this.pacotes.splice(i, 1); }
  /* pacote parado é entregue (some com um anel) */
  entregar(pk) {
    if (!pk || !pk.vivo) return;
    const p = this.posPacote(pk);
    pk.vivo = false; this.tirar(pk);
    this.fx('anel', p.x, p.y, { cor: TIPOS[pk.tipo] });
  }
  /* pacote se perde (X vermelho) */
  matar(pk, motivo) {
    if (!pk || !pk.vivo) return;
    this.fimPacote(pk, { ok: false, motivo: motivo || 'perdido' });
  }
  /* pacote é barrado por um equipamento (escudo) */
  barrar(pk) {
    if (!pk || !pk.vivo) return;
    const p = this.posPacote(pk);
    pk.vivo = false; this.tirar(pk);
    this.fx('escudo', p.x, p.y, { dur: 800 }); this.fx('faisca', p.x, p.y, { cor: '--p-ataque' });
    Som.tocar('barrado');
    const res = pk.res; pk.res = null;
    if (res) res({ ok: false, motivo: 'barrado', pac: pk });
  }
  emVoo(filtro) { return this.pacotes.filter(p => p.vivo && !p.parado && (!filtro || filtro(p))); }

  fimPacote(pk, r) {
    r.pac = pk;
    const p = this.posPacote(pk);
    if (r.ok) {
      if (pk.manter) pk.parado = true;
      else {
        pk.vivo = false; this.tirar(pk);
        if (!pk.mudo) { this.fx('anel', p.x, p.y, { cor: TIPOS[pk.tipo] }); Som.tocar('chegou'); }
      }
    } else {
      pk.vivo = false; this.tirar(pk);
      if (!pk.mudo) {
        this.fx('xis', p.x, p.y); this.fx('faisca', p.x, p.y, { cor: '--p-ataque' });
        Som.tocar('perdido');
      }
    }
    const res = pk.res; pk.res = null;
    if (res) res(r);
  }

  avancarPacote(pk, dt) {
    if (pk.parado || !pk.vivo) return;
    if (pk.pausa > 0) { pk.pausa -= dt; return; }
    const a = pk.caminho[pk.seg], b = pk.caminho[pk.seg + 1];
    const A = this.ponto(a), B = this.ponto(b);
    const dist = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    pk.k += pk.durSeg ? dt / pk.durSeg : (this.velBase * pk.vel * dt) / dist;
    const cb = this.caboEntre(a, b);
    if (cb && cb.cortado && pk.k >= .46) { pk.k = .46; this.fimPacote(pk, { ok: false, motivo: 'cabo', cabo: cb }); return; }
    if (pk.perderEm && pk.perderEm.seg === pk.seg && pk.k >= pk.perderEm.k) { this.fimPacote(pk, { ok: false, motivo: 'perdido' }); return; }
    if (pk.k < 1) return;
    const no = typeof b === 'string' ? this.nos.get(b) : null;
    if (no && no.desligado) { pk.k = .93; this.fimPacote(pk, { ok: false, motivo: 'no', no }); return; }
    if (pk.seg >= pk.caminho.length - 2) {            // chegou ao fim do caminho
      pk.k = 1;
      if (no) no.brilho = 1;
      this.fimPacote(pk, { ok: true });
      return;
    }
    pk.seg++; pk.k = 0;
    if (no) no.brilho = 1;
    pk.pausa = pk.pausaNo;
    if (pk.aoSaltar) pk.aoSaltar(b, pk);
  }

  posPacote(pk) {
    const i = Math.min(pk.seg, pk.caminho.length - 2);
    const A = this.ponto(pk.caminho[i]), B = this.ponto(pk.caminho[i + 1]);
    const k = limitar(pk.k, 0, 1), dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const lado = Math.sin(Math.PI * k) * pk.desvio;   // desvia para o lado: ida e volta não se cruzam
    return { x: misturar(A.x, B.x, k) + (dy / d) * lado, y: misturar(A.y, B.y, k) - (dx / d) * lado };
  }

  /* ----- efeitos visuais ----- */
  fx(tipo, x, y, o) { this.efeitos.push(Object.assign({ tipo, x, y, t0: this.t, dur: 650 }, o || {})); }
  fxNo(tipo, id, o) { const p = this.pos(id); this.fx(tipo, p.x, p.y, o); }
  texto(id, txt, cor) { const p = this.pos(id); this.fx('texto', p.x, p.y - this.palco.u * .62, { texto: txt, cor: cor || '--ink', dur: 1500 }); }
  balao(id, txt, o) {
    o = o || {};
    this.baloes = this.baloes.filter(b => b.id !== id);
    if (txt) this.baloes.push({ id, txt: String(txt), t0: this.t, dur: o.dur == null ? 2600 : o.dur, cor: o.cor || null, baixo: !!o.baixo });
  }
  relogio(id, ms) { this.efeitos.push({ tipo: 'relogio', no: id, t0: this.t, dur: ms, x: 0, y: 0 }); return this.esperar(ms); }
  pulsar(id) { const n = this.nos.get(id); if (n) n.brilho = 1; }

  /* ----- atalhos para a interface ----- */
  log(html, o) { this.lab.registrar(html, o || {}, this); }
  explicar(titulo, html) { this.lab.explicar(titulo, html); }
  hud(html) { this.lab.hud(html); }

  /* ----- um quadro do tempo virtual ----- */
  avancar(dt) {
    this.t += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      const k = tw.dur <= 0 ? 1 : limitar((this.t - tw.t0) / tw.dur, 0, 1);
      if (tw.fn) tw.fn(tw.curva ? tw.curva(k) : k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
    for (const pk of this.pacotes.slice()) this.avancarPacote(pk, dt);
    for (const n of this.nos.values()) if (n.brilho > 0) n.brilho = Math.max(0, n.brilho - dt / 650);
    if (this.efeitos.length) this.efeitos = this.efeitos.filter(e => this.t - e.t0 < e.dur);
    if (this.baloes.length) this.baloes = this.baloes.filter(b => !b.dur || this.t - b.t0 < b.dur);
    if (this.def.tique) this.def.tique(this, dt);
  }

  /* ====================== DESENHO ====================== */
  desenhar() {
    const p = this.palco, c = p.ctx, W = p.W, H = p.H;
    c.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    this.F = { corpo: Tema.cor('--f-body'), mono: Tema.cor('--f-mono'), titulo: Tema.cor('--f-display') };
    this.areas.length = 0;
    // Perspective floor: lightweight vector lines instead of expensive texture assets.
    // The subtle grid is disabled in lightweight mode.
    if (!document.documentElement.classList.contains('fx-lite')) {
      c.save();
      c.strokeStyle = Tema.cor('--stage-dot');
      c.lineWidth = .6; c.globalAlpha = .35;
      const horizon = H * .22;
      for (let y = 0; y < 9; y++) {
        const t = (y / 8) ** 1.7;
        const gy = horizon + t * (H - horizon);
        c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
      }
      for (let x = -7; x <= 7; x++) {
        c.beginPath(); c.moveTo(W * .5 + x * 18, horizon);
        c.lineTo(W * .5 + x * W * .12, H); c.stroke();
      }
      c.restore();
    }
    for (const z of this.zonas) this.desZona(c, z);
    if (this.def.fundo) this.def.fundo(c, this);
    for (const cb of this.cabos) this.desCabo(c, cb);
    for (const n of this.nos.values()) this.desNo(c, n);
    if (this.def.desenho) this.def.desenho(c, this);
    for (const pk of this.pacotes) this.desPacote(c, pk);
    for (const e of this.efeitos) this.desEfeito(c, e);
    for (const b of this.baloes) this.desBalao(c, b);
  }

  desZona(c, z) {
    if (this.palco.estreito && z.mx0 != null) z = { rotulo: z.rotulo, x0: z.mx0, y0: z.my0, x1: z.mx1, y1: z.my1, cor: z.cor };
    const A = this.px(z.x0, z.y0), B = this.px(z.x1, z.y1), u = this.palco.u;
    const x = A.x - u * .82, y = A.y - u * .5 - 24, w = B.x - A.x + u * 1.64, hh = B.y - A.y + u + 24 + 36;
    c.save();
    c.fillStyle = Tema.cor(z.cor || '--zone'); c.globalAlpha = .55;
    rr(c, x, y, w, hh, 14); c.fill();
    c.globalAlpha = 1; c.strokeStyle = Tema.cor('--zone-line'); c.lineWidth = 1; c.setLineDash([5, 5]);
    rr(c, x, y, w, hh, 14); c.stroke();
    c.setLineDash([]);
    c.font = '600 11px ' + this.F.corpo; c.fillStyle = Tema.cor('--ink-2'); c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(z.rotulo, x + 9, y + 5);
    c.restore();
  }

  desCabo(c, cb) {
    const na = this.nos.get(cb.a), nb = this.nos.get(cb.b);
    if (!na || !nb || na.oculto || nb.oculto) return;
    const A = this.pos(na), B = this.pos(nb);
    cb.geo = { A, B };
    const cortado = cb.cortado && !cb.disfarce;
    const sobre = this.sobre === cb;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = Tema.cor(cb.cor || (cb.estilo === 'fibra' ? '--p-rede' : '--cable'));
    c.lineWidth = cb.larg + (sobre ? 2 : 0);
    if (cb.estilo === 'wifi') c.setLineDash([2, 7]);
    if (cb.estilo === 'controle') { c.setLineDash([6, 5]); c.lineWidth = 1.5; c.strokeStyle = Tema.cor('--p-tcp'); c.globalAlpha = .6; }
    if (!cortado && cb.estilo !== 'controle' && !document.documentElement.classList.contains('fx-lite')) {
      c.save(); c.globalAlpha = .16; c.lineWidth = cb.larg + 5;
      c.strokeStyle = Tema.cor(cb.cor || '--p-tcp');
      linha(c, A.x, A.y, B.x, B.y); c.restore();
    }
    if (cortado) {
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, g = 9 / d;
      c.globalAlpha = .55;
      linha(c, A.x, A.y, A.x + dx * (.5 - g), A.y + dy * (.5 - g));
      linha(c, A.x + dx * (.5 + g), A.y + dy * (.5 + g), B.x, B.y);
      c.globalAlpha = 1; c.setLineDash([]);
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      c.strokeStyle = Tema.cor('--bad'); c.lineWidth = 2.6;
      linha(c, mx - 5, my - 5, mx + 5, my + 5); linha(c, mx + 5, my - 5, mx - 5, my + 5);
    } else linha(c, A.x, A.y, B.x, B.y);
    c.restore();
    if (cb.rotulo) {
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      c.save();
      c.font = '600 10.5px ' + this.F.mono;
      const w = c.measureText(cb.rotulo).width + 10;
      c.fillStyle = Tema.cor('--stage'); c.globalAlpha = .92;
      rr(c, mx - w / 2, my - 19, w, 15, 4); c.fill();
      c.globalAlpha = 1; c.fillStyle = Tema.cor(cb.corRotulo || '--ink-2'); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(cb.rotulo, mx, my - 11);
      c.restore();
    }
  }

  desNo(c, n) {
    if (n.oculto) return;
    const p = this.pos(n), u = this.palco.u;
    if (n.tipo === 'junta') {
      c.fillStyle = Tema.cor('--cable'); c.beginPath(); c.arc(p.x, p.y, 4.5, 0, TAU); c.fill();
      n.caixa = null; return;
    }
    if (n.tipo === 'terminador') {
      c.fillStyle = Tema.cor('--ink-2'); rr(c, p.x - 5, p.y - 9, 10, 18, 3); c.fill();
      n.caixa = null; return;
    }
    const t = u * n.tam, tinta = Tema.cor(n.desligado ? '--ink-3' : (n.cor || '--node-ink'));
    c.save();
    const live = !n.desligado;
    const depth = Math.max(4, Math.min(11, t * .19));
    const x = p.x - t / 2, y = p.y - t / 2;
    // Perspective pedestal and visible top/right faces. All node hitboxes remain unchanged.
    c.save();
    c.globalAlpha = live ? .87 : .28;
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.beginPath(); c.ellipse(p.x, p.y + t * .66, t * .68, t * .2, 0, 0, TAU); c.fill();
    c.strokeStyle = live ? Tema.cor(n.cor || '--accent') : Tema.cor('--ink-3');
    c.lineWidth = live ? 1.8 : .8;
    c.beginPath(); c.ellipse(p.x, p.y + t * .61, t * .64, t * .17, 0, 0, TAU); c.stroke();
    c.restore();
    c.save();
    c.fillStyle = live ? '#132f50' : '#17202d';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + depth, y - depth);
    c.lineTo(x + t + depth, y - depth); c.lineTo(x + t, y);
    c.closePath(); c.fill();
    c.fillStyle = live ? '#102238' : '#131a25';
    c.beginPath(); c.moveTo(x + t, y); c.lineTo(x + t + depth, y - depth);
    c.lineTo(x + t + depth, y + t - depth); c.lineTo(x + t, y + t);
    c.closePath(); c.fill();
    c.strokeStyle = live ? Tema.cor(n.cor || '--p-tcp') : '#4b566a';
    c.lineWidth = 1; c.globalAlpha = .65;
    c.beginPath(); c.moveTo(x + 2, y); c.lineTo(x + depth + 2, y - depth);
    c.lineTo(x + t + depth, y - depth); c.stroke();
    c.restore();
    if (n.brilho > 0) {
      c.globalAlpha = n.brilho * .55; c.strokeStyle = Tema.cor(n.cor || '--accent'); c.lineWidth = 3;
      rr(c, p.x - t / 2 - 5, p.y - t / 2 - 5, t + 10, t + 10, t * .26 + 4); c.stroke();
      c.globalAlpha = 1;
    }
    const lite = document.documentElement.classList.contains('fx-lite');
    c.shadowColor = lite ? 'transparent' : 'rgba(0,193,255,.20)'; c.shadowBlur = lite ? 0 : 9; c.shadowOffsetY = 2;
    const front = c.createLinearGradient(x, y, x + t, y + t);
    if (n.desligado) { front.addColorStop(0, '#202735'); front.addColorStop(1, '#121723'); }
    else { front.addColorStop(0, '#172d4a'); front.addColorStop(.48, '#0a172a'); front.addColorStop(1, '#071020'); }
    c.fillStyle = front;
    rr(c, p.x - t / 2, p.y - t / 2, t, t, Math.min(10,t*.19)); c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = Tema.cor(n.desligado ? '--ink-3' : (n.cor || '--node-line')); c.lineWidth = n.cor ? 2 : 1.4;
    if (this.sobre === n) { c.strokeStyle = Tema.cor('--accent'); c.lineWidth = 2.4; }
    rr(c, p.x - t / 2, p.y - t / 2, t, t, Math.min(10,t*.19)); c.stroke();
    // Tiny edge highlight, cheaper than postprocessing bloom.
    c.save(); c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + 7, y + 5); c.lineTo(x + t - 7, y + 5); c.stroke(); c.restore();
    c.translate(p.x, p.y); c.scale(t, t);
    c.lineWidth = .055; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = tinta; c.fillStyle = tinta;
    if (!equipamento3D(c, n.tipo, Tema.cor(n.desligado ? '--ink-3' : '--ok'), this.t)) {
      (ICONES[n.tipo] || ICONES.pc)(c, { led: Tema.cor(n.desligado ? '--ink-3' : '--ok') });
    }
    c.restore();
    if (n.desligado) {
      c.save(); c.strokeStyle = Tema.cor('--bad'); c.lineWidth = 3; c.lineCap = 'round';
      linha(c, p.x - t * .3, p.y - t * .3, p.x + t * .3, p.y + t * .3); linha(c, p.x + t * .3, p.y - t * .3, p.x - t * .3, p.y + t * .3);
      c.restore();
    }
    if (n.selo) {
      c.save(); c.font = '700 9.5px ' + this.F.corpo;
      const w = c.measureText(n.selo).width + 9, cor = Tema.cor(n.corSelo || '--accent');
      c.fillStyle = cor; rr(c, p.x + t / 2 - w + 6, p.y - t / 2 - 8, w, 15, 7); c.fill();
      c.fillStyle = corDeTexto(cor); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(n.selo, p.x + t / 2 - w / 2 + 6, p.y - t / 2 - .5);
      c.restore();
    }
    // rótulo (nome) e segunda linha (endereço)
    const fs = this.palco.estreito ? 10.5 : 12;
    c.save();
    c.textAlign = 'center'; c.fillStyle = Tema.cor(n.desligado ? '--ink-3' : '--ink');
    if (n.acima) {
      c.textBaseline = 'bottom';
      let y = p.y - t / 2 - 5;
      if (n.sub) { c.font = (fs - 1.5) + 'px ' + this.F.mono; c.fillStyle = Tema.cor('--ink-2'); c.fillText(n.sub, p.x, y); y -= fs + 1; c.fillStyle = Tema.cor('--ink'); }
      c.font = '600 ' + fs + 'px ' + this.F.corpo; c.fillText(n.rotulo, p.x, y);
    } else {
      c.textBaseline = 'top';
      c.font = '600 ' + fs + 'px ' + this.F.corpo; c.fillText(n.rotulo, p.x, p.y + t / 2 + 5);
      if (n.sub) { c.font = (fs - 1.5) + 'px ' + this.F.mono; c.fillStyle = Tema.cor('--ink-2'); c.fillText(n.sub, p.x, p.y + t / 2 + 6 + fs + 1); }
    }
    c.restore();
    n.caixa = { x: p.x - t / 2, y: p.y - t / 2, w: t, h: t };
  }

  desPacote(c, pk) {
    const p = this.posPacote(pk), u = this.palco.u;
    const cor = Tema.cor(TIPOS[pk.tipo] || '--p-dados');
    const nasc = saida(limitar((this.t - pk.nasc) / 180, 0, 1));
    c.save();
    c.globalAlpha = pk.alfa;
    // rastro
    const r = pk.rastro, ult = r[r.length - 1];
    if (!ult || Math.hypot(ult.x - p.x, ult.y - p.y) > 7) { r.push({ x: p.x, y: p.y }); if (r.length > 5) r.shift(); }
    if (!pk.parado) {
      c.fillStyle = cor;
      for (let i = 0; i < r.length - 1; i++) { c.globalAlpha = pk.alfa * (i + 1) * .07; c.beginPath(); c.arc(r[i].x, r[i].y, 2 + i * .8, 0, TAU); c.fill(); }
      c.globalAlpha = pk.alfa;
    }
    const hh = pk.mini ? 15 : limitar(u * .46, 17, 22);
    c.font = '700 ' + (pk.mini ? 10 : (this.palco.estreito ? 10.5 : 11.5)) + 'px ' + this.F.corpo;
    const tw = c.measureText(pk.rotulo).width;
    const ww = Math.max(hh, tw + (pk.mini ? 8 : 14) + (pk.cadeado ? 13 : 0));
    c.translate(p.x, p.y); c.scale(nasc, nasc);
    c.shadowColor = 'rgba(10,20,40,.28)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
    c.fillStyle = cor; rr(c, -ww / 2, -hh / 2, ww, hh, hh / 2); c.fill();
    c.shadowColor = 'transparent';
    if (this.sel === pk) { c.strokeStyle = Tema.cor('--ink'); c.lineWidth = 2; rr(c, -ww / 2 - 3, -hh / 2 - 3, ww + 6, hh + 6, hh / 2 + 3); c.stroke(); }
    const tinta = corDeTexto(cor);
    c.fillStyle = tinta; c.textAlign = 'center'; c.textBaseline = 'middle';
    let tx = 0;
    if (pk.cadeado) {                      // cadeado: dados criptografados
      const lx = -ww / 2 + 10;
      c.fillRect(lx - 3.5, -1, 7, 6);
      c.strokeStyle = tinta; c.lineWidth = 1.5; c.beginPath(); c.arc(lx, -1.5, 2.6, Math.PI, 0); c.stroke();
      tx = 6;
    }
    c.fillText(pk.rotulo, tx, .5);
    c.restore();
    pk.caixa = { x: p.x - ww / 2, y: p.y - hh / 2, w: ww, h: hh };
  }

  desEfeito(c, e) {
    const k = limitar((this.t - e.t0) / e.dur, 0, 1);
    c.save();
    if (e.tipo === 'anel') {
      c.globalAlpha = 1 - k; c.strokeStyle = Tema.cor(e.cor || '--accent'); c.lineWidth = 3 * (1 - k) + 1;
      c.beginPath(); c.arc(e.x, e.y, 8 + saida(k) * 22, 0, TAU); c.stroke();
    } else if (e.tipo === 'xis') {
      const s = 7 * Math.min(1, k * 5);
      c.globalAlpha = k < .6 ? 1 : 1 - (k - .6) / .4; c.strokeStyle = Tema.cor('--bad'); c.lineWidth = 3.4; c.lineCap = 'round';
      linha(c, e.x - s, e.y - s, e.x + s, e.y + s); linha(c, e.x + s, e.y - s, e.x - s, e.y + s);
    } else if (e.tipo === 'faisca') {
      c.globalAlpha = 1 - k; c.fillStyle = Tema.cor(e.cor || '--bad');
      for (let i = 0; i < 8; i++) { const a = TAU * i / 8 + .4, d = 6 + saida(k) * 20; c.beginPath(); c.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 2.2 * (1 - k) + .6, 0, TAU); c.fill(); }
    } else if (e.tipo === 'texto') {
      c.globalAlpha = k < .7 ? 1 : 1 - (k - .7) / .3;
      c.font = '700 12px ' + this.F.corpo; c.textAlign = 'center'; c.textBaseline = 'bottom';
      const y = e.y - saida(k) * 18, w = c.measureText(e.texto).width + 12;
      c.fillStyle = Tema.cor('--stage'); rr(c, e.x - w / 2, y - 17, w, 19, 6); c.fill();
      c.fillStyle = Tema.cor(e.cor || '--ink'); c.fillText(e.texto, e.x, y - 1);
    } else if (e.tipo === 'escudo') {
      const s = 13 + saida(Math.min(1, k * 2.5)) * 7;
      c.globalAlpha = k < .6 ? 1 : 1 - (k - .6) / .4; c.translate(e.x, e.y);
      c.fillStyle = Tema.cor('--bad'); c.beginPath();
      c.moveTo(0, -s); c.lineTo(s * .8, -s * .6); c.lineTo(s * .8, s * .1); c.quadraticCurveTo(s * .7, s * .8, 0, s); c.quadraticCurveTo(-s * .7, s * .8, -s * .8, s * .1); c.lineTo(-s * .8, -s * .6); c.closePath(); c.fill();
      c.strokeStyle = '#FFFFFF'; c.lineWidth = 2.6; c.lineCap = 'round';
      linha(c, -s * .3, -s * .25, s * .3, s * .35); linha(c, s * .3, -s * .25, -s * .3, s * .35);
    } else if (e.tipo === 'certo') {
      const s = 7 * Math.min(1, k * 5);
      c.globalAlpha = k < .6 ? 1 : 1 - (k - .6) / .4; c.strokeStyle = Tema.cor('--ok'); c.lineWidth = 3.4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(e.x - s, e.y); c.lineTo(e.x - s * .25, e.y + s * .75); c.lineTo(e.x + s, e.y - s * .7); c.stroke();
    } else if (e.tipo === 'relogio') {
      const p = this.pos(e.no), r = this.palco.u * .5 + 9;
      c.strokeStyle = Tema.cor('--warn'); c.lineWidth = 3.5; c.lineCap = 'round';
      c.globalAlpha = .25; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
      c.globalAlpha = 1; c.beginPath(); c.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k)); c.stroke();
    }
    c.restore();
  }

  desBalao(c, b) {
    const n = this.nos.get(b.id);
    if (!n || n.oculto) return;
    const p = this.pos(n), t = this.palco.u * n.tam, W = this.palco.W;
    const linhas = b.txt.split('\n');
    c.save();
    c.font = '600 11.5px ' + this.F.corpo;
    const w = Math.max.apply(null, linhas.map(l => c.measureText(l).width)) + 16, hh = linhas.length * 15 + 9;
    const embaixo = b.baixo || p.y - t / 2 - hh - 12 < 2;
    const x = limitar(p.x - w / 2, 4, W - w - 4);
    const y = embaixo ? p.y + t / 2 + 34 : p.y - t / 2 - hh - 11;
    const k = b.dur ? limitar((this.t - b.t0) / b.dur, 0, 1) : 0;
    c.globalAlpha = Math.min(1, (this.t - b.t0) / 140) * (k > .88 ? (1 - k) / .12 : 1);
    const fundo = Tema.cor(b.cor || '--bubble');
    c.fillStyle = fundo; c.shadowColor = 'rgba(10,20,40,.22)'; c.shadowBlur = 8; c.shadowOffsetY = 2;
    rr(c, x, y, w, hh, 8); c.fill();
    c.shadowColor = 'transparent';
    c.beginPath();
    if (embaixo) { c.moveTo(p.x - 6, y + 1); c.lineTo(p.x, y - 7); c.lineTo(p.x + 6, y + 1); }
    else { c.moveTo(p.x - 6, y + hh - 1); c.lineTo(p.x, y + hh + 7); c.lineTo(p.x + 6, y + hh - 1); }
    c.fill();
    c.fillStyle = b.cor ? corDeTexto(fundo) : Tema.cor('--bubble-ink'); c.textAlign = 'left'; c.textBaseline = 'top';
    linhas.forEach((l, i) => c.fillText(l, x + 8, y + 6 + i * 15));
    c.restore();
  }

  /* ----- clique e passagem do mouse ----- */
  achar(x, y) {
    for (let i = this.pacotes.length - 1; i >= 0; i--) {
      const b = this.pacotes[i].caixa;
      if (b && x >= b.x - 7 && x <= b.x + b.w + 7 && y >= b.y - 7 && y <= b.y + b.h + 7) return { tipo: 'pacote', alvo: this.pacotes[i] };
    }
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return { tipo: 'area', alvo: a };
    }
    for (const n of this.nos.values()) {
      const b = n.caixa;
      if (b && !n.oculto && x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) return { tipo: 'no', alvo: n };
    }
    for (const cb of this.cabos) {
      if (!cb.cortavel || !cb.geo) continue;
      const { A, B } = cb.geo, dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy || 1;
      const k = limitar(((x - A.x) * dx + (y - A.y) * dy) / d2, 0, 1);
      if (Math.hypot(x - (A.x + k * dx), y - (A.y + k * dy)) < 10) return { tipo: 'cabo', alvo: cb };
    }
    return null;
  }
  /* área clicável extra, registrada pelo desenho de cada cenário a cada quadro */
  area(x, y, w, hh, aoClicar, dica) { this.areas.push({ x, y, w, h: hh, aoClicar, dica: dica || '' }); }
}

/* ==========================================================================
   2. LABORATÓRIO — a parte que se repete em toda aba:
      Rede viva (palco + controles), O que está acontecendo?, Experimente,
      Pacote em detalhe e Registro de eventos.
   ========================================================================== */

const ICO = {
  iniciar: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.2v11.6l9.4-5.8z" fill="currentColor"/></svg>',
  pausar: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3.4" y="2.5" width="3.3" height="11" rx="1" fill="currentColor"/><rect x="9.3" y="2.5" width="3.3" height="11" rx="1" fill="currentColor"/></svg>',
  proximo: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.6 2.4v11.2l7.6-5.6z" fill="currentColor"/><rect x="11" y="2.5" width="2.6" height="11" rx="1" fill="currentColor"/></svg>',
  reiniciar: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3V.8L4.8 3.6 8 6.4V4.5a3.5 3.5 0 1 1-3.4 4.4H3A5 5 0 1 0 8 3z" fill="currentColor"/></svg>'
};
const VELOCIDADES = [0.25, 0.5, 1, 1.5, 2, 3];

/* ---------- Avisos rápidos (somem sozinhos) ---------- */
const Avisos = {
  mostrar(texto, tipo) {
    const caixa = $('#avisos');
    if (!caixa) return;
    const el = h('div', { class: 'aviso' + (tipo ? ' aviso-' + tipo : ''), role: 'status' }, texto);
    caixa.append(el);
    while (caixa.children.length > 3) caixa.firstChild.remove();
    setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 350); }, 3600);
  }
};

/* ---------- Missões e pontuação ---------- */
const Missoes = {
  itens: [], pontos: 0, ouvintes: [],
  definir(id, titulo, pontos, aba) { this.itens.push({ id, titulo, pontos, aba, feita: false }); },
  feita(id) { const m = this.itens.find(x => x.id === id); return !!(m && m.feita); },
  concluir(id) {
    const m = this.itens.find(x => x.id === id);
    if (!m || m.feita) return false;
    m.feita = true;
    this.somar(m.pontos);
    Avisos.mostrar('Missão cumprida: ' + m.titulo + ' (+' + m.pontos + ' pontos)', 'ok');
    Som.tocar('acerto');
    return true;
  },
  somar(n) {
    this.pontos = Math.max(0, this.pontos + n);
    const el = $('#pontos');
    if (el) { el.textContent = this.pontos; el.parentNode.classList.remove('pulo'); void el.parentNode.offsetWidth; el.parentNode.classList.add('pulo'); }
    this.ouvintes.forEach(f => f());
  }
};

/* ---------- Construtor dos controles do painel "Experimente" ---------- */
class Ex {
  constructor(lab, el) { this.lab = lab; this.el = el; this.n = 0; }
  id() { return this.lab.aba.id + '-' + this.lab.def.id + '-e' + (++this.n); }
  nota(html) { const p = h('p', { class: 'ex-nota', html }); this.el.append(p); return p; }
  linha() { const d = h('div', { class: 'ex-linha' }); this.el.append(d); return d; }
  botao(txt, fn, o) {
    o = o || {};
    const b = h('button', { class: 'btn' + (o.classe ? ' ' + o.classe : ''), type: 'button', id: this.id(), onclick: () => fn() }, txt);
    (o.em || this.el).append(b);
    return b;
  }
  chave(txt, valor, fn, o) {
    const id = this.id(), inp = h('input', { type: 'checkbox', id, class: 'chave-inp' });
    inp.checked = !!valor;
    inp.addEventListener('change', () => fn(inp.checked));
    const el = h('label', { class: 'chave', for: id }, inp, h('span', { class: 'chave-trilho' }), h('span', { class: 'chave-txt' }, txt));
    ((o && o.em) || this.el).append(el);
    return { el, get: () => inp.checked, set: v => { inp.checked = !!v; } };
  }
  faixa(txt, o, fn) {
    const id = this.id(), fmt = o.fmt || (v => v);
    const val = h('output', { class: 'faixa-val', for: id });
    const inp = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.passo || 1, value: o.valor });
    const mostra = () => { val.textContent = fmt(+inp.value); };
    inp.addEventListener('input', () => { mostra(); fn(+inp.value); });
    mostra();
    const el = h('div', { class: 'faixa' }, h('label', { for: id }, txt), val, inp);
    this.el.append(el);
    return { el, get: () => +inp.value, set: v => { inp.value = v; mostra(); } };
  }
  escolha(txt, opcoes, valor, fn, o) {
    const id = this.id();
    const sel = h('select', { id }, opcoes.map(op => h('option', { value: op[0] }, op[1])));
    sel.value = valor;
    sel.addEventListener('change', () => fn(sel.value));
    const el = h('div', { class: 'campo' }, h('label', { for: id }, txt), sel);
    ((o && o.em) || this.el).append(el);
    return { el, get: () => sel.value, set: v => { sel.value = v; } };
  }
  campo(txt, valor, fn, o) {
    o = o || {};
    const id = this.id();
    const inp = h('input', { type: 'text', id, value: valor, maxlength: o.max || 40, autocomplete: 'off', spellcheck: 'false', placeholder: o.dica || '' });
    inp.addEventListener('input', () => fn(inp.value));
    const el = h('div', { class: 'campo' }, h('label', { for: id }, txt), inp);
    (o.em || this.el).append(el);
    return { el, inp, get: () => inp.value, set: v => { inp.value = v; } };
  }
}

/* ---------- O laboratório de uma aba ---------- */
class Lab {
  constructor(aba, raiz) {
    this.aba = aba; this.raiz = raiz;
    this.vel = 1; this.relogio = true; this.auto = false; this.ativo = false; this.fim = false;
    this.idx = 0; this.exec = 0; this.livres = 0; this.nLog = 0; this.ultimo = 0;
    this.montar();
    this.usarCenario(0);
  }

  montar() {
    const a = this.aba, id = a.id;
    this.elCen = h('div', { class: 'cenarios' });
    this.cv = h('canvas', { class: 'palco', role: 'img', 'aria-label': 'Animação da rede: ' + a.titulo });
    this.elHud = h('div', { class: 'hud', hidden: true });
    this.elMoldura = h('div', { class: 'moldura' }, this.cv, this.elHud);
    this.palco = new Palco(this.elMoldura, this.cv);
    this.elEstado = h('span', { class: 'estado' }, 'Pronto');
    this.elPasso = h('span', { class: 'passo-ind' });
    this.elPontos = h('span', { class: 'passo-pts', 'aria-hidden': 'true' });

    const bt = (nome, txt, dica, fn, classe) => h('button', { class: 'btn ' + (classe || ''), type: 'button', id: id + '-' + nome, title: dica, onclick: fn, html: ICO[nome] + '<span>' + txt + '</span>' });
    this.bIniciar = bt('iniciar', 'Iniciar', 'Iniciar ou continuar a animação (barra de espaço)', () => this.iniciar(), 'btn-pri');
    this.bPausar = bt('pausar', 'Pausar', 'Pausar a animação (barra de espaço)', () => this.pausar());
    this.bProximo = bt('proximo', 'Próximo passo', 'Avançar um passo de cada vez (seta para a direita)', () => this.proximo());
    this.bReiniciar = bt('reiniciar', 'Reiniciar', 'Voltar ao começo (tecla R)', () => this.reiniciar());
    this.elVelVal = h('output', { class: 'vel-val', for: id + '-vel' }, '1×');
    this.elVel = h('input', { type: 'range', id: id + '-vel', min: 0, max: VELOCIDADES.length - 1, step: 1, value: 2, title: 'Mais lento ou mais rápido (teclas - e +)' });
    this.elVel.addEventListener('input', () => this.mudarVel(+this.elVel.value));
    const transporte = h('div', { class: 'transporte' },
      h('div', { class: 'tr-botoes' }, this.bIniciar, this.bPausar, this.bProximo, this.bReiniciar),
      h('div', { class: 'tr-vel' }, h('label', { for: id + '-vel' }, 'Velocidade'), this.elVel, this.elVelVal));
    this.elLegenda = h('div', { class: 'legenda' });
    this.elExtra = h('section', { class: 'painel extra', hidden: true });

    this.elExpTit = h('h4', { class: 'exp-tit' });
    this.elExpTxt = h('div', { class: 'exp-txt' });
    this.elEx = h('div', { class: 'ex-corpo' });
    this.elInsp = h('div', { class: 'insp-corpo' });
    this.elLog = h('ol', { class: 'log' });

    const esquerda = h('div', { class: 'col-palco' },
      h('section', { class: 'painel painel-palco' },
        h('div', { class: 'painel-cab' }, h('h3', null, h('span', { class: 'parte' }, '1'), 'Rede viva'), this.elEstado, h('span', { class: 'passo-caixa' }, this.elPontos, this.elPasso)),
        this.elMoldura, transporte, this.elLegenda),
      this.elExtra);
    const direita = h('div', { class: 'col-lado' },
      h('section', { class: 'painel explica' }, h('h3', null, h('span', { class: 'parte' }, '2'), 'O que está acontecendo?'), this.elExpTit, this.elExpTxt),
      h('section', { class: 'painel experimente' }, h('h3', null, h('span', { class: 'parte' }, '3'), 'Experimente'), this.elEx),
      h('section', { class: 'painel inspetor' }, h('h3', null, 'Inspetor'), this.elInsp),
      h('section', { class: 'painel registro' }, h('h3', null, 'Registro de eventos'), this.elLog));

    this.raiz.append(
      h('header', { class: 'lab-cab' }, h('div', { class: 'lab-tit' }, h('h2', null, a.titulo), h('p', null, a.resumo)), this.elCen),
      h('div', { class: 'lab-grade' }, esquerda, direita));

    this.cv.addEventListener('click', ev => this.aoClicar(ev));
    this.cv.addEventListener('mousemove', ev => this.aoMover(ev));
    this.cv.addEventListener('mouseleave', () => { if (this.cena) this.cena.sobre = null; this.cv.style.cursor = ''; });
    if (window.ResizeObserver) new ResizeObserver(() => this.palco.ajustar()).observe(this.elMoldura);
  }

  /* troca de cenário dentro da aba (ex.: Switch / Roteador) */
  usarCenario(i) {
    const a = this.aba;
    this.iCen = i; this.def = a.cenarios[i];
    this.P = this.def.params ? this.def.params() : {};
    this.elCen.innerHTML = '';
    if (a.cenarios.length > 1) {
      this.elCen.append(h('span', { class: 'cen-rot' }, 'Cenário'));
      a.cenarios.forEach((c, j) => this.elCen.append(h('button', {
        class: 'cen' + (j === i ? ' ativo' : ''), type: 'button', id: a.id + '-cen-' + c.id, 'aria-pressed': j === i ? 'true' : 'false',
        onclick: () => { if (j !== this.iCen) this.usarCenario(j); }
      }, c.nome)));
    }
    this.elLegenda.innerHTML = '';
    (this.def.legenda || []).forEach(l => this.elLegenda.append(h('span', { class: 'leg' }, h('i', { style: 'background:var(' + TIPOS[l[0]] + ')' }), l[1])));
    this.palco.proporcao = this.def.proporcao || .56; this.palco.minimo = this.def.alturaMin || 300;
    this.palco.W = 0; this.palco.ajustar();
    this.elHud.setAttribute('data-pos', this.def.hudPos || 'ne');
    this.elExtra.innerHTML = ''; this.elExtra.hidden = !this.def.extra;
    this.elEx.innerHTML = '';
    this.cena = null; this.ex = null;
    this.reiniciar();
    if (this.def.extra) this.def.extra(this, this.elExtra);
    this.ex = new Ex(this, this.elEx);
    if (this.def.experimente) this.def.experimente(this.ex, this);
    if (this.def.aoReiniciar) this.def.aoReiniciar(this);
  }

  /* ----- os cinco controles obrigatórios ----- */
  iniciar() {
    if (this.livres) { Avisos.mostrar('Aguarde a ação atual terminar.'); return; }
    if (this.fim) this.reiniciar();
    this.auto = true; this.relogio = true;
    if (!this.ativo) this.rodarPasso(); else this.atualizar();
  }
  pausar() { this.relogio = false; this.atualizar(); }
  proximo() {
    if (this.livres) { Avisos.mostrar('Aguarde a ação atual terminar.'); return; }
    if (this.fim) { Avisos.mostrar('Este cenário chegou ao fim. Clique em Reiniciar para ver de novo.'); return; }
    this.auto = false; this.relogio = true;
    if (!this.ativo) this.rodarPasso(); else this.atualizar();
  }
  reiniciar() {
    this.exec++; this.ativo = false; this.auto = false; this.fim = false; this.idx = 0; this.livres = 0; this.relogio = true;
    this.hud('');
    this.cena = new Cena(this, this.def);
    this.def.montar(this.cena);
    this.elLog.innerHTML = ''; this.nLog = 0;
    this.limparInspetor();
    const it = this.def.intro || {};
    this.explicar(it.titulo || 'Pronto para começar', it.texto || 'Clique em <b>Iniciar</b> para ver a animação inteira ou em <b>Próximo passo</b> para ir devagar.');
    if (this.ex && this.def.aoReiniciar) this.def.aoReiniciar(this);
    this.atualizar();
  }
  mudarVel(i) {
    i = limitar(i, 0, VELOCIDADES.length - 1);
    this.elVel.value = i; this.vel = VELOCIDADES[i];
    this.elVelVal.textContent = String(this.vel).replace('.', ',') + '×';
  }

  /* roda um passo do roteiro; se estiver no modo automático, emenda no próximo */
  async rodarPasso() {
    const cena = this.cena, i = this.idx, passo = this.def.passos[i], exec = ++this.exec;
    if (!passo) return;
    this.ativo = true;
    this.explicar(passo.titulo, typeof passo.texto === 'function' ? passo.texto(cena) : passo.texto);
    this.registrar('<b>Passo ' + (i + 1) + ':</b> ' + esc(passo.titulo), { marco: true }, cena);
    this.atualizar();
    let r;
    try { r = await passo.rodar(cena); }
    catch (erro) { console.error(erro); Avisos.mostrar('Algo deu errado neste passo. Clique em Reiniciar.', 'erro'); }
    if (cena !== this.cena || exec !== this.exec) return;        // reiniciaram no meio do passo
    this.ativo = false; this.idx = i + 1;
    if (r === 'fim' || this.idx >= this.def.passos.length) {
      this.fim = true; this.auto = false; this.atualizar();
      this.registrar('Fim do cenário. Use o painel Experimente ou clique em Reiniciar.', { marco: true }, cena);
      return;
    }
    this.atualizar();
    if (!this.auto) return;
    await cena.esperar(700);
    if (cena !== this.cena || exec !== this.exec || !this.auto || this.ativo) return;
    this.rodarPasso();
  }

  /* ação livre disparada pelo painel Experimente (fora do roteiro) */
  async livre(fn, o) {
    if (this.ativo) { Avisos.mostrar('Espere o passo atual terminar, ou clique em Reiniciar.'); return; }
    if (this.livres && !(o && o.junto)) { Avisos.mostrar('Aguarde a ação atual terminar.'); return; }
    const cena = this.cena;
    this.livres++; this.relogio = true; this.atualizar();
    try { await fn(cena); }
    catch (erro) { console.error(erro); }
    if (cena === this.cena) { this.livres = Math.max(0, this.livres - 1); this.atualizar(); }
  }

  /* ----- painéis ----- */
  atualizar() {
    const n = this.def.passos.length;
    let txt = 'Pronto', cls = '';
    if (!this.relogio) { txt = 'Pausado'; cls = 'pausado'; }
    else if (this.ativo) { txt = this.auto ? 'Rodando' : 'Passo a passo'; cls = 'rodando'; }
    else if (this.livres) { txt = 'Modo livre'; cls = 'rodando'; }
    else if (this.fim) { txt = 'Fim'; cls = 'fim'; }
    this.elEstado.textContent = txt; this.elEstado.className = 'estado ' + cls;
    const atual = Math.min(n, this.idx + (this.ativo ? 1 : 0));
    this.elPasso.textContent = 'Passo ' + atual + ' de ' + n;
    this.elPontos.innerHTML = '';
    for (let i = 0; i < n; i++) this.elPontos.append(h('i', { class: i < this.idx ? 'feito' : (i === this.idx && this.ativo ? 'agora' : '') }));
    this.bPausar.disabled = !this.relogio;
    this.bProximo.disabled = this.fim;
    this.bIniciar.classList.toggle('ligado', this.auto && this.relogio && this.ativo);
  }
  explicar(titulo, html) {
    this.elExpTit.textContent = titulo || '';
    this.elExpTxt.innerHTML = html || '';
    const p = this.elExpTit.parentNode;
    p.classList.remove('novo'); void p.offsetWidth; p.classList.add('novo');
  }
  hud(html) { this.elHud.innerHTML = html || ''; this.elHud.hidden = !html; }
  registrar(html, o, cena) {
    if (cena && cena !== this.cena) return;
    const n = o.marco ? 0 : ++this.nLog, t = this.cena ? (this.cena.t / 1000).toFixed(1).replace('.', ',') + ' s' : '';
    const li = h('li', { class: 'log-l' + (o.marco ? ' marco' : '') + (o.pac ? ' clicavel' : '') + (o.ruim ? ' ruim' : '') + (o.bom ? ' bom' : '') },
      h('span', { class: 'log-n' }, o.marco ? '' : n),
      h('span', { class: 'log-t' }, o.marco ? '' : t),
      h('i', { class: 'log-p', style: (o.tipo || o.pac) ? 'background:var(' + TIPOS[o.tipo || o.pac.tipo] + ')' : '' }),
      h('span', { class: 'log-x', html }));
    if (o.pac) { li.title = 'Clique para ver este pacote em detalhe'; li.addEventListener('click', () => { this.cena.sel = o.pac; this.inspecionarPacote(o.pac); }); }
    this.elLog.append(li);
    while (this.elLog.children.length > 220) this.elLog.firstChild.remove();
    this.elLog.scrollTop = this.elLog.scrollHeight;
  }
  limparInspetor() {
    this.elInsp.innerHTML = '';
    this.elInsp.append(h('p', { class: 'insp-vazio', html: this.def.dicaInspetor || 'Clique em um <b>pacote</b> ou em um <b>equipamento</b> para ver os detalhes. Dica: pause a animação para clicar com calma.' }));
  }
  inspecionar(titulo, pares, o) {
    o = o || {};
    this.elInsp.innerHTML = '';
    const cab = h('div', { class: 'insp-cab' });
    if (o.tipo) { const cor = Tema.cor(TIPOS[o.tipo]); cab.append(h('span', { class: 'pilula', style: 'background:' + cor + ';color:' + corDeTexto(cor) }, titulo)); }
    else cab.append(h('strong', null, titulo));
    if (o.sub) cab.append(h('span', { class: 'insp-sub' }, o.sub));
    this.elInsp.append(cab);
    if (pares && pares.length) this.elInsp.append(h('dl', { class: 'insp-lista' }, pares.map(p => [h('dt', null, p[0]), h('dd', { html: esc(p[1]) })])));
    if (o.nota) this.elInsp.append(h('p', { class: 'insp-nota', html: o.nota }));
  }
  inspecionarPacote(pk) {
    this.inspecionar(pk.rotulo, Object.entries(pk.dados || {}), { tipo: pk.tipo, sub: 'pacote nº ' + pk.id, nota: pk.meta && pk.meta.nota });
  }

  /* ----- mouse no palco ----- */
  coord(ev) {
    const r = this.cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (this.palco.W / r.width), y: (ev.clientY - r.top) * (this.palco.H / r.height) };
  }
  aoMover(ev) {
    const p = this.coord(ev), a = this.cena.achar(p.x, p.y);
    let dica = '', mao = false;
    this.cena.sobre = null;
    if (a) {
      if (a.tipo === 'pacote') { mao = true; dica = 'Clique para ver o que este pacote carrega'; }
      else if (a.tipo === 'area') { mao = true; dica = a.alvo.dica; }
      else if (a.tipo === 'cabo') { mao = true; this.cena.sobre = a.alvo; dica = a.alvo.cortado ? 'Clique para religar o cabo' : 'Clique para desligar o cabo'; }
      else if (a.tipo === 'no') { mao = true; if (a.alvo.clicavel) this.cena.sobre = a.alvo; dica = a.alvo.dica || 'Clique para ver os dados do equipamento'; }
    }
    this.cv.style.cursor = mao ? 'pointer' : '';
    if (this.cv.title !== dica) this.cv.title = dica;
  }
  aoClicar(ev) {
    const p = this.coord(ev), a = this.cena.achar(p.x, p.y);
    if (!a) return;
    if (a.tipo === 'pacote') { this.cena.sel = a.alvo; this.inspecionarPacote(a.alvo); }
    else if (a.tipo === 'area') a.alvo.aoClicar();
    else if (a.tipo === 'cabo') this.alternarCabo(a.alvo);
    else if (a.tipo === 'no') {
      const n = a.alvo;
      if (n.clicavel && this.def.aoClicarNo && this.def.aoClicarNo(this.cena, n, this) !== false) return;
      const pares = n.info ? Object.entries(typeof n.info === 'function' ? n.info(this.cena) : n.info) : (n.sub ? [['Endereço', n.sub]] : []);
      this.inspecionar(n.rotulo || 'Equipamento', pares, { sub: 'equipamento' });
    }
  }
  /* liga ou desliga um cabo (clique no palco ou controle do Experimente) */
  alternarCabo(cb, valor) {
    cb.cortado = valor == null ? !cb.cortado : !!valor;
    const g = cb.geo;
    if (g) this.cena.fx('faisca', (g.A.x + g.B.x) / 2, (g.A.y + g.B.y) / 2, { cor: cb.cortado ? '--bad' : '--ok' });
    const nome = (this.cena.nos.get(cb.a).rotulo || cb.a) + ' – ' + (this.cena.nos.get(cb.b).rotulo || cb.b);
    this.registrar(cb.cortado ? 'Cabo <b>' + esc(nome) + '</b> foi desligado.' : 'Cabo <b>' + esc(nome) + '</b> foi religado.', cb.cortado ? { ruim: true } : { bom: true }, this.cena);
    if (this.def.aoCortar) this.def.aoCortar(this.cena, cb, this);
  }

  /* um quadro da animação (chamado pelo laço principal) */
  quadro(agora) {
    let dt = this.ultimo ? agora - this.ultimo : 16;
    this.ultimo = agora;
    dt = Math.min(dt, 60);
    if (!this.palco.W) this.palco.ajustar();
    if (this.relogio) this.cena.avancar(dt * this.vel);
    this.cena.desenhar();
  }
}

/* ==========================================================================
   3. ABAS — cada aba é um objeto que entra na lista ABAS.
      Uma aba tem um ou mais cenários. Cada cenário tem:
        montar(s)        -> cria os equipamentos e os cabos no palco
        passos[]         -> o roteiro: cada passo tem título, texto e rodar(s)
        experimente(ex)  -> os controles do painel "Experimente"
      Dentro de rodar(s), "await s.enviar(...)" manda um pacote e espera chegar.
   ========================================================================== */

const ABAS = [];

/* Endereços inventados, usados em várias abas (é uma simulação). */
const REDE = {
  pc: { ip: '192.168.0.10', mac: 'AA:11' },
  gw: { ip: '192.168.0.1', mac: 'EE:01', publico: '198.51.100.7' },
  dns: { ip: '8.8.8.8' },
  web: { ip: '203.0.113.10', nome: 'www.exemplo.com.br' }
};

/* Monta o HTML de uma tabela "viva" (tabela MAC, tabela de roteamento, regras...). */
function tabelaViva(titulo, colunas, linhas, vazio) {
  let html = '<table class="tv"><caption>' + esc(titulo) + '</caption><thead><tr>' + colunas.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
  if (!linhas.length) html += '<tr><td class="vazio" colspan="' + colunas.length + '">' + esc(vazio || 'vazia') + '</td></tr>';
  for (const l of linhas) html += '<tr class="' + (l.classe || '') + '">' + l.cels.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>';
  return html + '</tbody></table>';
}

/* Caixa de missão dentro do painel Experimente. */
function caixaMissao(ex, id) {
  const m = Missoes.itens.find(x => x.id === id);
  const el = h('div', { class: 'missao' });
  const pintar = () => {
    el.className = 'missao' + (m.feita ? ' feita' : '');
    el.innerHTML = '<b>' + (m.feita ? 'Missão cumprida' : 'Missão (' + m.pontos + ' pontos)') + '</b>' + esc(m.titulo);
  };
  pintar();
  Missoes.ouvintes.push(pintar);
  ex.el.append(el);
  return el;
}

/* ---------- ABA 1: INÍCIO — apresentação do projeto, guia de uso e um treino ---------- */
ABAS.push({
  id: 'inicio', num: 1, nome: 'Início', obrigatoria: true,
  titulo: 'Treino: seu primeiro pacote',
  resumo: 'Uma rede pequena para aprender os controles antes de explorar as outras abas.',

  montar(el, aba) {
    const nomes = (CFG.integrantes || []).filter(Boolean);
    const ficha = [['Disciplina', CFG.disciplina], ['Instituição', CFG.instituicao], ['Professor', CFG.professor], ['Turma', CFG.turma], ['Apresentação', CFG.apresentacao]].filter(p => p[1]);
    const capa = h('section', { class: 'painel ini-capa' },
      h('h1', null, CFG.projeto || 'Redes Vivas'),
      h('p', { class: 'ini-sub' }, CFG.subtitulo || ''),
      h('p', { class: 'ini-obj', html: '<b>Objetivo:</b> tornar a rede visível. Aqui os pacotes aparecem viajando, os equipamentos reagem e um painel explica, em português simples, o que acontece a cada passo. Quem nunca viu a matéria deve terminar de usar entendendo os conceitos.' }),
      h('h3', { class: 'ini-h' }, 'Integrantes'),
      h('ul', { class: 'ini-nomes' }, nomes.map(n => h('li', null, n))),
      h('dl', { class: 'ini-ficha' }, ficha.map(p => [h('dt', null, p[0]), h('dd', null, p[1])])),
      CFG.creditos ? h('p', { class: 'ini-cred' }, CFG.creditos) : null);

    const guia = h('section', { class: 'painel ini-guia' },
      h('h3', null, 'Como usar'),
      h('ol', null,
        h('li', { html: '<span><b>Escolha uma aba</b> na régua do topo. Cada aba ensina um conceito.</span>' }),
        h('li', { html: '<span>Clique em <b>Iniciar</b> para ver a animação inteira ou em <b>Próximo passo</b> para avançar um passo por vez. <b>Pausar</b> congela tudo, <b>Reiniciar</b> volta ao começo e <b>Velocidade</b> deixa mais lento ou mais rápido.</span>' }),
        h('li', { html: '<span>Leia o painel <b>O que está acontecendo?</b>. Ele muda a cada passo.</span>' }),
        h('li', { html: '<span><b>Clique em um pacote</b> para ver o que ele carrega: IP, porta, MAC. Pause antes para clicar com calma.</span>' }),
        h('li', { html: '<span>Use o painel <b>Experimente</b> para mudar a rede e provocar falhas: perder um pacote, desligar um cabo, bloquear uma porta.</span>' }),
        h('li', { html: '<span>Acompanhe o <b>Registro de eventos</b> e cumpra as <b>missões</b> para ganhar pontos.</span>' })),
      h('p', { class: 'ini-atalhos', html: 'Atalhos: <kbd>Espaço</kbd> inicia e pausa, <kbd>→</kbd> avança um passo, <kbd>R</kbd> reinicia, <kbd>+</kbd> e <kbd>-</kbd> mudam a velocidade, <kbd>Page Down</kbd> e <kbd>Page Up</kbd> trocam de aba.' }));

    const grupo = (titulo, lista) => h('div', { class: 'mapa-grupo' }, h('h4', null, titulo),
      h('div', { class: 'mapa' }, lista.map(a => h('button', { type: 'button', id: 'ir-' + a.id, onclick: () => App.abrir(a.id) },
        h('span', { class: 'm-num' }, String(ABAS.indexOf(a) + 1).padStart(2, '0')),
        h('span', { class: 'm-nome' }, a.nomeLongo || a.nome),
        h('span', { class: 'm-txt' }, a.mapa || a.resumo)))));
    const outras = ABAS.filter(a => a.id !== 'inicio');
    const mapa = h('section', { class: 'painel ini-mapa' }, h('h3', null, 'O que tem em cada aba'),
      grupo('Abas obrigatórias', outras.filter(a => a.obrigatoria)),
      grupo('Abas à escolha do grupo', outras.filter(a => !a.obrigatoria)));

    const lista = h('ul', { class: 'lista-missoes' });
    const pintar = () => {
      lista.innerHTML = '';
      for (const m of Missoes.itens) {
        const dona = ABAS.find(a => a.id === m.aba);
        lista.append(h('li', { class: m.feita ? 'feita' : '' }, h('i', { class: 'caixa' }),
          h('span', null, m.titulo, ' ', h('button', { type: 'button', onclick: () => App.abrir(m.aba) }, 'aba ' + (dona ? dona.nome : ''))),
          h('span', { class: 'pts' }, '+' + m.pontos)));
      }
    };
    pintar(); Missoes.ouvintes.push(pintar);
    const missoes = h('section', { class: 'painel ini-missoes' }, h('h3', null, 'Missões'),
      h('p', { class: 'ex-nota', style: 'margin-bottom:8px' }, 'Cada missão cumprida soma pontos no placar do topo. O quiz também vale pontos.'), lista);

    const labEl = h('div', { class: 'ini-lab' });
    el.append(h('div', { class: 'ini' }, h('div', { class: 'ini-topo' }, capa, guia)), labEl, h('div', { class: 'ini ini-fim' }, h('div', { class: 'ini-baixo' }, mapa, missoes)));
    aba.lab = new Lab(aba, labEl);
  },

  cenarios: [{
    id: 'treino', nome: 'Treino', proporcao: .36, alturaMin: 250,
    legenda: [['dados', 'Mensagem (dados)']],
    params: () => ({ msg: 'Oi!' }),
    intro: { titulo: 'Experimente os controles', texto: 'Clique em <b>Iniciar</b> e acompanhe a mensagem de Ana até o servidor. Depois, clique em um cabo para desligá-lo e envie de novo.' },
    montar(s) {
      s.zona('Rede de casa', .08, .5, .36, .5);
      s.no('pc', 'pc', .08, .5, 'PC de Ana', { sub: REDE.pc.ip, info: { 'Endereço IP': REDE.pc.ip, 'Endereço MAC': REDE.pc.mac, 'Gateway padrão': REDE.gw.ip } });
      s.no('rt', 'roteador', .36, .5, 'Roteador', { sub: REDE.gw.ip, info: { 'Função': 'liga a rede de casa à Internet', 'IP na rede local': REDE.gw.ip } });
      s.no('net', 'nuvem', .64, .5, 'Internet', { tam: 1.25, info: { 'O que é': 'milhares de roteadores ligados entre si' } });
      s.no('srv', 'servidor', .92, .5, 'Servidor', { sub: REDE.web.ip, info: { 'Endereço IP': REDE.web.ip, 'Função': 'guarda o site e responde aos pedidos' } });
      s.cabo('pc', 'rt', { cortavel: true }); s.cabo('rt', 'net', { cortavel: true }); s.cabo('net', 'srv', { cortavel: true });
    },
    passos: [
      {
        titulo: 'Ana envia uma mensagem',
        texto: 'Tudo o que sai do computador vira <b>pacotes</b>: pequenos blocos de dados com o endereço de quem envia e de quem recebe.',
        async rodar(s) {
          s.balao('pc', '"' + s.P.msg + '"');
          const r = await s.enviar({ caminho: ['pc', 'rt'], rotulo: s.P.msg || 'Oi!', tipo: 'dados', manter: true, dados: treinoDados(s, false) });
          s.E.pac = r.ok ? r.pac : null;
          if (r.ok) s.log('O pacote saiu do PC de Ana e chegou ao roteador.', { pac: r.pac });
          else { s.log('O pacote se perdeu: o cabo está desligado.', { ruim: true }); s.explicar('O pacote se perdeu', 'O cabo entre o PC e o roteador está desligado. Clique no cabo para religar e depois em <b>Reiniciar</b>.'); return 'fim'; }
        }
      },
      {
        titulo: 'O roteador escolhe o caminho',
        texto: 'O roteador lê o endereço de destino e encaminha o pacote para a Internet. Ele passa de roteador em roteador até chegar ao servidor.',
        async rodar(s) {
          const r = await s.seguir(s.E.pac, ['rt', 'net', 'srv']);
          if (r.ok) { s.log('O servidor recebeu a mensagem "' + esc(s.P.msg) + '".', { pac: r.pac, bom: true }); s.fxNo('certo', 'srv'); }
          else { s.log('O pacote se perdeu no caminho: há um cabo desligado.', { ruim: true }); s.explicar('O pacote se perdeu', 'Um cabo no caminho está desligado. Sem caminho, o pacote não chega. Clique no cabo para religar e depois em <b>Reiniciar</b>.'); return 'fim'; }
        }
      },
      {
        titulo: 'O servidor responde',
        texto: 'A resposta faz o caminho de volta. Tudo isso acontece em milésimos de segundo; aqui a animação é lenta de propósito.',
        async rodar(s) {
          const r = await s.enviar({ caminho: ['srv', 'net', 'rt', 'pc'], rotulo: 'Recebido!', tipo: 'dados', dados: treinoDados(s, true) });
          if (r.ok) { s.balao('pc', 'Resposta: "Recebido!"'); s.log('A resposta chegou ao PC de Ana.', { pac: r.pac, bom: true }); }
          else s.log('A resposta se perdeu no caminho.', { ruim: true });
        }
      }
    ],
    experimente(ex, lab) {
      ex.campo('Mensagem de Ana', lab.P.msg, v => { lab.P.msg = v.slice(0, 14) || 'Oi!'; }, { max: 14 });
      ex.botao('Enviar a mensagem agora', () => lab.livre(async s => {
        s.explicar('Modo livre', 'A mensagem sai do PC de Ana. Se houver um cabo desligado no caminho, ela se perde ali.');
        const r = await s.enviar({ caminho: ['pc', 'rt', 'net', 'srv'], rotulo: s.P.msg, tipo: 'dados', dados: treinoDados(s, false) });
        if (r.ok) { s.log('O servidor recebeu "' + esc(s.P.msg) + '".', { pac: r.pac, bom: true }); s.fxNo('certo', 'srv'); }
        else { s.log('O pacote se perdeu: cabo desligado.', { ruim: true }); s.explicar('O pacote se perdeu', 'Sem caminho até o destino, o pacote não chega. Religue o cabo clicando nele.'); }
      }));
      ex.nota('Falha para provocar: <b>clique em um cabo</b> no palco para desligá-lo. Clique de novo para religar.');
    }
  }]
});

function treinoDados(s, volta) {
  return volta
    ? { 'Tipo': 'Resposta do servidor', 'IP de origem': REDE.web.ip, 'IP de destino': REDE.pc.ip, 'Conteúdo': 'Recebido!' }
    : { 'Tipo': 'Mensagem (dados)', 'IP de origem': REDE.pc.ip, 'IP de destino': REDE.web.ip, 'Conteúdo': s.P.msg };
}

/* ---------- ABA 2: CAMADAS OSI E TCP/IP — encapsulamento e desencapsulamento ---------- */

const CAMADAS = [   // de cima (7) para baixo (1)
  { n: 7, nome: 'Aplicação', tcpip: 0, cor: 'dados', pdu: 'Dados', funcao: 'É onde os programas conversam com a rede: navegador, e-mail, jogos.', proto: 'HTTP, HTTPS, DNS, SMTP, FTP', equip: 'computadores e servidores' },
  { n: 6, nome: 'Apresentação', tcpip: 0, cor: 'dados', pdu: 'Dados', funcao: 'Deixa os dados em um formato que os dois lados entendem. Também pode comprimir e criptografar.', proto: 'TLS (criptografia), UTF-8 (texto), JPEG (imagem)', equip: 'computadores e servidores' },
  { n: 5, nome: 'Sessão', tcpip: 0, cor: 'dados', pdu: 'Dados', funcao: 'Abre, mantém e encerra a conversa entre os dois programas.', proto: 'controle de sessão, RPC, NetBIOS', equip: 'computadores e servidores' },
  { n: 4, nome: 'Transporte', tcpip: 1, cor: 'tcp', pdu: 'Segmento', funcao: 'Entrega de ponta a ponta entre programas, usando números de porta. O TCP confirma a entrega; o UDP é rápido e não confirma.', proto: 'TCP, UDP', equip: 'computadores e servidores' },
  { n: 3, nome: 'Rede', tcpip: 2, cor: 'rede', pdu: 'Pacote', funcao: 'Endereço lógico (IP) e escolha do caminho entre redes diferentes (roteamento).', proto: 'IP, ICMP', equip: 'roteador' },
  { n: 2, nome: 'Enlace', tcpip: 3, cor: 'cripto', pdu: 'Quadro', funcao: 'Entrega dentro da mesma rede local, usando o endereço MAC. Confere se o quadro chegou sem erros (FCS).', proto: 'Ethernet, Wi-Fi (802.11)', equip: 'switch e placa de rede' },
  { n: 1, nome: 'Física', tcpip: 3, cor: 'bits', pdu: 'Bits', funcao: 'Transforma os bits em sinais: eletricidade no cabo, luz na fibra ou ondas de rádio no ar.', proto: 'cabo de par trançado, fibra óptica, rádio', equip: 'cabos, conectores e hub' }
];
const PILHA_TCPIP = [
  { nome: 'Aplicação', de: 0, ate: 2, cor: 'dados', osi: '7, 6 e 5', funcao: 'Junta as três camadas de cima do OSI: tudo o que o programa faz antes de entregar os dados ao transporte.', proto: 'HTTP, HTTPS, DNS, SMTP, FTP' },
  { nome: 'Transporte', de: 3, ate: 3, cor: 'tcp', osi: '4', funcao: 'Igual à camada 4 do OSI: entrega entre programas usando portas.', proto: 'TCP, UDP' },
  { nome: 'Internet', de: 4, ate: 4, cor: 'rede', osi: '3', funcao: 'Igual à camada 3 do OSI: endereços IP e roteamento.', proto: 'IP, ICMP' },
  { nome: 'Acesso à rede', de: 5, ate: 6, cor: 'cripto', osi: '2 e 1', funcao: 'Junta Enlace e Física: como os bits saem pela placa de rede e pelo meio físico.', proto: 'Ethernet, Wi-Fi' }
];
const CAM_ORDEM = ['ETH', 'IP', 'TCP', 'DADOS', 'FCS'];
const CAM_PECAS = { ETH: ['ETH', 'cripto', 44], IP: ['IP', 'rede', 34], TCP: ['TCP', 'tcp', 42], DADOS: ['', 'dados', 68], FCS: ['FCS', 'cripto', 40] };

function camMsg(s) { const m = s.P.msg || 'Oi!'; return m.length > 7 ? m.slice(0, 6) + '…' : m; }
function camBits(s) { return Array.from(s.P.msg || 'Oi!').map(ch => (ch.charCodeAt(0) & 255).toString(2).padStart(8, '0')).join(' '); }
function camNomePdu(E) { return E.bits > .5 ? 'Bits' : E.k.ETH > .5 ? 'Quadro' : E.k.IP > .5 ? 'Pacote' : E.k.TCP > .5 ? 'Segmento' : 'Dados'; }

function camGeo(s) {
  const p = s.palco, W = p.W, H = p.H, e = p.estreito;
  const topo = 52, base = H - (e ? 112 : 62), rh = (base - topo) / 7;
  const w = e ? W - 20 : limitar(W * .22, 150, 250);
  const O = { x: e ? 10 : 12, w }, D = { x: e ? 10 : W - 12 - w, w };
  const m0 = O.x + O.w + 16, m1 = D.x - 16;
  return {
    W, H, e, topo, base, rh, O, D, m0, m1,
    f: e ? 1 : limitar(((m1 - m0) / 2 - 6) / 236, .6, 1.2),
    yCabo: e ? H - 18 : base + 36, yBarra: base + 52,
    xo: O.x + O.w * .29, xd: D.x + D.w * .29
  };
}

function camPilha(c, s, g, B, lado) {
  const E = s.E, F = s.F, osiW = B.w * .58, tx = B.x + osiW + 4, tw = B.w - osiW - 4;
  const ativa = lado === 'o' ? E.ativaO : E.ativaD, fs = g.rh < 30 ? 10.5 : 12;
  c.save();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.font = '700 13px ' + F.corpo; c.fillStyle = Tema.cor('--ink');
  c.fillText(lado === 'o' ? 'Origem: PC de Ana' : 'Destino: servidor', B.x, 21);
  c.font = '600 11px ' + F.corpo; c.fillStyle = Tema.cor('--ink-2');
  c.fillText('Modelo OSI', B.x, 43); c.fillText('TCP/IP', tx, 43);
  for (let i = 0; i < 7; i++) {
    const L = CAMADAS[i], y = g.topo + g.rh * i + 1.5, hh = g.rh - 3, cor = Tema.cor(TIPOS[L.cor]);
    const on = ativa === i, sel = E.sel === i;
    c.fillStyle = Tema.cor('--node'); rr(c, B.x, y, osiW, hh, 7); c.fill();
    if (on) { c.globalAlpha = .26; c.fillStyle = cor; rr(c, B.x, y, osiW, hh, 7); c.fill(); c.globalAlpha = 1; }
    c.strokeStyle = on ? cor : Tema.cor(sel ? '--accent' : '--node-line'); c.lineWidth = on || sel ? 2 : 1;
    rr(c, B.x, y, osiW, hh, 7); c.stroke();
    c.fillStyle = cor; rr(c, B.x + 4, y + 4, 4, hh - 8, 2); c.fill();
    c.fillStyle = Tema.cor('--ink'); c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = '700 ' + fs + 'px ' + F.mono; c.fillText(String(L.n), B.x + 14, y + hh / 2 + .5);
    c.font = '600 ' + fs + 'px ' + F.corpo; c.fillText(L.nome, B.x + 28, y + hh / 2 + .5);
    s.area(B.x, y, osiW, hh, () => camMostrar(s, i), 'Clique para ver a função da camada ' + L.nome);
  }
  PILHA_TCPIP.forEach((T, j) => {
    const y = g.topo + g.rh * T.de + 1.5, hh = g.rh * (T.ate - T.de + 1) - 3, cor = Tema.cor(TIPOS[T.cor]);
    const on = ativa >= T.de && ativa <= T.ate, sel = E.selT === j;
    c.fillStyle = Tema.cor('--node'); rr(c, tx, y, tw, hh, 7); c.fill();
    if (on) { c.globalAlpha = .26; c.fillStyle = cor; rr(c, tx, y, tw, hh, 7); c.fill(); c.globalAlpha = 1; }
    c.strokeStyle = on ? cor : Tema.cor(sel ? '--accent' : '--node-line'); c.lineWidth = on || sel ? 2 : 1;
    rr(c, tx, y, tw, hh, 7); c.stroke();
    c.fillStyle = Tema.cor('--ink'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '600 ' + (fs - .5) + 'px ' + F.corpo;
    const corte = T.nome.indexOf(' ');
    if (c.measureText(T.nome).width > tw - 8 && corte > 0) {
      c.fillText(T.nome.slice(0, corte), tx + tw / 2, y + hh / 2 - 7);
      c.fillText(T.nome.slice(corte + 1), tx + tw / 2, y + hh / 2 + 7);
    } else c.fillText(T.nome, tx + tw / 2, y + hh / 2 + .5);
    s.area(tx, y, tw, hh, () => camMostrarTcpip(s, j), 'Clique para ver esta camada do modelo TCP/IP');
  });
  c.restore();
}

/* desenha a unidade de dados (a "barra" com os cabeçalhos) */
function camBarra(c, s, g, k, bits, alfa, alin, x, y) {
  const F = s.F, f = g.f, hh = g.e ? 26 : limitar(g.rh - 16, 17, 30);
  let total = 0;
  for (const id of CAM_ORDEM) total += CAM_PECAS[id][2] * f * k[id];
  if (total < 3) return null;
  const x0 = alin === 'esq' ? x : alin === 'dir' ? x - total : x - total / 2;
  c.save();
  if (bits < 1) {
    c.globalAlpha = alfa * (1 - bits);
    let xx = x0;
    for (const id of CAM_ORDEM) {
      const kk = k[id];
      if (kk <= .01) continue;
      const w = CAM_PECAS[id][2] * f * kk, cor = Tema.cor(TIPOS[CAM_PECAS[id][1]]);
      c.fillStyle = cor; rr(c, xx + .75, y - hh / 2, Math.max(1, w - 1.5), hh, 5); c.fill();
      if (kk > .75) {
        c.fillStyle = corDeTexto(cor); c.font = '700 ' + (f < .8 ? 9.5 : 11) + 'px ' + F.corpo; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(id === 'DADOS' ? camMsg(s) : CAM_PECAS[id][0], xx + w / 2, y + .5);
      }
      xx += w;
    }
  }
  if (bits > 0) {
    c.globalAlpha = alfa * bits;
    const cor = Tema.cor('--p-bits');
    c.fillStyle = cor; rr(c, x0, y - hh / 2, total, hh, 5); c.fill();
    c.fillStyle = corDeTexto(cor); c.font = '700 10.5px ' + F.mono; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(camBits(s).slice(0, Math.max(4, Math.floor((total - 10) / 6.5))), x0 + total / 2, y + .5);
  }
  c.restore();
  return { x: x0, y: y - hh / 2, w: total, h: hh };
}

function camMostrar(s, i) {
  const L = CAMADAS[i];
  s.E.sel = i; s.E.selT = -1;
  s.lab.inspecionar('Camada ' + L.n + ': ' + L.nome, [['Função', L.funcao], ['Exemplos', L.proto], ['Unidade de dados', L.pdu], ['No modelo TCP/IP', PILHA_TCPIP[L.tcpip].nome], ['Equipamentos', L.equip]], { sub: 'modelo OSI' });
}
function camMostrarTcpip(s, j) {
  const T = PILHA_TCPIP[j];
  s.E.selT = j; s.E.sel = -1;
  s.lab.inspecionar('TCP/IP: ' + T.nome, [['Função', T.funcao], ['Exemplos', T.proto], ['Equivale no OSI', 'camada(s) ' + T.osi]], { sub: 'modelo TCP/IP' });
}
function camInspecionar(s) {
  const E = s.E, pares = [['Conteúdo', '"' + (s.P.msg || 'Oi!') + '"']];
  if (E.k.TCP > .5) pares.push(['Porta de origem', '52100'], ['Porta de destino', '80 (HTTP)']);
  if (E.k.IP > .5) pares.push(['IP de origem', REDE.pc.ip], ['IP de destino', REDE.web.ip]);
  if (E.k.ETH > .5) pares.push(['MAC de origem', REDE.pc.mac + ' (PC de Ana)'], ['MAC de destino', REDE.gw.mac + ' (roteador)'], ['FCS', 'verificador de erros do quadro']);
  if (E.bits > .5) pares.push(['Bits', camBits(s)]);
  const nome = camNomePdu(E);
  s.lab.inspecionar(nome, pares, { tipo: nome === 'Bits' ? 'bits' : nome === 'Quadro' ? 'cripto' : nome === 'Pacote' ? 'rede' : nome === 'Segmento' ? 'tcp' : 'dados', sub: 'unidade de dados nesta camada' });
}

async function camDescer(s, i) {
  const E = s.E;
  E.lado = 'o'; E.visivel = true; E.ativaO = i;
  if (i === 0) { E.linha = 0; await s.animar(450, k => { E.k.DADOS = k; }, saida); }
  else {
    E.fantO.push({ linha: i - 1, k: Object.assign({}, E.k), bits: E.bits });
    await s.animar(480, k => { E.linha = i - 1 + k; }, suave);
  }
}
async function camSubir(s, i) {
  const E = s.E;
  E.lado = 'd'; E.ativaD = i;
  await s.animar(480, k => { E.linha = i + 1 - k; }, suave);
  E.fantD.push({ linha: i, k: Object.assign({}, E.k), bits: E.bits });
}

ABAS.push({
  id: 'camadas', num: 2, nome: 'Camadas', nomeLongo: 'Camadas OSI e TCP/IP', obrigatoria: true,
  titulo: 'Camadas OSI e TCP/IP',
  resumo: 'A mensagem desce as camadas ganhando um cabeçalho em cada uma, viaja como bits e sobe no destino perdendo os cabeçalhos.',
  mapa: 'Dados, segmento, pacote, quadro e bits: o encapsulamento passo a passo.',
  cenarios: [{
    id: 'encapsulamento', nome: 'Encapsulamento',
    proporcao: .58,
    legenda: [['dados', 'Dados da aplicação'], ['tcp', 'Cabeçalho TCP (transporte)'], ['rede', 'Cabeçalho IP (rede)'], ['cripto', 'Cabeçalho e FCS do quadro (enlace)'], ['bits', 'Bits (física)']],
    dicaInspetor: 'Clique em uma <b>camada</b> para ver a função dela e exemplos de protocolos. Clique na <b>barra colorida</b> para ver os cabeçalhos.',
    params: () => ({ msg: 'Oi!', ruido: false }),
    intro: { titulo: 'Como uma mensagem sai do computador?', texto: 'Ana vai enviar uma mensagem ao servidor. Antes de sair, ela <b>desce as 7 camadas</b> do modelo OSI. À direita de cada pilha, veja as 4 camadas do modelo TCP/IP. Clique em qualquer camada para saber o que ela faz.' },
    montar(s) {
      s.E = { lado: 'o', linha: 0, ativaO: -1, ativaD: -1, sel: -1, selT: -1, k: { ETH: 0, IP: 0, TCP: 0, DADOS: 0, FCS: 0 }, bits: 0, alfa: 1, visivel: false, fantO: [], fantD: [], treme: 0, entregue: false, erro: false };
    },
    tique(s) {
      for (const pk of s.pacotes) {
        if (!pk.meta.estraga || pk.meta.feito) continue;
        if (pk.seg >= (pk.caminho.length > 2 ? 1 : 0) && pk.k > .45) {
          pk.meta.feito = true; pk.rotulo = pk.rotulo === '0' ? '1' : '0'; pk.tipo = 'ataque';
          pk.dados['Situação'] = 'bit trocado pela interferência';
          const p = s.posPacote(pk); s.fx('faisca', p.x, p.y, { cor: '--p-ataque' });
        }
      }
    },
    desenho(c, s) {
      const g = camGeo(s), E = s.E, F = s.F;
      c.save();
      // meio físico
      c.strokeStyle = Tema.cor('--cable'); c.lineWidth = 3; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      if (g.e) { c.moveTo(14, g.yCabo); c.lineTo(g.W - 14, g.yCabo); }
      else { c.moveTo(g.xo, g.base); c.lineTo(g.xo, g.yCabo); c.lineTo(g.xd, g.yCabo); c.lineTo(g.xd, g.base); }
      c.stroke();
      c.font = '600 11px ' + F.corpo; c.fillStyle = Tema.cor('--ink-2'); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText('meio físico: cabo, fibra ou ar', g.W / 2, g.e ? g.yCabo - 8 : g.yCabo + 16);
      if (!g.e) {
        c.textAlign = 'left'; c.fillText('Encapsulamento (descendo)', g.m0, 43);
        c.textAlign = 'right'; c.fillText('Desencapsulamento (subindo)', g.m1, 43);
      }
      c.restore();
      if (g.e) camPilha(c, s, g, g.O, E.lado);
      else { camPilha(c, s, g, g.O, 'o'); camPilha(c, s, g, g.D, 'd'); }
      const yLinha = l => g.topo + g.rh * (l + .5) + 6;
      if (!g.e) {
        for (const ft of E.fantO) camBarra(c, s, g, ft.k, ft.bits, .3, 'esq', g.m0, yLinha(ft.linha));
        for (const ft of E.fantD) camBarra(c, s, g, ft.k, ft.bits, .3, 'dir', g.m1, yLinha(ft.linha));
      }
      if (E.visivel) {
        const tremor = E.treme ? Math.sin(s.t / 24) * 5 * E.treme : 0;
        const b = g.e
          ? camBarra(c, s, g, E.k, E.bits, E.alfa, 'centro', g.W / 2 + tremor, g.yBarra)
          : camBarra(c, s, g, E.k, E.bits, E.alfa, E.lado === 'o' ? 'esq' : 'dir', (E.lado === 'o' ? g.m0 : g.m1) + tremor, yLinha(E.linha));
        if (b) {
          c.save();
          c.globalAlpha = E.alfa; c.font = '700 11.5px ' + F.corpo; c.fillStyle = Tema.cor(E.erro ? '--bad' : '--ink'); c.textBaseline = 'alphabetic';
          const nome = E.erro ? 'Quadro com erro' : camNomePdu(E);
          if (g.e) { c.textAlign = 'center'; c.fillText(nome, g.W / 2, b.y - 5); }
          else if (E.lado === 'o') { c.textAlign = 'left'; c.fillText(nome, b.x, b.y - 4); }
          else { c.textAlign = 'right'; c.fillText(nome, b.x + b.w, b.y - 4); }
          c.restore();
          s.area(b.x - 4, b.y - 6, b.w + 8, b.h + 12, () => camInspecionar(s), 'Clique para ver o que há dentro');
        }
      }
      if (E.entregue) {
        c.save();
        const txt = 'Mensagem entregue: "' + camMsg(s) + '"';
        c.font = '700 12px ' + F.corpo;
        const w = c.measureText(txt).width + 18, x = g.e ? g.W - w - 10 : g.W / 2 - w / 2, cor = Tema.cor('--ok');
        c.fillStyle = cor; rr(c, x, 6, w, 22, 11); c.fill();
        c.fillStyle = corDeTexto(cor); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x + w / 2, 17.5);
        c.restore();
      }
    },
    passos: [
      { titulo: 'Camada 7, Aplicação: nasce a mensagem',
        texto: s => 'O programa de Ana cria a mensagem <b>"' + esc(s.P.msg) + '"</b>. Nesta camada ela é chamada apenas de <b>dados</b>. No modelo TCP/IP, as camadas 7, 6 e 5 formam uma só: Aplicação.',
        async rodar(s) { await camDescer(s, 0); s.log('Aplicação criou os dados: "' + esc(s.P.msg) + '".', { tipo: 'dados' }); await s.esperar(350); } },
      { titulo: 'Camada 6, Apresentação: formato e criptografia',
        texto: 'A Apresentação deixa os dados em um formato que os dois lados entendem. É aqui que eles podem ser comprimidos e criptografados.',
        async rodar(s) { await camDescer(s, 1); s.log('Apresentação: dados no formato combinado.', { tipo: 'dados' }); await s.esperar(350); } },
      { titulo: 'Camada 5, Sessão: organiza a conversa',
        texto: 'A Sessão abre e controla a conversa entre o programa de Ana e o programa do servidor.',
        async rodar(s) { await camDescer(s, 2); s.log('Sessão: conversa aberta entre os dois programas.', { tipo: 'dados' }); await s.esperar(350); } },
      { titulo: 'Camada 4, Transporte: os dados viram segmento',
        texto: 'O Transporte coloca na frente o <b>cabeçalho TCP</b>, com as portas de origem e de destino. Dados + cabeçalho TCP = <b>segmento</b>.',
        async rodar(s) { await camDescer(s, 3); await s.animar(560, k => { s.E.k.TCP = k; }, saida); s.log('Transporte colocou o cabeçalho TCP (portas 52100 e 80): agora é um <b>segmento</b>.', { tipo: 'tcp' }); await s.esperar(350); } },
      { titulo: 'Camada 3, Rede: o segmento vira pacote',
        texto: 'A Rede coloca o <b>cabeçalho IP</b>, com o endereço IP de quem envia e de quem recebe. Agora temos um <b>pacote</b>.',
        async rodar(s) { await camDescer(s, 4); await s.animar(560, k => { s.E.k.IP = k; }, saida); s.log('Rede colocou o cabeçalho IP (' + REDE.pc.ip + ' para ' + REDE.web.ip + '): agora é um <b>pacote</b>.', { tipo: 'rede' }); await s.esperar(350); } },
      { titulo: 'Camada 2, Enlace: o pacote vira quadro',
        texto: 'O Enlace coloca o <b>cabeçalho Ethernet</b>, com os endereços MAC, e no fim um verificador de erros, o <b>FCS</b>. O pacote virou um <b>quadro</b>.',
        async rodar(s) { await camDescer(s, 5); await s.animar(600, k => { s.E.k.ETH = k; s.E.k.FCS = k; }, saida); s.log('Enlace colocou o cabeçalho Ethernet (MAC) e o FCS: agora é um <b>quadro</b>.', { tipo: 'cripto' }); await s.esperar(350); } },
      { titulo: 'Camada 1, Física: o quadro vira bits',
        texto: 'A camada Física transforma o quadro em <b>bits</b>: zeros e uns enviados como eletricidade, luz ou ondas de rádio.',
        async rodar(s) { await camDescer(s, 6); await s.animar(700, k => { s.E.bits = k; }, suave); s.log('Física transformou o quadro em bits: ' + camBits(s).slice(0, 17) + '…', { tipo: 'bits' }); await s.esperar(350); } },
      { titulo: 'Os bits viajam pelo meio físico',
        texto: s => 'Os bits atravessam o cabo até o destino. Esse "embrulhar" de cabeçalhos na descida se chama <b>encapsulamento</b>.' + (s.P.ruido ? ' <span class="dica">Interferência ligada: repare nos bits que mudam de valor no caminho.</span>' : ''),
        async rodar(s) {
          const E = s.E, ruido = !!s.P.ruido, bits = camBits(s).replace(/ /g, '').slice(0, 10).split('');
          E.fantO.push({ linha: 6, k: Object.assign({}, E.k), bits: 1 });
          await s.animar(300, k => { E.alfa = 1 - k; });
          E.visivel = false;
          const pts = () => {
            const g = camGeo(s);
            return g.e ? [() => ({ x: 16, y: camGeo(s).yCabo }), () => ({ x: camGeo(s).W - 16, y: camGeo(s).yCabo })]
              : [() => { const q = camGeo(s); return { x: q.xo, y: q.base + 4 }; }, () => { const q = camGeo(s); return { x: q.xo, y: q.yCabo }; }, () => { const q = camGeo(s); return { x: q.xd, y: q.yCabo }; }, () => { const q = camGeo(s); return { x: q.xd, y: q.base + 4 }; }];
          };
          const envios = bits.map((b, i) => s.enviar({
            caminho: pts(), rotulo: b, tipo: 'bits', mini: true, desvio: 0, atraso: i * 130, pausaNo: 0, mudo: true, vel: .8,
            dados: { 'Tipo': 'Bit', 'Valor': b, 'No cabo': b === '1' ? 'sinal alto' : 'sinal baixo', 'Situação': 'normal' },
            meta: { estraga: ruido && (i === 2 || i === 6) }
          }));
          if (ruido) s.log('Interferência no cabo: alguns bits mudaram de valor.', { ruim: true, tipo: 'ataque' });
          await Promise.all(envios);
          E.erro = ruido;
          E.lado = 'd'; E.linha = 6; E.ativaO = -1;
          s.log('Os bits chegaram ao destino.', { tipo: 'bits' });
        } },
      { titulo: 'Destino, camada 1: os bits viram quadro de novo',
        texto: 'No servidor, a camada Física recebe os sinais e remonta o quadro, bit por bit.',
        async rodar(s) {
          const E = s.E;
          E.lado = 'd'; E.linha = 6; E.ativaD = 6; E.bits = 1; E.alfa = 0; E.visivel = true;
          await s.animar(350, k => { E.alfa = k; });
          E.fantD.push({ linha: 6, k: Object.assign({}, E.k), bits: 1 });
          await s.animar(700, k => { E.bits = 1 - k; }, suave);
          s.log('Física do servidor remontou o quadro.', { tipo: 'bits' }); await s.esperar(300);
        } },
      { titulo: 'Destino, camada 2: confere e tira o cabeçalho do quadro',
        texto: 'O Enlace confere se o quadro é para este MAC e se o <b>FCS</b> bate, isto é, se chegou sem erros. Estando certo, tira o cabeçalho e o FCS e entrega o <b>pacote</b> para cima.',
        async rodar(s) {
          const E = s.E;
          await camSubir(s, 5);
          await s.esperar(350);
          if (E.erro) {
            s.log('Enlace: o FCS não bate. Quadro <b>descartado</b>.', { ruim: true, tipo: 'ataque' });
            s.explicar('O quadro chegou com erro e foi descartado', 'O FCS não bate: algum bit mudou no caminho. O Enlace <b>joga o quadro fora</b> e nada sobe para as camadas de cima. Quem resolve é o TCP da origem: sem receber confirmação, ele envia tudo de novo. <span class="dica">Desligue a interferência em Experimente e clique em Reiniciar.</span>');
            await s.animar(700, k => { E.treme = 1 - k * .3; });
            await s.animar(450, k => { E.alfa = 1 - k; });
            E.visivel = false; E.treme = 0; Som.tocar('perdido');
            return 'fim';
          }
          await s.animar(600, k => { E.k.ETH = 1 - k; E.k.FCS = 1 - k; }, suave);
          s.log('Enlace conferiu o MAC e o FCS e tirou o cabeçalho: sobrou o <b>pacote</b>.', { tipo: 'cripto' }); await s.esperar(300);
        } },
      { titulo: 'Destino, camada 3: confere o IP e tira o cabeçalho',
        texto: 'A Rede confere o IP de destino. É o IP do servidor, então ela tira o cabeçalho IP e entrega o <b>segmento</b>.',
        async rodar(s) { await camSubir(s, 4); await s.esperar(250); await s.animar(560, k => { s.E.k.IP = 1 - k; }, suave); s.log('Rede conferiu o IP de destino e tirou o cabeçalho: sobrou o <b>segmento</b>.', { tipo: 'rede' }); await s.esperar(300); } },
      { titulo: 'Destino, camada 4: entrega ao programa certo',
        texto: 'O Transporte olha a <b>porta de destino</b> (80) e sabe qual programa deve receber. Tira o cabeçalho TCP: sobram os <b>dados</b>.',
        async rodar(s) { await camSubir(s, 3); await s.esperar(250); await s.animar(560, k => { s.E.k.TCP = 1 - k; }, suave); s.log('Transporte leu a porta 80 e tirou o cabeçalho TCP: sobraram os <b>dados</b>.', { tipo: 'tcp' }); await s.esperar(300); } },
      { titulo: 'Destino, camadas 5 e 6: sessão e formato',
        texto: 'Sessão e Apresentação cuidam da conversa e devolvem os dados ao formato que o programa entende.',
        async rodar(s) { await camSubir(s, 2); await s.esperar(250); await camSubir(s, 1); s.log('Sessão e Apresentação entregaram os dados prontos para o programa.', { tipo: 'dados' }); await s.esperar(300); } },
      { titulo: 'Destino, camada 7: a mensagem chega',
        texto: s => 'O programa do servidor lê <b>"' + esc(s.P.msg) + '"</b>. Tirar os cabeçalhos na subida se chama <b>desencapsulamento</b>.',
        async rodar(s) { await camSubir(s, 0); s.E.entregue = true; Som.tocar('acerto'); s.log('Aplicação do servidor recebeu "' + esc(s.P.msg) + '".', { bom: true, tipo: 'dados' }); await s.esperar(400); } }
    ],
    experimente(ex, lab) {
      ex.campo('Mensagem de Ana', lab.P.msg, v => { lab.P.msg = v.slice(0, 12) || 'Oi!'; }, { max: 12 });
      ex.chave('Interferência no cabo (estraga alguns bits)', lab.P.ruido, v => { lab.P.ruido = v; });
      ex.nota('Com a interferência ligada, clique em <b>Reiniciar</b> e depois em <b>Iniciar</b>: o quadro chega com erro e o Enlace do destino o descarta.');
      ex.nota('<b>Clique em qualquer camada</b> do palco para ver a função dela e exemplos de protocolos.');
    }
  }]
});

/* ---------- ABA 3: TCP × UDP — aperto de mão, confirmação, retransmissão e comparação ---------- */

function tuCampos(tipo, n) {
  const base = { 'IP de origem': REDE.pc.ip, 'IP de destino': REDE.web.ip };
  if (tipo === 'syn') return Object.assign({ 'Tipo': 'TCP SYN (pedido de conexão)' }, base, { 'Porta de origem': '52100', 'Porta de destino': '80', 'Nº de sequência': '1000', 'Marcas': 'SYN' });
  if (tipo === 'synack') return { 'Tipo': 'TCP SYN-ACK (aceito a conexão)', 'IP de origem': REDE.web.ip, 'IP de destino': REDE.pc.ip, 'Porta de origem': '80', 'Porta de destino': '52100', 'Nº de sequência': '5000', 'Confirmação (ACK)': '1001', 'Marcas': 'SYN + ACK' };
  if (tipo === 'ack') return Object.assign({ 'Tipo': 'TCP ACK (confirmo)' }, base, { 'Porta de origem': '52100', 'Porta de destino': '80', 'Nº de sequência': '1001', 'Confirmação (ACK)': '5001', 'Marcas': 'ACK' });
  if (tipo === 'dados') return Object.assign({ 'Tipo': 'Dados por TCP' }, base, { 'Porta de destino': '80', 'Nº de sequência': String(1001 + (n - 1) * 100), 'Tamanho': '100 bytes', 'Conteúdo': 'parte ' + n + ' da mensagem' });
  if (tipo === 'ackn') return { 'Tipo': 'TCP ACK (confirmação)', 'IP de origem': REDE.web.ip, 'IP de destino': REDE.pc.ip, 'Confirmação (ACK)': (1001 + n * 100) + ' (recebi até aqui)', 'Significa': 'o pacote ' + n + ' chegou' };
  return Object.assign({ 'Tipo': 'Datagrama UDP' }, base, { 'Porta de origem': '50123', 'Porta de destino': '5004', 'Conteúdo': 'parte ' + n + ' do vídeo', 'Confirmação': 'não existe no UDP' });
}

/* entrega confiável: envia, espera o ACK e reenvia se o tempo se esgotar */
async function tcpEntrega(s, n, perder) {
  const E = s.E;
  for (let tent = 1; ; tent++) {
    const r = await s.enviar({ caminho: ['ct', 'st'], rotulo: 'Dados ' + n, tipo: 'dados', dados: tuCampos('dados', n), meta: { dado: true }, perderEm: perder && tent === 1 ? { seg: 0, k: .55 } : null });
    if (!r.ok) {
      s.log('TCP: o pacote ' + n + ' se perdeu no caminho.', { ruim: true, pac: r.pac });
      s.balao('ct', 'Cadê o ACK ' + n + '?', { dur: 1500 });
      await s.relogio('ct', 1500);
      s.log('TCP: tempo esgotado sem confirmação. Reenviando o pacote ' + n + '.', { tipo: 'tcp' });
      continue;
    }
    if (E.tcp[n] === 'ok') s.log('Servidor já tinha o pacote ' + n + ': descarta a cópia e confirma de novo.', { tipo: 'tcp' });
    else s.log('TCP: o pacote ' + n + ' chegou ao servidor.', { pac: r.pac });
    E.tcp[n] = 'ok';
    const a = await s.enviar({ caminho: ['st', 'ct'], rotulo: 'ACK ' + n, tipo: 'tcp', dados: tuCampos('ackn', n) });
    if (a.ok) { s.log('TCP: o servidor confirmou o pacote ' + n + ' (ACK ' + n + ').', { pac: a.pac, bom: true }); return; }
    s.log('TCP: o ACK ' + n + ' se perdeu.', { ruim: true });
    await s.relogio('ct', 1500);
    s.log('TCP: sem confirmação, o cliente reenvia o pacote ' + n + '.', { tipo: 'tcp' });
  }
}
/* entrega sem garantia: envia e pronto */
async function udpEntrega(s, n, perder) {
  const E = s.E;
  const r = await s.enviar({ caminho: ['cu', 'su'], rotulo: 'Dados ' + n, tipo: 'udp', dados: tuCampos('udp', n), meta: { dado: true }, perderEm: perder ? { seg: 0, k: .55 } : null });
  if (r.ok) { E.udp[n] = 'ok'; s.log('UDP: o pacote ' + n + ' chegou. Nenhuma confirmação é enviada.', { pac: r.pac }); }
  else { E.udp[n] = 'perdido'; s.log('UDP: o pacote ' + n + ' se perdeu. Ninguém percebe: o UDP não confirma nem reenvia.', { ruim: true, pac: r.pac }); }
}
async function tcpAperto(s) {
  const E = s.E;
  s.nos.get('ct').sub = 'abrindo conexão…';
  const a = await s.enviar({ caminho: ['ct', 'st'], rotulo: 'SYN', tipo: 'tcp', dados: tuCampos('syn') });
  s.log('TCP: cliente envia <b>SYN</b> (quero abrir uma conexão).', { pac: a.pac });
  const b = await s.enviar({ caminho: ['st', 'ct'], rotulo: 'SYN-ACK', tipo: 'tcp', dados: tuCampos('synack') });
  s.log('TCP: servidor responde <b>SYN-ACK</b> (aceito e confirmo).', { pac: b.pac });
  const c = await s.enviar({ caminho: ['ct', 'st'], rotulo: 'ACK', tipo: 'tcp', dados: tuCampos('ack') });
  s.log('TCP: cliente responde <b>ACK</b>. Conexão aberta.', { pac: c.pac, bom: true });
  E.aberta = true; s.nos.get('ct').sub = 'conexão aberta';
}

ABAS.push({
  id: 'tcp-udp', num: 3, nome: 'TCP × UDP', obrigatoria: true,
  titulo: 'TCP × UDP',
  resumo: 'O TCP abre a conexão com um aperto de mão, confirma cada entrega e reenvia o que se perde. O UDP só envia.',
  mapa: 'Aperto de mão em três vias, confirmação e retransmissão, lado a lado com o UDP.',
  cenarios: [{
    id: 'comparacao', nome: 'Comparação',
    legenda: [['tcp', 'Controle do TCP (SYN, ACK)'], ['dados', 'Dados por TCP'], ['udp', 'Dados por UDP']],
    params: () => ({ perder: true }),
    intro: { titulo: 'Dois jeitos de transportar dados', texto: 'Em cima, o <b>TCP</b>: confiável, confirma tudo. Embaixo, o <b>UDP</b>: rápido, sem garantia. Os dois vão enviar 3 pacotes ao mesmo tempo. Clique em <b>Iniciar</b>.' },
    montar(s) {
      s.E = { tcp: {}, udp: {}, total: 3, aberta: false, pulso: 0, fimUdp: 0, fimTcp: 0 };
      s.zona('TCP: abre conexão, confirma e reenvia', .1, .2, .9, .2);
      s.zona('UDP: só envia', .1, .78, .9, .78);
      s.no('ct', 'pc', .1, .2, 'Cliente', { sub: 'sem conexão', info: { 'Protocolo': 'TCP', 'Usado em': 'páginas web, e-mail, arquivos' } });
      s.no('st', 'servidor', .9, .2, 'Servidor', { info: { 'Protocolo': 'TCP', 'Porta': '80 (HTTP)' } });
      s.no('cu', 'pc', .1, .78, 'Cliente', { sub: 'sem conexão (nem precisa)', info: { 'Protocolo': 'UDP', 'Usado em': 'chamadas de vídeo, jogos online, transmissões ao vivo' } });
      s.no('su', 'servidor', .9, .78, 'Servidor', { info: { 'Protocolo': 'UDP', 'Porta': '5004 (vídeo)' } });
      s.cabo('ct', 'st'); s.cabo('cu', 'su');
    },
    desenho(c, s) {
      const E = s.E, u = s.palco.u, W = s.palco.W, F = s.F, n = Math.max(3, E.total);
      const fileiras = [['ct', E.tcp, 'dados'], ['cu', E.udp, 'udp']];
      for (const f of fileiras) {
        const p = s.pos(f[0]), y = p.y + u * .5 + 8, L = 26, G = 5, tw = n * L + (n - 1) * G, x0 = W / 2 - tw / 2;
        c.save();
        c.font = '600 11px ' + F.corpo; c.fillStyle = Tema.cor('--ink-2'); c.textBaseline = 'middle';
        if (s.palco.estreito) { c.textAlign = 'center'; c.fillText('Chegou ao servidor', W / 2, y - 9); }
        else { c.textAlign = 'right'; c.fillText('Chegou ao servidor:', x0 - 9, y + 11); }
        for (let i = 1; i <= n; i++) {
          const x = x0 + (i - 1) * (L + G), est = f[1][i], esc2 = est === 'ok' ? 1 + E.pulso * .12 : 1;
          c.save(); c.translate(x + L / 2, y + 11); c.scale(esc2, esc2);
          if (est === 'ok') {
            const cor = Tema.cor(TIPOS[f[2]]);
            c.fillStyle = cor; rr(c, -L / 2, -11, L, 22, 6); c.fill();
            c.fillStyle = corDeTexto(cor); c.font = '700 12px ' + F.corpo; c.textAlign = 'center'; c.fillText(String(i), 0, .5);
          } else {
            c.setLineDash([4, 3]); c.lineWidth = 1.5; c.strokeStyle = Tema.cor(est === 'perdido' ? '--bad' : '--node-line');
            rr(c, -L / 2, -11, L, 22, 6); c.stroke();
            c.setLineDash([]);
            c.fillStyle = Tema.cor(est === 'perdido' ? '--bad' : '--ink-3'); c.font = '700 12px ' + F.corpo; c.textAlign = 'center';
            c.fillText(est === 'perdido' ? '×' : String(i), 0, .5);
          }
          c.restore();
        }
        c.restore();
      }
    },
    passos: [
      { titulo: 'O TCP pede a conexão; o UDP já sai enviando',
        texto: '<b>TCP:</b> antes de mandar dados, o cliente envia um <b>SYN</b>, que quer dizer "quero conversar". <b>UDP:</b> não pede licença e já manda o primeiro pacote.',
        async rodar(s) {
          s.nos.get('ct').sub = 'abrindo conexão…';
          const a = s.enviar({ caminho: ['ct', 'st'], rotulo: 'SYN', tipo: 'tcp', dados: tuCampos('syn') });
          const b = udpEntrega(s, 1, false);
          const r = await a; await b;
          s.log('TCP: cliente envia <b>SYN</b> (quero abrir uma conexão).', { pac: r.pac });
        } },
      { titulo: 'O servidor aceita: SYN-ACK',
        texto: s => '<b>TCP:</b> o servidor responde <b>SYN-ACK</b>: "pode falar, estou ouvindo". <b>UDP:</b> segue mandando, sem saber se o pacote anterior chegou.' + (s.P.perder ? ' Repare: o pacote 2 do UDP some no caminho.' : ''),
        async rodar(s) {
          const a = s.enviar({ caminho: ['st', 'ct'], rotulo: 'SYN-ACK', tipo: 'tcp', dados: tuCampos('synack') });
          const b = udpEntrega(s, 2, s.P.perder);
          const r = await a; await b;
          s.log('TCP: servidor responde <b>SYN-ACK</b> (aceito e confirmo).', { pac: r.pac });
        } },
      { titulo: 'O cliente confirma: conexão aberta',
        texto: '<b>TCP:</b> o cliente responde <b>ACK</b>. SYN, SYN-ACK, ACK: esse é o <b>aperto de mão em três vias</b>. <b>UDP:</b> já terminou de enviar tudo.',
        async rodar(s) {
          const a = s.enviar({ caminho: ['ct', 'st'], rotulo: 'ACK', tipo: 'tcp', dados: tuCampos('ack') });
          const b = udpEntrega(s, 3, false);
          const r = await a; await b;
          s.E.aberta = true; s.E.fimUdp = s.t; s.nos.get('ct').sub = 'conexão aberta';
          s.log('TCP: cliente responde <b>ACK</b>. Conexão aberta.', { pac: r.pac, bom: true });
          s.texto('ct', 'conexão aberta', '--ok');
        } },
      { titulo: 'O TCP envia o pacote 1 e espera a confirmação',
        texto: 'Cada pacote de dados do TCP é confirmado por um <b>ACK</b> do servidor. Só assim o cliente tem certeza de que chegou.',
        async rodar(s) { await tcpEntrega(s, 1, false); } },
      { titulo: 'O pacote 2 do TCP',
        texto: s => s.P.perder
          ? 'O pacote 2 some no caminho. O cliente espera o ACK, ele não vem, o tempo se esgota e o TCP <b>envia de novo</b>. Isso se chama <b>retransmissão</b>.'
          : 'Sem perda desta vez: o pacote 2 chega e é confirmado. Ligue "Perder o pacote 2" em Experimente para ver a retransmissão.',
        async rodar(s) { await tcpEntrega(s, 2, s.P.perder); } },
      { titulo: 'O TCP envia o pacote 3',
        texto: 'Último pacote, última confirmação. No TCP tudo chega, e na ordem certa.',
        async rodar(s) { await tcpEntrega(s, 3, false); s.E.fimTcp = s.t; } },
      { titulo: 'Resultado: confiável ou rápido?',
        texto: s => {
          const E = s.E, faltou = Object.keys(E.udp).filter(k => E.udp[k] === 'perdido');
          return '<b>TCP</b> entregou tudo e na ordem, mas levou ' + (E.fimTcp / 1000).toFixed(1).replace('.', ',') + ' s na animação. É usado em páginas web, e-mail e arquivos.<br><b>UDP</b> terminou em ' + (E.fimUdp / 1000).toFixed(1).replace('.', ',') + ' s' +
            (faltou.length ? ', mas perdeu o pacote ' + faltou.join(' e ') + ' sem perceber' : ' e, desta vez, não perdeu nada') + '. É usado em chamadas de vídeo, jogos online e transmissões ao vivo, onde atraso é pior do que um pedaço faltando.';
        },
        async rodar(s) {
          const E = s.E, faltou = Object.keys(E.udp).filter(k => E.udp[k] === 'perdido');
          s.balao('st', 'Chegou tudo, na ordem', { dur: 0 });
          s.balao('su', faltou.length ? 'Faltou o ' + faltou.join(' e o ') : 'Chegou tudo (sorte!)', { dur: 0 });
          await s.animar(1400, k => { E.pulso = Math.abs(Math.sin(k * Math.PI * 3)); });
          E.pulso = 0;
        } }
    ],
    experimente(ex, lab) {
      ex.chave('Perder o pacote 2 no caminho', lab.P.perder, v => { lab.P.perder = v; });
      ex.botao('Perder um pacote agora', () => {
        const alvos = lab.cena.emVoo(p => p.meta.dado);
        if (!alvos.length) { Avisos.mostrar('Nenhum pacote de dados viajando agora. Clique quando um "Dados" estiver no meio do caminho.'); return; }
        alvos.forEach(p => lab.cena.matar(p));
      }, { classe: 'btn-perigo' });
      ex.botao('Enviar mais um pacote nos dois', () => lab.livre(async s => {
        const n = ++s.E.total;
        s.explicar('Modo livre: pacote ' + n, 'Os dois protocolos enviam o pacote ' + n + ' ao mesmo tempo. Clique em <b>Perder um pacote agora</b> enquanto eles viajam e veja a diferença.');
        if (!s.E.aberta) await tcpAperto(s);
        await Promise.all([tcpEntrega(s, n, false), udpEntrega(s, n, false)]);
      }));
      ex.nota('Dica: use <b>Pausar</b> e clique em um pacote para ver números de sequência e de confirmação.');
    }
  }]
});

/* ---------- ABA 4: A VIAGEM DE UMA PÁGINA WEB — DNS, TCP, HTTP e a página montada ---------- */

const WEB_IDA = ['pc', 'sw', 'rt', 'net', 'web'], WEB_VOLTA = ['web', 'net', 'rt', 'sw', 'pc'];

function webCampos(tipo, s, extra) {
  const site = s.P.site || REDE.web.nome;
  const ida = { 'IP de origem': REDE.pc.ip, 'IP de destino': REDE.web.ip, 'MAC de origem': REDE.pc.mac + ' (PC de Ana)', 'MAC de destino': REDE.gw.mac + ' (roteador)' };
  const volta = { 'IP de origem': REDE.web.ip, 'IP de destino': REDE.pc.ip };
  const T = {
    dnsP: () => ({ 'Tipo': 'Pergunta DNS', 'Pergunta': 'qual é o IP de ' + site + '?', 'IP de origem': REDE.pc.ip, 'IP de destino': REDE.dns.ip, 'Porta de destino': '53 (DNS)', 'Transporte': 'UDP' }),
    dnsR: () => ({ 'Tipo': 'Resposta DNS', 'Resposta': site + ' = ' + REDE.web.ip, 'IP de origem': REDE.dns.ip, 'IP de destino': REDE.pc.ip, 'Porta de origem': '53 (DNS)' }),
    syn: () => Object.assign({ 'Tipo': 'TCP SYN (pedido de conexão)' }, ida, { 'Porta de destino': '80 (HTTP)', 'Marcas': 'SYN' }),
    synack: () => Object.assign({ 'Tipo': 'TCP SYN-ACK (aceito a conexão)' }, volta, { 'Porta de origem': '80 (HTTP)', 'Marcas': 'SYN + ACK' }),
    ack: () => Object.assign({ 'Tipo': 'TCP ACK (confirmo)' }, ida, { 'Porta de destino': '80 (HTTP)', 'Marcas': 'ACK' }),
    get: () => Object.assign({ 'Tipo': 'Pedido HTTP', 'Pedido': 'GET / (me envie a página inicial)', 'Site': site }, ida, { 'Porta de origem': '52100', 'Porta de destino': '80 (HTTP)', 'Camadas': 'Ethernet > IP > TCP > HTTP' }),
    ped: () => Object.assign({ 'Tipo': 'Resposta HTTP 200 (deu certo)', 'Conteúdo': 'pedaço ' + extra + ' de 4 da página' }, volta, { 'Porta de origem': '80 (HTTP)', 'Porta de destino': '52100', 'Nº de sequência': String(1 + (extra - 1) * 1460) }),
    ackn: () => Object.assign({ 'Tipo': 'TCP ACK (confirmação)', 'Significa': 'recebi o pedaço ' + extra }, ida, { 'Porta de destino': '80 (HTTP)' })
  };
  return T[tipo]();
}

/* um pedaço da página: o servidor reenvia se não receber a confirmação */
async function webPedaco(s, i, perder) {
  const E = s.E;
  for (let tent = 1; ; tent++) {
    const r = await s.enviar({ caminho: WEB_VOLTA, rotulo: 'HTTP 200 ' + i + '/4', tipo: 'dados', dados: webCampos('ped', s, i), meta: { pedaco: i }, perderEm: perder && tent === 1 ? { seg: 1, k: .5 } : null });
    if (r.ok) break;
    s.log('O pedaço ' + i + ' da página se perdeu no caminho.', { ruim: true, pac: r.pac });
    s.explicar('Um pacote se perdeu', 'O TCP percebeu a falta da confirmação e <b>reenviou o pacote</b>. Por isso a página chega completa mesmo quando a rede falha.');
    s.balao('web', 'Sem ACK do pedaço ' + i + '…', { dur: 1600 });
    await s.relogio('web', 1600);
    s.log('Servidor: sem confirmação do pedaço ' + i + '. Reenviando.', { tipo: 'tcp' });
  }
  E.pedacos[i] = true; E.status = 'Recebendo a página (' + Object.keys(E.pedacos).length + ' de 4)';
  s.log('Pedaço ' + i + ' de 4 chegou ao navegador.', { tipo: 'dados' });
  const a = s.enviar({ caminho: WEB_IDA, rotulo: 'ACK ' + i, tipo: 'tcp', vel: 1.5, dados: webCampos('ackn', s, i) });
  await a;
}

function webNavegador(c, s) {
  const E = s.E, p = s.palco, F = s.F, u = p.u, pc = s.pos('pc');
  const x = 12, y = 10, w = p.estreito ? Math.min(p.W - 24, 210) : limitar(p.W * .33, 220, 340);
  const hh = p.estreito ? 132 : Math.max(96, pc.y - u * .5 - 24 - 14 - y);
  c.save();
  c.shadowColor = 'rgba(15,25,50,.15)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
  c.fillStyle = Tema.cor('--node'); rr(c, x, y, w, hh, 9); c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = Tema.cor('--node-line'); c.lineWidth = 1.2; rr(c, x, y, w, hh, 9); c.stroke();
  // barra de endereço
  c.fillStyle = Tema.cor('--zone'); rr(c, x + 8, y + 8, w - 16, 22, 11); c.fill();
  c.strokeStyle = Tema.cor('--node-line'); rr(c, x + 8, y + 8, w - 16, 22, 11); c.stroke();
  const site = s.P.site || REDE.web.nome, txt = site.slice(0, E.digitado);
  c.font = '600 11.5px ' + F.mono; c.fillStyle = Tema.cor('--ink'); c.textAlign = 'left'; c.textBaseline = 'middle';
  c.save(); c.beginPath(); c.rect(x + 14, y + 8, w - 28, 22); c.clip();
  c.fillText(txt || ' ', x + 17, y + 19.5);
  if (E.digitado < site.length && Math.floor(s.t / 350) % 2 === 0 && E.digitando) { const tw = c.measureText(txt).width; c.fillRect(x + 18 + tw, y + 13, 1.5, 12); }
  c.restore();
  // linha de situação
  c.font = '600 10.5px ' + F.corpo; c.fillStyle = Tema.cor(E.falha ? '--bad' : E.montada >= 1 ? '--ok' : '--ink-2');
  c.fillText(E.status || 'Navegador de Ana', x + 10, y + 42);
  // área da página: 4 pedaços
  const ax = x + 8, ay = y + 52, aw = w - 16, ah = hh - 60;
  if (ah > 34) {
    const g = 4 * (1 - E.montada), hCab = ah * .26, wImg = aw * .42, hTxt = (ah - hCab - g) * .58;
    const R = [null,
      { x: ax, y: ay, w: aw, h: hCab },
      { x: ax, y: ay + hCab + g, w: wImg, h: ah - hCab - g },
      { x: ax + wImg + g, y: ay + hCab + g, w: aw - wImg - g, h: hTxt },
      { x: ax + wImg + g, y: ay + hCab + g + hTxt + g, w: aw - wImg - g, h: ah - hCab - g - hTxt - g }];
    for (let i = 1; i <= 4; i++) {
      const r = R[i];
      if (E.pedacos[i]) {
        if (i === 1) {
          c.fillStyle = Tema.cor('--p-tcp'); rr(c, r.x, r.y, r.w, r.h, 4); c.fill();
          c.fillStyle = '#FFFFFF'; c.font = '700 ' + Math.min(12, r.h * .5) + 'px ' + F.corpo; c.textAlign = 'left'; c.fillText(site.replace(/^www\./, ''), r.x + 8, r.y + r.h / 2 + .5);
        } else if (i === 2) {
          c.fillStyle = Tema.cor('--p-dados'); rr(c, r.x, r.y, r.w, r.h, 4); c.fill();
          c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(r.x + r.w * .72, r.y + r.h * .3, Math.min(r.w, r.h) * .12, 0, TAU); c.fill();
          c.beginPath(); c.moveTo(r.x + r.w * .08, r.y + r.h * .9); c.lineTo(r.x + r.w * .38, r.y + r.h * .42); c.lineTo(r.x + r.w * .6, r.y + r.h * .72); c.lineTo(r.x + r.w * .72, r.y + r.h * .58); c.lineTo(r.x + r.w * .94, r.y + r.h * .9); c.closePath(); c.fill();
        } else if (i === 3) {
          c.fillStyle = Tema.cor('--zone'); rr(c, r.x, r.y, r.w, r.h, 4); c.fill();
          c.fillStyle = Tema.cor('--ink-3');
          const nl = Math.max(2, Math.floor(r.h / 9));
          for (let l = 0; l < nl; l++) c.fillRect(r.x + 7, r.y + 6 + l * (r.h - 10) / nl, (r.w - 14) * (l === nl - 1 ? .55 : 1), 3);
        } else {
          c.fillStyle = Tema.cor('--zone'); rr(c, r.x, r.y, r.w, r.h, 4); c.fill();
          c.fillStyle = Tema.cor('--accent'); rr(c, r.x + 7, r.y + r.h / 2 - Math.min(8, r.h * .32), Math.min(64, r.w - 14), Math.min(16, r.h * .64), 5); c.fill();
        }
      } else {
        c.setLineDash([4, 3]); c.strokeStyle = Tema.cor('--node-line'); c.lineWidth = 1.2; rr(c, r.x + .5, r.y + .5, r.w - 1, r.h - 1, 4); c.stroke(); c.setLineDash([]);
        if (E.esperando) { c.fillStyle = Tema.cor('--ink-3'); c.font = '700 11px ' + F.corpo; c.textAlign = 'center'; c.fillText(String(i), r.x + r.w / 2, r.y + r.h / 2 + .5); }
      }
    }
  }
  c.restore();
}

ABAS.push({
  id: 'pagina-web', num: 4, nome: 'Página web', nomeLongo: 'A viagem de uma página web', obrigatoria: true,
  titulo: 'A viagem de uma página web',
  resumo: 'Do endereço digitado até a página montada: o DNS acha o IP, o TCP abre a conexão, o navegador pede e a página volta em pedaços.',
  mapa: 'DNS, conexão TCP, pedido HTTP e a página chegando em pacotes.',
  cenarios: [{
    id: 'viagem', nome: 'Viagem',
    legenda: [['dns', 'DNS'], ['tcp', 'TCP (SYN, SYN-ACK, ACK)'], ['dados', 'HTTP (pedido e página)']],
    params: () => ({ site: REDE.web.nome, perder: false, dnsFora: false }),
    intro: { titulo: 'O que acontece quando você abre um site?', texto: 'Ana vai abrir um site. Em menos de um segundo, vários pacotes diferentes saem e voltam. Vamos ver um de cada vez: clique em <b>Próximo passo</b>.' },
    montar(s) {
      s.E = { digitado: 0, digitando: false, status: '', pedacos: {}, montada: 0, esperando: false, falha: false };
      s.zona('Rede local de Ana', .06, .68, .44, .68, { mx0: .03, my0: .9, mx1: .66, my1: .9 });
      s.no('pc', 'pc', .06, .68, 'PC de Ana', { sub: REDE.pc.ip, mx: .03, my: .9, info: { 'Endereço IP': REDE.pc.ip, 'Endereço MAC': REDE.pc.mac, 'Gateway padrão': REDE.gw.ip, 'Servidor DNS': REDE.dns.ip } });
      s.no('sw', 'switch', .25, .68, 'Switch', { mx: .34, my: .9, info: { 'Camada': '2 (Enlace)', 'Usa': 'endereço MAC', 'Função': 'liga os equipamentos da rede local' } });
      s.no('rt', 'roteador', .44, .68, 'Roteador', { sub: REDE.gw.ip, mx: .66, my: .9, info: { 'Camada': '3 (Rede)', 'Usa': 'endereço IP', 'IP na rede local': REDE.gw.ip, 'IP público': REDE.gw.publico, 'Função': 'leva os pacotes para outras redes' } });
      s.no('net', 'nuvem', .64, .68, 'Internet', { tam: 1.25, mx: .97, my: .9, info: { 'O que é': 'milhares de roteadores ligados entre si' } });
      s.no('dns', 'servidor', .8, .2, 'Servidor DNS', { sub: REDE.dns.ip, selo: 'DNS', corSelo: '--p-dns', mx: .97, my: .22, info: { 'Endereço IP': REDE.dns.ip, 'Porta': '53', 'Função': 'traduz nomes de sites em endereços IP' } });
      s.no('web', 'servidor', .94, .68, 'Servidor web', { sub: REDE.web.ip, mx: .97, my: .56, info: { 'Endereço IP': REDE.web.ip, 'Porta': '80 (HTTP)', 'Função': 'guarda o site e responde aos pedidos' } });
      s.cabo('pc', 'sw'); s.cabo('sw', 'rt'); s.cabo('rt', 'net'); s.cabo('net', 'dns'); s.cabo('net', 'web');
      if (s.P.dnsFora) s.nos.get('dns').desligado = true;
    },
    desenho(c, s) { webNavegador(c, s); },
    passos: [
      { titulo: 'Ana digita o endereço do site',
        texto: 'O computador precisa do <b>endereço IP</b> do site, mas só conhece o nome. Nomes são fáceis para pessoas; as máquinas se encontram por números.',
        async rodar(s) {
          const E = s.E, site = s.P.site || REDE.web.nome;
          E.digitando = true;
          await s.animar(Math.min(1800, site.length * 70), k => { E.digitado = Math.round(k * site.length); });
          E.digitando = false; E.digitado = site.length; E.status = 'Procurando o IP do site…';
          s.log('Ana digitou <b>' + esc(site) + '</b> e apertou Enter.');
          await s.esperar(350);
        } },
      { titulo: 'O DNS traduz o nome em IP',
        texto: 'O DNS funciona como uma <b>agenda</b>: traduz o nome do site em um endereço IP.',
        async rodar(s) {
          const E = s.E, site = s.P.site || REDE.web.nome;
          E.digitado = site.length;
          const a = s.enviar({ caminho: ['pc', 'sw', 'rt', 'net', 'dns'], rotulo: 'DNS ?', tipo: 'dns', dados: webCampos('dnsP', s) });
          s.log('PC pergunta ao DNS: qual é o IP de ' + esc(site) + '?', { pac: a.pac });
          const r = await a;
          if (!r.ok) {
            await s.esperar(900);
            E.falha = true; E.status = 'Não foi possível encontrar o site';
            s.log('O servidor DNS não respondeu. Sem o IP, o navegador não sabe para onde ir.', { ruim: true });
            s.explicar('Sem DNS, sem site', 'O servidor DNS está <b>fora do ar</b>. O navegador não descobre o IP e mostra erro, mesmo com o site funcionando. <span class="dica">Desligue "Servidor DNS fora do ar" em Experimente e clique em Reiniciar.</span>');
            return 'fim';
          }
          s.balao('dns', site + '\n= ' + REDE.web.ip, { baixo: true, dur: 2600 });
          await s.esperar(600);
          const b = s.enviar({ caminho: ['dns', 'net', 'rt', 'sw', 'pc'], rotulo: 'DNS ' + REDE.web.ip, tipo: 'dns', dados: webCampos('dnsR', s) });
          s.log('DNS responde: ' + esc(site) + ' = <b>' + REDE.web.ip + '</b>.', { pac: b.pac });
          await b;
          E.status = 'IP encontrado: ' + REDE.web.ip;
        } },
      { titulo: 'O TCP abre a conexão',
        texto: 'O TCP abre a conexão com o <b>aperto de mão em três vias</b>: SYN, SYN-ACK, ACK. Agora os dois lados estão prontos para conversar.',
        async rodar(s) {
          const E = s.E;
          E.status = 'Conectando a ' + REDE.web.ip + '…';
          const a = s.enviar({ caminho: WEB_IDA, rotulo: 'SYN', tipo: 'tcp', vel: 1.25, dados: webCampos('syn', s) });
          s.log('PC envia <b>SYN</b> ao servidor web.', { pac: a.pac }); await a;
          const b = s.enviar({ caminho: WEB_VOLTA, rotulo: 'SYN-ACK', tipo: 'tcp', vel: 1.25, dados: webCampos('synack', s) });
          s.log('Servidor responde <b>SYN-ACK</b>.', { pac: b.pac }); await b;
          const d = s.enviar({ caminho: WEB_IDA, rotulo: 'ACK', tipo: 'tcp', vel: 1.25, dados: webCampos('ack', s) });
          s.log('PC responde <b>ACK</b>. Conexão aberta.', { pac: d.pac, bom: true }); await d;
          E.status = 'Conectado';
        } },
      { titulo: 'O navegador pede a página',
        texto: 'O navegador pede a página com um <b>HTTP GET</b>. O <b>switch usa o MAC</b>; o <b>roteador usa o IP</b> para levar o pacote até outra rede.',
        async rodar(s) {
          const E = s.E;
          E.status = 'Pedindo a página…';
          const a = s.enviar({
            caminho: WEB_IDA, rotulo: 'HTTP GET', tipo: 'dados', dados: webCampos('get', s), pausaNo: 420,
            aoSaltar: (no, pk) => {
              if (no === 'sw') s.log('Switch: lê o <b>MAC</b> de destino e passa o quadro para a porta do roteador.', { pac: pk });
              if (no === 'rt') {
                pk.dados['IP de origem'] = REDE.gw.publico + ' (IP público do roteador)';
                pk.dados['MAC de origem'] = 'muda a cada salto'; pk.dados['MAC de destino'] = 'muda a cada salto';
                s.log('Roteador: lê o <b>IP</b> de destino e encaminha para a Internet. Na saída, troca o IP privado pelo IP público (NAT).', { pac: pk });
              }
              if (no === 'net') s.log('Internet: roteadores repassam o pacote, salto a salto, até o servidor.', { pac: pk });
            }
          });
          s.log('Navegador envia <b>HTTP GET</b>: me envie a página inicial.', { pac: a.pac });
          await a;
          s.log('Servidor web recebeu o pedido.', { bom: true });
          E.esperando = true;
        } },
      { titulo: 'A página volta em pedaços',
        texto: s => 'A página vem <b>dividida em pacotes</b>. O TCP confirma o recebimento de cada um com um ACK.' + (s.P.perder ? ' Desta vez, o pedaço 2 vai se perder no caminho.' : ''),
        async rodar(s) {
          const E = s.E, todos = [];
          E.esperando = true; E.status = 'Recebendo a página (0 de 4)';
          for (let i = 1; i <= 4; i++) { todos.push(webPedaco(s, i, s.P.perder && i === 2)); await s.esperar(620); }
          await Promise.all(todos);
        } },
      { titulo: 'A página aparece na tela',
        texto: 'No destino, os pacotes são <b>juntados na ordem certa</b> e a página é exibida. Tudo isso leva menos de um segundo na vida real.',
        async rodar(s) {
          const E = s.E;
          await s.animar(700, k => { E.montada = k; }, suave);
          E.status = 'Pronto: página carregada';
          s.fxNo('certo', 'pc'); Som.tocar('acerto');
          s.log('Navegador juntou os 4 pedaços na ordem e mostrou a página.', { bom: true });
          await s.esperar(400);
        } }
    ],
    experimente(ex, lab) {
      ex.campo('Endereço do site', lab.P.site, v => { lab.P.site = v.trim().slice(0, 30) || REDE.web.nome; }, { max: 30 });
      ex.chave('Perder um pedaço da página (passo 5)', lab.P.perder, v => { lab.P.perder = v; });
      ex.botao('Perder um pacote agora', () => {
        const alvo = lab.cena.emVoo(p => p.meta.pedaco)[0];
        if (!alvo) { Avisos.mostrar('Nenhum pedaço da página viajando agora. Use este botão durante o passo 5.'); return; }
        lab.cena.matar(alvo);
      }, { classe: 'btn-perigo' });
      ex.chave('Servidor DNS fora do ar', lab.P.dnsFora, v => {
        lab.P.dnsFora = v;
        const n = lab.cena.nos.get('dns'); n.desligado = v;
        lab.registrar(v ? 'Servidor DNS foi desligado.' : 'Servidor DNS voltou a funcionar.', v ? { ruim: true } : { bom: true }, lab.cena);
      });
      ex.nota('Depois de mudar algo, clique em <b>Reiniciar</b> e rode de novo para ver a diferença.');
    }
  }]
});

/* ---------- ABA 5: COMUTAÇÃO E ROTEAMENTO — tabela MAC do switch e tabela de roteamento ---------- */

const SW_PCS = {
  A: { mac: 'AA:11', porta: 1, ip: '192.168.0.11' },
  B: { mac: 'BB:22', porta: 2, ip: '192.168.0.12' },
  C: { mac: 'CC:33', porta: 3, ip: '192.168.0.13' },
  D: { mac: 'DD:44', porta: 4, ip: '192.168.0.14' }
};

function swHud(s) {
  const E = s.E;
  if (E.hub) { s.hud('<b>Hub</b><div class="hud-nota">O hub não tem tabela MAC. Ele não lê endereços: repete o sinal em todas as portas.</div>'); return; }
  const linhas = E.tab.map(r => ({ cels: [r.mac, 'porta ' + r.porta, 'PC ' + r.pc], classe: r.mac === E.novo ? 'novo' : (r.mac === E.alvo ? 'alvo' : '') }));
  s.hud(tabelaViva('Tabela MAC do switch', ['MAC', 'Porta', 'Quem é'], linhas, 'vazia: o switch ainda não aprendeu nenhum endereço'));
}

async function swQuadro(s, de, para) {
  const E = s.E, o = SW_PCS[de], d = SW_PCS[para];
  const dados = { 'Tipo': 'Quadro Ethernet', 'MAC de origem': o.mac + ' (PC ' + de + ')', 'MAC de destino': d.mac + ' (PC ' + para + ')', 'IP de origem': o.ip, 'IP de destino': d.ip, 'Entrou pela porta': String(o.porta) };
  E.novo = null; E.alvo = null; swHud(s);
  const r = await s.enviar({ caminho: [de, 'sw'], rotulo: de + '→' + para, tipo: 'dados', dados });
  s.log('PC ' + de + ' envia um quadro para o PC ' + para + ' (MAC ' + d.mac + ').', { pac: r.pac });
  if (!r.ok) { s.log('O quadro se perdeu: cabo desligado.', { ruim: true }); return false; }
  if (E.hub) {
    s.balao('sw', 'Repito para todos!', { dur: 1600 });
    s.log('Hub: repete o sinal em <b>todas as portas</b>, sem olhar o endereço.', { tipo: 'rede' });
    return swCopias(s, de, para, dados);
  }
  // aprendizado: o switch anota o MAC de ORIGEM e a porta por onde ele entrou
  const ja = E.tab.find(x => x.mac === o.mac);
  if (!ja) {
    E.tab.push({ mac: o.mac, porta: o.porta, pc: de }); E.novo = o.mac; swHud(s);
    s.texto('sw', 'aprendi ' + o.mac, '--ok');
    s.log('Switch aprendeu: MAC <b>' + o.mac + '</b> está na porta ' + o.porta + '.', { bom: true });
    if (E.tab.length === 4 && E.apagou) Missoes.concluir('mac4');
    await s.esperar(500);
  }
  const conhecido = E.tab.find(x => x.mac === d.mac);
  if (conhecido) {
    E.alvo = d.mac; E.novo = null; swHud(s);
    s.balao('sw', d.mac + ' → porta ' + conhecido.porta, { dur: 1500 });
    s.log('Switch consulta a tabela: ' + d.mac + ' está na porta ' + conhecido.porta + '. Envia <b>só por ela</b>.', { tipo: 'dados' });
    const r2 = await s.enviar({ caminho: ['sw', para], rotulo: de + '→' + para, tipo: 'dados', dados: Object.assign({}, dados, { 'Saiu pela porta': String(conhecido.porta) }) });
    if (!r2.ok) { s.log('O quadro se perdeu: cabo desligado.', { ruim: true }); return false; }
    s.fxNo('certo', para); s.log('PC ' + para + ' recebeu o quadro.', { bom: true, pac: r2.pac });
    return true;
  }
  s.balao('sw', 'Não conheço ' + d.mac + '.\nEnvio para todas as portas!', { dur: 1900 });
  s.log('Switch não conhece ' + d.mac + ': <b>inunda</b> (envia por todas as portas, menos a de entrada).', { tipo: 'rede' });
  return swCopias(s, de, para, dados);
}
async function swCopias(s, de, para, dados) {
  const outros = Object.keys(SW_PCS).filter(x => x !== de);
  const res = await Promise.all(outros.map(x => s.enviar({ caminho: ['sw', x], rotulo: 'cópia', tipo: 'rede', dados: Object.assign({}, dados, { 'Situação': 'cópia enviada para todas as portas' }) })));
  let ok = false;
  res.forEach((r, i) => {
    const x = outros[i];
    if (!r.ok) return;
    if (x === para) { ok = true; s.fxNo('certo', x); s.log('PC ' + x + ': o quadro é para mim. Aceito.', { bom: true }); }
    else { s.texto(x, 'não é para mim', '--ink-2'); s.log('PC ' + x + ': o MAC de destino não é o meu. Descarto.'); }
  });
  return ok;
}

ABAS.push({
  id: 'comutacao', num: 5, nome: 'Comutação', nomeLongo: 'Comutação e roteamento', obrigatoria: true,
  titulo: 'Comutação e roteamento',
  resumo: 'O switch aprende onde está cada endereço MAC e entrega dentro da rede local. O roteador consulta a tabela de roteamento e leva o pacote, salto a salto, até outra rede.',
  mapa: 'Switch aprendendo a tabela MAC e roteador encaminhando salto a salto.',
  cenarios: [{
    id: 'switch', nome: 'Switch (MAC)',
    hudPos: 'nw',
    legenda: [['dados', 'Quadro Ethernet'], ['rede', 'Cópia por inundação']],
    params: () => ({ de: 'A', para: 'C', hub: false }),
    intro: { titulo: 'Como o switch sabe para onde mandar?', texto: 'O switch liga os computadores da mesma rede local. Ele começa <b>sem saber nada</b>: a tabela MAC está vazia. Clique em <b>Próximo passo</b> e veja a tabela ser preenchida.' },
    montar(s) {
      s.E = { tab: [], hub: !!s.P.hub, novo: null, alvo: null, apagou: false };
      s.no('sw', s.E.hub ? 'hub' : 'switch', .62, .2, s.E.hub ? 'Hub' : 'Switch', { tam: 1.25, mx: .5, my: .2, info: s2 => ({ 'Camada': s2.E.hub ? '1 (Física)' : '2 (Enlace)', 'Usa': s2.E.hub ? 'nada: só repete o sinal' : 'endereço MAC', 'Portas': '4' }) });
      const xs = [.1, .37, .63, .9];
      Object.keys(SW_PCS).forEach((k, i) => {
        const p = SW_PCS[k];
        s.no(k, 'pc', xs[i], .9, 'PC ' + k, { sub: 'MAC ' + p.mac, info: { 'Endereço MAC': p.mac, 'Endereço IP': p.ip, 'Ligado na porta': String(p.porta) } });
        s.cabo('sw', k, { rotulo: 'porta ' + p.porta, cortavel: true });
      });
      swHud(s);
    },
    passos: [
      { titulo: 'PC A envia para o PC C: o switch aprende e inunda',
        texto: 'O switch anota o <b>MAC de origem</b> (AA:11) e a porta por onde ele entrou. Como ainda não sabe onde está o MAC de destino, <b>inunda</b>: envia uma cópia por todas as outras portas.',
        async rodar(s) { await swQuadro(s, 'A', 'C'); } },
      { titulo: 'PC C responde: agora o switch já sabe onde está o A',
        texto: 'O switch aprende o MAC do C (porta 3). O destino, AA:11, já está na tabela: o quadro sai <b>só pela porta 1</b>. B e D nem ficam sabendo.',
        async rodar(s) { await swQuadro(s, 'C', 'A'); } },
      { titulo: 'PC A envia de novo para o PC C',
        texto: 'Agora o switch conhece os dois. Nada de inundação: o quadro vai direto para a porta 3. Isso economiza a rede e protege a conversa.',
        async rodar(s) { await swQuadro(s, 'A', 'C'); } },
      { titulo: 'PC B envia para o PC D',
        texto: 'Mesma regra: aprende o MAC de origem (BB:22). Ainda não conhece o DD:44, então inunda.',
        async rodar(s) { await swQuadro(s, 'B', 'D'); } },
      { titulo: 'PC D responde: tabela completa',
        texto: 'O switch aprende o último MAC. Com a tabela completa, cada quadro vai só para quem deve recebê-lo.',
        async rodar(s) { await swQuadro(s, 'D', 'B'); } },
      { titulo: 'E se fosse um hub?',
        texto: 'Trocamos o switch por um <b>hub</b>. O hub não lê endereços: <b>repete tudo para todas as portas</b>, sempre. A rede fica mais lenta (todos dividem o mesmo meio) e qualquer um vê o que não é seu.',
        async rodar(s) {
          const n = s.nos.get('sw'); s.E.hub = true; n.tipo = 'hub'; n.rotulo = 'Hub'; swHud(s);
          s.log('O switch foi trocado por um hub.', { ruim: true });
          await s.esperar(500);
          await swQuadro(s, 'A', 'C');
        } }
    ],
    experimente(ex, lab) {
      const opc = Object.keys(SW_PCS).map(k => [k, 'PC ' + k]);
      const l = ex.linha();
      ex.escolha('De', opc, lab.P.de, v => { lab.P.de = v; }, { em: l });
      ex.escolha('Para', opc, lab.P.para, v => { lab.P.para = v; }, { em: l });
      ex.botao('Enviar quadro', () => {
        if (lab.P.de === lab.P.para) { Avisos.mostrar('Escolha computadores diferentes.'); return; }
        lab.livre(async s => {
          s.explicar('Modo livre: PC ' + lab.P.de + ' para PC ' + lab.P.para, s.E.hub ? 'Com o hub, o quadro vai para todas as portas.' : 'Veja na tabela: se o switch conhece o destino, envia só por uma porta. Se não conhece, inunda.');
          await swQuadro(s, lab.P.de, lab.P.para);
        });
      });
      ex.chave('Usar um hub no lugar do switch', lab.P.hub, v => {
        lab.P.hub = v; const s = lab.cena, n = s.nos.get('sw');
        s.E.hub = v; n.tipo = v ? 'hub' : 'switch'; n.rotulo = v ? 'Hub' : 'Switch'; swHud(s);
        lab.registrar(v ? 'O switch foi trocado por um hub.' : 'O hub foi trocado por um switch.', {}, s);
      });
      ex.botao('Apagar a tabela MAC (reiniciar o switch)', () => {
        const s = lab.cena; s.E.tab = []; s.E.apagou = true; swHud(s);
        lab.registrar('A tabela MAC foi apagada. O switch vai aprender tudo de novo.', { ruim: true }, s);
      });
      caixaMissao(ex, 'mac4');
      ex.nota('Falha para provocar: <b>clique em um cabo</b> para desligá-lo e envie um quadro para aquele PC.');
    }
  }, {
    id: 'roteador', nome: 'Roteador (IP)',
    hudPos: 'nw',
    legenda: [['dados', 'Pacote IP'], ['rede', 'Aviso ICMP (erro)']],
    params: () => ({ ttl: 64 }),
    intro: { titulo: 'Como um pacote chega a outra rede?', texto: 'O PC da Rede A quer falar com um servidor da Rede B. Entre elas há <b>quatro roteadores</b> e dois caminhos possíveis. Cada roteador consulta a sua <b>tabela de roteamento</b> para escolher o próximo salto.' },
    montar(s) {
      s.E = { ver: 'r1', alvo: '', ttlVisto: null };
      s.zona('Rede A', .03, .55, .03, .55, { mx0: .03, my0: .55, mx1: .03, my1: .55 });
      s.zona('Rede B', .97, .55, .97, .55);
      s.no('pc', 'pc', .03, .55, 'PC', { sub: '192.168.1.10/24', info: { 'Endereço IP': '192.168.1.10', 'Máscara': '255.255.255.0 (/24)', 'Gateway padrão': '192.168.1.1 (R1)', 'Regra': 'destino fora da minha rede? mando para o gateway' } });
      s.no('r1', 'roteador', .27, .55, 'R1', { sub: '192.168.1.1', clicavel: true, dica: 'Clique para ver a tabela de roteamento do R1' });
      s.no('r2', 'roteador', .5, .2, 'R2', { sub: '172.16.0.2', clicavel: true, dica: 'Clique para ver a tabela de roteamento do R2' });
      s.no('r4', 'roteador', .5, .92, 'R4', { sub: '172.16.1.2', clicavel: true, dica: 'Clique para ver a tabela de roteamento do R4' });
      s.no('r3', 'roteador', .73, .55, 'R3', { sub: '10.0.0.1', clicavel: true, dica: 'Clique para ver a tabela de roteamento do R3' });
      s.no('srv', 'servidor', .97, .55, 'Servidor', { sub: '10.0.0.5/24', info: { 'Endereço IP': '10.0.0.5', 'Gateway padrão': '10.0.0.1 (R3)' } });
      s.cabo('pc', 'r1'); s.cabo('r1', 'r2', { cortavel: true }); s.cabo('r2', 'r3', { cortavel: true });
      s.cabo('r1', 'r4', { cortavel: true }); s.cabo('r4', 'r3', { cortavel: true }); s.cabo('r3', 'srv');
      rtHud(s);
    },
    aoClicarNo(s, n) { s.E.ver = n.id; rtHud(s); s.lab.inspecionar(n.rotulo, rtLinhas(s, n.id).map(l => [l[0], l[1]]), { sub: 'tabela de roteamento' }); },
    aoCortar(s) { rtHud(s); },
    passos: [
      { titulo: 'O PC percebe que o destino está em outra rede',
        texto: 'O PC compara: ele é <b>192.168.1.</b>10 e o servidor é <b>10.0.0.</b>5. Redes diferentes! Então ele entrega o pacote ao <b>gateway padrão</b> (R1), a "porta de saída" da rede.',
        async rodar(s) {
          s.E.pac = null;
          s.balao('pc', '10.0.0.5 não é da minha rede.\nVou mandar para o gateway.', { dur: 2200 });
          await s.esperar(900);
          const r = await s.enviar({ caminho: ['pc', 'r1'], rotulo: 'IP → 10.0.0.5', tipo: 'dados', manter: true, dados: rtDados(s.P.ttl) });
          s.E.pac = r.pac; s.E.pac.meta.ttl = s.P.ttl;
          s.log('PC envia o pacote ao gateway padrão R1 (192.168.1.1). TTL = ' + s.P.ttl + '.', { pac: r.pac });
        } },
      { titulo: 'R1 consulta a tabela de roteamento',
        texto: 'O R1 procura na tabela a linha que combina com o destino 10.0.0.5: a rede <b>10.0.0.0/24</b>. A tabela diz qual é o <b>próximo salto</b>. A cada roteador, o <b>TTL</b> diminui 1; se chegar a zero, o pacote é descartado (assim nenhum pacote fica rodando para sempre).',
        async rodar(s) { return rtSalto(s, 'r1'); } },
      { titulo: 'O próximo roteador faz o mesmo',
        texto: 'Cada roteador só decide o <b>próximo salto</b>; nenhum conhece o caminho inteiro. É como pedir informação na rua: cada pessoa aponta a próxima esquina.',
        async rodar(s) { return rtSalto(s, s.E.onde); } },
      { titulo: 'R3 entrega na rede de destino',
        texto: 'O R3 está ligado diretamente à rede 10.0.0.0/24. Ele entrega o pacote ao servidor. Chegou, salto a salto!',
        async rodar(s) { const r = await rtSalto(s, s.E.onde); return r === 'entregue' ? undefined : r; } },
      { titulo: 'Um link cai: o roteamento acha outro caminho',
        texto: 'O cabo entre R2 e R3 foi desligado. Os roteadores trocam informações entre si (protocolos como OSPF e RIP) e <b>atualizam as tabelas</b>: agora o caminho é pelo R4.',
        async rodar(s) {
          s.cortar('r2', 'r3', true); rtHud(s);
          s.log('Tabelas atualizadas: para 10.0.0.0/24, o R1 agora usa o R4.', { tipo: 'rede' });
          await s.esperar(700);
          await rtViagem(s, s.P.ttl);
        } }
    ],
    experimente(ex, lab) {
      ex.faixa('TTL inicial do pacote', { min: 1, max: 64, valor: lab.P.ttl, fmt: v => String(v) }, v => { lab.P.ttl = v; });
      ex.botao('Enviar um pacote do PC ao servidor', () => lab.livre(async s => {
        s.explicar('Modo livre', 'O pacote vai salto a salto. Com TTL baixo, ele é descartado no caminho. Com cabos desligados, as tabelas mudam ou o destino fica <b>inalcançável</b>.');
        await rtViagem(s, lab.P.ttl);
      }));
      caixaMissao(ex, 'ttl');
      ex.nota('Falha para provocar: <b>clique nos cabos</b> entre roteadores. Desligue um e a rota muda; desligue os dois caminhos e não há rota. Clique em um roteador para ver a tabela dele.');
    }
  }]
});

function rtDados(ttl) { return { 'Tipo': 'Pacote IP', 'IP de origem': '192.168.1.10', 'IP de destino': '10.0.0.5', 'TTL': String(ttl), 'Conteúdo': 'pedido ao servidor' }; }

/* menor caminho (em saltos) pelos cabos ligados */
function rtCaminho(s, de, para) {
  const viz = id => s.cabos.filter(c => !c.cortado && (c.a === id || c.b === id)).map(c => (c.a === id ? c.b : c.a));
  const antes = { [de]: null }, fila = [de];
  while (fila.length) {
    const x = fila.shift();
    if (x === para) break;
    for (const y of viz(x).sort()) if (!(y in antes)) { antes[y] = x; fila.push(y); }
  }
  if (!(para in antes)) return null;
  const cam = []; for (let x = para; x != null; x = antes[x]) cam.unshift(x);
  return cam;
}
function rtLinhas(s, r) {
  const nome = { r1: 'R1', r2: 'R2', r3: 'R3', r4: 'R4' };
  const linha = (rede, dono) => {
    if (r === dono) return [rede, 'entrega direta', 0];
    const c = rtCaminho(s, r, dono);
    return c ? [rede, nome[c[1]], c.length - 1] : [rede, 'sem rota', '-'];
  };
  return [linha('192.168.1.0/24', 'r1'), linha('10.0.0.0/24', 'r3')];
}
function rtHud(s) {
  const r = s.E.ver || 'r1';
  const linhas = rtLinhas(s, r).map(l => ({ cels: [l[0], l[1], l[2] === 0 ? '-' : String(l[2])], classe: s.E.alvo === r && l[0] === '10.0.0.0/24' ? 'alvo' : '' }));
  s.hud(tabelaViva('Tabela de roteamento do ' + r.toUpperCase(), ['Rede de destino', 'Próximo salto', 'Saltos'], linhas) + '<div class="hud-nota">Clique em outro roteador para ver a tabela dele.</div>');
}
/* um salto: o roteador "onde" consulta a tabela e passa o pacote adiante */
async function rtSalto(s, onde) {
  const pk = s.E.pac;
  if (!pk || !pk.vivo) return 'fim';
  s.E.ver = onde; s.E.alvo = onde; rtHud(s);
  if (onde === 'r3') {
    s.balao('r3', '10.0.0.0/24: entrega direta', { dur: 1700 });
    pk.meta.ttl--; pk.dados['TTL'] = String(pk.meta.ttl);
    s.log('R3: a rede 10.0.0.0/24 está ligada a mim. Entrego ao servidor. TTL = ' + pk.meta.ttl + '.', { pac: pk });
    await s.esperar(700);
    const r = await s.seguir(pk, ['r3', 'srv']);
    if (r.ok) { s.fxNo('certo', 'srv'); s.log('O servidor 10.0.0.5 recebeu o pacote.', { bom: true }); }
    s.E.alvo = ''; rtHud(s);
    return r.ok ? 'entregue' : 'fim';
  }
  const cam = rtCaminho(s, onde, 'r3');
  if (!cam) { s.matar(pk); s.log(onde.toUpperCase() + ': sem rota para 10.0.0.0/24. Pacote descartado.', { ruim: true }); return 'fim'; }
  const prox = cam[1];
  pk.meta.ttl--; pk.dados['TTL'] = String(pk.meta.ttl);
  s.balao(onde, '10.0.0.0/24 → ' + prox.toUpperCase() + '\nTTL agora: ' + pk.meta.ttl, { dur: 1700 });
  s.log(onde.toUpperCase() + ' consulta a tabela: 10.0.0.0/24 → próximo salto <b>' + prox.toUpperCase() + '</b>. TTL = ' + pk.meta.ttl + '.', { pac: pk });
  await s.esperar(800);
  if (pk.meta.ttl <= 0) { await rtTtlZero(s, pk, onde); return 'fim'; }
  const r = await s.seguir(pk, [onde, prox], { manter: true });
  if (!r.ok) { s.log('O pacote se perdeu: cabo desligado.', { ruim: true }); return 'fim'; }
  s.E.onde = prox;
}
async function rtTtlZero(s, pk, onde) {
  s.matar(pk);
  s.log(onde.toUpperCase() + ': TTL chegou a 0. Pacote <b>descartado</b>. Aviso ICMP "tempo esgotado" volta ao PC.', { ruim: true });
  const volta = rtCaminho(s, onde, 'pc');
  if (volta) await s.enviar({ caminho: volta, rotulo: 'ICMP: TTL esgotado', tipo: 'rede', dados: { 'Tipo': 'ICMP Time Exceeded (tempo esgotado)', 'Enviado por': onde.toUpperCase(), 'Para': '192.168.1.10', 'Motivo': 'TTL chegou a zero' } });
  Missoes.concluir('ttl');
}
/* viagem completa (modo livre e passo 5) */
async function rtViagem(s, ttl) {
  const r = await s.enviar({ caminho: ['pc', 'r1'], rotulo: 'IP → 10.0.0.5', tipo: 'dados', manter: true, dados: rtDados(ttl) });
  if (!r.ok) return;
  s.E.pac = r.pac; r.pac.meta.ttl = ttl;
  s.log('PC envia o pacote ao gateway padrão R1. TTL = ' + ttl + '.', { pac: r.pac });
  let onde = 'r1';
  for (let i = 0; i < 6; i++) {
    const fim = await rtSalto(s, onde);
    if (fim === 'fim' || fim === 'entregue') return;
    onde = s.E.onde;
  }
}

Missoes.definir('mac4', 'Apague a tabela MAC e faça o switch aprender os 4 endereços de novo', 10, 'comutacao');
Missoes.definir('ttl', 'Envie um pacote com TTL baixo e veja um roteador descartá-lo', 10, 'comutacao');

/* ---------- ABA 6: TOPOLOGIAS E EQUIPAMENTOS — barramento, estrela, anel, malha; hub × switch ---------- */

function topoBFS(s, de, para) {
  const viz = id => s.cabos.filter(c => !c.cortado && (c.a === id || c.b === id)).map(c => (c.a === id ? c.b : c.a)).filter(x => !s.nos.get(x).desligado);
  if (s.nos.get(de).desligado) return null;
  const antes = { [de]: null }, fila = [de];
  while (fila.length) {
    const x = fila.shift();
    if (x === para) break;
    for (const y of viz(x).sort()) if (!(y in antes)) { antes[y] = x; fila.push(y); }
  }
  if (!(para in antes)) return null;
  const c = []; for (let x = para; x != null; x = antes[x]) c.unshift(x);
  return c;
}
function topoDados(s, de, para) {
  return { 'Tipo': 'Mensagem', 'De': s.nos.get(de).rotulo, 'Para': s.nos.get(para).rotulo, 'Topologia': s.lab.def.nome };
}
function topoAceita(s, para, r) {
  if (r.ok) { s.fxNo('certo', para); s.log(s.nos.get(para).rotulo + ' recebeu a mensagem.', { bom: true, pac: r.pac }); return true; }
  return false;
}

/* cada topologia tem o seu jeito de levar a mensagem */
const TOPO_ENVIO = {
  async estrela(s, de, para) {
    const c = s.nos.get('c'), hub = s.E.hub;
    const r = await s.enviar({ caminho: [de, 'c'], rotulo: 'msg', tipo: 'dados', dados: topoDados(s, de, para) });
    if (!r.ok) {
      s.log(r.motivo === 'no' ? 'O ' + c.rotulo + ' está desligado: <b>ninguém</b> se comunica.' : 'O cabo de ' + s.nos.get(de).rotulo + ' está desligado: só ele fica isolado.', { ruim: true });
      return false;
    }
    if (!hub) {
      s.log('Switch envia só para a porta de ' + s.nos.get(para).rotulo + '.', { tipo: 'dados' });
      const r2 = await s.enviar({ caminho: ['c', para], rotulo: 'msg', tipo: 'dados', dados: topoDados(s, de, para) });
      if (!r2.ok) s.log('Cabo de ' + s.nos.get(para).rotulo + ' desligado: a mensagem não chega.', { ruim: true });
      return topoAceita(s, para, r2);
    }
    s.log('Hub repete a mensagem para <b>todas</b> as portas.', { tipo: 'rede' });
    const outros = s.E.pcs.filter(x => x !== de);
    const rs = await Promise.all(outros.map(x => s.enviar({ caminho: ['c', x], rotulo: 'cópia', tipo: 'rede', dados: topoDados(s, de, para) })));
    let ok = false;
    rs.forEach((rr2, i) => { if (!rr2.ok) return; if (outros[i] === para) ok = topoAceita(s, para, rr2); else s.texto(outros[i], 'descarta', '--ink-2'); });
    return ok;
  },
  async barramento(s, de, para) {
    const J = s.E.junta, cortado = s.cabos.some(c => c.tronco && c.cortado);
    const r = await s.enviar({ caminho: [de, J[de]], rotulo: 'sinal', tipo: 'dados', dados: topoDados(s, de, para), mudo: true });
    if (!r.ok) { s.log('O cabo de ' + s.nos.get(de).rotulo + ' está desligado: só ele fica isolado.', { ruim: true }); return false; }
    if (cortado) {
      const cb = s.cabos.find(c => c.tronco && c.cortado), g = cb.geo;
      s.fx('faisca', (g.A.x + g.B.x) / 2, (g.A.y + g.B.y) / 2, { cor: '--p-ataque', dur: 900 });
      s.balao(J[de], 'O sinal bate na ponta solta\ne volta: colisão!', { dur: 2200 });
      s.log('O cabo principal está partido: o sinal reflete na ponta solta e se embaralha. <b>A rede inteira para.</b>', { ruim: true });
      await s.esperar(1200);
      return false;
    }
    s.log('O sinal se espalha pelo cabo principal e chega a <b>todos</b> os computadores.', { tipo: 'rede' });
    const ordem = s.E.tronco, outros = s.E.pcs.filter(x => x !== de);
    const rs = await Promise.all(outros.map(x => {
      const a = ordem.indexOf(J[de]), b = ordem.indexOf(J[x]);
      const seg = a <= b ? ordem.slice(a, b + 1) : ordem.slice(b, a + 1).reverse();
      return s.enviar({ caminho: seg.concat([x]), rotulo: x === para ? 'msg' : 'cópia', tipo: x === para ? 'dados' : 'rede', pausaNo: 0, dados: topoDados(s, de, para) });
    }));
    let ok = false;
    rs.forEach((rr2, i) => { if (!rr2.ok) return; if (outros[i] === para) ok = topoAceita(s, para, rr2); else s.texto(outros[i], 'descarta', '--ink-2'); });
    return ok;
  },
  async anel(s, de, para) {
    const A = s.E.pcs, i0 = A.indexOf(de), cam = [de];
    for (let i = (i0 + 1) % A.length; ; i = (i + 1) % A.length) { cam.push(A[i]); if (A[i] === para) break; }
    s.log('No anel, a mensagem anda em <b>um só sentido</b> (horário), passando de computador em computador.', { tipo: 'dados' });
    const r = await s.enviar({ caminho: cam, rotulo: 'msg', tipo: 'dados', pausaNo: 260, dados: topoDados(s, de, para),
      aoSaltar: (no) => { if (no !== para) s.texto(no, 'repassa', '--ink-2'); } });
    if (!r.ok) { s.log(r.motivo === 'no' ? 'Um computador do anel está desligado: ele não repassa e o anel se rompe.' : 'Um cabo do anel está partido: a mensagem não tem como dar a volta.', { ruim: true }); return false; }
    return topoAceita(s, para, r);
  },
  async malha(s, de, para) {
    const cam = topoBFS(s, de, para);
    if (!cam) { s.log('Não existe nenhum caminho ligado entre os dois.', { ruim: true }); s.balao(de, 'Sem caminho!', { dur: 1600 }); await s.esperar(800); return false; }
    s.log('Caminho escolhido: ' + cam.map(x => s.nos.get(x).rotulo).join(' → ') + '.', { tipo: 'dados' });
    const r = await s.enviar({ caminho: cam, rotulo: 'msg', tipo: 'dados', dados: topoDados(s, de, para) });
    return topoAceita(s, para, r);
  }
};

const TOPO_TXT = {
  estrela: { pro: 'fácil de montar e de achar defeitos; um cabo ruim só derruba um computador', contra: 'se o equipamento central (switch ou hub) parar, todos param', uso: 'quase todas as redes de casa e de escritório' },
  barramento: { pro: 'barata: um só cabo principal e pouco cabo no total', contra: 'um rompimento no cabo principal derruba todos; só um fala por vez e há colisões', uso: 'redes antigas com cabo coaxial (anos 1980 e 1990)' },
  anel: { pro: 'cada computador repassa o sinal, sem colisões; tráfego organizado', contra: 'no anel simples, um cabo ou um computador com defeito interrompe o anel', uso: 'redes Token Ring e anéis de fibra de operadoras (que usam anel duplo)' },
  malha: { pro: 'vários caminhos: se um link cai, os dados desviam por outro', contra: 'muito cabo e configuração mais complexa, por isso é cara', uso: 'o núcleo da Internet e redes de operadoras' }
};
function topoQuadro(lab, el, t) {
  const T = TOPO_TXT[t];
  el.append(h('h3', null, 'Topologia em ' + lab.def.nome.toLowerCase() + ': prós e contras'),
    h('dl', { class: 'prosc' },
      h('div', null, h('dt', null, 'Vantagem'), h('dd', null, T.pro + '.')),
      h('div', null, h('dt', null, 'Desvantagem'), h('dd', null, T.contra + '.')),
      h('div', null, h('dt', null, 'Onde se usa'), h('dd', null, T.uso + '.'))));
}

function topoCenario(t, nome, montar, passos, extras) {
  return {
    id: t, nome, proporcao: .56,
    extra(lab, el) { topoQuadro(lab, el, t); },
    legenda: [['dados', 'Mensagem'], ['rede', 'Cópia que não é para aquele PC']],
    dicaInspetor: 'Clique em um <b>computador</b> para ligá-lo ou desligá-lo. Clique em um <b>cabo</b> para desligá-lo. Clique em um pacote para ver os dados.',
    params: () => ({ de: 'p1', para: 'p3', hub: false }),
    intro: { titulo: 'Topologia em ' + nome.toLowerCase(), texto: 'A <b>topologia</b> é o desenho de como os equipamentos estão ligados. Clique em <b>Iniciar</b>: primeiro a rede funcionando, depois uma falha.' },
    montar(s) { s.E = { hub: !!s.P.hub, pcs: [] }; montar(s); },
    aoClicarNo(s, n) {
      if (n.tipo === 'junta' || n.tipo === 'terminador') return false;
      n.desligado = !n.desligado;
      s.lab.registrar(n.rotulo + (n.desligado ? ' foi desligado.' : ' foi ligado de novo.'), n.desligado ? { ruim: true } : { bom: true }, s);
      return true;
    },
    passos,
    experimente(ex, lab) {
      const opc = () => lab.cena.E.pcs.map(k => [k, lab.cena.nos.get(k).rotulo]);
      const l = ex.linha();
      ex.escolha('De', opc(), lab.P.de, v => { lab.P.de = v; }, { em: l });
      ex.escolha('Para', opc(), lab.P.para, v => { lab.P.para = v; }, { em: l });
      ex.botao('Enviar mensagem', () => {
        if (lab.P.de === lab.P.para) { Avisos.mostrar('Escolha computadores diferentes.'); return; }
        lab.livre(async s => { s.explicar('Modo livre', 'Desligue cabos ou computadores (clicando neles) e envie de novo para ver como esta topologia reage.'); await TOPO_ENVIO[t](s, lab.P.de, lab.P.para); });
      });
      if (extras) extras(ex, lab);
      ex.nota('Falha para provocar: <b>clique em um cabo</b> para desligá-lo ou <b>clique em um computador</b> para desligá-lo.');
    }
  };
}
function topoPassoNormal(t, txt) {
  return { titulo: 'A rede funcionando', texto: txt, async rodar(s) { await TOPO_ENVIO[t](s, 'p1', 'p3'); } };
}

ABAS.push({
  id: 'topologias', num: 6, nome: 'Topologias', nomeLongo: 'Topologias e equipamentos', obrigatoria: false,
  titulo: 'Topologias e equipamentos',
  resumo: 'Barramento, estrela, anel e malha: como cada desenho de rede leva as mensagens e o que acontece quando um cabo ou equipamento falha.',
  mapa: 'Barramento, estrela, anel e malha, com falhas; hub × switch.',
  cenarios: [
    topoCenario('estrela', 'Estrela', s => {
      const n = 5;
      s.no('c', s.E.hub ? 'hub' : 'switch', .5, .5, s.E.hub ? 'Hub' : 'Switch', { tam: 1.2, clicavel: true, dica: 'Clique para ligar ou desligar o equipamento central' });
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + TAU * i / n, id = 'p' + (i + 1);
        s.no(id, 'pc', .5 + Math.cos(a) * .36, .5 + Math.sin(a) * .5, 'PC ' + (i + 1), { clicavel: true, dica: 'Clique para ligar ou desligar' });
        s.cabo('c', id, { cortavel: true }); s.E.pcs.push(id);
      }
    }, [
      topoPassoNormal('estrela', 'Na <b>estrela</b>, todos se ligam a um equipamento central. O PC 1 envia para o PC 3 e o <b>switch</b> entrega só para ele.'),
      { titulo: 'Um cabo falha: só um PC fica de fora',
        texto: 'O cabo do PC 3 foi desligado. Só o PC 3 fica isolado; o resto da rede continua funcionando.',
        async rodar(s) {
          s.cortar('c', 'p3', true); await s.esperar(500);
          await TOPO_ENVIO.estrela(s, 'p1', 'p3'); await s.esperar(300);
          await TOPO_ENVIO.estrela(s, 'p1', 'p4');
          s.cortar('c', 'p3', false);
        } },
      { titulo: 'O equipamento central falha: todos param',
        texto: 'Agora o switch parou. Como tudo passa por ele, <b>ninguém</b> consegue se comunicar. Esse é o ponto fraco da estrela.',
        async rodar(s) {
          const c = s.nos.get('c'); c.desligado = true; s.log('O ' + c.rotulo + ' central foi desligado.', { ruim: true });
          await s.esperar(400); await TOPO_ENVIO.estrela(s, 'p2', 'p5');
          await s.esperar(600); c.desligado = false; s.log('O ' + c.rotulo + ' foi ligado de novo.', { bom: true });
        } },
      { titulo: 'Hub × switch',
        texto: 'Trocamos o switch por um <b>hub</b>. O hub <b>repete para todos</b>; o switch <b>envia só ao destino</b>. Com hub, a rede fica mais lenta e menos segura.',
        async rodar(s) {
          const c = s.nos.get('c'); s.E.hub = true; c.tipo = 'hub'; c.rotulo = 'Hub';
          s.log('O switch foi trocado por um hub.', { tipo: 'rede' });
          await s.esperar(400); await TOPO_ENVIO.estrela(s, 'p1', 'p3');
        } }
    ], (ex, lab) => {
      ex.chave('Equipamento central é um hub (em vez de switch)', lab.P.hub, v => {
        lab.P.hub = v; const c = lab.cena.nos.get('c'); lab.cena.E.hub = v; c.tipo = v ? 'hub' : 'switch'; c.rotulo = v ? 'Hub' : 'Switch';
        lab.registrar(v ? 'Agora o centro é um hub: repete para todos.' : 'Agora o centro é um switch: envia só ao destino.', {}, lab.cena);
      });
    }),
    topoCenario('barramento', 'Barramento', s => {
      const xs = [.12, .37, .63, .88];
      s.no('t0', 'terminador', 0, .5, ''); s.no('t1', 'terminador', 1, .5, '');
      const tronco = ['t0'];
      xs.forEach((x, i) => { const j = 'j' + (i + 1); s.no(j, 'junta', x, .5, ''); tronco.push(j); });
      tronco.push('t1');
      for (let i = 0; i < tronco.length - 1; i++) { const cb = s.cabo(tronco[i], tronco[i + 1], { cortavel: i > 0 && i < tronco.length - 2, larg: 5 }); cb.tronco = true; }
      s.E.tronco = tronco; s.E.junta = {};
      xs.forEach((x, i) => {
        const id = 'p' + (i + 1), y = i % 2 ? .95 : .08;
        s.no(id, 'pc', x, y, 'PC ' + (i + 1), { clicavel: true, dica: 'Clique para ligar ou desligar', acima: !(i % 2) });
        s.cabo('j' + (i + 1), id, { cortavel: true }); s.E.pcs.push(id); s.E.junta[id] = 'j' + (i + 1);
      });
      s.nos.get('p1').acima = false;
    }, [
      topoPassoNormal('barramento', 'No <b>barramento</b>, todos ficam pendurados em um único cabo principal. O sinal se espalha para todos; só o destino aceita a mensagem.'),
      { titulo: 'O cabo principal se rompe',
        texto: 'O cabo principal partiu entre o PC 2 e o PC 3. Sem o terminador naquela ponta, o sinal <b>reflete</b> e se embaralha: a rede inteira para, não só uma parte.',
        async rodar(s) { s.cortar('j2', 'j3', true); await s.esperar(500); await TOPO_ENVIO.barramento(s, 'p1', 'p2'); } }
    ]),
    topoCenario('anel', 'Anel', s => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + TAU * i / n, id = 'p' + (i + 1);
        s.no(id, 'pc', .5 + Math.cos(a) * .3, .5 + Math.sin(a) * .5, 'PC ' + (i + 1), { clicavel: true, dica: 'Clique para ligar ou desligar' });
        s.E.pcs.push(id);
      }
      for (let i = 0; i < n; i++) s.cabo(s.E.pcs[i], s.E.pcs[(i + 1) % n], { cortavel: true });
    }, [
      topoPassoNormal('anel', 'No <b>anel</b>, cada computador liga no próximo e o último liga no primeiro. A mensagem dá a volta, e cada PC no caminho <b>repassa</b>.'),
      { titulo: 'Um cabo do anel se rompe',
        texto: 'O cabo entre o PC 2 e o PC 3 partiu. Como os dados só andam em um sentido, a mensagem não chega. Por isso as operadoras usam <b>anel duplo</b>: um segundo anel no sentido contrário.',
        async rodar(s) { s.cortar('p2', 'p3', true); await s.esperar(500); await TOPO_ENVIO.anel(s, 'p1', 'p3'); } }
    ]),
    topoCenario('malha', 'Malha', s => {
      const P = [[.08, .5], [.36, .08], [.36, .92], [.68, .3], [.92, .7]];
      P.forEach((p, i) => { const id = 'p' + (i + 1); s.no(id, 'roteador', p[0], p[1], 'R' + (i + 1), { clicavel: true, dica: 'Clique para ligar ou desligar' }); s.E.pcs.push(id); });
      [['p1', 'p2'], ['p1', 'p3'], ['p2', 'p3'], ['p2', 'p4'], ['p3', 'p4'], ['p3', 'p5'], ['p4', 'p5']].forEach(c => s.cabo(c[0], c[1], { cortavel: true }));
      s.nos.get('p2').acima = true;
    }, [
      topoPassoNormal('malha', 'Na <b>malha</b>, os equipamentos têm vários caminhos entre si. A mensagem vai pelo caminho mais curto.'),
      { titulo: 'Um link cai: a mensagem desvia',
        texto: 'O link entre R1 e R3 foi desligado. Sem problema: existe outro caminho. É assim que o núcleo da Internet continua funcionando quando um cabo é cortado.',
        async rodar(s) { s.cortar('p1', 'p3', true); await s.esperar(500); await TOPO_ENVIO.malha(s, 'p1', 'p3'); } },
      { titulo: 'Malha completa × malha parcial',
        texto: 'Aqui é uma <b>malha parcial</b>: nem todos se ligam a todos. Na <b>malha completa</b>, cada um se liga a todos os outros: com 5 equipamentos seriam 10 cabos. Muito confiável, mas cara.',
        async rodar(s) { await s.esperar(600); } }
    ])
  ]
});

/* ---------- ABA 7: MEIOS DE TRANSMISSÃO — par trançado, fibra óptica e Wi-Fi ---------- */

const MEIOS = [
  { id: 'cobre', nome: 'Par trançado (cobre)', sinal: 'eletricidade', taxa: 'até 1 Gb/s (Cat 6: 10 Gb/s em até 55 m)', alcance: '100 m por trecho', interf: 'média: motores e fios elétricos atrapalham', bits: 7, estilo: 'cabo', cor: '--p-tcp' },
  { id: 'fibra', nome: 'Fibra óptica', sinal: 'luz', taxa: '10 Gb/s ou mais', alcance: 'de centenas de metros a dezenas de km', interf: 'nenhuma: luz não sofre interferência elétrica', bits: 12, estilo: 'fibra', cor: '--p-dns' },
  { id: 'wifi', nome: 'Wi-Fi (ondas de rádio)', sinal: 'ondas de rádio', taxa: 'centenas de Mb/s, divididos entre todos', alcance: 'cerca de 30 a 50 m em ambiente fechado', interf: 'alta: paredes, micro-ondas e outras redes', bits: 5, estilo: 'wifi', cor: '--p-udp' }
];
const DISTANCIAS = [5, 30, 80, 150, 300, 1000, 5000];
const fmtDist = m => (m >= 1000 ? (m / 1000).toString().replace('.', ',') + ' km' : m + ' m');

function meioPerda(M, d, interf) {
  let p = 0;
  if (M.id === 'cobre') { if (d > 100) p = Math.min(.95, .55 + (d - 100) / 500); if (interf) p = Math.max(p, .3); }
  if (M.id === 'wifi') { if (d > 40) p = Math.min(.97, .35 + (d - 40) / 120); if (interf) p = Math.max(p, .5); }
  if (M.id === 'fibra' && d > 40000) p = .9;
  return p;
}
function meioHud(s) {   // o resultado aparece no rótulo de cada cabo
  const E = s.E;
  for (const M of MEIOS) {
    const cb = s.caboEntre('tx-' + M.id, 'rx-' + M.id);
    if (cb) cb.rotulo = M.nome + (E.env[M.id] ? ':  chegaram ' + E.cheg[M.id] + ' de ' + E.env[M.id] + ' bits' : '');
  }
}
async function meioRajada(s) {
  const E = s.E, d = s.P.dist, interf = s.P.interf, JANELA = 2600;
  E.env = {}; E.cheg = {}; meioHud(s);
  const tarefas = [];
  for (const M of MEIOS) {
    const p = meioPerda(M, d, interf);
    E.env[M.id] = M.bits; E.cheg[M.id] = 0;
    let acc = .5;
    for (let i = 0; i < M.bits; i++) {
      acc += p; const perde = acc >= 1; if (perde) acc -= 1;
      const b = (i * 7 + M.bits) % 3 ? '1' : '0';
      tarefas.push(s.enviar({
        caminho: ['tx-' + M.id, 'rx-' + M.id], rotulo: b, tipo: 'bits', mini: true, desvio: 0, mudo: true, atraso: i * JANELA / M.bits, vel: .9,
        dados: { 'Tipo': 'Bit', 'Valor': b, 'Meio': M.nome, 'Viaja como': M.sinal, 'Distância': fmtDist(d) },
        perderEm: perde ? { seg: 0, k: .35 + ((i * 37) % 50) / 100 } : null
      }).then(r => { if (r.ok) { E.cheg[M.id]++; s.pulsar('rx-' + M.id); } else { const pp = s.posPacote(r.pac); s.fx('xis', pp.x, pp.y); } meioHud(s); }));
    }
  }
  await Promise.all(tarefas);
  const res = MEIOS.map(M => M.nome.split(' (')[0] + ': ' + E.cheg[M.id] + '/' + E.env[M.id]).join(', ');
  s.log('Resultado com ' + fmtDist(d) + (interf ? ' e interferência' : '') + ': ' + res + '.', { tipo: 'bits' });
}

ABAS.push({
  id: 'meios', num: 7, nome: 'Meios', nomeLongo: 'Meios de transmissão', obrigatoria: false,
  titulo: 'Meios de transmissão',
  resumo: 'Os mesmos bits enviados por cabo de cobre, fibra óptica e Wi-Fi: quantos passam por segundo, até que distância e o que a interferência faz.',
  mapa: 'Cobre, fibra e Wi-Fi: velocidade, distância e interferência.',
  cenarios: [{
    id: 'comparar', nome: 'Comparar meios',
    legenda: [['bits', 'Bit (0 ou 1)']],
    params: () => ({ dist: 30, interf: false }),
    intro: { titulo: 'Três jeitos de levar bits', texto: 'Os três computadores da esquerda enviam bits ao mesmo tempo, durante o mesmo intervalo. Em cima pelo <b>cobre</b>, no meio pela <b>fibra</b>, embaixo pelo <b>Wi-Fi</b>. Clique em <b>Iniciar</b>.' },
    montar(s) {
      s.E = { env: {}, cheg: {} };
      MEIOS.forEach((M, i) => {
        const y = [.06, .5, .94][i];
        s.no('tx-' + M.id, 'pc', .05, y, 'Envia', { info: { 'Meio': M.nome } });
        s.no('rx-' + M.id, M.id === 'wifi' ? 'laptop' : 'pc', .95, y, 'Recebe', { info: { 'Meio': M.nome, 'Sinal': M.sinal, 'Velocidade típica': M.taxa, 'Alcance': M.alcance, 'Interferência': M.interf } });
        const cb = s.cabo('tx-' + M.id, 'rx-' + M.id, { estilo: M.estilo, rotulo: M.nome, larg: M.id === 'fibra' ? 3 : 3, cor: M.cor });
        cb.corRotulo = M.cor;
      });
      meioHud(s);
    },
    fundo(c, s) {
      if (!s.P.interf) return;
      const p = s.palco, x = p.W * .5, y = (s.pos('tx-cobre').y + s.pos('tx-fibra').y) / 2;
      c.save(); c.strokeStyle = Tema.cor('--bad'); c.globalAlpha = .35; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const r = 20 + ((s.t / 12 + i * 30) % 90); c.globalAlpha = .4 * (1 - r / 110); c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
      c.globalAlpha = 1; c.fillStyle = Tema.cor('--bad'); c.font = '700 11px ' + s.F.corpo; c.textAlign = 'center';
      c.fillText('interferência', x, y + 4);
      c.restore();
    },
    passos: [
      { titulo: 'Bits viajando: eletricidade, luz e rádio',
        texto: 'No <b>cobre</b>, os bits são pulsos elétricos. Na <b>fibra</b>, pulsos de luz. No <b>Wi-Fi</b>, ondas de rádio pelo ar. Repare: em todos, o sinal viaja quase na mesma rapidez. A diferença está em <b>quantos bits cabem por segundo</b>.',
        async rodar(s) { await meioRajada(s); } },
      { titulo: 'Largura de banda: quantos bits por segundo',
        texto: 'No mesmo tempo, a fibra entregou mais bits, depois o cobre, depois o Wi-Fi. Isso é a <b>largura de banda</b>: a capacidade do meio, medida em bits por segundo (Mb/s, Gb/s).',
        async rodar(s) { for (const M of MEIOS) s.pulsar('rx-' + M.id); s.log('No mesmo tempo: fibra ' + s.E.cheg.fibra + ' bits, cobre ' + s.E.cheg.cobre + ', Wi-Fi ' + s.E.cheg.wifi + '.', { tipo: 'bits' }); await s.esperar(1800); } },
      { titulo: 'Interferência: o ruído estraga bits',
        texto: 'Ligamos um motor perto dos cabos. A eletricidade do motor <b>atrapalha o cobre</b> e o rádio <b>atrapalha o Wi-Fi</b>: alguns bits se perdem. A fibra usa luz e <b>não sofre</b> interferência elétrica.',
        async rodar(s) { s.P.interf = true; if (s.P.ui) s.P.ui.interf.set(true); s.log('Interferência ligada.', { ruim: true }); await meioRajada(s); } },
      { titulo: 'Distância: cada meio tem um limite',
        texto: 'Agora 300 metros, sem interferência. O <b>cobre</b> só garante 100 m por trecho e o <b>Wi-Fi</b> perde sinal depois de algumas dezenas de metros. A <b>fibra</b> chega a quilômetros. Por isso as operadoras ligam bairros e cidades com fibra.',
        async rodar(s) {
          s.P.interf = false; s.P.dist = 300;
          if (s.P.ui) { s.P.ui.interf.set(false); s.P.ui.dist.set(DISTANCIAS.indexOf(300)); }
          s.log('Distância mudou para 300 m. Interferência desligada.');
          await meioRajada(s);
        } }
    ],
    experimente(ex, lab) {
      const dist = ex.faixa('Distância', { min: 0, max: DISTANCIAS.length - 1, valor: DISTANCIAS.indexOf(lab.P.dist), fmt: v => fmtDist(DISTANCIAS[v]) }, v => { lab.P.dist = DISTANCIAS[v]; meioHud(lab.cena); });
      const interf = ex.chave('Interferência (motor ligado perto)', lab.P.interf, v => { lab.P.interf = v; meioHud(lab.cena); });
      lab.P.ui = { dist, interf };
      ex.botao('Enviar bits pelos três meios', () => lab.livre(async s => {
        s.explicar('Modo livre', 'Mude a distância e a interferência e compare quantos bits chegam em cada meio.');
        await meioRajada(s);
      }));
      ex.nota('Tente: 150 m sem interferência (o cobre passa do limite) e 5 m com interferência (só a fibra entrega tudo).');
    },
    aoReiniciar(lab) { lab.P.dist = 30; lab.P.interf = false; if (lab.P.ui) { lab.P.ui.dist.set(DISTANCIAS.indexOf(30)); lab.P.ui.interf.set(false); } meioHud(lab.cena); }
  }]
});

/* ---------- ABA 8: DIAGNÓSTICO — terminal com ipconfig, ping, tracert e nslookup ---------- */

const DG = {
  ips: { pc: '192.168.0.10', rt: '192.168.0.1', isp: '100.64.0.1', core: '200.160.0.1', web: '203.0.113.10', dns: '8.8.8.8' },
  nomes: { 'www.exemplo.com.br': 'web', 'exemplo.com.br': 'web', 'dns.google': 'dns' },
  lat: { 'pc~rt': 1, 'rt~isp': 6, 'isp~core': 9, 'core~web': 4, 'core~dns': 5 },   // ms em cada sentido
  falhas: [
    ['cabo', 'Cabo do PC desconectado'],
    ['provedor', 'Link do provedor caído'],
    ['dns', 'Servidor DNS fora do ar'],
    ['web', 'Servidor do site desligado']
  ]
};
function dgCaminho(alvo) { return alvo === 'dns' ? ['pc', 'rt', 'isp', 'core', 'dns'] : alvo === 'web' ? ['pc', 'rt', 'isp', 'core', 'web'] : ['pc', 'rt', 'isp', 'core'].slice(0, ['pc', 'rt', 'isp', 'core'].indexOf(alvo) + 1); }
function dgRtt(cam) { let t = 0; for (let i = 0; i < cam.length - 1; i++) t += DG.lat[cam[i] + '~' + cam[i + 1]] || 1; return 2 * t; }
function dgFalha(s, f) { return s.E.falhas[f] || s.E.misterio === f; }
function dgAplicar(s) {
  const m = s.E.misterio, F = s.E.falhas, c1 = s.caboEntre('pc', 'rt'), c2 = s.caboEntre('isp', 'core');
  c1.cortado = !!F.cabo || m === 'cabo'; c1.disfarce = m === 'cabo';          // defeito misterioso: o cabo parece normal
  c2.cortado = !!F.provedor || m === 'provedor'; c2.disfarce = m === 'provedor';
  for (const id of ['dns', 'web']) { const n = s.nos.get(id); n.desligado = !!F[id]; n.morto = m === id; }
}

/* ----- o terminal ----- */
function dgTerm(s) { return s.lab.term; }
function dgSai(s, txt, cls) { const t = dgTerm(s); if (!t) return; t.saida.append(h('div', { class: 'tl' + (cls ? ' ' + cls : '') }, txt)); t.saida.scrollTop = t.saida.scrollHeight; }
async function dgDigitar(s, cmd) {
  const t = dgTerm(s);
  const l = h('div', { class: 'tl tl-cmd' }, h('span', { class: 'tp' }, 'C:\\Users\\Ana> '), '');
  t.saida.append(l);
  for (let i = 1; i <= cmd.length; i++) { l.lastChild.textContent = cmd.slice(0, i); t.saida.scrollTop = t.saida.scrollHeight; await s.esperar(55); }
  await s.esperar(250);
}
function dgResolverIp(s, alvo) {
  for (const k in DG.ips) if (DG.ips[k] === alvo) return k;
  return null;
}
/* um pacote vai e volta; o servidor "morto" (desligado de verdade) não responde */
async function dgIdaVolta(s, cam, rot, rotVolta, tipo, dados) {
  const destino = s.nos.get(cam[cam.length - 1]);
  const r = await s.enviar({ caminho: cam, rotulo: rot, tipo, vel: 1.6, pausaNo: 40, dados });
  if (!r.ok) return { ok: false, motivo: r.motivo, onde: r.cabo ? r.cabo.a : null };
  if (destino.morto) { s.fx('xis', s.pos(destino).x, s.pos(destino).y); return { ok: false, motivo: 'semresposta' }; }
  const v = await s.enviar({ caminho: cam.slice().reverse(), rotulo: rotVolta, tipo, vel: 1.6, pausaNo: 40, dados: { 'Tipo': 'Resposta', 'De': DG.ips[cam[cam.length - 1]] } });
  return { ok: v.ok, motivo: v.motivo };
}
async function dgDns(s, nome) {
  const alvo = DG.nomes[nome.toLowerCase()];
  const r = await dgIdaVolta(s, dgCaminho('dns'), 'DNS ?', alvo ? 'DNS ' + DG.ips[alvo] : 'DNS: não existe', 'dns', { 'Tipo': 'Pergunta DNS', 'Pergunta': 'qual é o IP de ' + nome + '?', 'Servidor DNS': DG.ips.dns, 'Porta': '53' });
  if (!r.ok) return { ok: false, motivo: r.motivo };
  return alvo ? { ok: true, alvo } : { ok: false, motivo: 'nome' };
}

const DG_CMD = {
  async ipconfig(s) {
    dgSai(s, '');
    dgSai(s, 'Adaptador Ethernet:');
    if (dgFalha(s, 'cabo')) { dgSai(s, '   Estado da mídia . . . . . . : mídia desconectada', 'erro'); s.log('ipconfig: o cabo de rede do PC está desconectado.', { ruim: true }); return; }
    s.pulsar('pc');
    dgSai(s, '   Endereço IPv4 . . . . . . . : ' + DG.ips.pc);
    dgSai(s, '   Máscara de sub-rede . . . . : 255.255.255.0');
    dgSai(s, '   Gateway padrão  . . . . . . : ' + DG.ips.rt);
    dgSai(s, '   Servidores DNS  . . . . . . : ' + DG.ips.dns);
    s.log('ipconfig mostrou o IP do PC, o gateway padrão e o DNS. Nenhum pacote sai da máquina.');
  },
  async ping(s, arg) {
    if (!arg) { dgSai(s, 'Use: ping <nome ou IP>. Exemplo: ping www.exemplo.com.br', 'dim'); return; }
    let alvo = dgResolverIp(s, arg), ip = arg;
    if (!alvo) {
      const r = await dgDns(s, arg);
      if (!r.ok) {
        dgSai(s, 'A solicitação ping não pôde encontrar o host ' + arg + '. Verifique o nome e tente novamente.', 'erro');
        s.log('ping: o nome ' + esc(arg) + ' não foi traduzido em IP (DNS sem resposta ou nome inexistente).', { ruim: true });
        return;
      }
      alvo = r.alvo; ip = DG.ips[alvo];
    }
    if (alvo === 'pc') { dgSai(s, 'Disparando ' + ip + ': resposta imediata (é o próprio PC).'); return; }
    const cam = dgCaminho(alvo);
    dgSai(s, '');
    dgSai(s, 'Disparando ' + (arg !== ip ? arg + ' [' + ip + ']' : ip) + ' com 32 bytes de dados:');
    let rec = 0; const tempos = [];
    for (let i = 0; i < 4; i++) {
      const r = await dgIdaVolta(s, cam, 'ping', 'resposta', 'rede', { 'Tipo': 'ICMP Echo Request (ping)', 'IP de origem': DG.ips.pc, 'IP de destino': ip, 'Sequência': String(i + 1), 'TTL': '64' });
      if (r.ok) {
        const t = dgRtt(cam) + ((i * 5) % 4); rec++; tempos.push(t);
        dgSai(s, 'Resposta de ' + ip + ': bytes=32 tempo=' + t + 'ms TTL=' + (64 - (cam.length - 2)));
      } else if (r.motivo === 'cabo' && s.caboEntre('pc', 'rt').cortado) dgSai(s, 'Falha geral. (a placa de rede está sem cabo)', 'erro');
      else if (r.motivo === 'semresposta' || r.motivo === 'no') dgSai(s, 'Esgotado o tempo limite do pedido.', 'erro');
      else dgSai(s, 'Resposta de ' + DG.ips.rt + ': Host de destino inacessível.', 'erro');
    }
    dgSai(s, 'Estatísticas do Ping para ' + ip + ':');
    dgSai(s, '    Pacotes: Enviados = 4, Recebidos = ' + rec + ', Perdidos = ' + (4 - rec) + ' (' + ((4 - rec) * 25) + '% de perda)', rec < 4 ? 'erro' : '');
    if (tempos.length) dgSai(s, '    Mínimo = ' + Math.min(...tempos) + 'ms, Máximo = ' + Math.max(...tempos) + 'ms, Média = ' + Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) + 'ms');
    s.log('ping ' + esc(arg) + ': ' + rec + ' de 4 respostas.', rec === 4 ? { bom: true } : { ruim: true });
  },
  async tracert(s, arg) {
    if (!arg) { dgSai(s, 'Use: tracert <nome ou IP>', 'dim'); return; }
    let alvo = dgResolverIp(s, arg), ip = arg;
    if (!alvo) {
      const r = await dgDns(s, arg);
      if (!r.ok) { dgSai(s, 'Não é possível resolver o nome do sistema de destino ' + arg + '.', 'erro'); s.log('tracert: o DNS não respondeu.', { ruim: true }); return; }
      alvo = r.alvo; ip = DG.ips[alvo];
    }
    const cam = dgCaminho(alvo);
    dgSai(s, '');
    dgSai(s, 'Rastreando a rota para ' + (arg !== ip ? arg + ' [' + ip + ']' : ip) + ' com no máximo 30 saltos:');
    let falhas = 0;
    for (let k = 1; k < cam.length; k++) {
      const parcial = cam.slice(0, k + 1), quem = cam[k];
      const r = await dgIdaVolta(s, parcial, 'TTL=' + k, k === cam.length - 1 ? 'resposta' : 'TTL esgotado', 'rede', { 'Tipo': 'Sonda do tracert', 'TTL': String(k), 'Ideia': 'cada roteador que zera o TTL se identifica' });
      const t = dgRtt(parcial);
      if (r.ok) dgSai(s, '  ' + k + '    ' + [t, t + 1, t].map(x => String(x).padStart(3) + ' ms').join('  ') + '  ' + DG.ips[quem]);
      else {
        dgSai(s, '  ' + k + '      *        *        *     Esgotado o tempo limite do pedido.', 'erro'); falhas++;
        if (falhas >= 2 || r.motivo === 'cabo') { dgSai(s, 'Rastreamento interrompido: o problema está depois do salto ' + (k - 1) + '.', 'erro'); s.log('tracert parou no salto ' + k + ': o defeito está entre ' + (k > 1 ? DG.ips[cam[k - 1]] : 'o PC') + ' e o próximo equipamento.', { ruim: true }); return; }
      }
    }
    if (falhas) { dgSai(s, 'O último salto (o destino) não respondeu: o caminho está bom, mas o destino está fora do ar.', 'erro'); s.log('tracert: todos os roteadores responderam, menos o destino.', { ruim: true }); return; }
    dgSai(s, 'Rastreamento concluído.');
    s.log('tracert mostrou ' + (cam.length - 1) + ' saltos até ' + ip + '.', { bom: true });
  },
  async nslookup(s, arg) {
    if (!arg) { dgSai(s, 'Use: nslookup <nome>. Exemplo: nslookup www.exemplo.com.br', 'dim'); return; }
    dgSai(s, 'Servidor:  dns.google');
    dgSai(s, 'Address:  ' + DG.ips.dns);
    const r = await dgDns(s, arg);
    if (r.ok) { dgSai(s, ''); dgSai(s, 'Nome:    ' + arg); dgSai(s, 'Address:  ' + DG.ips[r.alvo]); s.log('nslookup: ' + esc(arg) + ' = ' + DG.ips[r.alvo] + '.', { bom: true }); }
    else if (r.motivo === 'nome') { dgSai(s, '*** dns.google não encontrou ' + arg + ': domínio inexistente', 'erro'); s.log('nslookup: o nome não existe.', { ruim: true }); }
    else { dgSai(s, 'Tempo limite da solicitação DNS esgotado.', 'erro'); s.log('nslookup: o servidor DNS não respondeu.', { ruim: true }); }
  },
  async ajuda(s) {
    ['Comandos disponíveis:', '  ipconfig            mostra o IP, o gateway e o DNS do PC', '  ping <destino>      testa se o destino responde e mede o tempo em ms',
      '  tracert <destino>   mostra cada roteador no caminho', '  nslookup <nome>     pergunta ao DNS o IP de um nome', '  cls                 limpa a tela',
      'Destinos: www.exemplo.com.br, ' + DG.ips.rt + ' (roteador), ' + DG.ips.isp + ' (provedor), ' + DG.ips.dns + ' (DNS)'].forEach(l => dgSai(s, l, 'dim'));
  },
  async cls(s) { dgTerm(s).saida.innerHTML = ''; }
};
DG_CMD.help = DG_CMD.ajuda; DG_CMD.limpar = DG_CMD.cls; DG_CMD.clear = DG_CMD.cls; DG_CMD.traceroute = DG_CMD.tracert; DG_CMD.ifconfig = DG_CMD.ipconfig; DG_CMD['ip'] = DG_CMD.ipconfig;
async function dgRodar(s, linha, digitar) {
  linha = linha.trim();
  if (!linha) return;
  const t = dgTerm(s); if (t) { const r = t.saida.getBoundingClientRect(); if (r.bottom > window.innerHeight) t.saida.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  if (digitar) await dgDigitar(s, linha);
  const [cmd, arg] = linha.split(/\s+/), f = DG_CMD[cmd.toLowerCase()];
  if (!f) { dgSai(s, '\'' + cmd + '\' não é reconhecido como um comando. Digite ajuda para ver a lista.', 'erro'); return; }
  await f(s, arg);
}

ABAS.push({
  id: 'diagnostico', num: 8, nome: 'Diagnóstico', obrigatoria: false,
  titulo: 'Diagnóstico de rede',
  resumo: 'Um terminal simulado: digite ping, tracert, ipconfig ou nslookup, veja os pacotes saindo e as respostas com o tempo em milissegundos. Depois, descubra onde está o defeito.',
  mapa: 'Terminal com ping, tracert, ipconfig e nslookup; desafio do defeito misterioso.',
  cenarios: [{
    id: 'terminal', nome: 'Terminal', proporcao: .3, alturaMin: 230,
    legenda: [['rede', 'ICMP (ping, tracert)'], ['dns', 'DNS (nslookup)']],
    params: () => ({}),
    intro: { titulo: 'Ferramentas de quem cuida da rede', texto: 'Clique em <b>Iniciar</b> para ver os quatro comandos em ação, ou digite você mesmo no terminal abaixo da rede. Digite <b>ajuda</b> para ver a lista.' },
    montar(s) {
      s.E = { falhas: {}, misterio: null };
      s.no('pc', 'pc', .02, .45, 'PC de Ana', { sub: DG.ips.pc, info: { 'IP': DG.ips.pc, 'Gateway': DG.ips.rt, 'DNS': DG.ips.dns } });
      s.no('rt', 'roteador', .26, .45, 'Roteador', { sub: DG.ips.rt, info: { 'IP': DG.ips.rt, 'Função': 'gateway padrão da casa' } });
      s.no('isp', 'roteador', .5, .45, 'Provedor', { sub: DG.ips.isp, info: { 'IP': DG.ips.isp, 'Função': 'roteador da operadora de Internet' } });
      s.no('core', 'nuvem', .74, .45, 'Internet', { sub: DG.ips.core, info: { 'IP do roteador': DG.ips.core } });
      s.no('web', 'servidor', .98, .95, 'Site', { sub: DG.ips.web, info: { 'Nome': 'www.exemplo.com.br', 'IP': DG.ips.web } });
      s.no('dns', 'servidor', .98, .0, 'DNS', { sub: DG.ips.dns, acima: false, selo: 'DNS', corSelo: '--p-dns', info: { 'IP': DG.ips.dns, 'Porta': '53' } });
      s.cabo('pc', 'rt', { rotulo: '1 ms' }); s.cabo('rt', 'isp', { rotulo: '6 ms' }); s.cabo('isp', 'core', { rotulo: '9 ms' }); s.cabo('core', 'web', { rotulo: '4 ms' }); s.cabo('core', 'dns', { rotulo: '5 ms' });
      dgAplicar(s);
    },
    extra(lab, el) {
      const saida = h('div', { class: 'term-saida', role: 'log', 'aria-live': 'polite' });
      const inp = h('input', { class: 'term-inp', id: 'diagnostico-terminal', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Comando do terminal', placeholder: 'digite um comando, ex.: ping www.exemplo.com.br' });
      const hist = []; let ih = 0;
      inp.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowUp') { if (hist.length) { ih = Math.max(0, ih - 1); inp.value = hist[ih]; } ev.preventDefault(); return; }
        if (ev.key === 'ArrowDown') { ih = Math.min(hist.length, ih + 1); inp.value = hist[ih] || ''; ev.preventDefault(); return; }
        if (ev.key !== 'Enter') return;
        const v = inp.value; inp.value = '';
        if (!v.trim()) return;
        hist.push(v); ih = hist.length;
        if (lab.ativo || lab.livres) { Avisos.mostrar('Espere o comando atual terminar.'); return; }
        lab.livre(async s => {
          saida.append(h('div', { class: 'tl tl-cmd' }, h('span', { class: 'tp' }, 'C:\\Users\\Ana> '), v));
          s.explicar('Você digitou: ' + v, 'Acompanhe os pacotes na rede e a resposta no terminal.');
          await dgRodar(s, v, false);
        });
      });
      const atalhos = h('div', { class: 'term-atalhos' }, ['ipconfig', 'ping www.exemplo.com.br', 'tracert www.exemplo.com.br', 'nslookup www.exemplo.com.br', 'ping 8.8.8.8'].map(c =>
        h('button', { type: 'button', class: 'btn btn-mini', onclick: () => { inp.value = c; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); } }, c)));
      el.append(h('h3', null, 'Terminal (Prompt de Comando)'), h('div', { class: 'term' }, saida, h('div', { class: 'term-linha' }, h('span', { class: 'tp' }, 'C:\\Users\\Ana>'), inp)), atalhos);
      lab.term = { saida, inp };
      dgSai(lab.cena, 'Terminal simulado do Redes Vivas. Digite ajuda para ver os comandos.', 'dim');
    },
    aoReiniciar(lab) { if (lab.term) { lab.term.saida.innerHTML = ''; dgSai(lab.cena, 'Terminal simulado do Redes Vivas. Digite ajuda para ver os comandos.', 'dim'); } },
    passos: [
      { titulo: 'ipconfig: quem sou eu na rede?',
        texto: 'O <b>ipconfig</b> mostra a configuração do próprio computador: o endereço IP, o <b>gateway padrão</b> (o roteador) e o servidor DNS. Nenhum pacote sai.',
        async rodar(s) { await dgRodar(s, 'ipconfig', true); } },
      { titulo: 'ping: o destino responde?',
        texto: 'O <b>ping</b> envia pacotes ICMP ("você está aí?") e mede quanto tempo a resposta leva para voltar, em <b>milissegundos</b>. Antes, ele pergunta ao DNS o IP do nome.',
        async rodar(s) { await dgRodar(s, 'ping www.exemplo.com.br', true); } },
      { titulo: 'tracert: por onde o pacote passa?',
        texto: 'O <b>tracert</b> envia sondas com TTL 1, 2, 3... Cada roteador que zera o TTL responde e se identifica. Assim aparece a lista de saltos até o destino.',
        async rodar(s) { await dgRodar(s, 'tracert www.exemplo.com.br', true); } },
      { titulo: 'nslookup: perguntando direto ao DNS',
        texto: 'O <b>nslookup</b> pergunta ao servidor DNS qual é o IP de um nome. Serve para saber se o DNS está funcionando.',
        async rodar(s) { await dgRodar(s, 'nslookup www.exemplo.com.br', true); } },
      { titulo: 'Defeito: o DNS saiu do ar',
        texto: 'Desligamos o servidor DNS. O <b>ping pelo nome falha</b>, mas o <b>ping pelo IP funciona</b>. Conclusão: a Internet está ok; o problema é só a tradução de nomes. É assim que se investiga: um teste de cada vez.',
        async rodar(s) {
          s.E.falhas.dns = true; dgAplicar(s); if (s.lab.dgUi) s.lab.dgUi.dns.set(true);
          s.log('Defeito simulado: o servidor DNS foi desligado.', { ruim: true });
          await dgRodar(s, 'ping www.exemplo.com.br', true);
          await dgRodar(s, 'ping 203.0.113.10', true);
        } }
    ],
    experimente(ex, lab) {
      ex.nota('<b>Provoque um defeito</b> e use os comandos para encontrá-lo:');
      lab.dgUi = {};
      DG.falhas.forEach(f => { lab.dgUi[f[0]] = ex.chave(f[1], false, v => { lab.cena.E.falhas[f[0]] = v; dgAplicar(lab.cena); lab.registrar('Defeito ' + (v ? 'ligado' : 'desligado') + ': ' + f[1] + '.', v ? { ruim: true } : { bom: true }, lab.cena); }); });
      ex.el.append(h('hr', { class: 'sep' }));
      caixaMissao(ex, 'misterio');
      const res = h('p', { class: 'ex-nota' });
      ex.botao('Sortear um defeito misterioso', () => {
        const s = lab.cena; Object.keys(lab.dgUi).forEach(k => { lab.dgUi[k].set(false); s.E.falhas[k] = false; });
        s.E.misterio = DG.falhas[Math.floor(Math.random() * DG.falhas.length)][0]; dgAplicar(s);
        res.innerHTML = 'Um defeito foi escondido. Use <b>ipconfig</b>, <b>ping</b>, <b>tracert</b> e <b>nslookup</b> e depois responda abaixo.';
        lab.registrar('Um defeito misterioso foi sorteado. Investigue!', { marco: true }, s);
      });
      ex.el.append(res);
      const palpite = ex.escolha('Onde está o problema?', [['', 'Escolha uma resposta']].concat(DG.falhas), '', () => {});
      ex.botao('Responder', () => {
        const s = lab.cena, v = palpite.get();
        if (!s.E.misterio) { Avisos.mostrar('Primeiro sorteie um defeito misterioso.'); return; }
        if (!v) { Avisos.mostrar('Escolha uma resposta.'); return; }
        const certo = DG.falhas.find(f => f[0] === s.E.misterio)[1];
        if (v === s.E.misterio) {
          res.innerHTML = '<b>Acertou!</b> O defeito era: ' + esc(certo) + '.'; Missoes.concluir('misterio');
        } else {
          res.innerHTML = '<b>Não era isso.</b> O defeito era: ' + esc(certo) + '. Dica: ipconfig acusa cabo solto; ping pelo IP funciona quando só o DNS falhou; tracert mostra em que salto o caminho para.'; Som.tocar('erro');
        }
        s.E.misterio = null; dgAplicar(s); palpite.set('');
      });
    }
  }]
});
Missoes.definir('misterio', 'Descubra o defeito misterioso usando os comandos do terminal', 20, 'diagnostico');

/* ---------- ABA 9: SEGURANÇA E FIREWALL — regras editáveis, DDoS e homem no meio ---------- */

const FW_PORTAS = { 80: 'HTTP', 443: 'HTTPS', 23: 'Telnet', 22: 'SSH', 3389: 'RDP', 53: 'DNS' };
const FW_ORIGENS = { cli: { ip: '177.10.20.30', nome: 'Cliente' }, hack: { ip: '66.66.66.66', nome: 'Atacante' } };
const FW_INICIAIS = () => [{ porta: 80, origem: '*', acao: 'permitir' }, { porta: 443, origem: '*', acao: 'bloquear' }, { porta: 23, origem: '*', acao: 'permitir' }];
const nomePorta = p => p + ' (' + (FW_PORTAS[p] || '?') + ')';

function fwAvaliar(E, porta, ip) {
  for (let i = 0; i < E.regras.length; i++) {
    const r = E.regras[i];
    if ((r.porta === '*' || r.porta === porta) && (r.origem === '*' || r.origem === ip)) return { acao: r.acao, i };
  }
  return { acao: E.padrao, i: -1 };
}
function fwHud(s) {
  const E = s.E;
  const linhas = E.regras.map((r, i) => ({ cels: [String(i + 1), r.porta === '*' ? 'qualquer' : nomePorta(r.porta), r.origem === '*' ? 'qualquer' : r.origem, r.acao === 'permitir' ? 'Permitir' : 'Bloquear'], classe: E.casou === i ? 'alvo' : '' }));
  linhas.push({ cels: ['-', 'o resto', 'qualquer', (E.padrao === 'permitir' ? 'Permitir' : 'Bloquear') + ' (padrão)'], classe: E.casou === -1 ? 'alvo' : '' });
  s.hud(tabelaViva('Regras do firewall, lidas de cima para baixo', ['#', 'Porta', 'Origem', 'Ação'], linhas));
}
async function fwEnviar(s, de, porta) {
  const E = s.E, o = FW_ORIGENS[de];
  const tipo = de === 'hack' ? 'ataque' : porta === 443 ? 'cripto' : 'dados';
  E.casou = null; fwHud(s);
  const r = await s.enviar({ caminho: [de, 'fw'], rotulo: FW_PORTAS[porta] || String(porta), tipo, cadeado: porta === 443, manter: true,
    dados: { 'Tipo': 'Pedido ' + (FW_PORTAS[porta] || ''), 'IP de origem': o.ip + ' (' + o.nome + ')', 'IP de destino': '10.0.0.10', 'Porta de destino': nomePorta(porta), 'Protocolo': 'TCP' } });
  if (!r.ok) return null;
  const pk = r.pac, v = fwAvaliar(E, porta, o.ip);
  E.casou = v.i; fwHud(s);
  const qual = v.i >= 0 ? 'regra ' + (v.i + 1) : 'política padrão';
  s.balao('fw', (v.acao === 'permitir' ? 'Permitido' : 'Bloqueado') + ' pela ' + qual, { dur: 1600, cor: v.acao === 'permitir' ? '--ok' : '--bad' });
  await s.esperar(700);
  if (v.acao === 'permitir') {
    s.log('Firewall: porta ' + nomePorta(porta) + ' de ' + o.ip + ' <b>permitida</b> pela ' + qual + '.', { pac: pk, bom: true });
    const r2 = await s.seguir(pk, ['fw', 'srv']);
    if (r2.ok) s.fxNo('certo', 'srv');
  } else {
    s.barrar(pk);
    s.log('Firewall: porta ' + nomePorta(porta) + ' de ' + o.ip + ' <b>bloqueada</b> pela ' + qual + '.', { pac: pk, ruim: true });
  }
  return v.acao;
}
function fwUi(lab) {
  const el = lab.fwLista; if (!el) return;
  const s = lab.cena, E = s.E;
  el.innerHTML = '';
  E.regras.forEach((r, i) => {
    const sel = h('select', { 'aria-label': 'Ação da regra ' + (i + 1), id: 'fw-acao-' + i }, h('option', { value: 'permitir' }, 'Permitir'), h('option', { value: 'bloquear' }, 'Bloquear'));
    sel.value = r.acao;
    sel.addEventListener('change', () => { r.acao = sel.value; fwHud(s); lab.registrar('Regra ' + (i + 1) + ' mudou para: ' + (sel.value === 'permitir' ? 'Permitir' : 'Bloquear') + '.', {}, s); });
    el.append(h('div', { class: 'regra' },
      h('span', { class: 'regra-n' }, String(i + 1)),
      h('span', { class: 'regra-txt' }, 'Porta ' + (r.porta === '*' ? 'qualquer' : nomePorta(r.porta)) + (r.origem === '*' ? '' : ', de ' + r.origem)),
      sel,
      h('button', { type: 'button', class: 'btn btn-mini', title: 'Subir a regra', 'aria-label': 'Subir a regra ' + (i + 1), disabled: i === 0, onclick: () => { E.regras.splice(i - 1, 0, E.regras.splice(i, 1)[0]); fwUi(lab); fwHud(s); } }, '↑'),
      h('button', { type: 'button', class: 'btn btn-mini', title: 'Apagar a regra', 'aria-label': 'Apagar a regra ' + (i + 1), onclick: () => { E.regras.splice(i, 1); fwUi(lab); fwHud(s); lab.registrar('Regra apagada.', {}, s); } }, '✕')));
  });
  if (lab.fwPadrao) lab.fwPadrao.set(E.padrao);
}

/* ----- DDoS ----- */
const DD_CAP = 6;          // pedidos por segundo que o servidor aguenta
function ddCarga(s) { const E = s.E; E.cheg = E.cheg.filter(t => s.t - t < 1000); return E.cheg.length / DD_CAP; }
async function ddUsuario(s) {
  const E = s.E;
  const r = await s.enviar({ caminho: ['user', 'fw', 'srv'], rotulo: 'GET', tipo: 'dados', dados: { 'Tipo': 'Pedido de um usuário de verdade', 'IP de origem': '177.10.20.30', 'Porta de destino': '443' } });
  if (!r.ok) return false;
  E.cheg.push(s.t);
  if (ddCarga(s) > 1) {
    s.fxNo('xis', 'srv'); s.balao('user', 'O site não carrega…', { dur: 2000 });
    s.log('Servidor sobrecarregado: o pedido do usuário <b>não foi atendido</b>.', { ruim: true });
    await s.relogio('user', 1200);
    return false;
  }
  const v = await s.enviar({ caminho: ['srv', 'fw', 'user'], rotulo: 'página', tipo: 'dados', dados: { 'Tipo': 'Resposta do servidor' } });
  if (v.ok) s.log('O usuário recebeu a página.', { bom: true });
  return v.ok;
}

/* ----- homem no meio ----- */
async function mitmLogin(s) {
  const https = s.P.https, senha = s.P.senha || '1234';
  const dados = https
    ? { 'Tipo': 'HTTPS (criptografado)', 'Destino': 'banco.exemplo.com.br, porta 443', 'Conteúdo visível': '9f#Lq2…%x7Zk (embaralhado)' }
    : { 'Tipo': 'HTTP (texto puro)', 'Destino': 'banco.exemplo.com.br, porta 80', 'Conteúdo': 'usuario=ana&senha=' + senha };
  const r = await s.enviar({ caminho: ['ana', 'ap', 'esp', 'net', 'site'], rotulo: https ? 'login' : 'login: ' + senha, tipo: https ? 'cripto' : 'dados', cadeado: https, pausaNo: 300, dados,
    aoSaltar: no => {
      if (no !== 'esp') return;
      if (https) { s.balao('esp', 'Só vejo: 9f#Lq2…%x7Zk\nNão dá para ler!', { dur: 2200 }); s.log('Espião interceptou, mas só viu dados embaralhados.', { tipo: 'cripto', bom: true }); }
      else { s.balao('esp', 'Li tudo! senha = ' + senha, { dur: 2400, cor: '--bad' }); s.log('Espião leu a senha <b>' + esc(senha) + '</b> em texto puro!', { ruim: true, tipo: 'ataque' }); Som.tocar('erro'); }
    } });
  if (r.ok) s.log('O banco recebeu o login.', { pac: r.pac });
}

ABAS.push({
  id: 'seguranca', num: 9, nome: 'Segurança', nomeLongo: 'Segurança e firewall', obrigatoria: false,
  titulo: 'Segurança e firewall',
  resumo: 'Um firewall com regras que você edita, um ataque DDoS derrubando um servidor e um espião lendo dados com HTTP, mas não com HTTPS.',
  mapa: 'Firewall com regras editáveis, DDoS e homem no meio (HTTP × HTTPS).',
  cenarios: [{
    id: 'firewall', nome: 'Firewall', hudPos: 'nw',
    legenda: [['dados', 'Pedido comum'], ['cripto', 'HTTPS (criptografado)'], ['ataque', 'Vindo do atacante']],
    params: () => ({ porta: '443', de: 'cli' }),
    intro: { titulo: 'O porteiro da rede', texto: 'O <b>firewall</b> fica entre a Internet e o servidor da empresa. Ele confere cada pacote contra uma lista de <b>regras</b>, de cima para baixo, e decide: passa ou é barrado. As portas dizem qual serviço o pacote quer usar.' },
    montar(s) {
      s.E = { regras: FW_INICIAIS(), padrao: 'bloquear', casou: null };
      s.no('cli', 'pc', .04, .52, 'Cliente', { sub: FW_ORIGENS.cli.ip });
      s.no('hack', 'espiao', .04, .97, 'Atacante', { sub: FW_ORIGENS.hack.ip, cor: '--bad' });
      s.no('fw', 'firewall', .5, .55, 'Firewall', { tam: 1.25, info: { 'Função': 'filtra pacotes por porta e origem', 'Regra de ouro': 'o que não está liberado, está bloqueado' } });
      s.no('srv', 'servidor', .95, .55, 'Servidor', { sub: '10.0.0.10', info: { 'Serviços': 'site (80 e 443), acesso remoto (22 e 23)' } });
      s.cabo('cli', 'fw'); s.cabo('hack', 'fw'); s.cabo('fw', 'srv');
      fwHud(s);
    },
    aoReiniciar(lab) { fwUi(lab); },
    passos: [
      { titulo: 'Um pedido HTTP passa', texto: 'O cliente pede o site pela porta <b>80 (HTTP)</b>. A regra 1 permite. O firewall deixa passar.',
        async rodar(s) { await fwEnviar(s, 'cli', 80); } },
      { titulo: 'O HTTPS é barrado: regra errada!', texto: 'Agora o cliente usa a porta <b>443 (HTTPS)</b>, a versão segura. A regra 2 <b>bloqueia</b>. O firewall faz exatamente o que as regras mandam, até quando a regra está errada.',
        async rodar(s) { await fwEnviar(s, 'cli', 443); } },
      { titulo: 'O Telnet do atacante passa: perigo', texto: 'O atacante tenta a porta <b>23 (Telnet)</b>, um acesso remoto antigo que manda a senha sem criptografia. A regra 3 permite: uma porta aberta que não devia estar.',
        async rodar(s) { await fwEnviar(s, 'hack', 23); } },
      { titulo: 'O SSH cai na política padrão', texto: 'A porta <b>22 (SSH)</b> não está em nenhuma regra. Vale a <b>política padrão: bloquear</b>. Regra de ouro: o que não está liberado, está proibido.',
        async rodar(s) { await fwEnviar(s, 'hack', 22); } },
      { titulo: 'Sua vez: conserte o firewall', texto: 'Use o painel <b>Experimente</b>: troque a regra do 443 para <b>Permitir</b> e a do 23 para <b>Bloquear</b>. Depois clique em <b>Testar a configuração</b> para cumprir a missão.',
        async rodar(s) { s.pulsar('fw'); await s.esperar(600); } }
    ],
    experimente(ex, lab) {
      caixaMissao(ex, 'firewall');
      ex.nota('<b>Regras</b> (a primeira que combinar decide):');
      lab.fwLista = h('div', { class: 'regras' }); ex.el.append(lab.fwLista);
      const l = ex.linha();
      const np = ex.escolha('Porta', Object.keys(FW_PORTAS).map(p => [p, nomePorta(p)]), '23', () => {}, { em: l });
      const no = ex.escolha('Origem', [['*', 'qualquer'], [FW_ORIGENS.hack.ip, FW_ORIGENS.hack.ip], [FW_ORIGENS.cli.ip, FW_ORIGENS.cli.ip]], '*', () => {}, { em: l });
      const na = ex.escolha('Ação', [['bloquear', 'Bloquear'], ['permitir', 'Permitir']], 'bloquear', () => {}, { em: l });
      ex.botao('Adicionar regra no topo', () => {
        const s = lab.cena;
        s.E.regras.unshift({ porta: +np.get(), origem: no.get(), acao: na.get() }); fwUi(lab); fwHud(s);
        lab.registrar('Nova regra 1: ' + (na.get() === 'permitir' ? 'permitir' : 'bloquear') + ' porta ' + nomePorta(np.get()) + (no.get() === '*' ? '' : ' de ' + no.get()) + '.', {}, s);
      });
      lab.fwPadrao = ex.escolha('Política padrão (o que não combina com nenhuma regra)', [['bloquear', 'Bloquear'], ['permitir', 'Permitir']], 'bloquear', v => { lab.cena.E.padrao = v; fwHud(lab.cena); });
      ex.el.append(h('hr', { class: 'sep' }));
      const l2 = ex.linha();
      const ep = ex.escolha('Enviar para a porta', Object.keys(FW_PORTAS).map(p => [p, nomePorta(p)]), lab.P.porta, v => { lab.P.porta = v; }, { em: l2 });
      const eo = ex.escolha('Quem envia', [['cli', 'Cliente'], ['hack', 'Atacante']], lab.P.de, v => { lab.P.de = v; }, { em: l2 });
      ex.botao('Enviar pacote', () => lab.livre(async s => { s.explicar('Modo livre', 'O firewall lê as regras de cima para baixo. A primeira que combinar decide.'); await fwEnviar(s, eo.get(), +ep.get()); }));
      ex.botao('Testar a configuração (HTTPS e Telnet)', () => lab.livre(async s => {
        s.explicar('Testando a configuração', 'Missão: o HTTPS do cliente deve passar e o Telnet do atacante deve ser barrado.');
        const a = await fwEnviar(s, 'cli', 443), b = await fwEnviar(s, 'hack', 23);
        if (a === 'permitir' && b === 'bloquear') Missoes.concluir('firewall');
        else { Avisos.mostrar(a !== 'permitir' ? 'O HTTPS ainda está bloqueado.' : 'O Telnet ainda passa.', 'erro'); Som.tocar('erro'); }
      }), { classe: 'btn-pri' });
      fwUi(lab);
    }
  }, {
    id: 'ddos', nome: 'Ataque DDoS',
    legenda: [['dados', 'Usuário de verdade'], ['ataque', 'Pedido de robô (bot)']],
    params: () => ({ bots: 6 }),
    intro: { titulo: 'Negação de serviço distribuída', texto: 'Um servidor aguenta um número limitado de pedidos por segundo. No <b>DDoS</b>, milhares de computadores infectados (<b>bots</b>) enviam pedidos ao mesmo tempo até o servidor não dar conta. Quem sofre é o usuário de verdade.' },
    montar(s) {
      s.E = { ataque: false, protecao: false, cheg: [], prox: {}, cargaVis: 0 };
      s.no('user', 'pc', .04, .06, 'Usuário', { sub: '177.10.20.30', acima: false });
      for (let i = 0; i < 8; i++) s.no('b' + i, 'pc', .04 + (i % 2) * .14, .32 + Math.floor(i / 2) * .22, 'bot ' + (i + 1), { cor: '--bad', tam: .78, oculto: i >= s.P.bots });
      s.no('fw', 'firewall', .55, .55, 'Filtro', { info: { 'Função': 'com a proteção ligada, reconhece e descarta pedidos em massa' } });
      s.no('srv', 'servidor', .93, .55, 'Servidor', { sub: 'aguenta ' + DD_CAP + ' pedidos/s' });
      s.cabo('user', 'fw');
      for (let i = 0; i < 8; i++) s.cabo('b' + i, 'fw');
      s.cabo('fw', 'srv');
    },
    tique(s) {
      const E = s.E;
      E.cargaVis += (ddCarga(s) - E.cargaVis) * .08;
      if (!E.ataque) return;
      for (let i = 0; i < s.P.bots; i++) {
        const id = 'b' + i;
        if ((E.prox[id] || 0) > s.t) continue;
        E.prox[id] = s.t + 520 + ((i * 137) % 260);
        s.enviar({ caminho: [id, 'fw', 'srv'], rotulo: 'GET', tipo: 'ataque', mini: true, mudo: true, vel: 1.3, pausaNo: 20, meta: { bot: true },
          dados: { 'Tipo': 'Pedido de robô (bot)', 'IP de origem': '45.' + (10 + i) + '.0.' + (i * 7 + 3), 'Objetivo': 'ocupar o servidor' },
          aoSaltar: (no, pk) => { if (no === 'fw' && E.protecao) s.barrar(pk); } })
          .then(r => { if (r.ok) E.cheg.push(s.t); });
      }
    },
    desenho(c, s) {
      const E = s.E, p = s.pos('srv'), u = s.palco.u, w = u * 1.7, x = p.x - w / 2, y = p.y - u * .5 - 46;
      const k = limitar(E.cargaVis, 0, 1.6), cor = Tema.cor(k > 1 ? '--bad' : k > .7 ? '--warn' : '--ok');
      c.save();
      c.fillStyle = Tema.cor('--zone'); rr(c, x, y, w, 12, 6); c.fill();
      c.fillStyle = cor; rr(c, x, y, Math.max(6, w * Math.min(1, k)), 12, 6); c.fill();
      c.font = '700 11.5px ' + s.F.corpo; c.textAlign = 'center'; c.fillStyle = Tema.cor(k > 1 ? '--bad' : '--ink');
      c.fillText(k > 1 ? 'Sobrecarregado: ' + Math.round(k * 100) + '%' : 'Carga: ' + Math.round(k * 100) + '%', p.x, y - 6);
      c.restore();
    },
    passos: [
      { titulo: 'Um dia normal', texto: 'O usuário pede a página e o servidor responde. A <b>carga</b> do servidor (a barra) fica baixa.',
        async rodar(s) { await ddUsuario(s); await ddUsuario(s); } },
      { titulo: 'Os bots atacam', texto: 'Os bots começam a enviar pedidos sem parar. Cada pedido parece normal, mas juntos passam do limite: a carga ultrapassa 100%.',
        async rodar(s) { s.E.ataque = true; if (s.lab.ddUi) s.lab.ddUi.ataque.set(true); s.log('Ataque DDoS começou: ' + s.P.bots + ' bots enviando pedidos.', { ruim: true }); await s.esperar(3800); } },
      { titulo: 'O usuário de verdade fica sem o site', texto: 'O usuário tenta acessar, mas o servidor está ocupado demais e não responde. É isso que um DDoS faz: <b>tira o serviço do ar</b> sem invadir nada.',
        async rodar(s) { await ddUsuario(s); } },
      { titulo: 'Defesa: filtro anti-DDoS', texto: 'Ligamos a <b>proteção</b>: o filtro reconhece o padrão dos bots (muitos pedidos iguais, de muitos lugares) e descarta esses pedidos antes que cheguem ao servidor. A carga cai e o site volta.',
        async rodar(s) { s.E.protecao = true; if (s.lab.ddUi) s.lab.ddUi.prot.set(true); s.log('Proteção anti-DDoS ligada.', { bom: true }); await s.esperar(2200); await ddUsuario(s); } },
      { titulo: 'Fim do ataque', texto: 'Os bots param. Na vida real, empresas usam serviços de proteção que absorvem e filtram o tráfego antes que ele chegue aos servidores.',
        async rodar(s) { s.E.ataque = false; if (s.lab.ddUi) s.lab.ddUi.ataque.set(false); await s.esperar(1500); } }
    ],
    experimente(ex, lab) {
      lab.ddUi = {};
      lab.ddUi.ataque = ex.chave('Ataque ligado', false, v => { lab.cena.E.ataque = v; lab.relogio = true; lab.atualizar(); lab.registrar(v ? 'Ataque ligado.' : 'Ataque desligado.', v ? { ruim: true } : {}, lab.cena); });
      lab.ddUi.prot = ex.chave('Proteção anti-DDoS', false, v => { lab.cena.E.protecao = v; lab.registrar(v ? 'Proteção ligada.' : 'Proteção desligada.', v ? { bom: true } : { ruim: true }, lab.cena); });
      ex.faixa('Número de bots', { min: 1, max: 8, valor: lab.P.bots }, v => { lab.P.bots = v; for (let i = 0; i < 8; i++) lab.cena.nos.get('b' + i).oculto = i >= v; });
      ex.botao('Usuário acessa o site', () => lab.livre(async s => { s.explicar('Modo livre', 'Se a carga passar de 100%, o pedido do usuário não é atendido.'); await ddUsuario(s); }, { junto: true }));
      ex.nota('Com poucos bots, o servidor aguenta. Teste com 2 e com 8.');
    },
    aoReiniciar(lab) { if (lab.ddUi) { lab.ddUi.ataque.set(false); lab.ddUi.prot.set(false); } }
  }, {
    id: 'mitm', nome: 'Homem no meio',
    legenda: [['dados', 'HTTP (texto puro)'], ['cripto', 'HTTPS (criptografado)']],
    params: () => ({ https: false, senha: '1234' }),
    intro: { titulo: 'Wi-Fi público e um espião no caminho', texto: 'Ana usa o Wi-Fi aberto de um café para entrar no site do banco. Um <b>espião</b> conseguiu ficar no meio do caminho: todo pacote passa por ele. O que ele consegue ver?' },
    montar(s) {
      s.no('ana', 'laptop', .03, .6, 'Ana', { sub: 'no café' });
      s.no('ap', 'ap', .27, .6, 'Wi-Fi do café', { info: { 'Tipo': 'rede aberta, sem senha' } });
      s.no('esp', 'espiao', .5, .6, 'Espião', { cor: '--bad', info: { 'Ataque': 'homem no meio', 'O que faz': 'lê (e pode alterar) o que passa por ele' } });
      s.no('net', 'nuvem', .73, .6, 'Internet');
      s.no('site', 'servidor', .97, .6, 'Banco', { sub: 'banco.exemplo.com.br' });
      s.cabo('ana', 'ap', { estilo: 'wifi' }); s.cabo('ap', 'esp'); s.cabo('esp', 'net'); s.cabo('net', 'site');
    },
    passos: [
      { titulo: 'Login com HTTP: tudo em texto puro', texto: 'Com <b>HTTP</b>, os dados viajam em <b>texto puro</b>. O espião lê a senha de Ana como quem lê um cartão-postal.',
        async rodar(s) { s.P.https = false; if (s.lab.mitmUi) s.lab.mitmUi.set(false); await mitmLogin(s); } },
      { titulo: 'HTTPS: o aperto de mão TLS', texto: 'Com <b>HTTPS</b>, antes dos dados o navegador e o banco fazem o aperto de mão <b>TLS</b>: o banco mostra um <b>certificado</b> que prova quem ele é, e os dois combinam uma chave secreta.',
        async rodar(s) {
          s.P.https = true; if (s.lab.mitmUi) s.lab.mitmUi.set(true);
          const ida = ['ana', 'ap', 'esp', 'net', 'site'], volta = ida.slice().reverse();
          let r = await s.enviar({ caminho: ida, rotulo: 'TLS: olá', tipo: 'tcp', vel: 1.3, dados: { 'Tipo': 'TLS Client Hello', 'Diz': 'quero falar com segurança' } }); s.log('Navegador: "olá, quero uma conexão segura".', { pac: r.pac });
          r = await s.enviar({ caminho: volta, rotulo: 'certificado', tipo: 'cripto', vel: 1.3, dados: { 'Tipo': 'Certificado digital', 'Dono': 'banco.exemplo.com.br', 'Assinado por': 'autoridade certificadora confiável' } }); s.log('Banco envia o <b>certificado</b>: prova que é mesmo o banco.', { pac: r.pac });
          r = await s.enviar({ caminho: ida, rotulo: 'chave', tipo: 'cripto', cadeado: true, vel: 1.3, dados: { 'Tipo': 'Troca de chaves', 'Resultado': 'chave secreta que só os dois conhecem' } }); s.log('Os dois combinam uma chave secreta. O espião vê a troca, mas não consegue descobrir a chave.', { pac: r.pac, bom: true });
        } },
      { titulo: 'Login com HTTPS: o espião só vê embaralhado', texto: 'Agora a senha viaja <b>criptografada</b>. O espião intercepta o pacote, mas só vê caracteres sem sentido.',
        async rodar(s) { await mitmLogin(s); } },
      { titulo: 'Moral da história', texto: 'Sempre confira o <b>cadeado</b> e o <b>https://</b> no endereço, principalmente em Wi-Fi público. Criptografia não impede a interceptação; ela torna o que foi interceptado <b>inútil</b>.',
        async rodar(s) { s.balao('ana', 'https:// + cadeado = seguro', { dur: 0, cor: '--ok' }); await s.esperar(800); } }
    ],
    experimente(ex, lab) {
      ex.campo('Senha de Ana', lab.P.senha, v => { lab.P.senha = v.slice(0, 12) || '1234'; }, { max: 12 });
      lab.mitmUi = ex.chave('Usar HTTPS (criptografia)', lab.P.https, v => { lab.P.https = v; });
      ex.botao('Fazer login', () => lab.livre(async s => { s.explicar('Modo livre', s.P.https ? 'Com HTTPS, o espião só vê dados embaralhados.' : 'Com HTTP, o espião lê tudo.'); await mitmLogin(s); }));
    }
  }]
});
Missoes.definir('firewall', 'Configure o firewall para bloquear o Telnet e liberar o HTTPS', 20, 'seguranca');

/* ---------- ABA 10: DESEMPENHO — largura de banda, latência, perda, vazão e gargalo ---------- */

const DS = { N: 12, ESC: 3, BALDE: 250, LINKS: [['srv', 'r1'], ['r1', 'r2'], ['r2', 'pc']] };
const fmtS = ms => (ms / 1000).toFixed(2).replace('.', ',') + ' s';

/* calcula quando cada bloco passa por cada link (fila, transmissão e propagação) */
function dsAgenda(P) {
  const caps = [P.c1, P.c2, P.c3], lat = P.lat, livre = [0, 0, 0], viagens = [];
  const rto = 6 * lat + 300;
  const fila = []; for (let i = 1; i <= DS.N; i++) fila.push({ id: i, sai: 0, re: false });
  let acc = .5, n = 0;
  while (fila.length && n++ < 200) {
    fila.sort((a, b) => a.sai - b.sai);
    const b = fila.shift(), seg = [];
    let pronto = b.sai, perdido = false;
    for (let j = 0; j < 3; j++) {
      const tx = 1000 / caps[j], ini = Math.max(pronto, livre[j]);
      livre[j] = ini + tx;
      seg.push({ ini, dur: tx + lat });
      pronto = ini + tx + lat;
      if (j === 1) { acc += P.perda / 100; if (acc >= 1) { acc -= 1; perdido = true; break; } }
    }
    viagens.push({ id: b.id, re: b.re, seg, perdido, chega: perdido ? null : pronto });
    if (perdido) fila.push({ id: b.id, sai: seg[1].ini + seg[1].dur / 2 + rto, re: true });
  }
  const fim = Math.max(...viagens.filter(v => !v.perdido).map(v => v.chega));
  const gargalo = caps.every(c => c === caps[0]) ? -1 : caps.indexOf(Math.min(...caps));
  return { viagens, fim, gargalo, caps, reenvios: viagens.filter(v => v.re).length };
}
function dsSerie(ag, ate) {
  const nB = Math.ceil(ag.fim / DS.BALDE) + 1, b = new Array(nB).fill(0);
  for (const v of ag.viagens) if (!v.perdido && v.chega <= ate) b[Math.floor(v.chega / DS.BALDE)] += 1;
  return b.map(x => x * 1000 / DS.BALDE);
}
function dsRotulos(s) {
  const P = s.P;
  [[ 'srv', 'r1', P.c1], ['r1', 'r2', P.c2], ['r2', 'pc', P.c3]].forEach(l => { const cb = s.caboEntre(l[0], l[1]); cb.rotulo = l[2] + ' Mb/s · ' + P.lat + ' ms'; cb.larg = 1.5 + l[2] / 3.2; });
}
function dsHud(s) {
  const E = s.E, a = E.ag;
  if (!a) { s.hud('<b>Arquivo de ' + DS.N + ' Mb</b><div class="hud-nota">Cada bloco colorido é 1 Mb (megabit) do arquivo. A animação está ' + DS.ESC + ' vezes mais lenta que a realidade.</div>'); return; }
  const nomes = ['Servidor–R1', 'R1–R2', 'R2–Você'];
  const linhas = [
    { cels: ['Tempo do download', E.feito ? fmtS(a.fim) : 'baixando…'] },
    { cels: ['Gargalo', a.gargalo < 0 ? 'nenhum: todos os links têm ' + a.caps[0] + ' Mb/s' : nomes[a.gargalo] + ' (' + a.caps[a.gargalo] + ' Mb/s)'], classe: a.gargalo < 0 ? '' : 'alvo' },
    { cels: ['Vazão média', E.feito ? (DS.N / (a.fim / 1000)).toFixed(1).replace('.', ',') + ' Mb/s' : '-'] },
    { cels: ['Blocos reenviados', String(a.reenvios)] }
  ];
  s.hud(tabelaViva('Resultado do download', ['Medida', 'Valor'], linhas));
}
async function dsBaixar(s) {
  const E = s.E, P = s.P;
  if (E.ag && E.feito) E.anterior = { serie: dsSerie(E.ag, Infinity), rot: E.rot };
  const ag = dsAgenda(P); E.ag = ag; E.feito = false; E.t0 = s.t; E.rot = P.c2 + ' Mb/s, ' + P.lat + ' ms, ' + P.perda + '% de perda'; E.fila = { r1: 0, r2: 0 };
  dsHud(s);
  s.log('Download começou: ' + DS.N + ' blocos de 1 Mb. Link do meio: ' + P.c2 + ' Mb/s; latência ' + P.lat + ' ms por link; perda ' + P.perda + '%.', { tipo: 'dados' });
  const nos = ['srv', 'r1', 'r2', 'pc'];
  await Promise.all(ag.viagens.map(async v => {
    let pk = null;
    for (let j = 0; j < v.seg.length; j++) {
      const sg = v.seg[j], ultimo = j === v.seg.length - 1, perde = v.perdido && j === v.seg.length - 1;
      const espera = E.t0 + sg.ini * DS.ESC - s.t;
      if (pk && espera > 1) { E.fila[nos[j]]++; pk.alfa = 0; await s.esperar(espera); E.fila[nos[j]]--; pk.alfa = 1; }
      else if (espera > 1) await s.esperar(espera);
      const o = { manter: !ultimo, durSeg: sg.dur * DS.ESC, perderEm: perde ? { seg: 0, k: .5 } : null };
      const r = pk ? await s.seguir(pk, [nos[j], nos[j + 1]], o)
        : await s.enviar(Object.assign({ caminho: [nos[0], nos[1]], rotulo: String(v.id), tipo: v.re ? 'tcp' : 'dados', pausaNo: 0, mudo: true,
          dados: { 'Tipo': v.re ? 'Bloco reenviado pelo TCP' : 'Bloco do arquivo', 'Bloco': v.id + ' de ' + DS.N, 'Tamanho': '1 Mb (megabit)' } }, o));
      pk = r.pac;
      if (!r.ok) { s.log('O bloco ' + v.id + ' se perdeu. O TCP vai reenviar quando perceber a falta da confirmação.', { ruim: true, pac: pk }); return; }
    }
    if (v.re) s.log('Bloco ' + v.id + ' reenviado chegou.', { tipo: 'tcp' });
  }));
  E.feito = true; dsHud(s);
  s.log('Download terminou em <b>' + fmtS(ag.fim) + '</b>' + (ag.reenvios ? ', com ' + ag.reenvios + ' reenvio(s)' : '') + '.', { bom: true });
}
function dsGrafico(s) {
  const cv = s.lab.dsCv; if (!cv) return;
  const E = s.E, W = cv.clientWidth, H = 190, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const F = s.F, ml = 42, mr = 14, mt = 12, mb = 30, gw = W - ml - mr, gh = H - mt - mb;
  const agora = E.ag ? (E.feito ? Infinity : (s.t - E.t0) / DS.ESC) : 0;
  const serie = E.ag ? dsSerie(E.ag, agora) : [], ant = E.anterior ? E.anterior.serie : [];
  const tMax = Math.max(3000, E.ag ? E.ag.fim + DS.BALDE : 0, ant.length * DS.BALDE);
  const yMax = Math.max(24, ...serie, ...ant);
  const X = t => ml + t / tMax * gw, Y = v => mt + gh - v / yMax * gh;
  c.font = '11px ' + F.corpo; c.fillStyle = Tema.cor('--ink-2'); c.strokeStyle = Tema.cor('--line-2'); c.lineWidth = 1;
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let v = 0; v <= yMax; v += yMax > 40 ? 10 : 5) { c.beginPath(); c.moveTo(ml, Y(v)); c.lineTo(ml + gw, Y(v)); c.stroke(); c.fillText(String(v), ml - 6, Y(v)); }
  c.textAlign = 'center'; c.textBaseline = 'top';
  const passo = tMax > 8000 ? 2000 : tMax > 4000 ? 1000 : 500;
  for (let t = 0; t <= tMax; t += passo) c.fillText((t / 1000).toString().replace('.', ',') + ' s', X(t), mt + gh + 6);
  c.save(); c.translate(11, mt + gh / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle'; c.fillText('Mb/s', 0, 0); c.restore();
  if (E.ag) {   // capacidade do gargalo
    const cap = Math.min(...E.ag.caps);
    c.setLineDash([5, 4]); c.strokeStyle = Tema.cor('--warn'); c.beginPath(); c.moveTo(ml, Y(cap)); c.lineTo(ml + gw, Y(cap)); c.stroke(); c.setLineDash([]);
    c.fillStyle = Tema.cor('--warn'); c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText((E.ag.gargalo < 0 ? 'limite dos links: ' : 'limite do gargalo: ') + cap + ' Mb/s', ml + 6, Y(cap) - 2);
  }
  const linha = (dados, cor, area) => {
    if (!dados.length) return;
    c.beginPath(); c.moveTo(X(0), Y(0));
    dados.forEach((v, i) => { c.lineTo(X(i * DS.BALDE), Y(v)); c.lineTo(X((i + 1) * DS.BALDE), Y(v)); });
    if (area) { c.lineTo(X(dados.length * DS.BALDE), Y(0)); c.closePath(); c.globalAlpha = .16; c.fillStyle = cor; c.fill(); c.globalAlpha = 1; }
    c.strokeStyle = cor; c.lineWidth = 2; c.beginPath(); c.moveTo(X(0), Y(0));
    dados.forEach((v, i) => { c.lineTo(X(i * DS.BALDE), Y(v)); c.lineTo(X((i + 1) * DS.BALDE), Y(v)); });
    c.stroke();
  };
  const nv = E.feito ? serie.length : Math.min(serie.length, Math.ceil(agora / DS.BALDE));
  linha(ant, Tema.cor('--ink-3'), false);
  linha(serie.slice(0, nv), Tema.cor('--accent'), true);
  if (s.lab.dsLeg) s.lab.dsLeg.innerHTML = (E.ag ? '<span class="gl"><i style="background:var(--accent)"></i>Agora: ' + esc(E.rot) + '</span>' : 'Clique em Iniciar ou em "Baixar o arquivo" para desenhar o gráfico.') + (E.anterior ? '<span class="gl"><i style="background:var(--ink-3)"></i>Antes: ' + esc(E.anterior.rot) + '</span>' : '');
}
function dsAplicar(lab, p) { Object.assign(lab.P, p); const u = lab.dsUi; if (u) { u.c2.set(lab.P.c2); u.lat.set(lab.P.lat); u.perda.set(lab.P.perda); } dsRotulos(lab.cena); }

ABAS.push({
  id: 'desempenho', num: 10, nome: 'Desempenho', obrigatoria: false,
  titulo: 'Desempenho da rede',
  resumo: 'Largura de banda, latência e perda de pacotes mudando o tempo de um download. O gráfico mostra a vazão, e o link mais lento vira o gargalo.',
  mapa: 'Banda, latência e perda; gráfico de vazão e gargalo.',
  cenarios: [{
    id: 'download', nome: 'Download', hudPos: 'nw', proporcao: .42,
    legenda: [['dados', 'Bloco do arquivo (1 Mb)'], ['tcp', 'Bloco reenviado']],
    params: () => ({ c1: 20, c2: 5, c3: 20, lat: 20, perda: 0 }),
    intro: { titulo: 'Por que às vezes a Internet fica lenta?', texto: 'Você vai baixar um arquivo de 12 Mb. Ele passa por três links. O do meio é mais lento. Clique em <b>Iniciar</b> e veja onde os blocos ficam esperando.' },
    montar(s) {
      s.E = { ag: null, feito: false, anterior: null, fila: { r1: 0, r2: 0 } };
      s.no('srv', 'servidor', .03, .68, 'Servidor', { info: { 'Envia': 'o arquivo em blocos' } });
      s.no('r1', 'roteador', .36, .68, 'R1', { info: { 'Fila': 'guarda os blocos que esperam o link livre' } });
      s.no('r2', 'roteador', .66, .68, 'R2');
      s.no('pc', 'pc', .97, .68, 'Você');
      s.cabo('srv', 'r1'); s.cabo('r1', 'r2'); s.cabo('r2', 'pc');
      dsRotulos(s); dsHud(s);
    },
    desenho(c, s) {
      const E = s.E, u = s.palco.u;
      for (const id of ['r1', 'r2']) {
        const n = E.fila[id]; if (!n) continue;
        const p = s.pos(id);
        c.save();
        for (let i = 0; i < Math.min(n, 8); i++) { c.fillStyle = Tema.cor('--p-dados'); rr(c, p.x - 16, p.y - u * .5 - 14 - i * 9, 32, 7, 3); c.fill(); }
        c.font = '700 11.5px ' + s.F.corpo; c.fillStyle = Tema.cor('--warn'); c.textAlign = 'center';
        c.fillText('fila: ' + n, p.x, p.y - u * .5 - 22 - Math.min(n, 8) * 9);
        c.restore();
      }
      dsGrafico(s);
    },
    extra(lab, el) {
      lab.dsCv = h('canvas', { class: 'graf', role: 'img', 'aria-label': 'Gráfico da vazão do download ao longo do tempo' });
      lab.dsLeg = h('div', { class: 'graf-leg' });
      el.append(h('h3', null, 'Vazão do download (Mb/s) ao longo do tempo'), lab.dsCv, lab.dsLeg);
    },
    passos: [
      { titulo: 'O gargalo: o link mais lento manda', texto: 'O primeiro link manda 20 Mb/s, mas o do meio só aguenta <b>5 Mb/s</b>. Os blocos chegam rápido ao R1 e fazem <b>fila</b>. A vazão do download nunca passa do link mais lento: ele é o <b>gargalo</b>.',
        async rodar(s) { dsAplicar(s.lab, { c2: 5, lat: 20, perda: 0 }); await dsBaixar(s); } },
      { titulo: 'Latência: o tempo de ida', texto: 'Agora cada link tem <b>150 ms</b> de latência (distância maior, como falar com outro continente). A banda é a mesma, mas cada bloco demora mais para chegar. <b>Latência</b> é o atraso; <b>largura de banda</b> é a quantidade por segundo.',
        async rodar(s) { dsAplicar(s.lab, { c2: 5, lat: 150, perda: 0 }); await dsBaixar(s); } },
      { titulo: 'Perda de pacotes: o TCP reenvia', texto: 'Com <b>15% de perda</b>, alguns blocos somem. O TCP percebe a falta da confirmação, espera um tempo e reenvia (blocos azuis). O download termina, mas mais tarde, e o gráfico fica com buracos.',
        async rodar(s) { dsAplicar(s.lab, { c2: 5, lat: 20, perda: 15 }); await dsBaixar(s); } },
      { titulo: 'Tirando o gargalo', texto: 'Trocamos o link do meio por um de <b>20 Mb/s</b>. Sem gargalo, a fila some e o download fica bem mais rápido. Compare as duas linhas no gráfico.',
        async rodar(s) { dsAplicar(s.lab, { c2: 20, lat: 20, perda: 0 }); await dsBaixar(s); } }
    ],
    experimente(ex, lab) {
      lab.dsUi = {
        c2: ex.faixa('Largura de banda do link do meio', { min: 1, max: 20, valor: lab.P.c2, fmt: v => v + ' Mb/s' }, v => { lab.P.c2 = v; dsRotulos(lab.cena); }),
        lat: ex.faixa('Latência de cada link', { min: 5, max: 300, passo: 5, valor: lab.P.lat, fmt: v => v + ' ms' }, v => { lab.P.lat = v; dsRotulos(lab.cena); }),
        perda: ex.faixa('Perda de pacotes', { min: 0, max: 30, valor: lab.P.perda, fmt: v => v + '%' }, v => { lab.P.perda = v; })
      };
      ex.botao('Baixar o arquivo', () => lab.livre(async s => { s.explicar('Modo livre', 'Compare a linha nova (rosa) com a anterior (cinza) no gráfico.'); await dsBaixar(s); }));
      ex.nota('Os outros dois links têm 20 Mb/s. Ponha o link do meio em 20 e depois em 2 e compare.');
    },
    aoReiniciar(lab) { dsAplicar(lab, { c2: 5, lat: 20, perda: 0 }); }
  }]
});

/* ---------- ABA 11: TENDÊNCIAS — nuvem (IaaS, PaaS, SaaS), IoT e SDN ---------- */

const NV_CAMADAS = ['Aplicativo', 'Dados', 'Ambiente de execução', 'Sistema operacional', 'Virtualização', 'Servidores', 'Rede e armazenamento'];
const NV_MODELOS = [
  { id: 'prop', nome: 'Servidor próprio', voce: 7, ex: 'servidores na sala da empresa', txt: 'A empresa compra e cuida de <b>tudo</b>: do prédio e da energia até o aplicativo.' },
  { id: 'iaas', nome: 'IaaS', longo: 'Infraestrutura como serviço', voce: 4, ex: 'Amazon EC2, Google Compute Engine, Azure VMs', txt: 'O provedor entrega <b>máquinas virtuais</b>, rede e disco. Você instala o sistema operacional e o resto.' },
  { id: 'paas', nome: 'PaaS', longo: 'Plataforma como serviço', voce: 2, ex: 'Google App Engine, Heroku, Azure App Service', txt: 'O provedor entrega a <b>plataforma pronta</b>. Você só envia o código do aplicativo e os dados.' },
  { id: 'saas', nome: 'SaaS', longo: 'Software como serviço', voce: 0, ex: 'Gmail, Google Drive, Microsoft 365', txt: 'O <b>programa já está pronto</b> na nuvem. Você só usa, pelo navegador ou pelo aplicativo.' }
];
function nvMostrar(s, i) {
  const M = NV_MODELOS[i];
  s.E.sel = i;
  s.lab.inspecionar(M.nome + (M.longo ? ': ' + M.longo : ''), [['Você cuida de', M.voce ? NV_CAMADAS.slice(0, M.voce).join(', ') : 'nada técnico, só usa'], ['O provedor cuida de', M.voce === 7 ? 'nada: tudo é seu' : NV_CAMADAS.slice(M.voce).join(', ')], ['Exemplos', M.ex]], { sub: 'modelo de nuvem', nota: M.txt });
}
function nvDiagrama(c, s) {
  const p = s.palco, E = s.E, F = s.F, e = p.estreito;
  const x0 = e ? 10 : p.W * .36, y0 = e ? p.H * .44 : 34, W = p.W - x0 - 10, H = p.H - y0 - (e ? 10 : 46);
  const rotW = e ? 0 : Math.min(150, W * .26), cw = (W - rotW) / 4, rh = (H - 30) / 7;
  c.save();
  c.font = '700 ' + (e ? 10.5 : 12) + 'px ' + F.corpo; c.textAlign = 'center'; c.textBaseline = 'middle';
  NV_MODELOS.forEach((M, i) => {
    const x = x0 + rotW + i * cw, sel = E.sel === i;
    c.fillStyle = Tema.cor(sel ? '--accent' : '--ink'); c.fillText(M.nome, x + cw / 2, y0 + 10);
    for (let k = 0; k < 7; k++) {
      const voce = k < M.voce, y = y0 + 24 + k * rh;
      c.globalAlpha = E.sel == null || sel ? 1 : .38;
      c.fillStyle = Tema.cor(voce ? '--p-tcp' : '--p-dados'); rr(c, x + 3, y + 2, cw - 6, rh - 4, 5); c.fill();
      c.globalAlpha = 1;
    }
    if (sel) { c.strokeStyle = Tema.cor('--accent'); c.lineWidth = 2.5; rr(c, x, y0, cw, H - 6 + 4, 8); c.stroke(); }
    s.area(x, y0, cw, H, () => nvMostrar(s, i), 'Clique para ver o modelo ' + M.nome);
  });
  if (!e) {
    c.textAlign = 'right'; c.font = '600 11.5px ' + F.corpo; c.fillStyle = Tema.cor('--ink-2');
    NV_CAMADAS.forEach((n, k) => c.fillText(n, x0 + rotW - 8, y0 + 24 + k * rh + rh / 2));
  }
  const ly = y0 + H + (e ? -2 : 14);
  c.textAlign = 'left'; c.font = '600 11.5px ' + F.corpo;
  [['--p-tcp', 'você gerencia'], ['--p-dados', 'o provedor gerencia']].forEach((l, i) => {
    const lx = x0 + rotW + 4 + i * 150; c.fillStyle = Tema.cor(l[0]); rr(c, lx, ly - 6, 18, 12, 4); c.fill(); c.fillStyle = Tema.cor('--ink-2'); c.fillText(l[1], lx + 24, ly);
  });
  c.restore();
}

/* ----- IoT ----- */
async function iotLeitura(s, temp) {
  const E = s.E;
  const r = await s.enviar({ caminho: ['termo', 'gw', 'net', 'nuv'], rotulo: temp + ' °C', tipo: 'udp', dados: { 'Tipo': 'Leitura de sensor (MQTT)', 'Dispositivo': 'termômetro da sala', 'Valor': temp + ' °C', 'Tamanho': 'cerca de 20 bytes' } });
  if (!r.ok) { s.log('A leitura não chegou à nuvem: a Internet de casa está fora do ar.', { ruim: true }); s.balao('gw', 'Sem Internet!', { dur: 1600 }); return; }
  s.log('A nuvem recebeu a temperatura: ' + temp + ' °C.', { pac: r.pac });
  const ligar = temp > E.limite;
  if (ligar === E.arLigado) { s.balao('nuv', temp + ' °C: nada a fazer', { dur: 1400, baixo: true }); return; }
  s.balao('nuv', temp + ' °C ' + (ligar ? '>' : '≤') + ' ' + E.limite + ' °C\n→ ' + (ligar ? 'ligar' : 'desligar') + ' o ar', { dur: 1800, baixo: true });
  await s.esperar(600);
  const c = await s.enviar({ caminho: ['nuv', 'net', 'gw', 'ar'], rotulo: ligar ? 'ligar' : 'desligar', tipo: 'tcp', dados: { 'Tipo': 'Comando da nuvem', 'Para': 'ar-condicionado', 'Ação': ligar ? 'ligar' : 'desligar', 'Motivo': 'temperatura ' + temp + ' °C, limite ' + E.limite + ' °C' } });
  if (c.ok) { E.arLigado = ligar; const n = s.nos.get('ar'); n.selo = ligar ? 'LIGADO' : ''; s.log('Ar-condicionado ' + (ligar ? 'ligado' : 'desligado') + ' pela nuvem.', { bom: true, pac: c.pac }); }
}

/* ----- SDN ----- */
function sdnBFS(s, de, para) {
  const viz = id => s.cabos.filter(c => c.estilo !== 'controle' && !c.cortado && (c.a === id || c.b === id)).map(c => (c.a === id ? c.b : c.a));
  const antes = { [de]: null }, fila = [de];
  while (fila.length) { const x = fila.shift(); if (x === para) break; for (const y of viz(x).sort()) if (!(y in antes)) { antes[y] = x; fila.push(y); } }
  if (!(para in antes)) return null;
  const c = []; for (let x = para; x != null; x = antes[x]) c.unshift(x);
  return c;
}
function sdnHud(s) {
  const E = s.E, linhas = [];
  for (const sw of ['s1', 's2', 's3', 's4']) {
    const f = E.fluxos[sw];
    if (f) linhas.push({ cels: [sw.toUpperCase(), 'H1 → H2', f === 'drop' ? 'descartar' : 'enviar para ' + f.toUpperCase()], classe: E.novo && E.novo.includes(sw) ? 'novo' : '' });
  }
  s.hud(tabelaViva('Regras instaladas pelo controlador', ['Switch', 'Tráfego', 'Ação'], linhas, 'nenhuma: os switches ainda não sabem o que fazer'));
}
async function sdnProgramar(s) {
  const E = s.E;
  E.fluxos = {}; E.novo = [];
  const cam = E.bloquear ? null : sdnBFS(s, 'h1', 'h2');
  if (E.bloquear) {
    s.balao('ctl', 'Política: H1 não pode falar com H2', { dur: 1800 });
    await s.enviar({ caminho: ['ctl', 's1'], rotulo: 'regra', tipo: 'tcp', dados: { 'Tipo': 'Regra de fluxo (flow-mod)', 'Para': 'S1', 'Regra': 'H1 → H2: descartar' } });
    E.fluxos.s1 = 'drop'; E.novo = ['s1']; sdnHud(s);
    s.log('Controlador instalou no S1: descartar o tráfego de H1 para H2.', { tipo: 'tcp' });
    return null;
  }
  if (!cam) { s.balao('ctl', 'Não há caminho!', { dur: 1600 }); s.log('Controlador: não existe caminho entre H1 e H2.', { ruim: true }); return null; }
  s.balao('ctl', 'Caminho: ' + cam.slice(1, -1).map(x => x.toUpperCase()).join(' → '), { dur: 2000 });
  await s.esperar(500);
  const sws = cam.slice(1, -1);
  await Promise.all(sws.map((sw, i) => s.enviar({ caminho: ['ctl', sw], rotulo: 'regra', tipo: 'tcp', vel: 1.2,
    dados: { 'Tipo': 'Regra de fluxo (flow-mod)', 'Para': sw.toUpperCase(), 'Regra': 'H1 → H2: enviar para ' + cam[i + 2].toUpperCase() } })
    .then(() => { E.fluxos[sw] = cam[i + 2]; E.novo.push(sw); sdnHud(s); })));
  s.log('Controlador instalou regras em ' + sws.map(x => x.toUpperCase()).join(', ') + '.', { tipo: 'tcp' });
  return cam;
}
/* um pacote de H1 para H2, consultando as regras switch a switch */
async function sdnPacote(s, n) {
  const E = s.E;
  let r = await s.enviar({ caminho: ['h1', 's1'], rotulo: 'dados ' + n, tipo: 'dados', manter: true, dados: { 'Tipo': 'Dados', 'De': 'H1 (10.0.0.1)', 'Para': 'H2 (10.0.0.2)' } });
  if (!r.ok) return false;
  const pk = r.pac;
  let onde = 's1';
  for (let i = 0; i < 6; i++) {
    let f = E.fluxos[onde];
    if (!f) {
      s.balao(onde, 'Sem regra. Vou perguntar\nao controlador.', { dur: 1700 });
      s.log(onde.toUpperCase() + ' não tem regra para este pacote: pergunta ao controlador (packet-in).', { tipo: 'tcp' });
      await s.enviar({ caminho: [onde, 'ctl'], rotulo: 'pergunta', tipo: 'tcp', dados: { 'Tipo': 'Packet-in', 'Pergunta': 'o que faço com H1 → H2?' } });
      await sdnProgramar(s);
      f = E.fluxos[onde];
      if (!f) { s.matar(pk); return false; }
    }
    if (f === 'drop') { s.barrar(pk); s.log(onde.toUpperCase() + ' descartou o pacote, seguindo a regra do controlador.', { ruim: true }); return false; }
    const r2 = await s.seguir(pk, [onde, f], { manter: f !== 'h2' });
    if (!r2.ok) {
      s.log('O link ' + onde.toUpperCase() + '–' + f.toUpperCase() + ' caiu. O switch avisa o controlador.', { ruim: true });
      await s.enviar({ caminho: [onde, 'ctl'], rotulo: 'link caiu', tipo: 'ataque', dados: { 'Tipo': 'Aviso de mudança na rede', 'Link': onde.toUpperCase() + '–' + f.toUpperCase() } });
      await sdnProgramar(s);
      return false;
    }
    if (f === 'h2') { s.fxNo('certo', 'h2'); s.log('H2 recebeu o pacote ' + n + '.', { bom: true }); return true; }
    onde = f;
  }
  return false;
}

ABAS.push({
  id: 'tendencias', num: 11, nome: 'Tendências', obrigatoria: false,
  titulo: 'Tendências: nuvem, IoT e SDN',
  resumo: 'Os modelos de nuvem (IaaS, PaaS e SaaS), uma casa com dispositivos IoT conversando com a nuvem e uma rede SDN comandada por um controlador central.',
  mapa: 'Nuvem (IaaS, PaaS, SaaS), Internet das Coisas e redes definidas por software.',
  cenarios: [{
    id: 'nuvem', nome: 'Nuvem', proporcao: .5,
    legenda: [['dados', 'Pedido ao provedor de nuvem']],
    dicaInspetor: 'Clique em uma <b>coluna</b> do quadro para ver quem cuida de quê em cada modelo.',
    params: () => ({}),
    intro: { titulo: 'Usar o computador dos outros', texto: '<b>Computação em nuvem</b> é alugar recursos de computação de um provedor, pela Internet, em vez de comprar servidores. O quadro mostra, para cada modelo, o que fica com você (azul) e o que fica com o provedor (verde).' },
    montar(s) {
      s.E = { sel: null };
      s.no('emp', 'pc', .04, .2, 'Empresa', { mx: .1, my: .05 });
      s.no('usr', 'celular', .04, .8, 'Usuário', { mx: .5, my: .05 });
      s.no('dc', 'servidor', .27, .5, 'Data center', { sub: 'do provedor', tam: 1.2, mx: .9, my: .05 });
      s.cabo('emp', 'dc'); s.cabo('usr', 'dc');
    },
    desenho(c, s) { nvDiagrama(c, s); },
    passos: [
      { titulo: 'Servidor próprio: tudo é seu', texto: 'Sem nuvem, a empresa compra os servidores e cuida de todas as camadas, do cabo ao aplicativo. Precisa de espaço, energia, ar-condicionado e técnicos.',
        async rodar(s) { nvMostrar(s, 0); await s.esperar(1500); } },
      { titulo: 'IaaS: alugar máquinas virtuais', texto: '<b>Infraestrutura como serviço</b>: a empresa pede uma máquina virtual e o provedor entrega em minutos. Ela instala o sistema e o programa. Exemplo: Amazon EC2.',
        async rodar(s) { nvMostrar(s, 1); const r = await s.enviar({ caminho: ['emp', 'dc'], rotulo: 'criar VM', tipo: 'dados', dados: { 'Pedido': 'uma máquina virtual com 4 processadores', 'Modelo': 'IaaS' } }); s.log('Empresa pediu uma máquina virtual (IaaS).', { pac: r.pac }); } },
      { titulo: 'PaaS: só o código', texto: '<b>Plataforma como serviço</b>: a empresa envia só o código. O provedor cuida do sistema operacional, das atualizações e de aumentar a capacidade quando há muito acesso. Exemplo: Google App Engine.',
        async rodar(s) { nvMostrar(s, 2); const r = await s.enviar({ caminho: ['emp', 'dc'], rotulo: 'código', tipo: 'dados', dados: { 'Pedido': 'publicar o código do aplicativo', 'Modelo': 'PaaS' } }); s.log('Empresa enviou só o código (PaaS).', { pac: r.pac }); } },
      { titulo: 'SaaS: o programa pronto', texto: '<b>Software como serviço</b>: o usuário só usa o programa, pelo navegador ou pelo app. Não instala nada. Exemplos: Gmail, Google Drive, Microsoft 365.',
        async rodar(s) { nvMostrar(s, 3); const r = await s.enviar({ caminho: ['usr', 'dc'], rotulo: 'abrir e-mail', tipo: 'dados', dados: { 'Pedido': 'abrir a caixa de entrada', 'Modelo': 'SaaS' } }); s.log('Usuário abriu o e-mail (SaaS).', { pac: r.pac }); await s.enviar({ caminho: ['dc', 'usr'], rotulo: 'e-mails', tipo: 'dados', dados: { 'Resposta': '12 e-mails novos' } }); } }
    ],
    experimente(ex, lab) {
      ex.escolha('Ver o modelo', NV_MODELOS.map((M, i) => [String(i), M.nome]), '0', v => nvMostrar(lab.cena, +v));
      ex.nota('Ou <b>clique em uma coluna</b> do quadro. Regra para lembrar: quanto mais à direita, menos trabalho técnico para você.');
    }
  }, {
    id: 'iot', nome: 'Internet das Coisas',
    legenda: [['udp', 'Leitura de sensor'], ['tcp', 'Comando'], ['dados', 'Notificação']],
    params: () => ({ temp: 31 }),
    intro: { titulo: 'Coisas conectadas', texto: 'Na <b>Internet das Coisas (IoT)</b>, objetos do dia a dia têm sensores e se ligam à Internet. Eles enviam pequenas leituras para a nuvem, que decide o que fazer.' },
    montar(s) {
      s.E = { limite: 26, arLigado: false, luz: true };
      s.zona('Casa inteligente', .04, .1, .32, .9);
      s.no('termo', 'sensor', .04, .1, 'Termômetro', { info: { 'Envia': 'temperatura a cada minuto' } });
      s.no('cam', 'camera', .04, .9, 'Câmera', { info: { 'Envia': 'aviso quando vê movimento' } });
      s.no('luz', 'lampada', .32, .9, 'Lâmpada', { selo: 'ACESA', corSelo: '--warn' });
      s.no('ar', 'ar', .32, .1, 'Ar-condicionado');
      s.no('gw', 'ap', .5, .5, 'Roteador Wi-Fi');
      s.no('net', 'nuvem', .7, .5, 'Internet');
      s.no('nuv', 'servidor', .95, .5, 'Plataforma IoT', { sub: 'na nuvem', info: { 'Regra': 'se a temperatura passar do limite, ligar o ar' } });
      s.no('cel', 'celular', .95, .06, 'Celular do dono', { acima: false });
      for (const d of ['termo', 'cam', 'luz', 'ar']) s.cabo(d, 'gw', { estilo: 'wifi' });
      s.cabo('gw', 'net', { cortavel: true }); s.cabo('net', 'nuv'); s.cabo('net', 'cel', { estilo: 'wifi' });
    },
    passos: [
      { titulo: 'O sensor envia a temperatura', texto: 'O termômetro mede <b>31 °C</b> e envia uma mensagem bem pequena para a plataforma na nuvem. Dispositivos IoT costumam usar protocolos leves, como o MQTT.',
        async rodar(s) { s.E.arLigado = true; await iotLeitura(s, 24); s.E.arLigado = false; await iotLeitura(s, 31); } },
      { titulo: 'Movimento na câmera: aviso no celular', texto: 'A câmera detecta movimento e avisa a nuvem. A nuvem manda uma <b>notificação</b> para o celular do dono, onde quer que ele esteja.',
        async rodar(s) {
          const r = await s.enviar({ caminho: ['cam', 'gw', 'net', 'nuv'], rotulo: 'movimento!', tipo: 'udp', dados: { 'Tipo': 'Evento da câmera', 'Evento': 'movimento na garagem' } });
          if (!r.ok) return;
          s.log('Câmera avisou a nuvem: movimento na garagem.', { pac: r.pac });
          const n = await s.enviar({ caminho: ['nuv', 'net', 'cel'], rotulo: 'notificação', tipo: 'dados', dados: { 'Tipo': 'Notificação', 'Texto': 'Movimento na garagem às 14:32' } });
          s.balao('cel', 'Movimento na garagem!', { dur: 2000, baixo: true }); s.log('O dono recebeu a notificação no celular.', { pac: n.pac });
        } },
      { titulo: 'Comando pelo celular', texto: 'O dono apaga a luz pelo aplicativo. O comando vai do celular para a nuvem e da nuvem até a lâmpada, passando pelo roteador de casa.',
        async rodar(s) { await iotLuz(s); } },
      { titulo: 'Sem Internet, a casa fica "burra"', texto: 'A Internet de casa caiu. As coisas continuam ligadas no Wi-Fi, mas a nuvem não recebe nada. Por isso muitos sistemas fazem parte do processamento <b>na própria casa</b> (computação de borda, ou <b>edge</b>).',
        async rodar(s) { s.cortar('gw', 'net', true); await s.esperar(400); await iotLeitura(s, 33); } }
    ],
    experimente(ex, lab) {
      ex.faixa('Temperatura medida', { min: 16, max: 38, valor: lab.P.temp, fmt: v => v + ' °C' }, v => { lab.P.temp = v; });
      ex.botao('Termômetro envia a leitura', () => lab.livre(async s => { s.explicar('Modo livre', 'Acima de ' + s.E.limite + ' °C a nuvem liga o ar; abaixo, desliga.'); await iotLeitura(s, lab.P.temp); }));
      ex.botao('Acender ou apagar a luz pelo celular', () => lab.livre(async s => { await iotLuz(s); }));
      ex.nota('Falha para provocar: <b>clique no cabo</b> entre o roteador e a Internet.');
    }
  }, {
    id: 'sdn', nome: 'SDN',
    legenda: [['dados', 'Dados'], ['tcp', 'Mensagem de controle'], ['ataque', 'Aviso de falha']],
    params: () => ({}),
    intro: { titulo: 'Rede definida por software', texto: 'Numa rede comum, cada equipamento decide sozinho. Na <b>SDN</b>, um <b>controlador central</b> enxerga a rede inteira e programa os switches, que só obedecem às regras recebidas. As linhas tracejadas são o canal de controle.' },
    montar(s) {
      s.E = { fluxos: {}, novo: [], bloquear: false };
      s.no('ctl', 'controlador', .5, .04, 'Controlador SDN', { tam: 1.2, acima: false, info: { 'Função': 'calcula os caminhos e instala regras nos switches', 'Enxerga': 'a rede inteira' } });
      s.no('h1', 'pc', .02, .62, 'H1', { sub: '10.0.0.1' });
      s.no('s1', 'switch', .25, .62, 'S1'); s.no('s2', 'switch', .5, .38, 'S2'); s.no('s3', 'switch', .5, .92, 'S3'); s.no('s4', 'switch', .75, .62, 'S4');
      s.no('h2', 'pc', .98, .62, 'H2', { sub: '10.0.0.2' });
      for (const sw of ['s1', 's2', 's3', 's4']) s.cabo(sw, 'ctl', { estilo: 'controle' });
      s.cabo('h1', 's1'); s.cabo('s1', 's2', { cortavel: true }); s.cabo('s2', 's4', { cortavel: true }); s.cabo('s1', 's3', { cortavel: true }); s.cabo('s3', 's4', { cortavel: true }); s.cabo('s4', 'h2');
      sdnHud(s);
    },
    aoCortar(s) { s.E.fluxos = {}; s.E.novo = []; sdnHud(s); s.log('A rede mudou: o controlador apagou as regras antigas.', { tipo: 'tcp' }); },
    passos: [
      { titulo: 'Primeiro pacote: o switch pergunta', texto: 'H1 envia um pacote para H2. O S1 não tem nenhuma regra para esse tráfego, então <b>pergunta ao controlador</b>. O controlador calcula o caminho e instala regras em cada switch.',
        async rodar(s) { await sdnPacote(s, 1); } },
      { titulo: 'Os próximos pacotes vão direto', texto: 'Com as regras instaladas, os switches já sabem o que fazer. Os próximos pacotes passam sem consultar o controlador: rápido.',
        async rodar(s) { await sdnPacote(s, 2); await sdnPacote(s, 3); } },
      { titulo: 'Um link cai: o controlador refaz a rota', texto: 'O link S2–S4 caiu. Os switches avisam o controlador, que apaga as regras antigas. No pacote seguinte, ele calcula outro caminho (por S3) e reprograma os switches.',
        async rodar(s) { s.cortar('s2', 's4', true); await s.esperar(300); await sdnPacote(s, 4); await sdnPacote(s, 5); } },
      { titulo: 'Uma política para a rede inteira', texto: 'O administrador cria uma política no controlador: "H1 não pode falar com H2". O controlador instala uma regra de <b>descartar</b> no S1. Mudou a rede toda com um comando, sem configurar switch por switch.',
        async rodar(s) { s.E.bloquear = true; if (s.lab.sdnUi) s.lab.sdnUi.set(true); await sdnProgramar(s); await s.esperar(300); await sdnPacote(s, 6); } }
    ],
    experimente(ex, lab) {
      ex.botao('H1 envia um pacote para H2', () => lab.livre(async s => { s.explicar('Modo livre', 'Se não há regra, o switch pergunta ao controlador. Desligue links clicando neles.'); await sdnPacote(s, 'extra'); }));
      lab.sdnUi = ex.chave('Política: bloquear o tráfego de H1 para H2', false, v => lab.livre(async s => { s.E.bloquear = v; s.log(v ? 'Política criada: bloquear H1 → H2.' : 'Política removida.', {}); await sdnProgramar(s); }));
      ex.nota('Falha para provocar: <b>clique nos cabos</b> entre os switches. Desligue os dois caminhos e veja o controlador sem saída.');
    },
    aoReiniciar(lab) { if (lab.sdnUi) lab.sdnUi.set(false); }
  }]
});

async function iotLuz(s) {
  const E = s.E, acao = E.luz ? 'apagar' : 'acender';
  const r = await s.enviar({ caminho: ['cel', 'net', 'nuv'], rotulo: acao + ' luz', tipo: 'tcp', dados: { 'Tipo': 'Comando do aplicativo', 'Ação': acao + ' a lâmpada' } });
  if (!r.ok) return;
  s.log('Celular enviou o comando: ' + acao + ' a lâmpada.', { pac: r.pac });
  const c = await s.enviar({ caminho: ['nuv', 'net', 'gw', 'luz'], rotulo: acao, tipo: 'tcp', dados: { 'Tipo': 'Comando da nuvem', 'Para': 'lâmpada', 'Ação': acao } });
  if (!c.ok) { s.log('O comando não chegou à lâmpada: a casa está sem Internet.', { ruim: true }); return; }
  E.luz = !E.luz; const n = s.nos.get('luz'); n.selo = E.luz ? 'ACESA' : ''; s.log('Lâmpada ' + (E.luz ? 'acesa' : 'apagada') + '.', { bom: true, pac: c.pac });
}

/* ---------- ABA 12: GLOSSÁRIO E QUIZ ---------- */

const GLOSSARIO = [
  ['ACK', 'Acknowledgment', 'Confirmação. Mensagem do TCP que diz "recebi".', 'tcp-udp'],
  ['AP', 'Access Point', 'Ponto de acesso: o aparelho que cria a rede Wi-Fi.', 'meios'],
  ['Banda (largura de banda)', 'Bandwidth', 'Quantos bits um link transporta por segundo (Mb/s, Gb/s).', 'desempenho'],
  ['Bit', 'Binary digit', 'A menor unidade de informação: 0 ou 1.', 'camadas'],
  ['DDoS', 'Distributed Denial of Service', 'Ataque distribuído de negação de serviço: muitos computadores sobrecarregam um servidor.', 'seguranca'],
  ['DNS', 'Domain Name System', 'Sistema de nomes de domínio: traduz nomes de sites em endereços IP.', 'pagina-web'],
  ['Encapsulamento', '', 'Cada camada acrescenta o seu cabeçalho aos dados ao descer a pilha.', 'camadas'],
  ['Ethernet', '', 'Padrão de rede local com cabo. Define o quadro e o endereço MAC.', 'camadas'],
  ['FCS', 'Frame Check Sequence', 'Verificador no fim do quadro que detecta erros de transmissão.', 'camadas'],
  ['Firewall', '', 'Filtro que permite ou bloqueia pacotes de acordo com regras.', 'seguranca'],
  ['Gateway padrão', 'Default gateway', 'O roteador para onde o computador envia tudo que vai para fora da rede local.', 'comutacao'],
  ['HTTP', 'Hypertext Transfer Protocol', 'Protocolo de transferência de hipertexto: pede e entrega páginas web (porta 80).', 'pagina-web'],
  ['HTTPS', 'HTTP Secure', 'HTTP com criptografia TLS (porta 443). O cadeado do navegador.', 'seguranca'],
  ['Hub', '', 'Equipamento antigo que repete tudo o que recebe para todas as portas.', 'topologias'],
  ['IaaS', 'Infrastructure as a Service', 'Infraestrutura como serviço: alugar máquinas virtuais na nuvem.', 'tendencias'],
  ['ICMP', 'Internet Control Message Protocol', 'Protocolo de mensagens de controle; usado pelo ping e pelo tracert.', 'diagnostico'],
  ['IoT', 'Internet of Things', 'Internet das Coisas: objetos com sensores ligados à Internet.', 'tendencias'],
  ['IP', 'Internet Protocol', 'Protocolo da camada de rede. O endereço IP identifica um equipamento na rede.', 'comutacao'],
  ['ISP', 'Internet Service Provider', 'Provedor de acesso à Internet (a operadora).', 'diagnostico'],
  ['LAN', 'Local Area Network', 'Rede local: casa, escola ou escritório.', 'topologias'],
  ['Latência', 'Latency', 'O tempo que um dado leva para ir de um ponto a outro, em ms.', 'desempenho'],
  ['MAC', 'Media Access Control', 'Endereço físico gravado na placa de rede. Usado pelo switch.', 'comutacao'],
  ['MITM', 'Man in the Middle', 'Ataque do homem no meio: alguém intercepta a comunicação entre dois lados.', 'seguranca'],
  ['NAT', 'Network Address Translation', 'Tradução de endereços: o roteador troca IPs privados pelo IP público.', 'pagina-web'],
  ['OSI', 'Open Systems Interconnection', 'Modelo de referência com 7 camadas.', 'camadas'],
  ['PaaS', 'Platform as a Service', 'Plataforma como serviço: você envia só o código para a nuvem.', 'tendencias'],
  ['PDU', 'Protocol Data Unit', 'Unidade de dados de cada camada: dados, segmento, pacote, quadro, bits.', 'camadas'],
  ['Ping', '', 'Comando que testa se um destino responde e mede o tempo de ida e volta.', 'diagnostico'],
  ['Porta', 'Port', 'Número que identifica o programa no destino: 80 (HTTP), 443 (HTTPS), 53 (DNS).', 'seguranca'],
  ['Roteador', 'Router', 'Equipamento da camada 3 que liga redes diferentes usando o endereço IP.', 'comutacao'],
  ['SaaS', 'Software as a Service', 'Software como serviço: programa pronto usado pela Internet (ex.: e-mail).', 'tendencias'],
  ['SDN', 'Software-Defined Networking', 'Rede definida por software: um controlador central programa os switches.', 'tendencias'],
  ['Switch', '', 'Equipamento da camada 2 que entrega os quadros só na porta do destino, usando o MAC.', 'comutacao'],
  ['SYN', 'Synchronize', 'Primeira mensagem do aperto de mão do TCP: "quero conversar".', 'tcp-udp'],
  ['TCP', 'Transmission Control Protocol', 'Protocolo de transporte confiável: conexão, confirmação e reenvio.', 'tcp-udp'],
  ['Three-way handshake', '', 'Aperto de mão em três vias do TCP: SYN, SYN-ACK, ACK.', 'tcp-udp'],
  ['TLS', 'Transport Layer Security', 'Segurança da camada de transporte: a criptografia por trás do HTTPS.', 'seguranca'],
  ['Topologia', '', 'O desenho de como os equipamentos estão ligados: estrela, barramento, anel, malha.', 'topologias'],
  ['Tracert', 'Trace route', 'Comando que mostra cada roteador no caminho até o destino.', 'diagnostico'],
  ['TTL', 'Time To Live', 'Tempo de vida: contador que diminui a cada roteador; em zero, o pacote é descartado.', 'comutacao'],
  ['UDP', 'User Datagram Protocol', 'Protocolo de transporte rápido, sem conexão e sem confirmação.', 'tcp-udp'],
  ['Vazão', 'Throughput', 'Quantos dados chegam de fato por segundo.', 'desempenho'],
  ['WAN', 'Wide Area Network', 'Rede de longa distância, que liga cidades e países. A Internet é a maior.', 'diagnostico'],
  ['Wi-Fi', 'IEEE 802.11', 'Rede local sem fio, por ondas de rádio.', 'meios']
];

const QUIZ = [
  { p: 'Na descida pelas camadas, qual é a ordem certa das unidades de dados?', o: ['Bits, quadro, pacote, segmento, dados', 'Dados, segmento, pacote, quadro, bits', 'Dados, pacote, segmento, bits, quadro', 'Quadro, pacote, segmento, dados, bits'], c: 1, e: 'Cada camada acrescenta um cabeçalho: o Transporte forma o segmento, a Rede forma o pacote, o Enlace forma o quadro e a Física envia bits.', aba: 'camadas' },
  { p: 'Qual é a sequência do aperto de mão em três vias do TCP?', o: ['ACK, SYN, SYN-ACK', 'SYN, ACK, FIN', 'SYN, SYN-ACK, ACK', 'GET, 200, ACK'], c: 2, e: 'O cliente pede (SYN), o servidor aceita e confirma (SYN-ACK) e o cliente confirma (ACK).', aba: 'tcp-udp' },
  { p: 'Uma chamada de vídeo prefere UDP. Por quê?', o: ['Porque o UDP é criptografado', 'Porque um atraso atrapalha mais do que um pedacinho perdido', 'Porque o UDP confirma cada pacote', 'Porque o TCP não funciona na Internet'], c: 1, e: 'O UDP não espera confirmações nem reenvia. Em tempo real, é melhor perder um pedaço da imagem do que travar a conversa.', aba: 'tcp-udp' },
  { p: 'O que o DNS faz?', o: ['Criptografa a página', 'Escolhe o caminho dos pacotes', 'Traduz o nome do site em endereço IP', 'Dá um IP para o computador'], c: 2, e: 'O DNS funciona como uma agenda: você sabe o nome e ele devolve o número (IP).', aba: 'pagina-web' },
  { p: 'Um switch recebe um quadro para um MAC que não está na sua tabela. O que ele faz?', o: ['Descarta o quadro', 'Envia por todas as portas, menos a de entrada', 'Devolve ao remetente', 'Pergunta ao roteador'], c: 1, e: 'Isso se chama inundação. Quando o destino responder, o switch aprende onde ele está.', aba: 'comutacao' },
  { p: 'Que endereço o roteador usa para decidir para onde enviar um pacote?', o: ['O endereço MAC', 'O número da porta', 'O endereço IP de destino', 'O nome do site'], c: 2, e: 'O roteador trabalha na camada 3 e consulta a tabela de roteamento pelo IP de destino. O switch é que usa o MAC.', aba: 'comutacao' },
  { p: 'Para que serve o TTL de um pacote?', o: ['Medir a velocidade do link', 'Impedir que um pacote fique rodando para sempre', 'Criptografar o pacote', 'Escolher a porta de destino'], c: 1, e: 'Cada roteador diminui o TTL em 1. Se chegar a zero, o pacote é descartado e um aviso ICMP volta à origem.', aba: 'comutacao' },
  { p: 'O ping pelo nome do site falha, mas o ping pelo IP do mesmo site funciona. Qual é o problema mais provável?', o: ['O cabo de rede está solto', 'O servidor do site está desligado', 'O DNS não está respondendo', 'O firewall bloqueou o ICMP'], c: 2, e: 'Se o IP responde, o caminho e o servidor estão bem. Falta só a tradução do nome: o DNS.', aba: 'diagnostico' },
  { p: 'Num Wi-Fi público, por que o HTTPS protege sua senha?', o: ['Porque esconde o seu IP', 'Porque o espião não consegue ler os dados criptografados', 'Porque bloqueia o espião', 'Porque deixa a conexão mais rápida'], c: 1, e: 'O espião ainda pode interceptar, mas só vê dados embaralhados. Sem a chave, eles são inúteis.', aba: 'seguranca' },
  { p: 'Um caminho tem links de 100, 10 e 50 Mb/s. Qual é a vazão máxima de um download?', o: ['160 Mb/s', '100 Mb/s', '50 Mb/s', '10 Mb/s'], c: 3, e: 'O link mais lento é o gargalo: os dados nunca passam mais rápido do que ele.', aba: 'desempenho' },
  { p: 'Qual topologia continua funcionando quando um link cai, porque tem caminhos alternativos?', o: ['Barramento', 'Anel simples', 'Malha', 'Estrela'], c: 2, e: 'Na malha há vários caminhos. Se um link cai, os dados desviam por outro.', aba: 'topologias' },
  { p: 'Usar o Gmail pelo navegador é um exemplo de qual modelo de nuvem?', o: ['IaaS', 'PaaS', 'SaaS', 'Servidor próprio'], c: 2, e: 'Software como serviço: o programa já está pronto na nuvem e você só usa.', aba: 'tendencias' }
];

ABAS.push({
  id: 'glossario', num: 12, nome: 'Glossário e quiz', obrigatoria: true,
  titulo: 'Glossário e quiz',
  mapa: 'As siglas do simulador em português e um quiz de 12 perguntas.',
  montar(el) {
    // ----- glossário -----
    const busca = h('input', { type: 'search', id: 'glossario-busca', placeholder: 'Procurar: TCP, roteador, latência…', 'aria-label': 'Procurar no glossário', autocomplete: 'off' });
    const lista = h('dl', { class: 'glos' });
    const vazio = h('p', { class: 'ex-nota', hidden: true }, 'Nenhum termo encontrado.');
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const pintar = () => {
      const q = norm(busca.value.trim()); lista.innerHTML = ''; let n = 0;
      for (const g of GLOSSARIO) {
        if (q && !norm(g.join(' ')).includes(q)) continue;
        n++;
        const aba = ABAS.find(a => a.id === g[3]);
        lista.append(h('div', { class: 'glos-item' },
          h('dt', null, h('strong', null, g[0]), g[1] ? h('span', { class: 'glos-en' }, g[1]) : null),
          h('dd', null, g[2], ' ', aba ? h('button', { type: 'button', class: 'glos-ir', onclick: () => App.abrir(aba.id) }, 'Ver na aba ' + aba.nome) : null)));
      }
      vazio.hidden = n > 0;
    };
    busca.addEventListener('input', pintar);
    pintar();

    // ----- quiz -----
    const qz = { i: 0, acertos: 0, respondida: false, tentou: new Set() };
    const corpo = h('div', { class: 'quiz-corpo' });
    const barra = h('div', { class: 'quiz-barra' });
    const desenhar = () => {
      corpo.innerHTML = ''; barra.innerHTML = '';
      QUIZ.forEach((_, j) => barra.append(h('i', { class: j < qz.i ? 'feito' : j === qz.i ? 'agora' : '' })));
      if (qz.i >= QUIZ.length) {
        const nota = qz.acertos;
        corpo.append(h('div', { class: 'quiz-fim' },
          h('p', { class: 'quiz-placar' }, nota + ' de ' + QUIZ.length),
          h('p', null, nota === QUIZ.length ? 'Perfeito! Você domina o assunto.' : nota >= 8 ? 'Muito bem! Revise as abas das perguntas que errou.' : 'Volte às abas das perguntas que errou e tente de novo.'),
          h('button', { type: 'button', class: 'btn btn-pri', id: 'quiz-recomecar', onclick: () => { qz.i = 0; qz.acertos = 0; qz.respondida = false; desenhar(); } }, 'Fazer o quiz de novo')));
        return;
      }
      const Q = QUIZ[qz.i];
      const fb = h('div', { class: 'quiz-fb', hidden: true, role: 'status' });
      const prox = h('button', { type: 'button', class: 'btn btn-pri', id: 'quiz-proxima', hidden: true, onclick: () => { qz.i++; qz.respondida = false; desenhar(); } }, qz.i === QUIZ.length - 1 ? 'Ver resultado' : 'Próxima pergunta');
      const ops = h('div', { class: 'quiz-ops' });
      Q.o.forEach((txt, k) => ops.append(h('button', { type: 'button', class: 'quiz-op', id: 'quiz-op-' + k, onclick: ev => {
        if (qz.respondida) return;
        qz.respondida = true;
        const certo = k === Q.c;
        $$('.quiz-op', ops).forEach((b, kk) => { b.disabled = true; if (kk === Q.c) b.classList.add('certa'); });
        if (!certo) ev.currentTarget.classList.add('errada');
        if (certo) { qz.acertos++; if (!qz.tentou.has(qz.i)) Missoes.somar(5); Som.tocar('acerto'); } else Som.tocar('erro');
        qz.tentou.add(qz.i);
        const aba = ABAS.find(a => a.id === Q.aba);
        fb.className = 'quiz-fb ' + (certo ? 'ok' : 'nao'); fb.hidden = false; fb.innerHTML = '';
        fb.append(h('b', null, certo ? 'Acertou! ' : 'Não foi dessa vez. '), Q.e, ' ', aba ? h('button', { type: 'button', class: 'glos-ir', onclick: () => App.abrir(aba.id) }, 'Rever na aba ' + aba.nome) : null);
        prox.hidden = false; prox.focus();
      } }, h('span', { class: 'quiz-letra' }, 'ABCD'[k]), h('span', null, txt))));
      corpo.append(h('p', { class: 'quiz-n' }, 'Pergunta ' + (qz.i + 1) + ' de ' + QUIZ.length + ' · ' + qz.acertos + ' acerto(s)'), h('h4', { class: 'quiz-p' }, Q.p), ops, fb, prox);
    };
    desenhar();

    el.append(
      h('header', { class: 'lab-cab' }, h('div', { class: 'lab-tit' }, h('h2', null, 'Glossário e quiz'), h('p', null, 'As siglas usadas no simulador, com o significado em português. Depois, teste o que aprendeu: cada acerto na primeira tentativa vale 5 pontos.'))),
      h('div', { class: 'glos-grade' },
        h('section', { class: 'painel' }, h('h3', null, 'Glossário (' + GLOSSARIO.length + ' termos)'), busca, vazio, lista),
        h('section', { class: 'painel quiz' }, h('h3', null, 'Quiz'), barra, corpo)));
  }
});

/* ==========================================================================
   4. APLICATIVO — monta o topo e a régua de abas, troca de aba e mantém
      o laço de animação rodando só na aba que está aberta.
   ========================================================================== */

const App = {
  atual: null, labAtivo: null,

  iniciar() {
    Tema.iniciar();
    ABAS.sort((a, b) => a.num - b.num);
    const app = $('#app');
    const estrela = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.2l2 4.3 4.7.6-3.5 3.2.9 4.7L8 11.7 3.9 14l.9-4.7L1.3 6.1 6 5.5z" fill="currentColor"/></svg>';
    this.bSom = h('button', { class: 'btn-topo', type: 'button', id: 'btn-som', 'aria-pressed': 'false', onclick: () => this.alternarSom() }, 'Som: desligado');
    this.bTema = h('button', { class: 'btn-topo', type: 'button', id: 'btn-tema', onclick: () => { Tema.alternar(); this.rotuloTema(); } });
    app.append(h('header', { class: 'topo' },
      h('div', { class: 'marca' }, h('strong', null, CFG.projeto || 'Redes Vivas'), h('small', null, CFG.subtitulo || 'Simulador interativo de redes de computadores')),
      h('div', { class: 'topo-acoes' },
        h('div', { class: 'placar', title: 'Pontos ganhos nas missões e no quiz', html: estrela + '<b id="pontos">0</b> pontos' }),
        this.bSom, this.bTema)));
    this.rotuloTema();

    const regua = h('nav', { class: 'regua', role: 'tablist', 'aria-label': 'Abas do simulador' });
    const conteudo = h('main', { id: 'conteudo' });
    ABAS.forEach((aba, i) => {
      aba.botao = h('button', { class: 'aba', type: 'button', role: 'tab', id: 'aba-' + aba.id, 'aria-controls': 'sec-' + aba.id, 'aria-selected': 'false', onclick: () => this.abrir(aba.id) },
        h('span', { class: 'aba-topo' }, String(i + 1).padStart(2, '0'), h('i', { class: 'aba-led' })),
        h('span', { class: 'aba-nome' }, aba.nome));
      regua.append(aba.botao);
      aba.el = h('section', { class: 'secao', id: 'sec-' + aba.id, role: 'tabpanel', 'aria-labelledby': 'aba-' + aba.id, hidden: true });
      conteudo.append(aba.el);
    });
    app.append(regua, conteudo);

    const pedido = (location.hash || '').replace('#', '');
    this.abrir(ABAS.some(a => a.id === pedido) ? pedido : ABAS[0].id, true);
    window.addEventListener('hashchange', () => {
      const id = (location.hash || '').replace('#', '');
      if (id && this.atual && id !== this.atual.id && ABAS.some(a => a.id === id)) this.abrir(id, true);
    });
    window.addEventListener('resize', () => { if (this.labAtivo) this.labAtivo.palco.ajustar(); });
    document.addEventListener('keydown', ev => this.tecla(ev));
    requestAnimationFrame(t => this.laco(t));
  },

  abrir(id, semHash) {
    const aba = ABAS.find(a => a.id === id);
    if (!aba) return;
    for (const a of ABAS) {
      a.el.hidden = a !== aba;
      a.botao.classList.toggle('ativa', a === aba);
      a.botao.setAttribute('aria-selected', a === aba ? 'true' : 'false');
    }
    if (!aba.pronta) {                       // monta a aba só na primeira vez em que é aberta
      aba.pronta = true;
      if (aba.montar) aba.montar(aba.el, aba);
      else if (aba.cenarios) aba.lab = new Lab(aba, aba.el);
    }
    this.atual = aba; this.labAtivo = aba.lab || null;
    if (this.labAtivo) { this.labAtivo.ultimo = 0; this.labAtivo.palco.ajustar(); }
    if (aba.aoAbrir) aba.aoAbrir(aba);
    aba.botao.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (!semHash) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* sem histórico: segue sem endereço */ } }
  },

  vizinha(d) {
    const i = ABAS.indexOf(this.atual), j = limitar(i + d, 0, ABAS.length - 1);
    if (j !== i) this.abrir(ABAS[j].id);
  },

  /* atalhos de teclado (ignorados enquanto a pessoa digita em um campo) */
  tecla(ev) {
    const al = ev.target, tag = al && al.tagName;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const lab = this.labAtivo;
    if (ev.key === 'PageDown') { ev.preventDefault(); this.vizinha(1); return; }
    if (ev.key === 'PageUp') { ev.preventDefault(); this.vizinha(-1); return; }
    if (!lab) return;
    if (ev.key === ' ' || ev.code === 'Space') {
      if (tag === 'BUTTON' && !al.closest('.tr-botoes')) return;   // espaço em outros botões continua valendo
      ev.preventDefault();
      if (lab.relogio && (lab.ativo || lab.auto)) lab.pausar(); else lab.iniciar();
    } else if (ev.key === 'ArrowRight') { ev.preventDefault(); lab.proximo(); }
    else if (ev.key === 'r' || ev.key === 'R') lab.reiniciar();
    else if (ev.key === '+' || ev.key === '=') lab.mudarVel(+lab.elVel.value + 1);
    else if (ev.key === '-' || ev.key === '_') lab.mudarVel(+lab.elVel.value - 1);
  },

  alternarSom() {
    Som.ligado = !Som.ligado;
    this.bSom.setAttribute('aria-pressed', Som.ligado ? 'true' : 'false');
    this.bSom.textContent = Som.ligado ? 'Som: ligado' : 'Som: desligado';
    if (Som.ligado) Som.tocar('acerto');
  },
  rotuloTema() { this.bTema.textContent = Tema.ehEscuro() ? 'Tema claro' : 'Tema escuro'; },

  laco(t) {
    const fpsDelay = document.documentElement.classList.contains('fx-lite') ? 32 : 16;
    if (!document.hidden && !document.body.classList.contains('intro-active') && this.labAtivo &&
        (!this._ultimoRender || t - this._ultimoRender >= fpsDelay)) {
      this.labAtivo.quadro(t);
      this._ultimoRender = t;
    }
    requestAnimationFrame(tt => this.laco(tt));
  }
};

window.RedesVivas = { App, ABAS, Missoes };   // acesso pelo console do navegador, para testes

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.iniciar());
else App.iniciar();
})();
