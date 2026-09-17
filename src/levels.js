// levels.js — player difficulty presets. The physics never changes between levels; what changes is how much the
// game helps you: landing correction, racket size, the racket drifting to the ball, game speed, and coaching.
//
// timeScale slows the whole world (ball, opponent, and — see main.js — the rate at which your own swipe counts as
// power, so a slow world is uniformly slower rather than a world where your arm is superhuman). Pro is exactly 1:
// real-time table tennis. The three levels below it run slower so there is time to see the ball, move, and choose a
// stroke; a real ball crosses the table in about 0.35 s, which is not enough for a newcomer with a mouse.
export const LEVELS = {
  newbie: {
    label: 'Newbie', key: '1',
    blurb: 'Half speed, so there is time to see the ball. The racket drifts toward it, almost every hit is steered onto the table, and a coach explains each lost point.',
    assist: 0.95, autoAim: 0.85, racketScale: 1.5, timeScale: 0.5, ai: 'starter', coach: true, hints: true,
  },
  casual: {
    label: 'Casual', key: '2',
    blurb: 'A little under three-quarter speed, some help landing the ball and a bigger racket. You choose the strokes, the game keeps the rally alive.',
    assist: 0.6, autoAim: 0.35, racketScale: 1.2, timeScale: 0.7, ai: 'medium', coach: true, hints: true,
  },
  club: {
    label: 'Club', key: '3',
    blurb: 'Nearly full speed, real racket size, little landing help. Power control and placement are yours. The opponent attacks properly.',
    assist: 0.3, autoAim: 0.1, racketScale: 1.0, timeScale: 0.85, ai: 'hard', coach: true, hints: true,
  },
  pro: {
    label: 'Pro', key: '4',
    blurb: 'Full speed and raw physics. No landing help, no racket drift, no hints. Swipe too hard and the ball is long. The opponent reads your position and hits away from you.',
    assist: 0, autoAim: 0, racketScale: 1.0, timeScale: 1, ai: 'pro', coach: false, hints: false,
  },
};
export const LEVEL_ORDER = ['newbie', 'casual', 'club', 'pro'];
