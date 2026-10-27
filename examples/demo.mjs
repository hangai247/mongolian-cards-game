import { createDeck, shuffleDeck, prepareMatch, chooseLeader, applyAction, viewForPlayer } from '../dist/engine.js';

// Reproducible demonstration only. A live lobby supplies its own randomness.
let seed = 43;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const startingTeam = Math.floor(random() * 2);
// This demo chooses the team's first seat; a live team chooses its own member.
const leader = startingTeam;
const pending = prepareMatch(shuffleDeck(createDeck(), random), startingTeam);
console.log('Cards dealt; only each player’s own hand is exposed by viewForPlayer.');
// A real team discusses these hands by voice before this confirmation.
const initial = chooseLeader(pending, leader, pending.revision);
const card = initial.hands[leader][0];
const { state, events } = applyAction(initial, {
  type: 'play', player: leader, cards: [card.id], expectedRevision: initial.revision,
});
console.log(`Seat ${leader + 1} leads one card.`);
console.log('Completed transition:', events.map(event => event.type).join(' → '));
console.log(`Leader now has ${state.hands[leader].length} cards; reserve has ${state.reserve.length}.`);
console.log(`Next player: seat ${state.turn + 1}.`);
console.log('Next player’s view:', JSON.stringify(viewForPlayer(state, state.turn), null, 2));
