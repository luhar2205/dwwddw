// delulu · cartas na mesa — revista 3D
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const PDF_URL = 'revista.pdf';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- DOM */
const canvas = document.getElementById('cena');
const elDica = document.getElementById('dica');
const elPular = document.getElementById('pular');
const elCtrl = document.getElementById('controles');
const elPrev = document.getElementById('anterior');
const elNext = document.getElementById('proxima');
const elCont = document.getElementById('contador');
const elStatus = document.getElementById('status');
const elBeats = [...document.querySelectorAll('.beat')];
const elBarra = document.getElementById('barra');

/* ------------------------------------------------------------ RENDERER */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0912);
scene.fog = new THREE.Fog(0x0b0912, 6, 13);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);

// luz plana e uniforme (legibilidade)
const hemi = new THREE.HemisphereLight(0xfff3e2, 0x2b1d33, 2.3);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.3);
dir.position.set(0.6, 4, 1.5);
scene.add(dir);

/* ------------------------------------------------------------ HELPERS */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);

const tweens = [];
function tween(dur, fn, ease = easeInOut) {
  return new Promise(res => {
    if (REDUCED || dur <= 0) { fn(1); res(); return; }
    tweens.push({ t: 0, dur, fn, ease, res });
  });
}
const wait = s => tween(s, () => {});

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}
function glowTex(inner, outer) {
  return canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}

/* ------------------------------------------------------------ MESA */
// toalha xadrez bordô e creme, escurecida para não competir com a revista
const tableTex = canvasTex(1024, 1024, (g, w) => {
  const n = 16, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? '#3a0f1d' : '#4f3f36';
    g.fillRect(i * s, j * s, s, s);
  }
  // fibra do tecido
  g.globalAlpha = 0.06;
  for (let k = 0; k < 9000; k++) {
    g.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    g.fillRect(Math.random() * w, Math.random() * w, 1, 1 + Math.random() * 3);
  }
  g.globalAlpha = 1;
});
tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping;
tableTex.repeat.set(5, 5);
const table = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.97, metalness: 0, envMapIntensity: 0.15, color: 0x8a7a80 })
);
table.rotation.x = -Math.PI / 2;
table.position.y = -0.004;
scene.add(table);

/* ------------------------------------------------------------ VELAS */
const flameTex = glowTex('rgba(255,248,220,1)', 'rgba(255,150,40,.85)');
const haloTex = glowTex('rgba(255,190,110,.55)', 'rgba(255,120,40,.18)');
const smokeTex = canvasTex(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(210,200,220,.55)'); gr.addColorStop(1, 'rgba(210,200,220,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

const candles = [];
const smoke = [];
const waxMat = new THREE.MeshStandardMaterial({ color: 0xefe2c8, roughness: 0.85, emissive: 0x3a1c08, emissiveIntensity: 0.35 });
const holderMat = new THREE.MeshStandardMaterial({ color: 0xb88a3a, roughness: 0.35, metalness: 0.9, envMapIntensity: 1 });

function makeCandle(x, z, h) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.02, 32), holderMat);
  plate.position.y = 0.01;
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, h, 24), waxMat);
  wax.position.y = 0.02 + h / 2;
  const drip = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.012, 8, 24), waxMat);
  drip.rotation.x = Math.PI / 2; drip.position.y = 0.02 + h - 0.01;
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flame.scale.set(0.06, 0.13, 1);
  flame.position.y = 0.02 + h + 0.06;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  halo.scale.setScalar(0.5);
  halo.position.y = flame.position.y;
  const light = new THREE.PointLight(0xffa04a, 0.35, 1.1, 2);
  light.position.y = flame.position.y + 0.05;
  g.add(plate, wax, drip, flame, halo, light);
  scene.add(g);
  candles.push({ flame, halo, light, seed: Math.random() * 100, top: new THREE.Vector3(x, flame.position.y + 0.08, z) });
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: 0 }));
    scene.add(s);
    smoke.push({ s, origin: candles[candles.length - 1].top, life: Math.random(), speed: 0.12 + Math.random() * 0.08, drift: Math.random() * 6 });
  }
}
makeCandle(-1.32, -1.12, 0.46);
makeCandle(-1.12, -1.32, 0.3);
makeCandle(1.38, -1.08, 0.38);
makeCandle(1.62, 0.95, 0.52);

/* ------------------------------------------------------- NÉVOA RASTEIRA */
const mist = [];
for (let i = 0; i < 26; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: 0, color: 0xcab8e6 }));
  const ang = Math.random() * Math.PI * 2, rad = 1.5 + Math.random() * 2.5;
  s.userData = { ang, rad, y: 0.05 + Math.random() * 0.25, sp: (Math.random() - 0.5) * 0.04, sc: 1.6 + Math.random() * 1.8, ph: Math.random() * 6 };
  scene.add(s);
  mist.push(s);
}

/* ------------------------------------------------------ FUMAÇA MÍSTICA */
// nuvem irregular: vários sopros sobrepostos, apagados nas bordas
const cloudTex = canvasTex(256, 256, (g, w) => {
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * w * 0.26;
    const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r;
    const rr = w * (0.08 + Math.random() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(w / 2, w / 2, w * 0.12, w / 2, w / 2, w / 2);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, w, w);
});
const TINTS = [0x8f74ff, 0x8f74ff, 0xb59cff, 0x6fd0c4, 0xffc98a];
const veil = [];
for (let i = 0; i < 44; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: TINTS[i % TINTS.length], depthWrite: false, transparent: true, opacity: 0 }));
  s.userData = {
    ang: Math.random() * Math.PI * 2, rad: 0.55 + Math.random() * 1.9, y: 0.04 + Math.random() * 0.7,
    sp: 0.06 + Math.random() * 0.12, sc: 0.9 + Math.random() * 1.6, ph: Math.random() * 6, rs: (Math.random() - 0.5) * 0.4,
  };
  scene.add(s);
  veil.push(s);
}
// coluna de luz que sai da caixa aberta
const beamTex = canvasTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, 'rgba(255,214,150,.9)'); gr.addColorStop(0.4, 'rgba(190,150,255,.35)'); gr.addColorStop(1, 'rgba(160,120,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.35, 'rgba(0,0,0,.25)'); side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(0.65, 'rgba(0,0,0,.25)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, w, h);
});
// vários planos cruzados com bordas apagadas: parece volume, sem aresta dura
const beam = new THREE.Group();
beam.material = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffe2b8 });
for (let i = 0; i < 4; i++) {
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), beam.material);
  pl.rotation.y = (i / 4) * Math.PI;
  beam.add(pl);
}
beam.position.y = 1.3;
scene.add(beam);

