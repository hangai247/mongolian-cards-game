import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../../dist/engine.js';
import { random } from '../../test/helpers.mjs';
import { fakeClock } from './fake-clock.mjs';
import { MemoryRepository } from '../dist/db/repo.js';
import { createRoom } from '../dist/room/reducer.js';
import { RoomRuntime } from '../dist/room/runtime.js';

const timing = { turnMs: 60_000, leaderMs: 60_000, roundReviewMs: 10_000, roundOverMs: 60_000, botDelayMs: 1_500, botTakeoverMs: 180_000 };
const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

function fakeSocket(id) {
  const socket = { id, received: [], emit(event, payload) { socket.received.push({ event, payload }); } };
  socket.last = event => socket.received.filter(message => message.event === event).at(-1)?.payload;
  return socket;
}

async function table({ humans = 2, seed = 11, repo = new MemoryRepository() } = {}) {
  const clock = fakeClock();
  const snapshot = createRoom({ id: 'room', code: 'ABC234', hostPlayerId: 'p0', hostName: 'Host', now: clock.now() });
  await repo.createRoom(snapshot);
  const runtime = new RoomRuntime(snapshot, { clock, random: random(seed), timing, repo, log: silent, voiceEnabled: false });
  const sockets = {};
  for (let i = 0; i < humans; i++) {
    const id = `p${i}`;
    if (i > 0) assert.ok((await runtime.enqueue({ type: 'join', playerId: id, name: `Player ${i}` })).ok);
    sockets[id] = fakeSocket(`s${i}`);
    assert.ok((await runtime.attach(id, sockets[id])).ok);
  }
  assert.ok((await runtime.enqueue({ type: 'fill-bots', playerId: 'p0' })).ok);
  assert.ok((await runtime.enqueue({ type: 'start', playerId: 'p0' })).ok);
  return { clock, runtime, sockets, repo };
}

test('attach syncs state, timers derive from the snapshot, and timeouts auto-play with cause recorded', async () => {
  const { clock, runtime, sockets } = await table({ humans: 1 });
  const first = sockets.p0.last('room:state');
  assert.equal(first.you.seat, 0);
  assert.equal(first.game.view.phase, 'choosing-leader');
  assert.equal(first.game.view.handCounts.length, 8);
  assert.equal(first.seats.filter(seat => seat.kind === 'bot').length, 7);
  const openingIsMine = TEAMS[0] === first.game.view.openingTeam;
  await clock.advance(openingIsMine ? timing.leaderMs : timing.botDelayMs);
  let state = runtime.current();
  assert.equal(state.game.state.phase, 'playing');
  // Keep advancing until it is the human's turn, then let the turn timer expire.
  for (let i = 0; i < 100 && state.game.state.turn !== 0 && state.game.state.phase === 'playing'; i++) {
    await clock.advance(timing.botDelayMs);
    state = runtime.current();
  }
  if (state.game.state.phase === 'playing') {
    assert.equal(state.game.state.turn, 0);
    const before = state.game.state.revision;
    await clock.advance(timing.turnMs - 1);
    assert.equal(runtime.current().game.state.revision, before, 'nothing happens before the deadline');
    await clock.advance(1);
    const update = sockets.p0.last('game:update');
    assert.equal(update.cause, 'timeout');
    assert.ok(update.events.some(event => (event.type === 'played' || event.type === 'picked-up') && event.player === 0));
    assert.equal(update.view.player, 0);
  }
});

test('refill cards reach only the drawer; other seats receive a count', async () => {
  const { clock, runtime, sockets } = await table({ humans: 8 });
  const view = sockets.p0.last('room:state').game.view;
  const opening = Object.values(runtime.current().players).find(p => TEAMS[p.seat] === view.openingTeam);
  assert.ok((await runtime.enqueue({ type: 'confirm-leader', playerId: opening.id, leader: opening.seat, expectedRevision: view.revision })).ok);
  await clock.flush();
  const leader = runtime.current().game.state.turn;
  const leaderId = Object.values(runtime.current().players).find(p => p.seat === leader).id;
  const hand = sockets[leaderId].last('game:update').view.hand;
  const outcome = await runtime.enqueue({ type: 'play', playerId: leaderId, cards: [hand[0].id], expectedRevision: runtime.current().game.state.revision }, `${leaderId}:a1`);
  assert.ok(outcome.ok);
  for (const [id, socket] of Object.entries(sockets)) {
    const update = socket.last('game:update');
    const refill = update.events.find(event => event.type === 'refilled');
    assert.ok(refill);
    if (id === leaderId) assert.ok(Array.isArray(refill.cards) && refill.cards.length === 1);
    else { assert.equal(refill.cards, undefined); assert.equal(refill.count, 1); }
    assert.equal(update.view.player, runtime.current().players[id].seat);
    assert.equal(update.view.hand.length, runtime.current().game.state.hands[update.view.player].length);
  }
  const replay = await runtime.enqueue({ type: 'play', playerId: leaderId, cards: [hand[0].id], expectedRevision: view.revision + 1 }, `${leaderId}:a1`);
  assert.deepEqual(replay, outcome, 'a duplicate actionId returns the cached outcome without applying again');
  assert.equal(runtime.current().version, outcome.result.snapshot.version);
});

