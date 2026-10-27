import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../../dist/engine.js';
import { random, assertConservation } from '../../test/helpers.mjs';
import { applyCommand, createRoom } from '../dist/room/reducer.js';
import { localizeEvents } from '../dist/room/views.js';

const timing = { turnMs: 60_000, leaderMs: 60_000, roundReviewMs: 10_000, roundOverMs: 60_000, botDelayMs: 1_500, botTakeoverMs: 180_000 };
const ctxAt = (now, rng) => ({ now, random: rng, timing });
const rejects = (fn, code) => assert.throws(fn, error => error.code === code, `expected ${code}`);

function lobby(humans = 1, seed = 7) {
  const rng = random(seed);
  let room = createRoom({ id: 'room', code: 'ABC234', hostPlayerId: 'p0', hostName: 'Host', now: 1000 });
  room = applyCommand(room, { type: 'connect', playerId: 'p0' }, ctxAt(1000, rng)).snapshot;
  for (let i = 1; i < humans; i++) {
    room = applyCommand(room, { type: 'join', playerId: `p${i}`, name: `Player ${i}` }, ctxAt(1000, rng)).snapshot;
    room = applyCommand(room, { type: 'connect', playerId: `p${i}` }, ctxAt(1000, rng)).snapshot;
  }
  return { room, rng };
}

function started(humans = 1, seed = 7) {
  const { room: lobbyRoom, rng } = lobby(humans, seed);
  const filled = applyCommand(lobbyRoom, { type: 'fill-bots', playerId: 'p0' }, ctxAt(1000, rng)).snapshot;
  const room = applyCommand(filled, { type: 'start', playerId: 'p0' }, ctxAt(2000, rng)).snapshot;
  return { room, rng };
}

/** Drives the match with timer commands only, as the runtime would. */
function runToEnd(room, rng, { onResult, maxSteps = 20_000 } = {}) {
  let now = room.game.phaseSince;
  for (let step = 0; step < maxSteps; step++) {
    const game = room.game;
    if (game.state.phase === 'match-over') return { room, steps: step };
    assert.ok(game.timer && game.deadline !== null, `phase ${game.state.phase} must have a timer`);
    now = Math.max(now, game.deadline);
    const result = applyCommand(room, { type: 'timer', timer: game.timer, revision: game.state.revision }, ctxAt(now, rng));
    assert.notEqual(result.snapshot, room, 'timer must always progress a bot-only table');
    assertConservation(result.snapshot.game.state);
    onResult?.(result);
    room = result.snapshot;
  }
  assert.fail('match did not finish');
}

test('lobby guards: names, capacity, host-only actions, seat filling', () => {
  const { room, rng } = lobby(2);
  const ctx = ctxAt(1000, rng);
  rejects(() => applyCommand(room, { type: 'join', playerId: 'px', name: 'player 1' }, ctx), 'NAME_TAKEN');
  rejects(() => applyCommand(room, { type: 'start', playerId: 'p1' }, ctx), 'NOT_HOST');
  rejects(() => applyCommand(room, { type: 'start', playerId: 'p0' }, ctx), 'SEATS_NOT_FILLED');
  rejects(() => applyCommand(room, { type: 'move', playerId: 'p1', seat: 0 }, ctx), 'SEAT_TAKEN');
  rejects(() => applyCommand(room, { type: 'fill-bots', playerId: 'p1' }, ctx), 'NOT_HOST');
  let full = room;
  for (let i = 2; i < 8; i++) full = applyCommand(full, { type: 'join', playerId: `p${i}`, name: `P${i}` }, ctx).snapshot;
  rejects(() => applyCommand(full, { type: 'join', playerId: 'p9', name: 'Late' }, ctx), 'ROOM_FULL');
  const moved = applyCommand(room, { type: 'move', playerId: 'p1', seat: 5 }, ctx).snapshot;
  assert.equal(moved.players.p1.seat, 5);
  assert.equal(moved.seats[1].kind, 'empty');
  const withBot = applyCommand(moved, { type: 'set-bot', playerId: 'p0', seat: 1, bot: true }, ctx).snapshot;
  assert.equal(withBot.seats[1].kind, 'bot');
  rejects(() => applyCommand(withBot, { type: 'set-bot', playerId: 'p0', seat: 1, bot: true }, ctx), 'SEAT_TAKEN');
  const { room: playing } = started(1);
  rejects(() => applyCommand(playing, { type: 'join', playerId: 'px', name: 'Late' }, ctx), 'ROOM_STARTED');
  rejects(() => applyCommand(playing, { type: 'move', playerId: 'p0', seat: 3 }, ctx), 'ROOM_STARTED');
});

