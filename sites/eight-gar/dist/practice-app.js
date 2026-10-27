import { keepLatestPlayVisible } from './viewport-table.js';
import { advanceSignals, reconcileSignals, setSignal } from './rules/signals.js';
import { mountTeamSignals } from './team-signals.js';
import { RANKS, SUITS, JOKERS, createDeck, shuffleDeck, prepareMatch, applyAction, prepareNextRound, chooseLeader, canLeadThree, canLeadFive } from './rules/engine.js';
import { findPlay, chooseComputerLeader } from './rules/strategy.js';
import { readSavedMatch } from './practice-save.js';
import { transitionSteps, fanLayout } from './presentation.js';
import { animateStep } from './motion.js';
import { renderTableInsights, renderDefense } from './table-ui.js';
import { TableAtmosphere } from './atmosphere.js';
const $ = id => document.getElementById(id);
const NAMES = ['You', 'Temu', 'Bataa', 'Sarnai', 'Anu', 'Bold', 'Naraa', 'Oyu'];
const SYMBOLS = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const LABELS = { hearts: 'Hearts', diamonds: 'Diamonds', spades: 'Spades', clubs: 'Clubs' };
const STORAGE = 'naiman-gar-practice-v1';
const COMPUTER_TURN_DELAY_MS = 2500;
let state = null, selected = new Set(), liveMove = '', paused = false, byRank = false, timer = null, toastTimer = null;
let signals = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const atmosphere = new TableAtmosphere();
atmosphere.configure({ sound: true, volume: .25 });
const motionEnabled = () => !reducedMotion.matches;
function stopEffects() { atmosphere.stop(); characterRoom.clearReaction?.(); }
function changePresentation() {
  stopEffects(); motionController?.abort();
  document.body.classList.toggle('motion-off', !motionEnabled());
  if (!animating) render();
}

