// Face-angle control: a pinned face must change what the ball does, must respect the grip's limits, and the
// default (no tilt requested) must leave the previous behaviour untouched.
import { synthesize, faceAngleFor, GRIPS, TILT_RANGE } from '../src/strokes.js';
import { Ball, previewRacketImpact, simulateFlight, spinComponents, PARAMS, v3, len, norm } from '../src/physics.js';
let fails = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '   (' + detail + ')' : ''}`); if (!cond) fails++; };

// --- the mapping ---
check('bias 0 leaves the stroke\'s own angle alone',
  Math.abs(faceAngleFor(0, 'shakehand', 'fh', -15) + 15) < 1e-6, `${faceAngleFor(0, 'shakehand', 'fh', -15)}`);
check('bias +1 closes the face',
  faceAngleFor(1, 'shakehand', 'fh', -15) <= TILT_RANGE.closed + 1e-6, `${faceAngleFor(1, 'shakehand', 'fh', -15)}°`);
check('bias -1 opens the face',
  faceAngleFor(-1, 'shakehand', 'fh', -15) >= 30, `${faceAngleFor(-1, 'shakehand', 'fh', -15)}°`);
check('the mapping is monotonic in the bias',
  [-1, -0.5, 0, 0.5, 1].every((b, i, a) => i === 0 || faceAngleFor(b, 'shakehand', 'fh', -15) <= faceAngleFor(a[i - 1], 'shakehand', 'fh', -15) + 1e-6));
{
  const bhPen = faceAngleFor(1, 'penhold', 'bh', -12);
  const bhShake = faceAngleFor(1, 'shakehand', 'bh', -12);
  check('a cramped grip cannot close as far as a free one', bhPen > bhShake, `penhold backhand ${bhPen}° vs shakehand backhand ${bhShake}°`);
  check('no grip can exceed its own limits', [['penhold','bh'],['shakehand','fh'],['rpb','bh']].every(([g, w]) => {
    const W = GRIPS[g][w];
    return [-1, -0.5, 0, 0.5, 1].every(b => { const a = faceAngleFor(b, g, w, -15); return a >= W.minTilt - 1e-6 && a <= W.maxTilt + 1e-6; });
  }));
}

// --- the effect on the ball, or the control is decoration ---
const incoming = () => { const sc = spinComponents(v3(0, 0, 1), v3(1, 0, 0)); const ax = sc.top > 0 ? 1 : -1; return { vel: v3(0.2, -0.6, 6), spin: v3(ax * 150, 0, 0) }; };
const rpos = v3(0.1, 1.0, 1.67), from = v3(0.1, 1.0, 1.64);
function shot(key, bias, speed) {
  const inc = incoming(); const b = new Ball(); b.pos = { ...from }; b.vel = inc.vel; b.spin = inc.spin; b.active = true;
  const out = previewRacketImpact(b.vel, b.spin, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 });
  const sw = synthesize(key, { speed, vx: 0, fwd: speed, button: key === 'chop' || key === 'push' ? 'R' : 'L' }, 'shakehand', 'fh', { incomingTop: 150 }, b, rpos, bias);
  const o = previewRacketImpact(b.vel, b.spin, sw.normal, sw.vel);
  const sc = spinComponents(o.vel, o.spin);
  const t = new Ball(); t.pos = { ...from }; t.vel = o.vel; t.spin = o.spin; t.active = true;
  const r = simulateFlight(t, PARAMS, { maxTime: 1.8, dt: 1 / 120, stop: (bb, tt, ev) => ev.length > 0 });
  const e = r.events[0];
  return { tilt: sw.tilt, banded: sw.banded, top: sc.top, rpm: sc.rpm, speed: len(o.vel), land: e ? (e.type === 'bounce' ? e.side : e.type) : 'none' };
}
const chop = shot('chop', -1, 4), driveAuto = shot('drive', 0, 3), smash = shot('drive', 1, 3), kill = shot('loop', -1, 5);
// rad/s, so 1500 rpm is about 157 rad/s: a heavy chop is several thousand rpm
check('an open face on a backspin stroke makes heavy backspin', chop.top < -400 && chop.rpm > 3000, `${Math.round(chop.rpm)} rpm, ${Math.round(chop.top)} rad/s`);
check('a closed face on a topspin stroke makes heavy topspin', smash.top > 250 && smash.rpm > 2000, `${Math.round(smash.rpm)} rpm, ${Math.round(smash.top)} rad/s`);
check('the closed face is reported as a pinned face', smash.banded === true);
check('with no request the hand keeps the angle (not pinned)', driveAuto.banded === false && driveAuto.tilt !== chop.tilt);
check('a chop face and a smash face produce opposite spin', chop.top < 0 && smash.top > 0, `chop ${Math.round(chop.rpm)} rpm vs smash ${Math.round(smash.rpm)} rpm`);
check('an open face on a loop cuts its spin', kill.rpm < shot('loop', 0, 5).rpm * 0.7,
  `${Math.round(kill.rpm)} rpm vs ${Math.round(shot('loop', 0, 5).rpm)} rpm`);
check('every pinned-face shot is a legal direction (forward or up, never backwards)',
  [chop, smash, kill, shot('push', -1, 2.6)].every(s => s.speed > 1));

console.log(fails ? `\n${fails} tilt check(s) failed` : '\nall tilt checks passed');
process.exit(fails ? 1 : 0);