/* ------------------------------------------------------- POEIRA DOURADA */
const dustGeo = new THREE.BufferGeometry();
const DUST = 260;
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 6;
  dustPos[i * 3 + 1] = Math.random() * 2.2;
  dustPos[i * 3 + 2] = (Math.random() - 0.5) * 4.5;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.018, map: glowTex('rgba(255,230,160,1)', 'rgba(230,170,60,.6)'),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8
}));
scene.add(dust);

/* ---------------------------------------------------- CARTAS VOANDO */
const CARD_FILES = ['0-louco', 'ii-sacerdotisa', 'xix-sol', 'vi-enamorados', 'xviii-lua', 'xii-enforcado'];
const flyingCards = CARD_FILES.map((name, i) => {
  const tex = loadTex(`assets/cartas/${name}.png`);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, roughness: 0.9, metalness: 0, envMapIntensity: 0.25, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26 * 1.43), mat);
  m.visible = false;
  scene.add(m);
  return { m, side: i % 2 ? 1 : -1, slot: Math.floor(i / 2), h: 0.75 + (i % 3) * 0.08, spin: Math.random() * 6, out: 0 };
});

/* -------------------------------------------------------------- REVISTA */
const W = 1;            // largura de uma página
let H = 1.414;          // altura (ajustada pela proporção do PDF)
const SX = 44, SY = 30; // subdivisões da folha
const EPS = 0.0022;     // espessura entre folhas
const R0 = 0.07;        // raio do cilindro da dobra

const book = new THREE.Group();
scene.add(book);

const paperMat = () => new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 });

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, w * 0.15, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }), transparent: true, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -0.002;
scene.add(shadow);

const state = {
  N: 0, L: 0, turned: 0,
  leaves: [],
  anim: null,      // { leaf, back, C0, P, dragging, offset }
  queue: 0,        // próxima ordem (+1/-1) pedida durante uma virada
  ready: false,    // intro terminou
};

function buildLeafGeometry() {
  const nv = (SX + 1) * (SY + 1);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const fx = new Float32Array(nv), fz = new Float32Array(nv);
  let k = 0;
  for (let j = 0; j <= SY; j++) for (let i = 0; i <= SX; i++, k++) {
    const u = i / SX, v = j / SY;
    fx[k] = u * W; fz[k] = (0.5 - v) * H;
    uv[k * 2] = u; uv[k * 2 + 1] = v;
  }
  const idx = [];
  for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) {
    const a = j * (SX + 1) + i, b = a + 1, c = a + SX + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return { geo, fx, fz };
}

function setRest(leaf, left, y) {
  const p = leaf.geo.attributes.position.array;
  for (let k = 0; k < leaf.fx.length; k++) {
    p[k * 3] = left ? -leaf.fx[k] : leaf.fx[k];
    p[k * 3 + 1] = y;
    p[k * 3 + 2] = leaf.fz[k];
  }
  leaf.geo.attributes.position.needsUpdate = true;
  leaf.geo.computeVertexNormals();
  leaf.geo.computeBoundingSphere();
}

// dobra: linha perpendicular ao segmento canto→ponteiro; depois dela, o papel enrola num cilindro de raio r
function setTurn(leaf, back, C0, P, r, yb) {
  const dx = C0.x - P.x, dz = C0.z - P.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) { setRest(leaf, back, yb); return; }
  const nx = dx / len, nz = dz / len;
  const mx = (C0.x + P.x) / 2, mz = (C0.z + P.z) / 2;
  const pr = Math.PI * r;
  const p = leaf.geo.attributes.position.array;
  for (let k = 0; k < leaf.fx.length; k++) {
    const x = leaf.fx[k], z = leaf.fz[k];
    const d = (x - mx) * nx + (z - mz) * nz;
    let ox = x, oz = z, oy = 0;
    if (d > 0) {
      const bx = x - d * nx, bz = z - d * nz;
      if (d < pr) {
        const a = d / r, s = r * Math.sin(a);
        ox = bx + nx * s; oz = bz + nz * s; oy = r * (1 - Math.cos(a));
      } else {
        const e = d - pr;
        ox = bx - nx * e; oz = bz - nz * e; oy = 2 * r;
      }
    }
    p[k * 3] = back ? -ox : ox;
    p[k * 3 + 1] = yb + oy;
    p[k * 3 + 2] = oz;
  }
  leaf.geo.attributes.position.needsUpdate = true;
  leaf.geo.computeVertexNormals();
  leaf.geo.computeBoundingSphere();
}

function restY(i) {
  return i < state.turned ? (i + 1) * EPS : (state.L - i) * EPS;
}
function restAll() {
  state.leaves.forEach((lf, i) => {
    if (state.anim && state.anim.leaf === lf) return;
    setRest(lf, i < state.turned, restY(i));
  });
}

function createLeaves() {
  for (let i = 0; i < state.L; i++) {
    const { geo, fx, fz } = buildLeafGeometry();
    const front = new THREE.Mesh(geo, paperMat());
    front.material.side = THREE.FrontSide;
    const back = new THREE.Mesh(geo, paperMat());
    back.material.side = THREE.BackSide;
    book.add(front, back);
    state.leaves.push({ i, geo, fx, fz, front, back });
  }
  restAll();
}

/* ------------------------------------------------------------- VIRADAS */
function clampP(P, C0) {
  // o papel não estica: o canto fica preso à distância original das pontas da lombada
  for (let it = 0; it < 3; it++) {
    for (const ez of [-H / 2, H / 2]) {
      const maxd = Math.hypot(C0.x, C0.z - ez);
      const vx = P.x, vz = P.z - ez, d = Math.hypot(vx, vz);
      if (d > maxd) { P.x = (vx / d) * maxd; P.z = ez + (vz / d) * maxd; }
    }
  }
  return P;
}

function canTurn(dir) {
  return dir > 0 ? state.turned < state.L : state.turned > 0;
}

