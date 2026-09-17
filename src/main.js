// main.js — Three.js rendering, input and HUD around the headless Match.
import * as THREE from 'three';
import { Match } from './game.js';
import { PARAMS, TABLE, BALL, spinComponents, simulateFlight, v3, len } from './physics.js';
import { GRIPS, classify, synthesize, wingFor, familyFromSwipe } from './strokes.js';
import { LEVELS, LEVEL_ORDER } from './levels.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { RACKETS, RACKET_ORDER, surfaceFor, surfaceParams, RACKET_AI } from './rackets.js';

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
  const g = new THREE.Group(); g.rubber = rubber;
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
  g.rubberMesh = r1;                 // the face that plays the forehand: repainted when the racket changes
  g.bhMesh = r2;
  return g;
}
const playerRacketMesh = makeRacket(0xc0272d); scene.add(playerRacketMesh);
const playerRubberMesh = playerRacketMesh.rubberMesh;
const playerRubberMats = [];
playerRacketMesh.blade.traverse((o) => { if (o.material && o.material.color) playerRubberMats.push(o.material); });
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
  speed: document.getElementById('speed'), speedVal: document.getElementById('speedVal'), cam: document.getElementById('camsel'), spinBadge: document.getElementById('spinBadge'),
  log: document.getElementById('log'), stroke: document.getElementById('stroke'), strokeHint: document.getElementById('strokeHint'),
  coach: document.getElementById('coach'), stance: document.getElementById('stance'), aiShot: document.getElementById('aiShot'),
  cheat: document.getElementById('cheat'), autoAim: document.getElementById('autoAim'), autoAimVal: document.getElementById('autoAimVal'),
  face: document.getElementById('face'), racketGrid: document.getElementById('racketGrid'), racketBlurb: document.getElementById('racketBlurb'),
  aiRacket: document.getElementById('aiRacket'),
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

// ---------- rackets ----------
const racketState = { player: 'allround', ai: 'allround' };
const STAT = (v, lo, hi) => Math.max(0.06, Math.min(1, (v - lo) / (hi - lo)));
function buildRacketGrid() {
  ui.racketGrid.innerHTML = '';
  for (const key of RACKET_ORDER) {
    const R = RACKETS[key];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'racket'; b.dataset.racket = key;
    // The bars must describe the same thing the physics does. Spin is what the rubber can put on a ball, which is
    // its bite (grip) times its rebound (tangential restitution); speed is simply how much the blade gives back.
    // The chopper shows its forehand, the wing most players will use.
    const sf = surfaceFor(key, 'fh');
    const spin = STAT(sf.grip * sf.tangential, 0.18, 1.5);
    const speed = STAT(sf.cor, 0.64, 0.98);
    b.innerHTML = `<span class="top"><span class="swatch" style="background:#${R.accent.toString(16).padStart(6, '0')}"></span><span class="nm">${R.label}</span></span>
      <span class="bars"><span class="bar">spin<i><b style="width:${(spin * 100).toFixed(0)}%"></b></i></span>
      <span class="bar">speed<i><b style="width:${(speed * 100).toFixed(0)}%"></b></i></span></span>`;
    b.addEventListener('click', () => setPlayerRacket(key));
    ui.racketGrid.appendChild(b);
  }
  for (const key of RACKET_ORDER) { const o = document.createElement('option'); o.value = key; o.textContent = RACKETS[key].label; ui.aiRacket.appendChild(o); }
  ui.aiRacket.value = racketState.ai;
}
function setPlayerRacket(key, { remember = true } = {}) {
  if (!RACKETS[key]) return;
  racketState.player = key;
  const R = RACKETS[key];
  for (const b of ui.racketGrid.querySelectorAll('[data-racket]')) b.setAttribute('aria-pressed', String(b.dataset.racket === key));
  ui.racketBlurb.innerHTML = `<b style="color:var(--ink)">${R.tagline}</b><br>+ ${R.pros.join(', ')}<br>− ${R.cons.join(', ')}`;
  // The blade shows the rubber it is: an anti-spin blade is pale, long pips read as a dull backhand face.
  playerRubberMesh.material.color.setHex(R.colour[0]);
  playerRacketMesh.blade.scale.setScalar(match.racketScale);
  if (remember) { try { localStorage.setItem('pingpang.racket', key); } catch (e) { /* ignore */ } }
}
function surfaceForPlayer() { return surfaceParams(racketState.player, rs.wing); }
function surfaceForAI() { return surfaceParams(racketState.ai, 'fh'); }

