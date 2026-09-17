// Headless checks of the physics against published table-tennis numbers.
import { Ball, Racket, PARAMS, TABLE, BALL, stepBall, simulateFlight, collideRacket, impactBall, v3, len, spinComponents, aeroAccel } from '../src/physics.js';

let fails = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '   (' + detail + ')' : ''}`);
  if (!cond) fails++;
}
const dt = 1 / 600;

// 1. ITTF drop test: 30.5 cm drop onto the table should rebound 24-26 cm
{
  const b = new Ball(); b.pos = v3(0.3, TABLE.height + 0.305 + BALL.radius, 0.5); b.vel = v3(); b.active = true;
  let bounced = false, apex = 0;
  for (let t = 0; t < 2; t += dt) {
    const ev = stepBall(b, dt, PARAMS);
    if (ev.some(e => e.type === 'bounce')) bounced = true;
    if (bounced) apex = Math.max(apex, b.pos.y - BALL.radius - TABLE.height);
    if (bounced && b.vel.y < 0 && apex > 0.05) break;
  }
  check('ITTF drop test rebound 0.24-0.26 m', apex > 0.23 && apex < 0.27, `rebound=${(apex * 100).toFixed(1)} cm`);
}

// 2. Terminal velocity ≈ 8-9 m/s
{
  const b = new Ball(); b.pos = v3(0, 50, 0); b.vel = v3(); b.active = true;
  for (let t = 0; t < 8; t += dt) { const a = aeroAccel(b.vel, b.spin); b.vel.y += a.y * dt; }
  check('terminal velocity 8-9.5 m/s', -b.vel.y > 8 && -b.vel.y < 9.5, `${(-b.vel.y).toFixed(2)} m/s`);
}

// 3. Drag: a 20 m/s ball halves its speed over roughly 4.5-6 m of level flight
{
  const b = new Ball(); b.pos = v3(0, 5, 0); b.vel = v3(0, 0, -20); b.active = true;
  const P = { ...PARAMS, gravity: 0 };
  let dist = 0;
  while (len(b.vel) > 10) { const a = aeroAccel(b.vel, b.spin, P); b.vel.z += a.z * dt; dist += -b.vel.z * dt; }
  check('speed halves within 4-6.5 m', dist > 4 && dist < 6.5, `${dist.toFixed(2)} m`);
}

// 4. Magnus: topspin ball dips relative to a no-spin ball; backspin floats
{
  const launch = (spinX) => {
    const b = new Ball(); b.pos = v3(0, TABLE.height + 0.3, 1.3); b.vel = v3(0, 1.5, -12); b.spin = v3(spinX, 0, 0); b.active = true;
    // moving toward -z: topspin axis is +x (ω × v points down: (+x)×(-z) = (0,-1,0)? check: x×(-z) = -(x×z) = -(-y) = +y ... )
    const r = simulateFlight(b, PARAMS, { stop: (bb) => bb.pos.z < -1.0 });
    return r.ball.pos.y;
  };
  const noSpin = launch(0), a = launch(400), bnd = launch(-400);
  const top = a < noSpin ? a : bnd, back = a < noSpin ? bnd : a;
  check('topspin dips, backspin floats (Magnus sign split)', top < noSpin && back > noSpin, `y0=${noSpin.toFixed(3)} dip=${top.toFixed(3)} float=${back.toFixed(3)}`);
  const sc = spinComponents(v3(0, 0, -12), v3(a < noSpin ? 400 : -400, 0, 0));
  check('spinComponents reports the dipping ball as topspin (>0)', sc.top > 0, `top=${sc.top.toFixed(0)} rad/s`);
}

// 5. Bounce: topspin gains forward speed and loses spin; backspin loses forward speed
{
  const bounce = (top) => {
    const vel = v3(0, 0, -8);
    const sc = spinComponents(vel, v3(1, 0, 0));       // find which x-sign is topspin for -z travel
    const axis = sc.top > 0 ? 1 : -1;
    const b = new Ball(); b.pos = v3(0, TABLE.height + BALL.radius + 0.001, 0.5); b.vel = v3(0, -6, -4); b.spin = v3(axis * top, 0, 0); b.active = true;
    stepBall(b, dt, PARAMS);
    return { vz: -b.vel.z, spin: spinComponents(b.vel, b.spin).top };
  };
  const ts = bounce(650), ns = bounce(0), bs = bounce(-650);
  check('topspin bounce speeds the ball up', ts.vz > ns.vz && ts.vz > 4, `topspin vz=${ts.vz.toFixed(2)} nospin vz=${ns.vz.toFixed(2)}`);
  check('topspin loses spin on bounce (Kamijima ~-22%)', ts.spin < 620 && ts.spin > 350, `spin ${ts.spin.toFixed(0)} rad/s`);
  check('backspin bounce slows the ball', bs.vz < ns.vz, `backspin vz=${bs.vz.toFixed(2)}`);
  check('no-spin ball picks up topspin on bounce', ns.spin > 50, `${ns.spin.toFixed(0)} rad/s`);
}

// 6. Heavy backspin at a shallow angle can bounce back toward the net
{
  const sc = spinComponents(v3(0, 0, -3), v3(1, 0, 0)); const axis = sc.top > 0 ? 1 : -1;
  const b = new Ball(); b.pos = v3(0, TABLE.height + BALL.radius + 0.001, 0.5); b.vel = v3(0, -3.5, -1.0); b.spin = v3(-axis * 600, 0, 0); b.active = true;
  stepBall(b, dt, PARAMS);
  check('heavy backspin/slow ball reverses direction on bounce', b.vel.z > 0, `vz after=${b.vel.z.toFixed(2)}`);
}

// 7. Racket: brushing a dead ball produces heavy spin; a hard flat hit produces speed; COR drop with speed
{
  const b = new Ball(); b.pos = v3(0, 1, 1.39); b.vel = v3(0, 0, 2); b.active = true;
  const prev = v3(0, 1, 1.33);
  const rk = new Racket(v3(0, 1, 1.40), v3(0, 0, -1));
  rk.prevPos = v3(0, 0.9, 1.40); rk.vel = v3(0, 8, -1);   // brushing upward, barely moving forward
  const res = collideRacket(b, prev, rk);
  const sc = spinComponents(b.vel, b.spin);
  check('brush produces topspin > 250 rad/s', res && sc.top > 250, `spin=${sc.top.toFixed(0)} rad/s, rpm=${sc.rpm.toFixed(0)}`);
  check('brushed ball travels forward (toward -z)', b.vel.z < 0, `vz=${b.vel.z.toFixed(2)}`);
}
{
  const hit = (vr) => {
    const b = new Ball(); b.pos = v3(0, 1, 1.39); b.vel = v3(0, 0, 4); b.active = true;
    const rk = new Racket(v3(0, 1, 1.40), v3(0, 0, -1)); rk.prevPos = v3(0, 1, 1.40 + vr * dt); rk.vel = v3(0, 0, -vr);
    collideRacket(b, v3(0, 1, 1.33), rk);
    return -b.vel.z;
  };
  const soft = hit(2), hard = hit(12);
  check('harder swing -> faster ball', hard > soft, `soft ${soft.toFixed(1)} m/s, hard ${hard.toFixed(1)} m/s`);
  check('flat 12 m/s swing on 4 m/s ball gives ~18-26 m/s', hard > 18 && hard < 26, `${hard.toFixed(1)} m/s`);
}

// 8. Spin reversal: a chop-block on a heavy topspin ball sends it back with the same spin sense for the opponent
{
  const inc = v3(0, 0, 6);
  const sc = spinComponents(inc, v3(1, 0, 0)); const axis = sc.top > 0 ? 1 : -1; // topspin for +z travel
  const b = new Ball(); b.pos = v3(0, 1, 1.39); b.vel = inc; b.spin = v3(axis * 500, 0, 0); b.active = true;
  const rk = new Racket(v3(0, 1, 1.40), v3(0, 0, -1));
  collideRacket(b, v3(0, 1, 1.33), rk);
  const out = spinComponents(b.vel, b.spin);
  // Inverted rubber "over-grips" (e_t≈0.8): the contact point rebounds, killing most of the spin and
  // throwing the ball upward. The little spin left is topspin for the returned ball (long pips would keep
  // the spin in space => backspin: the famous "reversal").
  check('passive block of heavy topspin: spin mostly killed, light topspin remains', out.top > 0 && out.top < 150, `out top=${out.top.toFixed(0)} rad/s`);
  check('passive block of heavy topspin pops the ball up', b.vel.y > 2, `vy=${b.vel.y.toFixed(2)} m/s`);
}

// 9. Net stops a low ball; a ball over the net passes
{
  const low = new Ball(); low.pos = v3(0, TABLE.height + 0.08, 0.2); low.vel = v3(0, 0, -6); low.active = true;
  const r1 = simulateFlight(low, PARAMS, { maxTime: 0.2 });
  check('low ball hits the net', r1.events.some(e => e.type === 'net'));
  const high = new Ball(); high.pos = v3(0, TABLE.height + 0.25, 0.2); high.vel = v3(0, 0, -6); high.active = true;
  const r2 = simulateFlight(high, PARAMS, { maxTime: 0.2 });
  check('high ball clears the net', !r2.events.some(e => e.type === 'net'));
}

// 10. Tunnelling guard: a 30 m/s ball still registers a table bounce at 120 Hz physics
{
  const b = new Ball(); b.pos = v3(0, TABLE.height + 0.3, 1.0); b.vel = v3(0, -6, -30); b.active = true;
  const r = simulateFlight(b, PARAMS, { dt: 1 / 120, maxTime: 0.5 });
  check('fast ball registers a bounce at 120 Hz', r.events.some(e => e.type === 'bounce'));
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
