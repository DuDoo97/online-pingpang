// Each level preset must be playable at its own skill expectation: levels that promise help must let a bot
// with a parked racket return balls; Pro (raw physics) must still allow a competent bot to win points.
import { LEVELS, LEVEL_ORDER } from '../src/levels.js';
import { Match } from '../src/game.js';
import { classify, synthesize } from '../src/strokes.js';
import { simulateFlight, spinComponents, PARAMS, TABLE, v3, len, add, sub, scale } from '../src/physics.js';
let fails = 0;
for (const lvl of LEVEL_ORDER) {
  const L = LEVELS[lvl];
  let seed = 33; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ev = []; const m = new Match({ level: L.ai, style: 'attacker', onEvent: (e) => ev.push(e), rng });
  m.assist = L.assist; m.racketScale = L.racketScale;
  const STRIKE = TABLE.length / 2 + 0.3, HOME = v3(0, TABLE.height + 0.25, STRIKE);
  let pos = { ...HOME }, prev = { ...pos }, t = 0, swing = 0, sv = null, sn = null, refine = null; const dt = 1 / 60;
  const parked = lvl === 'newbie' || lvl === 'casual';     // these levels must work with little or no player skill
  while (t < 60 && m.state !== 'gameover') {
    prev = { ...pos }; let vel = v3(), normal = v3(0, 0, -1);
    if (m.state === 'serve' && m.server === 'player' && !m.ball.active && m.stateTime > 0.5) { pos = { ...HOME }; m.toss(); }
    if (m.ball.active && m.state === 'rally') {
      const b = m.ball; const serving = m.lastHitter === null;
      if (swing > 0) { vel = sv; normal = sn; pos = add(pos, scale(v3(0, 0, -4), dt)); swing -= dt; }
      else if (serving) {
        pos = v3(b.pos.x, Math.max(TABLE.height + 0.1, b.pos.y - 0.01), STRIKE);
        if (b.vel.y < 0 && b.pos.y < HOME.y + 0.06) { const g = { speed: 2.5, vx: 0, fwd: 2.5, button: 'L' }; const key = classify({ ...g, ctx: { serving: true } }).key; const sw = synthesize(key, g, 'shakehand', 'fh', { serving: true }, b, pos); sv = sw.vel; sn = sw.normal; swing = 0.06; refine = (bn) => { const s2 = synthesize(key, g, 'shakehand', 'fh', { serving: true }, bn, pos); return { normal: s2.normal, vel: s2.vel }; }; }
      } else if (b.vel.z > 0) {
        let bounced = 0, apex = null;
        const r = simulateFlight(b, PARAMS, { maxTime: 2, dt: 1 / 120, stop: (bb, tt, evs) => { bounced += evs.filter(e => e.type === 'bounce' && e.side === 'player').length; if (bounced >= 1 && bb.vel.y <= 0 && !apex) apex = { pos: { ...bb.pos }, t: tt }; return bb.pos.z >= STRIKE - 0.05 || bounced >= 2 || evs.some(e => e.type === 'floor'); } });
        let goal, tRem;
        const lowAtPlane = r.ball.pos.z >= STRIKE - 0.06 && r.ball.pos.y < TABLE.height + 0.14;
        if (r.ball.pos.z >= STRIKE - 0.06 && !lowAtPlane) { goal = v3(r.ball.pos.x, r.ball.pos.y, STRIKE); tRem = r.t; }
        else if (apex) { goal = v3(apex.pos.x, apex.pos.y, apex.pos.z + 0.12); tRem = apex.t; } else { goal = HOME; tRem = 1; }
        const d = sub(goal, pos); const L2 = len(d); const step = Math.min(L2, 6 * dt); if (L2 > 1e-4) pos = add(pos, scale(d, step / L2));
        if (tRem < 0.06 && L2 < 0.2) {
          const inTop = spinComponents(b.vel, b.spin).top; const inSpeed = len(b.vel);
          const high = goal.y > TABLE.height + 0.32; const low = goal.y < TABLE.height + 0.18;
          const g = high ? { speed: 5, vx: 0, fwd: 5, button: 'L' } : inTop < -80 ? { speed: 2.4, vx: 0, fwd: 2.4, button: 'R' } : (inSpeed > 6.5 && low) ? { speed: 0, vx: 0, fwd: 0, button: 'L' } : { speed: Math.max(1.4, 3.2 - inSpeed * 0.25), vx: 0, fwd: 2.4, button: 'L' };
          const ctx = { high, incomingTop: inTop, short: !!apex && !(r.ball.pos.z >= STRIKE - 0.06) };
          const key = classify({ ...g, ctx }).key;
          const sw = synthesize(key, g, 'shakehand', 'fh', ctx, b, pos); sv = sw.vel; sn = sw.normal; swing = 0.06;
          refine = (bn) => { const s2 = synthesize(key, g, 'shakehand', 'fh', ctx, bn, pos); return { normal: s2.normal, vel: s2.vel }; };
        }
      } else { const d = sub(HOME, pos); const L2 = len(d); const step = Math.min(L2, 3 * dt); if (L2 > 1e-4) pos = add(pos, scale(d, step / L2)); }
    } else { pos = { ...HOME }; swing = 0; }
    if (len(vel) === 0) vel = scale(sub(pos, prev), 1 / dt);
    m.update(dt, { prev, pos, vel, normal, refine: swing > 0 ? refine : null }); t += dt;
  }
  const returns = ev.filter(e => e.type === 'shot' && e.who === 'player').length;
  const ok = m.longestRally >= (parked ? 2 : 4) && returns >= 3;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${L.label.padEnd(7)} assist ${L.assist} racket ${L.racketScale}× vs ${L.ai}  →  returns ${returns}, longest rally ${m.longestRally}, score ${m.score.player}-${m.score.ai}`);
}
console.log(fails ? `\n${fails} level check(s) failed` : '\nall level checks passed');
process.exit(fails ? 1 : 0);
