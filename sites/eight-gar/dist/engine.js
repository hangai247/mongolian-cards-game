/** Pure, synchronous transitions: refill and victory resolution precede turn advancement. */
export const SUITS = Object.freeze(['hearts', 'diamonds', 'spades', 'clubs']);
export const JOKERS = Object.freeze(['gray', 'black', 'red']);
export const RANKS = Object.freeze(['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A']);
export const TEAMS = Object.freeze([0, 1, 0, 1, 0, 1, 0, 1]);
export class RuleError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'RuleError';
    }
}
function ensure(condition, code, message) {
    if (!condition)
        throw new RuleError(code, message);
}
function copyCard(card) { return { ...card }; }
function cardKey(card) {
    return card.kind === 'joker' ? JSON.stringify(['joker', card.color]) : JSON.stringify([card.suit, card.rank]);
}
/** One card per rank/suit plus one gray, black and red joker. */
export function createDeck() {
    return [
        ...SUITS.flatMap(suit => RANKS.map(rank => ({ id: JSON.stringify([suit, rank]), kind: 'ordinary', suit, rank }))),
        ...JOKERS.map(color => ({ id: `joker:${color}`, kind: 'joker', color })),
    ];
}
/** Caller supplies randomness; the engine never reads clocks or global random state. */
export function shuffleDeck(deck, random) {
    const result = deck.map(copyCard);
    for (let i = result.length - 1; i > 0; i--) {
        const sample = random();
        ensure(Number.isFinite(sample) && sample >= 0 && sample < 1, 'INVALID_DECK', 'Random samples must be in [0, 1).');
        const j = Math.floor(sample * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function validateDeck(deck) {
    const expected = new Set(createDeck().map(cardKey));
    ensure(deck.length === expected.size && new Set(deck.map(card => card.id)).size === deck.length, 'INVALID_DECK', 'Deck must be complete with unique card IDs.');
    for (const card of deck) {
        ensure(typeof card.id === 'string' && card.id.length > 0 && (card.kind === 'ordinary' || card.kind === 'joker')
            && expected.delete(cardKey(card)), 'INVALID_DECK', 'Deck contains a duplicate or unknown card.');
    }
}
function validatePlayer(player, count) {
    ensure(Number.isInteger(player) && player >= 0 && player < count, 'INVALID_PLAYER', 'Unknown seat.');
}
function deal(deck) {
    validateDeck(deck);
    const hands = TEAMS.map(() => []);
    for (let i = 0; i < hands.length * 5; i++)
        hands[i % hands.length].push(copyCard(deck[i]));
    return { hands, reserve: deck.slice(hands.length * 5).map(copyCard) };
}
/** Low-level compatibility initializer. Interactive games use prepareMatch + chooseLeader. */
export function createMatch(deck, firstLeader) {
    validatePlayer(firstLeader, TEAMS.length);
    return {
        ...deal(deck), sleeping: [], table: { pile: [], highest: [] }, turn: firstLeader, round: 1,
        trump: 'hearts', scores: [0, 0], phase: 'playing', openingTeam: null, winner: null, revision: 0,
    };
}
/** Deal first. No player owns the turn until the eligible team finishes discussion. */
export function prepareMatch(deck, startingTeam) {
    ensure(startingTeam === 0 || startingTeam === 1, 'INVALID_LEADER', 'Choose a valid starting team.');
    return { ...createMatch(deck, startingTeam), phase: 'choosing-leader', openingTeam: startingTeam, turn: -1 };
}
/** Confirm the team's agreed opening player without redealing or changing any cards. */
export function chooseLeader(state, leader, expectedRevision) {
    ensure(expectedRevision === state.revision, 'STALE_ACTION', 'Action refers to an outdated state.');
    ensure(state.phase === 'choosing-leader', 'INVALID_LEADER', 'This round is not awaiting a team decision.');
    validatePlayer(leader, TEAMS.length);
    ensure(TEAMS[leader] === state.openingTeam, 'INVALID_LEADER', 'Choose a player from the opening team.');
    return { ...state, hands: state.hands.map(hand => hand.map(copyCard)), reserve: state.reserve.map(copyCard),
        sleeping: state.sleeping.map(copyCard),
        table: { pile: state.table.pile.map(copyCard), highest: state.table.highest.map(copyCard) },
        scores: [...state.scores], phase: 'playing', openingTeam: null, turn: leader, revision: state.revision + 1 };
}
export function beatsCard(candidate, target, trump) {
    if (candidate.kind === 'joker')
        return target.kind !== 'joker' || JOKERS.indexOf(candidate.color) > JOKERS.indexOf(target.color);
    if (target.kind === 'joker')
        return false;
    if (candidate.suit !== target.suit)
        return candidate.suit === trump && target.suit !== trump;
    return RANKS.indexOf(candidate.rank) > RANKS.indexOf(target.rank);
}
/** Perfect matching, not a positional or greedy comparison. At most five cards. */
export function beatsSet(candidate, target, trump) {
    if (![1, 3, 5].includes(candidate.length) || candidate.length !== target.length)
        return false;
    if (new Set(candidate.map(card => card.id)).size !== candidate.length
        || new Set(target.map(card => card.id)).size !== target.length)
        return false;
    if (candidate.length > 1 && [...candidate, ...target].some(card => card.kind === 'joker'))
        return false;
    const used = new Set();
    const search = (index) => {
        if (index === target.length)
            return true;
        for (let i = 0; i < candidate.length; i++) {
            if (!used.has(i) && beatsCard(candidate[i], target[index], trump)) {
                used.add(i);
                if (search(index + 1))
                    return true;
                used.delete(i);
            }
        }
        return false;
    };
    return search(0);
}
export function isLeadStructure(cards) {
    if (new Set(cards.map(card => card.id)).size !== cards.length)
        return false;
    if (cards.length === 1)
        return true;
    if (![3, 5].includes(cards.length) || cards.some(card => card.kind === 'joker'))
        return false;
    const counts = new Map();
    for (const card of cards)
        if (card.kind === 'ordinary')
            counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    const pairs = [...counts.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
    return pairs >= (cards.length === 3 ? 1 : 2);
}
export function canLeadThree(state) {
    return state.phase === 'playing' && state.table.highest.length === 0
        && state.hands.every(hand => hand.length >= 3);
}
export function canLeadFive(state) {
    return state.phase === 'playing' && state.table.highest.length === 0 && state.reserve.length === 0
        && state.hands.every(hand => hand.length >= 5);
}
export function applyAction(state, action) {
    ensure(action !== null && typeof action === 'object', 'INVALID_ACTION', 'Provide a play or pickup action.');
    ensure(action.type === 'play' || action.type === 'pickup', 'INVALID_ACTION', 'Unknown action.');
    ensure(action.expectedRevision === state.revision, 'STALE_ACTION', 'Action refers to an outdated state.');
    ensure(state.phase !== 'choosing-leader', 'LEADER_NOT_CHOSEN', 'The team must discuss its hands and choose an opening player first.');
    ensure(state.phase === 'playing', 'ROUND_CLOSED', 'This round has ended.');
    validatePlayer(action.player, state.hands.length);
    ensure(action.player === state.turn, 'WRONG_TURN', 'Wait for your turn.');
    const hands = state.hands.map(hand => hand.map(copyCard));
    const reserve = state.reserve.map(copyCard);
    const sleeping = state.sleeping.map(copyCard);
    const hand = hands[action.player];
    const events = [];
    let table;
    if (action.type === 'play') {
        ensure(Array.isArray(action.cards) && action.cards.length > 0 && new Set(action.cards).size === action.cards.length, 'INVALID_CARDS', 'Select distinct cards from your hand.');
        const selected = action.cards.map(id => hand.find(card => card.id === id));
        ensure(selected.every(card => card !== undefined), 'INVALID_CARDS', 'Selected card is not in your hand.');
        const cards = selected;
        const lead = state.table.highest.length === 0;
        if (lead) {
            ensure(isLeadStructure(cards), 'INVALID_LEAD', 'Lead one card, a three-card pair set, or a five-card two-pair set. Jokers are single only.');
            if (cards.length === 3)
                ensure(canLeadThree(state), 'THREE_CARD_LEAD_BLOCKED', 'Three-card leads require every hand to have at least three cards before play.');
            if (cards.length === 5)
                ensure(canLeadFive(state), 'FIVE_CARD_LEAD_BLOCKED', 'Five-card leads require empty reserve and every hand at least five before play.');
        }
        else {
            ensure(beatsSet(cards, state.table.highest, state.trump), 'INVALID_RESPONSE', 'Response must beat every current card with a distinct card of its own.');
        }
        const ids = new Set(action.cards);
        hands[action.player] = hand.filter(card => !ids.has(card.id));
        table = { pile: [...state.table.pile.map(copyCard), ...cards], highest: [...cards] };
        events.push({ type: 'played', player: action.player, cards: cards.map(copyCard), lead });
    }
    else {
        ensure(state.table.pile.length > 0, 'NOTHING_TO_PICK_UP', 'The table is empty; lead a play.');
        hand.push(...state.table.pile.map(copyCard));
        table = { pile: [], highest: [] };
        events.push({ type: 'picked-up', player: action.player, cards: state.table.pile.map(copyCard) });
    }
    // This refill is part of the same transition, before victory and turn advancement.
    if (action.type === 'play') {
        const drawCount = Math.min(Math.max(0, 5 - hands[action.player].length), reserve.length);
        const drawn = reserve.splice(0, drawCount);
        hands[action.player].push(...drawn);
        if (drawn.length > 0)
            events.push({ type: 'refilled', player: action.player, cards: drawn.map(copyCard) });
    }
    // A fixed-size chain consists of one lead plus seven successful defenses.
    // Derive its length from the live pile so pickup/clear naturally resets it.
    const slept = action.type === 'play' && table.pile.length === table.highest.length * TEAMS.length;
    if (slept) {
        sleeping.push(...table.pile.map(copyCard));
        events.push({ type: 'table-slept', player: action.player, count: table.pile.length });
        table = { pile: [], highest: [] };
    }
    const next = {
        ...state,
        scores: [...state.scores], hands, reserve, sleeping, table, revision: state.revision + 1,
    };
    if (hands[action.player].length === 0) {
        const team = TEAMS[action.player];
        const scores = [...state.scores];
        scores[team]++;
        events.push({ type: 'round-won', player: action.player, team });
        const phase = scores[team] >= 5 ? 'match-over' : 'round-over';
        if (phase === 'match-over')
            events.push({ type: 'match-won', team });
        return { state: { ...next, scores, phase, winner: team }, events };
    }
    const turn = slept ? action.player : (state.turn + 1) % hands.length;
    events.push({ type: 'turn-changed', player: turn });
    return { state: { ...next, turn }, events };
}
/** A fresh shuffled full deck is required; any winning teammate can be chosen. */
export function startNextRound(state, deck, leader, expectedRevision) {
    ensure(expectedRevision === state.revision, 'STALE_ACTION', 'Action refers to an outdated state.');
    ensure(state.phase === 'round-over', 'INVALID_NEXT_ROUND', 'Only a completed round in an unfinished match can restart.');
    validatePlayer(leader, state.hands.length);
    ensure(TEAMS[leader] === state.winner, 'INVALID_NEXT_ROUND', 'Choose any player on the winning team.');
    const fresh = createMatch(deck, leader);
    return { ...fresh, round: state.round + 1, trump: SUITS[state.round % SUITS.length],
        scores: [...state.scores], revision: state.revision + 1 };
}
/** Redeal before the winning team discusses its new hands and selects its opener. */
export function prepareNextRound(state, deck, expectedRevision) {
    const fresh = startNextRound(state, deck, state.winner ?? 0, expectedRevision);
    return { ...fresh, phase: 'choosing-leader', openingTeam: state.winner, turn: -1 };
}
/** Public player snapshot: no opposing/teammate hand or reserve identities. */
export function viewForPlayer(state, player) {
    validatePlayer(player, state.hands.length);
    return {
        player, team: TEAMS[player], hand: state.hands[player].map(copyCard),
        handCounts: state.hands.map(hand => hand.length), reserveCount: state.reserve.length,
        table: { pile: state.table.pile.map(copyCard), highest: state.table.highest.map(copyCard) },
        turn: state.turn, round: state.round, trump: state.trump, scores: [...state.scores],
        phase: state.phase, openingTeam: state.openingTeam, winner: state.winner, revision: state.revision,
    };
}
