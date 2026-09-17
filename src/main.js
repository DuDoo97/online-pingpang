// main.js — Three.js rendering, input and HUD around the headless Match.
import * as THREE from 'three';
import { Match } from './game.js';
import { PARAMS, TABLE, BALL, spinComponents, simulateFlight, v3, len } from './physics.js';
import { GRIPS, classify, synthesize, wingFor } from './strokes.js';
import { LEVELS, LEVEL_ORDER } from './levels.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1f26);
scene.fog = new THREE.Fog(0x1b1f26, 9, 22);

const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 60);
const CAM_HOME = new THREE.Vector3(0, TABLE.height + 1.05, TABLE.length / 2 + 1.55);
camera.position.copy(CAM_HOME);
camera.lookAt(0, TABLE.height + 0.05, -0.4);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x2a2622, 0.55));
const key = new THREE.DirectionalLight(0xfff2df, 2.1);
key.position.set(1.8, 4.2, 1.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
key.shadow.camera.near = 1; key.shadow.camera.far = 12;
key.shadow.bias = -0.0008;
scene.add(key);
const fill = new THREE.DirectionalLight(0xb9c8ff, 0.5); fill.position.set(-3, 2.5, -2); scene.add(fill);

// ---------- hall ----------
{
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x7a2e2a, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 20), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // court lines on the floor
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e2d3 });
  const mkLine = (w, h, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z); scene.add(m); };
  mkLine(0.05, 12, -3.4, 0); mkLine(0.05, 12, 3.4, 0); mkLine(6.85, 0.05, 0, -6); mkLine(6.85, 0.05, 0, 6);
  // surround barriers
  const barMat = new THREE.MeshStandardMaterial({ color: 0x1f3d63, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 12), barMat); b.position.set(side * 3.45, 0.36, 0); b.castShadow = true; scene.add(b);
    const e = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.72, 0.04), barMat); e.position.set(0, 0.36, side * 6.05); scene.add(e);
  }
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 1 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), wallMat); back.position.set(0, 3, -10); scene.add(back);
}

// ---------- table ----------
const tableGroup = new THREE.Group(); scene.add(tableGroup);
{
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.length),
    new THREE.MeshStandardMaterial({ color: 0x1d4f8f, roughness: 0.55, metalness: 0.0 }));
  top.position.y = TABLE.height - TABLE.thickness / 2; top.receiveShadow = true; top.castShadow = true; tableGroup.add(top);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 });
  const strip = (w, l, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0015, l), lineMat); m.position.set(x, TABLE.height + 0.0008, z); tableGroup.add(m); };
  strip(0.02, TABLE.length, -TABLE.width / 2 + 0.01, 0); strip(0.02, TABLE.length, TABLE.width / 2 - 0.01, 0);
  strip(TABLE.width, 0.02, 0, -TABLE.length / 2 + 0.01); strip(TABLE.width, 0.02, 0, TABLE.length / 2 - 0.01);
  strip(0.003, TABLE.length, 0, 0);   // centre line (doubles)
  const legMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.5, metalness: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE.height - TABLE.thickness, 0.05), legMat);
    leg.position.set(sx * (TABLE.width / 2 - 0.12), (TABLE.height - TABLE.thickness) / 2, sz * (TABLE.length / 2 - 0.25)); leg.castShadow = true; tableGroup.add(leg);
  }
  // net
  const netW = TABLE.width + 2 * TABLE.netOverhang;
  const net = new THREE.Mesh(new THREE.PlaneGeometry(netW, TABLE.netHeight),
    new THREE.MeshStandardMaterial({ color: 0x0f1216, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }));
  net.position.set(0, TABLE.height + TABLE.netHeight / 2, 0); tableGroup.add(net);
  const band = new THREE.Mesh(new THREE.BoxGeometry(netW, 0.012, 0.004), new THREE.MeshStandardMaterial({ color: 0xf4f1ea }));
  band.position.set(0, TABLE.height + TABLE.netHeight, 0); tableGroup.add(band);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, TABLE.netHeight + 0.02, 12), legMat);
    post.position.set(s * netW / 2, TABLE.height + TABLE.netHeight / 2, 0); tableGroup.add(post);
  }
}

