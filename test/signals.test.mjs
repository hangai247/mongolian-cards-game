import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, prepareMatch, canLeadFive, canLeadThree, isLeadStructure, shuffleDeck } from '../dist/engine.js';
import { availableSetSizes, reconcileSignals, advanceSignals, setSignal, signalsForPlayer } from '../dist/signals.js';
import { fixture, h, d, s, b, j, play, pickup, freeze, rejects, random } from './helpers.mjs';

const five = [h('7'), d('7'), h('8'), d('8'), h('9')];
const position = (extra = {}) => fixture({ hands: { 0: five }, size: 4, ...extra });

test('set possession covers pair + ordinary, triples, two pairs, full house and four of a kind', () => {
  for (const hand of [[h('7'), d('7'), h('8')], [h('7'), d('7'), s('7')]]) assert.deepEqual(availableSetSizes(hand), [3]);
  for (const hand of [five, [h('7'), d('7'), s('7'), h('8'), d('8')], [h('7'), d('7'), s('7'), b('7'), h('8')], [...five, j('red'), s('A')]]) assert.deepEqual(availableSetSizes(hand), [3, 5]);
  assert.deepEqual(availableSetSizes([h('7'), d('7'), s('7'), h('8'), h('9')]), [3]);
  for (const hand of [[], [h('7'), d('7')], [h('7'), d('7'), j('red')], [h('7'), h('8'), h('9'), j('red')], [h('7'), h('7'), h('8')]]) assert.deepEqual(availableSetSizes(hand), []);
  assert.deepEqual(availableSetSizes([h('7'), d('7'), h('8'), d('8'), j('red')]), [3]);
});

test('possession helper agrees with existing lead structures for seeded hands', () => {
  function combinations(hand, size) {
    if (!size) return [[]];
    return hand.flatMap((card, i) => combinations(hand.slice(i + 1), size - 1).map(rest => [card, ...rest]));
  }
  for (let seed = 0; seed < 40; seed++) {
    const hand = shuffleDeck(createDeck(), random(seed)).slice(0, seed % 10);
    assert.deepEqual(availableSetSizes(hand), [3, 5].filter(size => combinations(hand, size).some(isLeadStructure)));
  }
});

test('signals are voluntary, can coexist, and work out of turn and during either opening team discussion', () => {
  for (const phase of ['playing', 'choosing-leader']) {
    const state = freeze({ ...position(), phase, turn: phase === 'playing' ? 1 : -1, openingTeam: phase === 'playing' ? null : 1 });
    const before = JSON.stringify(state);
    assert.equal(canLeadFive(state), false);
    let signals = setSignal(state, [], 0, 3, true, state.revision);
    signals = setSignal(state, signals, 0, 5, true, state.revision);
    assert.deepEqual(signals, [{ seat: 0, size: 3 }, { seat: 0, size: 5 }]);
    assert.deepEqual(setSignal(state, signals, 0, 3, false, state.revision), [{ seat: 0, size: 5 }]);
    assert.equal(JSON.stringify(state), before);
  }
  const restricted = position({ hands: { 0: five, 1: [s('A')] }, size: 4 });
  assert.equal(canLeadThree(restricted), false);
  assert.equal(setSignal(restricted, [], 0, 3, true, 0).length, 1);
});

test('invalid, stale and closed-round declarations cannot change saved signals', () => {
  const state = position();
  rejects(() => setSignal(state, [], 0, 5, true, 99), 'STALE_ACTION');
  rejects(() => setSignal(state, [], 8, 3, true, 0), 'INVALID_PLAYER');
  rejects(() => setSignal(state, [], 0, 4, true, 0), 'INVALID_ACTION');
  const singles = position({ hands: { 0: [s('A'), s('K'), s('Q')] } });
  rejects(() => setSignal(singles, [], 0, 3, true, 0), 'INVALID_CARDS');
  for (const phase of ['round-over', 'match-over']) rejects(() => setSignal({ ...state, phase }, [], 0, 3, true, 0), 'ROUND_CLOSED');
});

test('invalid signals clear after the complete action and never reactivate for a human', () => {
  const state = position();
  const saved = setSignal(state, [], 0, 5, true, 0);
  const after = play(state, [h('7')]).state;
  const cleared = advanceSignals(state, after, saved, []);
  assert.deepEqual(cleared, []);
  const regained = { ...state, revision: after.revision + 1 };
  assert.deepEqual(advanceSignals(after, regained, cleared, []), []);
});

test('automatic refill can preserve a declaration even if the intermediate hand lacks the set', () => {
  const state = position({ reserve: [s('7')] });
  const saved = setSignal(state, [], 0, 5, true, 0);
  const after = play(state, [h('7')]).state;
  assert.deepEqual(advanceSignals(state, after, saved, []), saved);
});

test('pickup preserves valid declarations, and newly gained sets remain voluntary', () => {
  const state = position({ pile: [s('A')], highest: [s('A')] });
  const saved = setSignal(state, [], 0, 3, true, 0);
  const after = pickup(state).state;
  assert.deepEqual(advanceSignals(state, after, saved, []), saved);
});

test('save restoration filters malformed, duplicate and invalid data and defaults old saves to none', () => {
  const state = position();
  assert.deepEqual(reconcileSignals(state, undefined), []);
  const saved = [null, {}, { seat: 0, size: 3, cards: five }, { seat: 0, size: 3 }, { seat: 0, size: 5 }, { seat: 9, size: 3 }, { seat: 1, size: 4 }];
  assert.deepEqual(reconcileSignals(state, JSON.parse(JSON.stringify(saved))), [{ seat: 0, size: 3 }, { seat: 0, size: 5 }]);
  assert.deepEqual(reconcileSignals({ ...state, phase: 'round-over' }, saved), []);
  assert.deepEqual(advanceSignals(state, { ...state, round: 2 }, saved, []), []);
});

test('bots announce on dealing and hand changes without declaring for humans or changing strategy inputs', () => {
  const state = freeze(position());
  const initial = advanceSignals(null, state, [], [2, 4, 6]);
  assert(!initial.some(signal => signal.seat === 0));
  for (const seat of [2, 4, 6]) assert.deepEqual(initial.filter(signal => signal.seat === seat).map(signal => signal.size), availableSetSizes(state.hands[seat]));
  assert.deepEqual(advanceSignals(state, state, [], [2, 4, 6]), []);
  const changed = { ...state, hands: state.hands.map((hand, seat) => seat === 2 ? five : hand) };
  assert.deepEqual(advanceSignals(state, changed, [], [2]), [{ seat: 2, size: 3 }, { seat: 2, size: 5 }]);
});

test('all eight viewers see only their own team, with fresh safe objects', () => {
  const signals = Array.from({ length: 8 }, (_, seat) => ({ seat, size: 3, secret: 'never forward' }));
  for (let viewer = 0; viewer < 8; viewer++) {
    const view = signalsForPlayer(signals, viewer);
    assert.equal(view.length, 4);
    assert(view.every(signal => signal.seat % 2 === viewer % 2));
    assert(view.every(signal => Object.keys(signal).join(',') === 'seat,size'));
  }
  assert.deepEqual(signalsForPlayer(signals, -1), []);
  assert.deepEqual(reconcileSignals(prepareMatch(createDeck(), 0), undefined), []);
});
