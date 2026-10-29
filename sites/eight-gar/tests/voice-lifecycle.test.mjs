import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createVoice } from '../dist/voice.js';
import { RoomEvent } from '../dist/vendor/livekit-client.esm.mjs';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(t, overrides = {}) {
  const sinks = new Set(), updates = [], rooms = [];
  const previous = globalThis.document;
  globalThis.document = {
    body: { append: node => sinks.add(node) },
    createElement: () => ({ setAttribute() {}, append() {}, replaceChildren() {}, remove() { sinks.delete(this); } }),
  };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  function createRoom() {
    const room = new EventEmitter();
    Object.assign(room, {
      remoteParticipants: new Map(), canPlaybackAudio: true, disconnects: 0, micCalls: 0,
      localParticipant: { async setMicrophoneEnabled() { room.micCalls++; } },
      async connect() {}, async startAudio() {}, async disconnect() { room.disconnects++; },
      ...overrides,
    });
    rooms.push(room); return room;
  }
  const voice = createVoice({ requestToken: async () => ({ url: 'test', token: 'test' }), createRoom });
  voice.onState(info => updates.push(info.state));
  return { voice, updates, rooms, sinks };
}

test('destroy during voice connect prevents late playback, microphone publication and state updates', async t => {
  const connecting = deferred();
  const { voice, updates, rooms, sinks } = setup(t, { connect: () => connecting.promise });
  const joining = voice.join(); await flush();
  assert.equal(sinks.size, 1);
  await voice.destroy();
  const seen = updates.length;
  connecting.resolve(); await joining;
  assert.equal(sinks.size, 0);
  assert.equal(rooms[0].eventNames().length, 0);
  assert.equal(rooms[0].micCalls, 0);
  assert.equal(updates.length, seen);
  assert.equal(voice.state, 'off');
  await voice.join(); assert.equal(rooms.length, 1, 'retired controller cannot rejoin');
});

test('destroy during microphone permission or audio resume cannot resurrect a departed room', async t => {
  const microphone = deferred(), playback = deferred();
  const { voice, updates, rooms, sinks } = setup(t);
  await voice.join();
  const room = rooms[0];
  room.localParticipant.setMicrophoneEnabled = () => microphone.promise;
  room.startAudio = () => playback.promise;
  const mic = voice.setMic(true), audio = voice.resumeAudio();
  await voice.destroy(); const seen = updates.length;
  microphone.resolve(); playback.resolve(); await Promise.all([mic, audio]);
  room.emit(RoomEvent.Reconnected);
  assert.equal(updates.length, seen);
  assert.equal(voice.micOn, false);
  assert.equal(sinks.size, 0);
});

test('leaving and rejoining the same controller ignores events from the old room', async t => {
  const { voice, rooms, updates } = setup(t);
  await voice.join(); await voice.leave(); await voice.join();
  const seen = updates.length;
  rooms[0].emit(RoomEvent.Reconnecting);
  rooms[0].emit(RoomEvent.Disconnected);
  assert.equal(updates.length, seen);
  assert.equal(voice.state, 'on');
  await voice.destroy();
});

test('volume changes reach the UI even while the same local and remote players keep speaking', async t => {
  const { voice, rooms } = setup(t);
  t.after(() => voice.destroy());
  const received = [];
  voice.onSpeakers((ids, levels) => received.push({ ids, levels }));
  await voice.join();
  const room = rooms[0], local = room.localParticipant;
  Object.assign(local, { identity: 'self', audioLevel: .04 });
  const remote = { identity: 'teammate', audioLevel: .25 };
  room.emit(RoomEvent.ActiveSpeakersChanged, [local, remote]);
  assert.deepEqual(received.at(-1).ids, ['self', 'teammate']);
  assert.deepEqual([...received.at(-1).levels], [['self', .04], ['teammate', .25]]);
  remote.audioLevel = .81;
  room.emit(RoomEvent.ActiveSpeakersChanged, [local, remote]);
  assert.equal(received.at(-1).levels.get('teammate'), .81);
  assert.equal(received[0].levels.get('teammate'), .25, 'published levels are immutable snapshots');
  local.audioLevel = NaN; remote.audioLevel = 3;
  room.emit(RoomEvent.ActiveSpeakersChanged, [local, remote]);
  assert.deepEqual([...received.at(-1).levels], [['self', 0], ['teammate', 1]]);
  room.emit(RoomEvent.ActiveSpeakersChanged, []);
  assert.equal(received.at(-1).levels.size, 0, 'silence clears all levels');
});

test('reconnection and leaving clear audio levels, and retired rooms cannot restore them', async t => {
  const { voice, rooms } = setup(t);
  t.after(() => voice.destroy());
  const received = [];
  voice.onSpeakers((ids, levels) => received.push({ ids, levels }));
  await voice.join();
  const talk = () => rooms[0].emit(RoomEvent.ActiveSpeakersChanged, [{ identity: 'a', audioLevel: .8 }]);
  talk(); rooms[0].emit(RoomEvent.Reconnecting);
  assert.deepEqual(received.at(-1).ids, []);
  assert.equal(received.at(-1).levels.size, 0);
  rooms[0].emit(RoomEvent.Reconnected); talk();
  await voice.leave();
  assert.equal(received.at(-1).levels.size, 0);
  await voice.join();
  const count = received.length;
  talk();
  assert.equal(received.length, count);
});
