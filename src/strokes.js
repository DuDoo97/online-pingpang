// strokes.js — the stroke grammar.
//
// Design: the mouse gives ONE thing, a gesture (how hard you swing toward the ball and how much sideways).
// A held button picks the family: left = topspin (closed face), right = backspin (open face), none = flat.
// The situation (short ball, high ball, standing far back, serving) picks the variant. The stroke then
// synthesizes the racket swing: a "brush" along the face tangent plus a "through" drive toward the net.
// The physics does the rest, so a loop is a fast upward brush with a closed face hitting the real ball,
// not a canned outcome.
import { norm, previewRacketImpact, simulateFlight, Ball, TABLE, v3 } from './physics.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Grips: per-wing modifiers. `brush` scales tangential (spin-making) racket speed, `speed` the forward drive,
// the tilt range limits how far the face can close/open, `flip` shows the black face, `noLoop` forbids brushing up.
export const GRIPS = {
  shakehand: {
    label: 'Shakehand',
    blurb: 'Both wings even. Forehand on the red face, backhand on the black face.',
    fh: { speed: 1.0, brush: 1.0, minTilt: -50, maxTilt: 60, flip: false },
    bh: { speed: 0.92, brush: 1.0, minTilt: -50, maxTilt: 60, flip: true },
    serveBrush: 1.0, handleUp: false,
  },
  penhold: {
    label: 'Penhold (traditional)',
    blurb: 'Free wrist: more spin on serves and forehand loops. The backhand uses the same face with a cramped wrist, so it can only push, block and drive.',
    fh: { speed: 1.0, brush: 1.15, minTilt: -50, maxTilt: 60, flip: false },
    bh: { speed: 0.7, brush: 0.5, minTilt: -12, maxTilt: 60, flip: false, noLoop: true, tag: 'BH' },
    serveBrush: 1.2, handleUp: true,
  },
  rpb: {
    label: 'Penhold + RPB',
    blurb: 'Penhold wrist on the forehand; the reverse (black) face frees the backhand for loops and banana flicks.',
    fh: { speed: 1.0, brush: 1.15, minTilt: -50, maxTilt: 60, flip: false },
    bh: { speed: 0.88, brush: 1.05, minTilt: -50, maxTilt: 45, flip: true, tag: 'RPB' },
    serveBrush: 1.2, handleUp: true,
  },
};

// Stroke recipes. tilt: face angle in degrees (negative = closed, positive = open).
// brush: racket speed along the face tangent per unit gesture speed (+ up = topspin, − down = backspin), brushBase added when moving.
// through: horizontal drive toward the net per unit gesture speed, base added when moving. lateral: sidespin gain.
export const STROKES = {
  block:     { label: 'Block',          tilt: -12, brush: 0.15,  brushBase: 0.2,  through: 0.3,  base: 0.6,  lateral: 0.3, hint: 'racket still: uses the ball\'s own pace' },
  drive:     { label: 'Drive',          tilt: -15, brush: 0.35,  brushBase: 0.4,  through: 0.9,  base: 0.7,  lateral: 0.6, hint: 'left button, medium swipe toward the ball' },
  loop:      { label: 'Loop',           tilt: -35, brush: 0.85,  brushBase: 1.2,  through: 0.7,  base: 0.9,  lateral: 0.5, hint: 'left button, hard swipe: heavy topspin' },
  smash:     { label: 'Smash',          tilt: -8,  brush: 0.1,   brushBase: 0.3,  through: 1.3,  base: 1.6,  lateral: 0.6, hint: 'high ball, hard swipe: flat and fast' },
  flick:     { label: 'Flick',          tilt: -20, brush: 0.7,   brushBase: 0.8,  through: 0.7,  base: 0.8,  lateral: 0.5, hint: 'short ball, left button: attack over the table' },
  banana:    { label: 'Banana flick',   tilt: -20, brush: 0.65,  brushBase: 0.8,  through: 0.6,  base: 0.7,  lateral: 1.1, hint: 'short ball, left button, swipe across: sidespin flick' },
  lob:       { label: 'Lob',            tilt: 10,  brush: 1.2,   brushBase: 1.5,  through: 0.25, base: 0.4,  lateral: 0.5, hint: 'far back, left button: high topspin ball' },
  shortpush: { label: 'Short push',     tilt: 42,  brush: -0.35, brushBase: -0.3, through: 0.1,  base: 0.0,  lateral: 0.3, hint: 'right button, gentle touch: keeps it short' },
  push:      { label: 'Push',           tilt: 35,  brush: -0.45, brushBase: -0.4, through: 0.2,  base: 0.1,  lateral: 0.4, hint: 'right button, medium swipe: backspin' },
  longpush:  { label: 'Fast long push', tilt: 28,  brush: -0.4,  brushBase: -0.5, through: 0.3,  base: 0.2,  lateral: 0.5, hint: 'right button, hard swipe: deep backspin' },
  chop:      { label: 'Chop',           tilt: 50,  brush: -0.9,  brushBase: -1.1, through: 0.15, base: 0.15, lateral: 0.4, hint: 'far back, right button: heavy backspin defence' },
  flat:      { label: 'Flat hit',       tilt: -4,  brush: 0.1,   brushBase: 0.1,  through: 0.95, base: 0.6,  lateral: 0.6, hint: 'no button: flat, little spin' },
  serveTop:  { label: 'Topspin serve',  tilt: -28, brush: 0.9,   brushBase: 1.0,  through: 0.5,  base: 0.5,  lateral: 0.5, hint: 'hold left, swipe at the falling toss' },
  serveBack: { label: 'Backspin serve', tilt: 45,  brush: -0.9,  brushBase: -1.0, through: 0.55, base: 0.5,  lateral: 0.5, hint: 'hold right, swipe at the falling toss' },
  serveSide: { label: 'Sidespin serve', tilt: 8,   brush: 0.2,   brushBase: 0.2,  through: 0.5,  base: 0.5,  lateral: 1.4, hint: 'swipe sideways across the toss' },
  serveFlat: { label: 'Flat serve',     tilt: 0,   brush: 0.1,   brushBase: 0.1,  through: 0.85, base: 0.6,  lateral: 0.5, hint: 'no button: hit the toss forward' },
};