// ---------- ball ----------
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
ballMesh.castShadow = true;
// a seam so spin reads visually
{
  const seam = new THREE.Mesh(new THREE.TorusGeometry(BALL.radius * 1.001, 0.0012, 6, 48), new THREE.MeshBasicMaterial({ color: 0xd8641c }));
  ballMesh.add(seam);
  const seam2 = seam.clone(); seam2.rotation.x = Math.PI / 2; ballMesh.add(seam2);
}
scene.add(ballMesh);
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(BALL.radius * 1.1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);

// trail
const TRAIL_N = 40;
const trailPos = new Float32Array(TRAIL_N * 3);
const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.55 }));
trail.frustumCulled = false; scene.add(trail);
let trailCount = 0;

// predicted path (debug)
const PRED_N = 240;
const predGeo = new THREE.BufferGeometry(); predGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRED_N * 3), 3));
const predLine = new THREE.Line(predGeo, new THREE.LineDashedMaterial({ color: 0x8fd3ff, dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.7 }));
predLine.frustumCulled = false; predLine.visible = false; scene.add(predLine);

// ---------- rackets ----------
function makeRacket(rubber) {
  const g = new THREE.Group();
  const bladeGroup = new THREE.Group(); g.add(bladeGroup); g.blade = bladeGroup;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.006, 40), new THREE.MeshStandardMaterial({ color: 0xc9a273, roughness: 0.8 }));
  blade.rotation.x = Math.PI / 2; blade.castShadow = true; bladeGroup.add(blade);
  const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.004, 40), new THREE.MeshStandardMaterial({ color: rubber, roughness: 0.35 }));
  r1.rotation.x = Math.PI / 2; r1.position.z = 0.005; bladeGroup.add(r1);
  const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.004, 40), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.35 }));
  r2.rotation.x = Math.PI / 2; r2.position.z = -0.005; bladeGroup.add(r2);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.10, 0.02), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }));
  handle.position.y = -0.12; handle.castShadow = true;
  const handlePivot = new THREE.Group(); handlePivot.add(handle); g.add(handlePivot);
  g.handle = handlePivot;
  return g;
}
const playerRacketMesh = makeRacket(0xc0272d); scene.add(playerRacketMesh);
const aiRacketMesh = makeRacket(0xc0272d); scene.add(aiRacketMesh);
const up = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
function orientRacket(mesh, pos, normal, flip = false) {
  mesh.position.set(pos.x, pos.y, pos.z);
  // racket +z is the red face; the face that meets the ball looks along the normal (flip shows the black face)
  const n = tmpV.set(normal.x, normal.y, normal.z).normalize();
  tmpM.lookAt(new THREE.Vector3(0, 0, 0), flip ? n.clone() : n.clone().negate(), up);
  tmpQ.setFromRotationMatrix(tmpM);
  mesh.quaternion.slerp(tmpQ, 0.5);
}

// ---------- audio ----------
let audio = null;
function beep(freq, dur, gain = 0.25, type = 'sine') {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + dur);
  } catch (e) { /* ignore */ }
}

// ---------- match + events ----------
const ui = {
  score: document.getElementById('score'), msg: document.getElementById('msg'), shot: document.getElementById('shot'),
  rally: document.getElementById('rally'), level: document.getElementById('level'), style: document.getElementById('style'),
  grip: document.getElementById('grip'), gripBlurb: document.getElementById('gripBlurb'), hand: document.getElementById('hand'),
  assist: document.getElementById('assist'), assistVal: document.getElementById('assistVal'), pred: document.getElementById('pred'),
  slow: document.getElementById('slow'), cam: document.getElementById('camsel'), spinBadge: document.getElementById('spinBadge'),
  log: document.getElementById('log'), stroke: document.getElementById('stroke'), strokeHint: document.getElementById('strokeHint'),
  coach: document.getElementById('coach'), stance: document.getElementById('stance'), aiShot: document.getElementById('aiShot'),
  cheat: document.getElementById('cheat'), autoAim: document.getElementById('autoAim'), autoAimVal: document.getElementById('autoAimVal'),
  racketScale: document.getElementById('racketScale'), racketScaleVal: document.getElementById('racketScaleVal'),
  levelSeg: document.getElementById('levelSeg'), levelBlurb: document.getElementById('levelBlurb'), levelBadge: document.getElementById('levelBadge'),
  levelModal: document.getElementById('levelModal'),
};
const logLines = [];
function log(s) { logLines.push(s); if (logLines.length > 6) logLines.shift(); ui.log.textContent = logLines.join('\n'); }

