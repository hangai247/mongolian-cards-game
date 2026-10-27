import { RANKS, JOKERS, canLeadThree, canLeadFive, isLeadStructure, beatsSet } from './engine.js';
export function strength(card, trump) {
  return card.kind === 'joker' ? 40 + JOKERS.indexOf(card.color) : RANKS.indexOf(card.rank) + (card.suit === trump ? 15 : 0);
}
function* combinations(cards, count, offset = 0, prefix = []) {
  if (!count) { yield prefix; return; }
  for (let index = offset; index <= cards.length - count; index++) yield* combinations(cards, count - 1, index + 1, [...prefix, cards[index]]);
}
/** Only own cards, public table/trump and hand counts influence selection. */
export function findPlay(state) {
  if (state.phase !== 'playing') return null;
  const hand = [...state.hands[state.turn]].sort((a, b) => strength(a, state.trump) - strength(b, state.trump));
  const target = state.table.highest;
  const sizes = target.length ? [target.length] : canLeadFive(state) ? [5, 3, 1] : canLeadThree(state) ? [3, 1] : [1];
  for (const size of sizes) {
    let best = null, bestCost = Infinity;
    for (const cards of combinations(hand, size)) {
      if (target.length ? !beatsSet(cards, target, state.trump) : !isLeadStructure(cards)) continue;
      const cost = cards.reduce((sum, card) => sum + strength(card, state.trump), 0);
      if (cost < bestCost) { best = cards; bestCost = cost; }
    }
    if (best) return best.map(card => card.id);
  }
  return null;
}

/** Practice substitute for a team's discussion: compare only the eligible team's dealt hands. */
export function chooseComputerLeader(state) {
  if (state.phase !== 'choosing-leader' || ![0, 1].includes(state.openingTeam)) return null;
  let best = state.openingTeam, bestScore = -Infinity;
  for (let seat = state.openingTeam; seat < 8; seat += 2) {
    const hand = state.hands[seat];
    const cards = findPlay({ ...state, phase: 'playing', turn: seat });
    const openingCost = cards.reduce((sum, id) => sum + strength(hand.find(card => card.id === id), state.trump), 0);
    const score = cards.length * 100 - openingCost;
    if (score > bestScore) { best = seat; bestScore = score; }
  }
  return best;
}
