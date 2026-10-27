import test from 'node:test';
import assert from 'node:assert/strict';
import { readSavedMatch } from '../dist/practice-save.js';
import { fixture, h, d } from '../../../test/helpers.mjs';

test('practice saves retain both valid declarations and strip malformed signal data', () => {
  const state = fixture({ hands: { 0: [h('7'), d('7'), h('8'), d('8'), h('9')] }, size: 4 });
  const signals = [{ seat: 0, size: 3 }, { seat: 0, size: 5 }];
  const result = readSavedMatch(JSON.parse(JSON.stringify({ format: 2, state, byRank: true, signals: [...signals, null, { seat: 8, size: 5 }] })));
  assert.deepEqual(result.signals, signals); assert.deepEqual(result.state, state); assert(result.byRank);
  assert.deepEqual(readSavedMatch({ format: 2, state }).signals, []);
  assert.deepEqual(readSavedMatch({ format: 1, state }).signals, []);
});

test('signal data never makes an invalid practice game restorable', () => {
  assert.equal(readSavedMatch({ format: 2, state: { hands: [] }, signals: [{ seat: 0, size: 3 }] }), null);
});
