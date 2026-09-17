// Scripted player vs each AI style: rallies must develop, both sides must win points, and the style's
// signature strokes must show up.
import { Match } from '../src/game.js';
import { simulateFlight, PARAMS, TABLE, v3, len, add, sub, scale, norm } from '../src/physics.js';
const EXPECT = { attacker: ['Loop'], controller: ['Block', 'Push'], chopper: ['Chop'] };
let fails = 0;
for (const style of Object.keys(EXPECT)) {
  let seed = 5; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ev = []; const m = new Match({ level: 'medium', style, onEvent: (e) => ev.push(e), rng }); m.assist = 0.6;
  const STRIKE = TABLE.length / 2 + 0.3, HOME = v3(0, TABLE.height + 0.25, STRIKE); let pos = { ...HOME }, prev = { ...pos }, t = 0, swing = 0; const dt = 1 / 60;
  while (t < 80 && m.state !== 'gameover') {
    prev = { ...pos }; let vel = v3(), normal = norm(v3(0, -0.1, -1));
    if (m.state === 'serve' && m.server === 'player' && !m.ball.active && m.stateTime > 0.5) { pos = { ...HOME }; m.toss(); }
    if (m.ball.active && m.state === 'rally') { const b = m.ball; const serving = m.lastHitter === null;
      if (swing > 0) { vel = v3(0, 0.8, -6); pos = add(pos, scale(vel, dt)); swing -= dt; }
      else if (serving) { pos = v3(b.pos.x, Math.max(TABLE.height + 0.1, b.pos.y - 0.01), STRIKE); if (b.vel.y < 0 && b.pos.y < HOME.y + 0.06) swing = 0.06; }
      else if (b.vel.z > 0) { let bounced = 0, apex = null; const r = simulateFlight(b, PARAMS, { maxTime: 2, dt: 1 / 120, stop: (bb, tt, evs) => { bounced += evs.filter(e => e.type === 'bounce' && e.side === 'player').length; if (bounced >= 1 && bb.vel.y <= 0 && !apex) apex = { pos: { ...bb.pos }, t: tt }; return bb.pos.z >= STRIKE - 0.05 || bounced >= 2 || evs.some(e => e.type === 'floor'); } });
        let goal, tRem; if (r.ball.pos.z >= STRIKE - 0.06) { goal = v3(r.ball.pos.x, r.ball.pos.y, STRIKE); tRem = r.t; } else if (apex) { goal = v3(apex.pos.x, apex.pos.y, apex.pos.z + 0.12); tRem = apex.t; } else { goal = HOME; tRem = 1; }
        const d = sub(goal, pos); const L = len(d); const step = Math.min(L, 5 * dt); if (L > 1e-4) pos = add(pos, scale(d, step / L)); if (tRem < 0.05 && L < 0.1) swing = 0.06; }
      else { const d = sub(HOME, pos); const L = len(d); const step = Math.min(L, 3 * dt); if (L > 1e-4) pos = add(pos, scale(d, step / L)); }
    } else { pos = { ...HOME }; swing = 0; }
    if (len(vel) === 0) vel = scale(sub(pos, prev), 1 / dt);
    m.update(dt, { prev, pos, vel, normal }); t += dt;
  }
  const shots = ev.filter(e => e.type === 'shot' && e.who === 'ai' && e.stroke);
  const hist = {}; for (const s of shots) { const k = s.stroke.label.replace(/^(FH|BH) /, ''); hist[k] = (hist[k] || 0) + 1; }
  const ok = m.longestRally >= 3 && m.score.ai > 0 && m.score.player > 0 && EXPECT[style].some(k => (hist[k] || 0) >= 3);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${style.padEnd(10)} score ${m.score.player}-${m.score.ai}  longest ${m.longestRally}  AI strokes ${JSON.stringify(hist)}`);
}
console.log(fails ? `\n${fails} style check(s) failed` : '\nall style checks passed');
process.exit(fails ? 1 : 0);
