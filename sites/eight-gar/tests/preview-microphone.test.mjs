import test from 'node:test';
import assert from 'node:assert/strict';
import { createMicrophoneMeter } from './preview-microphone.js';

function setup(overrides = {}) {
  let tick, amplitude = 0, stops = 0, closes = 0, cancels = 0;
  const levels = [], states = [], events = new Map();
  const track = { stop: () => stops++, addEventListener: (name, fn) => events.set(name, fn) };
  const input = { getTracks: () => [track] };
  const analyser = { fftSize: 0, disconnect() {}, getFloatTimeDomainData(samples) { samples.forEach((_, i) => { samples[i] = i % 2 ? amplitude : -amplitude; }); } };
  const context = { async resume() {}, async close() { closes++; }, createAnalyser: () => analyser, createMediaStreamSource: () => ({ connect: node => assert.equal(node, analyser), disconnect() {} }) };
  const meter = createMicrophoneMeter({ onLevel: value => levels.push(value), onState: state => states.push(state), getUserMedia: async options => { assert.equal(options.video, false); return input; }, createContext: () => context, schedule: fn => { tick = fn; return 1; }, cancel: () => cancels++, ...overrides });
  return { meter, levels, states, input, events, sample(value) { amplitude = value; tick(); }, counts: () => ({ stops, closes, cancels }) };
}

test('real input samples determine the meter; silence and loudness are distinct and bounded', async () => {
  const s = setup(); await s.meter.start();
  s.sample(.001); assert.equal(s.levels.at(-1), 0);
  s.sample(.02); const quiet = s.levels.at(-1);
  s.sample(.1); assert(s.levels.at(-1) > quiet);
  s.sample(1); assert.equal(s.levels.at(-1), 1);
  s.sample(0); assert.equal(s.levels.at(-1), 0);
  s.meter.stop(); assert.deepEqual(s.counts(), { stops: 1, closes: 1, cancels: 1 });
  const count = s.levels.length; s.sample(.5);
  assert.equal(s.levels.length, count, 'a queued read cannot revive the stopped meter');
});

test('cancel while permission is pending releases a microphone granted later', async () => {
  let resolve;
  const s = setup({ getUserMedia: () => new Promise(done => { resolve = done; }) });
  const starting = s.meter.start(); await Promise.resolve();
  s.meter.stop(); resolve(s.input); await starting;
  assert.deepEqual(s.counts(), { stops: 1, closes: 1, cancels: 0 });
  assert(!s.states.includes('on'));
});

test('permission rejection and unplugging release resources and show a recoverable state', async () => {
  const denied = setup({ getUserMedia: async () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); } });
  await denied.meter.start(); assert.equal(denied.states.at(-1), 'error');
  assert.equal(denied.counts().closes, 1);
  const s = setup(); await s.meter.start(); s.events.get('ended')();
  assert.equal(s.states.at(-1), 'ended'); assert.equal(s.levels.at(-1), 0);
  assert.deepEqual(s.counts(), { stops: 1, closes: 1, cancels: 1 });
});
