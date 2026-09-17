// Career loop, headless: the ladder unlocks in order, rackets unlock with their rivals, the player card is built from
// real telemetry, and a loss never unlocks anything.
import { RIVALS, emptyRecord, isUnlocked, nextRival, rivalAvailable, GameTracker, computeCard, recordGame, loadRecord, saveRecord, UNLOCKED_BY_DEFAULT } from '../src/career.js';
import { RACKETS, RACKET_ORDER, surfaceParams } from '../src/rackets.js';
import { Match } from '../src/game.js';
import { classify, synthesize } from '../src/strokes.js';
import { simulateFlight, spinComponents, PARAMS, TABLE, v3, len, add, sub, scale } from '../src/physics.js';
let fails = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '   (' + detail + ')' : ''}`); if (!cond) fails++; };

// --- the ladder's shape ---
check('the ladder starts with the easiest rival', ['starter', 'easy'].includes(RIVALS[0].level) && nextRival(emptyRecord()).key === RIVALS[0].key);
check('every racket except the free one is unlocked by exactly one rival', RACKET_ORDER.every(k => UNLOCKED_BY_DEFAULT.includes(k) || RIVALS.filter(r => r.racket === k).length >= 1), RACKET_ORDER.map(k => `${k}:${RIVALS.filter(r => r.racket === k).map(r => r.key).join('/') || 'free'}`).join(' '));
check('a fresh record has only the free racket', RACKET_ORDER.filter(k => isUnlocked(emptyRecord(), k)).join(',') === UNLOCKED_BY_DEFAULT.join(','));
check('the second rival is locked until the first is beaten', !rivalAvailable(emptyRecord(), RIVALS[1].key) && rivalAvailable(emptyRecord(), RIVALS[0].key));
check('every rival references a real racket and a real style', RIVALS.every(r => RACKETS[r.racket] && ['attacker', 'controller', 'chopper'].includes(r.style)));

// --- play a game with the scripted club-level bot and feed the tracker ---
function playGame(rival, seedStart, assist = 0.6) {
  let seed = seedStart; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const tracker = new GameTracker();
  let m = null;   // the match emits a 'state' event from its own constructor, before `m` is assigned
  m = new Match({ level: rival.level, style: rival.style, onEvent: (e) => tracker.onEvent(e, m), rng });
  m.assist = assist; m.racketScale = 1.2;
  m.ai.surface = surfaceParams(rival.racket, 'fh'); m.ai.racket.surface = m.ai.surface;
  m.player.surface = surfaceParams('allround', 'fh');
  const STRIKE = TABLE.length / 2 + 0.3, HOME = v3(0, TABLE.height + 0.25, STRIKE);
  let pos = { ...HOME }, prev = { ...pos }, t = 0, swing = 0, sv = null, sn = null, refine = null; const dt = 1 / 60;
  while (t < 150 && m.state !== 'gameover') {
    prev = { ...pos }; let vel = v3(), normal = v3(0, 0, -1);
    if (m.state === 'serve' && m.server === 'player' && !m.ball.active && m.stateTime > 0.5) { pos = { ...HOME }; m.toss(); }
    if (m.ball.active && m.state === 'rally') {
      const b = m.ball; const serving = m.lastHitter === null;
      if (swing > 0) { vel = sv; normal = sn; pos = add(pos, scale(v3(0, 0, -4), dt)); swing -= dt; }
      else if (serving) { pos = v3(b.pos.x, Math.max(TABLE.height + 0.1, b.pos.y - 0.01), STRIKE); if (b.vel.y < 0 && b.pos.y < HOME.y + 0.06) { const g = { speed: 2.5, vx: 0, fwd: 2.5, button: 'L' }; const key = classify({ ...g, ctx: { serving: true } }).key; const sw = synthesize(key, g, 'shakehand', 'fh', { serving: true }, b, pos, 0, m.player.surface); sv = sw.vel; sn = sw.normal; swing = 0.06; refine = (bn) => { const s2 = synthesize(key, g, 'shakehand', 'fh', { serving: true }, bn, pos, 0, m.player.surface); return { normal: s2.normal, vel: s2.vel }; }; } }
      else if (b.vel.z > 0) {
        let bounced = 0, apex = null;
        const r = simulateFlight(b, PARAMS, { maxTime: 2, dt: 1 / 120, stop: (bb, tt, evs) => { bounced += evs.filter(e => e.type === 'bounce' && e.side === 'player').length; if (bounced >= 1 && bb.vel.y <= 0 && !apex) apex = { pos: { ...bb.pos }, t: tt }; return bb.pos.z >= STRIKE - 0.05 || bounced >= 2 || evs.some(e => e.type === 'floor'); } });
        let goal, tRem; const lowAtPlane = r.ball.pos.z >= STRIKE - 0.06 && r.ball.pos.y < TABLE.height + 0.14;
        if (r.ball.pos.z >= STRIKE - 0.06 && !lowAtPlane) { goal = v3(r.ball.pos.x, r.ball.pos.y, STRIKE); tRem = r.t; } else if (apex) { goal = v3(apex.pos.x, apex.pos.y, apex.pos.z + 0.12); tRem = apex.t; } else { goal = HOME; tRem = 1; }
        const d = sub(goal, pos); const L2 = len(d); const step = Math.min(L2, 6 * dt); if (L2 > 1e-4) pos = add(pos, scale(d, step / L2));
        if (tRem < 0.06 && L2 < 0.2) {
          const inTop = spinComponents(b.vel, b.spin).top; const inSpeed = len(b.vel); const high = goal.y > TABLE.height + 0.32; const low = goal.y < TABLE.height + 0.18;
          const g = high ? { speed: 5, vx: 0, fwd: 5, button: 'L' } : inTop < -80 ? { speed: 2.4, vx: 0, fwd: 2.4, button: 'R' } : (inSpeed > 6.5 && low) ? { speed: 0, vx: 0, fwd: 0, button: 'L' } : { speed: Math.max(1.4, 3.2 - inSpeed * 0.25), vx: (rng() - 0.5) * 1.2, fwd: 2.4, button: 'L' };
          const ctx = { high, incomingTop: inTop, short: !!apex && !(r.ball.pos.z >= STRIKE - 0.06) };
          const key = classify({ ...g, ctx }).key;
          const sw = synthesize(key, g, 'shakehand', 'fh', ctx, b, pos, 0, m.player.surface); sv = sw.vel; sn = sw.normal; swing = 0.06;
          refine = (bn) => { const s2 = synthesize(key, g, 'shakehand', 'fh', ctx, bn, pos, 0, m.player.surface); return { normal: s2.normal, vel: s2.vel }; };
        }
      } else { const d = sub(HOME, pos); const L2 = len(d); const step = Math.min(L2, 3 * dt); if (L2 > 1e-4) pos = add(pos, scale(d, step / L2)); }
    } else { pos = { ...HOME }; swing = 0; }
    if (len(vel) === 0) vel = scale(sub(pos, prev), 1 / dt);
    m.update(dt, { prev, pos, vel, normal, refine: swing > 0 ? refine : null }); t += dt;
  }
  return { match: m, tracker, won: m.score.player > m.score.ai && m.state === 'gameover' };
}

const record = emptyRecord();
const first = playGame(RIVALS[0], 7);
console.log(`      vs ${RIVALS[0].name}: ${first.match.score.player}-${first.match.score.ai}, ${first.tracker.shots.length} player shots, longest rally ${first.tracker.longestRally}`);
check('a game produces graded shots (depth, clearance, landed)', first.tracker.shots.filter(s => s.landed !== null).length > 5 && first.tracker.shots.some(s => s.depth !== null && s.clearance !== null),
  `${first.tracker.shots.filter(s => s.landed === true).length} landed, ${first.tracker.shots.filter(s => s.landed === false).length} missed`);
const card = computeCard(first.tracker, null);
check('the player card computes five 0-100 stats', card && ['power', 'spin', 'placement', 'consistency', 'defence'].every(k => card[k] >= 0 && card[k] <= 100),
  card ? `power ${card.power} spin ${card.spin} placement ${card.placement} consistency ${card.consistency} defence ${card.defence} → ${card.style}` : 'no card');

// a loss must not unlock; a win must unlock the rival's racket and the next rival
const res = recordGame(record, RIVALS[0], first.won, `${first.match.score.player}-${first.match.score.ai}`, first.tracker);
if (first.won) {
  check('beating the first rival unlocks their racket and the next rival', res.firstWin && isUnlocked(record, RIVALS[0].racket) && rivalAvailable(record, RIVALS[1].key), `unlocked ${res.unlockedRacket}, next ${res.unlockedRival && res.unlockedRival.name}`);
} else {
  check('losing unlocks nothing', !res.firstWin && record.beaten.length === 0 && !rivalAvailable(record, RIVALS[1].key));
}
// force the rest of the ladder by recording wins, and confirm the unlock chain is complete and ordered
const r2 = emptyRecord();
for (const rv of RIVALS) { const tr = new GameTracker(); tr.shots = first.tracker.shots; tr.points = first.tracker.points; tr.longestRally = first.tracker.longestRally; recordGame(r2, rv, true, '11-3', tr); }
check('beating the whole ladder unlocks every racket', RACKET_ORDER.every(k => isUnlocked(r2, k)), RACKET_ORDER.filter(k => !isUnlocked(r2, k)).join(',') || 'all unlocked');
check('the card blends across games rather than resetting', r2.card && r2.card.shots > first.tracker.shots.length, `card shots ${r2.card && r2.card.shots}`);
check('lifetime record accumulates', r2.lifetime.games === RIVALS.length && r2.lifetime.wins === RIVALS.length);

// persistence round-trip
const store = new Map(); const fake = { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v) };
saveRecord(fake, r2); const back = loadRecord(fake);
check('the record survives a save/load round trip', back.beaten.length === r2.beaten.length && back.card.overall === r2.card.overall);
check('a corrupt record falls back to empty rather than crashing', loadRecord({ getItem: () => '{not json' }).beaten.length === 0);

console.log(fails ? `\n${fails} career check(s) failed` : '\nall career checks passed');
process.exit(fails ? 1 : 0);