// coach: one line after each lost point, tied to what happened
const COACH = {
  'your ball missed the table': ['Too much: ease off the swipe, or hold left for topspin so the ball dips.', 'Long again. Topspin (left button) pulls the ball down onto the table.'],
  'your ball did not cross the net': ['Into the net. Against backspin, open the face: hold right and push, or lift with a slower loop.', 'Netted. Swipe a little slower or keep the racket lower on contact.'],
  'you let it bounce twice': ['Late. The racket steps in for short balls, so wait over the table and hit as the ball rises.', 'Move toward the ball earlier: the second bounce is the AI\'s point.'],
  'you missed the return': ['Get the racket behind the ball, then swipe. Standing still and holding left is a safe block.'],
  'you missed the toss': ['Toss, then swipe forward when the ball drops back to racket height. Hold a button while you do it for spin.'],
  'serve must bounce on your side first': ['A serve must land on your half first: hit the toss a little downward and softer.'],
  'volley: let it bounce first': ['Volley. Let the ball bounce on your side before you hit it.'],
  'you hit the ball twice': ['Double hit: one clean swipe per ball.'],
};
let coachIx = 0;
function coach(reason) {
  const lines = COACH[reason];
  if (!lines || !settings.coach) { ui.coach.textContent = ''; return; }
  ui.coach.textContent = lines[coachIx++ % lines.length];
  clearTimeout(coach.timer); coach.timer = setTimeout(() => { ui.coach.textContent = ''; }, 6000);
}

let shake = 0;
const match = new Match({
  level: ui.level.value,
  style: ui.style.value,
  onEvent: (e) => {
    if (e.type === 'racket') { beep(e.who === 'player' ? 520 + e.speed * 18 : 440 + e.speed * 18, 0.07, 0.3, 'triangle'); if (e.who === 'player') shake = Math.min(1, e.speed / 20); }
    else if (e.type === 'bounce') { beep(1900, 0.05, 0.18, 'square'); }
    else if (e.type === 'net') { beep(180, 0.15, 0.2, 'sawtooth'); }
    else if (e.type === 'floor') { beep(120, 0.12, 0.15, 'sine'); }
    else if (e.type === 'point') { log(`${e.winner === 'player' ? 'YOU' : 'AI '} +1  ${e.reason}`); beep(e.winner === 'player' ? 880 : 300, 0.25, 0.2); if (e.winner === 'ai') coach(e.reason); else ui.coach.textContent = ''; }
    else if (e.type === 'let') { log('let'); }
    else if (e.type === 'shot') {
      const who = e.who === 'player' ? 'You' : 'AI';
      const name = e.stroke ? e.stroke.label : e.kind;
      const line = `${name} · ${e.speed.toFixed(1)} m/s · ${Math.round(e.rpm)} rpm`;
      if (e.who === 'player') { ui.shot.textContent = line; log(`you  ${name}  ${e.speed.toFixed(1)} m/s  ${Math.round(e.rpm)} rpm`); lastPlayerStroke = { label: name, t: performance.now() }; }
      else { ui.aiShot.textContent = `AI: ${line}`; }
    }
    else if (e.type === 'toss') { trailCount = 0; }
  },
});
match.assist = parseFloat(ui.assist.value);
window.__match = match;   // for debugging / headless tests
let lastPlayerStroke = null;

