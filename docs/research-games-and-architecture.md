# 3D Table Tennis in the Browser: Research Report (Games, Controls, Architecture)

## 1. Existing projects (concrete)

| Project | URL | Tech | Takeaway |
|---|---|---|---|
| **PingPong-3D** (ibra-kdbra) | https://github.com/ibra-kdbra/PingPong-3D | React Three Fiber, custom dependency-free physics at fixed 120 Hz, cannon only for a side mode, PeerJS/WebRTC netplay | The best open-source reference. Ballistic shot solver + Magnus, 12 AI personalities, host-authoritative WebRTC with 30 Hz snapshots and a documented `NETPLAY.md`. Headless tests with seeded RNG. |
| **PingPongWebGL** (MortimerGoro) | https://github.com/MortimerGoro/PingPongWebGL (demo: http://mortimergoro.github.io/PingPongWebGL/) | Three.js + custom physics, 2014, MIT | Minimal 6-commit demo; TODO list literally says "improve physics / improve ball hit vector." Useful only as a scene/asset skeleton. |
| **3D-PingPong** (Gaming-Verse) | https://github.com/Gaming-Verse/3D-PingPong (demo: https://ping-pong-3d.netlify.app/) | Plain Three.js, hand-rolled | Barely documented hobby project. |
| **Modelisation3D** (Romeo-mz) | https://github.com/Romeo-mz/Modelisation3D | Three.js, Bezier-curve ball paths | Ball trajectories are scripted Beziers, not physics; illustrates the "faked" end of the spectrum. |
| **3D-Table-Tennis-In-Java** (chaojiechencn) | https://github.com/chaojiechencn/3D-Table-Tennis-In-Java | Java/JavaFX | Not web, but the most explicitly documented mouse-control design (paddle on a plane, swipe direction aims, forward drive = pace + topspin, right-button = brush up/down, sweet-spot-gated assisted return). Modeled on Ping Pong Fury. |
| **PingPang** (tomgoddard) | https://github.com/tomgoddard/PingPang | Unity XR, Quest | "Maximum physics fidelity" VR project; README documents the hard constraints: controller tracking off by >10 cm during fast swings vs 8 cm paddle radius, 16g IMU saturation, ball moving ~10 cm per frame at 10 m/s. |
| **Table Tennis World Tour** (Famobi) | https://www.crazygames.com/game/table-tennis-world-tour | HTML5, almost certainly PlayCanvas | Commercial browser benchmark: swipe speed = power, swipe direction = aim/spin. Casual-assisted. |
| **SportyXR Table Tennis** | https://tt.sportyxr.com/ | WebXR | Browser VR with room-code multiplayer and passthrough MR; claims "true spin, bounce." |
| **Spin Doctor** | http://sonic.net/~goddard/home/spin/docs/spin.html | Standalone sim | Uses constant Magnus lift coefficient ~0.28, treats paddle as non-accelerating during the ~ms contact. Good simplifying assumptions. |
| **webrtc-pong** (preyneyv) / **mitxela WebRTC Pong** | https://github.com/preyneyv/webrtc-pong, https://mitxela.com/projects/webrtc-pong | WebRTC DataChannel, deterministic lockstep + rollback | The two canonical browser netcode writeups for a ball game. |

Notable: no polished Babylon.js or Unity-WebGL table tennis appears in the open-source space; Three.js + custom physics dominates.

## 2. Control design recommendations

- **Paddle follows cursor on a plane** at bat height (screen X = lateral, screen Y = depth toward net). Optionally, a modifier remaps Y to paddle height so you can "brush" the ball.
- **Velocity from mouse deltas**: `rawVel = delta / dt`, then EMA-smooth with frame-rate-independent alpha `1 - exp(-k*dt)`; sample the smoothed velocity at contact rather than the single-frame value.
- **Spin for casual players**: map swing components to spin, not a separate control. Forward drive = pace + topspin; pull back = soft chop; lateral swipe = sidespin + aim.
- **Stationary paddle = soft block**: a safe default so novices can rally.
- **Shot assistance is universal in non-VR games**: every mouse/touch title pre-solves the return to land in, then blends the player's swing intent on top. Sweet-spot gating preserves skill expression.
- Offer an Arcade/Simulation toggle like Racket Fury.

## 3. Physics architecture recommendation

**Write custom analytical physics; do not use a general engine for the ball.** Only ~4 bodies; cannon-es lacks determinism and CCD (tunnelling of a 40 mm ball through a thin paddle at 20-30 m/s is guaranteed at 60 Hz); none of cannon-es/Rapier/Ammo model Magnus, spin-dependent bounce or velocity-dependent restitution. Every serious project (PingPong-3D, Spin Doctor, Eleven, Racket Fury) is custom.

