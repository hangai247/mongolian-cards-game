/** Legal-move heuristics shared by server bots, timeouts and client hints. Only the acting seat's own cards are read. */
import { RANKS, JOKERS, canLeadThree, canLeadFive, isLeadStructure, beatsSet, type Card, type State, type Suit } from './engine.js';

export function strength(card: Card, trump: Suit): number {
  return card.kind === 'joker' ? 40 + JOKERS.indexOf(card.color) : RANKS.indexOf(card.rank) + (card.suit === trump ? 15 : 0);
}

function* combinations<T>(items: readonly T[], count: number, offset = 0, prefix: readonly T[] = []): Generator<readonly T[]> {
  if (count === 0) { yield prefix; return; }
  for (let index = offset; index <= items.length - count; index++) {
    yield* combinations(items, count - 1, index + 1, [...prefix, items[index]!]);
  }
}

/** Lowest-cost legal play for the seat on turn, or null when only a pickup remains. */
export function findPlay(state: State): string[] | null {
  if (state.phase !== 'playing') return null;
  const hand = [...(state.hands[state.turn] ?? [])].sort((a, b) => strength(a, state.trump) - strength(b, state.trump));
  const target = state.table.highest;
  const sizes = target.length ? [target.length] : canLeadFive(state) ? [5, 3, 1] : canLeadThree(state) ? [3, 1] : [1];
  for (const size of sizes) {
    let best: readonly Card[] | null = null;
    let bestCost = Infinity;
    for (const cards of combinations(hand, size)) {
      if (target.length ? !beatsSet(cards, target, state.trump) : !isLeadStructure(cards)) continue;
      const cost = cards.reduce((sum, card) => sum + strength(card, state.trump), 0);
      if (cost < bestCost) { best = cards; bestCost = cost; }
    }
    if (best) return best.map(card => card.id);
  }
  return null;
}

/** Substitute for a team's voice discussion: compare only the eligible team's dealt hands. */
export function chooseComputerLeader(state: State): number | null {
  if (state.phase !== 'choosing-leader' || state.openingTeam === null) return null;
  let best = state.openingTeam as number;
  let bestScore = -Infinity;
  for (let seat = state.openingTeam; seat < state.hands.length; seat += 2) {
    const hand = state.hands[seat] ?? [];
    const cards = findPlay({ ...state, phase: 'playing', turn: seat }) ?? [];
    const openingCost = cards.reduce((sum, id) => {
      const card = hand.find(candidate => candidate.id === id);
      return sum + (card ? strength(card, state.trump) : 0);
    }, 0);
    const score = cards.length * 100 - openingCost;
    if (score > bestScore) { best = seat; bestScore = score; }
  }
  return best;
}
