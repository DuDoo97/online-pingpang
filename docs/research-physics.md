# Table Tennis Physics for a 3D Browser Simulation — Research Report

## 1. Numeric parameter table

| Parameter | Value | Notes / Source |
|---|---|---|
| Ball diameter | 40 mm (40+ plastic actually 40.0–40.6 mm; measured 40.40 mm) | [ITTF Laws 2.3.1](https://cdn.megaspin.net/rules/pdf/2025/ittf-rules-2.pdf), [Lee et al. 2019](https://journal.racketsportscience.org/index.php/ijrss/article/view/32) |
| Ball mass | 2.7 g (tolerance 2.67–2.77 g) | [ITTF T3 leaflet](https://www.ittf.com/wp-content/uploads/2018/07/T3_Ball_BoD2018.pdf) |
| Moment of inertia | I = (2/3)·m·r² = 7.2×10⁻⁷ kg·m² (thin shell); κ = mr²/I = 3/2 | [Conti et al. 2026](https://arxiv.org/pdf/2606.28805) |
| Ball bounce on steel (T3 test) | drop 305 mm → 240–265 mm ⇒ COR 0.887–0.932 | ITTF T3 |
| Table | 2.74 m × 1.525 m, surface 76 cm above floor; drop 30 cm → ~23 cm bounce (COR ≈ 0.88) | ITTF Laws 2.1 |
| Net | 15.25 cm high; posts 15.25 cm outside the side lines (net span ≈ 1.83 m) | ITTF Laws 2.2 |
| Racket | Any size; blade ≥85% natural wood; typical blade ≈17×15 cm | ITTF Laws 2.4 |
| Air density ρ | 1.20–1.29 kg/m³ | [Gao et al. 2021](https://arxiv.org/pdf/2109.03100) |
| Reynolds number in play | ≈6.6×10³ (2.5 m/s) → 5.3×10⁴ (20 m/s) → 9×10⁴ (35 m/s) | [Ito & Kamijima 2025](https://www.jstage.jst.go.jp/article/tjsst/17/1/17_25/_article/-char/en) |
| Drag coefficient C_D | 0.37–0.55; ≈0.55 at low speed, ≈0.45–0.47 at rally speeds. Simple sims use 0.4–0.5 | Conti et al.; Gao et al. (0.4); [Spin Doctor](http://sonic.net/~goddard/home/spin/docs/spin.html) (0.5) |
| Terminal velocity | ≈8–9 m/s | √(2mg/ρACd) |
| Speed half-distance | v halves every ≈4.7–5.5 m of flight | Spin Doctor |
| Magnus/lift coefficient | Linear regime C_L ≈ (0.3–1.0)·S, S = rω/v; saturates / dips around S ≈ 0.5 ("lift crisis") | Conti et al.; [Miyazaki 2017](https://www.researchgate.net/publication/311974637_Lift_crisis_of_a_spinning_table_tennis_ball); [IntechOpen](https://www.intechopen.com/chapters/83844) |
| Serve spin (pros, 2009 WTTC) | 13.7–62.5 rps; men avg 46.0 rps | [Yoshida et al. 2014](https://www.jstage.jst.go.jp/article/jjpehss/59/1/59_13068/_article) |
| Loop spin | Amateurs 3,000–5,000 rpm (50–83 rps); pros 100–150 rps | [PingSunday](https://pingsunday.com/how-much-spin-can-a-table-tennis-player-generate/), Conti et al. |
| Ball speed | Pro loops ~15–25 m/s; smashes up to 35 m/s | Conti et al., [AIMY](https://arxiv.org/abs/2210.06048) |
| Table COR e_n | 0.98 − 0.02·|v_z| (≈0.88 at 5 m/s, 0.78 at 10 m/s) | Conti et al. |
| Table friction μ | 0.25 (dynamic) | Conti et al. |
| Table contact time | ≈0.7 ms | IntechOpen |
| Racket normal COR | e = 0.878 − 0.020·|v_n| | Conti; [ISJOS 2021](https://www.isjos.org/pdfs/ISJOS_v15_p2.pdf); [Kawazoe 2004](https://kawazoe-lab.com/wp-content/uploads/2016/08/20041130.pdf) |
| Racket tangential COR e_t | 0.819 − 0.010·|v_T| (inverted rubber); anti-spin e = 0.53, μ ≈ 0.2 | Conti; [Achterhold et al. 2026](https://arxiv.org/html/2604.11349) |
| Racket contact time | ~1.3–1.8 ms | Kawazoe & Suzuki |
| Spin decay in air | ≈3–10% per second (negligible vs speed loss of 30–50%) | Spin Doctor; [TTDaily](https://www.tabletennisdaily.com/forum/topics/spin-decay.17109/) |
| Plastic vs celluloid | Plastic loses 3.98% more speed and 1.24% more spin in flight | Lee et al. 2019 |

## 2. Formulas

**Flight:**
```
a = g − (Cd·ρ·A / 2m)·|v|·v + (Cl·ρ·A / 2m)·|v|²·(ω̂ × v̂)      A = πr², S = r|ω|/|v|
```
Practical: `Cl = min(k·S, 0.5)` with k ≈ 0.6–1.0.

**Table bounce (Nakashima 2010 rolling/sliding switch, κ = 3/2):**
```
v_T   = surface velocity at contact
α     = min( 1/κ , μ(1+e_n)|vz⁻| / |v_T| )
v_T⁺ = (1−α) v_T ;  vz⁺ = −e_n vz⁻ ;  ω⁺ = (1−κα) ω⁻ + ...
```
Kamijima's bench data: topspin ≥3000 rpm gains 7.2% speed and loses 21.7% spin at bounce.

**Racket impact (racket frame):**
```
v_rel = v⁻ − v_R ;  e_n = 0.878 − 0.020|v_n| ;  e_t = 0.819 − 0.010|v_T| ;  α = (1+e_t)/(1+κ)
v_n⁺ = −e_n v_n ;  v_T⁺ = (1−α) v_T ;  ω⁺ = ω⁻ − (κα/r) n × v_T
```
With e_t ≈ 0.8, α ≈ 0.72 > 2/3: inverted rubber is "over-grip", the contact point rebounds, so incoming topspin returns as topspin for the opponent (spin reversal).

## 3. Key insights for the game designer

1. **Drag dominates speed loss.** At 20 m/s drag ≈ 5× gravity; the ball loses half its speed every ~5 m. Terminal velocity is only ~8.5 m/s, so lobs fall slowly.
2. **Magnus is gravity-scale.** A pro loop (15 m/s, 600 rad/s) feels ~2.5 g of dip. Topspin lets players hit hard and still land; backspin "floats".
3. **Spin barely decays in air; speed decays 30–50%.** So S increases along the flight and loops dive sharply at the end.
4. **Don't let C_L grow linearly forever.** Cap around 0.4–0.5.
5. **Bounce with topspin speeds the ball up; backspin slows and "kicks up"**, and with enough spin can bounce back toward the net.
6. **COR falls with impact speed (buckling).** ~0.9 soft push, ~0.8 smash on table; ~0.85 → ~0.65 on racket from 2 → 12 m/s.
7. **Rubber is a high-grip spring.** Outgoing spin is set by racket tangential velocity: brushing at 10 m/s on a dead ball yields ≈525 rad/s (84 rps).
8. **A no-spin ball acquires topspin on every table bounce**; a chop-blocked ball reverses spin on the racket. Both emerge from the matrix model.
9. **Contact times (~0.7 ms table, ~1.5 ms racket) are far below any frame step**: treat impacts as instantaneous impulses.
10. **40+ plastic is slower mainly through the air**: expose as a Cd multiplier (~1.04).

## 4. Sources
- https://cdn.megaspin.net/rules/pdf/2025/ittf-rules-2.pdf
- https://www.ittf.com/wp-content/uploads/2018/07/T3_Ball_BoD2018.pdf
- https://arxiv.org/pdf/2606.28805 (Conti et al. 2026)
- https://arxiv.org/html/2604.11349 (Achterhold et al. 2026)
- https://arxiv.org/pdf/2109.03100 (Gao et al. 2021)
- https://www.intechopen.com/chapters/83844 (Schneider et al.)
- https://www.researchgate.net/publication/311974637_Lift_crisis_of_a_spinning_table_tennis_ball
- https://www.jstage.jst.go.jp/article/tjsst/17/1/17_25/_article/-char/en
- https://sasportssience.blob.core.windows.net/ijtts/IJTTS_8_pdf%20files/MK11_Kamijima%20K_52-55.pdf
- https://journal.racketsportscience.org/index.php/ijrss/article/view/32
- https://www.jstage.jst.go.jp/article/jjpehss/59/1/59_13068/_article
- https://kawazoe-lab.com/wp-content/uploads/2016/08/20041130.pdf
- https://www.isjos.org/pdfs/ISJOS_v15_p2.pdf
- https://www.researchgate.net/publication/251938442 (Nakashima 2010)
- https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/31.%20Spin.pdf
- http://sonic.net/~goddard/home/spin/docs/spin.html
- https://arxiv.org/abs/2210.06048
- https://pingsunday.com/how-much-spin-can-a-table-tennis-player-generate/

Caveats: the exact C_L curve was reconstructed from three independent simulation fits rather than one tabulated dataset.
