// physics.js — dependency-free table-tennis ball physics.
// Units: SI (m, kg, s, rad/s). World: y up, table centre at origin,
// table length along z (player side is +z, opponent side is -z).

export const TABLE = {
  length: 2.74,
  width: 1.525,
  height: 0.76,        // top surface above floor
  thickness: 0.03,
  netHeight: 0.1525,
  netOverhang: 0.1525, // net extends past each side of the table
};

export const BALL = {
  radius: 0.02,        // 40 mm ball
  mass: 0.0027,        // 2.7 g
};

// Tunable physical parameters (exposed in the debug GUI).
export const PARAMS = {
  gravity: 9.81,
  airDensity: 1.204,        // kg/m^3 at 20 °C
  dragCd: 0.40,             // drag coefficient of a smooth sphere at Re ~ 1e4..1e5
  magnusScale: 1.0,         // multiplies the lift coefficient Cl(S)
  spinDecay: 0.05,          // 1/s exponential spin decay in flight (small)
  tableCOR: 0.98,           // e_n = tableCOR - tableCORSlope*|v_n|  (Conti et al. 2026: 0.98 - 0.02|v|)
  tableCORSlope: 0.02,      //   => 0.88 at 5 m/s, 0.78 at 10 m/s (shell buckling)
  tableFriction: 0.25,      // ball/table sliding friction coefficient
  racketCOR: 0.878,         // e = racketCOR - racketCORSlope*|v_n|  (0.878 - 0.020|v|)
  racketCORSlope: 0.020,
  racketFriction: 1.1,      // tacky inverted rubber (measured 1.0–2.0): near-full grip
  racketTangentialCOR: 0.8, // tangential restitution of the rubber e_t (0.819 - 0.010|v_T|): "over-grip", spin reversal
  racketTangentialSlope: 0.010,
  netCOR: 0.2,
  floorCOR: 0.75,
};

// ---------- minimal vec3 helpers (plain objects) ----------
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const norm = (a) => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : v3(); };
export const copy = (a) => v3(a.x, a.y, a.z);
export const lerp = (a, b, t) => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export class Ball {
  constructor() {
    this.pos = v3(0, TABLE.height + 0.3, 0);
    this.vel = v3();
    this.spin = v3();     // angular velocity vector, rad/s
    this.active = false;  // false = not in play (hidden)
  }
  clone() {
    const b = new Ball();
    b.pos = copy(this.pos); b.vel = copy(this.vel); b.spin = copy(this.spin); b.active = this.active;
    return b;
  }
}

export class Racket {
  constructor(pos, normal) {
    this.pos = copy(pos);
    this.prevPos = copy(pos);
    this.vel = v3();
    this.normal = norm(normal);
    this.radius = 0.08;      // playing surface radius (blade ~15 x 16 cm)
    this.thickness = 0.014;
  }
}

// ---------- aerodynamics ----------
// a = g + drag + Magnus
//   drag:   F_d = -1/2 ρ Cd A |v| v
//   Magnus: F_m =  1/2 ρ Cl A |v|^2 (ω̂ × v̂),  Cl = magnusScale * S/(2S+1),  S = r|ω|/|v|
export function aeroAccel(vel, spin, P = PARAMS) {
  const r = BALL.radius, m = BALL.mass, A = Math.PI * r * r, rho = P.airDensity;
  const speed = len(vel);
  let a = v3(0, -P.gravity, 0);
  if (speed < 1e-6) return a;
  const kd = 0.5 * rho * P.dragCd * A / m;
  a = add(a, scale(vel, -kd * speed));
  const w = len(spin);
  if (w > 1e-6) {
    const S = r * w / speed;
    const Cl = P.magnusScale * S / (2 * S + 1);
    const dir = cross(scale(spin, 1 / w), scale(vel, 1 / speed)); // |dir| = sin(angle)
    const Fm = 0.5 * rho * A * Cl * speed * speed;
    a = add(a, scale(dir, Fm / m));
  }
  return a;
}

export function integrate(ball, dt, P = PARAMS) {
  // semi-implicit Euler; dt is small (<= 1/300 s) so this is plenty accurate
  const a = aeroAccel(ball.vel, ball.spin, P);
  ball.vel = add(ball.vel, scale(a, dt));
  ball.pos = add(ball.pos, scale(ball.vel, dt));
  if (P.spinDecay > 0) ball.spin = scale(ball.spin, Math.exp(-P.spinDecay * dt));
}