// ---------- player level ----------
const settings = { level: 'casual', autoAim: 0.35, coach: true, hints: true };
let applyingLevel = false;
function applyLevel(key, { remember = true } = {}) {
  const L = LEVELS[key]; if (!L) return;
  applyingLevel = true;
  settings.level = key; settings.autoAim = L.autoAim; settings.coach = L.coach; settings.hints = L.hints;
  match.assist = L.assist; match.racketScale = L.racketScale; match.timeScale = ui.slow.checked ? 0.35 : L.timeScale;
  match.ai.setLevel(L.ai);
  ui.assist.value = L.assist; ui.assistVal.textContent = Math.round(L.assist * 100) + '%';
  ui.autoAim.value = L.autoAim; ui.autoAimVal.textContent = Math.round(L.autoAim * 100) + '%';
  ui.racketScale.value = L.racketScale; ui.racketScaleVal.textContent = L.racketScale.toFixed(1) + '×';
  ui.level.value = L.ai;
  for (const b of ui.levelSeg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.level === key));
  ui.levelBlurb.textContent = L.blurb;
  ui.levelBadge.textContent = L.label;
  ui.coach.textContent = '';
  if (remember) { try { localStorage.setItem('pingpang.level', key); } catch (e) { /* ignore */ } }
  applyingLevel = false;
}
function customLevel() {
  if (applyingLevel) return;
  settings.level = 'custom';
  for (const b of ui.levelSeg.querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
  ui.levelBadge.textContent = 'custom';
  ui.levelBlurb.textContent = 'Custom mix of the sliders below.';
}
for (const b of document.querySelectorAll('[data-level]')) b.addEventListener('click', () => { applyLevel(b.dataset.level); ui.levelModal.hidden = true; });
ui.levelBadge.addEventListener('click', () => { ui.levelModal.hidden = false; });
ui.levelModal.addEventListener('click', (e) => { if (e.target === ui.levelModal) ui.levelModal.hidden = true; });
{
  let saved = null; try { saved = localStorage.getItem('pingpang.level'); } catch (e) { /* ignore */ }
  if (saved && LEVELS[saved]) { applyLevel(saved, { remember: false }); ui.levelModal.hidden = true; }
  else applyLevel('casual', { remember: false });
}

// ---------- input: gesture + buttons + situation -> stroke -> racket swing ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0, 0);
// The cursor plane is vertical, at the player's stance depth: mouse X = lateral, mouse Y = height.
// Depth (forward/back) is NOT on the mouse: the racket steps in for short balls by itself, and the wheel
// changes your stance (close to the table / mid / far back) which changes what strokes are available.
const STANCES = [
  { key: 'close', label: 'Close to the table', depth: 0.30 },
  { key: 'mid',   label: 'Mid distance',       depth: 0.75 },
  { key: 'far',   label: 'Far back',           depth: 1.35 },
];
let stanceIx = 0;
const controlPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(TABLE.length / 2 + STANCES[0].depth));
function setStance(ix) {
  stanceIx = Math.max(0, Math.min(STANCES.length - 1, ix));
  controlPlane.constant = -(TABLE.length / 2 + STANCES[stanceIx].depth);
  ui.stance.textContent = STANCES[stanceIx].label + (stanceIx === 2 ? ' · chops and lobs' : stanceIx === 0 ? ' · flicks and blocks' : '');
}
setStance(0);

const rs = {
  pos: v3(0, TABLE.height + 0.25, TABLE.length / 2 + 0.30), prev: v3(0, TABLE.height + 0.25, TABLE.length / 2 + 0.30),
  cursor: v3(0, TABLE.height + 0.25, TABLE.length / 2 + 0.30),   // where the mouse says the hand is (x, y)
  cursorVel: v3(), vel: v3(), normal: v3(0, 0, -1),
  button: null,                 // 'L' | 'R' | null
  wing: 'fh', stroke: null, swing: null,
  gesture: { speed: 0, vx: 0, fwd: 0 },
};
canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(controlPlane, hit)) {
    rs.cursor = v3(Math.max(-1.4, Math.min(1.4, hit.x)), Math.max(TABLE.height - 0.1, Math.min(TABLE.height + 1.2, hit.y)), rs.cursor.z);
  }
});
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button === 0) rs.button = 'L'; else if (ev.button === 2) rs.button = 'R';
  if (match.restartIfOver()) return;
  if (ev.button === 0 || ev.button === 2) match.toss();
});
window.addEventListener('pointerup', (ev) => { if ((ev.button === 0 && rs.button === 'L') || (ev.button === 2 && rs.button === 'R')) rs.button = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); if (!match.restartIfOver()) match.toss(); }
  if (e.key === 'r' || e.key === 'R') match.reset();
  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') setStance(stanceIx - 1);
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') setStance(stanceIx + 1);
  if (e.key === 'h' || e.key === 'H') ui.cheat.classList.toggle('open');
  if (e.key >= '1' && e.key <= '4') { applyLevel(LEVEL_ORDER[Number(e.key) - 1]); ui.levelModal.hidden = true; }
  if (e.key === 'Escape') ui.levelModal.hidden = true;
});
canvas.addEventListener('wheel', (e) => { setStance(stanceIx + Math.sign(e.deltaY)); }, { passive: true });

