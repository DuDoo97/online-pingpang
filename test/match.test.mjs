// Headless smoke test: AI serves to itself? No — let the AI serve and check the rules produce points,
// then let two AIs rally (player racket parked far away) and confirm the match progresses without hangs.
import { Match } from '../src/game.js';
import { v3 } from '../src/physics.js';
let seed = 7; const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const events = [];
const m = new Match({ level: 'hard', onEvent: (e) => events.push(e), rng });
m.server = 'ai'; m.startPoint();
const frame = { prev: v3(0, 3, 4), pos: v3(0, 3, 4), vel: v3(), normal: v3(0, 0, -1) };
let t = 0;
while (t < 40 && m.state !== 'gameover') { m.update(1 / 60, frame); t += 1 / 60; }
const points = events.filter(e => e.type === 'point');
console.log('points:', points.length, 'score', m.score, 'reasons:', [...new Set(points.map(p => p.reason))]);
console.log(m.score.ai > 0 && points.every(p => p.winner === 'ai') ? 'PASS  AI serves score against an absent player' : 'FAIL  unexpected scoring');
const serves = events.filter(e => e.type === 'racket' && e.who === 'ai');
console.log(`serves: ${serves.length}, avg speed ${(serves.reduce((a, s) => a + s.speed, 0) / serves.length).toFixed(1)} m/s`);