// ---------- impulse-based impact with a surface ----------
// n: unit normal pointing from the surface toward the ball.
// surfVel: velocity of the surface at the contact point.
// e: normal COR, mu: friction coefficient, et: tangential COR (0 = pure grip, no rebound).
// The ball is modelled as a thin hollow shell: I = 2/3 m r^2, so the impulse that
// stops sliding is J = |u| m / (1 + m r^2 / I) = 0.4 m |u|.
export function impactBall(ball, n, surfVel, e, mu, et = 0) {
  const m = BALL.mass, r = BALL.radius;
  const vrel = sub(ball.vel, surfVel);
  const vn = dot(vrel, n);
  if (vn >= 0) return null; // separating, no impact
  const rc = scale(n, -r);                             // contact point relative to centre
  const surf = add(vrel, cross(ball.spin, rc));        // relative velocity of ball surface at contact
  const u = sub(surf, scale(n, dot(surf, n)));         // tangential slip velocity
  const Jn = -(1 + e) * vn * m;
  let vel = add(ball.vel, scale(n, -(1 + e) * vn));
  let spin = ball.spin;
  const ul = len(u);
  let slid = false;
  if (ul > 1e-6) {
    const Jgrip = (1 + et) * ul * m * 0.4;
    const Jslide = mu * Jn;
    slid = Jslide < Jgrip;
    const Jt = slid ? Jslide : Jgrip;
    const J = scale(u, -Jt / ul);
    vel = add(vel, scale(J, 1 / m));
    const I = (2 / 3) * m * r * r;
    spin = add(spin, scale(cross(rc, J), 1 / I));
  }
  ball.vel = vel;
  ball.spin = spin;
  return { Jn, slid, slip: ul };
}

// ---------- one physics step: flight + table/net/floor collisions ----------
// Pushes events: {type:'bounce', side:'player'|'ai'}, {type:'net'}, {type:'side'}, {type:'floor'}, {type:'out'}
export function stepBall(ball, dt, P = PARAMS, events = []) {
  const prev = copy(ball.pos);
  integrate(ball, dt, P);
  const r = BALL.radius, top = TABLE.height, hl = TABLE.length / 2, hw = TABLE.width / 2;
  const p = ball.pos;

  // --- table top (edge balls count: centre inside the footprint) ---
  if (ball.vel.y < 0 && p.y - r < top && prev.y - r >= top - 0.002 &&
      Math.abs(p.x) <= hw && Math.abs(p.z) <= hl) {
    p.y = top + r;
    const e = Math.max(0.5, P.tableCOR - P.tableCORSlope * Math.abs(ball.vel.y));
    const res = impactBall(ball, v3(0, 1, 0), v3(), e, P.tableFriction, 0);
    events.push({ type: 'bounce', side: p.z > 0 ? 'player' : 'ai', pos: copy(p), slid: res ? res.slid : false });
  }
  // --- table side faces (ball below the top but inside the slab footprint) ---
  else if (p.y - r < top && p.y + r > top - TABLE.thickness &&
           Math.abs(p.x) < hw + r && Math.abs(p.z) < hl + r &&
           (Math.abs(prev.x) >= hw + r || Math.abs(prev.z) >= hl + r)) {
    const penX = hw + r - Math.abs(p.x), penZ = hl + r - Math.abs(p.z);
    if (penZ < penX) { ball.vel.z = -ball.vel.z * 0.5; p.z = Math.sign(p.z) * (hl + r + 1e-3); }
    else { ball.vel.x = -ball.vel.x * 0.5; p.x = Math.sign(p.x) * (hw + r + 1e-3); }
    events.push({ type: 'side', pos: copy(p) });
  }

  // --- net (vertical plane z = 0) ---
  const crossed = (prev.z > 0) !== (p.z > 0);
  if (crossed && p.y - r < top + TABLE.netHeight && Math.abs(p.x) < hw + TABLE.netOverhang) {
    const sideSign = prev.z > 0 ? 1 : -1;
    if (p.y > top + TABLE.netHeight - 0.012) {
      // clipped the top band: ball trickles over, losing most of its energy
      ball.vel.z *= 0.45; ball.vel.x *= 0.7; ball.vel.y = Math.abs(ball.vel.y) * 0.3 + 0.4;
      ball.spin = scale(ball.spin, 0.5);
      events.push({ type: 'net', clip: true, pos: copy(p) });
    } else {
      p.z = sideSign * (r * 0.9);
      ball.vel.z = -ball.vel.z * P.netCOR; ball.vel.x *= 0.6; ball.vel.y *= 0.4;
      ball.spin = scale(ball.spin, 0.4);
      events.push({ type: 'net', clip: false, pos: copy(p) });
    }
  }

  // --- floor ---
  if (p.y - r < 0 && ball.vel.y < 0) {
    p.y = r;
    impactBall(ball, v3(0, 1, 0), v3(), P.floorCOR, 0.3, 0);
    events.push({ type: 'floor', pos: copy(p) });
  }
  // --- far away ---
  if (Math.abs(p.x) > 5 || Math.abs(p.z) > 7 || p.y > 10) events.push({ type: 'out', pos: copy(p) });
  return events;
}