// ---------- UI wiring ----------
ui.level.addEventListener('change', () => { match.ai.setLevel(ui.level.value); customLevel(); });
ui.style.addEventListener('change', () => match.ai.setStyle(ui.style.value));
function applyGrip() {
  const g = GRIPS[ui.grip.value];
  ui.gripBlurb.textContent = g.blurb;
  playerRacketMesh.handle.rotation.z = g.handleUp ? Math.PI : 0;
}
ui.grip.addEventListener('change', applyGrip); applyGrip();
ui.assist.addEventListener('input', () => { match.assist = parseFloat(ui.assist.value); ui.assistVal.textContent = Math.round(match.assist * 100) + '%'; customLevel(); });
ui.autoAim.addEventListener('input', () => { settings.autoAim = parseFloat(ui.autoAim.value); ui.autoAimVal.textContent = Math.round(settings.autoAim * 100) + '%'; customLevel(); });
ui.racketScale.addEventListener('input', () => { match.racketScale = parseFloat(ui.racketScale.value); ui.racketScaleVal.textContent = match.racketScale.toFixed(1) + '×'; customLevel(); });
ui.slow.addEventListener('change', () => { match.timeScale = ui.slow.checked ? 0.35 : (LEVELS[settings.level] ? LEVELS[settings.level].timeScale : 1); });
ui.pred.addEventListener('change', () => { predLine.visible = ui.pred.checked; });

// physics parameter panel
const panel = document.getElementById('params');
const PARAM_UI = [
  ['dragCd', 'Drag Cd', 0, 1, 0.01], ['magnusScale', 'Magnus scale', 0, 2.5, 0.05], ['tableCOR', 'Table COR (at 0 m/s)', 0.6, 1, 0.01],
  ['tableFriction', 'Table friction μ', 0, 0.6, 0.01], ['racketCOR', 'Racket COR (at 0 m/s)', 0.4, 1, 0.01], ['racketTangentialCOR', 'Rubber grip e_t', 0, 1, 0.01],
  ['airDensity', 'Air density', 0, 1.6, 0.05], ['gravity', 'Gravity', 0, 20, 0.1],
];
const DEFAULTS = { ...PARAMS };
for (const [k, label, min, max, step] of PARAM_UI) {
  const row = document.createElement('label');
  row.innerHTML = `<span>${label}</span><input type="range" id="p_${k}" min="${min}" max="${max}" step="${step}" value="${PARAMS[k]}"><output id="o_${k}">${PARAMS[k]}</output>`;
  panel.appendChild(row);
  const inp = row.querySelector('input'), out = row.querySelector('output');
  inp.addEventListener('input', () => { PARAMS[k] = parseFloat(inp.value); out.textContent = inp.value; });
}
document.getElementById('resetParams').addEventListener('click', () => {
  Object.assign(PARAMS, DEFAULTS);
  for (const [k] of PARAM_UI) { document.getElementById('p_' + k).value = PARAMS[k]; document.getElementById('o_' + k).textContent = PARAMS[k]; }
});
document.getElementById('togglePanel').addEventListener('click', () => document.getElementById('side').classList.toggle('open'));
document.getElementById('toggleCheat').addEventListener('click', () => ui.cheat.classList.toggle('open'));

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
let last = performance.now();
const camTarget = new THREE.Vector3(0, TABLE.height + 0.05, -0.4);
let lastPred = 0, lastSolve = 0, lastSolveKey = '', lastSw = null;