// The player's HAND sets the face angle: given the swing the gesture asked for, it picks the tilt whose flight
// lands at the stroke's natural depth (with the real drag + Magnus flight). That is technique and it is on at
// every level. Power is the player's job: swipe too hard and no face angle can keep the ball on the table.
const DEPTH = { shortpush: -0.35, block: -0.75, push: -0.95, longpush: -1.15, chop: -1.0, lob: -0.95, smash: -1.0, loop: -0.95, drive: -0.95, flat: -0.9, flick: -0.9, banana: -0.9 };

function faceNormal(tilt, yaw) {
  const t = tilt * Math.PI / 180;
  return norm({ x: Math.sin(yaw) * Math.cos(t), y: Math.sin(t), z: -Math.cos(yaw) * Math.cos(t) });
}
function swingVel(S, tilt, brush, through, vx) {
  const t = tilt * Math.PI / 180;
  const u = { x: 0, y: Math.cos(t), z: Math.sin(t) };          // "up the face"
  return { x: vx * S.lateral, y: brush * u.y, z: brush * u.z - through };
}
// Where does the ball go for a candidate face? {kind, pos}: kind = 'land' | 'net' | 'own' | 'long' | 'none'
function flightOutcome(out, from) {
  const t = new Ball(); t.pos = { ...from }; t.vel = out.vel; t.spin = out.spin; t.active = true;
  let prevZ = t.pos.z, clearance = null;
  const r = simulateFlight(t, undefined, { maxTime: 1.6, dt: 1 / 90, stop: (b, tt, ev) => {
    if (clearance === null && prevZ > 0 && b.pos.z <= 0) clearance = b.pos.y - (TABLE.height + TABLE.netHeight);
    prevZ = b.pos.z;
    return ev.length > 0;
  } });
  const e = r.events[0];
  if (!e) return { kind: 'none', pos: t.pos, clearance };
  if (e.type === 'bounce') return { kind: e.side === 'ai' ? 'land' : 'own', pos: e.pos, clearance };
  if (e.type === 'net') return { kind: 'net', pos: e.pos, clearance };
  return { kind: 'long', pos: e.pos, clearance };
}
// 0..1 = landed (distance from the wanted spot, thin net clearance penalised), 2+ = net, 3+ = long or wide,
// 4 = own side, 5 = nothing.
function faceScore(o, targetZ, aimX) {
  if (o.kind === 'land') {
    const thin = o.clearance === null ? 0 : Math.max(0, 0.10 - o.clearance) * 4;   // want >= 10 cm over the net
    return Math.abs(o.pos.z - targetZ) * 0.4 + Math.abs(o.pos.x - aimX) * 0.6 + thin;
  }
  if (o.kind === 'net') return 2 + Math.max(0, TABLE.height + TABLE.netHeight - o.pos.y);
  if (o.kind === 'own') return 4;
  if (o.kind === 'long') return 3 + Math.min(1, Math.abs(Math.abs(o.pos.z) - TABLE.length / 2) * 0.3) + Math.min(1, Math.max(0, Math.abs(o.pos.x) - TABLE.width / 2));
  return 5;
}
// The hand: given the swing the gesture asked for, choose face tilt AND yaw so the real flight lands at the
// stroke's natural depth, aimed at `aimX`. The feasible faces form a narrow tilt×yaw pocket, so the coarse search
// is a joint grid. If no face lands at the player's power, the hand may adjust its touch a little (×0.7..×1.7):
// firmer against a dead ball, softer against a fast one. Gross power errors still miss.
// `band` (optional {target, half}) pins the face near a player-chosen angle: the search still looks for the face
// that lands the ball, but only within +/- half of the target, so the player's tilt survives contact.
function solveFaceRally(S, key, base, W, brush, through, vx, ball, racketPos, aimX, band = null) {
  const targetZ = DEPTH[key] ?? -0.9;
  // PINNED FACE (the player chose an angle): hold the tilt exactly and search the swing instead, so the angle the
  // player asked for is what meets the ball. A chop face gives a chop; if it cannot land, it misses, as in life.
  if (band) {
    const tilt = clamp(band.target, W.minTilt, W.maxTilt);
    const from0 = racketPos ? { x: racketPos.x, y: racketPos.y, z: racketPos.z - 0.03 } : { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z };
    let best = { tilt, yaw: 0, k: 1, score: Infinity };
    for (const k of [1, 0.85, 1.2, 0.7, 1.4, 0.55, 1.7, 0.4, 2.0]) {
      for (const yaw of [0, -0.2, 0.2, -0.4, 0.4, -0.6, 0.6]) {
        const out = previewRacketImpact(ball.vel, ball.spin, faceNormal(tilt, yaw), swingVel(S, tilt, brush * k, through * k, vx * k));
        if (!out) continue;
        const sc = faceScore(flightOutcome(out, from0), targetZ, aimX) + Math.abs(yaw) * 0.02 + Math.abs(k - 1) * 0.3;
        if (sc < best.score) best = { tilt, yaw, k, score: sc };
      }
    }
    return best;
  }
  const from = racketPos ? { x: racketPos.x, y: racketPos.y, z: racketPos.z - 0.03 } : { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z };
  const evalFace = (tilt, yaw, k) => {
    const out = previewRacketImpact(ball.vel, ball.spin, faceNormal(tilt, yaw), swingVel(S, tilt, brush * k, through * k, vx * k));
    return out ? faceScore(flightOutcome(out, from), targetZ, aimX) + Math.abs(tilt - base) * 0.002 + Math.abs(yaw) * 0.02 + Math.abs(k - 1) * 0.3 : 6;
  };
  // With a band, the base of the search is the player's angle and the tilt wander is capped.
  const lo = band ? Math.max(W.minTilt, band.target - band.half) : W.minTilt;
  const hi = band ? Math.min(W.maxTilt, band.target + band.half) : W.maxTilt;
  const baseTilt = band ? clamp(band.target, W.minTilt, W.maxTilt) : base;
  let best = { tilt: baseTilt, yaw: 0, k: 1, score: Infinity };
  const tryFace = (tilt, yaw, k) => { if (tilt < lo || tilt > hi) return; const sc = evalFace(tilt, yaw, k); if (sc < best.score) best = { tilt, yaw, k, score: sc }; };
  for (let tilt = lo; tilt <= hi; tilt += 6) for (const yaw of [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]) tryFace(tilt, yaw, 1);
  if (best.score >= 2) {
    for (const k of [1.35, 0.7, 1.7]) {
      for (let tilt = lo; tilt <= hi; tilt += 6) for (const yaw of [-0.4, -0.2, 0, 0.2, 0.4]) tryFace(tilt, yaw, k);
      if (best.score < 2) break;
    }
  }
  const c = { ...best };
  for (const d of [-4, -2, 2, 4]) for (const dy of [-0.1, 0, 0.1]) tryFace(c.tilt + d, c.yaw + dy, c.k);
  const c2 = { ...best };
  for (const d of [-1, 1]) tryFace(c2.tilt + d, c2.yaw, c2.k);
  return best;
}
// Serve: choose the tilt whose ball bounces on the own half and then lands on the far half, near mid-depth.
function solveTiltServe(S, base, W, brush, through, vx, yaw, ball, racketPos) {
  let best = base, bestScore = Infinity;
  for (let tilt = W.minTilt; tilt <= W.maxTilt; tilt += 4) {
    const out = previewRacketImpact(ball.vel, ball.spin, faceNormal(tilt, yaw), swingVel(S, tilt, brush, through, vx));
    if (!out) continue;
    const t = new Ball(); t.pos = { ...racketPos, z: racketPos.z - 0.03 }; t.vel = out.vel; t.spin = out.spin; t.active = true;
    let nb = 0;
    const r = simulateFlight(t, undefined, { maxTime: 1.6, dt: 1 / 120, stop: (b, tt, ev) => { nb += ev.filter(e => e.type === 'bounce').length; return nb >= 2 || ev.some(e => e.type === 'net' || e.type === 'floor' || e.type === 'side'); } });
    const bounces = r.events.filter(e => e.type === 'bounce');
    const bad = r.events.some(e => e.type === 'net' || e.type === 'floor' || e.type === 'side');
    let score;
    if (bounces.length >= 2 && bounces[0].side === 'player' && bounces[1].side === 'ai' && !bad) score = Math.abs(bounces[1].pos.z + 0.75);
    else if (bounces.length >= 1 && bounces[0].side === 'player') score = 5 + (bad ? 1 : 0);
    else score = 10;
    score += Math.abs(tilt - base) * 0.01;
    if (score < bestScore) { bestScore = score; best = tilt; }
  }
  return best;
}

