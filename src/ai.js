// ai.js — opponent that predicts the ball with the real physics and solves a return shot.
import { Ball, Racket, PARAMS, TABLE, BALL, simulateFlight, spinComponents, v3, add, sub, scale, len, norm, cross, dot } from './physics.js';

export const DIFFICULTY = {
  easy:   { reaction: 0.28, aimNoise: 0.22, moveSpeed: 2.2, power: 0.55, spin: 0.35, missChance: 0.10 },
  medium: { reaction: 0.18, aimNoise: 0.14, moveSpeed: 3.5, power: 0.75, spin: 0.7,  missChance: 0.04 },
  hard:   { reaction: 0.10, aimNoise: 0.07, moveSpeed: 5.5, power: 1.0,  spin: 1.0,  missChance: 0.01, placement: 0.6 },
  pro:    { reaction: 0.07, aimNoise: 0.04, moveSpeed: 7.0, power: 1.15, spin: 1.2,  missChance: 0.004, placement: 1.0 },
};

// Playing styles: where the AI stands and which strokes it reaches for in each situation.
export const STYLES = {
  attacker:   { label: 'Attacker',   depth: 0.28, normal: ['loop', 'loop', 'drive'], short: ['flick', 'flick', 'push'], high: ['smash'], backspin: ['loop', 'push'] },
  controller: { label: 'Controller', depth: 0.22, normal: ['block', 'drive', 'push'], short: ['shortpush', 'push', 'flick'], high: ['drive', 'smash'], backspin: ['push', 'push', 'drive'] },
  chopper:    { label: 'Chopper',    depth: 0.95, normal: ['chop', 'chop', 'chop', 'push'], short: ['push', 'flick'], high: ['smash', 'chop'], backspin: ['push', 'chop'] },
};
// Stroke recipes for the AI: spin (rad/s, + topspin) and speed ranges before difficulty scaling.
const AI_STROKES = {
  loop:      { spin: [220, 430], speed: [7.5, 11.5], label: 'Loop' },
  drive:     { spin: [70, 170],  speed: [7.5, 10.5], label: 'Drive' },
  smash:     { spin: [30, 90],   speed: [12, 16],    label: 'Smash' },
  block:     { spin: [20, 80],   speed: [5.5, 7.5],  label: 'Block' },
  push:      { spin: [-260, -120], speed: [4.8, 6.5], label: 'Push' },
  shortpush: { spin: [-200, -90],  speed: [3.2, 4.3], label: 'Short push', shortTarget: true },
  flick:     { spin: [110, 260], speed: [6.5, 9],    label: 'Flick' },
  chop:      { spin: [-460, -230], speed: [5.5, 8],  label: 'Chop' },
};
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

export class AIPlayer {
  constructor(level = 'medium', rng = Math.random, style = 'attacker') {
    this.setLevel(level);
    this.setStyle(style);
    this.rng = rng;
    this.racket = new Racket(this.rest, v3(0, 0, 1));
    this.target = null;          // predicted intercept {pos, t}
    this.plan = null;            // {vel, normal} the racket should have at contact
    this.timer = 0;              // time since the last prediction
    this.needPrediction = false;
    this.lastEventCount = 0;
    this.rough = null;
    this.clock = 0;            // absolute AI time, so intercept times survive timer resets
    this.bouncedAI = false; this.bounceZ = null;
  }
  setLevel(level) { this.level = level; this.cfg = DIFFICULTY[level] || DIFFICULTY.medium; }
  setStyle(style) {
    this.style = STYLES[style] ? style : 'attacker';
    this.styleCfg = STYLES[this.style];
    this.strikeZ = -(TABLE.length / 2 + this.styleCfg.depth);
    this.rest = v3(0, TABLE.height + 0.25, this.strikeZ);
  }

  // Called by the game when the player hits the ball / the ball bounces so the AI re-predicts.
  notify(kind, ball, info = null) {
    if (kind === 'playerHit') { this.bouncedAI = false; this.bounceZ = null; }
    if (kind === 'bounce') { this.bouncedAI = true; this.bounceZ = info ? info.z : null; }
    if (kind === 'playerHit' || kind === 'bounce') { this.needPrediction = true; this.timer = 0; }
    // A player reads the opponent's swing before the ball arrives: start drifting toward a rough,
    // noisy estimate at once; the precise plan comes after the reaction delay.
    if (kind === 'playerHit' && ball) {
      const p = this.predict(ball);
      this.rough = p ? add(p.pos, v3((this.rng() - 0.5) * 0.4, (this.rng() - 0.5) * 0.2, 0)) : null;
    }
    if (kind === 'reset') { this.rough = null; this.target = null; this.plan = null; this.bouncedAI = false; this.bounceZ = null; }
  }

