import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession } from '../dist/session.js';
import { generateCode, normalizeCode, isValidCode, CODE_ALPHABET } from '../dist/codes.js';
import { RateLimiter } from '../dist/ratelimit.js';
import { C2S, CreateRoomBody, RoomCodeInput } from '../dist/protocol.js';
import { loadConfig } from '../dist/config.js';

const SECRET = 'x'.repeat(40);

test('session tokens round-trip and reject tampering', () => {
  const token = signSession(SECRET, { roomId: 'room-1', playerId: 'player-1', iat: 123 });
  assert.deepEqual(verifySession(SECRET, token), { roomId: 'room-1', playerId: 'player-1', iat: 123 });
  assert.equal(verifySession('y'.repeat(40), token), null);
  const [v, payload, sig] = token.split('.');
  assert.equal(verifySession(SECRET, `${v}.${payload}x.${sig}`), null);
  assert.equal(verifySession(SECRET, `${v}.${payload}.${sig.slice(0, -2)}zz`), null);
  assert.equal(verifySession(SECRET, 'v0.a.b'), null);
  assert.equal(verifySession(SECRET, 42), null);
  assert.equal(verifySession(SECRET, ''), null);
});

test('room codes use the confusion-free alphabet and normalise read-aloud mistakes', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateCode();
    assert.equal(code.length, 6);
    assert.ok([...code].every(ch => CODE_ALPHABET.includes(ch)));
    assert.ok(isValidCode(code));
  }
  assert.equal(normalizeCode('ab-cd ef'), 'ABCDEF');
  assert.equal(normalizeCode('5q7kl2'), '5Q7KL2', 'L is a real alphabet letter and must survive normalisation');
  assert.equal(isValidCode(normalizeCode('5q7kl2')), true);
  for (let i = 0; i < 200; i++) { const code = generateCode(); assert.equal(normalizeCode(code.toLowerCase()), code); assert.ok(isValidCode(code)); }
  assert.equal(isValidCode(normalizeCode('o0il1a')), false, 'confusable glyphs outside the alphabet are rejected, not rewritten');
  assert.equal(RoomCodeInput.parse(' abc-234 '), 'ABC234');
  assert.ok(!RoomCodeInput.safeParse('ABC').success);
  assert.ok(!RoomCodeInput.safeParse('ABCDEF0').success);
});

test('rate limiter enforces a sliding window', () => {
  let now = 0;
  const limiter = new RateLimiter(3, 1000, { now: () => now });
  assert.ok(limiter.hit('a')); assert.ok(limiter.hit('a')); assert.ok(limiter.hit('a'));
  assert.ok(!limiter.hit('a'));
  assert.ok(limiter.hit('b'));
  now = 1001;
  assert.ok(limiter.hit('a'));
});

test('protocol schemas are strict', () => {
  assert.ok(CreateRoomBody.safeParse({ name: '  Bat  ' }).success);
  assert.equal(CreateRoomBody.parse({ name: '  Bat  ' }).name, 'Bat');
  assert.ok(!CreateRoomBody.safeParse({ name: 'Bat', extra: 1 }).success);
  assert.ok(!CreateRoomBody.safeParse({ name: 'x'.repeat(21) }).success);
  assert.ok(!CreateRoomBody.safeParse({ name: 'bad\u0007name' }).success);
  assert.ok(C2S['game:play'].safeParse({ cards: ['a'], expectedRevision: 0, actionId: '123e4567-e89b-42d3-a456-426614174000' }).success);
  assert.ok(!C2S['game:play'].safeParse({ cards: [], expectedRevision: 0, actionId: '123e4567-e89b-42d3-a456-426614174000' }).success);
  assert.ok(!C2S['game:play'].safeParse({ cards: ['a'], expectedRevision: 0, actionId: 'nope' }).success);
  assert.ok(!C2S['game:play'].safeParse({ cards: ['a', 'b', 'c', 'd', 'e', 'f'], expectedRevision: 0, actionId: '123e4567-e89b-42d3-a456-426614174000' }).success);
  assert.ok(!C2S['room:move'].safeParse({ seat: 8 }).success);
  assert.ok(!C2S['room:sync'].safeParse({ junk: true }).success);
});

test('config requires an origin and a long secret, and LiveKit settings come as a set', () => {
  const base = { PUBLIC_ORIGIN: 'https://8gar.textbook.mn/', SESSION_SECRET: SECRET };
  const config = loadConfig(base);
  assert.equal(config.publicOrigin, 'https://8gar.textbook.mn');
  assert.equal(config.livekit, null);
  assert.equal(config.timing.roundReviewMs, 10_000);
  assert.throws(() => loadConfig({ ...base, SESSION_SECRET: 'short' }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ ...base, LIVEKIT_URL: 'wss://x' }), /together/);
  const voice = loadConfig({ ...base, LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's', TRUST_PROXY: '1' });
  assert.deepEqual(voice.livekit, { url: 'wss://x', apiKey: 'k', apiSecret: 's' });
  assert.equal(voice.trustProxy, 1);
});