// ---------- player level ----------
const settings = { level: 'casual', autoAim: 0.35, coach: true, hints: true };
let applyingLevel = false;
function applyLevel(key, { remember = true } = {}) {
  const L = LEVELS[key]; if (!L) return;
  applyingLevel = true;
  settings.level = key; settings.autoAim = L.autoAim; settings.coach = L.coach; settings.hints = L.hints;
  match.assist = L.assist; match.racketScale = L.racketScale; match.timeScale = L.timeScale;
  match.ai.setLevel(L.ai);
  if (match.ai.tend) match.ai.applyRacketTendencies(match.ai.tend);
  ui.assist.value = L.assist; ui.assistVal.textContent = Math.round(L.assist * 100) + '%';
  ui.autoAim.value = L.autoAim; ui.autoAimVal.textContent = Math.round(L.autoAim * 100) + '%';
  ui.racketScale.value = L.racketScale; ui.racketScaleVal.textContent = L.racketScale.toFixed(1) + '×';
  ui.speed.value = L.timeScale; ui.speedVal.textContent = L.timeScale.toFixed(2) + '×';
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
for (const b of document.querySelectorAll('[data-level]')) b.addEventListener('click', () => { applyLevel(b.dataset.level); ui.levelModal.hidden = true; maybeShowTouchHint(); });
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

// The racket face the player is asking for: 0 = leave it to the hand (the default), +1 = fully closed (smash or
// loop), -1 = fully open (chop or heavy backspin). Set by a press-and-hold drag on a phone, by Shift+drag or the
// arrow keys on a desktop, and shown on the HUD so it is never a hidden state.
const face = { bias: 0, target: 0, shown: 0 };
const rs = {
  pos: v3(0, TABLE.height + 0.25, TABLE.length / 2 + 0.30), prev: v3(0, TABLE.height + 0.25, TABLE.length / 2 + 0.30),
  cursor: v3(0, TABLE.height + 0.25, TABLE.length / 2 + 0.30),   // where the mouse says the hand is (x, y)
  cursorVel: v3(), vel: v3(), normal: v3(0, 0, -1),
  button: null,                 // 'L' | 'R' | null
  wing: 'fh', stroke: null, swing: null,
  gesture: { speed: 0, vx: 0, fwd: 0 },
};
// The one place a screen point becomes the racket's target position: the mouse, a finger and the drift assist all
// funnel through here, so there is a single source of truth for where the hand is.
function setCursorFromScreen(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(controlPlane, hit)) {
    rs.cursor = v3(Math.max(-1.4, Math.min(1.4, hit.x)), Math.max(TABLE.height - 0.1, Math.min(TABLE.height + 1.2, hit.y)), rs.cursor.z);
  }
}
let inputKind = isTouchDevice() ? 'touch' : 'mouse';   // the stroke family comes from a button on the mouse and from the swipe direction on a finger
canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType && ev.pointerType !== 'mouse') return;      // fingers are handled by TouchControls
  inputKind = 'mouse';
  if (faceDragging) {
    // Shift+drag: vertical movement sets the face angle instead of moving the racket
    const dy = ev.clientY - faceDragging.y0;
    const span = Math.max(120, canvas.clientHeight * 0.34);
    face.bias = Math.max(-1, Math.min(1, -dy / span * 2));
    return;
  }
  setCursorFromScreen(ev.clientX, ev.clientY);
});
let faceDragging = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType && ev.pointerType !== 'mouse') return;
  inputKind = 'mouse';
  if (ev.shiftKey && ev.button === 0) { faceDragging = { y0: ev.clientY, start: face.bias }; return; }
  if (ev.button === 0) rs.button = 'L'; else if (ev.button === 2) rs.button = 'R';
  if (match.restartIfOver()) return;
  if (ev.button === 0 || ev.button === 2) match.toss();
});
window.addEventListener('pointerup', (ev) => {
  if (((ev.button === 0 && rs.button === 'L') || (ev.button === 2 && rs.button === 'R'))) rs.button = null;
  if (faceDragging) faceDragging = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); if (!match.restartIfOver()) match.toss(); }
  if (e.key === 'r' || e.key === 'R') match.reset();
  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') setStance(stanceIx - 1);
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') setStance(stanceIx + 1);
  if (e.key === 'h' || e.key === 'H') ui.cheat.classList.toggle('open');
  // Face angle without a mouse: hold a direction key to walk the face open or closed, or tap 0 to hand it back.
  if (e.key === ']' || e.key === '}') face.bias = Math.min(1, face.bias + 0.25);
  if (e.key === '[' || e.key === '{') face.bias = Math.max(-1, face.bias - 0.25);
  if (e.key === '0') face.bias = 0;
  if (e.key >= '1' && e.key <= '4') { applyLevel(LEVEL_ORDER[Number(e.key) - 1]); ui.levelModal.hidden = true; }
  if (e.key === 'Escape') ui.levelModal.hidden = true;
});
canvas.addEventListener('wheel', (e) => { setStance(stanceIx + Math.sign(e.deltaY)); }, { passive: true });