test('dealing enters choosing-leader with a leader timer; only the opening team confirms, first confirmation wins', () => {
  const { room, rng } = started(8);
  const state = room.game.state;
  assert.equal(state.phase, 'choosing-leader');
  assert.equal(room.game.timer, 'leader');
  assert.equal(room.game.deadline, room.game.phaseSince + timing.leaderMs);
  const opening = Object.values(room.players).filter(p => TEAMS[p.seat] === state.openingTeam);
  const other = Object.values(room.players).filter(p => TEAMS[p.seat] !== state.openingTeam);
  const ctx = ctxAt(3000, rng);
  rejects(() => applyCommand(room, { type: 'confirm-leader', playerId: other[0].id, leader: opening[0].seat, expectedRevision: state.revision }, ctx), 'NOT_YOUR_TEAM');
  rejects(() => applyCommand(room, { type: 'confirm-leader', playerId: opening[0].id, leader: other[0].seat, expectedRevision: state.revision }, ctx), 'INVALID_LEADER');
  rejects(() => applyCommand(room, { type: 'play', playerId: opening[0].id, cards: ['x'], expectedRevision: state.revision }, ctx), 'LEADER_NOT_CHOSEN');
  const result = applyCommand(room, { type: 'confirm-leader', playerId: opening[1].id, leader: opening[0].seat, expectedRevision: state.revision }, ctx);
  assert.equal(result.snapshot.game.state.phase, 'playing');
  assert.equal(result.snapshot.game.state.turn, opening[0].seat);
  assert.deepEqual(result.roomEvents, [{ type: 'leader-chosen', leader: opening[0].seat, bySeat: opening[1].seat }]);
  assert.deepEqual(result.snapshot.game.leaderConfirmedBy, { seat: opening[0].seat, playerId: opening[1].id });
  assert.equal(result.snapshot.game.timer, 'turn');
  assert.equal(result.snapshot.game.deadline, 3000 + timing.turnMs);
  rejects(() => applyCommand(result.snapshot, { type: 'confirm-leader', playerId: opening[0].id, leader: opening[0].seat, expectedRevision: state.revision }, ctx), 'BAD_PHASE');
});

test('leader timer picks a computer opener immediately when the opening team has no connected human', () => {
  const { room, rng } = started(1);
  const game = room.game;
  const humanOnOpening = TEAMS[0] === game.state.openingTeam;
  assert.equal(game.deadline, game.phaseSince + (humanOnOpening ? timing.leaderMs : timing.botDelayMs));
  const gone = applyCommand(room, { type: 'disconnect', playerId: 'p0' }, ctxAt(2500, rng)).snapshot;
  assert.equal(gone.game.deadline, gone.game.phaseSince + timing.botDelayMs);
  const result = applyCommand(gone, { type: 'timer', timer: 'leader', revision: gone.game.state.revision }, ctxAt(4000, rng));
  assert.equal(result.snapshot.game.state.phase, 'playing');
  assert.equal(result.snapshot.game.leaderConfirmedBy.playerId, null);
  assert.deepEqual(result.roomEvents[0], { type: 'leader-chosen', leader: result.snapshot.game.state.turn, bySeat: null });
  const stale = applyCommand(result.snapshot, { type: 'timer', timer: 'leader', revision: gone.game.state.revision }, ctxAt(5000, rng));
  assert.equal(stale.snapshot, result.snapshot, 'stale timers are ignored');
});

