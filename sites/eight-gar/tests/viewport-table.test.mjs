import test from 'node:test';
import assert from 'node:assert/strict';
import { keepLatestPlayVisible } from '../dist/viewport-table.js';

test('new pile targets scroll into view while redraws preserve manual review', () => {
  const node = { dataset: {}, scrollWidth: 1200, scrollLeft: 0 };
  const pile = [{ id: 'h7' }, { id: 'h8' }];
  keepLatestPlayVisible(node, pile);
  assert.equal(node.scrollLeft, 1200);
  keepLatestPlayVisible(node, pile, 320);
  assert.equal(node.scrollLeft, 320);
  keepLatestPlayVisible(node, [...pile, { id: 'h9' }], 320);
  assert.equal(node.scrollLeft, 1200);
  // Clearing and rebuilding an identical chain must count as a new pile.
  keepLatestPlayVisible(node, []);
  keepLatestPlayVisible(node, pile, 0);
  assert.equal(node.scrollLeft, 1200);
});