// The player's tilt request, as an angle in degrees, from a signed bias:
//   bias < 0  -> open face (chop, heavy backspin)
//   bias = 0  -> the stroke's own angle, solved by the hand as before
//   bias > 0  -> closed face (smash, loop, topspin)
// The bias is clamped to what the wing allows, so a penhold backhand cannot close as far as a shakehand one.
export const TILT_RANGE = { closed: -45, open: 50 };   // degrees at full close / full open
// bias: +1 = fully closed face (smash, loop), -1 = fully open (chop), 0 = the stroke's own angle.
export function faceAngleFor(bias, grip = 'shakehand', wing = 'fh', nominal = 0) {
  const G = GRIPS[grip] || GRIPS.shakehand; const W = G[wing] || G.fh;
  const closedLimit = Math.max(W.minTilt, TILT_RANGE.closed);
  const openLimit = Math.min(W.maxTilt, TILT_RANGE.open);
  const limit = bias >= 0 ? closedLimit : openLimit;     // +bias walks toward closed, -bias toward open
  const target = nominal + Math.abs(bias) * (limit - nominal);
  return Math.max(closedLimit, Math.min(openLimit, target));
}

export function wingTag(grip, wing) {
  const G = GRIPS[grip] || GRIPS.shakehand;
  return wing === 'fh' ? 'FH' : (G.bh.tag || 'BH');
}