// Where should the racket be in depth? Normally at the stance; for a ball that bounces short it steps in
// over the table to meet the ball near the top of its bounce.
let stepTarget = null, aimTarget = null, stepSituation = null, lastStepCalc = 0;
function situation(now) {
  const b = match.ball, hand = ui.hand.value === 'left' ? -1 : 1;
  const stanceZ = TABLE.length / 2 + STANCES[stanceIx].depth;
  const serving = match.state === 'rally' && match.lastHitter === null;
  const receiving = match.shots === 1;
  const incoming = b.active && match.state === 'rally' && !serving && b.vel.z > 0 && match.lastHitter === 'ai';
  if (!incoming) { stepTarget = null; aimTarget = null; stepSituation = { serving, receiving, short: false, high: false, far: stanceIx === 2, incomingTop: 0, wing: rs.wing }; return stepSituation; }
  if (now - lastStepCalc < 50 && stepSituation) return stepSituation;
  lastStepCalc = now;
  // predict: first bounce on my side, then where the ball crosses my stance plane (or its apex if it never gets there)
  let bounce = null, apex = null;
  const r = simulateFlight(b, PARAMS, { maxTime: 2, dt: 1 / 120, stop: (bb, t, ev) => {
    for (const e of ev) if (e.type === 'bounce' && e.side === 'player' && !bounce) bounce = { pos: e.pos, t };
    if (bounce && !apex && bb.vel.y <= 0) apex = { pos: { ...bb.pos }, t };
    return (bb.pos.z >= stanceZ - 0.05 && (!bounce || bb.vel.y <= 0 || bb.pos.y > TABLE.height + 0.14)) || (apex && bb.pos.y < TABLE.height - 0.05) || ev.some(e => e.type === 'floor' || e.type === 'net');
  } });
  const reaches = r.ball.pos.z >= stanceZ - 0.06;
  const short = !!bounce && bounce.pos.z < 0.75 && !reaches;
  const high = reaches ? r.ball.pos.y > TABLE.height + 0.32 : (apex ? apex.pos.y > TABLE.height + 0.32 : false);
  const inTop = spinComponents(b.vel, b.spin).top;
  stepTarget = short && apex ? { z: Math.max(0.15, apex.pos.z + 0.10), y: apex.pos.y } : null;
  const wingX = reaches ? r.ball.pos.x : (apex ? apex.pos.x : b.pos.x);
  aimTarget = reaches ? { x: r.ball.pos.x, y: r.ball.pos.y, t: r.t } : (apex ? { x: apex.pos.x, y: apex.pos.y, t: apex.t } : null);
  rs.wing = wingFor(wingX, hand, rs.wing);
  stepSituation = { serving, receiving, short, high, far: stanceIx === 2 && !short, incomingTop: inTop, wing: rs.wing };
  return stepSituation;
}