// Apply a rubber impact to `ball` (mutates it). n = unit normal from the rubber toward the ball.
// `S` (optional) is a racket SURFACE: {cor, grip, tangential, slope}. It overrides only the three contact
// constants, so a racket changes the feel of the hit and nothing else — flight, bounce and the net are untouched.
// Surfaces are passed in per contact rather than written into PARAMS, so a racket can never leak into the ball's
// flight through some other code path.
export function racketImpact(ball, n, racketVel, P = PARAMS, S = null) {
  const vrel = sub(ball.vel, racketVel);
  const vn = Math.abs(dot(vrel, n));
  const vt = len(sub(vrel, scale(n, dot(vrel, n))));
  const cor = S && S.cor != null ? S.cor : P.racketCOR;
  const grip = S && S.grip != null ? S.grip : P.racketFriction;
  const tan = S && S.tangential != null ? S.tangential : P.racketTangentialCOR;
  const corSlope = S && S.slope != null ? S.slope : P.racketCORSlope;
  const e = Math.max(0.4, cor - corSlope * vn);
  // A slippery surface lets go of the spin sooner: the tangential restitution decays with slip speed.
  const et = Math.max(0, tan - P.racketTangentialSlope * vt);
  return impactBall(ball, n, racketVel, e, grip, et);
}
// Preview of a rubber impact: returns the outgoing {vel, spin} without touching the ball, or null if separating.
export function previewRacketImpact(vel, spin, n, racketVel, P = PARAMS, S = null) {
  const b = new Ball(); b.vel = copy(vel); b.spin = copy(spin);
  const res = racketImpact(b, n, racketVel, P, S);
  return res ? { vel: b.vel, spin: b.spin } : null;
}

// ---------- ball vs racket (swept disc test) ----------
// racket.prevPos / racket.pos bracket the racket motion during this step, prevBallPos / ball.pos the ball's.
// refine (optional): called with the ball in its pre-impact state at the contact point; returns { normal, vel } for
// the racket at that instant (a hand's last-moment adjustment) or null to keep the racket's current face.
export function collideRacket(ball, prevBallPos, racket, P = PARAMS, refine = null, surface = null) {
  const r = BALL.radius;
  const half = r + racket.thickness / 2;
  const d0 = dot(sub(prevBallPos, racket.prevPos), racket.normal);
  const d1 = dot(sub(ball.pos, racket.pos), racket.normal);
  const side = d0 >= 0 ? 1 : -1;
  const n = scale(racket.normal, side);
  const dist0 = d0 * side, dist1 = d1 * side;
  if (!(dist0 > half - 1e-4 && dist1 <= half)) return null;
  // point where the ball crossed the contact plane
  const t = Math.min(1, Math.max(0, (dist0 - half) / Math.max(1e-9, dist0 - dist1)));
  const pc = lerp(prevBallPos, ball.pos, t);
  const rel = sub(pc, racket.pos);
  const inplane = sub(rel, scale(racket.normal, dot(rel, racket.normal)));
  if (len(inplane) > racket.radius + r) return null;   // missed the blade (rim contact still counts)
  ball.pos = add(racket.pos, add(inplane, scale(n, half + 1e-4)));
  let nImpact = n, vImpact = racket.vel;
  if (refine) {
    const r = refine(ball);
    if (r && r.normal) {
      const nr = norm(r.normal);
      const side2 = dot(sub(prevBallPos, racket.prevPos), nr) >= 0 ? 1 : -1;
      nImpact = scale(nr, side2);
      if (r.vel) vImpact = r.vel;
      racket.normal = nr;
    }
  }
  const res = racketImpact(ball, nImpact, vImpact, P, surface);
  if (!res) return null;
  return { type: 'racket', pos: copy(ball.pos), speed: len(ball.vel), spin: len(ball.spin), racketSpeed: len(racket.vel), slid: res.slid };
}

// ---------- forward simulation (used by the AI and the trajectory preview) ----------
export function simulateFlight(ball, P = PARAMS, { maxTime = 3, dt = 1 / 300, stop = null, trace = null } = {}) {
  const b = ball.clone();
  const events = [];
  let t = 0;
  while (t < maxTime) {
    const ev = [];
    stepBall(b, dt, P, ev);
    t += dt;
    for (const e of ev) { e.t = t; events.push(e); }
    if (trace) trace.push({ t, pos: copy(b.pos), vel: copy(b.vel) });
    if (stop && stop(b, t, ev)) break;
    if (ev.some(e => e.type === 'floor' || e.type === 'out')) break;
  }
  return { ball: b, events, t };
}

// Decompose spin relative to the horizontal travel direction.
// top > 0 : topspin, top < 0 : backspin ; side : sidespin about the vertical axis.
export function spinComponents(vel, spin) {
  const d = norm(v3(vel.x, 0, vel.z));
  const up = v3(0, 1, 0);
  const topAxis = cross(up, d);
  return { top: dot(spin, topAxis), side: dot(spin, up), rpm: len(spin) * 60 / (2 * Math.PI) };
}
