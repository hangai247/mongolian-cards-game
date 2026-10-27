import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTablePile } from '../dist/viewport-table.js';

const style = () => ({ setProperty(key, value) { this[key] = value; } });
const group = size => ({ classList: { contains: () => true }, children: Array(size), style: style() });

test('table pile keeps the newest set on top and exposes every level', () => {
  for (const size of [1, 3, 5]) {
    const node = { children: Array.from({ length: 8 }, () => group(size)), style: style(), scrollLeft: 500 };
    layoutTablePile(node);
    assert.equal(node.style['--play-size'], String(size));
    assert.equal(node.style['--stack-layers'], '7');
    assert.deepEqual(node.children.map(g => g.style['--stack-depth']), ['7','6','5','4','3','2','1','0']);
    assert.deepEqual(node.children.map(g => g.style.zIndex), ['1','2','3','4','5','6','7','8']);
    assert.equal(node.scrollLeft, 0);
    node.children = [group(size)];
    layoutTablePile(node);
    assert.equal(node.children[0].style['--stack-depth'], '0');
    node.children = [];
    layoutTablePile(node);
    assert.equal(node.style['--play-size'], '1');
    assert.equal(node.style['--stack-layers'], '0');
  }
});

test('short tables split a deep pile into chronological stacks with distinct levels', () => {
  const node = { children: Array.from({ length: 8 }, () => group(3)), style: style(), clientHeight: 90 };
  layoutTablePile(node);
  assert.equal(node.style['--pile-columns'], '2');
  assert.deepEqual(node.children.map(g => [g.style['--stack-column'],g.style['--stack-depth']]), [['0','3'],['0','2'],['0','1'],['0','0'],['1','3'],['1','2'],['1','1'],['1','0']]);
});
