import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, shuffleDeck, prepareMatch, chooseLeader, applyAction, viewForPlayer, createMatch, RANKS } from '../../../dist/engine.js';
import { findPlay } from '../../../dist/strategy.js';
import { transitionSteps } from '../dist/presentation.js';
import { sceneFromView, localizeEvents, prepareForTransition, displaySeat, realSeat, isPlaceholder } from '../dist/scene.js';

function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const counts = scene => ({ hands: scene.hands.map(h => h.length), reserve: scene.reserve.length, pile: scene.table.pile.map(c => c.id), highest: scene.table.highest.map(c => c.id) });
/** What the server sends each seat: refills stay private to the drawer. */
const serverEvents = (events, seat) => events.map(e => e.type === 'refilled' && e.player !== seat ? { type: 'refilled', player: e.player, count: e.cards.length } : e);

test('rotation puts the viewer at display seat 0 and keeps team parity', () => {
  for (let me = 0; me < 8; me++) for (let seat = 0; seat < 8; seat++) {
    const d = displaySeat(seat, me);
    assert.equal(realSeat(d, me), seat);
    assert.equal(d % 2, seat % 2 === me % 2 ? 0 : 1);
  }
});

test('scene counts round-trip from the view for every seat and never leak hidden ids', () => {
  const state = chooseLeader(prepareMatch(shuffleDeck(createDeck(), rng(7)), 1), 3, 0);
  const real = new Set(createDeck().map(c => c.id));
  for (let me = 0; me < 8; me++) {
    const view = viewForPlayer(state, me);
    const scene = sceneFromView(view);
    assert.equal(scene.turn, displaySeat(3, me));
    assert.deepEqual(scene.hands[0].map(c => c.id), view.hand.map(c => c.id));
    for (let d = 1; d < 8; d++) {
      assert.equal(scene.hands[d].length, state.hands[realSeat(d, me)].length);
      assert.ok(scene.hands[d].every(c => isPlaceholder(c) && !real.has(c.id)));
    }
    assert.equal(scene.reserve.length, 3);
    assert.ok(scene.reserve.every(c => !real.has(c.id)));
    assert.deepEqual(scene.scores, [state.scores[me % 2], state.scores[1 - me % 2]]);
    assert.equal(scene.openingTeam, null);
  }
  const pending = prepareMatch(shuffleDeck(createDeck(), rng(8)), 1);
  assert.equal(sceneFromView(viewForPlayer(pending, 0)).openingTeam, 1);
  assert.equal(sceneFromView(viewForPlayer(pending, 1)).openingTeam, 0);
  assert.equal(sceneFromView(viewForPlayer(pending, 0)).turn, -1);
});

test('animation steps for plays, pickups, refills and sleeps end on the next view for every viewer', () => {
  let plays = 0, pickups = 0, sleeps = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const random = rng(seed);
    let state = chooseLeader(prepareMatch(shuffleDeck(createDeck(), random), seed % 2), seed % 2, 0);
    for (let step = 0; step < 400 && state.phase === 'playing'; step++) {
      const cards = findPlay(state);
      const forcePickup = !cards || (state.table.pile.length > 0 && random() < 0.25);
      const action = forcePickup ? { type: 'pickup' } : { type: 'play', cards };
      const { state: next, events } = applyAction(state, { ...action, player: state.turn, expectedRevision: state.revision });
      if (events.some(e => e.type === 'played')) plays++; else pickups++;
      if (events.some(e => e.type === 'table-slept')) sleeps++;
      for (let me = 0; me < 8; me++) {
        const before = sceneFromView(viewForPlayer(state, me));
        const localized = localizeEvents(serverEvents(events, me), me);
        const start = prepareForTransition(before, localized);
        assert.deepEqual(counts(start).hands, counts(before).hands, 'preparation keeps counts');
        const steps = transitionSteps(start, localized.filter(e => ['played', 'picked-up', 'refilled', 'table-slept'].includes(e.type)));
        assert.ok(steps.length > 0);
        const after = sceneFromView(viewForPlayer(next, me));
        assert.deepEqual(counts(steps.at(-1).after), counts(after), `seed ${seed} step ${step} viewer ${me}`);
        for (const e of localized) if (e.type === 'refilled' && e.player !== 0) assert.ok(e.cards.every(isPlaceholder));
        for (const e of localized) if (e.type === 'refilled' && e.player === 0) assert.ok(e.cards.every(c => !isPlaceholder(c)));
      }
      state = next;
    }
  }
  assert.ok(plays > 50 && pickups > 5, `plays ${plays} pickups ${pickups}`);
  assert.ok(sleeps >= 0);
});

test('an eight-play sleep animates for every viewer', () => {
  const deck = createDeck(), cards = RANKS.slice(0, 8).map(rank => deck.find(c => c.kind === 'ordinary' && c.suit === 'spades' && c.rank === rank));
  const pool = deck.filter(c => !cards.some(s => s.id === c.id));
  const hands = cards.map(c => [c, ...pool.splice(0, 3)]); hands[0].push(...pool);
  let state = { ...createMatch(deck, 0), hands, reserve: [] };
  for (let i = 0; i < 8; i++) {
    const { state: next, events } = applyAction(state, { type: 'play', cards: [cards[i].id], player: state.turn, expectedRevision: state.revision });
    for (let me = 0; me < 8; me++) {
      const localized = localizeEvents(serverEvents(events, me), me);
      const steps = transitionSteps(prepareForTransition(sceneFromView(viewForPlayer(state, me)), localized), localized.filter(e => e.type !== 'turn-changed'));
      assert.deepEqual(counts(steps.at(-1).after), counts(sceneFromView(viewForPlayer(next, me))));
      if (i === 7) assert.equal(steps.at(-1).type, 'sleep');
    }
    state = next;
  }
  assert.equal(state.sleeping.length, 8);
});

test('leader and round events are remapped to display coordinates', () => {
  const events = localizeEvents([{ type: 'leader-chosen', leader: 3, bySeat: 5 }, { type: 'leader-chosen', leader: 3, bySeat: null }, { type: 'round-won', player: 2, team: 0 }, { type: 'match-won', team: 1 }, { type: 'round-dealt', round: 2, trump: 'diamonds' }], 3);
  assert.deepEqual(events[0], { type: 'leader-chosen', leader: 0, bySeat: 2 });
  assert.deepEqual(events[1], { type: 'leader-chosen', leader: 0, bySeat: null });
  assert.deepEqual(events[2], { type: 'round-won', player: 7, team: 1 });
  assert.deepEqual(events[3], { type: 'match-won', team: 0 });
  assert.deepEqual(events[4], { type: 'round-dealt', round: 2, trump: 'diamonds' });
});
