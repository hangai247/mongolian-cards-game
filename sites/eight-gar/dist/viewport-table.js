/** Every play gets a readable exposed strip, including the eighth play before sleep. */
export function layoutTablePile(node) {
  const groups = [...node.children].filter(child => child.classList.contains('table-play'));
  const count = groups.length;
  const compact = globalThis.document?.body?.classList.contains('ger-table') === true;
  const columns = count > 3 && node.clientHeight < (count - 1) * 12 + (compact ? 48 : 28) ? 2 : 1;
  const rows = Math.ceil(count / columns);
  if (compact) node.style.setProperty('--stack-peek', '12px');
  const changed = node.dataset?.playCount !== String(count);
  if (node.dataset) {
    node.dataset.playCount = String(count);
    node.dataset.deepPile = String(count > 3);
  }
  node.style.setProperty('--stack-layers', String(Math.max(0, rows - 1)));
  node.style.setProperty('--pile-columns', String(columns));
  node.style.setProperty('--play-size', String(groups.at(-1)?.children.length || 1));
  groups.forEach((group, index) => {
    const column = Math.floor(index / rows);
    const last = Math.min(count, (column + 1) * rows) - 1;
    group.style.setProperty('--stack-depth', String(last - index));
    group.style.setProperty('--stack-column', String(column));
    group.style.zIndex = String(index + 1);
  });
  node.scrollLeft = 0;
  node.scrollTop = 0;
  if (changed && node.dispatchEvent) node.dispatchEvent(new Event('pilechange', { bubbles: true }));
}