// Which wing takes a ball at lateral position x. hand = +1 right-handed, -1 left-handed. Hysteresis avoids flicker.
export function wingFor(x, hand, current) {
  const side = x * hand;
  if (current === 'fh' && side < -0.10) return 'bh';
  if (current === 'bh' && side > -0.02) return 'fh';
  return current || 'fh';
}

// gesture: { speed, vx, fwd } in m/s (speed = |(vx, fwd)|, fwd > 0 toward the net).
// ctx: { serving, receiving, short, high, far, incomingTop }
// inputMode: 'mouse' (default) or 'touch'. On touch the swipe DIRECTION carries the family, so a downward swipe is
// a backspin stroke rather than the mouse's "pulled the cursor away, so this counts as not swinging".
export function classify({ button = null, speed = 0, vx = 0, fwd = 0, ctx = {}, grip = 'shakehand', wing = 'fh', inputMode = 'mouse' }) {
  const G = GRIPS[grip] || GRIPS.shakehand; const W = G[wing] || G.fh;
  const lateral = Math.abs(vx);
  const still = inputMode === 'touch' ? speed < 1.2 : (speed < 1.2 || fwd < -0.5);
  let key, note = '';
  if (ctx.serving) {
    if (speed > 1.5 && lateral > 0.8 * Math.abs(fwd)) key = 'serveSide';
    else if (button === 'R') key = 'serveBack';
    else if (button === 'L') key = 'serveTop';
    else key = 'serveFlat';
  } else if (button === 'L') {
    if (ctx.far) key = still ? 'block' : 'lob';
    else if (still) key = 'block';
    else if (ctx.short) key = lateral > 0.55 * speed ? 'banana' : 'flick';
    else if (ctx.high && speed > 3.5) key = 'smash';
    else if (speed < 3.5) key = 'drive';
    else if (W.noLoop) { key = 'drive'; note = 'a traditional penhold backhand cannot loop, so this becomes a drive. Switch to RPB, or take it forehand.'; }
    else key = 'loop';
  } else if (button === 'R') {
    if (ctx.far) key = still ? 'push' : 'chop';
    else if (ctx.short || still || speed < 1.8) key = 'shortpush';
    else if (speed > 3.8) key = 'longpush';
    else key = 'push';
  } else {
    if (still) key = 'block';
    else if (ctx.high && speed > 4) key = 'smash';
    else key = 'flat';
  }
  const S = STROKES[key];
  const prefix = ctx.receiving && !ctx.serving ? 'Receive · ' : '';
  return { key, label: `${prefix}${wingTag(grip, wing)} ${S.label}`, hint: note || S.hint, note };
}

