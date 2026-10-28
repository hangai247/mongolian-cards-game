import { normalizeAvatar } from './rules/avatars.js';
import { reconcileSignals } from './rules/signals.js';
import { createDeck, SUITS } from './rules/engine.js';

function validSaved(value) {
  const s = value?.state;
  if (value?.format !== 2 || !s || !Array.isArray(s.hands) || s.hands.length !== 8 || !s.hands.every(Array.isArray)
    || !Array.isArray(s.sleeping) || s.sleeping.length % 8 !== 0
    || !Array.isArray(s.reserve) || s.reserve.length > 3 || !Array.isArray(s.table?.pile) || !Array.isArray(s.table?.highest)
    || !Number.isInteger(s.turn) || (s.phase === 'choosing-leader' ? s.turn !== -1 : s.turn < 0 || s.turn > 7) || !Number.isSafeInteger(s.revision) || s.revision < 0
    || !Number.isInteger(s.round) || s.round < 1 || !['choosing-leader', 'playing', 'round-over', 'match-over'].includes(s.phase)
    || s.trump !== SUITS[(s.round - 1) % 4] || !Array.isArray(s.scores) || s.scores.length !== 2
    || !s.scores.every(score => Number.isInteger(score) && score >= 0 && score <= 5)) return false;
  const cards = [...s.hands.flat(), ...s.reserve, ...s.table.pile, ...s.sleeping];
  const expected = new Map(createDeck().map(card => [card.id, JSON.stringify(card)]));
  if (cards.length !== 43 || new Set(cards.map(card => card?.id)).size !== 43
    || cards.some(card => !card || expected.get(card.id) !== JSON.stringify(card))) return false;
  const n = s.table.highest.length;
  if (![0, 1, 3, 5].includes(n) || (!n && s.table.pile.length)
    || (n && (s.table.pile.length % n !== 0 || s.table.pile.length / n >= 8))
    || JSON.stringify(s.table.highest) !== JSON.stringify(n ? s.table.pile.slice(-n) : [])) return false;
  if (s.scores[0] + s.scores[1] !== s.round - (['playing', 'choosing-leader'].includes(s.phase) ? 1 : 0)) return false;
  if (s.phase === 'choosing-leader') return [0, 1].includes(s.openingTeam) && s.winner === null && s.sleeping.length === 0 && s.table.pile.length === 0 && s.reserve.length === 3 && s.hands.every(hand => hand.length === 5) && s.scores.every(score => score < 5);
  if (s.openingTeam != null) return false;
  if (s.phase === 'playing') return s.winner === null && s.hands.every(hand => hand.length > 0) && s.scores.every(score => score < 5);
  return s.winner === s.turn % 2 && s.hands[s.turn].length === 0 && s.reserve.length === 0
    && (s.phase === 'match-over' ? s.scores[s.winner] === 5 : s.scores.every(score => score < 5));
}
/** Migrate compatible earlier saves without inventing turns for old eight-play piles. */
export function readSavedMatch(value) {
  if (value?.format === 1 && value.state) value = { ...value, format: 2, state: { ...value.state, sleeping: [] } };
  if (!validSaved(value)) return null;
  return { format: 2, avatarId: normalizeAvatar(value.avatarId), state: { ...value.state, openingTeam: value.state.openingTeam ?? null }, byRank: value.byRank === true, signals: reconcileSignals(value.state, value.signals) };
}
