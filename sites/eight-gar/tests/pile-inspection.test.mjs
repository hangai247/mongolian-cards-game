import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidatePileInspection } from '../dist/pile-inspection.js';

function inspector(ids) {
  const container = { children: ids.map(publicId => ({ dataset: { publicId } })), replaceChildren() { this.children = []; } };
  const dialog = { open: true, close() { this.open = false; } };
  return { dialog, container };
}
test('a roster-only resync leaves the current pile inspection open', () => {
  const { dialog, container } = inspector(['a', 'b']);
  assert.equal(invalidatePileInspection(dialog, container, [{ id: 'a' }, { id: 'b' }]), false);
  assert.equal(dialog.open, true);
});
test('new plays, pickup, sleep and same-size replacement invalidate stale inspection', () => {
  for (const pile of [[{ id: 'a' }, { id: 'b' }, { id: 'c' }], [], [{ id: 'c' }, { id: 'd' }]]) {
    const { dialog, container } = inspector(['a', 'b']);
    assert.equal(invalidatePileInspection(dialog, container, pile), true);
    assert.equal(dialog.open, false);
    assert.equal(container.children.length, 0, 'old card identities are removed');
  }
});
