import test from 'node:test';
import assert from 'node:assert/strict';
import { C2S } from '../dist/protocol.js';
import { createRoom, applyCommand } from '../dist/room/reducer.js';
import { RoomRuntime } from '../dist/room/runtime.js';
import { MemoryRepository } from '../dist/db/repo.js';
import { gameInfoFor, publicRoomInfo } from '../dist/room/views.js';
import { fixture, h, d, random } from '../../test/helpers.mjs';

const timing = { turnMs: 60000, leaderMs: 60000, roundReviewMs: 10000, roundOverMs: 60000, botDelayMs: 1500, botTakeoverMs: 180000 };
const ctx = { now: 100, random: random(6), timing };
const cards = [h('7'), d('7'), h('8'), d('8'), h('9')];
function room(phase = 'playing') {
  let room = createRoom({ id: 'signals-room', code: 'ABC234', hostPlayerId: 'p0', hostName: 'Player 0', now: 100 });
  for (let seat = 1; seat < 8; seat++) room = applyCommand(room, { type: 'join', playerId: `p${seat}`, name: `Player ${seat}` }, ctx).snapshot;
  const state = { ...fixture({ hands: { 0: cards }, size: 4 }), phase, turn: phase === 'playing' ? 0 : -1, openingTeam: phase === 'playing' ? null : 1 };
  return { ...room, status: 'playing', game: { state, phaseSince: 100, deadline: 60100, timer: phase === 'playing' ? 'turn' : 'leader', reviewUntil: null, leaderConfirmedBy: null, lastCause: 'deal', signals: [] } };
}
function signal(size = 3, enabled = true, expectedRevision = 0) { return { type: 'signal', playerId: 'p0', size, enabled, expectedRevision }; }
async function runtimeFor(snapshot = room()) {
  const repo = new MemoryRepository(); await repo.createRoom(snapshot);
  const scheduled = [];
  const clock = { now: () => 100, setTimeout(fn, ms) { const handle = { fn, ms }; scheduled.push(handle); return handle; }, clearTimeout() {} };
  const runtime = new RoomRuntime(snapshot, { repo, clock, random: random(9), timing, voiceEnabled: false, log: { error() {}, info() {}, warn() {} } });
  const sockets = Array.from({ length: 8 }, (_, seat) => ({ id: `s${seat}`, messages: [], emit(event, payload) { this.messages.push({ event, payload }); } }));
  for (let seat = 0; seat < 8; seat++) await runtime.attach(`p${seat}`, sockets[seat]);
  for (const socket of sockets) socket.messages.length = 0;
  return { runtime, repo, scheduled, sockets };
}

test('wire schema rejects forged sender/team, malformed sizes and nonboolean values', () => {
  const valid = { size: 3, enabled: true, expectedRevision: 0 };
  assert(C2S['game:signal'].safeParse(valid).success);
  for (const forged of [{ ...valid, playerId: 'p2' }, { ...valid, seat: 2 }, { ...valid, team: 1 }, { ...valid, cards }, { ...valid, size: 4 }, { ...valid, enabled: 'true' }]) assert(!C2S['game:signal'].safeParse(forged).success);
});

test('reducer permits either team during discussion, preserves clocks, and emits no public events or audit', () => {
  const before = room('choosing-leader');
  const result = applyCommand(before, signal(5), ctx);
  assert.deepEqual(result.snapshot.game.signals, [{ seat: 0, size: 5 }]);
  for (const key of ['state', 'phaseSince', 'deadline', 'timer', 'reviewUntil', 'leaderConfirmedBy']) assert.deepEqual(result.snapshot.game[key], before.game[key]);
  assert.equal(result.signalTeam, 0); assert.equal(result.gameChanged, false);
  assert.deepEqual(result.engineEvents, []); assert.deepEqual(result.roomEvents, []); assert.equal(result.audit, null);
  assert.throws(() => applyCommand(before, { ...signal(), playerId: 'outsider' }, ctx), { code: 'UNAUTHORIZED' });
  const bot = { ...before, seats: before.seats.map((slot, i) => i === 0 ? { kind: 'bot', reservedFor: 'p0' } : slot) };
  assert.throws(() => applyCommand(bot, signal(), ctx), { code: 'NOT_SEATED' });
});