function frame(now) {
  requestAnimationFrame(frame);
  resize();
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (dt <= 0) dt = 1 / 60;

  const ctx = situation(now);
  const hand = ui.hand.value === 'left' ? -1 : 1;
  const grip = ui.grip.value;

  // --- hand position: x/y from the cursor (light spring), z from the stance or the step-in target ---
  rs.prev = { ...rs.pos };
  const stanceZ = TABLE.length / 2 + STANCES[stanceIx].depth;
  // cursor velocity (smoothed) = the gesture. Any decisive cursor motion is a swing AT the ball: its size is the
  // power, its sideways part is sidespin, and the held button decides the family (topspin / backspin / flat).
  const k = 1 - Math.exp(-dt * 30);
  // racket drift (Newbie/Casual): the hand eases toward where the ball will be, more strongly as it gets close
  let cx = rs.cursor.x, cy = rs.cursor.y;
  if (settings.autoAim > 0 && aimTarget && aimTarget.t < 0.9) {
    const w = settings.autoAim * (1 - aimTarget.t / 0.9);
    cx = cx + (aimTarget.x - cx) * w; cy = cy + (aimTarget.y - 0.02 - cy) * w;
  }
  const nx = rs.pos.x + (cx - rs.pos.x) * k, ny = rs.pos.y + (cy - rs.pos.y) * k;
  const raw = v3((nx - rs.pos.x) / dt, (ny - rs.pos.y) / dt, 0);
  const a = 1 - Math.exp(-dt * 16);
  rs.cursorVel = v3(rs.cursorVel.x + (raw.x - rs.cursorVel.x) * a, rs.cursorVel.y + (raw.y - rs.cursorVel.y) * a, 0);
  const speed = Math.hypot(rs.cursorVel.x, rs.cursorVel.y);
  const fwd = speed;
  // The swing also carries the racket forward (a lunge that grows with swipe speed) and eases back afterwards.
  const lunge = Math.min(0.28, speed * 0.05);
  const goalZ = (stepTarget ? stepTarget.z : stanceZ) - lunge;
  const kz = 1 - Math.exp(-dt * (goalZ < rs.pos.z ? 32 : 9));
  rs.pos = v3(nx, ny, rs.pos.z + (goalZ - rs.pos.z) * kz);
  rs.gesture = { speed, vx: rs.cursorVel.x, fwd, button: rs.button };   // world frame: swipe right = aim/spin right
  // wing: which side of the body the hand is on (serving: forehand)
  if (!match.ball.active || match.lastHitter !== 'ai') rs.wing = wingFor(rs.pos.x, hand, rs.wing);
  const cls = classify({ button: rs.button, speed, vx: rs.gesture.vx, fwd, ctx, grip, wing: rs.wing });
  rs.stroke = cls;
  // The hand solves the face angle against the real incoming ball. It is a flight search, so run it at ~20 Hz
  // (and only when a ball is live); in between, keep the last solved swing scaled to the current gesture.
  const ball0 = match.ball, live = ball0.active && match.state === 'rally';
  const solveKey = cls.key + '|' + rs.wing + '|' + rs.button + '|' + Math.round(speed * 4);
  let sw;
  if (live && (now - lastSolve > 50 || solveKey !== lastSolveKey)) {
    lastSolve = now; lastSolveKey = solveKey;
    sw = synthesize(cls.key, rs.gesture, grip, rs.wing, ctx, ball0, { x: rs.pos.x, y: rs.pos.y, z: rs.pos.z });
    lastSw = sw;
  } else if (live && lastSw) sw = lastSw;
  else sw = synthesize(cls.key, rs.gesture, grip, rs.wing, ctx);
  // racket velocity for the physics: the synthesized swing plus the actual body motion in depth
  rs.vel = v3(sw.vel.x, sw.vel.y, sw.vel.z + (rs.pos.z - rs.prev.z) / dt * 0.5);
  rs.normal = v3(sw.normal.x, sw.normal.y, sw.normal.z);

  // At the instant of contact the hand re-solves the face against the ball as it actually is (the frame's solve
  // can be up to 50 ms stale, which at 6 m/s is 30 cm of ball travel).
  const bodyVz = (rs.pos.z - rs.prev.z) / dt * 0.5;
  const refine = (ballNow) => {
    const s2 = synthesize(cls.key, rs.gesture, grip, rs.wing, ctx, ballNow, { x: rs.pos.x, y: rs.pos.y, z: rs.pos.z });
    return { normal: s2.normal, vel: v3(s2.vel.x, s2.vel.y, s2.vel.z + bodyVz) };
  };
  match.update(dt, { prev: rs.prev, pos: rs.pos, vel: rs.vel, normal: rs.normal, stroke: { key: cls.key, label: cls.label }, refine });

  // --- visuals ---
  const b = match.ball;
  ballMesh.visible = b.active;
  ballShadow.visible = b.active && b.pos.y > TABLE.height && Math.abs(b.pos.x) < TABLE.width / 2 && Math.abs(b.pos.z) < TABLE.length / 2;
  if (b.active) {
    ballMesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    const w = len(b.spin);
    if (w > 1e-3) { const ax = new THREE.Vector3(b.spin.x / w, b.spin.y / w, b.spin.z / w); ballMesh.rotateOnWorldAxis(ax, Math.min(w * dt * match.timeScale, 0.6)); }
    ballShadow.position.set(b.pos.x, TABLE.height + 0.002, b.pos.z);
    ballShadow.material.opacity = Math.max(0.05, 0.4 - (b.pos.y - TABLE.height) * 0.35);
    for (let i = TRAIL_N - 1; i > 0; i--) { trailPos[i * 3] = trailPos[(i - 1) * 3]; trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1]; trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2]; }
    trailPos[0] = b.pos.x; trailPos[1] = b.pos.y; trailPos[2] = b.pos.z;
    trailCount = Math.min(TRAIL_N, trailCount + 1);
    trailGeo.setDrawRange(0, trailCount); trailGeo.attributes.position.needsUpdate = true;
    const sc = spinComponents(b.vel, b.spin);
    const kind = Math.abs(sc.top) < 40 && Math.abs(sc.side) < 40 ? 'flat' : (Math.abs(sc.top) >= Math.abs(sc.side) ? (sc.top > 0 ? 'topspin' : 'backspin') : 'sidespin');
    ui.spinBadge.textContent = `${len(b.vel).toFixed(1)} m/s · ${Math.round(sc.rpm)} rpm · ${kind}`;
    ui.spinBadge.dataset.kind = kind;
    if (predLine.visible && now - lastPred > 60) {
      lastPred = now;
      const tr = [];
      simulateFlight(b, PARAMS, { maxTime: 1.6, dt: 1 / 120, trace: tr, stop: (bb, t, ev) => ev.some(e => e.type === 'floor') });
      const arr = predGeo.attributes.position.array;
      const nPts = Math.min(PRED_N, tr.length);
      for (let i = 0; i < nPts; i++) { arr[i * 3] = tr[i].pos.x; arr[i * 3 + 1] = tr[i].pos.y; arr[i * 3 + 2] = tr[i].pos.z; }
      predGeo.setDrawRange(0, nPts); predGeo.attributes.position.needsUpdate = true; predLine.computeLineDistances();
    }
  } else { trailCount = 0; trailGeo.setDrawRange(0, 0); ui.spinBadge.textContent = ''; predGeo.setDrawRange(0, 0); }

  // racket meshes: the player's shows the black face on backhand for flipping grips
  const flip = (GRIPS[grip][rs.wing] || GRIPS[grip].fh).flip;
  playerRacketMesh.blade.scale.setScalar(match.racketScale);
  orientRacket(playerRacketMesh, match.player.pos, match.player.normal, flip);
  orientRacket(aiRacketMesh, match.ai.racket.pos, match.ai.racket.normal, false);

  // camera
  const mode = ui.cam.value;
  const follow = b.active ? b.pos.x * 0.25 : 0;
  const back = STANCES[stanceIx].depth * 0.6;
  const goal = mode === 'side'
    ? new THREE.Vector3(3.2, TABLE.height + 0.9, 0.4)
    : mode === 'top' ? new THREE.Vector3(0, TABLE.height + 3.8, 0.01)
    : new THREE.Vector3(CAM_HOME.x + follow, CAM_HOME.y + back * 0.25, CAM_HOME.z + back);
  camera.position.lerp(goal, 1 - Math.exp(-dt * 4));
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * 0.01 * shake; camera.position.y += (Math.random() - 0.5) * 0.01 * shake; shake = Math.max(0, shake - dt * 4); }
  camera.lookAt(camTarget);

  // HUD
  ui.score.innerHTML = `<span class="you">${match.score.player}</span><span class="sep">·</span><span class="ai">${match.score.ai}</span>`;
  ui.msg.textContent = match.message;
  ui.rally.textContent = `rally ${match.rally} · best ${match.longestRally} · ${match.server === 'player' ? 'you serve' : 'AI serves'}`;
  // stroke readout: what you are loaded for right now (before contact); after a hit, freeze the name briefly
  const recent = lastPlayerStroke && now - lastPlayerStroke.t < 900;
  ui.stroke.textContent = recent ? lastPlayerStroke.label : cls.label;
  ui.stroke.dataset.family = rs.button === 'L' ? 'top' : rs.button === 'R' ? 'back' : 'flat';
  ui.stroke.classList.toggle('hit', !!recent);
  ui.strokeHint.textContent = recent || !settings.hints ? '' : cls.hint;

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
