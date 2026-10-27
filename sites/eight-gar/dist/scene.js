/** Rotates a server PlayerView into the State-shaped "scene" the renderer, animations and hint logic expect.
 *  Display seat 0 is always the viewer; hidden cards are opaque placeholders, never real identities. */
const SEATS = 8;
export const displaySeat = (seat, me) => (((seat - me) % SEATS) + SEATS) % SEATS;
export const realSeat = (display, me) => (display + me) % SEATS;
const copy = card => ({ ...card });
export const isPlaceholder = card => card?.kind === 'back';
export function placeholders(count, prefix) {
  return Array.from({ length: Math.max(0, count | 0) }, (_, n) => ({ id: `back:${prefix}:${n}`, kind: 'back' }));
}
/** Team 0 in a scene is always "my team"; 1 is the other team. */
const relativeTeam = (team, myTeam) => (team === null || team === undefined ? null : team === myTeam ? 0 : 1);

export function sceneFromView(view) {
  const me = view.player, myTeam = view.team ?? me % 2;
  const hands = [];
  for (let d = 0; d < SEATS; d++) {
    const seat = realSeat(d, me);
    hands[d] = d === 0 ? view.hand.map(copy) : placeholders(view.handCounts[seat] ?? 0, seat);
  }
  return {
    me, hands,
    reserve: placeholders(view.reserveCount, 'reserve'),
    sleeping: [],
    table: { pile: view.table.pile.map(copy), highest: view.table.highest.map(copy) },
    turn: view.turn < 0 ? -1 : displaySeat(view.turn, me),
    round: view.round, trump: view.trump,
    scores: [view.scores[myTeam] ?? 0, view.scores[1 - myTeam] ?? 0],
    phase: view.phase,
    openingTeam: relativeTeam(view.openingTeam, myTeam),
    winner: relativeTeam(view.winner, myTeam),
    revision: view.revision,
  };
}

/** Maps server events into display coordinates. Other players' refills become placeholder cards. */
export function localizeEvents(events, me) {
  const myTeam = me % 2;
  return events.map(event => {
    switch (event.type) {
      case 'played': case 'picked-up': case 'table-slept': case 'turn-changed':
        return { ...event, player: displaySeat(event.player, me) };
      case 'refilled':
        return event.cards
          ? { type: 'refilled', player: displaySeat(event.player, me), cards: event.cards.map(copy) }
          : { type: 'refilled', player: displaySeat(event.player, me), cards: placeholders(event.count, `draw:${event.player}`) };
      case 'round-won':
        return { ...event, player: displaySeat(event.player, me), team: relativeTeam(event.team, myTeam) };
      case 'match-won':
        return { ...event, team: relativeTeam(event.team, myTeam) };
      case 'leader-chosen':
        return { ...event, leader: displaySeat(event.leader, me), bySeat: event.bySeat === null ? null : displaySeat(event.bySeat, me) };
      default:
        return event;
    }
  });
}

/** Before animating, give another seat's placeholders the identities of the public cards it is about to play,
 *  so presentation.js can remove them by id. Counts never change; no hidden card is revealed. */
export function prepareForTransition(scene, localizedEvents) {
  const hands = scene.hands.map(hand => [...hand]);
  for (const event of localizedEvents) {
    if (event.type !== 'played' || event.player === 0) continue;
    const hand = hands[event.player];
    const n = event.cards.length;
    const keep = hand.filter(isPlaceholder).slice(0, Math.max(0, hand.filter(isPlaceholder).length - n));
    const real = hand.filter(card => !isPlaceholder(card));
    hands[event.player] = [...real.filter(card => !event.cards.some(c => c.id === card.id)), ...keep, ...event.cards.map(copy)];
  }
  return { ...scene, hands };
}