const signalControls = mountTeamSignals({ container: document.querySelector('.hand-zone'), onToggle(size, enabled) {
  if (!state) return;
  try {
    signals = setSignal(state, signals, 0, size, enabled, state.revision);
    save(); renderSignals();
  } catch (error) { toast(error.message); }
} });
function renderSignals() {
  signalControls.render({ seat: 0, phase: state?.phase, hand: state?.hands[0], signals });
}
let storageAvailable = true, animating = false, motionController = null, motionEpoch = 0, motionText = '';
let latestCharacterState = null;
let characterRoom = { update(...args) { latestCharacterState = args; } };
import('./characters.js').then(({CharacterRoom}) => {
  characterRoom = new CharacterRoom($('character-room'));
  if (latestCharacterState) characterRoom.update(...latestCharacterState);
}).catch(() => { $('character-room').dataset.renderer = 'fallback'; });
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const deck = () => shuffleDeck(createDeck(), random);
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function cardLabel(card) { return card.kind === 'joker' ? `${card.color} joker` : `${card.rank} of ${card.suit}`; }
function shortCard(card) { return card.kind === 'joker' ? `${card.color} joker` : `${card.rank}${SYMBOLS[card.suit]}`; }
function cardElement(card, interactive = false) {
  const element = document.createElement(interactive ? 'button' : 'div');
  const red = card.kind === 'joker' ? card.color === 'red' : ['hearts', 'diamonds'].includes(card.suit);
  element.className = `card${red ? ' red' : ''}${card.kind === 'joker' ? ` joker ${card.color}` : ''}`;
  element.setAttribute('aria-label', cardLabel(card));
  if (!interactive) element.dataset.publicId = card.id;
  if (interactive) {
    element.type = 'button'; element.dataset.cardId = card.id;
    element.classList.toggle('selected', selected.has(card.id));
    element.setAttribute('aria-pressed', String(selected.has(card.id)));
    element.disabled = state.turn !== 0 || state.phase !== 'playing' || paused || animating;
    element.addEventListener('click', () => {
      if (selected.has(card.id)) selected.delete(card.id); else selected.add(card.id);
      renderHand(); renderActions();
      document.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`)?.focus({ preventScroll: true });
    });
  }
  const rank = card.kind === 'joker' ? 'JOKER' : card.rank;
  const symbol = card.kind === 'joker' ? '✧' : SYMBOLS[card.suit];
  const face = card.kind === 'ordinary' && ['J', 'Q', 'K'].includes(card.rank);
  const pipCount = card.kind === 'joker' ? 0 : Number(card.rank);
  const center = face ? `<span class="face-emblem">${card.rank === 'Q' ? '♛' : card.rank === 'K' ? '♚' : '♞'}</span><span class="face-suit">${symbol}</span>` : pipCount >= 2 && pipCount <= 10 ? `<span class="pips pips-${pipCount}">${Array.from({length:pipCount}, () => `<i>${symbol}</i>`).join('')}</span>` : `<span class="card-center">${symbol}</span>`;
  element.innerHTML = `<span class="card-corner">${rank}<small>${card.kind === 'joker' ? '' : symbol}</small></span>${center}<span class="card-corner card-bottom">${rank}<small>${card.kind === 'joker' ? '' : symbol}</small></span>${card.kind === 'joker' ? `<span class="joker-label">${card.color}</span>` : ''}`;
  return element;
}
function save() {
  if (!state) return;
  try { localStorage.setItem(STORAGE, JSON.stringify({ format: 2, state, byRank, signals })); }
  catch { if (storageAvailable) { storageAvailable = false; toast('Browser storage is unavailable. This match will last while the page stays open.'); } }
}
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE); if (!raw) return;
    const parsed = JSON.parse(raw);
    const value = readSavedMatch(parsed);
    if (!value) { localStorage.removeItem(STORAGE); toast('The previous save could not be restored. Start a fresh match.'); return; }
    state = { ...value.state, openingTeam: value.state.openingTeam ?? null };
    signals = reconcileSignals(state, parsed.signals);
    byRank = value.byRank === true; paused = state.phase === 'playing';
    save(); // Persist the migrated schema without a move history.
  } catch { storageAvailable = false; }
}
function sortedHand(scene = state) {
  const suitIndex = card => card.kind === 'joker' ? 4 : SUITS.indexOf(card.suit);
  const rankIndex = card => card.kind === 'joker' ? 10 + JOKERS.indexOf(card.color) : RANKS.indexOf(card.rank);
  return [...scene.hands[0]].sort((a, b) => byRank ? rankIndex(a) - rankIndex(b) || suitIndex(a) - suitIndex(b) : suitIndex(a) - suitIndex(b) || rankIndex(a) - rankIndex(b));
}
function renderHand(scene = state) {
  const hand = $('hand'), scrollLeft = hand.scrollLeft; hand.replaceChildren();
  if (!scene) { for (let i = 0; i < 5; i++) { const card = document.createElement('div'); card.className = 'card placeholder-card'; card.setAttribute('aria-hidden', 'true'); hand.append(card); } return; }
  const cards = sortedHand(scene);
  hand.classList.toggle('wide-hand', cards.length > 9);
  cards.forEach((card, index) => {
    const element = cardElement(card, true);
    const position = index - (cards.length - 1) / 2;
    element.style.setProperty('--fan', `${cards.length > 9 ? 0 : position * 4}deg`);
    element.style.setProperty('--lift', `${cards.length > 9 ? 0 : Math.abs(position) ** 1.7 * 2}px`);
    hand.append(element);
  });
  hand.scrollLeft = scrollLeft;
  $('hand-count').textContent = `${scene.hands[0].length} card${scene.hands[0].length === 1 ? '' : 's'}`;
  $('sort').textContent = byRank ? 'Sort by suit ⇅' : 'Sort by rank ⇅';
}
function playError() {
  if (!state || selected.size === 0) return null;
  try { applyAction(state, { type: 'play', player: 0, cards: [...selected], expectedRevision: state.revision }); return null; }
  catch (error) { return error.code; }
}
const ERRORS = { INVALID_LEAD: 'Lead 1 card, a pair + 1, or an eligible two-pair set of 5.', THREE_CARD_LEAD_BLOCKED: 'Three-card leads need all eight players to have at least three cards.', FIVE_CARD_LEAD_BLOCKED: 'Five-card leads need empty reserve and all eight hands at least five.', INVALID_RESPONSE: 'Match the table’s card count and beat every card. Jokers play alone.', INVALID_CARDS: 'Choose distinct cards from your hand.', WRONG_TURN: 'Wait for your turn.', ROUND_CLOSED: 'This round has finished.' };
function renderActions() {
  const active = state?.phase === 'playing' && state.turn === 0 && !paused && !animating;
  for (const id of ['new-match', 'rules-open', 'sort']) $(id).disabled = animating;
  $('felt').setAttribute('aria-busy', String(animating));
  const error = active ? playError() : null;
  $('play').disabled = !active || selected.size === 0 || !!error;
  $('pickup').disabled = !active || state.table.pile.length === 0;
  $('hint').disabled = !active;
  const defenseGuidance = renderDefense({ active, hand: state?.hands[0] ?? [], selected, targets: state?.table.highest, trump: state?.trump });
  $('play').textContent = selected.size ? `Play ${selected.size} card${selected.size === 1 ? '' : 's'} ↑` : 'Play cards ↑';
  $('pickup').textContent = state?.table.pile.length ? `Pick up ${state.table.pile.length}` : 'Pick up';
  $('pause').hidden = !state || state.phase !== 'playing';
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  if (animating) $('guidance').textContent = motionText;
  else if (!state) $('guidance').textContent = 'Start a match to see your cards.';
  else if (state.phase === 'choosing-leader') $('guidance').textContent = 'Cards are dealt. Play waits for the opening team’s decision.';
  else if (state.phase !== 'playing') $('guidance').textContent = state.winner === 0 ? 'Your team takes this round.' : 'The other team takes this round.';
  else if (paused) $('guidance').textContent = 'Table paused. Resume whenever you’re ready.';
  else if (state.turn !== 0) $('guidance').textContent = `${NAMES[state.turn]} is choosing a move…`;
  else if (error) $('guidance').textContent = defenseGuidance || ERRORS[error] || 'These cards cannot be played together.';
  else if (selected.size) $('guidance').textContent = defenseGuidance || 'This play is valid. Ready when you are.';
  else if (state.table.highest.length) $('guidance').textContent = `Beat ${state.table.highest.length} card${state.table.highest.length === 1 ? '' : 's'}, or pick up the whole table.`;
  else $('guidance').textContent = canLeadThree(state)
    ? `Your lead. Choose 1 or 3 cards${canLeadFive(state) ? ', or a two-pair set of 5' : ''}.`
    : 'Lead 1 card. A player has fewer than three cards.';
}
function render(scene = state, motion = null) {
  document.body.classList.toggle('has-match', !!scene);
  $('welcome').hidden = !!scene;
  $('table-stats').hidden = !scene;
  $('score-us').textContent = scene?.scores[0] || 0;
  $('score-them').textContent = scene?.scores[1] || 0;
  for (const [id, team] of [['dots-us', 0], ['dots-them', 1]]) $(''+id).innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < (scene?.scores[team] || 0) ? 'filled' : ''}"></i>`).join('');
  $('round-label').textContent = `ROUND ${String(scene?.round || 1).padStart(2, '0')}`;
  $('trump-label').textContent = `${SYMBOLS[scene?.trump || 'hearts']} ${LABELS[scene?.trump || 'hearts']} trump`;
  const shownCounts = scene?.hands.map(hand => hand.length) ?? Array(8).fill(0);
  if (motion?.beforeCounts && ['pickup', 'refill'].includes(motion.type)) shownCounts[motion.player] = motion.beforeCounts[motion.player];
  $('seats').replaceChildren();
  $('self-seat').replaceChildren();
  for (let index = 0; index < 8; index++) {
    const count = scene?.hands[index].length ?? 0;
    const shownCount = shownCounts[index];
    const active = scene?.phase === 'playing' && scene.turn === index;
    const winning = ['round-over','match-over'].includes(scene?.phase) && scene.winner === index % 2;
    const moving = motion?.player === index ? motion.type : '';
    const status = !scene ? 'Ready' : moving === 'pickup' ? 'Collecting' : moving === 'play' ? 'Playing' : moving === 'refill' ? 'Drawing' : moving === 'sleep' ? 'Унтана' : winning ? 'Round won' : paused ? 'Paused' : active ? 'Thinking' : count === 1 ? 'Last card' : 'Waiting';
    const seat = document.createElement('div');
    seat.className = `seat seat-${index} ${index % 2 ? 'theirs' : 'ours'}${active ? ' active' : ''}${winning ? ' celebrating' : ''}`;
    seat.dataset.status = status; seat.dataset.player = index;
    seat.setAttribute('aria-label', `${NAMES[index]}, ${index % 2 ? 'other' : 'your'} team, ${shownCount} cards${active ? ', current turn' : ''}`);
    seat.innerHTML = `<div class="avatar">${index === 0 ? 'Y' : NAMES[index].slice(0, 1)}</div><div><span class="seat-name">${NAMES[index]}</span><span class="seat-meta"><span class="seat-back" aria-hidden="true"></span> ${shownCount} cards</span></div><span class="player-status">${index === 0 && active && !motion ? 'Your turn' : status}</span>`;
    if (index > 0) {
      const fan = document.createElement('div'); fan.className = 'opponent-hand';
      fan.setAttribute('aria-label', `${NAMES[index]} holds ${shownCount} face-down cards`);
      fan.style.setProperty('--hand-scale', count > 7 ? '.53' : '.72');
      for (const card of fanLayout(count)) {
        const back = document.createElement('span'); back.className = 'hand-back'; back.setAttribute('aria-hidden','true');
        back.style.setProperty('--back-x', `${card.x}px`); back.style.setProperty('--back-angle', `${card.angle}deg`);
        fan.append(back);
      }
      seat.append(fan);
    }
    $(index === 0 ? 'self-seat' : 'seats').append(seat);
  }
  renderTableInsights({ scene, motion, counts: shownCounts, names: NAMES, paused, animating });
  characterRoom.update({handCounts:shownCounts, phase:scene?.phase, turn:scene?.turn, winner:scene?.winner, paused, motionEnabled: motionEnabled()}, motion);
  const pileScroll = $('highest').scrollLeft;
  $('highest').replaceChildren();
  $('pile-key').hidden = !scene?.table.pile.length;
  if (scene?.table.pile.length) {
    const size = scene.table.highest.length;
    const latestStart = scene.table.pile.length - size;
    for (let offset = 0; offset < scene.table.pile.length; offset += size) {
      const latest = offset === latestStart;
      const group = document.createElement('div');
      group.className = `table-play${latest ? ' latest-play' : ''}`;
      group.setAttribute('role', 'listitem');
      group.setAttribute('aria-label', latest ? 'Latest play: cards to beat' : `Earlier play ${offset / size + 1}`);
      for (const card of scene.table.pile.slice(offset, offset + size)) group.append(cardElement(card));
      $('highest').append(group);
    }
  }
  else if (scene && scene.phase !== 'choosing-leader') { const empty = document.createElement('span'); empty.className = 'empty-table'; empty.textContent = 'A fresh lead.'; $('highest').append(empty); }
  keepLatestPlayVisible($('highest'), scene?.table.pile, pileScroll);
  $('turn-label').textContent = !scene ? 'YOUR SEAT IS READY' : scene.phase === 'choosing-leader' ? 'DEALT · TEAM DISCUSSION' : scene.phase !== 'playing' ? 'ROUND COMPLETE' : paused ? 'TABLE PAUSED' : scene.turn === 0 ? 'YOUR TURN' : `${NAMES[scene.turn].toUpperCase()}’S TURN`;
  if (motion) $('turn-label').textContent = ({pickup:'COLLECTING CARDS',play:'PLAYING CARDS',refill:'DRAWING RESERVE',sleep:'УНТАНА'})[motion.type];
  $('reserve-count').textContent = scene?.reserve.length ?? 3;
  $('pile-count').textContent = scene?.table.pile.length ?? 0;
  $('pile-open').disabled = animating || !scene?.table.pile.length;
  $('table-message').hidden = !paused || !scene || scene.phase !== 'playing';
  $('table-message').textContent = 'Take your time. The table is paused.';
  $('live-move').textContent = liveMove;
  $('live-move').title = liveMove;
  $('live-move').hidden = !liveMove;
  renderHand(scene);
  if (motion?.player === 0 && motion.beforeCounts && ['pickup','refill'].includes(motion.type)) $('hand-count').textContent = `${motion.beforeCounts[0]} cards`;
  renderActions(); renderDiscussion(scene); renderSignals();
}
function clearBot() { clearTimeout(timer); timer = null; }
function anyDialog() { return !!document.querySelector('dialog[open]'); }
function scheduleBot() {
  clearBot();
  if (!state || state.phase !== 'playing' || state.turn === 0 || paused || animating || document.hidden || anyDialog()) return;
  const expected = state.revision;
  timer = setTimeout(() => {
    if (!state || state.revision !== expected || paused || animating || document.hidden || anyDialog()) return;
    const cards = findPlay(state);
    commit(cards ? { type: 'play', cards } : { type: 'pickup' });
  }, COMPUTER_TURN_DELAY_MS);
}
async function commit(move) {
  if (!state || state.phase !== 'playing' || animating) return;
  clearBot();
  const token = ++motionEpoch;
  let completedPresentation = false;
  try {
    const previous = state, actor = state.turn;
    const previousTarget = state.table.highest.map(shortCard).join(' · ');
    const { state: next, events } = applyAction(state, { ...move, player: actor, expectedRevision: state.revision });
    state = next; selected.clear();
    signals = advanceSignals(previous, state, signals, [1, 2, 3, 4, 5, 6, 7]);
    const event = events.find(event => event.type === 'played' || event.type === 'picked-up');
    if (event?.type === 'played') {
      const cards = event.cards.map(shortCard).join(' · ');
      liveMove = event.lead ? `${NAMES[actor]} led ${cards}.` : `${NAMES[actor]} beat ${previousTarget} with ${cards}.`;
    } else if (event?.type === 'picked-up') liveMove = `${NAMES[actor]} picked up ${event.cards.length} table card${event.cards.length === 1 ? '' : 's'}.`;
    if (events.some(event => event.type === 'table-slept')) liveMove += ` Унтана — the pile is out of play.${state.phase === 'playing' ? ` ${actor === 0 ? 'You lead' : `${NAMES[actor]} leads`} again.` : ' Round complete.'}`;
    // Persist one atomic engine result. Animation never changes the committed card inventory.
    save(); animating = true; motionController = new AbortController();
    renderActions();
    for (const step of transitionSteps(previous, events)) {
      if (motionController.signal.aborted || token !== motionEpoch) break;
      motionText = step.type === 'pickup' ? `${NAMES[actor]} · collecting ${step.cards.length} card${step.cards.length === 1 ? '' : 's'}…` : step.type === 'refill' ? 'Drawing from reserve…' : step.type === 'sleep' ? 'Унтана · clearing the pile…' : `${NAMES[actor]} · playing ${step.cards.length} card${step.cards.length === 1 ? '' : 's'}…`;
      atmosphere.cue(step.type, `${token}:${step.type}`);
      if (step.type === 'pickup' && step.cards.length >= 8) characterRoom.react?.({ type: 'surprise', player: actor });
      await animateStep(step, { render, cardElement, signal: motionController.signal, motionEnabled: motionEnabled() });
    }
    completedPresentation = !motionController.signal.aborted;
  } catch (error) {
    toast(ERRORS[error.code] || 'The table has settled. Please try your next move.');
    console.error(error);
  } finally {
    if (token === motionEpoch) {
      animating = false; motionController = null; motionText = ''; render();
      if (state && ['round-over','match-over'].includes(state.phase)) {
        if (completedPresentation && !paused && !document.hidden) {
          atmosphere.cue('win', `${token}:win`);
          characterRoom.react?.({ type: 'win', team: state.winner });
        }
        showRound();
      } else scheduleBot();
    }
  }
}
function renderDiscussion(scene = state) {
  const waiting = scene?.phase === 'choosing-leader';
  $('discussion').hidden = !waiting;
  if (!waiting) return;
  const ours = scene.openingTeam === 0;
  $('discussion-title').textContent = ours ? 'Your team opens.' : 'The other team opens.';
  $('discussion-copy').textContent = ours
    ? 'Look at your dealt hand below. Discuss with your team, then agree who should lead.'
    : 'The cards are already dealt. The computer team will compare its own hands to choose an opener.';
  $('human-discussion').hidden = !ours;
  $('computer-discussion').hidden = ours;
  $('opening-player').value = '';
  $('confirm-opener').disabled = true;
}
function startMatch() {
  stopEffects();
  motionEpoch++; motionController?.abort(); motionController = null; animating = false;
  clearBot(); selected.clear(); paused = false; liveMove = '';
  state = prepareMatch(deck(), random() < .5 ? 0 : 1);
  signals = advanceSignals(null, state, [], [1, 2, 3, 4, 5, 6, 7]);

  save(); render();
}
function confirmOpeningPlayer(leader) {
  if (state?.phase !== 'choosing-leader') return;
  try {
    state = chooseLeader(state, leader, state.revision); selected.clear(); paused = false; liveMove = '';

    save(); render(); scheduleBot();
  } catch (error) { toast(error.message); }
}
$('opening-player').addEventListener('change', () => {
  $('confirm-opener').disabled = $('opening-player').value === '';
});
$('confirm-opener').addEventListener('click', () => {
  if (state?.openingTeam === 0 && $('opening-player').value !== '') confirmOpeningPlayer(Number($('opening-player').value));
});
$('computer-opener').addEventListener('click', () => {
  if (state?.phase === 'choosing-leader' && state.openingTeam === 1) confirmOpeningPlayer(chooseComputerLeader(state));
});
function showRound() {
  clearBot();
  const matchOver = state.phase === 'match-over', won = state.winner === 0;
  $('result-eyebrow').textContent = matchOver ? 'MATCH COMPLETE' : `ROUND ${state.round} COMPLETE`;
  $('result-icon').textContent = won ? '✧' : '◇';
  $('result-title').textContent = won ? matchOver ? 'Your team wins!' : 'One for your team.' : matchOver ? 'A well-played match.' : 'One for the other team.';
  $('result-detail').textContent = `${NAMES[state.turn]} emptied their hand. ${state.scores[0]}–${state.scores[1]}${matchOver ? ' — the first team to five takes the match.' : ` · Next trump: ${SYMBOLS[SUITS[state.round % 4]]} ${LABELS[SUITS[state.round % 4]]}.`}`;
  $('continue').textContent = matchOver ? 'Play another match →' : 'Deal next round →';
  if (!$('round-dialog').open) $('round-dialog').showModal();
}
$('continue').addEventListener('click', () => {
  stopEffects();
  $('round-dialog').close();
  if (state.phase === 'match-over') startMatch();
  else {
    state = prepareNextRound(state, deck(), state.revision);
    signals = advanceSignals(null, state, [], [1, 2, 3, 4, 5, 6, 7]);
    paused = false; selected.clear(); liveMove = '';

    save(); render();
  }
});
$('round-dialog').addEventListener('cancel', event => event.preventDefault());
function openDialog(id) { if (animating) return; clearBot(); $(id).showModal(); }
$('rules-open').addEventListener('click', () => openDialog('rules-dialog'));
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', () => scheduleBot());
$('pile-open').addEventListener('click', () => { $('pile-cards').replaceChildren(...state.table.pile.map(card => cardElement(card))); openDialog('pile-dialog'); });
$('start').addEventListener('click', startMatch);
$('new-match').addEventListener('click', () => state ? openDialog('new-dialog') : startMatch());
$('new-confirm').addEventListener('click', () => { $('new-dialog').close(); startMatch(); });
$('pause').addEventListener('click', () => { stopEffects(); paused = !paused; clearBot(); if (animating) motionController?.abort(); else { render(); scheduleBot(); } });
$('sort').addEventListener('click', () => { byRank = !byRank; if (state) { renderHand(); save(); } });
$('play').addEventListener('click', () => { if (state?.turn === 0 && !paused && selected.size) commit({ type: 'play', cards: [...selected] }); });
$('pickup').addEventListener('click', () => { if (state?.turn === 0 && !paused) commit({ type: 'pickup' }); });
$('hint').addEventListener('click', () => {
  if (state?.turn !== 0 || paused) return;
  const cards = findPlay(state); selected = new Set(cards || []); renderHand(); renderActions();
  if (!cards) toast('No beating response is available. Pick up the table.');
  else toast(`Suggested ${cards.length}-card play selected. You decide whether to play it.`);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopEffects(); clearBot(); motionController?.abort(); } else scheduleBot();
});
window.addEventListener('resize', () => { if (animating) { stopEffects(); motionController?.abort(); } });
reducedMotion.addEventListener('change', changePresentation);
document.addEventListener('pointerdown', () => { void atmosphere.unlock(); }, { capture: true });
document.addEventListener('keydown', () => { void atmosphere.unlock(); }, { capture: true });
document.body.classList.toggle('motion-off', !motionEnabled());
restore(); render(); if (state && ['round-over', 'match-over'].includes(state.phase)) showRound();