test('turn guards: wrong seat, stale revision, foreign cards, bot seats', () => {
  const { room: dealt, rng } = started(2);
  const ctx = ctxAt(3000, rng);
  const room = applyCommand(dealt, { type: 'timer', timer: 'leader', revision: dealt.game.state.revision }, ctx).snapshot;
  const state = room.game.state;
  const onTurn = Object.values(room.players).find(p => p.seat === state.turn);
  const offTurn = Object.values(room.players).find(p => p.seat !== state.turn);
  rejects(() => applyCommand(room, { type: 'play', playerId: offTurn.id, cards: ['x'], expectedRevision: state.revision }, ctx), 'WRONG_TURN');
  rejects(() => applyCommand(room, { type: 'pickup', playerId: offTurn.id, expectedRevision: state.revision }, ctx), 'WRONG_TURN');
  if (onTurn) {
    rejects(() => applyCommand(room, { type: 'play', playerId: onTurn.id, cards: ['x'], expectedRevision: state.revision }, ctx), 'INVALID_CARDS');
    rejects(() => applyCommand(room, { type: 'play', playerId: onTurn.id, cards: [state.hands[onTurn.seat][0].id], expectedRevision: state.revision + 1 }, ctx), 'STALE_ACTION');
    rejects(() => applyCommand(room, { type: 'pickup', playerId: onTurn.id, expectedRevision: state.revision }, ctx), 'NOTHING_TO_PICK_UP');
    const played = applyCommand(room, { type: 'play', playerId: onTurn.id, cards: [state.hands[onTurn.seat][0].id], expectedRevision: state.revision }, ctx);
    assert.equal(played.cause, 'action');
    assert.equal(played.engineEvents[0].type, 'played');
    const mine = localizeEvents(played.engineEvents, onTurn.seat);
    const theirs = localizeEvents(played.engineEvents, (onTurn.seat + 1) % 8);
    assert.ok(mine.find(e => e.type === 'refilled').cards.length > 0);
    assert.equal(theirs.find(e => e.type === 'refilled').cards, undefined);
    assert.equal(theirs.find(e => e.type === 'refilled').count, mine.find(e => e.type === 'refilled').cards.length);
  }
});

test('a bot-only table plays a full match through timers alone, keeping every private draw private', () => {
  const { room: dealt, rng } = started(1);
  const offline = applyCommand(dealt, { type: 'disconnect', playerId: 'p0' }, ctxAt(2100, rng)).snapshot;
  const taken = applyCommand(offline, { type: 'bot-takeover', playerId: 'p0', offlineSince: 2100 }, ctxAt(2100 + timing.botTakeoverMs, rng)).snapshot;
  assert.deepEqual(taken.seats[0], { kind: 'bot', reservedFor: 'p0' });
  let plays = 0, pickups = 0, rounds = 0;
  const { room: finished, steps } = runToEnd(taken, rng, {
    onResult: result => {
      assert.ok(['bot', 'timeout'].includes(result.cause));
      for (const event of result.engineEvents) {
        if (event.type === 'played') plays++;
        if (event.type === 'picked-up') pickups++;
        if (event.type === 'refilled') for (let seat = 0; seat < 8; seat++) if (seat !== event.player) assert.equal(localizeEvents([event], seat)[0].cards, undefined);
      }
      if (result.roomEvents.some(e => e.type === 'round-dealt')) rounds++;
    },
  });
  assert.equal(finished.status, 'finished');
  assert.equal(finished.game.timer, null);
  assert.equal(Math.max(...finished.game.state.scores), 5);
  assert.ok(plays > 0 && rounds >= 4, `plays=${plays} pickups=${pickups} rounds=${rounds} steps=${steps}`);
});

test('round review window: continue is held for 10 s, only the winning team or host deals, and the timer auto-deals', () => {
  const { room: dealt, rng } = started(8);
  let room = dealt;
  let now = 3000;
  for (let i = 0; i < 5000 && room.game.state.phase !== 'round-over'; i++) {
    now = Math.max(now, room.game.deadline);
    room = applyCommand(room, { type: 'timer', timer: room.game.timer, revision: room.game.state.revision }, ctxAt(now, rng)).snapshot;
  }
  assert.equal(room.game.state.phase, 'round-over');
  const end = room.game.phaseSince;
  assert.equal(room.game.reviewUntil, end + timing.roundReviewMs);
  assert.equal(room.game.deadline, end + timing.roundOverMs);
  const winner = room.game.state.winner;
  const winnerPlayer = Object.values(room.players).find(p => TEAMS[p.seat] === winner && p.id !== 'p0');
  const loserPlayer = Object.values(room.players).find(p => TEAMS[p.seat] !== winner && p.id !== 'p0');
  const rev = room.game.state.revision;
  rejects(() => applyCommand(room, { type: 'continue', playerId: winnerPlayer.id, expectedRevision: rev }, ctxAt(end + 5000, rng)), 'REVIEW_IN_PROGRESS');
  rejects(() => applyCommand(room, { type: 'continue', playerId: loserPlayer.id, expectedRevision: rev }, ctxAt(end + 10_000, rng)), 'NOT_YOUR_TEAM');
  rejects(() => applyCommand(room, { type: 'play', playerId: winnerPlayer.id, cards: ['x'], expectedRevision: rev }, ctxAt(end + 10_000, rng)), 'ROUND_CLOSED');
  const dealtAgain = applyCommand(room, { type: 'continue', playerId: winnerPlayer.id, expectedRevision: rev }, ctxAt(end + 10_000, rng));
  assert.equal(dealtAgain.snapshot.game.state.phase, 'choosing-leader');
  assert.equal(dealtAgain.snapshot.game.state.round, room.game.state.round + 1);
  assert.deepEqual(dealtAgain.roomEvents, [{ type: 'round-dealt', round: room.game.state.round + 1, trump: dealtAgain.snapshot.game.state.trump }]);
  const hostDeal = applyCommand(room, { type: 'continue', playerId: 'p0', expectedRevision: rev }, ctxAt(end + 10_000, rng));
  assert.equal(hostDeal.snapshot.game.state.phase, 'choosing-leader');
  const auto = applyCommand(room, { type: 'timer', timer: 'round-over', revision: rev }, ctxAt(end + 60_000, rng));
  assert.equal(auto.cause, 'timeout');
  assert.equal(auto.snapshot.game.state.phase, 'choosing-leader');
});

