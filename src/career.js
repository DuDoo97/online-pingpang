// career.js — progression: a ladder of rivals, racket unlocks, and a player card built from real match telemetry.
//
// Nothing in here touches the physics. It watches the match's events (shots, points, games), keeps a record,
// and decides what is unlocked. The player card's five stats are computed from measurements the engine already
// makes on every shot: speed, spin, net clearance, landing depth, rally length, and who won each point.

import { RACKETS } from './rackets.js';

// ---------- the ladder ----------
// Each rival is a style, a racket and a difficulty, plus a personality the player can read. Beating a rival
// unlocks the next one AND the rival's racket. The order teaches the game: pace first, then spin, then defence.
export const RIVALS = [
  { key: 'mika',   name: 'Mika',   title: 'The Wall',        style: 'controller', racket: 'allround', level: 'starter',
    bio: 'Blocks everything back and waits for you to miss. Beat the wall by moving the ball around.',
    hint: 'Nothing fancy: play deep to the corners and let Mika run.' },
  { key: 'tomas',  name: 'Tomás',  title: 'The Hammer',      style: 'attacker',   racket: 'attack',   level: 'easy',
    bio: 'Hits every ball as hard as the blade allows. Fast, flat, and long more often than he admits.',
    hint: 'Stand back a step and block. A hard flat ball has no spin to read.' },
  { key: 'yuki',   name: 'Yuki',   title: 'The Spinner',     style: 'attacker',   racket: 'spin',     level: 'medium',
    bio: 'Every ball is a loop, every serve is dressed in sidespin. If you push into her topspin you will be long.',
    hint: 'Close your face against her loops. Against her serves, wait: read the spin label before you commit.' },
  { key: 'dev',    name: 'Dev',    title: 'The Pips',        style: 'controller', racket: 'pips',     level: 'medium',
    bio: 'Short pips on a fast blade. He takes your spin and gives back a dead, flat ball that arrives early.',
    hint: 'Your loops will not spin off his rubber. Hit through him with drives and smash anything high.' },
  { key: 'ines',   name: 'Inês',   title: 'The Chopper',     style: 'chopper',    racket: 'chopper',  level: 'hard',
    bio: 'Stands two metres back and chops everything. Her backhand pips send your own topspin back at you as backspin.',
    hint: 'Patience. Loop, then push, then loop again. Never hit the same shot twice into her backhand.' },
  { key: 'ren',    name: 'Ren',    title: 'The Ghost',       style: 'controller', racket: 'anti',     level: 'hard',
    bio: 'Anti-spin rubber and a dead touch. Whatever you send arrives back slow and spinless, and you have to make it all yourself.',
    hint: 'Generate your own pace. Short pushes then a smash: there is nothing on the ball to work with.' },
  { key: 'sol',    name: 'Sol',    title: 'The Champion',    style: 'attacker',   racket: 'attack',   level: 'pro',
    bio: 'Places every ball where you are not. Full speed, no help, and a smash for anything you leave high.',
    hint: 'This is real table tennis. Serve short, keep it low, and take your chance when it comes.' },
];

// Which racket each rival's win releases (the rival's own blade). All-round is free.
export const UNLOCKED_BY_DEFAULT = ['allround'];

export function racketUnlockedBy(racketKey) {
  return RIVALS.find(r => r.racket === racketKey) || null;
}

// ---------- the record ----------
export function emptyRecord() {
  return {
    version: 1,
    beaten: [],                    // rival keys beaten at least once
    games: [],                     // last N games: { rival, won, score, date, stats }
    lifetime: { shots: 0, points: 0, pointsWon: 0, games: 0, wins: 0, longestRally: 0 },
    card: null,                    // cached player card
  };
}

export function isUnlocked(record, racketKey) {
  if (UNLOCKED_BY_DEFAULT.includes(racketKey)) return true;
  const by = racketUnlockedBy(racketKey);
  return !!by && record.beaten.includes(by.key);
}

export function nextRival(record) {
  for (const r of RIVALS) if (!record.beaten.includes(r.key)) return r;
  return RIVALS[RIVALS.length - 1];        // ladder complete: the champion again, for the record
}

export function rivalIndex(key) { return RIVALS.findIndex(r => r.key === key); }

export function rivalAvailable(record, key) {
  const i = rivalIndex(key);
  if (i <= 0) return true;
  return record.beaten.includes(RIVALS[i - 1].key);
}

// ---------- per-game telemetry ----------
// Fed from the match's onEvent stream. Everything here is a measurement the engine already made.
export class GameTracker {
  constructor() { this.reset(); }
  reset() {
    this.shots = [];              // player shots: { speed, rpm, kind, stroke, clearance, depth, aimX }
    this.points = [];             // { winner, reason, rally }
    this.rally = 0; this.longestRally = 0;
    this.returnsAttempted = 0; this.returnsMade = 0;
    this.aiSmashes = 0; this.aiSmashesReturned = 0;
  }
  onEvent(e, match) {
    if (!match) return;            // events fired during the match's own construction carry nothing to grade
    if (e.type === 'shot' && e.who === 'player') {
      this.shots.push({ speed: e.speed, rpm: e.rpm, kind: e.kind, stroke: e.stroke ? e.stroke.key : null, clearance: e.clearance ?? null, depth: e.depth ?? null, landed: e.landed ?? null });
      this.rally = match ? match.rally : this.rally;
    }
    if (e.type === 'shot' && e.who === 'ai') {
      this.returnsAttempted++;
      if (e.stroke && e.stroke.key === 'smash') this.aiSmashes++;
    }
    if (e.type === 'shot' && e.who === 'player' && e.receiveOfSmash) this.aiSmashesReturned++;
    if (e.type === 'point') {
      this.points.push({ winner: e.winner, reason: e.reason, rally: match ? match.rally : 0 });
      this.longestRally = Math.max(this.longestRally, match ? match.rally : 0);
    }
  }
}