// On touch, derive the stroke family from the swipe direction: up = topspin (left button), down = backspin
// (right button), mostly sideways = flat. `vx`/`vy` are world-frame hand velocities in m/s.
export function familyFromSwipe(vx, vy) {
  const speed = Math.hypot(vx, vy);
  if (speed < 0.6) return null;                            // no decisive direction: nothing held = flat/block
  const up = vy / speed;
  if (up > 0.35) return 'L';
  if (up < -0.35) return 'R';
  return null;
}

// Turn the gesture into the racket's velocity and face normal (player faces −z).
// vel = brush along the face tangent + through toward the net + lateral. When `ball` (the incoming ball) and
// `racketPos` are given, the hand solves the face tilt for the stroke's natural launch angle.
export function synthesize(key, { speed = 0, vx = 0, fwd = 0, button = null } = {}, grip = 'shakehand', wing = 'fh', ctx = {}, ball = null, racketPos = null, tiltBias = 0) {
  const S = STROKES[key] || STROKES.flat; const G = GRIPS[grip] || GRIPS.shakehand; const W = G[wing] || G.fh;
  let tilt = S.tilt;
  const inTop = ctx.incomingTop || 0;
  if (key === 'block') tilt = inTop > 150 ? -30 : inTop < -150 ? 15 : -12;         // read the spin: close vs topspin, open vs backspin
  if (key === 'serveSide') tilt = button === 'R' ? 30 : button === 'L' ? -15 : 8;
  tilt = clamp(tilt, W.minTilt, W.maxTilt);
  const moving = speed > 0.3;
  const brushGain = W.brush * (key.startsWith('serve') ? G.serveBrush : 1);
  const brush = (S.brush * speed + (moving ? S.brushBase : 0)) * brushGain;
  const through = (S.through * Math.max(0, fwd) + (moving ? S.base : 0)) * W.speed;
  let yaw = clamp(vx * 0.035, -0.35, 0.35);            // no ball to read: the face turns a little toward where the racket travels
  let k = 1;                                           // touch (hand's small power adjustment)
  // A player-chosen face angle: the hand still solves where to put the ball, but inside a band around it, so the
  // tilt the player asked for survives contact. Without a band the solver would simply overwrite the angle.
  const band = tiltBias !== 0
    ? { target: faceAngleFor(tiltBias, grip, wing, tilt), half: Math.min(34, 12 + 22 * Math.abs(tiltBias)) }
    : null;
  if (band) tilt = band.target;
  if (ball) {
    if (key.startsWith('serve') && racketPos) tilt = solveTiltServe(S, tilt, W, brush, through, vx, yaw, ball, racketPos);
    else if (!key.startsWith('serve')) {
      const aimX = clamp(vx * 0.15, -0.55, 0.55);      // swipe toward where you want the ball to go
      const f = solveFaceRally(S, key, tilt, W, brush, through, vx, ball, racketPos, aimX, band);
      tilt = f.tilt; yaw = f.yaw; k = f.k;
    }
  }
  return { vel: swingVel(S, tilt, brush * k, through * k, vx * k), normal: faceNormal(tilt, yaw), tilt, yaw, touch: k, banded: !!band };
}