  // Forward-simulate the ball until it reaches the AI strike plane (moving toward -z). If the ball would drop
  // below table height before reaching that plane (a short ball), step in and take it at the apex after its bounce.
  predict(ball) {
    if (!ball.active || ball.vel.z >= 0) return null;
    const strikeZ = this.strikeZ;
    let bouncedAI = this.bouncedAI, apex = null;
    const res = simulateFlight(ball, PARAMS, {
      maxTime: 2.5,
      dt: 1 / 240,
      stop: (b, t, ev) => {
        if (ev.some(e => e.type === 'bounce' && e.side === 'ai')) bouncedAI = true;
        if (bouncedAI && !apex && b.vel.y <= 0) apex = { pos: { ...b.pos }, vel: { ...b.vel }, spin: { ...b.spin }, t };
        return (b.pos.z <= strikeZ && b.vel.z < 0) || (apex && b.pos.y < TABLE.height + 0.05);
      },
    });
    const aiBounce = res.events.find(e => e.type === 'bounce' && e.side === 'ai');
    const legal = this.bouncedAI || !!aiBounce;
    const bounceZ = aiBounce ? aiBounce.pos.z : this.bounceZ;
    const b = res.ball;
    const reached = b.pos.z <= strikeZ + 0.05 && b.pos.y > TABLE.height - 0.05;
    if (reached) return { pos: b.pos, vel: b.vel, spin: b.spin, t: res.t, legal, events: res.events, bounceZ };
    if (apex && legal) return { pos: apex.pos, vel: apex.vel, spin: apex.spin, t: apex.t, legal, events: res.events, bounceZ, stepIn: true };
    return null;
  }

  // Choose an outgoing velocity+spin that lands on the player's half, then invert the impact to get racket motion.
  planReturn(hit) {
    const cfg = this.cfg, style = this.styleCfg;
    const incomingTop = spinComponents(hit.vel, hit.spin).top;
    const short = hit.bounceZ !== null && hit.bounceZ > -0.6;                 // bounced within 60 cm of the net
    const high = hit.pos.y > TABLE.height + 0.30;
    let key;
    if (high) key = pick(style.high, this.rng);
    else if (short) key = pick(style.short, this.rng);
    else if (incomingTop < -150) key = pick(style.backspin, this.rng);        // a backspin ball: lift it or push it back
    else key = pick(style.normal, this.rng);
    const rec = AI_STROKES[key];
    const lerpR = (r, f) => r[0] + (r[1] - r[0]) * f;
    const wantTop = lerpR(rec.spin, this.rng()) * (0.55 + 0.45 * cfg.spin);
    const speed = lerpR(rec.speed, this.rng()) * (0.7 + 0.3 * cfg.power);

    // landing target on the player half: random, or (skilled AI) away from where the player's racket is
    let tx = (this.rng() - 0.5) * (TABLE.width - 0.35) * (0.5 + 0.5 * cfg.power);
    if (cfg.placement && typeof this.playerX === 'number' && this.rng() < cfg.placement) {
      const away = -Math.sign(this.playerX || (this.rng() - 0.5));
      tx = away * (0.35 + this.rng() * 0.3);
    }
    const tz = rec.shortTarget ? 0.2 + this.rng() * 0.35 : TABLE.length / 2 - 0.35 - this.rng() * 0.6;
    const target = v3(tx, TABLE.height, tz);

    // Search launch elevation angle so that the drag+Magnus trajectory lands near the target.
    const dir = norm(v3(target.x - hit.pos.x, 0, target.z - hit.pos.z));
    const topAxis = cross(v3(0, 1, 0), dir);
    let best = null;
    for (let deg = -12; deg <= 50; deg += 1.5) {
      const el = deg * Math.PI / 180;
      const vel = add(scale(dir, speed * Math.cos(el)), v3(0, speed * Math.sin(el), 0));
      const test = new Ball(); test.pos = hit.pos; test.vel = vel; test.spin = scale(topAxis, wantTop); test.active = true;
      const r = simulateFlight(test, PARAMS, { maxTime: 2, dt: 1 / 120, stop: (b, t, ev) => ev.some(e => e.type === 'bounce' || e.type === 'net' || e.type === 'floor') });
      const ev = r.events[r.events.length - 1];
      if (!ev || ev.type !== 'bounce' || ev.side !== 'player') continue;
      const err = Math.hypot(ev.pos.x - target.x, ev.pos.z - target.z);
      if (!best || err < best.err) best = { err, vel, spin: test.spin };
    }
    if (!best) {
      // fall back: gentle lift over the net
      best = { vel: add(scale(dir, 4), v3(0, 2.2, 0)), spin: scale(topAxis, 60) };
      key = 'block';
    }
    // aim noise (difficulty)
    best.vel = add(best.vel, v3((this.rng() - 0.5) * 2 * cfg.aimNoise * 3.0, (this.rng() - 0.5) * cfg.aimNoise * 1.2, (this.rng() - 0.5) * cfg.aimNoise * 2.0));
    best.stroke = { key, label: `${hit.pos.x < -0.05 ? 'BH' : 'FH'} ${AI_STROKES[key].label}`, ai: true };
    return best;
  }

