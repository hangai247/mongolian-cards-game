import { cardLabel } from './locale-mn.js';
import { analyzeDefense } from './rules/engine.js';
import { chainProgress, teamSummary, turnGuidance, defenseMessage } from './table-insights.js';

const $ = id => document.getElementById(id);
const suits = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const label = card => card.kind === 'joker' ? cardLabel(card) : `${card.rank}${suits[card.suit]}`;
function setText(node, value) { if (node.textContent !== value) node.textContent = value; }
export function teamMark(ours) {
  const mark = document.createElement('span');
  mark.className = `team-mark ${ours ? 'shield' : 'ring'}`;
  mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', ours ? 'Танай баг' : 'Эсрэг баг');
  return mark;
}

export function renderTableInsights({ scene, motion, counts, names, paused = false, animating = false }) {
  const progress = chainProgress(scene?.table, motion);
  const meter = $('sleep-meter');
  meter.hidden = scene?.phase !== 'playing';
  meter.classList.toggle('near-sleep', progress === 7);
  meter.classList.toggle('sleep-complete', progress === 8);
  $('sleep-progress').setAttribute('aria-valuenow', String(progress));
  $('sleep-progress').setAttribute('aria-valuetext', `8 нүүдлээс ${progress}`);
  for (const [index, node] of [...$('sleep-markers').children].entries()) node.classList.toggle('filled', index < progress);
  setText($('sleep-label'), `Унтана · ${progress}/8 нүүдэл`);
  const sleepText = progress === 8 ? (motion?.type === 'sleep' ? 'Унтана — хөзөр унтлаа.' : 'Найман нүүдэл — газраас нөхсөний дараа хөзөр унтана.') : progress === 7
    ? 'Дахин нэг удаа дарвал хөзөр унтана. Найм дахь тоглогч хожоогүй бол дахин эхэлнэ.' : '';
  setText($('sleep-note'), meter.hidden ? '' : sleepText);
  meter.title = sleepText || 'Нэг удаа эхэлж тавиад дараалан долоон удаа дарвал хөзөр унтана.';

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
      if (animating && motion && guidance.current === seat) tag.textContent = ({ play: 'Тоглож байна', pickup: 'Авч байна', refill: 'Нөхөж байна', sleep: 'УНТАНА' })[motion.type] ?? 'Тоглож байна';
      node.append(tag);
    }
  }
  const summary = $('team-summary');
  summary.hidden = !scene || !['choosing-leader', 'playing'].includes(scene.phase);
  const entries = teamSummary(counts);
  const key = JSON.stringify([entries, names]);
  if (summary.dataset.key !== key) {
    summary.dataset.key = key;
    const title = document.createElement('strong'); title.textContent = 'Танай баг';
    summary.replaceChildren(teamMark(true), title, ...entries.map(({ seat, count, lastCard }) => {
      const item = document.createElement('span'); item.className = `team-member${lastCard ? ' last-card' : ''}`;
      item.textContent = `${names[seat]} ${count}`;
      item.setAttribute('aria-label', `${names[seat]}, ${count} хөзөр${lastCard ? ', сүүлийн хөзөр' : ''}`);
      if (lastCard) { const badge = document.createElement('small'); badge.textContent = 'Сүүлийн хөзөр'; item.append(badge); }
      return item;
    }));
    const unit = document.createElement('span'); unit.className = 'summary-unit'; unit.textContent = 'хөзөр'; summary.append(unit);
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
    targetNode.setAttribute('aria-label', cardLabel(target));
    const result = document.createElement('span'); result.className = 'defense-result';
    result.textContent = card ? `← ${label(card)} ✓` : '○ Дараагүй';
    result.setAttribute('aria-label', card ? `${label(card)} хөзрөөр дарсан` : 'Дараагүй');
    row.append(targetNode, result); return row;
  }));
  const unused = analysis.unmatchedCandidateIndices.map(index => label(cards[index]));
  setText($('defense-unused'), unused.length ? `Дарахгүй байгаа сонгосон хөзөр: ${unused.join(' · ')}` : '');
  $('defense-unused').hidden = !unused.length;
  return message;
}
