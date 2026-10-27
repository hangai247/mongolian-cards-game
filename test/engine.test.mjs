import test from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, SUITS, TEAMS, createDeck, createMatch, shuffleDeck, beatsCard, beatsSet, isLeadStructure, canLeadFive, applyAction, startNextRound } from '../dist/engine.js';
import { c, j, h, s, d, b, fixture, play, pickup, rejects, freeze, random, assertConservation } from './helpers.mjs';

test('exact 43-card deck, confirmed rank order, alternating eight seats, five each and three reserve', () => {
  assert.deepEqual(RANKS, ['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A']);
  assert.deepEqual(TEAMS, [0, 1, 0, 1, 0, 1, 0, 1]);
  const deck = createDeck();
  const state = createMatch(deck, 3);
  assertConservation(state);
  assert.deepEqual(state.hands.map(hand => hand.length), Array(8).fill(5));
  assert.deepEqual(state.reserve, deck.slice(40));
  assert.equal(state.turn, 3);
  assert.equal(state.trump, 'hearts');
  assert.equal(state.revision, 0);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.hands[0], [deck[0], deck[8], deck[16], deck[24], deck[32]]);
});

test('deck validation rejects missing, extra, duplicated, unknown and relabelled duplicate cards', () => {
  const deck = createDeck();
  for (const bad of [deck.slice(1), [...deck, deck[0]], [deck[0], ...deck.slice(0, -1)],
    [{ ...deck[0], rank: '6' }, ...deck.slice(1)], [{ ...deck[0], id: 'another' }, deck[0], ...deck.slice(2)],
    [{ ...deck[0], id: '' }, ...deck.slice(1)]]) rejects(() => createMatch(bad, 0), 'INVALID_DECK');
});

test('invalid starting seats fail', () => {
  for (const seat of [-1, 8, 1.5, NaN]) rejects(() => createMatch(createDeck(), seat), 'INVALID_PLAYER');
});

test('shuffle is reproducible with supplied seed, preserves cards, and leaves input intact', () => {
  const deck = freeze(createDeck());
  const shuffled = shuffleDeck(deck, random(42));
  assert.deepEqual(shuffled, shuffleDeck(deck, random(42)));
  assert.notDeepEqual(shuffled, deck);
  assert.deepEqual(shuffled.map(card => card.id).sort(), deck.map(card => card.id).sort());
  for (const sample of [-1, 1, NaN, Infinity]) rejects(() => shuffleDeck(deck, () => sample), 'INVALID_DECK');
});

test('the confirmed unusual rank order is strict in every suit', () => {
  for (const suit of SUITS) for (let x = 0; x < RANKS.length; x++) for (let y = 0; y < RANKS.length; y++) {
    assert.equal(beatsCard(c(suit, RANKS[x]), c(suit, RANKS[y]), 'hearts'), x > y);
  }
});

test('trump beats any ordinary off-suit card; unrelated non-trump suits cannot beat each other', () => {
  for (const trump of SUITS) for (const suit of SUITS.filter(value => value !== trump)) {
    assert(beatsCard(c(trump, '7'), c(suit, 'A'), trump));
    assert(!beatsCard(c(suit, 'A'), c(trump, '7'), trump));
  }
  assert(!beatsCard(s('A'), d('7'), 'hearts'));
});

test('gray < black < red and every joker beats the trump ace', () => {
  for (const [index, color] of ['gray', 'black', 'red'].entries()) {
    assert(beatsCard(j(color), h('A'), 'hearts'));
    assert(!beatsCard(h('A'), j(color), 'hearts'));
    for (const [otherIndex, other] of ['gray', 'black', 'red'].entries()) {
      assert.equal(beatsCard(j(color), j(other), 'hearts'), index > otherIndex);
    }
  }
});

test('three-card lead accepts pair plus any card, including a triple', () => {
  assert(isLeadStructure([s('7'), d('7'), b('8')]));
  assert(isLeadStructure([s('7'), d('7'), b('7')]));
  assert(!isLeadStructure([s('7'), d('8'), b('9')]));
});