function beginTurn(dir, C0) {
  const idx = dir > 0 ? state.turned : state.turned - 1;
  const leaf = state.leaves[idx];
  state.anim = { leaf, back: dir < 0, dir, C0: { ...C0 }, P: { ...C0 }, dragging: false, offset: { x: 0, z: 0 } };
  return state.anim;
}

let animToken = 0;
function finishTo(complete) {
  const a = state.anim;
  const token = ++animToken;
  const from = { ...a.P };
  const to = complete ? { x: -W, z: a.C0.z } : { ...a.C0 };
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const dur = 0.18 + 0.55 * (dist / (2 * W));
  a.dragging = false;
  a.auto = true;
  return tween(dur, t => {
    if (token !== animToken) return;
    a.P.x = lerp(from.x, to.x, t);
    a.P.z = lerp(from.z, to.z, t) - Math.sin(Math.PI * t) * 0.12 * Math.sign(a.C0.z || 1) * (complete ? 1 : 0);
    clampP(a.P, a.C0);
  }, easeInOut).then(() => {
    if (token !== animToken) return;
    if (complete) state.turned += a.dir;
    state.anim = null;
    restAll();
    onStateChange();
    if (state.queue) {
      const q = state.queue; state.queue = 0;
      command(q);
    }
  });
}

const DEFAULT_CORNER = () => ({ x: W, z: H / 2 * 0.94 });

function command(dir) {
  if (!state.ready) return;
  if (state.anim) {
    if (!state.anim.dragging) state.queue = dir; // guarda só a última ordem
    return;
  }
  if (!canTurn(dir)) return;
  beginTurn(dir, DEFAULT_CORNER());
  finishTo(true);
}

function cornerFromPress(lx, lz) {
  // lx já no espaço da virada (sempre positivo)
  const nearEdge = lz > H / 2 - 0.22 * H || lz < -H / 2 + 0.22 * H;
  return { x: W, z: nearEdge ? Math.sign(lz) * H / 2 : clamp(lz, -H / 2, H / 2) };
}

function updateAnimMesh() {
  const a = state.anim;
  if (!a) return;
  const prog = clamp((W - a.P.x) / (2 * W), 0, 1);
  const r = Math.max(1e-4, R0 * (1 - smooth(0.82, 1, prog)) * (0.35 + 0.65 * smooth(0, 0.08, prog)));
  const yb = (state.L + 1) * EPS + 0.003;
  setTurn(a.leaf, a.back, a.C0, a.P, r, yb);
}

/* --------------------------------------------------- TEXTURAS DO PDF */
let pdf = null;
const pageTex = new Map(); // p -> { low, high, want }
let renderBusy = false;
const renderQueue = [];

function blankTex() {
  const t = canvasTex(64, 90, (g, w, h) => { g.fillStyle = '#f3ead8'; g.fillRect(0, 0, w, h); });
  return t;
}

function applyPage(p) {
  const e = pageTex.get(p);
  const tex = e && (e.high || e.low);
  if (!tex) return;
  const leafIdx = Math.ceil(p / 2) - 1;
  const leaf = state.leaves[leafIdx];
  if (!leaf) return;
  const mesh = p % 2 === 1 ? leaf.front : leaf.back;
  mesh.material.map = tex;
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate = true;
}

async function renderPage(p, width) {
  const page = await pdf.getPage(p);
  const vp0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp0.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  if (p % 2 === 0) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; }
  return t;
}

function enqueue(p, size, front = false) {
  if (p < 1 || p > state.N) return;
  if (renderQueue.some(q => q.p === p && q.size === size)) return;
  const item = { p, size };
  front ? renderQueue.unshift(item) : renderQueue.push(item);
  pump();
}

async function pump() {
  if (renderBusy) return;
  const item = renderQueue.shift();
  if (!item) return;
  renderBusy = true;
  try {
    const e = pageTex.get(item.p) || {};
    pageTex.set(item.p, e);
    const need = item.size === 2048 ? !e.high && wantedHigh().has(item.p) : !e.low;
    if (need) {
      const t = await renderPage(item.p, item.size);
      if (item.size === 2048) {
        if (wantedHigh().has(item.p)) e.high = t; else t.dispose();
      } else e.low = t;
      applyPage(item.p);
      updateStatus();
    }
  } catch (err) { console.error(err); }
  renderBusy = false;
  setTimeout(pump, 40); // respira entre páginas para não travar a animação
}

function wantedHigh() {
  const t = state.anim && !state.anim.dragging ? state.turned + state.anim.dir : state.turned;
  const s = new Set();
  for (const k of [t - 1, t, t + 1]) { s.add(2 * k); s.add(2 * k + 1); }
  return new Set([...s].filter(p => p >= 1 && p <= state.N));
}

function refreshResolution() {
  const want = wantedHigh();
  // libera as texturas grandes que saíram de perto
  for (const [p, e] of pageTex) {
    if (e.high && !want.has(p)) { e.high.dispose(); e.high = null; applyPage(p); }
  }
  [...want].sort((a, b) => Math.abs(a - 2 * state.turned) - Math.abs(b - 2 * state.turned))
    .forEach(p => enqueue(p, 2048, true));
}

function updateStatus() {
  let low = 0;
  for (const e of pageTex.values()) if (e.low) low++;
  elStatus.textContent = low < state.N ? `embaralhando as cartas… ${Math.round((low / state.N) * 100)}%` : '';
}

async function loadPdf() {
  try {
    pdf = await pdfjsLib.getDocument(PDF_URL).promise;
  } catch (err) {
    console.error(err);
    elStatus.classList.add('erro');
    elStatus.textContent = location.protocol === 'file:'
      ? 'Abra o site por um servidor (GitHub Pages, Netlify ou um servidor local) — o navegador bloqueia o PDF quando o arquivo é aberto direto.'
      : 'Não consegui abrir o revista.pdf. Confira se ele está na mesma pasta do index.html.';
    return;
  }
  state.N = pdf.numPages;
  state.L = Math.ceil(state.N / 2);
  const first = await pdf.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  H = W * (vp.height / vp.width);
  resize();
  createLeaves();
  // verso em branco quando o PDF tem número ímpar de páginas
  if (state.N % 2 === 1) {
    const last = state.leaves[state.L - 1];
    last.back.material.map = blankTex();
    last.back.material.needsUpdate = true;
  }
  placeInBox();
  for (let p = 1; p <= state.N; p++) enqueue(p, 1024);
  refreshResolution();
  updateStatus();
  onStateChange();
}

