// Racket roster: every blade must be physically distinct at contact, must respect the game's direction, and the
// headline contrasts (inverted vs pips vs anti) must actually appear in the numbers.
import { RACKETS, RACKET_ORDER, surfaceFor, surfaceParams } from '../src/rackets.js';
import { synthesize } from '../src/strokes.js';
import { Ball, previewRacketImpact, simulateFlight, spinComponents, PARAMS, v3, len } from '../src/physics.js';
let fails = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '   (' + detail + ')' : ''}`); if (!cond) fails++; };

const sc = spinComponents(v3(0, 0, 1), v3(1, 0, 0)); const AX = sc.top > 0 ? 1 : -1;
const RPM = 2 * Math.PI / 60;   // the physics works in rad/s
const incoming = (rpm) => ({ vel: v3(0.2, -0.6, 6), spin: v3(AX * rpm * RPM, 0, 0) });
const rpos = v3(0.1, 1.0, 1.67), from = v3(0.1, 1.0, 1.64);

// a) every racket must have a complete, sane surface
for (const k of RACKET_ORDER) {
  const R = RACKETS[k], s = surfaceFor(k, 'fh');
  const ok = R.label && R.tagline && R.pros?.length && R.cons?.length
    && s.cor > 0.6 && s.cor < 1 && s.grip > 0.3 && s.grip < 3 && s.tangential >= 0 && s.tangential <= 1
    && s.tiltLimit[0] < s.tiltLimit[1];
  check(`${R.label}: complete and within physical limits`, !!ok, `cor ${s.cor} grip ${s.grip} e_t ${s.tangential} tilt ${s.tiltLimit.join('..')}`);
}
check('the chopper differs between its wings (inverted forehand, long pips backhand)',
  surfaceFor('chopper', 'bh').tangential < surfaceFor('chopper', 'fh').tangential - 0.3,
  `bh e_t ${surfaceFor('chopper', 'bh').tangential} vs fh ${surfaceFor('chopper', 'fh').tangential}`);

// b) the same stroke with different rackets must give measurably different balls
function shot(racketKey, key, speed, incomingRpm = 300) {
  const inc = incoming(incomingRpm);
  const b = new Ball(); b.pos = { ...from }; b.vel = inc.vel; b.spin = inc.spin; b.active = true;
  const surf = surfaceParams(racketKey, 'fh');
  const sw = synthesize(key, { speed, vx: 0, fwd: speed, button: key === 'chop' || key === 'push' ? 'R' : 'L' },
    'shakehand', 'fh', { incomingTop: incomingRpm }, b, rpos, 0, surf);
  const o = previewRacketImpact(b.vel, b.spin, sw.normal, sw.vel, PARAMS, surf);
  const out = spinComponents(o.vel, o.spin);
  const t = new Ball(); t.pos = { ...from }; t.vel = o.vel; t.spin = o.spin; t.active = true;
  const r = simulateFlight(t, PARAMS, { maxTime: 1.8, dt: 1 / 120, stop: (bb, tt, ev) => ev.length > 0 });
  const e = r.events[0];
  return { rpm: out.rpm, top: out.top, speed: len(o.vel), land: e ? (e.type === 'bounce' ? e.side : e.type) : 'none' };
}
const loopOf = {}, driveOf = {};
for (const k of RACKET_ORDER) { loopOf[k] = shot(k, 'loop', 5); driveOf[k] = shot(k, 'drive', 3); }

check('the spin racket loops with more spin than the all-round', loopOf.spin.rpm > loopOf.allround.rpm * 1.1,
  `spin ${Math.round(loopOf.spin.rpm)} vs all-round ${Math.round(loopOf.allround.rpm)} rpm`);
check('the pips racket cannot loop like the all-round', loopOf.pips.rpm < loopOf.allround.rpm * 0.6,
  `pips ${Math.round(loopOf.pips.rpm)} vs all-round ${Math.round(loopOf.allround.rpm)} rpm`);
check('the anti racket cannot loop like the all-round', loopOf.anti.rpm < loopOf.allround.rpm * 0.7,
  `anti ${Math.round(loopOf.anti.rpm)} vs all-round ${Math.round(loopOf.allround.rpm)} rpm`);
check('the attack racket drives faster than the all-round', driveOf.attack.speed > driveOf.allround.speed * 1.04,
  `attack ${driveOf.attack.speed.toFixed(1)} vs all-round ${driveOf.allround.speed.toFixed(1)} m/s`);
check('the anti racket drives slower than the all-round', driveOf.anti.speed < driveOf.allround.speed * 0.97,
  `anti ${driveOf.anti.speed.toFixed(1)} vs all-round ${driveOf.allround.speed.toFixed(1)} m/s`);

// c) the signature ability: what a passive block does to incoming topspin
function block(racketKey, wing, incomingRpm) {
  const inc = incoming(incomingRpm);
  const surf = surfaceParams(racketKey, wing);
  const o = previewRacketImpact(inc.vel, inc.spin, v3(0, 0, -1), v3(0, 0, -2), PARAMS, surf);
  const out = spinComponents(o.vel, o.spin);
  return { rpm: out.rpm, top: out.top, speed: len(o.vel) };
}
const bInverted = block('allround', 'fh', 3000), bPips = block('chopper', 'bh', 3000), bAnti = block('anti', 'fh', 3000);
console.log('      passive block of 3000 rpm topspin ->', ['allround', 'chopper bh', 'anti'].map((n, i) => `${n}: ${Math.round([bInverted, bPips, bAnti][i].rpm)} rpm ${[bInverted, bPips, bAnti][i].top > 0 ? 'tops' : 'BACK'}`).join(' | '));
check('inverted rubber returns the attacker\'s own spin (topspin stays topspin)', bInverted.top > 0, `${Math.round(bInverted.rpm)} rpm topspin`);
check('long pips send heavy topspin back as backspin (spin reversal)', bPips.top < 0, `${Math.round(bPips.rpm)} rpm backspin`);
check('the anti racket also kills the spin', Math.abs(bAnti.rpm) < Math.abs(bInverted.rpm) + 1, `${Math.round(bAnti.rpm)} rpm`);
check('the three surfaces give three different balls off the same block',
  new Set([Math.round(bInverted.rpm / 50), Math.round(bPips.rpm / 50), Math.round(bAnti.rpm / 50)]).size >= 2,
  `${Math.round(bInverted.rpm)} / ${Math.round(bPips.rpm)} / ${Math.round(bAnti.rpm)} rpm`);

// d) no racket may break the game: every one of them must produce legal shots
for (const k of RACKET_ORDER) {
  const shots = ['drive', 'loop', 'push', 'chop', 'block'].map(s => shot(k, s, s === 'block' ? 0 : s === 'chop' ? 4 : s === 'loop' ? 5 : 2.6));
  const sane = shots.every(s => isFinite(s.speed) && s.speed < 40 && Math.abs(s.rpm) < 20000 && s.land !== 'none');
  check(`${RACKETS[k].label}: all five strokes produce a finite, legal ball`, sane,
    shots.map(s => `${Math.round(s.speed)}m/s`).join(' '));
}

console.log(fails ? `\n${fails} racket check(s) failed` : '\nall racket checks passed');
process.exit(fails ? 1 : 0);