test('five-card lead accepts two pairs, full house or four of a kind; a triple alone is insufficient', () => {
  assert(isLeadStructure([s('7'), d('7'), s('8'), d('8'), b('9')]));
  assert(isLeadStructure([s('7'), d('7'), b('7'), s('8'), d('8')]));
  assert(isLeadStructure([s('7'), d('7'), b('7'), h('7'), d('8')]));
  assert(!isLeadStructure([s('7'), d('7'), b('7'), s('8'), d('9')]));
});

test('only one, three and five cards can be led', () => {
  for (const count of [0, 2, 4, 6]) assert(!isLeadStructure(createDeck().slice(0, count)));
  assert(isLeadStructure([j('red')]));
});

test('jokers are forbidden in both multi-card leads and responses', () => {
  assert(!isLeadStructure([s('7'), d('7'), j('red')]));
  assert(!isLeadStructure([s('7'), d('7'), s('8'), d('8'), j('red')]));
  assert(!beatsSet([s('8'), d('8'), j('red')], [s('7'), d('7'), b('7')], 'hearts'));
  const state = fixture({ hands: { 0: [s('7'), d('7'), j('red')] } });
  rejects(() => play(state, state.hands[0]), 'INVALID_LEAD');
});

test('matching backtracks when spending trump on the first target would prevent a valid response', () => {
  // Trump 8 can beat spades 7 or hearts 7; spades 8 can only beat spades 7.
  assert(beatsSet([h('8'), s('8'), b('8')], [s('7'), h('7'), b('7')], 'hearts'));
  assert(beatsSet([b('8'), s('8'), h('8')], [h('7'), b('7'), s('7')], 'hearts'));
});

test('one powerful card cannot cover two target cards; count must match', () => {
  assert(!beatsSet([h('A'), d('7'), b('7')], [s('8'), s('9'), s('10')], 'hearts'));
  assert(!beatsSet([h('A')], [s('7'), d('7'), b('7')], 'hearts'));
  assert(!beatsSet([], [], 'hearts'));
});

test('defending three-card set needs no pair and only replaces the highest play', () => {
  const target = [s('7'), d('7'), b('8')];
  const cards = [s('8'), d('9'), b('10')];
  const state = fixture({ hands: { 0: [...cards, h('7')] }, pile: target, highest: target, size: 1 });
  const next = play(state, cards).state;
  assert.deepEqual(next.table.highest, cards);
  assert.deepEqual(next.table.pile, [...target, ...cards]);
});

for (const mode of ['lead', 'defend']) for (const remaining of [1, 2, 3]) {
  test(`${mode}: empty hand refills from ${remaining} reserve cards before victory or next turn`, () => {
    const reserve = [d('A'), b('A'), s('A')].slice(0, remaining);
    const target = mode === 'defend' ? [s('7')] : [];
    const state = fixture({ hands: { 0: [s('8')] }, reserve, pile: target, highest: target, size: 1 });
    const result = play(state, [s('8')]);
    assert.deepEqual(result.state.hands[0], reserve);
    assert.deepEqual(result.state.reserve, []);
    assert.equal(result.state.phase, 'playing');
    assert.equal(result.state.winner, null);
    assert.deepEqual(result.state.scores, [0, 0]);
    assert.equal(result.state.turn, 1);
    assert.deepEqual(result.events.map(event => event.type), ['played', 'refilled', 'turn-changed']);
  });
}

test('three-card opening draws all three reserve cards in order and returns to five', () => {
  const cards = [s('7'), d('7'), b('8')];
  const reserve = [j('gray'), j('black'), j('red')];
  const state = fixture({ hands: { 0: [...cards, h('7'), h('8')] }, reserve });
  const result = play(state, cards);
  assert.deepEqual(result.state.hands[0], [h('7'), h('8'), ...reserve]);
  assert.equal(result.state.reserve.length, 0);
});

