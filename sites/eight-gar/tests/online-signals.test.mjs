import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineSignalControls } from '../dist/online-signals.js';

function client() {
  const listeners = new Map();
  const result = { connected: true, calls: [], async request(...args) { result.calls.push(args); return { ok: true }; }, fire(type, value) { for (const fn of listeners.get(type) ?? []) fn(value); } };
  for (const name of ['State', 'Update', 'Signals', 'Connection']) result[`on${name}`] = fn => {
    const set = listeners.get(name) ?? new Set(); listeners.set(name, set); set.add(fn); return () => set.delete(fn);
  };
  return result;
}
function setup() {
  const frames = [], errors = []; let toggle;
  const controls = createOnlineSignalControls({ onError: message => errors.push(message), mount({ onToggle }) { toggle = onToggle; return { render: frame => frames.push(frame) }; } });
  const net = client(); controls.connect(net);
  return { controls, net, frames, errors, toggle: (...args) => toggle(...args) };
}
const view = player => ({ player, phase: 'choosing-leader', revision: 4, hand: [] });

test('all eight viewers get correctly rotated private badges and only their own hand', () => {
  for (let me = 0; me < 8; me++) {
    const { controls, net, frames } = setup();
    const signals = Array.from({ length: 8 }, (_, seat) => ({ seat, size: 3 }));
    const ownView = view(me);
    net.fire('State', { version: 10, game: { view: ownView, signals } });
    assert.deepEqual(frames.at(-1).signals.map(signal => signal.seat).sort((a, b) => a - b), [0, 2, 4, 6]);
    assert.equal(frames.at(-1).hand, ownView.hand); controls.close();
  }
});

test('private updates do not change game revision; toggles wait for server state and stale packets are ignored', async () => {
  const { controls, net, frames, toggle } = setup();
  net.fire('State', { version: 10, game: { view: view(3), signals: [] } });
  await toggle(5, true);
  assert.deepEqual(net.calls.at(-1), ['game:signal', { size: 5, enabled: true, expectedRevision: 4 }]);
  assert.deepEqual(frames.at(-1).signals, []);
  net.fire('Signals', { version: 11, revision: 4, signals: [{ seat: 3, size: 5 }] });
  assert.deepEqual(frames.at(-1).signals, [{ seat: 0, size: 5 }]);
  net.fire('State', { version: 10, game: { view: view(3), signals: [] } });
  assert.deepEqual(frames.at(-1).signals, [{ seat: 0, size: 5 }]);
  net.fire('Update', { version: 12, view: { ...view(3), revision: 5 }, signals: [] });
  net.fire('Signals', { version: 11, revision: 4, signals: [{ seat: 3, size: 5 }] });
  assert.deepEqual(frames.at(-1).signals, []); controls.close();
});

test('disconnect, stale request errors and changing rooms cannot leave active controls or old badges', async () => {
  const { controls, net, frames, errors, toggle } = setup();
  net.fire('State', { version: 10, game: { view: view(0), signals: [{ seat: 0, size: 3 }] } });
  net.request = async event => { if (event === 'game:signal') throw Object.assign(new Error('Hand changed'), { code: 'STALE_ACTION' }); net.calls.push([event]); };
  await toggle(3, false);
  assert.deepEqual(errors, ['Hand changed']); assert.deepEqual(net.calls.at(-1), ['room:sync']);
  net.connected = false; net.fire('Connection', false); assert(frames.at(-1).busy);
  const other = client(); controls.connect(other);
  net.fire('Signals', { version: 11, revision: 4, signals: [{ seat: 0, size: 3 }] });
  assert.deepEqual(frames.at(-1).signals, []); assert.equal(frames.at(-1).phase, undefined); controls.close();
});