Recipe (Conti et al. 2026 https://arxiv.org/html/2606.28805, IntechOpen https://www.intechopen.com/chapters/83844):

- Ball: m = 2.7 g, r = 20 mm, thin shell I = (2/3)mr². Fixed timestep 120-240 Hz with accumulator; semi-implicit Euler is fine.
- Flight: `a = g - (0.5*Cd*rho*A/m)*|v|*v + (Cm*rho*V/m)*(omega x v)`. Cd ~0.47-0.55. Cm ~0.08-0.38 depending on speed/spin. Vacuum trajectories are ~3x too long, so drag is not optional.
- Table bounce: `e_n ≈ 0.98 + 0.02*v_z` (≈0.88 at 5 m/s), friction mu = 0.25, rolling/sliding switch. This is what makes topspin kick forward and backspin check.
- Racket contact: relative velocity `v - v_racket`; normal `e_r = 0.878 - 0.020*|v_n|`, tangential `e_t = 0.819 - 0.010*|v_T|`. Tangential paddle velocity converts to spin.
- Collision detection: swept sphere vs paddle plane/disc per substep, not discrete overlap.

## 4. AI opponent recipe

1. On opponent hit, forward-simulate the ball with your own physics until it reaches the AI's strike plane; get intercept point + time.
2. Add positional error that shrinks as the ball approaches; scale by difficulty and rally length.
3. Hold predictions for a reaction delay (0.15-0.3 s); re-predict only after bounces.
4. Move toward the target with a capped speed and a small deadband.
5. Pick an outgoing shot with a ballistic solver: choose a landing target, solve launch velocity + spin that clears the net, add aim noise.
6. Dynamic balancing by score differential; AI "personalities" bias target and spin choices.

## 5. Multiplayer notes

- **Transport**: WebRTC DataChannel (P2P, budget for TURN); WebSocket for signalling or an authoritative server.
- **Models**: (a) deterministic lockstep (needs bit-identical float math, risky across browsers), (b) lockstep + rollback, (c) host-authoritative with 30 Hz ball snapshots and a locally integrated "shadow ball" eased toward snapshots (PingPong-3D). For a demo, (c) is simplest.
- **Eleven's trick**: spawn the authoritative ball only when the opponent's hit is ACKed, delayed by ping. Playable at 300 ms ping.
- Hits/bounces/points as authoritative events, not inferred from snapshots.

## 6. Design insights

1. Realism comes from a few well-chosen couplings: velocity-dependent restitution, spin-coupled bounce, and drag+Magnus.
2. Mouse controls cannot supply real 3D swing data, so successful non-VR games layer a shot solver under the player's intent.
3. Fixed-timestep, allocation-free physics (120 Hz) is the norm; render interpolates.
4. Racket contact is the dominant error source even in pro-data models; justifies a sweet-spot mechanic.
5. Spin should be legible: ball rotation texture, trails, spin indicator.
6. First-person hovering-paddle view avoids the uncanny player-model problem.
7. Audio feedback substitutes for touch: pitch by hit speed, distinct table/net sounds.
8. Arcade/Sim toggle satisfies both audiences; difficulty via AI noise + reaction delay beats faster paddles.
9. Ball speed ~10-30 m/s means ~10 cm per frame at 60 Hz; use swept collision and trails.
10. Plan netcode around a host-authoritative or deterministic core from day one.

## Sources
- https://en.wikipedia.org/wiki/Eleven_Table_Tennis, https://slar.se/eleven-table-tennis-a-vr-masterpiece.html
- https://roadtovr.com/racket-fury-table-tennis-vr-ping-pong-oculus-quest/, https://6dofreviews.com/reviews/review-racket-fury-table-tennis/
- https://www.gamezebo.com/reviews/ping-pong-fury-review-table-tennis-with-a-growl/, https://www.148apps.com/table-tennis-touch/table-tennis-touch-review/
- https://www.jstage.jst.go.jp/article/tjsst/17/1/17_25/_article/-char/en, https://www.sciencedirect.com/science/article/pii/S1877705816307548, https://arxiv.org/html/2604.11349
- https://www.researchgate.net/publication/316287031_Measurements_of_drag_and_lift_on_smooth_balls_in_flight
- https://jakesgordon.com/writing/javascript-pong/part5/, https://www.sciencedirect.com/science/article/pii/S0921889017306164
- https://discourse.threejs.org/t/preferred-physics-engine-cannon-js-ammo-js-diy/1565
- https://eleven-vr.fandom.com/wiki/Multiplayer, https://abratabia.com/multiplayer-web-games/
- https://gamedev.net/forums/topic/288355-smooth-mouse-motion/, https://lisyarus.github.io/blog/posts/exponential-smoothing.html