test('disconnect schedules a bot takeover that a reconnect cancels', async () => {
  const { clock, runtime, sockets } = await table({ humans: 2 });
  await runtime.detach('p1', sockets.p1);
  assert.equal(runtime.current().players.p1.connected, false);
  await clock.advance(timing.botTakeoverMs - 1);
  assert.equal(runtime.current().seats[1].kind, 'human');
  const again = fakeSocket('s1b');
  await runtime.attach('p1', again);
  await clock.advance(10);
  assert.equal(runtime.current().seats[1].kind, 'human', 'reconnect cancelled the takeover');
  assert.equal(again.last('room:state').you.seat, 1);
  await runtime.detach('p1', again);
  await clock.advance(timing.botTakeoverMs);
  assert.deepEqual(runtime.current().seats[1], { kind: 'bot', reservedFor: 'p1' });
  assert.equal(sockets.p0.last('room:state').seats[1].kind, 'bot');
  assert.equal(sockets.p0.last('room:state').seats[1].reservedForName, 'Player 1');
});

test('round review: continue is refused for 10 s, accepted afterwards, and auto-deals at 60 s', async () => {
  const { clock, runtime, sockets } = await table({ humans: 1 });
  await runtime.detach('p0', sockets.p0);
  await clock.advance(timing.botTakeoverMs);
  for (let i = 0; i < 3000 && runtime.current().game.state.phase !== 'round-over'; i++) await clock.advance(timing.botDelayMs);
  assert.equal(runtime.current().game.state.phase, 'round-over');
  const back = fakeSocket('s0b');
  await runtime.attach('p0', back);
  const payload = back.last('room:state');
  assert.equal(payload.game.reviewUntil, runtime.current().game.phaseSince + timing.roundReviewMs);
  const rev = runtime.current().game.state.revision;
  const early = await runtime.enqueue({ type: 'continue', playerId: 'p0', expectedRevision: rev });
  assert.equal(early.ok, false); assert.equal(early.code, 'REVIEW_IN_PROGRESS');
  await clock.advance(timing.roundReviewMs);
  const ok = await runtime.enqueue({ type: 'continue', playerId: 'p0', expectedRevision: rev });
  assert.ok(ok.ok);
  assert.equal(runtime.current().game.state.phase, 'choosing-leader');
  // Second round: the host stays connected but never clicks Continue; the table auto-deals at the 60 s deadline.
  for (let i = 0; i < 3000 && runtime.current().game.state.phase !== 'round-over'; i++) await clock.advance(runtime.current().game.deadline - clock.now());
  const round = runtime.current().game.state.round;
  const end = runtime.current().game.phaseSince;
  assert.equal(runtime.current().game.deadline, end + timing.roundOverMs);
  await clock.advance(timing.roundOverMs - 1);
  assert.equal(runtime.current().game.state.phase, 'round-over');
  await clock.advance(1);
  assert.equal(runtime.current().game.state.round, round + 1);
  assert.equal(back.last('game:update').cause, 'timeout');
  // Without any eligible human online the wait shrinks to the review window.
  await runtime.detach('p0', back);
  for (let i = 0; i < 3000 && runtime.current().game.state.phase !== 'round-over'; i++) await clock.advance(runtime.current().game.deadline - clock.now());
  assert.equal(runtime.current().game.deadline, runtime.current().game.phaseSince + timing.roundReviewMs);
});

test('a persistence failure drops the transition and reports SERVER_ERROR', async () => {
  const repo = new MemoryRepository();
  const { runtime, sockets } = await table({ humans: 2, repo });
  const before = runtime.current();
  const seen = sockets.p0.received.length;
  repo.commit = async () => { throw new Error('disk on fire'); };
  const outcome = await runtime.enqueue({ type: 'leave', playerId: 'p1' });
  assert.equal(outcome.ok, false); assert.equal(outcome.code, 'SERVER_ERROR');
  assert.equal(runtime.current(), before);
  assert.equal(sockets.p0.received.length, seen, 'no emit after a failed commit');
});

test('a failed automatic turn retries without emitting an uncommitted move or spinning', async () => {
  const { runtime, clock, repo, sockets } = await table({ humans: 8 });
  const commit = repo.commit.bind(repo);
  let failed = true, attempts = 0;
  repo.commit = async (...args) => { attempts++; if (failed) throw Error('temporary outage'); return commit(...args); };
  const before = runtime.current(), seen = sockets.p0.received.length;
  await clock.advance(before.game.deadline - clock.now());
  assert.equal(runtime.current(), before);
  assert.equal(sockets.p0.received.length, seen);
  assert.equal(attempts, 1);
  await clock.advance(999);
  assert.equal(attempts, 1, 'retry is delayed');
  failed = false;
  await clock.advance(1);
  assert.equal(runtime.current().game.state.revision, before.game.state.revision + 1);
  assert.equal(attempts, 2);
  runtime.close('evicted');
  assert.equal(clock.pending(), 0);
});

test('failed bot takeover retries, and reconnect cancels the pending retry', async () => {
  const { runtime, clock, repo, sockets } = await table({ humans: 2 });
  await runtime.detach('p1', sockets.p1);
  const commit = repo.commit.bind(repo);
  repo.commit = async (snapshot, audit) => {
    if (snapshot.seats[1].kind === 'bot') throw Error('temporary outage');
    return commit(snapshot, audit);
  };
  await clock.advance(timing.botTakeoverMs);
  assert.equal(runtime.current().seats[1].kind, 'human');
  repo.commit = commit;
  await clock.advance(1000);
  assert.equal(runtime.current().seats[1].kind, 'bot');
  await runtime.attach('p1', sockets.p1);
  await runtime.detach('p1', sockets.p1);
  repo.commit = async (snapshot, audit) => {
    if (snapshot.seats[1].kind === 'bot') throw Error('temporary outage');
    return commit(snapshot, audit);
  };
  await clock.advance(timing.botTakeoverMs);
  repo.commit = commit;
  await runtime.attach('p1', sockets.p1);
  await clock.advance(1000);
  assert.equal(runtime.current().seats[1].kind, 'human');
  runtime.close('evicted');
  assert.equal(clock.pending(), 0);
});