  // Given desired outgoing (vel, spin) and the incoming ball, compute racket velocity and normal.
  // Approximation: normal along bisector of (−incoming_rel, outgoing_rel); racket speed from the COR relation,
  // tangential racket velocity from the desired spin change (κα/r rule, α≈0.7).
  racketForShot(hit, shot) {
    const e = 0.75;
    const vin = hit.vel, vout = shot.vel;
    // Solve v_R along n: vout·n = vR·n − e (vin·n − vR·n)  =>  vR·n = (vout·n + e vin·n)/(1+e)
    // Pick n as the direction of (vout − vin) (impulse direction) — good for "hitting through" the ball.
    let n = norm(sub(vout, vin));
    if (len(n) < 1e-6) n = v3(0, 0, 1);
    const vRn = (dot(vout, n) + e * dot(vin, n)) / (1 + e);
    // Tangential: desired spin change Δω = ω_out − ω_in ≈ −(κα/r) n × v_T  =>  v_T ≈ (r/(κα)) (n × Δω)
    const kappaAlpha = 1.5 * 0.7;
    const dSpin = sub(shot.spin, hit.spin);
    const vT_ball = scale(cross(n, dSpin), BALL.radius / kappaAlpha);   // ball surface slip we need relative to racket
    // racket tangential velocity = ball tangential velocity − required slip
    const vin_t = sub(vin, scale(n, dot(vin, n)));
    const vR_t = sub(vin_t, vT_ball);
    // limit racket tangential speed to something human
    const maxT = 9;
    const vR_t_lim = len(vR_t) > maxT ? scale(norm(vR_t), maxT) : vR_t;
    const vel = add(scale(n, vRn), vR_t_lim);
    return { vel, normal: n };
  }

