import { analyzeDefense } from './rules/engine.js';
import { chainProgress, teamSummary, turnGuidance, defenseMessage } from './table-insights.js';

const $ = id => document.getElementById(id);
const suits = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const label = card => card.kind === 'joker' ? `${card.color} joker` : `${card.rank}${suits[card.suit]}`;
function setText(node, value) { if (node.textContent !== value) node.textContent = value; }
export function teamMark(ours) {
  const mark = document.createElement('span');
  mark.className = `team-mark ${ours ? 'shield' : 'ring'}`;
  mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', ours ? 'Your team' : 'Other team');
  return mark;
}

export function renderTableInsights({ scene, motion, counts, names, paused = false, animating = false }) {
  const progress = chainProgress(scene?.table, motion);
  const meter = $('sleep-meter');
  meter.hidden = scene?.phase !== 'playing';
  meter.classList.toggle('near-sleep', progress === 7);
  meter.classList.toggle('sleep-complete', progress === 8);
  $('sleep-progress').setAttribute('aria-valuenow', String(progress));
  $('sleep-progress').setAttribute('aria-valuetext', `${progress} of 8 plays`);
  for (const [index, node] of [...$('sleep-markers').children].entries()) node.classList.toggle('filled', index < progress);
  setText($('sleep-label'), `Унтана · ${progress}/8 plays`);
  const sleepText = progress === 8 ? (motion?.type === 'sleep' ? 'Унтана — pile asleep.' : 'Eight plays — reserve draws finish before the pile sleeps.') : progress === 7
    ? 'One more successful beat puts the pile to sleep. The eighth player leads again unless they win.' : '';
  setText($('sleep-note'), meter.hidden ? '' : sleepText);
  meter.title = sleepText || 'One lead and seven successful defenses put the pile to sleep.';

  const guidance = scene ? turnGuidance(scene, animating ? motion ?? { player: scene.turn } : null) : null;
  const note = $('turn-order-note');
  setText(note, paused ? '' : guidance?.note ?? ''); note.hidden = !note.textContent;
  for (const node of document.querySelectorAll('#seats .seat, #self-seat .seat')) {
    const seat = Number(node.dataset.player), ours = seat % 2 === 0;
    node.prepend(teamMark(ours));
    node.classList.toggle('next-seat', !paused && guidance?.next === seat);
    if (!paused && guidance && (guidance.current === seat || guidance.next === seat)) {
      const tag = document.createElement('span'); tag.className = 'turn-marker';
      tag.textContent = guidance.current === seat ? guidance.currentLabel : guidance.nextLabel;
      if (animating && motion && guidance.current === seat) tag.textContent = ({ play: 'Playing', pickup: 'Collecting', refill: 'Drawing', sleep: 'Унтана' })[motion.type] ?? 'Playing';
      node.append(tag);
    }
  }
  const summary = $('team-summary');
  summary.hidden = !scene || !['choosing-leader', 'playing'].includes(scene.phase);
  const entries = teamSummary(counts);
  const key = JSON.stringify([entries, names]);
  if (summary.dataset.key !== key) {
    summary.dataset.key = key;
    const title = document.createElement('strong'); title.textContent = 'Your team';
    summary.replaceChildren(teamMark(true), title, ...entries.map(({ seat, count, lastCard }) => {
      const item = document.createElement('span'); item.className = `team-member${lastCard ? ' last-card' : ''}`;
      item.textContent = `${names[seat]} ${count}`;
      item.setAttribute('aria-label', `${names[seat]}, ${count} card${count === 1 ? '' : 's'}${lastCard ? ', last card' : ''}`);
      if (lastCard) { const badge = document.createElement('small'); badge.textContent = 'Last card'; item.append(badge); }
      return item;
    }));
    const unit = document.createElement('span'); unit.className = 'summary-unit'; unit.textContent = 'cards'; summary.append(unit);
  }
}

export function renderDefense({ active, hand, selected, targets, trump }) {
  const panel = $('defense-preview'); panel.hidden = !active || !targets?.length;
  if (panel.hidden) { setText($('defense-status'), ''); return ''; }
  const cards = hand.filter(card => selected.has(card.id));
  const analysis = analyzeDefense(cards, targets, trump);
  const message = defenseMessage(analysis, cards.length, targets.length);
  setText($('defense-status'), message);
  const assignments = new Map(analysis.assignments.map(pair => [pair.targetIndex, pair.candidateIndex]));
  $('defense-pairs').replaceChildren(...targets.map((target, index) => {
    const candidateIndex = assignments.get(index), card = candidateIndex === undefined ? null : cards[candidateIndex];
    const row = document.createElement('div'); row.className = `defense-pair ${card ? 'covered' : 'uncovered'}`;
    const targetNode = document.createElement('span'); targetNode.className = `defense-card${['hearts', 'diamonds'].includes(target.suit) ? ' red' : ''}`; targetNode.textContent = label(target);
    targetNode.setAttribute('aria-label', target.kind === 'joker' ? label(target) : `${target.rank} of ${target.suit}`);
    const result = document.createElement('span'); result.className = 'defense-result';
    result.textContent = card ? `← ${label(card)} ✓` : '○ Not covered';
    result.setAttribute('aria-label', card ? `beaten by ${label(card)}` : 'Not covered');
    row.append(targetNode, result); return row;
  }));
  const unused = analysis.unmatchedCandidateIndices.map(index => label(cards[index]));
  setText($('defense-unused'), unused.length ? `Unused selected cards: ${unused.join(' · ')}` : '');
  $('defense-unused').hidden = !unused.length;
  return message;
}