test('single opening draws only one, preserving reserve order for subsequent players', () => {
  const state = fixture({ hands: { 0: [s('7'), d('7'), b('7'), h('7'), h('8')] }, reserve: [j('gray'), j('black'), j('red')] });
  const result = play(state, [s('7')]);
  assert.equal(result.state.hands[0].length, 5);
  assert.equal(result.state.hands[0].at(-1).id, j('gray').id);
  assert.deepEqual(result.state.reserve, [j('black'), j('red')]);
});

for (const handSize of [6, 7]) test(`no reserve draw when ${handSize - 1} cards remain after playing`, () => {
  const cards = [s('7'), s('8'), s('9'), s('10'), s('J'), s('Q'), s('K')].slice(0, handSize);
  const state = fixture({ hands: { 0: cards }, reserve: [j('red')], size: 1 });
  const result = play(state, [s('7')]);
  assert.deepEqual(result.state.reserve, [j('red')]);
  assert.deepEqual(result.events.map(event => event.type), ['played', 'turn-changed']);
});

for (const mode of ['lead', 'defend']) test(`${mode}: empty hand and empty reserve ends round immediately`, () => {
  const target = mode === 'defend' ? [s('7')] : [];
  const state = fixture({ hands: { 0: [s('8')] }, pile: target, highest: target, size: 1 });
  const result = play(state, [s('8')]);
  assert.equal(result.state.phase, 'round-over');
  assert.equal(result.state.winner, 0);
  assert.deepEqual(result.state.scores, [1, 0]);
  assert.equal(result.state.turn, 0);
  assert.deepEqual(result.events.map(event => event.type), ['played', 'round-won']);
  rejects(() => pickup(result.state), 'ROUND_CLOSED');
});

const five = () => [s('7'), d('7'), s('8'), d('8'), b('9')];
test('five-card lead uses pre-play hand sizes: leader with exactly five wins immediately', () => {
  const state = fixture({ hands: { 0: five() } });
  assert(canLeadFive(state));
  const result = play(state, five());
  assert.equal(result.state.phase, 'round-over');
  assert.equal(result.state.hands[0].length, 0);
});

test('five-card lead with more than five leaves the round active', () => {
  const state = fixture({ hands: { 0: [...five(), h('A')] } });
  const result = play(state, five());
  assert.equal(result.state.phase, 'playing');
  assert.equal(result.state.hands[0].length, 1);
});

test('five-card lead is blocked if even one reserve card remains', () => {
  const state = fixture({ hands: { 0: five() }, reserve: [j('red')] });
  assert(!canLeadFive(state));
  rejects(() => play(state, five()), 'FIVE_CARD_LEAD_BLOCKED');
});

for (let seat = 1; seat < 8; seat++) test(`five-card lead checks seat ${seat}, including teammates and non-next seats`, () => {
  const state = fixture({ hands: { 0: five(), [seat]: [h('7'), h('8'), h('9'), h('10')] } });
  assert(!canLeadFive(state));
  rejects(() => play(state, five()), 'FIVE_CARD_LEAD_BLOCKED');
});

test('five-card responses do not require pairs or every player to hold five', () => {
  const target = [s('7'), d('7'), s('8'), d('8'), b('9')];
  const response = [s('9'), d('10'), s('J'), d('Q'), b('K')];
  const state = fixture({ hands: { 0: [...response, h('A')], 1: [h('7')] }, pile: target, highest: target, size: 1 });
  assert(!isLeadStructure(response));
  assert(!canLeadFive(state));
  const result = play(state, response);
  assert.equal(result.state.phase, 'playing');
  assert.deepEqual(result.state.table.highest, response);
});

