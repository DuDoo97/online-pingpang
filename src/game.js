// game.js — match rules and the fixed-step simulation loop (headless: no rendering here).
import { Ball, Racket, PARAMS, TABLE, BALL, stepBall, collideRacket, spinComponents, v3, add, sub, scale, len, lerp, norm } from './physics.js';
import { AIPlayer, planServe, solveAssist } from './ai.js';

const other = (s) => (s === 'player' ? 'ai' : 'player');

export class Match {
  constructor({ level = 'medium', style = 'attacker', onEvent = () => {}, rng = Math.random } = {}) {
    this.onEvent = onEvent;
    this.rng = rng;
    this.ball = new Ball();
    this.player = new Racket(v3(0, TABLE.height + 0.25, TABLE.length / 2 + 0.35), v3(0, 0, -1));
    this.ai = new AIPlayer(level, rng, style);
    this.assist = 0.6;          // 0 = raw physics, 1 = every hit is steered onto the table
    this.timeScale = 1;
    this.physicsHz = 360;
    this.reset();
  }

  reset() {
    this.score = { player: 0, ai: 0 };
    this.server = 'player';
    this.pointsPlayed = 0;
    this.state = 'idle';        // idle | serve | rally | point | gameover
    this.stateTime = 0;
    this.rally = 0;
    this.longestRally = 0;
    this.ball.active = false;
    this.lastShot = null;
    this.message = 'Click or press Space to toss the serve';
    this.startPoint();
  }

  startPoint() {
    this.state = 'serve';
    this.stateTime = 0;
    this.lastHitter = null;
    this.bounces = [];
    this.servePhase = true;
    this.serveNet = false;
    this.rally = 0;
    this.shots = 0;            // hits so far this point: 0 = next hit is the serve, 1 = next hit is the receive
    this.cooldown = { player: 0, ai: 0 };
    this.ball.active = false;
    this.ball.vel = v3(); this.ball.spin = v3();
    this.stuckTime = 0;
    this.ai.notify('reset');
    if (this.server === 'ai') this.message = 'Opponent to serve';
    else this.message = 'Your serve — click or press Space to toss, then swing';
    this.onEvent({ type: 'state', state: this.state, server: this.server });
  }

  // human toss: the ball goes up in front of the racket and falls back into it
  toss() {
    if (this.state !== 'serve' || this.server !== 'player' || this.ball.active) return false;
    const p = this.player.pos;
    this.ball.pos = v3(p.x, p.y + 0.02, p.z - 0.07);   // 7 cm in front of the face: a short forward stroke meets it
    this.ball.vel = v3(0, 2.1, 0);            // straight up ~22 cm (ITTF minimum is 16 cm), falls back in front of the racket
    this.ball.spin = v3();
    this.ball.active = true;
    this.cooldown.player = 0.25;   // let the ball rise clear of the racket before a hit can register
    this.state = 'rally';
    this.stateTime = 0;
    this.message = '';
    this.onEvent({ type: 'toss' });
    return true;
  }

  aiServe() {
    const rk = this.ai.racket;
    const from = v3(rk.pos.x, TABLE.height + 0.30, -TABLE.length / 2 - 0.15);
    this.ai.racket.pos = { ...from };
    const s = planServe(from, this.rng, this.ai.cfg);
    this.ball.pos = from; this.ball.vel = s.vel; this.ball.spin = s.spin; this.ball.active = true;
    this.lastHitter = 'ai'; this.bounces = []; this.servePhase = true;
    this.state = 'rally'; this.stateTime = 0; this.message = '';
    this.recordShot('ai', from, s.stroke || null);
    this.onEvent({ type: 'racket', who: 'ai', pos: from, speed: len(s.vel) });
  }

  recordShot(who, pos, stroke = null) {
    const sc = spinComponents(this.ball.vel, this.ball.spin);
    let kind = 'flat';
    const a = Math.abs(sc.top), b = Math.abs(sc.side);
    if (Math.max(a, b) > 60) kind = a >= b ? (sc.top > 0 ? 'topspin' : 'backspin') : 'sidespin';
    const receive = this.shots === 1;
    this.shots++;
    this.lastShot = { who, speed: len(this.ball.vel), rpm: sc.rpm, kind, pos, stroke, receive };
    this.onEvent({ type: 'shot', ...this.lastShot });
  }

