// touch.js — touch input for the phone build.
//
// Design: ONE finger plays the whole game, because that is what a phone in landscape gives you (a thumb, while the
// other hand holds the device). The finger replaces the mouse directly:
//
//   finger position  -> racket position (same screen-to-world raycast the mouse uses)
//   finger swiping   -> the swing; its speed is the power, sideways is sidespin
//   swipe DIRECTION  -> the stroke family: up = topspin (drive/loop/smash), down = backspin (push/chop),
//                       sideways = flat. On desktop that was the left/right mouse button; on a phone the direction
//                       of the swipe is the natural, memorable equivalent, and it is what a real player does.
//   finger held still-> block / short push, exactly as before
//   tap              -> toss the serve
//   two-finger swipe -> step back / in (the mouse wheel's job)
//
// Everything downstream (stroke synthesis, the hand's face solver, the rules) is unchanged: this module only feeds
// the same { cursor, button } the mouse feeds.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class TouchControls {
  constructor(canvas, { onTap = () => {}, onStance = () => {}, onTwoFinger = null } = {}) {
    this.canvas = canvas;
    this.onTap = onTap;
    this.onStance = onStance;
    this.pointers = new Map();
    this.primary = null;          // id of the finger that plays
    this.velocity = { x: 0, y: 0 };// normalised screen units per second (dx, dy after the lift offset)
    this.liftPx = 0;              // draw/follow the racket this many px above the finger so the thumb never covers it
    this.active = false;
    this.used = false;            // becomes true once a finger has played; the UI uses it for the first-run hint
    this._tap = null;
    this._twoFinger = null;
    this._last = null;            // { x, y, t } of the primary finger in client px
    this._bind();
  }

  _pos(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top - this.liftPx, r };
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;             // the mouse path stays in main.js
      // Capture keeps the finger bound to the canvas if it slides over the HUD, but it throws when there is no
      // live pointer behind the event (synthetic events, some webviews) and that would abort the gesture.
      try { c.setPointerCapture?.(ev.pointerId); } catch (e) { /* the gesture still works without capture */ }
      const p = this._pos(ev);
      this.pointers.set(ev.pointerId, p);
      if (this.primary === null) {
        this.primary = ev.pointerId;
        this.active = true; this.used = true;
        this._last = { x: p.x, y: p.y, t: performance.now() };
        this._tap = { x: p.x, y: p.y, t: performance.now(), moved: 0 };
        this.onCursor?.(p.x, p.y);
      } else if (this.pointers.size === 2) {
        // a second finger: start a two-finger vertical swipe (step back / step in)
        const [a, b] = [...this.pointers.values()];
        this._twoFinger = { y: (a.y + b.y) / 2, consumed: false };
      }
      ev.preventDefault();
    }, { passive: false });

    c.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'mouse' || !this.pointers.has(ev.pointerId)) return;
      const p = this._pos(ev);
      this.pointers.set(ev.pointerId, p);
      if (ev.pointerId === this.primary) {
        const now = performance.now();
        if (this._last) {
          const dt = Math.max(1, now - this._last.t) / 1000;
          const r = c.getBoundingClientRect();
          // normalised units/second, matching the mouse path (which raycasts normalised coords)
          this.velocity.x = (p.x - this._last.x) / r.width * 2 / dt;
          this.velocity.y = -(p.y - this._last.y) / r.height * 2 / dt;
        }
        if (this._tap) this._tap.moved = Math.max(this._tap.moved, Math.hypot(p.x - this._tap.x, p.y - this._tap.y));
        this._last = { x: p.x, y: p.y, t: now };
        this.onCursor?.(p.x, p.y);
      } else if (this.pointers.size >= 2 && this._twoFinger) {
        const [a, b] = [...this.pointers.values()];
        const y = (a.y + b.y) / 2;
        const dy = y - this._twoFinger.y;
        if (!this._twoFinger.consumed && Math.abs(dy) > 34) {
          this.onStance(dy > 0 ? 1 : -1);      // two fingers down = step back, up = step in
          this._twoFinger.consumed = true;
        }
      }
      ev.preventDefault();
    }, { passive: false });

    const end = (ev) => {
      if (ev.pointerType === 'mouse') return;
      const wasPrimary = ev.pointerId === this.primary;
      this.pointers.delete(ev.pointerId);
      if (this.pointers.size < 2) this._twoFinger = null;
      if (wasPrimary) {
        const tap = this._tap;
        if (tap && tap.moved < 12 && performance.now() - tap.t < 300) this.onTap();
        this._tap = null;
        this.primary = null;
        this.active = false;
        this.velocity.x = 0; this.velocity.y = 0;
        this._last = null;
      }
      ev.preventDefault();
    };
    c.addEventListener('pointerup', end, { passive: false });
    c.addEventListener('pointercancel', end, { passive: false });
  }

  // Called from the frame loop once no finger is down: bleed the velocity to zero so a released swipe stops
  // reading as a swing (otherwise the classifier would keep seeing power from the last frame).
  decay(dt) {
    if (this.active) return;
    const k = Math.exp(-dt * 14);
    this.velocity.x *= k; this.velocity.y *= k;
  }
}

export function isTouchDevice() {
  if (typeof navigator === 'undefined') return false;
  const pt = navigator.maxTouchPoints || 0;
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
  return pt > 0 || !!coarse;
}