// ---------- the player card ----------
// Five stats, each 0..100, from measurements. The scales are anchored to the amateur ranges the physics research
// reported (loops 3,000-5,000 rpm, drives 6-12 m/s), so a club player's card lands mid-scale and a pro's near the top.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const pct = (v) => Math.round(clamp01(v) * 100);
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const topQuartile = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => b - a); return mean(s.slice(0, Math.max(1, Math.ceil(s.length / 4)))); };

export function computeCard(tracker, previous = null) {
  const shots = tracker.shots;
  const landed = shots.filter(s => s.landed === true);
  const n = shots.length;
  if (n < 3) return previous;    // not enough to say anything yet

  // POWER: top-quartile speed of your shots. 6 m/s is a push, 12 a firm drive, 18 a real smash.
  const power = pct((topQuartile(shots.map(s => s.speed)) - 5) / 13);
  // SPIN: top-quartile spin of your shots. 1,000 rpm is a brush, 3,000 a club loop, 5,000 a heavy one.
  const spin = pct((topQuartile(shots.map(s => s.rpm)) - 500) / 4500);
  // PLACEMENT: how deep and how close to the sidelines your landing shots go. 0.5 m past the net is short,
  // 1.2 m is deep; hugging a sideline counts for more than the centre.
  const depthScore = mean(landed.map(s => clamp01((s.depth - 0.4) / 0.9)));
  const widthScore = mean(landed.map(s => clamp01(Math.abs(s.aimX ?? 0) / 0.6)));
  const placement = landed.length ? pct(0.65 * depthScore + 0.35 * widthScore) : (previous ? previous.placement : 0);
  // CONSISTENCY: the share of your shots that landed, weighted by rally length (a long rally means you kept
  // landing under pressure). Missing the table is the amateur's main leak, so this stat moves the most.
  const landRate = shots.filter(s => s.landed !== null).length ? landed.length / shots.filter(s => s.landed !== null).length : 0;
  const rallyBonus = clamp01(tracker.longestRally / 20) * 0.25;
  const consistency = pct(0.75 * landRate + rallyBonus);
  // DEFENCE: points you won after the opponent attacked, plus how often you got a returned ball back at all.
  const attackedPoints = tracker.points.filter(p => p.rally >= 3);
  const wonUnderAttack = attackedPoints.filter(p => p.winner === 'player').length;
  const defence = attackedPoints.length ? pct(0.6 * (wonUnderAttack / attackedPoints.length) + 0.4 * clamp01(tracker.longestRally / 24)) : (previous ? previous.defence : 0);

  const card = { power, spin, placement, consistency, defence, shots: n, updated: Date.now() };
  // Blend with history so one great game does not rewrite the card, but a trend shows within a few games.
  if (previous) {
    const w = 0.4;
    for (const k of ['power', 'spin', 'placement', 'consistency', 'defence']) card[k] = Math.round(previous[k] * (1 - w) + card[k] * w);
    card.shots = previous.shots + n;
  }
  card.overall = Math.round((card.power + card.spin + card.placement + card.consistency + card.defence) / 5);
  card.style = styleLabel(card);
  return card;
}

// A one-line read of the card. What a coach would say after watching you.
export function styleLabel(c) {
  const top = ['power', 'spin', 'placement', 'consistency', 'defence'].sort((a, b) => c[b] - c[a]);
  const lead = top[0], second = top[1];
  if (c.overall < 25) return 'Beginner';
  if (lead === 'power' && second === 'spin') return 'Attacker';
  if (lead === 'power') return 'Hitter';
  if (lead === 'spin') return 'Looper';
  if (lead === 'placement') return 'Tactician';
  if (lead === 'consistency') return 'Wall';
  if (lead === 'defence') return 'Chopper at heart';
  return 'All-rounder';
}

// ---------- bookkeeping after a game ----------
export function recordGame(record, rival, won, score, tracker) {
  const card = computeCard(tracker, record.card);
  const beaten = won && rival && !record.beaten.includes(rival.key);
  if (beaten) record.beaten.push(rival.key);
  const unlockedRacket = beaten ? rival.racket : null;
  const unlockedRival = beaten ? (RIVALS[rivalIndex(rival.key) + 1] || null) : null;
  record.games.unshift({ rival: rival ? rival.key : null, won, score, date: Date.now(), shots: tracker.shots.length, longestRally: tracker.longestRally });
  record.games = record.games.slice(0, 30);
  record.lifetime.games++; if (won) record.lifetime.wins++;
  record.lifetime.shots += tracker.shots.length;
  record.lifetime.points += tracker.points.length;
  record.lifetime.pointsWon += tracker.points.filter(p => p.winner === 'player').length;
  record.lifetime.longestRally = Math.max(record.lifetime.longestRally, tracker.longestRally);
  if (card) record.card = card;
  return { card, unlockedRacket, unlockedRival, firstWin: beaten };
}

export function loadRecord(storage) {
  try {
    const raw = storage && storage.getItem('pingpang.career');
    if (!raw) return emptyRecord();
    const r = JSON.parse(raw);
    if (!r || r.version !== 1) return emptyRecord();
    return { ...emptyRecord(), ...r };
  } catch (e) { return emptyRecord(); }
}
export function saveRecord(storage, record) {
  try { storage && storage.setItem('pingpang.career', JSON.stringify(record)); } catch (e) { /* ignore */ }
}