  awardPoint(winner, reason) {
    if (this.state !== 'rally') return;
    this.score[winner]++;
    this.pointsPlayed++;
    this.longestRally = Math.max(this.longestRally, this.rally);
    this.state = 'point'; this.stateTime = 0;
    this.message = (winner === 'player' ? 'Your point' : 'Opponent\'s point') + ' — ' + reason;
    this.onEvent({ type: 'point', winner, reason });
    const { player: a, ai: b } = this.score;
    if ((a >= 11 || b >= 11) && Math.abs(a - b) >= 2) {
      this.state = 'gameover';
      this.message = (a > b ? 'You win the game ' : 'Opponent wins the game ') + `${a}–${b}. Click to play again.`;
      this.onEvent({ type: 'gameover', winner: a > b ? 'player' : 'ai' });
      return;
    }
    // service changes every 2 points, every point from 10-10
    const every = (a >= 10 && b >= 10) ? 1 : 2;
    if (this.pointsPlayed % every === 0) this.server = other(this.server);
  }

  letBall(reason) {
    this.state = 'point'; this.stateTime = 0;
    this.message = 'Let — ' + reason;
    this.onEvent({ type: 'let' });
  }

  // ---- rule handling for physics events ----
  handleBounce(side, ev) {
    if (!this.lastHitter) { this.awardPoint('ai', 'you missed the toss'); return; }
    const hitter = this.lastHitter, opp = other(hitter);
    if (this.servePhase && this.bounces.length === 0) {
      if (side !== hitter) { this.awardPoint(opp, hitter === 'player' ? 'serve must bounce on your side first' : 'service fault'); return; }
      this.bounces.push(side);
      this.onEvent({ type: 'bounce', side, ev });
      return;
    }
    if (side === hitter) {
      this.awardPoint(opp, hitter === 'player' ? 'your ball did not cross the net' : 'opponent\'s ball did not cross');
      return;
    }
    // ball on the opponent's side
    if (this.bounces.includes(opp)) {
      this.awardPoint(hitter, opp === 'player' ? 'you let it bounce twice' : 'opponent let it bounce twice');
      return;
    }
    if (this.servePhase && this.serveNet) { this.letBall('serve touched the net'); return; }
    this.bounces.push(side);
    this.servePhase = false;
    if (side === 'ai') this.ai.notify('bounce', this.ball, ev.pos);
    this.onEvent({ type: 'bounce', side, ev });
  }

  handleFloorOrOut() {
    const hitter = this.lastHitter;
    if (!hitter) { this.awardPoint('ai', 'you missed the toss'); return; }
    const opp = other(hitter);
    if (this.bounces.includes(opp)) this.awardPoint(hitter, opp === 'player' ? 'you missed the return' : 'opponent missed');
    else this.awardPoint(opp, hitter === 'player' ? 'your ball missed the table' : 'opponent missed the table');
  }

  handleRacket(who, hit) {
    const hl = TABLE.length / 2;
    if (this.lastHitter === who && !(this.servePhase && this.bounces.length === 0 && who === 'player' && this.rally === 0)) {
      this.awardPoint(other(who), who === 'player' ? 'you hit the ball twice' : 'opponent hit twice');
      return;
    }
    if (this.lastHitter && this.lastHitter !== who) {
      const bouncedMine = this.bounces.includes(who);
      const beyondEnd = Math.abs(hit.pos.z) > hl + BALL.radius;
      if (!bouncedMine && !beyondEnd) {
        this.awardPoint(other(who), who === 'player' ? 'volley: let it bounce first' : 'opponent volleyed');
        return;
      }
      this.rally++;
    }
    const isServe = !this.lastHitter;
    this.lastHitter = who;
    this.bounces = [];
    this.servePhase = isServe;
    this.serveNet = false;
    if (who === 'player' && this.assist > 0) {
      // Assist = a correction budget. The closest legal shot is used in full when it is within budget;
      // otherwise the ball only gets pulled part of the way and will probably miss (that is the skill part).
      const solved = solveAssist(this.ball.pos, this.ball.vel, this.ball.spin, { serve: isServe });
      if (solved) {
        const budget = this.assist * this.assist * 12;              // m/s of allowed velocity correction (60% -> 4.3 m/s)
        const f = solved.correction <= budget ? 1 : budget / solved.correction;
        this.ball.vel = lerp(this.ball.vel, solved.vel, f);
        this.lastAssist = { correction: solved.correction, applied: f };
      } else this.lastAssist = { correction: Infinity, applied: 0 };
    }
    if (who === 'ai' && this.ai.plan && this.ai.plan.shot && !this.ai.plan.willMiss) {
      // The AI's racket swing is cosmetic: its contact resolves to the shot it solved with the real flight physics
      // (aim noise and miss chance by difficulty were already applied when the plan was made).
      this.ball.vel = { ...this.ai.plan.shot.vel };
      this.ball.spin = { ...this.ai.plan.shot.spin };
    }
    if (who === 'player') this.ai.notify('playerHit', this.ball);
    const stroke = who === 'player' ? (this.playerStroke || null) : (this.ai.plan && this.ai.plan.shot ? this.ai.plan.shot.stroke || null : null);
    this.recordShot(who, hit.pos, stroke);
    this.onEvent({ type: 'racket', who, pos: hit.pos, speed: len(this.ball.vel) });
  }