/* --------------------------------------------------------------- CAIXA */
const BW = W + 0.12;
let BD = 1.414 + 0.12;
const BH = 0.16;
const box = new THREE.Group();
scene.add(box);
const lidPivot = new THREE.Group();
const keyHole = new THREE.Vector3();

const navyTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#1c2370'; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.1;
  for (let k = 0; k < 2500; k++) {
    g.strokeStyle = Math.random() > 0.5 ? '#000' : '#6a78d8';
    g.beginPath();
    const x = Math.random() * w, y = Math.random() * h;
    g.moveTo(x, y); g.lineTo(x + 14 + Math.random() * 20, y + (Math.random() - 0.5) * 6); g.stroke();
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#c89a45'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20);
});
const velvetMat = new THREE.MeshStandardMaterial({ color: 0x5a0f22, roughness: 1, metalness: 0, envMapIntensity: 0.2 });
const navyMat = new THREE.MeshStandardMaterial({ map: navyTex, roughness: 0.85, metalness: 0, envMapIntensity: 0.35 });
const frontTex = canvasTex(1024, 256, (g, w, h) => {
  g.drawImage(navyTex.image, 0, 0, w, h);
  g.strokeStyle = '#c89a45'; g.lineWidth = 8; g.strokeRect(12, 12, w - 24, h - 24);
  // espelho da fechadura
  const cx = w / 2, cy = h / 2;
  g.fillStyle = '#c89a45';
  g.beginPath(); g.ellipse(cx, cy, 46, 70, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8c57a';
  g.beginPath(); g.ellipse(cx - 8, cy - 14, 22, 30, 0, 0, Math.PI * 2); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
  g.fillStyle = '#120a10';
  g.beginPath(); g.arc(cx, cy - 12, 15, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(cx - 9, cy - 4); g.lineTo(cx + 9, cy - 4); g.lineTo(cx + 13, cy + 36); g.lineTo(cx - 13, cy + 36); g.closePath(); g.fill();
});
const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.8, metalness: 0, envMapIntensity: 0.35 });
const lidTopMat = new THREE.MeshStandardMaterial({ map: loadTex('assets/tampa-caixa.jpg'), roughness: 0.88, metalness: 0, envMapIntensity: 0.25 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.32, metalness: 0.95, envMapIntensity: 1.1 });

function buildBox() {
  box.clear();
  lidPivot.clear();
  const t = 0.02;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(BW, t, BD), [navyMat, navyMat, velvetMat, navyMat, navyMat, navyMat]);
  floor.position.y = t / 2;
  const wallSide = new THREE.BoxGeometry(t, BH, BD);
  const wl = new THREE.Mesh(wallSide, [velvetMat, navyMat, navyMat, navyMat, navyMat, navyMat]);
  wl.position.set(-BW / 2 + t / 2, BH / 2, 0);
  const wr = new THREE.Mesh(wallSide, [navyMat, velvetMat, navyMat, navyMat, navyMat, navyMat]);
  wr.position.set(BW / 2 - t / 2, BH / 2, 0);
  const wb = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, t), [navyMat, navyMat, navyMat, navyMat, velvetMat, navyMat]);
  wb.position.set(0, BH / 2, -BD / 2 + t / 2);
  const wf = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, t), [navyMat, navyMat, navyMat, navyMat, frontMat, velvetMat]);
  wf.position.set(0, BH / 2, BD / 2 - t / 2);
  // filetes dourados nas quinas
  const edgeGeo = new THREE.BoxGeometry(BW + 0.006, 0.008, 0.008);
  const e1 = new THREE.Mesh(edgeGeo, goldMat); e1.position.set(0, 0.004, BD / 2);
  const e2 = e1.clone(); e2.position.z = -BD / 2;
  box.add(floor, wl, wr, wb, wf, e1, e2);

  const LT = 0.035;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.024, LT, BD + 0.024), [navyMat, navyMat, lidTopMat, velvetMat, navyMat, navyMat]);
  lid.position.set(0, LT / 2, (BD + 0.024) / 2);
  lidPivot.position.set(0, BH, -(BD + 0.024) / 2);
  lidPivot.add(lid);
  box.add(lidPivot);
  keyHole.set(0, BH / 2 + 0.005, BD / 2 + 0.002);
  // luz mágica de dentro
  innerGlow.position.set(0, 0.12, 0);
  box.add(innerGlow, innerHalo);
}
const innerGlow = new THREE.PointLight(0xffb45a, 0, 2.5, 2);
const innerHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
innerHalo.position.set(0, 0.35, 0);
innerHalo.scale.set(2.2, 2.2, 1);

function placeInBox() {
  BD = H + 0.12;
  buildBox();
  book.position.set(-W / 2, 0.022, 0);
  if (state.ready) { box.visible = false; book.position.y = 0; }
}

/* --------------------------------------------------------------- CHAVE */
const keyRig = new THREE.Group();   // posição + giro na fechadura (eixo z)
const keyOrient = new THREE.Group(); // aponta a haste para dentro
const keyModel = new THREE.Group();
keyRig.add(keyOrient); keyOrient.add(keyModel);
scene.add(keyRig);
(function buildKey() {
  const s = 1.05;
  const ring = (x, y, r) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 14, 40), goldMat);
    m.position.set(x, y, 0); return m;
  };
  keyModel.add(ring(0, 0.05, 0.036), ring(-0.04, -0.01, 0.036), ring(0.04, -0.01, 0.036));
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), goldMat); hub.position.y = 0.01;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 16), goldMat); shaft.position.y = -0.2;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.007, 10, 24), goldMat);
  collar.rotation.x = Math.PI / 2; collar.position.y = -0.075;
  const bit1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.016), goldMat); bit1.position.set(0.03, -0.345, 0);
  const bit2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.018, 0.016), goldMat); bit2.position.set(0.024, -0.305, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), goldMat); tip.position.y = -0.37;
  keyModel.add(hub, shaft, collar, bit1, bit2, tip);
  keyModel.scale.setScalar(s);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  glow.scale.setScalar(0.9); glow.position.y = -0.1;
  keyModel.add(glow);
  keyModel.userData.glow = glow;
})();
let keyFloating = true;
function keyHome() { return new THREE.Vector3(0.42, 0.5 + Math.sin(elapsed * 1.6) * 0.03, BD / 2 + 0.3); }

