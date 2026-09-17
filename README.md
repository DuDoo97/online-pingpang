# Online Pingpang

**Play:** https://dudoo97.github.io/online-pingpang/ · **Research dossier:** https://dudoo97.github.io/online-pingpang/docs/dossier.html

A browser 3D table-tennis demo with a physically grounded ball: drag, Magnus lift, spin-coupled bounces, speed-dependent
restitution, grippy rubber. Play against an AI that predicts the ball with the *same* physics and solves its return shots.

## Run locally

```bash
npm install
npm run dev        # http://localhost:8173
npm test           # headless physics + stroke checks
npm run single     # dist/pingpang.html — one self-contained file you can double-click
```

Deploys: every push to `main` runs the tests, builds, and publishes to GitHub Pages via `.github/workflows/pages.yml`.

## Controls: the stroke grammar

There is no stroke menu. A stroke is **which button you hold**, **how hard you swipe at the ball**, and **where you
stand**. The label above the table always shows the stroke you are loaded for, before contact.

| Input | Action |
|---|---|
| Move mouse | Racket follows (left/right, up/down). It steps in for short balls on its own. |
| Swipe at the ball | The swing. Speed of the swipe = power. Sideways component = sidespin. |
| Hold **left** | Topspin family: still = **Block**, medium = **Drive**, hard = **Loop**, hard on a high ball = **Smash**, short ball = **Flick** (across = **Banana flick**), far back = **Lob** |
| Hold **right** | Backspin family: gentle = **Short push**, medium = **Push**, hard = **Fast long push**, far back = **Chop** |
| No button | **Flat hit** / block |
| Click / Space | Toss the serve. Then swipe at the falling ball: hold left/right for topspin/backspin serves, swipe sideways for sidespin. The next shot is labelled as a **Receive**. |
| Wheel / W S | Stance: close to the table, mid, far back. Far back unlocks chop and lob. |
| H | Stroke guide overlay. R restarts. |

**Grips** (settings panel): Shakehand (even wings), Penhold (spinnier forehand and serves; backhand can only push,
block and drive), Penhold + RPB (the reverse face frees the backhand: `RPB Loop`, `RPB Banana flick`). Left-handed
mode mirrors forehand and backhand.

**Opponent styles**: Attacker (loops, flicks, smashes), Controller (blocks, pushes, drives), Chopper (stands back,
chops). All three use the same stroke recipes and the same physics as you.

Rules: first to 11, win by 2, service alternates every 2 points (every point from 10-10), serve must bounce on your
half first, a serve that clips the net is a let, volleys lose the point.

## Files

- `src/physics.js` — dependency-free ball physics (SI units). Aerodynamics, impulse-based impact with rolling/sliding
  switch, table/net/floor collisions, swept racket collision, forward simulation.
- `src/strokes.js` — the stroke grammar: grips, stroke recipes, gesture classifier, swing synthesizer.
- `src/ai.js` — opponent: playing styles, reaction delay, physics-based intercept prediction, ballistic return solver,
  serve solver, and the player's shot-assist solver.
- `src/game.js` — match rules and the fixed-step loop (headless, testable).
- `src/main.js` — Three.js scene, mouse racket, HUD, live physics panel.
- `test/` — `physics.test.mjs` (ITTF drop test, terminal velocity, Magnus sign, bounce spin coupling, racket brush,
  net), `strokes.test.mjs` (gesture classification, grip rules, spin/speed of each synthesized stroke),
  `rally.test.mjs` (scripted bot vs AI), `match.test.mjs`.
- `docs/research-physics.md`, `docs/research-games-and-architecture.md` — research reports with sources.

## Physics model (numbers from the literature)

| Quantity | Model | Source |
|---|---|---|
| Ball | 40 mm, 2.7 g, thin shell I = ⅔mr² | ITTF T3 |
| Drag | ½ρCdA·v², Cd = 0.40 | Conti et al. 2026, Gao et al. 2021 |
| Magnus | Cl = S/(2S+1), S = rω/v (linear at low spin, saturates at 0.5) | Miyazaki 2017 fits |
| Table bounce | e = 0.98 − 0.02·|vₙ|, μ = 0.25, sliding/rolling impulse switch | Conti et al., Nakashima 2010 |
| Racket | e = 0.878 − 0.020·|vₙ|, tangential eₜ = 0.82 − 0.01·|vₜ| ("over-grip") | Conti et al., Achterhold et al. 2026 |
| Spin decay | 5 %/s | Spin Doctor sim |

Verified by `npm test`: 30.5 cm drop rebounds 24.6 cm (ITTF: 24–26), terminal velocity 9.4 m/s, speed halves in ~6 m,
topspin dips / backspin floats, topspin bounce speeds the ball up and loses ~25 % spin (Kamijima 2013: +7 % speed,
−22 % spin), heavy backspin at a shallow angle bounces back toward the net, a brush at 8 m/s gives ~3,500 rpm.

## Design notes

- **No physics engine.** Four bodies, a 2.7 g ball at up to 30 m/s and a 1.4 cm thick racket: general engines tunnel
  and none model Magnus or spin-coupled bounce. Everything is analytical, at 360 Hz with a swept racket test.
- **Shot assist is a budget, not a blend.** Mixing a raw and a legal velocity is usually illegal (the feasible set is not
  convex). Instead the solver finds the legal shot closest to your swing, keeps your spin, and applies it fully if the
  correction is within a budget that grows with the assist slider. At 0 % it is raw physics.
- **The AI plays the same physics.** It forward-simulates the incoming ball to its strike plane, adds reaction delay and
  aim noise by difficulty, then searches launch elevation for a target on your side.
- **Amateur, not pro.** Spin tops out around 4,000–5,000 rpm and speeds around 20 m/s, the amateur range; pro loops
  (100–150 rps, 25–35 m/s) are reachable only by turning the physics sliders.
