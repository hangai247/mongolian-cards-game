import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenWakeLock } from '../dist/screen-wake-lock.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function lock() {
  const result = new EventTarget(); result.released = false; result.releaseCalls = 0;
  result.release = async () => {
    result.releaseCalls++;
    result.released = true; result.dispatchEvent(new Event('release'));
  };
  return result;
}
function setup({ request, saved, unsupported = false, storage } = {}) {
  const page = new EventTarget(), lifecycle = new EventTarget(); page.visibilityState = 'visible';
  const calls = [], locks = [], states = [], savedValues = [];
  const api = createScreenWakeLock({ page, lifecycle,
    wakeLock: unsupported ? null : { request(type) {
      calls.push(type);
      if (request) return request();
      const next = lock(); locks.push(next); return Promise.resolve(next);
    } },
    storage: storage ?? { getItem: () => saved, setItem: (key, value) => savedValues.push([key, value]) },
    onChange: state => states.push(state),
  });
  return { api, page, lifecycle, calls, locks, states, savedValues,
    get status() { return states.at(-1).status; },
    visibility(value) { page.visibilityState = value; page.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('default is on, but acquires only for active play and releases when play ends', async () => {
  const t = setup(); assert.equal(t.status, 'idle'); assert.equal(t.calls.length, 0);
  t.api.setPlaying(true); await settle();
  assert.deepEqual(t.calls, ['screen']); assert.equal(t.status, 'active');
  t.api.setPlaying(true); assert.equal(t.calls.length, 1);
  t.api.setPlaying(false); await settle();
  assert.equal(t.locks[0].releaseCalls, 1); assert.equal(t.status, 'idle');
  t.api.destroy();
});

test('hidden pages release and visible pages reacquire without duplicated locks', async () => {
  const t = setup(); t.api.setPlaying(true); await settle();
  t.visibility('hidden'); assert.equal(t.status, 'hidden');
  assert.equal(t.locks[0].released, true);
  t.visibility('visible'); t.page.dispatchEvent(new Event('pointerup')); await settle();
  assert.equal(t.calls.length, 2); assert.equal(t.status, 'active'); t.api.destroy();
});

test('pagehide releases even before visibility changes, and pageshow restores', async () => {
  const t = setup(); t.api.setPlaying(true); await settle();
  t.lifecycle.dispatchEvent(new Event('pagehide'));
  t.page.dispatchEvent(new Event('pointerup'));
  assert.equal(t.calls.length, 1); assert.equal(t.locks[0].released, true);
  t.lifecycle.dispatchEvent(new Event('pageshow')); await settle();
  assert.equal(t.calls.length, 2); assert.equal(t.status, 'active'); t.api.destroy();
});

test('off preference survives reload, and opting out releases immediately', async () => {
  const t = setup({ saved: 'off' }); t.api.setPlaying(true);
  assert.equal(t.calls.length, 0); assert.equal(t.status, 'off');
  t.api.setEnabled(true); await settle(); assert.equal(t.status, 'active');
  t.api.setEnabled(false); assert.equal(t.locks[0].released, true);
  t.visibility('hidden'); t.visibility('visible'); await settle();
  assert.equal(t.calls.length, 1); assert.equal(t.status, 'off');
  assert.deepEqual(t.savedValues.map(entry => entry[1]), ['on', 'off']); t.api.destroy();
});

test('a pending request cannot leave a lock behind after opting out', async () => {
  let resolve; const next = lock();
  const t = setup({ request: () => new Promise(done => { resolve = done; }) });
  t.api.setPlaying(true); t.page.dispatchEvent(new Event('pointerup'));
  assert.equal(t.calls.length, 1);
  t.api.setEnabled(false); resolve(next); await settle();
  assert.equal(next.released, true); assert.equal(t.status, 'off'); t.api.destroy();
});

test('returning before an old request resolves releases it and requests a fresh lock', async () => {
  const resolves = [];
  const t = setup({ request: () => new Promise(done => resolves.push(done)) });
  t.api.setPlaying(true); t.visibility('hidden'); t.visibility('visible');
  const old = lock(); resolves[0](old); await settle();
  assert.equal(old.released, true); assert.equal(t.calls.length, 2);
  const current = lock(); resolves[1](current); await settle();
  assert.equal(t.status, 'active'); assert.equal(current.released, false); t.api.destroy();
});

test('browser revocation and rejection are reported without a retry loop', async () => {
  const t = setup(); t.api.setPlaying(true); await settle();
  await t.locks[0].release(); await settle();
  assert.equal(t.status, 'unavailable'); assert.equal(t.calls.length, 1);
  t.api.setPlaying(true); assert.equal(t.calls.length, 1);
  t.page.dispatchEvent(new Event('pointerup')); await settle();
  assert.equal(t.calls.length, 2); assert.equal(t.status, 'active'); t.api.destroy();
  let denied = true;
  const rejected = setup({ request: () => denied ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(lock()) });
  rejected.api.setPlaying(true); await settle();
  assert.equal(rejected.status, 'unavailable'); assert.equal(rejected.calls.length, 1);
  denied = false; rejected.page.dispatchEvent(new Event('keydown')); await settle();
  assert.equal(rejected.status, 'active'); rejected.api.destroy();
});

test('unsupported API and inaccessible storage never break the game', async () => {
  const t = setup({ unsupported: true }); t.api.setPlaying(true); t.api.setEnabled(true);
  assert.equal(t.status, 'unsupported'); assert.equal(t.calls.length, 0); t.api.destroy();
  const blocked = setup({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  blocked.api.setPlaying(true); await settle(); assert.equal(blocked.status, 'active');
  blocked.api.setEnabled(false); assert.equal(blocked.status, 'off'); blocked.api.destroy();
});

test('destroy removes listeners and releases requests that resolve after teardown', async () => {
  let resolve; const next = lock();
  const t = setup({ request: () => new Promise(done => { resolve = done; }) });
  t.api.setPlaying(true); t.api.destroy(); resolve(next); await settle();
  assert.equal(next.released, true);
  t.visibility('visible'); t.lifecycle.dispatchEvent(new Event('pageshow')); t.page.dispatchEvent(new Event('pointerup'));
  t.api.setPlaying(true); t.api.setEnabled(true); await settle(); assert.equal(t.calls.length, 1);
});