/* ------------------------------------------------------------- HISTÓRIA */
// o "scroll" é virtual: roda do mouse, arrastar no celular e teclado avançam a história
const story = { s: 0, t: 0 };
function advance(d) {
  if (state.ready || introRunning) return;
  story.t = clamp(story.t + d, 0, 1);
  cam.lastInput = performance.now();
}
const STORY = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.0, 3.5, 7.8),
  new THREE.Vector3(-3.5, 1.9, 4.7),
  new THREE.Vector3(2.9, 1.25, 3.4),
  new THREE.Vector3(1.1, 0.95, 2.9),
  new THREE.Vector3(0.45, 0.82, 2.45),
], false, 'centripetal');
let keyDrag = null;

/* -------------------------------------------------------------- CÂMERA */
const cam = {
  intro: 1,            // 1 = câmera da caixa, 0 = leitura
  entry: 0,
  zoom: 1, az: 0, pol: 0, azT: 0, polT: 0,
  mx: 0, my: 0, mxT: 0, myT: 0,
  lastInput: 0,
  fitDist: 4,
};
function fitDistance() {
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const needH = (H * 1.36) / 2 / Math.tan(vfov / 2);
  const needW = (2 * W * (camera.aspect < 1 ? 1.06 : 1.22)) / 2 / (Math.tan(vfov / 2) * camera.aspect);
  return Math.max(needH, needW);
}
function sph(r, pol, az) {
  return new THREE.Vector3(Math.sin(pol) * Math.sin(az) * r, Math.cos(pol) * r, Math.sin(pol) * Math.cos(az) * r);
}
function updateCamera(dt) {
  // amortecimento: a câmera persegue o alvo com suavidade
  const s = REDUCED ? 1 : 1 - Math.exp(-dt * 6);
  // giro automático lento enquanto ninguém mexe na caixa
  if (!state.ready && !REDUCED && performance.now() - cam.lastInput > 3500 && !introRunning) {
    cam.azT *= 0.985; cam.polT *= 0.985; // volta devagar para a trilha
  }
  cam.az += (cam.azT - cam.az) * s;
  cam.pol += (cam.polT - cam.pol) * s;
  cam.mx += (cam.mxT - cam.mx) * s * 0.5;
  cam.my += (cam.myT - cam.my) * s * 0.5;
  const par = REDUCED ? 0 : 1;
  const e = easeInOut(cam.entry);

  const d = cam.fitDist * cam.zoom;
  const read = sph(d, 0.2 + cam.pol * (1 - cam.intro) + cam.my * 0.03 * par, cam.az * (1 - cam.intro) + cam.mx * 0.04 * par);
  const f = Math.max(1, cam.fitDist / 3.9);
  const intro = STORY.getPoint(easeInOut(clamp(story.s, 0, 1))).multiplyScalar(f);
  const breathe = REDUCED ? 0 : Math.sin(elapsed * 0.21) * 0.05;
  intro.applyAxisAngle(new THREE.Vector3(0, 1, 0), (cam.az + breathe + cam.mx * 0.05 * par) * cam.intro);
  intro.y = Math.max(0.25, intro.y + (cam.pol + cam.my * 0.04 * par) * 1.3 * cam.intro);
  const k = easeInOut(cam.intro);
  camera.position.lerpVectors(read, intro, k);
  const lk = smooth(0.55, 1, story.s);
  const storyLook = new THREE.Vector3(0.04 * lk, lerp(0.12, 0.3, lk), lerp(0, BD / 2 * 0.8, lk));
  const target = new THREE.Vector3(0, 0, 0.02).lerp(storyLook, k);
  camera.lookAt(target);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  cam.fitDist = fitDistance();
  scene.fog.near = cam.fitDist * 1.6;
  scene.fog.far = cam.fitDist * 3.4;
}
addEventListener('resize', resize);

/* --------------------------------------------------------------- INTRO */
let introRunning = false;
async function openBox(fast = false) {
  if (introRunning || state.ready) return;
  introRunning = true;
  keyFloating = false;
  keyDrag = null;
  story.t = 1;
  box.position.y = 0; book.position.y = 0.022;
  keyModel.scale.setScalar(1.05);
  document.body.classList.add('abrindo');
  elDica.classList.add('some');
  elPular.hidden = true;
  const sp = fast ? 0 : 1;
  const d = s => s * sp;

  // 1. a chave vai até a fechadura
  const p0 = keyRig.position.clone();
  const r0 = keyOrient.rotation.x, rz0 = keyRig.rotation.z, ry0 = keyModel.rotation.y;
  const pre = new THREE.Vector3(keyHole.x, keyHole.y, keyHole.z + 0.62);
  await tween(d(0.9), t => {
    keyRig.position.lerpVectors(p0, pre, t);
    keyOrient.rotation.x = lerp(r0, Math.PI / 2, t);
    keyRig.rotation.z = lerp(rz0, 0, t);
    keyModel.rotation.y = lerp(ry0, 0, t);
  });
  // 2. entra
  const ins = new THREE.Vector3(keyHole.x, keyHole.y, keyHole.z + 0.2);
  await tween(d(0.45), t => keyRig.position.lerpVectors(pre, ins, t), easeOut);
  // 3. gira
  await tween(d(0.5), t => { keyRig.rotation.z = lerp(0, -Math.PI / 2, t); });
  // 4. a tampa abre, luz, fumaça e as cartas escapam
  burstSmoke();
  const lidOpen = tween(d(1.3), t => {
    lidPivot.rotation.x = lerp(0, -1.95, t);
    innerGlow.intensity = 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + 0.4 * t;
    innerHalo.material.opacity = 0.9 * t;
    beam.material.opacity = 0.32 * Math.sin(Math.PI * Math.min(1, t * 0.8));
    keyModel.scale.setScalar(1.05 * (1 - t));
  }, easeOut);
  flyingCards.forEach((c, i) => {
    c.m.visible = true;
    c.out = 0;
    wait(d(0.15 + i * 0.12)).then(() => tween(d(1.6), t => { c.out = t; }, easeOut));
  });
  await lidOpen;
  keyRig.visible = false;
  // 5. a revista sobe da caixa e a câmera vai para a leitura
  cam.azT = 0; cam.polT = 0;
  document.body.classList.add('lendo');
  const camMove = tween(d(2.2), t => { cam.intro = 1 - t; });
  await tween(d(0.9), t => { book.position.y = lerp(0.022, 0.62, t); }, easeOut);
  const boxGo = tween(d(1.0), t => {
    box.position.set(0, -0.7 * t, -1.8 * t);
    box.scale.setScalar(1 - 0.35 * t);
    innerGlow.intensity *= 0.9;
    innerHalo.material.opacity = 0.9 * (1 - t);
  }, easeInOut);
  await tween(d(0.9), t => { book.position.y = lerp(0.62, 0, t); }, easeInOut);
  await Promise.all([camMove, boxGo]);
  box.visible = false;
  beam.material.opacity = 0;
  state.ready = true;
  elCtrl.hidden = false;
  onStateChange();
}
function burstSmoke() {
  for (let i = 0; i < 46; i++) {
    const gold = i % 5 === 0;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: gold ? 0xffcf8a : TINTS[i % 4], depthWrite: false, transparent: true, opacity: 0,
      blending: gold ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    scene.add(sp);
    const a0 = Math.random() * Math.PI * 2, turns = 1.2 + Math.random() * 1.4, up = 0.9 + Math.random() * 1.3;
    const r1 = 0.5 + Math.random() * 1.1, dur = 2.6 + Math.random() * 1.8, rot = (Math.random() - 0.5) * 3;
    wait(Math.random() * 0.5).then(() => tween(REDUCED ? 0 : dur, t => {
      const a = a0 + t * turns * Math.PI * 2, r = 0.12 + r1 * Math.sqrt(t);
      sp.position.set(Math.cos(a) * r, 0.15 + up * t, Math.sin(a) * r * 0.85);
      sp.scale.setScalar(0.35 + t * (gold ? 0.8 : 1.9));
      sp.material.rotation = rot * t;
      sp.material.opacity = (gold ? 0.5 : 0.32) * Math.sin(Math.PI * Math.min(1, t * 1.15));
    }, x => x)).then(() => { scene.remove(sp); sp.material.dispose(); });
  }
}
/* -------------------------------------------------------------- ENTRADA */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpV = new THREE.Vector3();