// ---------- touch: one finger plays the game ----------
const touch = new TouchControls(canvas, {
  onTap: () => { if (!match.restartIfOver()) match.toss(); },
  onStance: (dir) => setStance(stanceIx + dir),
  onTilt: (v) => { face.bias = v; },
});
touch.onCursor = (x, y) => { inputKind = 'touch'; setCursorFromScreen(x, y); };
touch.liftPx = Math.min(120, (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.18);
touch.tapTarget = null;

// ---------- UI wiring ----------
buildRacketGrid();
{
  let savedR = null; try { savedR = localStorage.getItem('pingpang.racket'); } catch (e) { /* ignore */ }
  setPlayerRacket(savedR && RACKETS[savedR] ? savedR : 'allround', { remember: false });
  let savedA = null; try { savedA = localStorage.getItem('pingpang.aiRacket'); } catch (e) { /* ignore */ }
  racketState.ai = savedA && RACKETS[savedA] ? savedA : 'allround';
  ui.aiRacket.value = racketState.ai;
  match.ai.surface = surfaceParams(racketState.ai, 'fh');
}
ui.aiRacket.addEventListener('change', () => {
  racketState.ai = ui.aiRacket.value;
  match.ai.surface = surfaceParams(racketState.ai, 'fh');
  match.ai.racket.surface = surfaceParams(racketState.ai, 'fh');
  // their rubber shapes their game: long pips chop, anti blocks, attack blades smash
  match.ai.applyRacketTendencies(RACKET_AI[racketState.ai] || RACKET_AI.allround);
  try { localStorage.setItem('pingpang.aiRacket', racketState.ai); } catch (e) { /* ignore */ }
});
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
ui.speed.addEventListener('input', () => { match.timeScale = parseFloat(ui.speed.value); ui.speedVal.textContent = match.timeScale.toFixed(2) + '×'; customLevel(); });
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

// ---------- phone shell: fullscreen, orientation, first-run touch hint ----------
const hint = document.getElementById('touchHint');
function maybeShowTouchHint() {
  if (inputKind !== 'touch') return;
  let seen = null; try { seen = localStorage.getItem('pingpang.touchHint'); } catch (e) { /* ignore */ }
  if (!seen && ui.levelModal.hidden && hint.style.display !== 'block') hint.style.display = 'flex';
}
{
  const fullBtn = document.getElementById('fullBtn');
  fullBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        await screen.orientation?.lock?.('landscape').catch(() => {});   // Android Chrome; iOS ignores it
      }
    } catch (e) { /* ignore: fullscreen is a nicety, not a requirement */ }
  });
  document.addEventListener('fullscreenchange', () => { fullBtn.textContent = document.fullscreenElement ? 'exit' : 'fullscreen'; });

  const rotate = document.getElementById('rotate');
  document.getElementById('rotateAnyway').addEventListener('click', () => { rotate.hidden = true; rotate.style.display = 'none'; });
  window.addEventListener('orientationchange', () => { rotate.hidden = false; rotate.style.display = ''; });

  document.getElementById('touchHintOk').addEventListener('click', () => {
    hint.style.display = 'none';
    try { localStorage.setItem('pingpang.touchHint', '1'); } catch (e) { /* ignore */ }
  });
}
document.getElementById('toggleCheat').addEventListener('click', () => ui.cheat.classList.toggle('open'));
// Tapping the face readout hands the angle back to the hand: the way out of a face the player set by accident.
ui.face.addEventListener('click', () => { face.bias = 0; });

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // In portrait the horizontal field of view is much narrower than the vertical one, so a wide table would be
    // cropped. Widen the lens and stand further back; landscape keeps the tuned 48 degrees.
    camera.fov = camera.aspect < 1 ? 68 : 48;
    camera.updateProjectionMatrix();
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
  // The world runs on the game clock (dt × timeScale). Measure the hand on that same clock, otherwise slowing the
  // world silently makes the player's swing faster relative to the ball, which is the opposite of easier.
  const dtGame = Math.max(1e-4, dt * match.timeScale);

  const ctx = situation(now);
  const hand = ui.hand.value === 'left' ? -1 : 1;
  const grip = ui.grip.value;
  if (inputKind === 'touch') touch.updateHold(dtGame);
  // A finger that has just been released keeps the last face so the next stroke can repeat it; a tap resets nothing.
  face.shown += (face.bias - face.shown) * (1 - Math.exp(-dtGame * 12));

  // --- hand position: x/y from the cursor (light spring), z from the stance or the step-in target ---
  rs.prev = { ...rs.pos };
  const stanceZ = TABLE.length / 2 + STANCES[stanceIx].depth;
  // cursor velocity (smoothed) = the gesture. Any decisive cursor motion is a swing AT the ball: its size is the
  // power, its sideways part is sidespin, and the held button decides the family (topspin / backspin / flat).
  const k = 1 - Math.exp(-dtGame * 30);
  // racket drift (Newbie/Casual): the hand eases toward where the ball will be, more strongly as it gets close
  let cx = rs.cursor.x, cy = rs.cursor.y;
  if (settings.autoAim > 0 && aimTarget && aimTarget.t < 0.9) {
    const w = settings.autoAim * (1 - aimTarget.t / 0.9);
    cx = cx + (aimTarget.x - cx) * w; cy = cy + (aimTarget.y - 0.02 - cy) * w;
  }
  const nx = rs.pos.x + (cx - rs.pos.x) * k, ny = rs.pos.y + (cy - rs.pos.y) * k;
  const raw = v3((nx - rs.pos.x) / dtGame, (ny - rs.pos.y) / dtGame, 0);
  const a = 1 - Math.exp(-dtGame * 16);
  rs.cursorVel = v3(rs.cursorVel.x + (raw.x - rs.cursorVel.x) * a, rs.cursorVel.y + (raw.y - rs.cursorVel.y) * a, 0);
  const speed = Math.hypot(rs.cursorVel.x, rs.cursorVel.y);
  const fwd = speed;
  // The swing also carries the racket forward (a lunge that grows with swipe speed) and eases back afterwards.
  const lunge = Math.min(0.28, speed * 0.05);
  const goalZ = (stepTarget ? stepTarget.z : stanceZ) - lunge;
  const kz = 1 - Math.exp(-dtGame * (goalZ < rs.pos.z ? 32 : 9));
  rs.pos = v3(nx, ny, rs.pos.z + (goalZ - rs.pos.z) * kz);
  // Family: on the mouse it is the held button; on a phone it is the direction of the swipe (up = topspin,
  // down = backspin, sideways = flat), which is the one gesture a player already knows.
  if (inputKind === 'touch') {
    touch.decay(dtGame);
    rs.button = familyFromSwipe(rs.cursorVel.x, rs.cursorVel.y);
  }
  rs.gesture = { speed, vx: rs.cursorVel.x, fwd: (inputKind === 'touch' && rs.button === 'R') ? -speed : speed, button: rs.button };   // world frame: swipe right = aim/spin right
  // wing: which side of the body the hand is on (serving: forehand)
  if (!match.ball.active || match.lastHitter !== 'ai') rs.wing = wingFor(rs.pos.x, hand, rs.wing);
  const cls = classify({ button: rs.button, speed, vx: rs.gesture.vx, fwd: rs.gesture.fwd, ctx, grip, wing: rs.wing, inputMode: inputKind });
  rs.stroke = cls;
  // The hand solves the face angle against the real incoming ball. It is a flight search, so run it at ~20 Hz
  // (and only when a ball is live); in between, keep the last solved swing scaled to the current gesture.
  const ball0 = match.ball, live = ball0.active && match.state === 'rally';
  const solveKey = cls.key + '|' + rs.wing + '|' + rs.button + '|' + Math.round(speed * 4);
  let sw;
  if (live && (now - lastSolve > 50 || solveKey !== lastSolveKey)) {
    lastSolve = now; lastSolveKey = solveKey;
    sw = synthesize(cls.key, rs.gesture, grip, rs.wing, ctx, ball0, { x: rs.pos.x, y: rs.pos.y, z: rs.pos.z }, face.bias, match.player.surface);
    lastSw = sw;
  } else if (live && lastSw) sw = lastSw;
  else sw = synthesize(cls.key, rs.gesture, grip, rs.wing, ctx, null, null, face.bias, match.player.surface);
  // racket velocity for the physics: the synthesized swing plus the actual body motion in depth
  rs.vel = v3(sw.vel.x, sw.vel.y, sw.vel.z + (rs.pos.z - rs.prev.z) / dtGame * 0.5);
  rs.normal = v3(sw.normal.x, sw.normal.y, sw.normal.z);

  // At the instant of contact the hand re-solves the face against the ball as it actually is (the frame's solve
  // can be up to 50 ms stale, which at 6 m/s is 30 cm of ball travel).
  const bodyVz = (rs.pos.z - rs.prev.z) / dtGame * 0.5;
  const refine = (ballNow) => {
    const s2 = synthesize(cls.key, rs.gesture, grip, rs.wing, ctx, ballNow, { x: rs.pos.x, y: rs.pos.y, z: rs.pos.z }, face.bias, match.player.surface);
    return { normal: s2.normal, vel: v3(s2.vel.x, s2.vel.y, s2.vel.z + bodyVz) };
  };
  match.player.surface = surfaceForPlayer();
  match.ai.surface = surfaceForAI();            // the AI's shot planner uses its rubber
  match.ai.racket.surface = match.ai.surface;   // and the physics contact uses the same one
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
  // Which face meets the ball should be visible: the red face for a closed (attacking) face, the black for an
  // open (chopping) one. The stroke's own tilt decides when the player has not asked for a specific angle.
  const tiltNow = sw.tilt ?? 0;
  const flipBase = (GRIPS[grip][rs.wing] || GRIPS[grip].fh).flip;
  const flip = (tiltNow > 12 ? true : tiltNow < -12 ? false : flipBase);
  playerRacketMesh.blade.scale.setScalar(match.racketScale);
  // A held finger is in face-setting mode: glow the racket so the state is never invisible.
  const held = inputKind === 'touch' && touch.tiltHeld;
  for (const m of playerRubberMats) m.emissive?.setHex(held ? 0x552200 : 0x000000);
  orientRacket(playerRacketMesh, match.player.pos, match.player.normal, flip);
  orientRacket(aiRacketMesh, match.ai.racket.pos, match.ai.racket.normal, false);

  // camera
  const mode = ui.cam.value;
  const follow = b.active ? b.pos.x * 0.25 : 0;
  const back = STANCES[stanceIx].depth * 0.6;
  const portrait = camera.aspect < 1;
  const goal = mode === 'side'
    ? new THREE.Vector3(3.2, TABLE.height + 0.9, 0.4)
    : mode === 'top' ? new THREE.Vector3(0, TABLE.height + 3.8, 0.01)
    : new THREE.Vector3(CAM_HOME.x + follow, CAM_HOME.y + back * 0.25 + (portrait ? 0.5 : 0), CAM_HOME.z + back + (portrait ? 1.6 : 0));
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
  {
    const deg = Math.round(sw.tilt ?? 0);
    const fam = sw.banded ? (face.shown > 0.15 ? 'closed' : face.shown < -0.15 ? 'open' : 'neutral') : 'auto';
    ui.face.textContent = `face ${deg > 0 ? '+' : ''}${deg}° ${fam}`;
    ui.face.dataset.mode = sw.banded ? (face.shown > 0.15 ? 'closed' : face.shown < -0.15 ? 'open' : 'neutral') : 'auto';
    ui.face.style.opacity = face.bias !== 0 || touch.tiltHeld ? '1' : '0.45';
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
