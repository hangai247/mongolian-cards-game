import { springStep } from './motion-math.js';

const mounts = new WeakMap(), identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const values = m => Array.from(m.toFloat64Array());

/** FLIP layout springs: preserve each surviving card's pose across DOM reordering. */
export function mountHandLayout(hand) {
  if (mounts.has(hand)) return mounts.get(hand);
  const win = hand.ownerDocument.defaultView, doc = hand.ownerDocument;
  const Matrix = win.DOMMatrix, reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const states = new Map(), listeners = new AbortController();
  let frame = null, last = null;
  let scrollLeft = hand.scrollLeft, scrollTop = hand.scrollTop;
  const allowed = () => hand.isConnected && !doc.hidden && !reduced.matches;
  const matrix = v => new Matrix(v);
  function clear(card) {
    card.style.removeProperty('--hand-layout'); card.classList.remove('spring-layout'); states.delete(card);
  }
  function reset() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    for (const card of states.keys()) clear(card);
    frame = last = null;
  }
  function geometry(card) {
    const css = win.getComputedStyle(card), [ox, oy] = css.transformOrigin.split(' ').map(parseFloat);
    const width = parseFloat(css.width), height = parseFloat(css.height);
    const left = card.offsetLeft - hand.scrollLeft, top = card.offsetTop - hand.scrollTop;
    const shift = css.translate === 'none' ? [0, 0, 0] : css.translate.split(' ').map(parseFloat);
    const turn = css.rotate === 'none' ? [0, 0, 1, 0] : css.rotate.split(' ').map(parseFloat);
    const rotation = turn.length === 1 ? new Matrix().rotate(turn[0]) : new Matrix().rotateAxisAngle(...turn);
    // Individual hover transforms precede the CSS transform. Include them in the change of basis.
    const origin = new Matrix().translate(left + ox, top + oy).translate(shift[0], shift[1] || 0, shift[2] || 0).multiply(rotation);
    const local = new Matrix().translate(-ox, -oy);
    return { width, height, ox, oy, origin, local, transform: new Matrix(css.transform) };
  }
  function write(card, state) {
    card.classList.add('spring-layout');
    card.style.setProperty('--hand-layout', `matrix3d(${state.value.join(',')})`);
  }
  function tick(time) {
    frame = null;
    if (!allowed()) { reset(); return; }
    const dt = last === null ? 1 / 60 : Math.min((time - last) / 1000, .1); last = time;
    for (const [card, state] of states) {
      if (!hand.contains(card)) { clear(card); continue; }
      let error = 0;
      for (let i = 0; i < 16; i++) {
        const step = springStep(state.value[i], state.velocity[i], identity[i], dt);
        state.value[i] = step.value; state.velocity[i] = step.velocity;
        const units = i >= 12 ? 1 : state.size;
        error = Math.max(error, Math.abs(step.value - identity[i]) * units, Math.abs(step.velocity) * units);
      }
      if (error < .025) clear(card); else write(card, state);
    }
    if (states.size) frame = win.requestAnimationFrame(tick); else last = null;
  }
  const api = {
    reset,
    capture() {
      if (!allowed()) { reset(); return null; }
      return new Map([...hand.children].filter(n => n.dataset.cardId).map(card => {
        const g = geometry(card), state = states.get(card);
        const world = g.origin.multiply(g.transform).multiply(g.local);
        // Carry velocity through the new coordinate system when a sort interrupts a spring.
        const base = state ? matrix(state.value).inverse().multiply(g.transform) : g.transform;
        const next = state ? g.origin.multiply(matrix(state.value.map((v, i) => v + state.velocity[i]))).multiply(base).multiply(g.local) : world;
        return [card, { ...g, world, next }];
      }));
    },
    animate(before) {
      if (!before || !allowed()) { reset(); return; }
      // Read final layout without old offsets, then restore the previous visual pose before paint.
      for (const card of states.keys()) clear(card);
      const targets = [...before].filter(([card]) => hand.contains(card)).map(([card, old]) => [card, old, geometry(card)]);
      for (const [card, old, next] of targets) {
        if (!old.width || !old.height || !next.width || !next.height) continue;
        const right = new Matrix().scale(old.width / next.width, old.height / next.height)
          .translate(next.ox, next.oy).multiply(next.transform.inverse());
        const left = next.origin.inverse();
        const value = values(left.multiply(old.world).multiply(right));
        const future = values(left.multiply(old.next).multiply(right));
        if (!value.every(Number.isFinite) || !future.every(Number.isFinite)) continue;
        if (value.every((v, i) => Math.abs(v - identity[i]) < .00001)) continue;
        const state = { value, velocity: future.map((v, i) => v - value[i]), size: Math.max(next.width, next.height) };
        states.set(card, state); write(card, state);
      }
      if (states.size && frame === null) { last = null; frame = win.requestAnimationFrame(tick); }
      scrollLeft = hand.scrollLeft; scrollTop = hand.scrollTop;
    },
    dispose() { reset(); listeners.abort(); mounts.delete(hand); },
  };
  const options = { signal: listeners.signal };
  win.addEventListener('resize', reset, options);
  win.addEventListener('pagehide', reset, options);
  doc.addEventListener('visibilitychange', reset, options);
  reduced.addEventListener('change', reset, options);
  hand.addEventListener('scroll', () => {
    // Reconciliation restores/clamps scroll synchronously; its queued event is not a new user scroll.
    if (hand.scrollLeft === scrollLeft && hand.scrollTop === scrollTop) return;
    scrollLeft = hand.scrollLeft; scrollTop = hand.scrollTop; reset();
  }, { ...options, passive: true });
  mounts.set(hand, api); return api;
}
export function resetHandLayout(hand) { mounts.get(hand)?.reset(); }