function toNdc(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}
function pointerLocal(e) {
  toNdc(e);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(tablePlane, tmpV)) return null;
  return { x: tmpV.x - book.position.x, z: tmpV.z - book.position.z };
}
function keyVisible() { return keyRig.visible && story.s > 0.5; }
function hitsKeyOnly(e) {
  if (!keyVisible()) return false;
  toNdc(e);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(keyModel, true).length > 0; // inclui o brilho: alvo maior, mais fácil
}
function hitsKey(e) {
  if (hitsKeyOnly(e)) return true;
  if (story.s < 0.5) return false;
  toNdc(e);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(box, true).length > 0;
}
const dragPlane = new THREE.Plane();

const pointers = new Map();
let press = null;   // { id, sx, sy, local, dir, moved }
let orbit = null;   // botão direito
let pinch = null;

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  cam.lastInput = performance.now();
  if (!state.ready) {
    if (introRunning) return;
    if (hitsKeyOnly(e)) { // pega a chave
      const n = camera.getWorldDirection(new THREE.Vector3()).negate();
      dragPlane.setFromNormalAndCoplanarPoint(n, keyRig.position);
      keyDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
      keyFloating = false;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('arrastando');
      return;
    }
    if (hitsKey(e)) { openBox(false); return; }
    {
      orbit = { x: e.clientX, y: e.clientY, az: cam.azT, pol: cam.polT, intro: true, t: story.t, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('arrastando');
    }
    return;
  }
  if (spinCard(e)) return;
  if (pointers.size === 2) { // pinça no celular: cancela qualquer arraste
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
    if (press && state.anim && state.anim.dragging) finishTo(false);
    press = null;
    return;
  }
  if (e.button === 2 || e.button === 1) {
    orbit = { x: e.clientX, y: e.clientY, az: cam.az, pol: cam.pol };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (state.anim) return; // virada em andamento: o clique não mexe em nada
  const loc = pointerLocal(e);
  let dir = 0;
  if (loc && Math.abs(loc.z) <= H / 2 + 0.05) {
  if (loc.x >= -0.02 && loc.x <= W + 0.05 && state.turned < state.L) dir = 1;
  else if (loc.x <= 0.02 && loc.x >= -W - 0.05 && state.turned > 0) dir = -1;
  }
  if (!dir) { // fora das páginas: arrastar gira a cena
    orbit = { x: e.clientX, y: e.clientY, az: cam.azT, pol: cam.polT };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('arrastando');
    return;
  }
  press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, local: loc, dir, moved: false };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  cam.mxT = (e.clientX / innerWidth) * 2 - 1;
  cam.myT = (e.clientY / innerHeight) * 2 - 1;
  if (keyDrag && e.pointerId === keyDrag.id) {
    if (Math.hypot(e.clientX - keyDrag.sx, e.clientY - keyDrag.sy) > 6) keyDrag.moved = true;
    toNdc(e);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(dragPlane, tmpV)) {
      tmpV.y = Math.max(0.12, tmpV.y);
      keyRig.position.lerp(tmpV, 0.6);
      // perto da fechadura: a chave já se alinha
      const near = 1 - smooth(0.2, 0.7, keyRig.position.distanceTo(keyHole));
      keyOrient.rotation.x = lerp(0, Math.PI / 2, near);
      keyRig.rotation.z = lerp(-0.35, 0, near);
      if (near > 0.55) { const k = keyDrag; keyDrag = null; canvas.classList.remove('arrastando'); if (k) openBox(false); }
    }
    return;
  }
  if (orbit && orbit.intro) {
    cam.lastInput = performance.now();
    const dx = e.clientX - orbit.x, dy = e.clientY - orbit.y;
    cam.azT = clamp(orbit.az - dx * 0.005, -0.9, 0.9);
    if (orbit.touch) story.t = clamp(orbit.t - dy * 0.0016, 0, 1); // no celular, arrastar pra cima avança
    else cam.polT = clamp(orbit.pol - dy * 0.003, -0.35, 0.4);
    return;
  }
  if (!state.ready) {
    canvas.classList.toggle('sobre-chave', hitsKey(e));
    return;
  }
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    cam.zoom = clamp(pinch.zoom * (pinch.d / d), 0.55, 1.5);
    return;
  }
  if (orbit) {
    cam.azT = clamp(orbit.az - (e.clientX - orbit.x) * 0.005, -0.75, 0.75);
    cam.polT = clamp(orbit.pol - (e.clientY - orbit.y) * 0.003, -0.12, 0.55);
    return;
  }
  if (!press || e.pointerId !== press.id) return;
  if (!press.moved && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 6) {
    press.moved = true;
    const tx = press.dir > 0 ? press.local.x : -press.local.x;
    const C0 = cornerFromPress(tx, press.local.z);
    const a = beginTurn(press.dir, C0);
    a.dragging = true;
    a.offset = { x: C0.x - tx, z: C0.z - press.local.z };
    canvas.classList.add('arrastando');
    refreshResolution();
  }
  if (press.moved && state.anim && state.anim.dragging) {
    const loc = pointerLocal(e);
    if (!loc) return;
    const a = state.anim;
    const tx = a.back ? -loc.x : loc.x;
    a.P.x = tx + a.offset.x;
    a.P.z = loc.z + a.offset.z;
    clampP(a.P, a.C0);
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (keyDrag && e.pointerId === keyDrag.id) {
    const k = keyDrag; keyDrag = null;
    canvas.classList.remove('arrastando');
    if (!k.moved) { openBox(false); return; }
    // soltou longe: a chave volta flutuando
    const from = keyRig.position.clone(), r0 = keyOrient.rotation.x;
    tween(0.6, t => { keyRig.position.lerpVectors(from, keyHome(), t); keyOrient.rotation.x = lerp(r0, 0, t); }, easeOut)
      .then(() => { if (!introRunning) keyFloating = true; });
    return;
  }
  if (orbit) { orbit = null; canvas.classList.remove('arrastando'); return; }
  if (!press || e.pointerId !== press.id) return;
  const p = press; press = null;
  canvas.classList.remove('arrastando');
  if (p.moved) {
    if (state.anim && state.anim.dragging) {
      // passou da lombada? termina a virada; senão volta
      finishTo(state.anim.P.x < 0);
    }
    return;
  }
  // clique simples: a página dobra a partir do canto mais próximo
  if (state.anim || !canTurn(p.dir)) return;
  const tx = p.dir > 0 ? p.local.x : -p.local.x;
  beginTurn(p.dir, cornerFromPress(tx, p.local.z));
  finishTo(true);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (!state.ready) { advance(e.deltaY * (e.deltaMode === 1 ? 0.016 : 0.00045)); return; }
  cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 1.5);
}, { passive: false });