test('lead-only reserve restriction is not applied to defense, even on an imported synthetic position', () => {
  // Such a five-card table with reserve cannot arise from legal engine moves.
  // This isolates the lead-only predicate instead of claiming it is reachable.
  const target = five();
  const response = [s('9'), d('10'), s('J'), d('Q'), b('K')];
  const state = fixture({ hands: { 0: response }, reserve: [j('red')], pile: target, highest: target, size: 1 });
  const result = play(state, response);
  assert.deepEqual(result.state.hands[0], [j('red')]);
  assert.equal(result.state.phase, 'playing');
});

test('voluntary pickup takes the entire accumulated pile and never refills, even below five', () => {
  const state = fixture({ hands: { 0: [s('9')] }, reserve: [j('red')], pile: [s('7'), s('8')], highest: [s('8')], size: 1 });
  assert(beatsCard(s('9'), s('8'), state.trump));
  const result = pickup(state);
  assert.deepEqual(result.state.hands[0], [s('9'), s('7'), s('8')]);
  assert.deepEqual(result.state.reserve, [j('red')]);
  assert.deepEqual(result.state.table, { pile: [], highest: [] });
  assert.equal(result.state.turn, 1);
  assert.deepEqual(result.events.map(event => event.type), ['picked-up', 'turn-changed']);
  const lead = result.state.hands[1][0];
  assert.equal(play(result.state, [lead]).events[0].lead, true);
});

test('pickup works for a six-card accumulated pair-set pile and can exceed five cards', () => {
  const target = [s('7'), d('7'), b('8')];
  const response = [s('8'), d('8'), b('9')];
  const state = fixture({ hands: { 0: [h('7'), h('8')] }, pile: [...target, ...response], highest: response, size: 1 });
  assert.equal(pickup(state).state.hands[0].length, 8);
});

test('pickup on an empty table is invalid', () => rejects(() => pickup(fixture()), 'NOTHING_TO_PICK_UP'));

test('seat seven advances to seat zero after a non-winning move', () => {
  const state = fixture({ turn: 7 });
  assert.equal(play(state, [state.hands[7][0]]).state.turn, 0);
});

test('a teammate may beat a teammate’s earlier play after an intervening opponent beats', () => {
  const state = fixture({ hands: { 0: [s('7'), b('7')], 1: [s('8'), b('8')], 2: [s('9'), b('9')] }, size: 1 });
  const first = play(state, [s('7')]).state;
  const second = play(first, [s('8')]).state;
  const third = play(second, [s('9')]).state;
  assert.deepEqual(third.table.pile, [s('7'), s('8'), s('9')]);
  assert.equal(third.turn, 3);
});

test('invalid moves reject without changing frozen input', () => {
  const state = freeze(fixture({ hands: { 0: [s('7'), d('7'), b('8')] } }));
  const before = structuredClone(state);
  rejects(() => play(state, [s('7')], { player: 1 }), 'WRONG_TURN');
  rejects(() => play(state, [s('7')], { player: 8 }), 'INVALID_PLAYER');
  rejects(() => play(state, [s('7')], { expectedRevision: 99 }), 'STALE_ACTION');
  rejects(() => play(state, []), 'INVALID_CARDS');
  rejects(() => play(state, [s('7'), s('7')]), 'INVALID_CARDS');
  rejects(() => play(state, [h('A')]), 'INVALID_CARDS');
  rejects(() => play(state, [s('7'), d('7')]), 'INVALID_LEAD');
  rejects(() => applyAction(state, { type: 'pass', player: 0, expectedRevision: 0 }), 'INVALID_ACTION');
  assert.deepEqual(state, before);
});

test('failed defense does not draw or remove cards', () => {
  const state = freeze(fixture({ hands: { 0: [s('7')] }, reserve: [j('red')], pile: [s('8')], highest: [s('8')], size: 1 }));
  const before = structuredClone(state);
  rejects(() => play(state, [s('7')]), 'INVALID_RESPONSE');
  assert.deepEqual(state, before);
});

