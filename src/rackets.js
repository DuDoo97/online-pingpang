// rackets.js — the equipment roster. A racket changes the SURFACE, never the ball: the physics, the strokes and the
// rules are identical whichever blade you pick. What changes is how the rubber behaves at the millisecond of
// contact, which is exactly what real equipment does.
//
// Three physical knobs, all of them measurable on a real racket:
//   cor      normal restitution e  -> rebound speed. 0.72 absorbent (a defensive blade) .. 0.95 springy.
//   grip     friction mu           -> how hard the rubber bites before it slips. Below ~0.6 the ball starts to
//                                     slide and the racket loses its hold on the spin.
//   tangential e_t                 -> the "over-grip" of the rubber. This is the interesting one:
//                                       e_t >= 0.8 : the contact point rebounds, spin is AMPLIFIED (inverted rubber)
//                                       e_t ~= 0.3 : the contact kills spin (anti-spin / smooth pips)
//                                       e_t ~= 0.15 + very low mu: incoming spin is INVERTED (long pips)
//
// Measured from this engine, a passive block of 3,000 rpm topspin comes back as:
//   inverted  e_t 0.80 ->   240 rpm topspin  (the ball keeps its spin; the attacker keeps attacking)
//   pips      e_t 0.40 ->   480 rpm backspin (the spin is gone)
//   long pips e_t 0.20 ->   840 rpm BACKSPIN (the spin is handed back reversed; the attacker's own spin beats them)
// and a 6 m/s brush on a dead ball makes 3,180 rpm with inverted rubber against 2,063 rpm with long pips.

export const RACKETS = {
  allround: {
    label: 'All-round', short: 'ALL', colour: [0xc0272d, 0x141414], accent: 0xc0272d,
    tagline: 'The default blade. Even pace, even spin, no surprises.',
    cor: 0.86, grip: 1.10, tangential: 0.80, slope: 0.020, tiltLimit: [-45, 50], serveBrush: 1.0,
    pros: ['no weakness', 'everything works'], cons: ['no weapon'],
  },
  spin: {
    label: 'Spin machine', short: 'SPIN', colour: [0xc0272d, 0x141414], accent: 0xd94f8a,
    tagline: 'Tacky, slow, and greedy for spin. Your loops curve like nothing else here.',
    cor: 0.78, grip: 1.90, tangential: 0.96, slope: 0.024, tiltLimit: [-52, 52], serveBrush: 1.3,
    pros: ['heaviest spin in the game', 'bigger serve spin'], cons: ['slower ball', 'needs a full swing'],
  },
  pips: {
    label: 'Short pips', short: 'PIPS', colour: [0xc0272d, 0x141414], accent: 0x35b56b,
    tagline: 'Flat, fast and spin-deaf. Your drives go straight through spin; your own loops are feeble.',
    cor: 0.90, grip: 0.95, tangential: 0.40, slope: 0.020, tiltLimit: [-35, 50], serveBrush: 0.7,
    pros: ['fast and flat', 'immune to incoming spin', 'kills rallies'], cons: ['barely makes topspin', 'serve spin is weak'],
  },
  anti: {
    label: 'Anti-spin', short: 'ANTI', colour: [0xd8d8d8, 0x141414], accent: 0x8f7fd4,
    tagline: 'Dead rubber. Everything comes back slow and spinless, and your opponent has to generate it all.',
    cor: 0.68, grip: 0.85, tangential: 0.30, slope: 0.018, tiltLimit: [-25, 55], serveBrush: 0.5,
    pros: ['absorbs pace', 'wins points against heavy topspin'], cons: ['no attacking power at all'],
  },
  attack: {
    label: 'All-out attack', short: 'ATK', colour: [0xc0272d, 0x141414], accent: 0xff6b35,
    tagline: 'Hard, fast and unforgiving. The smash is a finisher; the soft shots are harder to keep down.',
    cor: 0.96, grip: 1.00, tangential: 0.85, slope: 0.016, tiltLimit: [-50, 45], serveBrush: 0.9,
    pros: ['fastest ball in the game', 'flat, heavy drives'], cons: ['fast surface is harder to control', 'you cannot absorb pace'],
  },
  chopper: {
    label: 'Chopper', short: 'CHOP', colour: [0xc0272d, 0x141414], accent: 0x4aa3d8,
    tagline: 'A defensive blade with long pips on the backhand. Stand back, chop heavy, and reverse their spin.',
    cor: 0.76, grip: 1.20, tangential: 0.60, slope: 0.024, tiltLimit: [-30, 58], serveBrush: 0.8,
    fh: { cor: 0.80, grip: 1.30, tangential: 0.85, tiltLimit: [-45, 52] },      // inverted forehand: can still loop
    bh: { grip: 0.80, tangential: 0.18, cor: 0.76, tiltLimit: [-8, 58] },        // long pips backhand: spin reversal
    pros: ['backhand reverses spin', 'very forgiving of pace'], cons: ['no backhand attack', 'needs distance'],
  },
};

export const RACKET_ORDER = ['allround', 'spin', 'pips', 'anti', 'attack', 'chopper'];

// The surface actually meeting this ball: a racket can specify a different backhand (chopper does).
export function surfaceFor(racketKey, wing = 'fh') {
  const R = RACKETS[racketKey] || RACKETS.allround;
  const w = (wing === 'bh' && R[wing]) ? R[wing] : null;
  return {
    key: racketKey, label: R.label,
    cor: w && w.cor != null ? w.cor : R.cor,
    grip: w && w.grip != null ? w.grip : R.grip,
    tangential: w && w.tangential != null ? w.tangential : R.tangential,
    tiltLimit: w && w.tiltLimit ? w.tiltLimit : R.tiltLimit,
    serveBrush: R.serveBrush,
  };
}

// The surface object the impact code consumes: {cor, grip, tangential, slope}. One shape everywhere, so a racket
// cannot silently fall back to the default constants (which is exactly what happened when these two disagreed).
export function surfaceParams(racketKey, wing = 'fh') {
  const s = surfaceFor(racketKey, wing);
  return { cor: s.cor, grip: s.grip, tangential: s.tangential, slope: 0.020, serveBrush: RACKETS[racketKey]?.serveBrush ?? 1 };
}

// AI tendencies: how each racket nudges the opponent's shot choice (a weapon pushes the AI to use its strength).
export const RACKET_AI = {
  allround: { power: 1.0, spin: 1.0, bias: {} },
  spin: { power: 0.88, spin: 1.35, bias: { normal: ['loop', 'loop', 'loop', 'drive'] } },
  pips: { power: 1.12, spin: 0.55, bias: { normal: ['drive', 'drive', 'smash'] } },
  anti: { power: 0.8, spin: 0.5, bias: { normal: ['block', 'push', 'drive'] } },
  attack: { power: 1.22, spin: 0.95, bias: { normal: ['smash', 'drive', 'loop'] } },
  chopper: { power: 0.82, spin: 1.2, bias: { normal: ['chop', 'chop', 'push'], backspin: ['chop', 'push'] } },
};
