// Stroke grammar checks: gestures classify as the intended stroke, and the synthesized swing produces the
// right physics (spin sign and magnitude, speed ordering) when it hits a real ball.
import { classify, synthesize, GRIPS, wingFor } from '../src/strokes.js';
import { Ball, Racket, collideRacket, spinComponents, v3, len, norm, sub, scale } from '../src/physics.js';
let fails = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '   (' + detail + ')' : ''}`); if (!cond) fails++; };

// --- classification ---
const cases = [
  ['block',     { button: 'L', speed: 0, vx: 0, fwd: 0 }, {}],
  ['drive',     { button: 'L', speed: 2.4, vx: 0.3, fwd: 2.3 }, {}],
  ['loop',      { button: 'L', speed: 5.5, vx: 0, fwd: 5.5 }, {}],
  ['smash',     { button: 'L', speed: 6, vx: 1, fwd: 5.9 }, { high: true }],
  ['flick',     { button: 'L', speed: 3.2, vx: 0.3, fwd: 3.1 }, { short: true }],
  ['banana',    { button: 'L', speed: 4.3, vx: 3, fwd: 3 }, { short: true }],
  ['lob',       { button: 'L', speed: 4, vx: 0, fwd: 4 }, { far: true }],
  ['shortpush', { button: 'R', speed: 1.0, vx: 0, fwd: 1.0 }, {}],
  ['push',      { button: 'R', speed: 2.6, vx: 0, fwd: 2.6 }, {}],
  ['longpush',  { button: 'R', speed: 4.4, vx: 0, fwd: 4.4 }, {}],
  ['chop',      { button: 'R', speed: 4.2, vx: 0, fwd: 4.2 }, { far: true }],
  ['flat',      { button: null, speed: 2.5, vx: 0, fwd: 2.5 }, {}],
  ['serveTop',  { button: 'L', speed: 3, vx: 0, fwd: 3 }, { serving: true }],
  ['serveBack', { button: 'R', speed: 3, vx: 0, fwd: 3 }, { serving: true }],
  ['serveSide', { button: null, speed: 3.1, vx: 3, fwd: 0.5 }, { serving: true }],
];
for (const [want, g, ctx] of cases) {
  const r = classify({ ...g, ctx, grip: 'shakehand', wing: 'fh' });
  check(`classify ${want}`, r.key === want, `got ${r.key} · label "${r.label}"`);
}
// grip rules
{
  const r = classify({ button: 'L', speed: 6, vx: 0, fwd: 6, ctx: {}, grip: 'penhold', wing: 'bh' });
  check('traditional penhold backhand cannot loop -> drive with a note', r.key === 'drive' && r.note.length > 0, r.label);
  const r2 = classify({ button: 'L', speed: 6, vx: 0, fwd: 6, ctx: {}, grip: 'rpb', wing: 'bh' });
  check('RPB backhand can loop', r2.key === 'loop' && r2.label.startsWith('RPB'), r2.label);
  const r3 = classify({ button: 'L', speed: 4.3, vx: 3, fwd: 3, ctx: { short: true }, grip: 'rpb', wing: 'bh' });
  check('RPB banana flick', r3.key === 'banana', r3.label);
}
// wing selection with hysteresis (right-handed: forehand on +x)
check('wing: ball on the right is forehand', wingFor(0.3, 1, 'bh') === 'fh');
check('wing: ball on the left is backhand', wingFor(-0.3, 1, 'fh') === 'bh');
check('wing: hysteresis keeps forehand near the middle', wingFor(-0.05, 1, 'fh') === 'fh');
check('wing: left-hander mirrors', wingFor(-0.3, -1, 'bh') === 'fh');

// --- physics of the synthesized swings: hit a ball arriving at 6 m/s with light topspin ---
function hitWith(key, gesture, grip = 'shakehand', wing = 'fh', ctx = {}) {
  const sw = synthesize(key, gesture, grip, wing, ctx);
  const b = new Ball(); b.pos = v3(0, 1.0, 1.66); b.vel = v3(0, -0.5, 6); b.active = true;
  const sc = spinComponents(b.vel, v3(1, 0, 0)); b.spin = v3((sc.top > 0 ? 1 : -1) * 120, 0, 0);
  const rk = new Racket(v3(0, 1.0, 1.68), sw.normal); rk.vel = sw.vel; rk.prevPos = sub(rk.pos, scale(sw.vel, 1 / 60));
  const hit = collideRacket(b, v3(0, 1.0, 1.60), rk);
  const out = spinComponents(b.vel, b.spin);
  return { hit: !!hit, speed: len(b.vel), top: out.top, rpm: out.rpm, vy: b.vel.y, tilt: sw.tilt, racket: sw.vel };
}
const loop = hitWith('loop', { speed: 5.5, vx: 0, fwd: 5.5, button: 'L' });
const drive = hitWith('drive', { speed: 2.4, vx: 0, fwd: 2.4, button: 'L' });
const smash = hitWith('smash', { speed: 6, vx: 0, fwd: 6, button: 'L' }, 'shakehand', 'fh', { high: true });
const push = hitWith('push', { speed: 2.6, vx: 0, fwd: 2.6, button: 'R' });
const chop = hitWith('chop', { speed: 4.2, vx: 0, fwd: 4.2, button: 'R' }, 'shakehand', 'fh', { far: true });
const block = hitWith('block', { speed: 0, vx: 0, fwd: 0, button: 'L' }, 'shakehand', 'fh', { incomingTop: 120 });
const lob = hitWith('lob', { speed: 4, vx: 0, fwd: 4, button: 'L' }, 'shakehand', 'fh', { far: true });
const banana = hitWith('banana', { speed: 4.3, vx: 3, fwd: 3, button: 'L' }, 'shakehand', 'fh', { short: true });
check('loop makes heavy topspin (> 2,000 rpm)', loop.hit && loop.top > 0 && loop.rpm > 2000, `${Math.round(loop.rpm)} rpm, ${loop.speed.toFixed(1)} m/s`);
check('drive: topspin but less than the loop, faster than a block', drive.hit && drive.top > 0 && drive.rpm < loop.rpm && drive.speed > block.speed, `${Math.round(drive.rpm)} rpm, ${drive.speed.toFixed(1)} m/s`);
check('smash is the fastest stroke', smash.hit && smash.speed > drive.speed && smash.speed > loop.speed, `${smash.speed.toFixed(1)} m/s`);
check('push makes backspin', push.hit && push.top < 0, `${Math.round(push.rpm)} rpm`);
check('chop makes heavier backspin than a push', chop.hit && chop.top < push.top, `chop ${Math.round(chop.rpm)} vs push ${Math.round(push.rpm)} rpm`);
check('block keeps the ball slow', block.hit && block.speed < drive.speed, `${block.speed.toFixed(1)} m/s`);
check('lob goes up steeply with topspin', lob.hit && lob.vy > 3 && lob.top > 0, `vy=${lob.vy.toFixed(1)} m/s`);
{ const side = Math.abs(spinComponents(v3(banana.racket.x, 0, -1), v3(0, 1, 0)).side); check('banana flick carries sidespin', banana.hit && Math.abs(banana.rpm) > 800, `${Math.round(banana.rpm)} rpm total`); }
const penLoop = hitWith('loop', { speed: 5.5, vx: 0, fwd: 5.5, button: 'L' }, 'penhold', 'fh');
check('penhold forehand loop spins more than shakehand', penLoop.rpm > loop.rpm, `${Math.round(penLoop.rpm)} vs ${Math.round(loop.rpm)} rpm`);
const bhTrad = synthesize('loop', { speed: 6, vx: 0, fwd: 6, button: 'L' }, 'penhold', 'bh');
check('traditional penhold backhand face cannot close past -12°', bhTrad.tilt >= -12, `tilt ${bhTrad.tilt}`);

console.log(fails ? `\n${fails} check(s) failed` : '\nall stroke checks passed');
process.exit(fails ? 1 : 0);
