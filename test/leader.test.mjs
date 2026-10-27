import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, prepareMatch, chooseLeader, prepareNextRound, applyAction, viewForPlayer } from '../dist/engine.js';
import { fixture, s, play, rejects, freeze, assertConservation } from './helpers.mjs';

for (const team of [0, 1]) test(`team ${team}: deal first and require an eligible leader without changing cards`, () => {
  const state = freeze(prepareMatch(createDeck(), team));
  assert.equal(state.phase, 'choosing-leader');
  assert.equal(state.turn, -1);
  assert.equal(state.openingTeam, team);
  assert.deepEqual(state.hands.map(hand => hand.length), Array(8).fill(5));
  assert.equal(state.reserve.length, 3);
  assertConservation(state);
  for (const leader of [team, team + 2, team + 4, team + 6]) {
    const next = chooseLeader(state, leader, state.revision);
    assert.equal(next.phase, 'playing');
    assert.equal(next.turn, leader);
    assert.equal(next.openingTeam, null);
    assert.deepEqual(next.hands, state.hands);
    assert.deepEqual(next.reserve, state.reserve);
    assert.deepEqual(next.scores, state.scores);
    assert.equal(next.revision, state.revision + 1);
  }
  assert.equal(state.phase, 'choosing-leader');
});

test('discussion rejects all card actions until the team confirms a leader', () => {
  const state = prepareMatch(createDeck(), 0);
  for (let player = 0; player < 8; player++) {
    rejects(() => applyAction(state, { type: 'play', player, cards: [state.hands[player][0].id], expectedRevision: state.revision }), 'LEADER_NOT_CHOSEN');
    rejects(() => applyAction(state, { type: 'pickup', player, expectedRevision: state.revision }), 'LEADER_NOT_CHOSEN');
  }
});

test('leader choice rejects opponents, invalid seats, stale requests and post-confirmation changes', () => {
  const state = prepareMatch(createDeck(), 0);
  rejects(() => chooseLeader(state, 1, state.revision), 'INVALID_LEADER');
  rejects(() => chooseLeader(state, -1, state.revision), 'INVALID_PLAYER');
  rejects(() => chooseLeader(state, 8, state.revision), 'INVALID_PLAYER');
  rejects(() => chooseLeader(state, 0, 999), 'STALE_ACTION');
  rejects(() => prepareMatch(createDeck(), 2), 'INVALID_LEADER');
  const next = chooseLeader(state, 0, state.revision);
  rejects(() => chooseLeader(next, 2, next.revision), 'INVALID_LEADER');
  rejects(() => chooseLeader(next, 0, state.revision), 'STALE_ACTION');
});

test('every player sees only their own hand during the discussion', () => {
  const state = prepareMatch(createDeck(), 0);
  for (let player = 0; player < 8; player++) {
    const view = viewForPlayer(state, player);
    assert.equal(view.turn, -1);
    assert.equal(view.phase, 'choosing-leader');
    assert.equal(view.openingTeam, 0);
    assert.deepEqual(view.hand, state.hands[player]);
    assert.equal('hands' in view, false);
    assert.equal('reserve' in view, false);
    for (const card of [...state.hands.filter((_, seat) => seat !== player).flat(), ...state.reserve]) {
      assert(!JSON.stringify(view).includes(JSON.stringify(card.id)));
    }
  }
});

test('new-round hands are dealt before the winning team chooses, with scores and trump preserved', () => {
  const won = play(fixture({ hands: { 1: [s('7')] }, turn: 1 }), [s('7')]).state;
  const pending = prepareNextRound(won, createDeck(), won.revision);
  assert.equal(pending.phase, 'choosing-leader');
  assert.equal(pending.openingTeam, 1);
  assert.equal(pending.turn, -1);
  assert.equal(pending.round, 2);
  assert.equal(pending.trump, 'diamonds');
  assert.deepEqual(pending.scores, [0, 1]);
  assert.deepEqual(pending.hands.map(hand => hand.length), Array(8).fill(5));
  assert.equal(pending.reserve.length, 3);
  assertConservation(pending);
  const started = chooseLeader(pending, 7, pending.revision);
  assert.deepEqual(started.hands, pending.hands);
  assert.deepEqual(started.reserve, pending.reserve);
  assert.deepEqual(started.scores, [0, 1]);
  assert.equal(started.turn, 7);
  rejects(() => prepareNextRound(pending, createDeck(), pending.revision), 'INVALID_NEXT_ROUND');
});

test('saved discussion round can resume with the identical deal and remains unable to play', () => {
  const pending = prepareMatch(createDeck(), 0);
  const restored = JSON.parse(JSON.stringify(pending));
  rejects(() => applyAction(restored, { type: 'play', player: 0, cards: [restored.hands[0][0].id], expectedRevision: restored.revision }), 'LEADER_NOT_CHOSEN');
  const started = chooseLeader(restored, 4, restored.revision);
  assert.deepEqual(started.hands, pending.hands);
  assert.deepEqual(started.reserve, pending.reserve);
});

test('completed matches cannot deal another discussion round', () => {
  const won = play(fixture({ hands: { 0: [s('7')] }, scores: [4, 2] }), [s('7')]).state;
  rejects(() => prepareNextRound(won, createDeck(), won.revision), 'INVALID_NEXT_ROUND');
});
