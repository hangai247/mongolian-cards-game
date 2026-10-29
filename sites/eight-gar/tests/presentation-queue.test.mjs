import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationQueue } from '../dist/presentation-queue.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('serializes updates and holds ownership until cancellation cleanup finishes', async () => {
  const cleanup = deferred(), started = deferred(), calls = [];
  let active = 0, maxActive = 0;
  const queue = createPresentationQueue({ async run(value, context) {
    active++; maxActive = Math.max(active, maxActive); calls.push(value);
    if (value === 'old') {
      started.resolve(context);
      await cleanup.promise;
      assert.equal(context.signal.aborted, true);
      assert.equal(context.isCurrent(), false);
    }
    active--;
  } });
  const done = queue.enqueue('old');
  await started.promise;
  queue.reset();
  queue.enqueue('new');
  await Promise.resolve();
  assert.deepEqual(calls, ['old'], 'new room waits for old shells to be removed');
  cleanup.resolve(); await done;
  assert.deepEqual(calls, ['old', 'new']); assert.equal(maxActive, 1); assert.equal(queue.busy, false);
});

test('bursts bound the backlog to the newest full snapshot and abort old motion', async () => {
  const cleanup = deferred(), started = deferred(), calls = [];
  const queue = createPresentationQueue({ async run(value, context) {
    calls.push([value, context.skipMotion]);
    if (value === 1) { started.resolve(context); await cleanup.promise; }
  } });
  const done = queue.enqueue(1); const context = await started.promise;
  for (let value = 2; value <= 100; value++) queue.enqueue(value);
  assert.equal(context.signal.aborted, true); assert.equal(queue.hasPending, true);
  cleanup.resolve(); await done;
  assert.deepEqual(calls, [[1, false], [100, true]]);
});

test('one waiting update stays ordered, cancellation without reset keeps the committed snapshot current', async () => {
  const cleanup = deferred(), started = deferred(), calls = [];
  const queue = createPresentationQueue({ async run(value, context) {
    calls.push([value, context.skipMotion]);
    if (value === 1) { started.resolve(context); await cleanup.promise; }
  } });
  const done = queue.enqueue(1), context = await started.promise;
  queue.enqueue(2); assert.equal(context.signal.aborted, false);
  queue.cancelMotion(); assert.equal(context.signal.aborted, true); assert.equal(context.isCurrent(), true);
  cleanup.resolve(); await done;
  assert.deepEqual(calls, [[1, false], [2, false]]);
});

test('failures release the worker and allow subsequent presentations', async () => {
  const calls = [], errors = [];
  const queue = createPresentationQueue({ run(value) { calls.push(value); if (value === 1) throw Error('motion failed'); }, onError: e => errors.push(e.message) });
  await queue.enqueue(1); await queue.enqueue(2);
  assert.deepEqual(calls, [1, 2]); assert.deepEqual(errors, ['motion failed']); assert.equal(queue.busy, false);
});

test('reset before a scheduled worker starts drops obsolete work', async () => {
  const calls = [];
  const queue = createPresentationQueue({ run: value => calls.push(value) });
  const done = queue.enqueue(1); queue.reset(); await done;
  assert.deepEqual(calls, []);
});