  // ---- main update: dt in real seconds; playerFrame = {prev, pos, vel, normal} for this frame ----
  update(dtReal, playerFrame) {
    const dt = dtReal * this.timeScale;
    this.playerStroke = playerFrame.stroke || null;
    this.stateTime += dt;
    if (this.state === 'point' && this.stateTime > 1.8) { this.startPoint(); }
    if (this.state === 'serve' && this.server === 'ai' && this.stateTime > 1.2) this.aiServe();

    const h = 1 / this.physicsHz;
    const n = Math.max(1, Math.min(64, Math.round(dt / h)));
    const hs = dt / n;
    for (let i = 0; i < n; i++) {
      // player racket swept over the frame
      this.player.prevPos = lerp(playerFrame.prev, playerFrame.pos, i / n);
      this.player.pos = lerp(playerFrame.prev, playerFrame.pos, (i + 1) / n);
      this.player.vel = playerFrame.vel;
      this.player.normal = playerFrame.normal;
      this.ai.update(hs, this.ball, { rallyOver: this.state !== 'rally' });
      this.cooldown.player = Math.max(0, this.cooldown.player - hs);
      this.cooldown.ai = Math.max(0, this.cooldown.ai - hs);
      if (!this.ball.active) continue;

      const prev = { ...this.ball.pos };
      const events = [];
      stepBall(this.ball, hs, PARAMS, events);
      if (this.state === 'rally') {
        for (const ev of events) {
          if (this.state !== 'rally') break;
          if (ev.type === 'bounce') this.handleBounce(ev.side, ev);
          else if (ev.type === 'net') { this.onEvent(ev); if (this.servePhase && this.bounces.length === 1) this.serveNet = true; }
          else if (ev.type === 'floor' || ev.type === 'out') { this.onEvent(ev); this.handleFloorOrOut(); }
          else if (ev.type === 'side') this.onEvent(ev);
        }
      } else {
        for (const ev of events) if (ev.type === 'bounce' || ev.type === 'floor' || ev.type === 'net') this.onEvent(ev);
        if (events.some(e => e.type === 'out')) this.ball.active = false;
      }
      if (this.state !== 'rally') continue;

      if (this.cooldown.player <= 0) {
        const hit = collideRacket(this.ball, prev, this.player, PARAMS);
        if (hit) { this.cooldown.player = 0.08; this.handleRacket('player', hit); continue; }
      }
      if (this.cooldown.ai <= 0 && this.ball.vel.z < 0) {
        const hit = collideRacket(this.ball, prev, this.ai.racket, PARAMS);
        if (hit) { this.cooldown.ai = 0.08; this.handleRacket('ai', hit); continue; }
      }
      // ball died on the table
      if (len(this.ball.vel) < 0.15 && this.ball.pos.y < TABLE.height + 0.05) {
        this.stuckTime += hs;
        if (this.stuckTime > 0.6) this.handleFloorOrOut();
      } else this.stuckTime = 0;
    }
  }

  restartIfOver() {
    if (this.state === 'gameover') { this.reset(); return true; }
    return false;
  }
}
