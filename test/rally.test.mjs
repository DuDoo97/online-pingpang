// Headless rally test: a scripted player who moves the racket to the predicted intercept and swings forward.
import { Match } from '../src/game.js';
import { simulateFlight, PARAMS, TABLE, v3, len, add, sub, scale, norm } from '../src/physics.js';
let seed = 3; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ev = [];
const m = new Match({ level: 'medium', onEvent: (e) => ev.push(e), rng });
m.assist = 0.6;
const STRIKE = TABLE.length / 2 + 0.3;
const HOME = v3(0, TABLE.height + 0.25, STRIKE);
let pos = { ...HOME }, prev = { ...pos };
let t = 0, maxSpeed = 0, swing = 0;
const dt = 1 / 60;
while (t < 120 && m.state !== 'gameover') {
  prev = { ...pos };
  let vel = v3(), normal = norm(v3(0, -0.1, -1));
  if (m.state === 'serve' && m.server === 'player' && !m.ball.active && m.stateTime > 0.5) { pos = { ...HOME }; m.toss(); }
  if (m.ball.active && m.state === 'rally') {
    const b = m.ball;
    const serving = m.lastHitter === null;
    if (swing > 0) {
      vel = v3(0, 0.8, -6); pos = add(pos, scale(vel, dt)); swing -= dt;
    } else if (serving) {
      // track the falling toss, then swing when it drops to racket height
      pos = v3(b.pos.x, Math.max(TABLE.height + 0.1, b.pos.y - 0.01), STRIKE);
      if (b.vel.y < 0 && b.pos.y < HOME.y + 0.06) swing = 0.06;
    } else if (b.vel.z > 0) {
      // where will the ball be when it reaches my strike depth? If it bounces short and never gets there,
      // step in and take it at the top of its bounce.
      let bounced = 0, apex = null;
      const r = simulateFlight(b, PARAMS, { maxTime: 2, dt: 1 / 120, stop: (bb, tt, evs) => {
        bounced += evs.filter(e => e.type === 'bounce' && e.side === 'player').length;
        if (bounced >= 1 && bb.vel.y <= 0 && !apex) apex = { pos: { ...bb.pos }, t: tt };
        return bb.pos.z >= STRIKE - 0.05 || bounced >= 2 || evs.some(e => e.type === 'floor');
      } });
      let goal, tRem;
      if (r.ball.pos.z >= STRIKE - 0.06) { goal = v3(r.ball.pos.x, r.ball.pos.y, STRIKE); tRem = r.t; }
      else if (apex) { goal = v3(apex.pos.x, apex.pos.y, apex.pos.z + 0.12); tRem = apex.t; }
      else { goal = HOME; tRem = 1; }
      const d = sub(goal, pos); const L = len(d);
      const step = Math.min(L, 5 * dt);
      if (L > 1e-4) pos = add(pos, scale(d, step / L));
      if (tRem < 0.05 && L < 0.1) swing = 0.06;
    } else {
      const d = sub(HOME, pos); const L = len(d); const step = Math.min(L, 3 * dt); if (L > 1e-4) pos = add(pos, scale(d, step / L));
    }
  } else { pos = { ...HOME }; swing = 0; }
  if (len(vel) === 0) vel = scale(sub(pos, prev), 1 / dt);
  m.update(dt, { prev, pos, vel, normal });
  if (m.ball.active) { maxSpeed = Math.max(maxSpeed, len(m.ball.vel)); }
  t += dt;
}
const pts = ev.filter(e => e.type === 'point');
const reasons = {};
for (const p of pts) { const k = (p.winner === 'player' ? 'YOU: ' : 'AI:  ') + p.reason; reasons[k] = (reasons[k] || 0) + 1; }
console.log('time', t.toFixed(1), 's  state', m.state, ' score', m.score, ' longest rally', m.longestRally);
console.log(reasons);
console.log('max ball speed', maxSpeed.toFixed(1), 'm/s');
const shots = ev.filter(e => e.type === 'shot');
console.log('shots', shots.length, 'player', shots.filter(s => s.who === 'player').length, 'ai', shots.filter(s => s.who === 'ai').length);
console.log(m.longestRally >= 3 && pts.length >= 5 ? 'PASS  scripted rally produces multi-shot exchanges' : 'FAIL  rally did not develop');
console.log(isFinite(maxSpeed) && maxSpeed < 60 ? 'PASS  ball speed stays physical' : 'FAIL  ball speed blew up');
process.exit(m.longestRally >= 3 && pts.length >= 5 ? 0 : 1);