test('successful transition and events share no mutable card objects with input or each other', () => {
  const state = freeze(fixture({ hands: { 0: [s('7'), s('8')] }, reserve: [j('red')], size: 1 }));
  const result = play(state, [s('7')]);
  result.events[0].cards[0].id = 'edited-event';
  result.events[1].cards[0].id = 'edited-draw-event';
  assert.equal(result.state.table.highest[0].id, s('7').id);
  assert.equal(result.state.hands[0].at(-1).id, j('red').id);
  assert.equal(state.hands[0][0].id, s('7').id);
});

test('stale replay is rejected after a turn and after a round reset', () => {
  const state = fixture();
  const action = { type: 'play', player: 0, cards: [state.hands[0][0].id], expectedRevision: 0 };
  const next = applyAction(state, action).state;
  rejects(() => applyAction(next, action), 'STALE_ACTION');
  const won = play(fixture({ hands: { 0: [s('7')] } }), [s('7')]).state;
  const reset = startNextRound(won, createDeck(), 0, won.revision);
  rejects(() => startNextRound(reset, createDeck(), 0, won.revision), 'STALE_ACTION');
});

test('each team can win and receives exactly one point', () => {
  for (const seat of [0, 1, 6, 7]) {
    const state = fixture({ hands: { [seat]: [s('7')] }, turn: seat });
    const result = play(state, [s('7')]).state;
    assert.equal(result.winner, seat % 2);
    assert.equal(result.scores[seat % 2], 1);
    rejects(() => play(result, [s('7')]), 'ROUND_CLOSED');
  }
});

test('any winning teammate can lead next round; opponents and premature restarts fail', () => {
  const active = fixture({ hands: { 0: [s('7')] } });
  rejects(() => startNextRound(active, createDeck(), 0, active.revision), 'INVALID_NEXT_ROUND');
  const won = play(active, [s('7')]).state;
  for (const seat of [0, 2, 4, 6]) {
    const next = startNextRound(won, createDeck(), seat, won.revision);
    assertConservation(next);
    assert.equal(next.turn, seat);
    assert.equal(next.trump, 'diamonds');
    assert.equal(next.round, 2);
    assert.equal(next.winner, null);
    assert.deepEqual(next.scores, [1, 0]);
    assert.deepEqual(next.hands.map(hand => hand.length), Array(8).fill(5));
    assert.equal(next.reserve.length, 3);
    assert.deepEqual(next.table, { pile: [], highest: [] });
  }
  for (const seat of [1, 3, 5, 7]) rejects(() => startNextRound(won, createDeck(), seat, won.revision), 'INVALID_NEXT_ROUND');
});

test('trump cycles hearts, diamonds, spades, clubs, hearts', () => {
  for (let round = 1; round <= 8; round++) {
    const state = fixture({ hands: { 0: [s('7')] }, round, trump: SUITS[(round - 1) % 4] });
    const won = play(state, [s('7')]).state;
    const next = startNextRound(won, createDeck(), 0, won.revision);
    assert.equal(next.trump, SUITS[round % 4]);
  }
});

test('fifth round win ends the match, blocks further play and blocks a new round', () => {
  for (const seat of [0, 1]) {
    const state = fixture({ hands: { [seat]: [s('7')] }, turn: seat, scores: seat ? [2, 4] : [4, 2] });
    const result = play(state, [s('7')]);
    assert.equal(result.state.phase, 'match-over');
    assert.equal(result.state.scores[seat], 5);
    assert.deepEqual(result.events.map(event => event.type), ['played', 'round-won', 'match-won']);
    rejects(() => pickup(result.state), 'ROUND_CLOSED');
    rejects(() => startNextRound(result.state, createDeck(), seat, result.state.revision), 'INVALID_NEXT_ROUND');
  }
});

test('last-card refill cannot award a fifth match point', () => {
  const state = fixture({ hands: { 0: [s('7')] }, reserve: [j('red')], scores: [4, 4], size: 1 });
  const result = play(state, [s('7')]);
  assert.equal(result.state.phase, 'playing');
  assert.deepEqual(result.state.scores, [4, 4]);
});

