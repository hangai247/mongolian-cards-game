import assert from 'node:assert/strict';
import { createDeck, createMatch, applyAction } from '../dist/engine.js';

export const c = (suit, rank) => createDeck().find(card => card.kind === 'ordinary' && card.suit === suit && card.rank === rank);
export const j = color => createDeck().find(card => card.kind === 'joker' && card.color === color);
export const h = rank => c('hearts', rank);
export const s = rank => c('spades', rank);
export const d = rank => c('diamonds', rank);
export const b = rank => c('clubs', rank);

// Complete 43-card fixtures. Explicit hands stay exactly as specified; unused
// cards are distributed to unspecified seats, so no cards are invented/lost.
export function fixture({ hands = {}, reserve = [], sleeping = [], pile = [], highest = [], turn = 0, size = 5, ...overrides } = {}) {
  const allocated = [...Object.values(hands).flat(), ...reserve, ...pile, ...sleeping];
  assert(allocated.every(Boolean), 'fixture references an unknown card');
  assert.equal(new Set(allocated.map(card => card.id)).size, allocated.length, 'fixture duplicates a physical card');
  const used = new Set(allocated.map(card => card.id));
  const pool = createDeck().filter(card => !used.has(card.id));
  const result = Array.from({ length: 8 }, (_, seat) => hands[seat] ? [...hands[seat]] : []);
  const emptySeats = result.map((_, seat) => seat).filter(seat => hands[seat] === undefined);
  assert(pool.length >= emptySeats.length * size, 'fixture has too few unallocated cards');
  for (const seat of emptySeats) result[seat].push(...pool.splice(0, size));
  assert(emptySeats.length > 0 || pool.length === 0, 'fixture must place every card');
  if (pool.length) result[emptySeats.at(-1)].push(...pool);
  const state = { ...createMatch(createDeck(), turn), hands: result, reserve: [...reserve], sleeping: [...sleeping], table: { pile: [...pile], highest: [...highest] }, ...overrides };
  assertConservation(state);
  return state;
}
export function assertConservation(state) {
  const cards = [...state.hands.flat(), ...state.reserve, ...state.table.pile, ...state.sleeping];
  assert.equal(cards.length, 43);
  assert.equal(new Set(cards.map(card => card.id)).size, 43);
  assert.deepEqual(cards.map(card => card.id).sort(), createDeck().map(card => card.id).sort());
  assert.deepEqual(state.table.highest.map(card => card.id), state.table.pile.slice(-state.table.highest.length || state.table.pile.length).map(card => card.id));
}
export function play(state, cards, extra = {}) {
  const result = applyAction(state, { type: 'play', player: state.turn, cards: cards.map(card => card.id), expectedRevision: state.revision, ...extra });
  assertConservation(result.state);
  return result;
}
export function pickup(state, extra = {}) {
  const result = applyAction(state, { type: 'pickup', player: state.turn, expectedRevision: state.revision, ...extra });
  assertConservation(result.state);
  return result;
}
export function rejects(fn, code) { assert.throws(fn, error => error.name === 'RuleError' && error.code === code); }
export function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
export function random(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(1664525, value) + 1013904223) >>> 0; return value / 2 ** 32; };
}
