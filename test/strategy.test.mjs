import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, createMatch, shuffleDeck, applyAction, prepareMatch, prepareNextRound, chooseLeader } from '../dist/engine.js';
import { findPlay, chooseComputerLeader } from '../dist/strategy.js';
function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; }
test('computer strategy plays legal full matches with singles and combinations, preserving all cards', () => {
  let multi = 0, pickups = 0, completed = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const random = rng(seed);
    let state = prepareMatch(shuffleDeck(createDeck(), random), seed % 2);
    for (let step = 0; step < 10000 && state.phase !== 'match-over'; step++) {
      if (state.phase === 'round-over') {
        state = prepareNextRound(state, shuffleDeck(createDeck(), random), state.revision);
        continue;
      }
      if (state.phase === 'choosing-leader') {
        const dealt = JSON.stringify(state.hands);
        assert.equal(findPlay(state), null);
        state = chooseLeader(state, chooseComputerLeader(state), state.revision);
        assert.equal(JSON.stringify(state.hands), dealt);
        continue;
      }
      const cards = findPlay(state);
      if (cards?.length > 1) multi++;
      if (!cards) pickups++;
      const result = applyAction(state, { type: cards ? 'play' : 'pickup', ...(cards ? { cards } : {}), player: state.turn, expectedRevision: state.revision });
      state = result.state;
      const inventory = [...state.hands.flat(), ...state.reserve, ...state.table.pile, ...state.sleeping];
      assert.equal(inventory.length, 43); assert.equal(new Set(inventory.map(card => card.id)).size, 43);
    }
    assert.equal(state.phase, 'match-over'); completed++;
  }
  assert.equal(completed, 20); assert(multi > 0); assert(pickups > 0);
});
test('computer decision does not inspect the other players’ card identities', () => {
  const state = createMatch(shuffleDeck(createDeck(), rng(10)), 0);
  const expected = findPlay(state);
  const hidden = { ...state, hands: state.hands.map((hand, i) => i === 0 ? hand : hand.map(() => ({ id: 'hidden' }))) };
  assert.deepEqual(findPlay(hidden), expected);
});

test('computer opener choice uses dealt teammate hands and never inspects opponents or reserve', () => {
  for (const team of [0, 1]) {
    const state = prepareMatch(shuffleDeck(createDeck(), rng(31 + team)), team);
    const expected = chooseComputerLeader(state);
    assert.equal(expected % 2, team);
    const hidden = { ...state, reserve: state.reserve.map(() => ({ id: 'hidden' })), hands: state.hands.map((hand, seat) => seat % 2 === team ? hand : hand.map(() => ({ id: 'hidden' }))) };
    assert.equal(chooseComputerLeader(hidden), expected);
    assert.equal(chooseComputerLeader(chooseLeader(state, expected, state.revision)), null);
  }
});

function threeCardPosition(lowCount, defending = false) {
  const deck = createDeck();
  const c = (suit, rank) => deck.find(card => card.kind === 'ordinary' && card.suit === suit && card.rank === rank);
  const own = defending ? [c('spades','9'), c('diamonds','10'), c('clubs','J'), c('hearts','9'), c('hearts','10')]
    : [c('spades','7'), c('diamonds','7'), c('clubs','8'), c('hearts','9'), c('hearts','10')];
  const low = [c('hearts','7'), c('hearts','8'), c('hearts','J')].slice(0, lowCount);
  const pile = defending ? [c('spades','8'), c('diamonds','8'), c('clubs','9')] : [];
  const used = new Set([...own, ...low, ...pile].map(card => card.id));
  const pool = deck.filter(card => !used.has(card.id));
  const hands = [own, low];
  for (let seat = 2; seat < 8; seat++) hands.push(pool.splice(0, 5));
  hands[7].push(...pool);
  return { ...createMatch(deck, 0), hands, reserve: [], table: { pile, highest: pile } };
}

test('hints and computer players never suggest a three-card lead when any hand is below three', () => {
  for (const count of [1, 2]) {
    const state = threeCardPosition(count);
    const cards = findPlay(state);
    assert.equal(cards.length, 1);
    assert.doesNotThrow(() => applyAction(state, { type: 'play', player: 0, cards, expectedRevision: state.revision }));
  }
  const eligible = threeCardPosition(3);
  assert.equal(findPlay(eligible).length, 3);
});

test('hints still find a three-card defense despite another player holding fewer than three', () => {
  const state = threeCardPosition(1, true);
  const cards = findPlay(state);
  assert.equal(cards.length, 3);
  assert.doesNotThrow(() => applyAction(state, { type: 'play', player: 0, cards, expectedRevision: state.revision }));
});
