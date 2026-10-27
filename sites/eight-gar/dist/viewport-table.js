/** Keep the newest target in view without moving the page or losing manual pile scrolling. */
export function keepLatestPlayVisible(node, pile = [], previousScroll = 0) {
  const key = pile.map(card => card.id).join('|');
  node.scrollLeft = node.dataset.pileKey === key ? previousScroll : node.scrollWidth;
  node.dataset.pileKey = key;
}