addEventListener('keydown', e => {
  if (!state.ready) {
    if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(e.key)) { e.preventDefault(); advance(0.08); }
    if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); advance(-0.08); }
    if (e.key === 'Enter') openBox(false);
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); command(1); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); command(-1); }
  if (e.key === 'Home') { e.preventDefault(); goTo(0); }
  if (e.key === 'End') { e.preventDefault(); goTo(state.L); }
});
elNext.addEventListener('click', () => command(1));
elPrev.addEventListener('click', () => command(-1));
elPular.addEventListener('click', () => openBox(true));

function spinCard(e) {
  toNdc(e);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(flyingCards.filter(c => c.m.visible).map(c => c.m))[0];
  if (!hit) return false;
  const c = flyingCards.find(x => x.m === hit.object);
  if (c.spinning) return true;
  c.spinning = true;
  tween(1.1, t => { c.flip = t * Math.PI * 2; }, easeInOut).then(() => { c.flip = 0; c.spinning = false; });
  return true;
}

function goTo(target) {
  if (state.anim) return;
  const dir = Math.sign(target - state.turned);
  if (!dir) return;
  command(dir);
  if (state.turned + dir !== target) state.queue = dir;
}

/* ------------------------------------------------------- ESTADO / UI */
function label() {
  const { turned: t, L, N } = state;
  if (!N) return '';
  if (t === 0) return 'Capa';
  if (t === L) return N % 2 === 1 ? 'Fim' : 'Contracapa';
  const l = 2 * t, r = 2 * t + 1;
  return r <= N ? `${l}–${r} de ${N}` : `${l} de ${N}`;
}
function onStateChange() {
  elCont.textContent = label();
  elPrev.disabled = state.turned === 0;
  elNext.disabled = state.turned === state.L;
  refreshResolution();
}

