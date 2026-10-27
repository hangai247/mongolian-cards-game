import test from 'node:test';
import assert from 'node:assert/strict';
import { canLeadThree, prepareMatch, createDeck } from '../dist/engine.js';
import { fixture, s, d, b, h, j, play, pickup, rejects, freeze } from './helpers.mjs';
const three = () => [s('7'), d('7'), b('8')];

for (let seat = 1; seat < 8; seat++) for (const count of [1, 2]) {
  test(`three-card lead blocked by seat ${seat} holding ${count} cards, with no state changes`, () => {
    const state = freeze(fixture({ hands: { 0: [...three(), h('9')], [seat]: [h('7'), h('8')].slice(0, count) }, size: 3 }));
    const before = structuredClone(state);
    assert.equal(canLeadThree(state), false);
    rejects(() => play(state, three()), 'THREE_CARD_LEAD_BLOCKED');
    assert.deepEqual(state, before);
  });
}

test('exactly three in the leader’s hand is checked before play and can win', () => {
  const state = fixture({ hands: { 0: three() }, size: 3 });
  assert(canLeadThree(state));
  const result = play(state, three());
  assert.equal(result.state.phase, 'round-over');
  assert.equal(result.state.hands[0].length, 0);
});

test('three-card lead has no empty-reserve restriction and refills before victory', () => {
  const state = fixture({ hands: { 0: three() }, reserve: [j('gray'), j('black'), j('red')], size: 3 });
  assert(canLeadThree(state));
  const result = play(state, three());
  assert.equal(result.state.phase, 'playing');
  assert.equal(result.state.hands[0].length, 3);
  assert.equal(result.state.reserve.length, 0);
});

test('triple lead must satisfy the same every-hand minimum', () => {
  const cards = [s('7'), d('7'), b('7')];
  const state = fixture({ hands: { 0: cards, 6: [h('7'), h('8')] }, size: 3 });
  rejects(() => play(state, cards), 'THREE_CARD_LEAD_BLOCKED');
});

test('a low hand does not block a single-card lead', () => {
  const state = fixture({ hands: { 0: [...three(), h('9')], 1: [h('7')] }, size: 3 });
  assert.equal(play(state, [s('7')]).state.turn, 1);
});

test('eligibility is recalculated after pickup restores the low hand to at least three', () => {
  const target = [s('8'), d('8'), b('9')];
  const state = fixture({ turn: 1, hands: { 1: [h('7'), h('8')], 2: three() }, pile: target, highest: target, size: 3 });
  assert.equal(canLeadThree(state), false);
  const next = pickup(state).state;
  assert.equal(next.turn, 2);
  assert.equal(next.hands[1].length, 5);
  assert.equal(canLeadThree(next), true);
  assert.equal(play(next, three()).state.phase, 'round-over');
});

test('eligibility includes the leader, empty table and active round', () => {
  const lowLeader = fixture({ hands: { 0: [s('7'), d('7')] }, size: 3 });
  assert.equal(canLeadThree(lowLeader), false);
  const target = [s('8')];
  assert.equal(canLeadThree(fixture({ pile: target, highest: target, size: 3 })), false);
  assert.equal(canLeadThree(prepareMatch(createDeck(), 0)), false);
  const won = play(fixture({ hands: { 0: three() }, size: 3 }), three()).state;
  assert.equal(canLeadThree(won), false);
});

test('three-card defense remains legal when another player has only one card', () => {
  const target = [s('7'), d('7'), b('8')];
  const response = [s('8'), d('9'), b('10')];
  const state = fixture({ hands: { 0: [...response, h('9')], 6: [h('7')] }, pile: target, highest: target, size: 3 });
  assert.equal(canLeadThree(state), false);
  const result = play(state, response);
  assert.deepEqual(result.state.table.highest, response);
  assert.equal(result.state.phase, 'playing');
});
