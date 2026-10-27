import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io as connect } from 'socket.io-client';
import { TEAMS, canLeadThree, canLeadFive } from '../../dist/engine.js';
import { findPlay } from '../../dist/strategy.js';
import { loadConfig } from '../dist/config.js';
import { createApp } from '../dist/app.js';

const silent = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, trace() {}, child() { return silent; } };
const env = {
  PUBLIC_ORIGIN: 'http://127.0.0.1', SESSION_SECRET: 's'.repeat(40), PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'silent',
  TURN_SECONDS: '2', LEADER_SECONDS: '2', ROUND_REVIEW_SECONDS: '0', ROUND_OVER_SECONDS: '1', BOT_DELAY_MS: '40', BOT_TAKEOVER_SECONDS: '1',
};

/** A State-shaped object that strategy.findPlay accepts: only my hand is real, other hands are opaque placeholders. */
function pseudoState(view) {
  const hands = view.handCounts.map((count, seat) => seat === view.player ? view.hand : Array.from({ length: count }, (_, i) => ({ id: `back:${seat}:${i}`, kind: 'back' })));
  return { ...view, hands, reserve: Array.from({ length: view.reserveCount }, (_, i) => ({ id: `reserve:${i}`, kind: 'back' })), sleeping: [] };
}

class Client {
  constructor(base, name) { this.base = base; this.name = name; this.updates = []; this.states = []; this.violations = []; this.sent = 0; }
  async create() { const res = await fetch(`${this.base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.name }) }); assert.equal(res.status, 201); this.session = await res.json(); return this; }
  async join(code) { const res = await fetch(`${this.base}/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.name }) }); const text = await res.text(); assert.equal(res.status, 200, text); this.session = JSON.parse(text); return this; }
  open(token = this.session.token) {
    this.socket = connect(this.base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    this.socket.on('room:state', payload => { this.states.push(payload); this.room = payload; if (payload.game) this.view = payload.game.view; this.check(payload.game?.view, []); this.tick(); });
    this.socket.on('game:update', payload => { this.updates.push(payload); this.view = payload.view; this.check(payload.view, payload.events); this.tick(); });
    return new Promise((resolve, reject) => { this.socket.once('connect', resolve); this.socket.once('connect_error', reject); });
  }
  request(event, payload) { return new Promise(resolve => this.socket.emit(event, payload, resolve)); }
  check(view, events) {
    if (!view) return;
    if (view.player !== this.session.seat) this.violations.push('view for another seat');
    if (this.lastRevision !== undefined && view.revision < this.lastRevision) this.violations.push('revision went backwards');
    this.lastRevision = view.revision;
    const onTable = view.handCounts.reduce((a, b) => a + b, 0) + view.reserveCount + view.table.pile.length;
    if (onTable > 43) this.violations.push('more than 43 cards');
    for (const event of events) if (event.type === 'refilled' && event.cards && event.player !== view.player) this.violations.push('saw another seat\'s refill');
  }
  /** Reacts to the latest view exactly once per revision, like a browser would. */
  tick() {
    const view = this.view; if (!view || !this.room || this.acted === view.revision) return;
    this.acted = view.revision;
    const me = this.session.seat;
    if (view.phase === 'choosing-leader' && TEAMS[me] === view.openingTeam) {
      void this.request('game:confirmLeader', { leader: me, expectedRevision: view.revision });
    } else if (view.phase === 'playing' && view.turn === me) {
      const state = pseudoState(view);
      const cards = findPlay(state);
      this.sent++;
      const actionId = randomUUID();
      const send = () => (cards ? this.request('game:play', { cards, expectedRevision: view.revision, actionId }) : this.request('game:pickup', { expectedRevision: view.revision, actionId }));
      void send().then(ack => { if (!ack.ok && !['STALE_ACTION', 'WRONG_TURN'].includes(ack.code)) this.violations.push(`move rejected: ${ack.code} ${ack.message}`); });
      assert.ok(cards === null || cards.length === 1 || canLeadThree(state) || canLeadFive(state) || view.table.highest.length > 0);
    } else if (view.phase === 'round-over' && (TEAMS[me] === view.winner || this.room.you.isHost)) {
      void this.request('game:continue', { expectedRevision: view.revision });
    }
  }
  close() { this.socket?.close(); }
}

const until = (predicate, ms, label) => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => { if (predicate()) return resolve(); if (Date.now() - started > ms) return reject(new Error(`timeout: ${label}`)); setTimeout(poll, 10); };
  poll();
});