test('disconnect, takeover, reclaim and host transfer', () => {
  const { room, rng } = started(3);
  const t0 = 5000;
  const gone = applyCommand(room, { type: 'disconnect', playerId: 'p0' }, ctxAt(t0, rng)).snapshot;
  assert.equal(gone.players.p0.connected, false);
  assert.equal(gone.seats[0].kind, 'human', 'seat stays human until the takeover timer');
  const early = applyCommand(gone, { type: 'bot-takeover', playerId: 'p0', offlineSince: t0 - 1 }, ctxAt(t0 + timing.botTakeoverMs, rng));
  assert.equal(early.snapshot, gone, 'a takeover for an older disconnect is ignored');
  const taken = applyCommand(gone, { type: 'bot-takeover', playerId: 'p0', offlineSince: t0 }, ctxAt(t0 + timing.botTakeoverMs, rng)).snapshot;
  assert.deepEqual(taken.seats[0], { kind: 'bot', reservedFor: 'p0' });
  assert.equal(taken.hostPlayerId, 'p1', 'host moves to the lowest connected human');
  const back = applyCommand(taken, { type: 'connect', playerId: 'p0' }, ctxAt(t0 + 200_000, rng)).snapshot;
  assert.deepEqual(back.seats[0], { kind: 'human', playerId: 'p0' });
  assert.equal(back.hostPlayerId, 'p1', 'host does not bounce back automatically');
  const left = applyCommand(back, { type: 'leave', playerId: 'p2' }, ctxAt(t0 + 200_001, rng)).snapshot;
  assert.deepEqual(left.seats[2], { kind: 'bot', reservedFor: 'p2' });
  const { room: lobbyRoom } = lobby(2);
  const lobbyGone = applyCommand(lobbyRoom, { type: 'disconnect', playerId: 'p1' }, ctxAt(t0, rng)).snapshot;
  const freed = applyCommand(lobbyGone, { type: 'bot-takeover', playerId: 'p1', offlineSince: t0 }, ctxAt(t0 + timing.botTakeoverMs, rng)).snapshot;
  assert.equal(freed.players.p1, undefined);
  assert.equal(freed.seats[1].kind, 'empty');
});

test('rematch is host-only after match-over, keeps seats, resets scores and the review window applies', () => {
  const { room: dealt, rng } = started(2);
  const { room: finished } = runToEnd(dealt, rng);
  const end = finished.game.phaseSince;
  rejects(() => applyCommand(finished, { type: 'rematch', playerId: 'p1' }, ctxAt(end + 20_000, rng)), 'NOT_HOST');
  rejects(() => applyCommand(finished, { type: 'rematch', playerId: 'p0' }, ctxAt(end + 1000, rng)), 'REVIEW_IN_PROGRESS');
  rejects(() => applyCommand(dealt, { type: 'rematch', playerId: 'p0' }, ctxAt(end + 20_000, rng)), 'BAD_PHASE');
  const again = applyCommand(finished, { type: 'rematch', playerId: 'p0' }, ctxAt(end + 20_000, rng));
  assert.equal(again.snapshot.status, 'playing');
  assert.deepEqual(again.snapshot.game.state.scores, [0, 0]);
  assert.equal(again.snapshot.game.state.round, 1);
  assert.deepEqual(again.snapshot.seats, finished.seats);
  assert.deepEqual(again.roomEvents.map(e => e.type), ['rematch', 'round-dealt']);
  assert.ok(again.snapshot.game.state.revision > finished.game.state.revision, 'revision keeps increasing across rematches');
});
