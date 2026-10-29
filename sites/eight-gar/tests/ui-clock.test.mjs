import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiClock } from '../dist/ui-clock.js';

test('clock is idle outside a room, pauses while hidden and refreshes immediately on return', () => {
  const doc = new EventTarget(); doc.hidden = false;
  const timers = new Map(); let id = 0, ticks = 0;
  const clock = createUiClock(() => ticks++, {
    document: doc,
    schedule(fn, ms) { assert.equal(ms, 100); timers.set(++id, fn); return id; },
    cancel(id) { timers.delete(id); },
  });
  assert.equal(timers.size, 0);
  clock.setEnabled(true); assert.equal(ticks, 1); assert.equal(timers.size, 1);
  clock.setEnabled(true); assert.equal(timers.size, 1);
  [...timers.values()][0](); assert.equal(ticks, 2); assert.equal(timers.size, 1);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(timers.size, 0);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(ticks, 3); assert.equal(timers.size, 1);
  clock.setEnabled(false); assert.equal(timers.size, 0);
  doc.dispatchEvent(new Event('visibilitychange')); assert.equal(ticks, 3);
  clock.setEnabled(true); clock.dispose(); assert.equal(timers.size, 0);
  doc.dispatchEvent(new Event('visibilitychange')); assert.equal(ticks, 4);
});