  update(dt, ball, gameState) {
    const cfg = this.cfg;
    this.timer += dt; this.clock += dt;
    const rk = this.racket;
    rk.prevPos = { ...rk.pos };

    if (!ball.active || gameState.rallyOver) {
      this.target = null; this.plan = null;
      this.moveTo(this.rest, dt, 2.5);
      rk.normal = v3(0, 0, 1);
      rk.vel = scale(sub(rk.pos, rk.prevPos), 1 / dt);
      return;
    }

    if (this.needPrediction && this.timer >= cfg.reaction) {
      this.needPrediction = false;
      const p = this.predict(ball);
      if (p && p.legal) {
        this.target = { ...p, tAbs: this.clock + p.t };
        // keep the stroke already chosen for this ball (a re-read after the bounce refines position, not intent)
        const shot = this.plan && this.plan.shot && !this.plan.shot.stroke.key.startsWith('serve') && this.plan.forBall === this.bouncedAI
          ? this.plan.shot : this.planReturn(p);
        const rm = this.racketForShot(p, shot);
        this.plan = { ...rm, shot, willMiss: this.plan ? this.plan.willMiss : this.rng() < cfg.missChance, forBall: this.bouncedAI };
        // reading error: where the AI *thinks* the ball will be (shrinks with skill)
        this.plan.offset = v3((this.rng() - 0.5) * cfg.aimNoise * 0.6, (this.rng() - 0.5) * cfg.aimNoise * 0.6, 0);
      } else if (p && !p.legal) {
        this.target = null; this.plan = null;                    // ball will not land legally: let it go
      }
      // p === null: the ball has passed the point where a prediction makes sense; keep the plan we have
    }

    if (this.target && this.plan) {
      const tRem = this.target.tAbs - this.clock;
      const aim = add(this.target.pos, this.plan.offset);
      if (this.plan.willMiss) aim.x += 0.3;
      const swingTime = 0.08;
      const maxSteer = 6 + 6 * cfg.power;                        // m/s the arm can move laterally
      if (tRem > swingTime) {
        // get the racket to a ready position just behind the intercept, arriving early
        const ready = add(aim, v3(0, 0, -0.22));
        const d = sub(ready, rk.pos);
        const need = len(d) / Math.max(0.01, tRem - swingTime);
        this.moveTo(ready, dt, Math.max(cfg.moveSpeed * 2, Math.min(maxSteer, need)));
        rk.normal = v3(0, 0, 1);
      } else if (tRem > -0.15) {
        // swing forward through the intercept while still steering x/y onto it
        // (cosmetic: the contact resolves to the solved shot)
        const fwd = 0.22 / swingTime;
        const steer = v3(aim.x - rk.pos.x, aim.y - rk.pos.y, 0);
        const tt = Math.max(dt, tRem);
        let sv = scale(steer, 1 / tt);
        if (len(sv) > maxSteer) sv = scale(norm(sv), maxSteer);
        const swingV = add(v3(sv.x, sv.y + 0.4, fwd), v3());
        rk.pos = add(rk.pos, scale(swingV, dt));
        rk.normal = norm(v3(-swingV.x * 0.02, -0.1, 1));
      } else {
        this.target = null; this.plan = null;
      }
    } else {
      // while waiting: drift toward the rough read of the incoming ball, otherwise shadow its x
      const REST = this.rest;
      const home = this.rough && ball.vel.z < 0
        ? v3(this.rough.x, Math.min(REST.y + 0.2, Math.max(REST.y - 0.2, this.rough.y)), REST.z - 0.1)
        : v3(ball.pos.x * 0.6, REST.y, REST.z);
      this.moveTo(home, dt, cfg.moveSpeed);
      rk.normal = v3(0, 0, 1);
    }
    rk.vel = scale(sub(rk.pos, rk.prevPos), 1 / dt);
    // keep the racket in a sane box
    rk.pos.y = Math.max(TABLE.height - 0.1, Math.min(TABLE.height + 0.9, rk.pos.y));
    rk.pos.z = Math.min(-TABLE.length / 2 + 0.9, Math.max(-TABLE.length / 2 - 1.6, rk.pos.z));
  }

  moveTo(p, dt, speed) {
    const d = sub(p, this.racket.pos);
    const dist = len(d);
    if (dist < 1e-4) return;
    const step = Math.min(dist, speed * dt);
    this.racket.pos = add(this.racket.pos, scale(d, step / dist));
  }
}