test('four humans and four bots play a whole match over socket.io, then rematch and survive a reconnect', { timeout: 120_000 }, async () => {
  const app = await createApp(loadConfig(env), { log: silent });
  const { port } = await app.listen();
  const base = `http://127.0.0.1:${port}`;
  const clients = [];
  try {
    const health = await (await fetch(`${base}/healthz`)).json();
    assert.equal(health.ok, true);
    const host = await new Client(base, 'Host').create();
    const code = host.session.code;
    clients.push(host);
    for (const name of ['Bataa', 'Sarnai', 'Anu']) clients.push(await new Client(base, name).join(code));
    assert.equal((await fetch(`${base}/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'bataa' }) })).status, 409, 'duplicate name');
    assert.equal((await fetch(`${base}/api/rooms/ZZZZZZ/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x' }) })).status, 404);
    const info = await (await fetch(`${base}/api/rooms/${code}`)).json();
    assert.equal(info.humanCount, 4);
    assert.ok(!('game' in info));

    await assert.rejects(new Client(base, 'Evil').open('v1.bad.token'), /UNAUTHORIZED/);
    for (const client of clients) await client.open();
    await until(() => clients.every(client => client.room), 5000, 'initial state');
    assert.equal(host.room.you.isHost, true);
    assert.equal(host.room.seats.filter(seat => seat.kind === 'human').length, 4);

    const denied = await clients[1].request('room:start', {});
    assert.equal(denied.code, 'NOT_HOST');
    const notFilled = await host.request('room:start', {});
    assert.equal(notFilled.code, 'SEATS_NOT_FILLED');
    const bad = await host.request('room:move', { seat: 9 });
    assert.equal(bad.code, 'INVALID_PAYLOAD');
    assert.ok((await host.request('room:fillBots', {})).ok);
    assert.ok((await host.request('room:start', {})).ok);
    await until(() => clients.every(client => client.view), 5000, 'deal');

    const illegal = await host.request('game:play', { cards: ['nope'], expectedRevision: host.view.revision, actionId: randomUUID() });
    assert.ok(['LEADER_NOT_CHOSEN', 'WRONG_TURN', 'INVALID_CARDS', 'BAD_PHASE', 'STALE_ACTION', 'ROUND_CLOSED'].includes(illegal.code), illegal.code);

    await until(() => host.view?.phase === 'match-over', 90_000, 'match-over');
    for (const client of clients) {
      assert.deepEqual(client.violations, [], `${client.name}: ${client.violations.join('; ')}`);
      assert.equal(client.view.phase, 'match-over');
      assert.equal(client.room.status, 'finished');
    }
    assert.ok(clients.some(client => client.sent > 0), 'humans actually moved');
    assert.equal(Math.max(...host.view.scores), 5);
    const snapshot = app.registry.get(code).current();
    assert.equal(snapshot.status, 'finished');

    // Reconnect with the same token keeps the seat.
    const bataa = clients[1];
    const seat = bataa.session.seat;
    bataa.close();
    await until(() => !app.registry.get(code).current().players[bataa.session.playerId].connected, 5000, 'disconnect noticed');
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(app.registry.get(code).current().seats[seat].kind, 'bot', 'seat handed to a bot while offline');
    await bataa.open();
    await until(() => app.registry.get(code).current().seats[seat].kind === 'human', 5000, 'seat reclaimed');
    assert.equal(bataa.room.you.seat, seat);

    const notHost = await bataa.request('room:rematch', {});
    assert.equal(notHost.code, 'NOT_HOST');
    const rematch = await host.request('room:rematch', {});
    assert.ok(rematch.ok, rematch.message);
    await until(() => clients.every(client => client.view?.round === 1 && client.view.phase !== 'match-over'), 5000, 'rematch dealt');
    for (const client of clients) assert.deepEqual(client.view.scores, [0, 0]);
  } finally {
    for (const client of clients) client.close();
    await app.close();
  }
});

test('handshakes from another origin are refused', async () => {
  const app = await createApp(loadConfig(env), { log: silent });
  const { port } = await app.listen();
  const base = `http://127.0.0.1:${port}`;
  try {
    const host = await new Client(base, 'Host').create();
    const socket = connect(base, { auth: { token: host.session.token }, transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { Origin: 'https://evil.example' } });
    await new Promise((resolve, reject) => { socket.once('connect', () => reject(new Error('connected despite foreign origin'))); socket.once('connect_error', resolve); });
    socket.close();
  } finally {
    await app.close();
  }
});
