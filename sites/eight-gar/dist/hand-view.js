import { mountHandTilt } from './hover-tilt.js';
import { mountHandLayout } from './hand-layout.js';
/** Reconcile by card ID so focus, hover and CSS transitions survive selection updates. */
export function reconcileHand(hand, cards, { create, selected, disabled }) {
  const tilt = mountHandTilt(hand);
  const layout = mountHandLayout(hand);
  const changed = cards.length !== hand.children.length || cards.some((card, index) => hand.children[index]?.dataset.cardId !== card.id);
  const before = changed ? layout.capture() : null;
  const focused = hand.ownerDocument.activeElement;
  const scrollLeft = hand.scrollLeft;
  const existing = new Map([...hand.children].map(node => [node.dataset.cardId, node]));
  const wanted = new Set(cards.map(card => card.id));
  hand.classList.toggle('wide-hand', cards.length > 9);
  hand.style.setProperty('--hand-size', cards.length);
  hand.dataset.count = cards.length;
  for (const node of [...hand.children]) if (!wanted.has(node.dataset.cardId)) node.remove();
  cards.forEach((card, index) => {
    const node = existing.get(card.id) ?? create(card);
    tilt.selectionChanged(node, selected.has(card.id));
    node.classList.toggle('selected', selected.has(card.id));
    node.setAttribute('aria-pressed', String(selected.has(card.id)));
    node.disabled = disabled;
    const position = index - (cards.length - 1) / 2;
    node.style.setProperty('--fan', `${cards.length > 9 ? 0 : position * 4}deg`);
    node.style.setProperty('--lift', `calc(var(--hand-card-height,250px) * ${cards.length > 9 ? 0 : Math.abs(position) ** 1.7 * .008})`);
    // Leave correctly ordered nodes attached; moving every node interrupts focus/hover.
    if (hand.children[index] !== node) hand.insertBefore(node, hand.children[index] ?? null);
  });
  if (focused && hand.contains(focused) && hand.ownerDocument.activeElement !== focused) focused.focus({ preventScroll: true });
  hand.scrollLeft = scrollLeft;
  if (changed) layout.animate(before);
  tilt.refresh();
}