// ---------- serving ----------
// Search a serve (speed, elevation, spin) from `from` that bounces on the AI side, then on the player side.
export function planServe(from, rng = Math.random, cfg = DIFFICULTY.medium) {
  const targetX = (rng() - 0.5) * (TABLE.width - 0.5);
  const targetZ = 0.35 + rng() * 0.75;                          // player half, mid-depth
  const dir = norm(v3(targetX - from.x, 0, targetZ - from.z));
  const topAxis = cross(v3(0, 1, 0), dir);
  const kind = rng();
  const spinMag = (60 + 240 * cfg.spin * rng());
  let spin, label;
  if (kind < 0.45) { spin = scale(topAxis, -spinMag); label = 'Backspin serve'; }
  else if (kind < 0.75) { spin = scale(topAxis, spinMag * 0.6); label = 'Topspin serve'; }
  else { spin = add(scale(v3(0, 1, 0), spinMag * (rng() < 0.5 ? 1 : -1)), scale(topAxis, -spinMag * 0.3)); label = 'Sidespin serve'; }
  const stroke = { key: 'serve', label: 'FH ' + label, ai: true };
  let best = null;
  for (let speed = 3; speed <= 7.5; speed += 0.5) {
    for (let deg = -20; deg <= 25; deg += 2.5) {
      const el = deg * Math.PI / 180;
      const vel = add(scale(dir, speed * Math.cos(el)), v3(0, speed * Math.sin(el), 0));
      const test = new Ball(); test.pos = from; test.vel = vel; test.spin = spin; test.active = true;
      let nb = 0;
      const r = simulateFlight(test, PARAMS, {
        maxTime: 2, dt: 1 / 120,
        stop: (b, t, ev) => {
          nb += ev.filter(e => e.type === 'bounce').length;
          return nb >= 2 || ev.some(e => e.type === 'net' || e.type === 'floor' || e.type === 'side');
        },
      });
      const bounces = r.events.filter(e => e.type === 'bounce');
      const bad = r.events.some(e => e.type === 'net' || e.type === 'side' || e.type === 'floor');
      if (bounces.length < 2 || bounces[0].side !== 'ai' || bounces[1].side !== 'player') continue;
      if (bad && r.events.findIndex(e => e.type !== 'bounce') < r.events.indexOf(bounces[1])) continue;
      const err = Math.hypot(bounces[1].pos.x - targetX, bounces[1].pos.z - targetZ);
      if (!best || err < best.err) best = { err, vel, spin, stroke };
    }
  }
  return best || { vel: add(scale(dir, 4), v3(0, 1.5, 0)), spin: v3(), stroke: { key: 'serve', label: 'FH Flat serve', ai: true } };
}

// ---------- shot assist for the human player ----------
// Find the legal shot (lands on the far half; for a serve, own half first) whose launch velocity is CLOSEST to the
// player's raw velocity, keeping their spin. Candidates vary elevation, speed and a little yaw.
// Returns { vel, correction } or null if nothing legal exists nearby.
export function solveAssist(pos, vel, spin, { serve = false } = {}) {
  const speed0 = len(vel);
  if (speed0 < 1) return null;
  const horiz = norm(v3(vel.x, 0, vel.z));
  if (horiz.z >= 0) return null;                                 // not going toward the opponent
  const yaw0 = Math.atan2(horiz.x, -horiz.z);
  const margin = 0.12;                                           // stay this far inside the lines
  let best = null;
  const tryYaws = (yaws) => {
    for (const mult of [1, 0.92, 1.08, 0.84, 1.18, 0.75, 1.3, 0.65, 1.45]) {
      const speed = speed0 * mult;
      for (const dyaw of yaws) {
        const yaw = yaw0 + dyaw;
        const dir = v3(Math.sin(yaw), 0, -Math.cos(yaw));
        for (let deg = -30; deg <= 75; deg += 2) {
          const el = deg * Math.PI / 180;
          const v = add(scale(dir, speed * Math.cos(el)), v3(0, speed * Math.sin(el), 0));
          const d = len(sub(v, vel));
          if (best && d >= best.correction) continue;               // cannot beat the current best
          const test = new Ball(); test.pos = pos; test.vel = v; test.spin = spin; test.active = true;
          let nb = 0;
          const r = simulateFlight(test, PARAMS, {
            maxTime: 2.5, dt: 1 / 120,
            stop: (b, t, ev) => { nb += ev.filter(e => e.type === 'bounce').length; return nb >= (serve ? 2 : 1) || ev.some(e => e.type === 'net' || e.type === 'floor' || e.type === 'side'); },
          });
          if (r.events.some(e => e.type === 'net' || e.type === 'side')) continue;
          const bounces = r.events.filter(e => e.type === 'bounce');
          if (serve) {
            if (bounces.length < 2 || bounces[0].side !== 'player' || bounces[1].side !== 'ai') continue;
          } else if (bounces.length < 1 || bounces[0].side !== 'ai') continue;
          const land = bounces[bounces.length - 1].pos;
          if (Math.abs(land.x) > TABLE.width / 2 - margin || -land.z < 0.15 || -land.z > TABLE.length / 2 - margin) continue;
          best = { vel: v, correction: d };
        }
      }
      if (best && best.correction < 0.6) return;                    // good enough, stop searching
    }
  };
  tryYaws([0]);
  if (!best) tryYaws([-0.1, 0.1, -0.22, 0.22, -0.35, 0.35]);
  return best;
}
