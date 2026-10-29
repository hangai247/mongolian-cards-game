import { springStep } from './motion-math.js';

const mounts = new WeakMap();
export function mountHandTilt(hand) {
  if (mounts.has(hand)) return mounts.get(hand);
  const doc = hand.ownerDocument, win = doc.defaultView;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = win.matchMedia('(hover: hover) and (pointer: fine)');
  const listeners = new AbortController(), poses = new Map();
  let hovered = null, frame = null, last = null;
  hand.classList.add('spring-hand');
  // Selection can be disabled between turns; only presentation motion blocks hover feedback.
  const allowed = () => !doc.hidden && !reduced.matches && hand.isConnected && hand.getAttribute('aria-busy') !== 'true';
  const rise = () => hand.classList.contains('wide-hand') ? 8 : 12;
  function pose(card) {
    let p = poses.get(card);
    if (!p) {
      const selection = Number(card.classList.contains('selected'));
      p = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, lift: selection * rise(), vlift: 0, selection, vselection: 0, bounds: card.getBoundingClientRect() };
      poses.set(card, p); card.classList.add('spring-tilting');
      // Override the CSS resting pose before a selection class changes, avoiding a one-frame jump.
      card.style.setProperty('--selection-progress', String(p.selection));
      card.style.translate = `0 ${-p.lift}px`;
    }
    return p;
  }
  function remove(card) {
    card.style.removeProperty('rotate'); card.style.removeProperty('translate');
    card.style.removeProperty('--selection-progress');
    card.classList.remove('spring-tilting', 'hover-raised'); poses.delete(card);
    if (hovered === card) hovered = null;
  }
  function reset() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    for (const card of poses.keys()) remove(card);
    frame = null; last = null;
  }
  function tick(time) {
    frame = null;
    if (!allowed()) { reset(); return; }
    const dt = last === null ? 1 / 60 : Math.min((time - last) / 1000, .1);
    last = time;
    let moving = false;
    for (const [card, p] of poses) {
      if (!hand.contains(card)) { remove(card); continue; }
      ({ value: p.x, velocity: p.vx } = springStep(p.x, p.vx, p.tx, dt));
      ({ value: p.y, velocity: p.vy } = springStep(p.y, p.vy, p.ty, dt));
      const selected = Number(card.classList.contains('selected'));
      const targetLift = hovered === card || selected ? rise() : 0;
      ({ value: p.lift, velocity: p.vlift } = springStep(p.lift, p.vlift, targetLift, dt));
      ({ value: p.selection, velocity: p.vselection } = springStep(p.selection, p.vselection, selected, dt));
      const settled = Math.max(Math.abs(p.x - p.tx), Math.abs(p.y - p.ty), Math.abs(p.vx), Math.abs(p.vy), Math.abs(p.lift - targetLift), Math.abs(p.vlift), Math.abs(p.selection - selected) * 12, Math.abs(p.vselection) * 12) < .025;
      if (settled) { p.x = p.tx; p.y = p.ty; p.lift = targetLift; p.selection = selected; p.vx = p.vy = p.vlift = p.vselection = 0; }
      // Individual transforms compose with the fan/selection transform without CSS easing the spring again.
      const angle = Math.hypot(p.x, p.y);
      card.style.rotate = angle < .001 ? 'none' : `${p.x} ${p.y} 0 ${angle}deg`;
      card.style.translate = `0 ${-p.lift}px`;
      card.style.setProperty('--selection-progress', String(p.selection));
      if (settled && !p.tx && !p.ty && hovered !== card) remove(card);
      else if (!settled) moving = true;
    }
    if (moving) frame = win.requestAnimationFrame(tick);
    else last = null;
  }
  function wake() { if (frame === null) { last = null; frame = win.requestAnimationFrame(tick); } }
  function release() {
    hovered?.classList.remove('hover-raised');
    const p = poses.get(hovered);
    if (p) { p.tx = p.ty = 0; hovered = null; wake(); }
  }
  function move(event) {
    if (!allowed() || !pointer.matches || event.pointerType === 'touch') return;
    const card = event.target.closest?.('[data-card-id]');
    if (!card || !hand.contains(card)) { release(); return; }
    if (card !== hovered) { release(); hovered = card; }
    const p = pose(card);
    card.classList.add('hover-raised');
    // Keep a stable hit rectangle while tilting; transformed bounds would feed back into the spring.
    const nx = Math.max(-1, Math.min(1, (event.clientX - p.bounds.left) / p.bounds.width * 2 - 1));
    const ny = Math.max(-1, Math.min(1, (event.clientY - p.bounds.top) / p.bounds.height * 2 - 1));
    p.tx = -ny * 7; p.ty = nx * 9; wake();
  }
  function leave(event) { if (hovered && !(event.relatedTarget && hovered.contains(event.relatedTarget))) release(); }
  const options = { signal: listeners.signal };
  hand.addEventListener('pointermove', move, options);
  hand.addEventListener('pointerout', leave, options);
  hand.addEventListener('pointercancel', reset, options);
  hand.addEventListener('scroll', reset, { ...options, passive: true });
  win.addEventListener('resize', reset, options);
  win.addEventListener('pagehide', reset, options);
  doc.addEventListener('visibilitychange', reset, options);
  reduced.addEventListener('change', reset, options);
  pointer.addEventListener('change', reset, options);
  const refresh = () => {
    if (!allowed()) { reset(); return; }
    for (const card of poses.keys()) if (!hand.contains(card)) remove(card);
    if (poses.size) wake();
  };
  const observer = new MutationObserver(refresh);
  observer.observe(hand, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
  const api = {
    reset, refresh,
    selectionChanged(card, selected) {
      if (card.classList.contains('selected') !== selected && allowed()) { pose(card); wake(); }
    },
    dispose() { reset(); observer.disconnect(); listeners.abort(); hand.classList.remove('spring-hand'); mounts.delete(hand); },
  };
  mounts.set(hand, api);
  return api;
}
export function resetHandTilt(hand) { mounts.get(hand)?.reset(); }
