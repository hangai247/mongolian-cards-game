import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApp } from '../dist/app.js';
import { loadConfig } from '../dist/config.js';
import { MemoryRepository } from '../dist/db/repo.js';
import { createRoom, applyCommand } from '../dist/room/reducer.js';
import { signSession } from '../dist/session.js';
import { fixture, h, d, random } from '../../test/helpers.mjs';

test('authenticated socket signals stay team-private, persist through reconnect, and reject spoofing', { timeout: 15000 }, async t => {
  const now = Date.now();
  const config = { ...loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost', SESSION_SECRET: 'signal-test-only-secret-at-least-32-characters', LOG_LEVEL: 'silent' }), port: 0 };
  const ctx = { now, random: random(11), timing: config.timing };
  let snapshot = createRoom({ id: 'signal-network-room', code: 'ABC234', hostPlayerId: 'p0', hostName: 'Player 0', now });
  for (let seat = 1; seat < 8; seat++) snapshot = applyCommand(snapshot, { type: 'join', playerId: `p${seat}`, name: `Player ${seat}` }, ctx).snapshot;
  const state = { ...fixture({ hands: { 0: [h('7'), d('7'), h('8'), d('8'), h('9')] }, size: 4 }), phase: 'choosing-leader', turn: -1, openingTeam: 1 };
  snapshot = { ...snapshot, status: 'playing', game: { state, phaseSince: now, deadline: now + 60000, timer: 'leader', reviewUntil: null, leaderConfirmedBy: null, lastCause: 'deal' } };
  const repo = new MemoryRepository(); await repo.createRoom(snapshot);
  const app = await createApp(config, { repo, random: random(12) });
  const sockets = []; t.after(async () => { sockets.forEach(socket => socket.disconnect()); await app.close(); });
  const { port } = await app.listen();
  const tokens = Array.from({ length: 8 }, (_, seat) => signSession(config.sessionSecret, { roomId: snapshot.id, playerId: `p${seat}`, iat: now }));
  const connect = seat => new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, { auth: { token: tokens[seat] }, transports: ['websocket'], reconnection: false });
    sockets.push(socket); socket.once('connect_error', reject); socket.once('room:state', initial => resolve({ socket, initial }));
  });
  const clients = [];
  for (let seat = 0; seat < 8; seat++) clients.push(await connect(seat));
  const received = clients.map(() => []);
  clients.forEach(({ socket }, seat) => socket.on('game:signals', payload => received[seat].push(payload)));
  const request = (socket, event, payload) => socket.timeout(2000).emitWithAck(event, payload);
  const response = await request(clients[0].socket, 'game:signal', { size: 5, enabled: true, expectedRevision: 0 });
  assert.deepEqual(response, { ok: true, revision: 0 });
  // A sync ack on each connection is an ordered transport barrier, not a timing guess.
  for (const { socket } of clients) assert((await request(socket, 'room:sync', {})).ok);
  for (let seat = 0; seat < 8; seat++) {
    assert.equal(received[seat].length, seat % 2 ? 0 : 1);
    if (seat % 2 === 0) assert.deepEqual(received[seat][0].signals, [{ seat: 0, size: 5 }]);
  }
  const forged = await request(clients[1].socket, 'game:signal', { size: 3, enabled: true, expectedRevision: 0, playerId: 'p0' });
  assert.equal(forged.code, 'INVALID_PAYLOAD');
  const stale = await request(clients[0].socket, 'game:signal', { size: 3, enabled: true, expectedRevision: 99 });
  assert.equal(stale.code, 'STALE_ACTION');
  clients[2].socket.disconnect();
  const rejoined = await connect(2);
  assert.deepEqual(rejoined.initial.game.signals, [{ seat: 0, size: 5 }]);
  assert.deepEqual(repo.get(snapshot.id).game.signals, [{ seat: 0, size: 5 }]);
  const wrongToken = io(`http://127.0.0.1:${port}`, { auth: { token: 'forged' }, transports: ['websocket'], reconnection: false });
  sockets.push(wrongToken);
  const denied = await new Promise(resolve => wrongToken.once('connect_error', resolve));
  assert.equal(denied.message, 'UNAUTHORIZED');
});
