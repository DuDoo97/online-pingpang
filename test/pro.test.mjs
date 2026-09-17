// Pro level: assist 0, real racket, opponent 'pro'. A scripted player who reaches the ball and swings with a
// sensible stroke choice (using the same hand solver a human gets) must still be able to win points and rally.
import { Match } from '../src/game.js';
import { classify, synthesize } from '../src/strokes.js';
import { simulateFlight, spinComponents, PARAMS, TABLE, v3, len, add, sub, scale } from '../src/physics.js';
let seed = 21; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ev = []; const m = new Match({ level: 'pro', style: 'attacker', onEvent: (e) => ev.push(e), rng });
m.assist = 0; m.racketScale = 1;
const STRIKE = TABLE.length / 2 + 0.3, HOME = v3(0, TABLE.height + 0.25, STRIKE);
let pos = { ...HOME }, prev = { ...pos }, t = 0, swing = 0, swingV = null, swingN = null, refine = null; const dt = 1 / 60;
const strokesUsed = {};
while (t < 120 && m.state !== 'gameover') {
  prev = { ...pos }; let vel = v3(), normal = v3(0, 0, -1);
  if (m.state === 'serve' && m.server === 'player' && !m.ball.active && m.stateTime > 0.5) { pos = { ...HOME }; m.toss(); }
  if (m.ball.active && m.state === 'rally') {
    const b = m.ball; const serving = m.lastHitter === null;
    if (swing > 0) { vel = swingV; normal = swingN; pos = add(pos, scale(v3(0, 0, -4), dt)); swing -= dt; }   // lunge through the ball like the real controls (~25 cm per swing)
    else if (serving) {
      pos = v3(b.pos.x, Math.max(TABLE.height + 0.1, b.pos.y - 0.01), STRIKE);
      if (b.vel.y < 0 && b.pos.y < HOME.y + 0.06) {
        const g = { speed: 2.5, vx: 0, fwd: 2.5, button: rng() < 0.5 ? 'L' : 'R' };
        const key = classify({ ...g, ctx: { serving: true } }).key;
        const sw = synthesize(key, g, 'shakehand', 'fh', { serving: true }, b, pos); swingV = sw.vel; swingN = sw.normal; swing = 0.06; strokesUsed[key] = (strokesUsed[key] || 0) + 1;
        refine = (bn) => { const s2 = synthesize(key, g, 'shakehand', 'fh', { serving: true }, bn, pos); return { normal: s2.normal, vel: s2.vel }; };
      }
    } else if (b.vel.z > 0) {
      let bounced = 0, apex = null;
      const r = simulateFlight(b, PARAMS, { maxTime: 2, dt: 1 / 120, stop: (bb, tt, evs) => { bounced += evs.filter(e => e.type === 'bounce' && e.side === 'player').length; if (bounced >= 1 && bb.vel.y <= 0 && !apex) apex = { pos: { ...bb.pos }, t: tt }; return bb.pos.z >= STRIKE - 0.05 || bounced >= 2 || evs.some(e => e.type === 'floor'); } });
      let goal, tRem; if (r.ball.pos.z >= STRIKE - 0.06) { goal = v3(r.ball.pos.x, r.ball.pos.y, STRIKE); tRem = r.t; } else if (apex) { goal = v3(apex.pos.x, apex.pos.y, apex.pos.z + 0.12); tRem = apex.t; } else { goal = HOME; tRem = 1; }
      const d = sub(goal, pos); const L = len(d); const step = Math.min(L, 6 * dt); if (L > 1e-4) pos = add(pos, scale(d, step / L));
      const near = Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y) < 0.12 && b.pos.z > pos.z - 0.2 && b.pos.z < pos.z;
      if ((tRem < 0.06 && L < 0.2) || near) {
        // stroke choice like a club player: high -> smash; backspin -> push or loop; a fast low ball -> block;
        // otherwise a drive whose power shrinks as the incoming ball gets faster
        const inTop = spinComponents(b.vel, b.spin).top;
        const inSpeed = len(b.vel);
        const high = goal.y > TABLE.height + 0.32;
        const low = goal.y < TABLE.height + 0.18;
        let g;
        if (high) g = { speed: 5, vx: 0, fwd: 5, button: 'L' };
        else if (inTop < -80) g = rng() < 0.5 ? { speed: 2.4, vx: 0, fwd: 2.4, button: 'R' } : { speed: 4.2, vx: 0, fwd: 4.2, button: 'L' };
        else if (inSpeed > 6.5 && low) g = { speed: 0, vx: 0, fwd: 0, button: 'L' };
        else { const sp = Math.max(1.4, 3.2 - inSpeed * 0.25) + rng() * 0.5; g = { speed: sp, vx: (rng() - 0.5) * 1.2, fwd: sp, button: 'L' }; }
        const ctx = { high, incomingTop: inTop, short: !!apex && !(r.ball.pos.z >= STRIKE - 0.06) };
        const key = classify({ ...g, ctx }).key;
        const sw = synthesize(key, g, 'shakehand', 'fh', ctx, b, pos); swingV = sw.vel; swingN = sw.normal; swing = 0.06; strokesUsed[key] = (strokesUsed[key] || 0) + 1;
        refine = (bn) => { const s2 = synthesize(key, g, 'shakehand', 'fh', ctx, bn, pos); return { normal: s2.normal, vel: s2.vel }; };
      }
    } else { const d = sub(HOME, pos); const L = len(d); const step = Math.min(L, 3 * dt); if (L > 1e-4) pos = add(pos, scale(d, step / L)); }
  } else { pos = { ...HOME }; swing = 0; }
  if (len(vel) === 0) vel = scale(sub(pos, prev), 1 / dt);
  m.update(dt, { prev, pos, vel, normal, refine: swing > 0 ? refine : null }); t += dt;
}
const pts = ev.filter(e => e.type === 'point'); const reasons = {};
for (const p of pts) { const k = (p.winner === 'player' ? 'YOU: ' : 'AI:  ') + p.reason; reasons[k] = (reasons[k] || 0) + 1; }
console.log(`pro level: score ${m.score.player}-${m.score.ai}  longest rally ${m.longestRally}  time ${t.toFixed(0)}s`);
console.log('player strokes', JSON.stringify(strokesUsed)); console.log(reasons);
const ok = m.score.player >= 3 && m.longestRally >= 4;
console.log(ok ? 'PASS  pro level (raw physics) is playable: the player wins points and rallies' : 'FAIL  pro level unplayable');
process.exit(ok ? 0 : 1);
