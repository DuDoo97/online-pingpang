// strokes.js — the stroke grammar.
//
// Design: the mouse gives ONE thing, a gesture (how hard you swing toward the ball and how much sideways).
// A held button picks the family: left = topspin (closed face), right = backspin (open face), none = flat.
// The situation (short ball, high ball, standing far back, serving) picks the variant. The stroke then
// synthesizes the racket swing: a "brush" along the face tangent plus a "through" drive toward the net.
// The physics does the rest, so a loop is a fast upward brush with a closed face hitting the real ball,
// not a canned outcome.
import { norm } from './physics.js';

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
  block:     { label: 'Block',          tilt: -12, brush: 0.15,  brushBase: 0.2,  through: 0.3,  base: 0.25, lateral: 0.3, hint: 'racket still: uses the ball\'s own pace' },
  drive:     { label: 'Drive',          tilt: -15, brush: 0.35,  brushBase: 0.4,  through: 0.9,  base: 0.7,  lateral: 0.6, hint: 'left button, medium swipe toward the ball' },
  loop:      { label: 'Loop',           tilt: -35, brush: 0.85,  brushBase: 1.2,  through: 0.7,  base: 0.9,  lateral: 0.5, hint: 'left button, hard swipe: heavy topspin' },
  smash:     { label: 'Smash',          tilt: -8,  brush: 0.1,   brushBase: 0.3,  through: 1.3,  base: 1.6,  lateral: 0.6, hint: 'high ball, hard swipe: flat and fast' },
  flick:     { label: 'Flick',          tilt: -20, brush: 0.7,   brushBase: 0.8,  through: 0.7,  base: 0.8,  lateral: 0.5, hint: 'short ball, left button: attack over the table' },
  banana:    { label: 'Banana flick',   tilt: -20, brush: 0.65,  brushBase: 0.8,  through: 0.6,  base: 0.7,  lateral: 1.1, hint: 'short ball, left button, swipe across: sidespin flick' },
  lob:       { label: 'Lob',            tilt: 10,  brush: 1.2,   brushBase: 1.5,  through: 0.25, base: 0.4,  lateral: 0.5, hint: 'far back, left button: high topspin ball' },
  shortpush: { label: 'Short push',     tilt: 42,  brush: -0.5,  brushBase: -0.5, through: 0.45, base: 0.3,  lateral: 0.3, hint: 'right button, gentle touch: keeps it short' },
  push:      { label: 'Push',           tilt: 35,  brush: -0.6,  brushBase: -0.6, through: 0.65, base: 0.6,  lateral: 0.4, hint: 'right button, medium swipe: backspin' },
  longpush:  { label: 'Fast long push', tilt: 28,  brush: -0.5,  brushBase: -0.6, through: 0.85, base: 0.9,  lateral: 0.5, hint: 'right button, hard swipe: deep backspin' },
  chop:      { label: 'Chop',           tilt: 50,  brush: -1.1,  brushBase: -1.4, through: 0.4,  base: 0.5,  lateral: 0.4, hint: 'far back, right button: heavy backspin defence' },
  flat:      { label: 'Flat hit',       tilt: -4,  brush: 0.1,   brushBase: 0.1,  through: 0.95, base: 0.6,  lateral: 0.6, hint: 'no button: flat, little spin' },
  serveTop:  { label: 'Topspin serve',  tilt: -28, brush: 0.9,   brushBase: 1.0,  through: 0.5,  base: 0.5,  lateral: 0.5, hint: 'hold left, swipe at the falling toss' },
  serveBack: { label: 'Backspin serve', tilt: 45,  brush: -0.9,  brushBase: -1.0, through: 0.55, base: 0.5,  lateral: 0.5, hint: 'hold right, swipe at the falling toss' },
  serveSide: { label: 'Sidespin serve', tilt: 8,   brush: 0.2,   brushBase: 0.2,  through: 0.5,  base: 0.5,  lateral: 1.4, hint: 'swipe sideways across the toss' },
  serveFlat: { label: 'Flat serve',     tilt: 0,   brush: 0.1,   brushBase: 0.1,  through: 0.85, base: 0.6,  lateral: 0.5, hint: 'no button: hit the toss forward' },
};

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
export function classify({ button = null, speed = 0, vx = 0, fwd = 0, ctx = {}, grip = 'shakehand', wing = 'fh' }) {
  const G = GRIPS[grip] || GRIPS.shakehand; const W = G[wing] || G.fh;
  const lateral = Math.abs(vx);
  const still = speed < 1.2 || fwd < -0.5;                 // not moving, or pulling away from the ball
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

// Turn the gesture into the racket's velocity and face normal (player faces −z).
// vel = brush along the face tangent + through toward the net + lateral.
export function synthesize(key, { speed = 0, vx = 0, fwd = 0, button = null } = {}, grip = 'shakehand', wing = 'fh', ctx = {}) {
  const S = STROKES[key] || STROKES.flat; const G = GRIPS[grip] || GRIPS.shakehand; const W = G[wing] || G.fh;
  let tilt = S.tilt;
  const inTop = ctx.incomingTop || 0;
  if (key === 'block') tilt = inTop > 150 ? -30 : inTop < -150 ? 15 : -12;         // read the spin: close vs topspin, open vs backspin
  if (key === 'serveSide') tilt = button === 'R' ? 30 : button === 'L' ? -15 : 8;
  tilt = clamp(tilt, W.minTilt, W.maxTilt);
  const t = tilt * Math.PI / 180;
  const moving = speed > 0.3;
  const brushGain = W.brush * (key.startsWith('serve') ? G.serveBrush : 1);
  const brush = (S.brush * speed + (moving ? S.brushBase : 0)) * brushGain;
  const through = (S.through * Math.max(0, fwd) + (moving ? S.base : 0)) * W.speed;
  // face tangent pointing "up the face": for an open face it leans back, for a closed face it leans forward
  const u = { x: 0, y: Math.cos(t), z: Math.sin(t) };
  const vel = { x: vx * S.lateral, y: brush * u.y, z: brush * u.z - through };
  const yaw = clamp(vx * 0.035, -0.35, 0.35);          // the face turns a little toward where the racket travels
  const normal = norm({ x: Math.sin(yaw) * Math.cos(t), y: Math.sin(t), z: -Math.cos(yaw) * Math.cos(t) });
  return { vel, normal, tilt };
}
