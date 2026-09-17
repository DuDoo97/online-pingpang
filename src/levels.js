// levels.js — player difficulty presets. The physics never changes between levels; what changes is how much the
// game helps you: landing correction, racket size, the racket drifting to the ball, game speed, and coaching.
export const LEVELS = {
  newbie: {
    label: 'Newbie', key: '1',
    blurb: 'The racket drifts toward the ball, almost every hit is steered onto the table, the ball is a little slower, and a coach explains each lost point.',
    assist: 0.95, autoAim: 0.85, racketScale: 1.5, timeScale: 0.8, ai: 'easy', coach: true, hints: true,
  },
  casual: {
    label: 'Casual', key: '2',
    blurb: 'Some help landing the ball and a bigger racket. You choose the strokes, the game keeps the rally alive.',
    assist: 0.6, autoAim: 0.35, racketScale: 1.2, timeScale: 1, ai: 'medium', coach: true, hints: true,
  },
  club: {
    label: 'Club', key: '3',
    blurb: 'Real racket size, little landing help. Power control and placement are yours. The opponent attacks properly.',
    assist: 0.3, autoAim: 0.1, racketScale: 1.0, timeScale: 1, ai: 'hard', coach: true, hints: true,
  },
  pro: {
    label: 'Pro', key: '4',
    blurb: 'Raw physics. No landing help, no racket drift, no hints. Swipe too hard and the ball is long. The opponent reads your position and hits away from you.',
    assist: 0, autoAim: 0, racketScale: 1.0, timeScale: 1, ai: 'pro', coach: false, hints: false,
  },
};
export const LEVEL_ORDER = ['newbie', 'casual', 'club', 'pro'];