test('100 seeded legal-play simulations preserve all 43 cards, turn order and atomic refill', () => {
  let completed = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const rng = random(seed);
    let state = createMatch(shuffleDeck(createDeck(), rng), seed % 8);
    for (let step = 0; step < 3000 && state.phase === 'playing'; step++) {
      const hand = state.hands[state.turn];
      const target = state.table.highest;
      const card = target.length ? hand.find(card => beatsCard(card, target[0], state.trump)) : hand[Math.floor(rng() * hand.length)];
      const previous = state;
      const result = card ? play(state, [card]) : pickup(state);
      state = result.state;
      assert.equal(state.revision, previous.revision + 1);
      if (state.phase === 'playing') assert.equal(state.turn, result.events.some(event => event.type === 'table-slept') ? previous.turn : (previous.turn + 1) % 8);
      if (card && state.reserve.length > 0) assert(state.hands[previous.turn].length >= 5);
      if (state.phase !== 'playing') {
        completed++;
        assert.equal(state.reserve.length, 0);
        assert.equal(state.hands[previous.turn].length, 0);
        assert.equal(result.events.some(event => event.type === 'turn-changed'), false);
      }
    }
  }
  assert.equal(completed, 100, 'these seeded single-card policies finish within the bound; arbitrary play need not terminate');
});

test('public set predicates reject using the same physical card twice', () => {
  assert(!isLeadStructure([s('7'), s('7'), d('8')]));
  assert(!beatsSet([h('A'), h('A'), h('A')], [s('7'), d('7'), b('7')], 'hearts'));
  assert(!beatsSet([s('8'), d('8'), b('8')], [s('7'), s('7'), b('7')], 'hearts'));
});

test('malformed action objects are rejected', () => {
  const state = fixture();
  for (const action of [null, undefined, 'play', {}, { type: 'draw' }]) {
    rejects(() => applyAction(state, action), 'INVALID_ACTION');
  }
  rejects(() => applyAction(state, { type: 'play', player: 0, expectedRevision: 0, cards: null }), 'INVALID_CARDS');
});

test('three-card defense automatically refills before handing over the turn', () => {
  const target = [s('7'), d('7'), b('8')];
  const cards = [s('8'), d('9'), b('10')];
  const state = fixture({ hands: { 0: [...cards, h('7'), h('8')] }, reserve: [j('gray'), j('black')], pile: target, highest: target, size: 1 });
  const result = play(state, cards);
  assert.deepEqual(result.state.hands[0], [h('7'), h('8'), j('gray'), j('black')]);
  assert.deepEqual(result.events.map(event => event.type), ['played', 'refilled', 'turn-changed']);
});

test('player views hide all other hands and the reserve identities', async () => {
  const { viewForPlayer } = await import('../dist/engine.js');
  const state = freeze(createMatch(createDeck(), 0));
  for (let seat = 0; seat < 8; seat++) {
    const view = viewForPlayer(state, seat);
    assert.deepEqual(view.hand, state.hands[seat]);
    assert.deepEqual(view.handCounts, Array(8).fill(5));
    assert.equal(view.reserveCount, 3);
    assert.equal('hands' in view, false);
    assert.equal('reserve' in view, false);
    const visible = JSON.stringify(view);
    for (const hidden of [...state.reserve, ...state.hands.filter((_, index) => index !== seat).flat()]) {
      assert(!visible.includes(JSON.stringify(hidden.id)));
    }
    view.hand[0].id = 'edited';
    assert.notEqual(state.hands[seat][0].id, 'edited');
  }
  rejects(() => viewForPlayer(state, 8), 'INVALID_PLAYER');
});

test('player may choose trump despite holding a same-suit winning card', () => {
  const state = fixture({ hands: { 0: [h('7'), s('8'), d('7')] }, pile: [s('7')], highest: [s('7')], size: 1 });
  const result = play(state, [h('7')]);
  assert.deepEqual(result.state.table.highest, [h('7')]);
  assert(result.state.hands[0].some(card => card.id === s('8').id));
});
