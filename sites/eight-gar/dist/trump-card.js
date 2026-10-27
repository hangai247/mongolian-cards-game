import { SUIT_LABELS } from './locale-mn.js';

const SYMBOLS = { hearts: '♥︎', diamonds: '♦︎', spades: '♠︎', clubs: '♣︎' };

// A suit-only card avoids suggesting that a particular rank was dealt as trump.
export function renderTrumpCard(card, name, suit) {
  const current = Object.hasOwn(SYMBOLS, suit) ? suit : 'hearts';
  card.dataset.suit = current;
  card.setAttribute('aria-label', `Хөзөр: ${SUIT_LABELS[current]}`);
  for (const pip of card.children) pip.textContent = SYMBOLS[current];
  name.textContent = SUIT_LABELS[current];
}