test('real room queue persists signals and delivers only to the sender and three teammates', async t => {
  const { runtime, repo, scheduled, sockets } = await runtimeFor(); t.after(() => runtime.close('evicted'));
  const timers = scheduled.length; const before = runtime.current().game;
  const outcome = await runtime.enqueue(signal()); assert(outcome.ok);
  assert.deepEqual(repo.get(runtime.id).game.signals, [{ seat: 0, size: 3 }]);
  assert.equal(runtime.current().game.state.revision, before.state.revision);
  assert.equal(runtime.current().game.deadline, before.deadline);
  assert.equal(scheduled.length, timers);
  for (let seat = 0; seat < 8; seat++) {
    assert.equal(sockets[seat].messages.length, seat % 2 ? 0 : 1);
    if (seat % 2 === 0) {
      const message = sockets[seat].messages[0]; assert.equal(message.event, 'game:signals');
      assert.deepEqual(message.payload.signals, [{ seat: 0, size: 3 }]);
      assert.deepEqual(Object.keys(message.payload).sort(), ['revision', 'signals', 'version']);
    }
  }
  for (let seat = 0; seat < 8; seat++) assert.deepEqual(gameInfoFor(runtime.current(), seat).signals, seat % 2 ? [] : [{ seat: 0, size: 3 }]);
  assert(!JSON.stringify(publicRoomInfo(runtime.current())).includes('signals'));
  // Idempotent requested state cannot invert an already-shared signal on retry.
  const version = runtime.current().version; await runtime.enqueue(signal()); assert.equal(runtime.current().version, version);
});

test('serial signal/play races revalidate the committed hand and reject obsolete revisions', async t => {
  for (const signalFirst of [true, false]) {
    const { runtime, sockets } = await runtimeFor(); t.after(() => runtime.close('evicted'));
    const move = { type: 'play', playerId: 'p0', cards: [h('7').id], expectedRevision: 0 };
    const commands = signalFirst ? [signal(5), move] : [move, signal(5)];
    const outcomes = await Promise.all(commands.map(command => runtime.enqueue(command)));
    assert(outcomes[0].ok);
    if (signalFirst) assert(outcomes[1].ok); else assert.equal(outcomes[1].code, 'STALE_ACTION');
    assert.deepEqual(runtime.current().game.signals, []);
    for (let seat = 0; seat < 8; seat++) {
      const updates = sockets[seat].messages.filter(message => message.event === 'game:update');
      assert.equal(updates.length, 1); assert.deepEqual(updates[0].payload.signals, []);
    }
  }
});

test('failed persistence does not send or retain a signal', async t => {
  const { runtime, repo, sockets } = await runtimeFor(); t.after(() => runtime.close('evicted'));
  repo.commit = async () => { throw new Error('test write failure'); };
  assert.equal((await runtime.enqueue(signal())).code, 'SERVER_ERROR');
  assert.deepEqual(runtime.current().game.signals, []);
  assert(sockets.every(socket => socket.messages.length === 0));
});

test('restart and reconnect preserve only valid signals, with old saves defaulting to none', async t => {
  for (const saved of [undefined, [{ seat: 0, size: 3 }, { seat: 0, size: 5 }, { seat: 9, size: 3 }]]) {
    const initial = room(); initial.game.signals = saved;
    const { runtime, sockets } = await runtimeFor(JSON.parse(JSON.stringify(initial))); t.after(() => runtime.close('evicted'));
    runtime.sendState('p2', sockets[2]); runtime.sendState('p1', sockets[1]);
    assert.deepEqual(sockets[2].messages.at(-1).payload.game.signals, saved ? [{ seat: 0, size: 3 }, { seat: 0, size: 5 }] : []);
    assert.deepEqual(sockets[1].messages.at(-1).payload.game.signals, []);
    assert.equal(runtime.current().game.signals.length, saved ? 2 : 0);
  }
});

test('round-winning action clears all declarations', () => {
  const before = room();
  before.game.state = fixture({ hands: { 0: [h('7'), d('7'), h('8')] }, size: 5 });
  before.game.signals = [{ seat: 0, size: 3 }];
  const result = applyCommand(before, { type: 'play', playerId: 'p0', cards: before.game.state.hands[0].map(card => card.id), expectedRevision: 0 }, ctx);
  assert.equal(result.snapshot.game.state.phase, 'round-over'); assert.deepEqual(result.snapshot.game.signals, []);
});