/* --------------------------------------------------------------- LOOP */
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.25);
  elapsed += dt;

  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(k));
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }

  // centraliza a revista fechada (capa ou contracapa)
  if (state.ready && state.N) {
    const t = state.anim && !state.anim.dragging ? state.turned + state.anim.dir : state.turned;
    const target = t === 0 ? -W / 2 : t === state.L ? W / 2 : 0;
    book.position.x = REDUCED ? target : lerp(book.position.x, target, 1 - Math.exp(-dt * 5));
    const open = t !== 0 && t !== state.L;
    shadow.scale.set(lerp(shadow.scale.x, open ? 2.5 : 1.45, 0.1), H * 1.3, 1);
    shadow.position.x = open ? 0 : 0;
  } else {
    shadow.scale.set(1.45, H * 1.3, 1);
  }
  shadow.visible = state.ready;

  updateAnimMesh();

  // história: suaviza o scroll e move o mundo
  story.s += (story.t - story.s) * (REDUCED ? 1 : 1 - Math.exp(-dt * 3.2));
  const S = story.s;
  if (!state.ready && !introRunning) {
    const up = smooth(0.14, 0.4, S);
    box.position.y = lerp(-0.34, 0, up);           // a caixa sobe de dentro da mesa
    book.position.y = 0.022 + box.position.y;
    innerHalo.material.opacity = 0.5 * Math.sin(Math.PI * up);
    innerHalo.position.y = 0.05;
    keyRig.visible = S > 0.48;
    if (!keyDrag && keyFloating) keyModel.scale.setScalar(1.05 * easeOut(smooth(0.48, 0.6, S)));
    if (story.t >= 0.985 && S > 0.96) openBox(false);
  }
  if (!state.ready) {
    elBeats.forEach(b => {
      const a = +b.dataset.in, z = +b.dataset.out;
      const o = introRunning ? 0 : smooth(a, a + 0.05, S) * (1 - smooth(z - 0.05, z, S));
      b.style.opacity = o.toFixed(3);
      b.style.transform = `translateY(${((1 - o) * 18).toFixed(1)}px)`;
    });
    elBarra.style.transform = `scaleY(${S.toFixed(4)})`;
    elDica.textContent = S < 0.04 ? (matchMedia('(pointer: coarse)').matches ? 'arraste para cima' : 'role para baixo') : S > 0.5 ? 'arraste a chave até a fechadura' : '';
  }
  hemi.intensity = lerp(2.3, lerp(0.35, 1.9, smooth(0.04, 0.5, S)), cam.intro);
  dir.intensity = lerp(0.3, 0.12, cam.intro);

  // chave flutuando
  if (keyFloating) {
    keyRig.position.copy(keyHome());
    keyOrient.rotation.x = 0;
    keyModel.rotation.y = REDUCED ? 0.3 : Math.sin(elapsed * 0.8) * 0.6;
    keyRig.rotation.z = -0.35;
    keyModel.userData.glow.material.opacity = 0.45 + Math.sin(elapsed * 2.2) * 0.15;
  }

  // velas
  candles.forEach((c, i) => {
    const th = [0, 0.07, 0.13, 0.19][i];
    const lit = state.ready || introRunning ? 1 : i === 0 ? smooth(0.2, 1.6, elapsed) : smooth(th, th + 0.035, S);
    const pop = 1 + Math.sin(Math.PI * clamp(lit, 0, 1)) * 0.6; // acende com um "puf"
    const f = REDUCED ? 1 : 0.85 + Math.sin(elapsed * 9 + c.seed) * 0.06 + Math.sin(elapsed * 23 + c.seed * 3) * 0.05;
    c.flame.scale.set(0.06 * f * lit * pop, 0.13 * (0.9 + 0.2 * f) * lit * pop, 1);
    c.halo.material.opacity = (0.55 + 0.25 * f) * lerp(0.22, 1, cam.intro) * lit;
    c.light.intensity = 0.32 * f * lit * lerp(1, 1.6, cam.intro);
    c.lit = lit;
  });
  if (!REDUCED) smoke.forEach((p, j) => {
    p.life += dt * p.speed;
    if (p.life > 1) p.life -= 1;
    const t = p.life;
    p.s.position.set(
      p.origin.x + Math.sin(t * 5 + p.drift) * 0.05 * t * 3,
      p.origin.y + t * 0.9,
      p.origin.z + Math.cos(t * 4 + p.drift) * 0.04 * t * 3
    );
    p.s.scale.setScalar(0.06 + t * 0.7);
    p.s.material.opacity = 0.24 * Math.sin(Math.PI * t) * (candles[Math.floor(j / 22)].lit ?? 1);
  });

  // fumaça mística girando em volta da caixa (some de cima das páginas na leitura)
  const veilAmt = state.ready ? 0.55 : lerp(0.5, 1.15, smooth(0.1, 0.45, S)) * (introRunning ? 1.3 : 1);
  veil.forEach(v => {
    const u = v.userData;
    if (!REDUCED) { u.ang += u.sp * dt * (introRunning ? 3 : 1); v.material.rotation += u.rs * dt; }
    const x = Math.cos(u.ang) * u.rad, z = Math.sin(u.ang) * u.rad * 0.8;
    v.position.set(x, u.y + Math.sin(elapsed * 0.5 + u.ph) * 0.06, z);
    v.scale.setScalar(u.sc * (1 + 0.1 * Math.sin(elapsed * 0.3 + u.ph)));
    const inside = Math.abs(x) < 1.25 && Math.abs(z) < H * 0.62;
    v.material.opacity = 0.11 * veilAmt * (0.7 + 0.3 * Math.sin(elapsed * 0.6 + u.ph)) * (inside ? cam.intro : 1);
  });
  if (!REDUCED) beam.rotation.y += dt * 0.15;

  // névoa rasteira (nunca em cima das páginas abertas)
  mist.forEach(s => {
    const u = s.userData;
    if (!REDUCED) u.ang += u.sp * dt;
    const x = Math.cos(u.ang) * u.rad, z = Math.sin(u.ang) * u.rad * 0.8;
    s.position.set(x, u.y, z);
    s.scale.setScalar(u.sc);
    const inside = Math.abs(x) < 1.6 && Math.abs(z) < H * 0.75;
    const base = 0.1 + 0.05 * Math.sin(elapsed * 0.4 + u.ph);
    s.material.opacity = base * (inside ? cam.intro : 1);
  });

  // poeira
  if (!REDUCED) {
    const a = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      a[i * 3 + 1] += dt * 0.03;
      a[i * 3] += Math.sin(elapsed * 0.3 + i) * dt * 0.01;
      if (a[i * 3 + 1] > 2.2) a[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  // cartas em órbita
  flyingCards.forEach((c, i) => {
    if (!c.m.visible) return;
    // flutuam nas margens laterais, sem cobrir as páginas
    const drift = REDUCED ? 0 : elapsed * 0.08 + c.slot * 2.1;
    const ox = c.side * (1.13 + 0.05 * Math.sin(drift * 1.7));
    const oz = ((c.slot - 1) * 0.42) + (REDUCED ? 0 : Math.sin(drift) * 0.12);
    const oy = c.h + (REDUCED ? 0 : Math.sin(elapsed * 0.9 + i) * 0.05);
    const k = c.out;
    // saem da caixa em espiral
    const sa = (1 - k) * Math.PI * 3 + i;
    const sr = Math.sin(Math.PI * k) * 0.55;
    c.m.position.set(lerp(0, ox, k) + Math.cos(sa) * sr, lerp(0.15, oy, k) + Math.sin(Math.PI * k) * 0.6, lerp(0, oz, k) + Math.sin(sa) * sr);
    c.m.rotation.set(-Math.PI / 2 + 0.25 + (REDUCED ? 0 : Math.sin(elapsed * 0.7 + c.spin) * 0.12), 0, -c.side * 0.12 + (REDUCED ? 0 : Math.sin(elapsed * 0.4 + c.spin) * 0.15));
    c.m.rotation.y += c.flip || 0;
    c.m.scale.setScalar(lerp(0.3, 1, k) * (c.hover ? 1.12 : 1));
  });

  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- INÍCIO */
resize();
buildBox();
book.position.set(-W / 2, 0.022, 0);
loadPdf();
requestAnimationFrame(frame);
setTimeout(() => document.body.classList.add('pronto'), 60);

// ponto de teste (usado só pela verificação automática)
window.__revista = { state, command, openBox, label, H: () => H, story };
