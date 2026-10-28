import { controlIcon, setActionButton, computerBadge } from './control-icons.js';
import { renderTrumpCard } from './trump-card.js';
import { SUIT_LABELS as LABELS, JOKER_LABELS, cardLabel, ERRORS, errorText } from './locale-mn.js';
import { mountOpenerSelection } from './opener-selection.js';
import { layoutTablePile } from './viewport-table.js?v=ger3';
import { advanceSignals, reconcileSignals, setSignal } from './rules/signals.js';
import { mountTeamSignals } from './team-signals.js';
import { RANKS, SUITS, JOKERS, createDeck, shuffleDeck, prepareMatch, applyAction, prepareNextRound, chooseLeader } from './rules/engine.js';
import { findPlay, chooseComputerLeader } from './rules/strategy.js';
import { readSavedMatch } from './practice-save.js';
import { transitionSteps, fanLayout } from './presentation.js';
import { animateStep } from './motion.js';
import { renderTableInsights, renderDefense } from './table-ui.js';
import { TableAtmosphere } from './atmosphere.js';
import { mountAvatarPicker, rememberedAvatar, rememberAvatar, renderSelfAvatar, normalizeAvatar, botAvatar } from './avatar-picker.js';
const $ = id => document.getElementById(id);
const openerSelection = mountOpenerSelection({ container: $('opening-players'), seatRoot: $('felt'), onChange() { $('confirm-opener').disabled = openerSelection.value === null; } });
const NAMES = ['Та', 'Тэмүү', 'Батаа', 'Сарнай', 'Ану', 'Болд', 'Нараа', 'Оюу'];
const SYMBOLS = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const STORAGE = 'naiman-gar-practice-v1';
let practiceAvatar = normalizeAvatar(rememberedAvatar());
const practicePicker = mountAvatarPicker($('practice-avatar-picker'), { value: rememberedAvatar(), onChange: rememberAvatar });
const newPicker = mountAvatarPicker($('new-avatar-picker'), { value: rememberedAvatar(), onChange: rememberAvatar });
// Pause after the previous play finishes animating, so a human can read the table before the next computer move.
const COMPUTER_TURN_DELAY_MS = 5000;
let state = null, selected = new Set(), liveMove = '', paused = false, byRank = false, timer = null, toastTimer = null;
let signals = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const atmosphere = new TableAtmosphere();
let soundEnabled = true;
try { soundEnabled = localStorage.getItem('eight-gar-sound') !== 'off'; } catch {}
atmosphere.configure({ sound: soundEnabled, volume: .25 });
document.addEventListener('table-sound-change', event => atmosphere.configure({ sound: event.detail, volume: .25 }));
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
  } catch (error) { toast(errorText(error)); }
} });
function renderSignals() {
  signalControls.render({ seat: 0, phase: state?.phase, hand: state?.hands[0], signals });
}
let storageAvailable = true, animating = false, motionController = null, motionEpoch = 0;
let latestCharacterState = null;
let characterRoom = { update(...args) { latestCharacterState = args; } };
import('./photographic-room.js?v=avatars1').then(({CharacterRoom}) => {
  characterRoom = new CharacterRoom($('character-room'));
  if (latestCharacterState) characterRoom.update(...latestCharacterState);
}).catch(() => { $('character-room').dataset.renderer = 'fallback'; });
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const deck = () => shuffleDeck(createDeck(), random);
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function shortCard(card) { return card.kind === 'joker' ? `${JOKER_LABELS[card.color]} жокер` : `${card.rank}${SYMBOLS[card.suit]}`; }
function cardElement(card, interactive = false) {
  const element = document.createElement(interactive ? 'button' : 'div');
  const red = card.kind === 'joker' ? card.color === 'red' : ['hearts', 'diamonds'].includes(card.suit);
  element.className = `card${red ? ' red' : ''}${card.kind === 'joker' ? ` joker ${card.color}` : ''}`;
  element.setAttribute('aria-label', cardLabel(card));
  if (card.kind === 'ordinary') element.dataset.rank = card.rank;
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
  const rank = card.kind === 'joker' ? 'ЖОКЕР' : card.rank;
  const symbol = card.kind === 'joker' ? '✧' : SYMBOLS[card.suit];
  const face = card.kind === 'ordinary' && ['J', 'Q', 'K'].includes(card.rank);
  const pipCount = card.kind === 'joker' ? 0 : Number(card.rank);
  const center = face ? `<span class="face-emblem">${card.rank === 'Q' ? '♛' : card.rank === 'K' ? '♚' : '♞'}</span><span class="face-suit">${symbol}</span>` : pipCount >= 2 && pipCount <= 10 ? `<span class="pips pips-${pipCount}">${Array.from({length:pipCount}, () => `<i>${symbol}</i>`).join('')}</span>` : `<span class="card-center">${symbol}</span>`;
  element.innerHTML = `<span class="card-corner">${rank}<small>${card.kind === 'joker' ? '' : symbol}</small></span>${center}<span class="card-corner card-bottom">${rank}<small>${card.kind === 'joker' ? '' : symbol}</small></span>${card.kind === 'joker' ? `<span class="joker-label">${JOKER_LABELS[card.color]}</span>` : ''}`;
  return element;
}
function save() {
  if (!state) return;
  try { localStorage.setItem(STORAGE, JSON.stringify({ format: 2, state, byRank, signals, avatarId: practiceAvatar })); }
  catch { if (storageAvailable) { storageAvailable = false; toast('Хөтөч тоглолтыг хадгалах боломжгүй байна. Энэ хуудсыг нээлттэй байлгах хугацаанд л тоглолт үргэлжилнэ.'); } }
}
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE); if (!raw) return;
    const parsed = JSON.parse(raw);
    const value = readSavedMatch(parsed);
    if (!value) { localStorage.removeItem(STORAGE); toast('Өмнөх тоглолтыг сэргээж чадсангүй. Шинэ тоглолт эхлүүлнэ үү.'); return; }
    state = { ...value.state, openingTeam: value.state.openingTeam ?? null };
    practiceAvatar = value.avatarId;
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
  hand.style.setProperty('--hand-size', cards.length);
  hand.dataset.count = cards.length;
  cards.forEach((card, index) => {
    const element = cardElement(card, true);
    const position = index - (cards.length - 1) / 2;
    element.style.setProperty('--fan', `${cards.length > 9 ? 0 : position * 4}deg`);
    element.style.setProperty('--lift', `calc(var(--hand-card-height,250px) * ${cards.length > 9 ? 0 : Math.abs(position) ** 1.7 * .008})`);
    hand.append(element);
  });
  hand.scrollLeft = scrollLeft;
  $('hand-count').textContent = `${scene.hands[0].length} хөзөр`;
  const sortLabel = byRank ? 'Тамгаар эрэмбэлэх' : 'Чансаагаар эрэмбэлэх';
  setActionButton($('sort'), sortLabel, 'sort');
  $('sort').title = sortLabel; $('sort').setAttribute('aria-label', sortLabel);
}
function playError() {
  if (!state || selected.size === 0) return null;
  try { applyAction(state, { type: 'play', player: 0, cards: [...selected], expectedRevision: state.revision }); return null; }
  catch (error) { return error.code; }
}
function renderActions() {
  const active = state?.phase === 'playing' && state.turn === 0 && !paused && !animating;
  const canResume = state?.phase === 'playing' && paused && !animating;
  document.body.classList.toggle('is-paused', !!canResume);
  for (const id of ['new-match', 'rules-open', 'sort']) $(id).disabled = animating;
  $('felt').setAttribute('aria-busy', String(animating));
  const error = active ? playError() : null;
  $('play').disabled = !canResume && (!active || selected.size === 0 || !!error);
  $('pickup').disabled = !active || state.table.pile.length === 0;
  const defenseGuidance = renderDefense({ active, hand: state?.hands[0] ?? [], selected, targets: state?.table.highest, trump: state?.trump });
  setActionButton($('play'), canResume ? 'Үргэлжлүүлэх' : 'Тавих', 'chevron', true);
  $('play').setAttribute('aria-label', canResume ? 'Тоглолтыг үргэлжлүүлэх' : selected.size ? `${selected.size} хөзөр тавих` : 'Тавих');
  document.body.dataset.selection = String(selected.size);
  document.body.classList.toggle('my-turn', !!active);
  setActionButton($('pickup'), state?.table.pile.length ? `${state.table.pile.length} хөзөр авах` : 'Авах', 'cards');
  $('pause').hidden = !state || state.phase !== 'playing';
  $('pause').textContent = paused ? 'Үргэлжлүүлэх' : 'Түр зогсоох';
  if (animating) $('guidance').textContent = '';
  else if (!state) $('guidance').textContent = 'Хөзрөө харахын тулд тоглолтоо эхлүүлээрэй.';
  else if (state.phase === 'choosing-leader') $('guidance').textContent = 'Хөзөр тараалаа. Эхлэх багийн шийдвэрийг хүлээж байна.';
  else if (state.phase !== 'playing') $('guidance').textContent = state.winner === 0 ? 'Энэ үед танай баг хожлоо.' : 'Энэ үед эсрэг баг хожлоо.';
  else if (paused) $('guidance').textContent = 'Бэлэн болмогц үргэлжлүүлээрэй.';
  // During play the capsule only explains an illegal selection or the opt-in defence coaching; the seat highlight and buttons say the rest.
  else if (state.turn !== 0) $('guidance').textContent = '';
  else if (error) $('guidance').textContent = defenseGuidance || ERRORS[error] || 'Эдгээр хөзрийг хамтад нь тавих боломжгүй.';
  else $('guidance').textContent = defenseGuidance || '';
  $('guidance').hidden = !$('guidance').textContent;
}
function render(scene = state, motion = null) {
  document.body.classList.toggle('has-match', !!scene);
  document.dispatchEvent(new CustomEvent('game-activity', { detail: { active: ['choosing-leader', 'playing'].includes(scene?.phase) && !paused } }));
  renderSelfAvatar(practiceAvatar);
  $('welcome').hidden = !!scene;
  $('table-stats').hidden = !scene;
  $('score-us').textContent = scene?.scores[0] || 0;
  $('score-them').textContent = scene?.scores[1] || 0;
  for (const [id, team] of [['dots-us', 0], ['dots-them', 1]]) $(''+id).innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < (scene?.scores[team] || 0) ? 'filled' : ''}"></i>`).join('');
  $('round-label').textContent = `${scene?.round || 1}-Р ҮЕ`;
  renderTrumpCard($('trump-label'), $('trump-name'), scene?.trump || 'hearts');
  const shownCounts = scene?.hands.map(hand => hand.length) ?? Array(8).fill(0);
  if (motion?.beforeCounts && ['pickup', 'refill'].includes(motion.type)) shownCounts[motion.player] = motion.beforeCounts[motion.player];
  $('seats').replaceChildren();
  for (let index = 1; index < 8; index++) {
    const count = scene?.hands[index].length ?? 0;
    const shownCount = shownCounts[index];
    const active = scene?.phase === 'playing' && scene.turn === index;
    const winning = ['round-over','match-over'].includes(scene?.phase) && scene.winner === index % 2;
    const moving = motion?.player === index ? motion.type : '';
    const status = !scene ? 'Бэлэн' : moving === 'pickup' ? 'Авч байна' : moving === 'play' ? 'Тоглож байна' : moving === 'refill' ? 'Нөхөж байна' : moving === 'sleep' ? 'Унтана' : winning ? 'Үед хожлоо' : paused ? 'Түр зогссон' : active ? 'Бодож байна' : count === 1 ? 'Сүүлийн хөзөр' : 'Хүлээж байна';
    const seat = document.createElement('div');
    seat.className = `seat seat-${index} ${index % 2 ? 'theirs' : 'ours'}${active ? ' active' : ''}${winning ? ' celebrating' : ''}`;
    seat.dataset.status = status; seat.dataset.player = index;
    seat.setAttribute('aria-label', `${NAMES[index]}, ${index % 2 ? 'эсрэг баг' : 'танай баг'}, ${shownCount} хөзөр${active ? ', одоогийн ээлж' : ''}`);
    seat.innerHTML = `<div class="avatar">${index === 0 ? 'Т' : NAMES[index].slice(0, 1)}</div><div class="seat-details"><span class="seat-name"><span class="seat-name-text">${NAMES[index]}</span></span><span class="seat-meta" aria-label="${shownCount} хөзөр">${index > 0 ? computerBadge() : ''}${controlIcon('cards')}<strong class="seat-count">${shownCount}</strong></span></div><span class="player-status">${index === 0 && active && !motion ? 'Таны ээлж' : status}</span>`;
    if (index > 0) {
      const fan = document.createElement('div'); fan.className = 'opponent-hand';
      fan.setAttribute('aria-label', `${NAMES[index]} · ${shownCount} далд хөзөртэй`);
      fan.style.setProperty('--hand-scale', count > 7 ? '.53' : '.72');
      for (const card of fanLayout(count)) {
        const back = document.createElement('span'); back.className = 'hand-back'; back.setAttribute('aria-hidden','true');
        back.style.setProperty('--back-x', `${card.x}px`); back.style.setProperty('--back-angle', `${card.angle}deg`);
        fan.append(back);
      }
      seat.append(fan);
    }
    $('seats').append(seat);
  }
  renderTableInsights({ scene, motion, counts: shownCounts, names: NAMES, paused, animating });
  characterRoom.update({avatars: Array.from({length: 8}, (_, index) => index === 0 ? practiceAvatar : botAvatar(index)), handCounts:shownCounts, phase:scene?.phase, turn:scene?.turn, winner:scene?.winner, paused, motionEnabled: motionEnabled()}, motion);
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
      group.setAttribute('aria-label', latest ? 'Сүүлийн нүүдэл: дарах хөзөр' : `Өмнөх нүүдэл ${offset / size + 1}`);
      for (const card of scene.table.pile.slice(offset, offset + size)) group.append(cardElement(card));
      $('highest').append(group);
    }
  }
  else if (scene && scene.phase !== 'choosing-leader') { const empty = document.createElement('span'); empty.className = 'empty-table'; empty.textContent = 'Шинээр эхэлнэ.'; $('highest').append(empty); }
  layoutTablePile($('highest'));
  $('turn-label').textContent = !scene ? 'ТАНЫ СУУДАЛ БЭЛЭН' : scene.phase === 'choosing-leader' ? 'ХӨЗӨР ТАРААЛАА · БАГААРАА ЯРИЛЦАХ' : scene.phase !== 'playing' ? 'ҮЕ ДУУСЛАА' : paused ? 'Түр зогссон' : scene.turn === 0 ? 'ТАНЫ ЭЭЛЖ' : `${NAMES[scene.turn].toUpperCase()} · ЭЭЛЖ`;
  if (motion) $('turn-label').textContent = ({pickup:'ХӨЗӨР АВЧ БАЙНА',play:'ХӨЗӨР ТАВЬЖ БАЙНА',refill:'НӨӨЦӨӨС НӨХӨЖ БАЙНА',sleep:'УНТАНА'})[motion.type];
  $('reserve-count').textContent = scene?.reserve.length ?? 3;
  $('reserve-count').parentElement.classList.toggle('empty-reserve', $('reserve-count').textContent === '0');
  $('pile-count').textContent = scene?.table.pile.length ?? 0;
  $('pile-open').disabled = animating || !scene?.table.pile.length;
  $('live-move').textContent = liveMove;
  $('live-move').title = liveMove;
  $('live-move').hidden = !liveMove;
  renderHand(scene);
  if (motion?.player === 0 && motion.beforeCounts && ['pickup','refill'].includes(motion.type)) $('hand-count').textContent = `${motion.beforeCounts[0]} хөзөр`;
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
      liveMove = event.lead ? `${NAMES[actor]} ${cards} тавьж эхэллээ.` : `${NAMES[actor]} ${previousTarget} хөзрийг ${cards} хөзрөөр дарлаа.`;
    } else if (event?.type === 'picked-up') liveMove = `${NAMES[actor]} ширээнээс ${event.cards.length} хөзөр авлаа.`;
    if (events.some(event => event.type === 'table-slept')) liveMove += ` Унтана — хөзөр тоглоомоос гарлаа.${state.phase === 'playing' ? ` ${actor === 0 ? 'Та' : `${NAMES[actor]}`} дахин эхэлнэ.` : ' Үе дууслаа.'}`;
    // Persist one atomic engine result. Animation never changes the committed card inventory.
    save(); animating = true; motionController = new AbortController();
    renderActions();
    for (const step of transitionSteps(previous, events)) {
      if (motionController.signal.aborted || token !== motionEpoch) break;
      atmosphere.cue(step.type, `${token}:${step.type}`);
      if (step.type === 'pickup' && step.cards.length >= 8) characterRoom.react?.({ type: 'surprise', player: actor });
      await animateStep(step, { render, cardElement, signal: motionController.signal, motionEnabled: motionEnabled() });
    }
    completedPresentation = !motionController.signal.aborted;
  } catch (error) {
    toast(ERRORS[error.code] || 'Дараагийн нүүдлээ дахин хийнэ үү.');
    console.error(error);
  } finally {
    if (token === motionEpoch) {
      animating = false; motionController = null; render();
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
  if (!waiting) { openerSelection.reset(); return; }
  const ours = scene.openingTeam === 0;
  $('discussion-title').textContent = ours ? 'Танай баг эхэлнэ.' : 'Эсрэг баг эхэлнэ.';
  $('discussion-copy').textContent = ours
    ? 'Багтайгаа ярилцаад эхлэх тоглогчийн суудлыг сонгоорой.'
    : 'Хөзөр тараагдсан. Эсрэг баг эхлэх тоглогчоо сонгоно.';
  $('human-discussion').hidden = !ours;
  $('computer-discussion').hidden = ours;
  openerSelection.render({ key: scene.round, entries: [0, 2, 4, 6].map(seat => ({ seat, name: NAMES[seat], count: scene.hands[seat].length })), busy: !ours });
  $('confirm-opener').disabled = openerSelection.value === null;
}
function startMatch() {
  openerSelection.reset();
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
  } catch (error) { toast(errorText(error)); }
}
$('confirm-opener').addEventListener('click', () => {
  if (state?.openingTeam === 0 && openerSelection.value !== null) confirmOpeningPlayer(openerSelection.value);
});
$('computer-opener').addEventListener('click', () => {
  if (state?.phase === 'choosing-leader' && state.openingTeam === 1) confirmOpeningPlayer(chooseComputerLeader(state));
});
function showRound() {
  clearBot();
  const matchOver = state.phase === 'match-over', won = state.winner === 0;
  $('result-eyebrow').textContent = matchOver ? 'ТОГЛОЛТ ДУУСЛАА' : `${state.round}-Р ҮЕ ДУУСЛАА`;
  $('result-icon').textContent = won ? '✧' : '◇';
  $('result-title').textContent = won ? matchOver ? 'Танай баг яллаа!' : 'Танай баг нэг хожил авлаа.' : matchOver ? 'Сайхан тоглолт боллоо.' : 'Эсрэг баг нэг хожил авлаа.';
  $('result-detail').textContent = `${NAMES[state.turn]} бүх хөзрөө дуусгалаа. ${state.scores[0]}–${state.scores[1]}${matchOver ? ' — түрүүлж таван үе хожсон баг ялна.' : ` · Дараагийн хөзөр: ${SYMBOLS[SUITS[state.round % 4]]} ${LABELS[SUITS[state.round % 4]]}.`}`;
  $('continue').textContent = matchOver ? 'Дахин нэг тоглолт →' : 'Дараагийн үеийн хөзөр тараах →';
  if (!$('round-dialog').open) $('round-dialog').show();
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
function startWithPicker(picker) {
  if (!picker.value) { picker.requireChoice(); return false; }
  practiceAvatar = picker.value; rememberAvatar(practiceAvatar); startMatch(); return true;
}
$('start').addEventListener('click', () => startWithPicker(practicePicker));
$('new-match').addEventListener('click', () => {
  if (!state) { startWithPicker(practicePicker); return; }
  newPicker.setValue(rememberedAvatar() ?? practiceAvatar); openDialog('new-dialog');
});
$('new-confirm').addEventListener('click', () => { if (startWithPicker(newPicker)) $('new-dialog').close(); });
function togglePause() {
  if (state?.phase !== 'playing') return;
  stopEffects(); paused = !paused; clearBot();
  if (animating) motionController?.abort(); else { render(); scheduleBot(); }
}
$('pause').addEventListener('click', togglePause);
$('sort').addEventListener('click', () => { byRank = !byRank; if (state) { renderHand(); save(); } });
$('play').addEventListener('click', () => {
  if (paused) { togglePause(); return; }
  if (state?.turn === 0 && selected.size) commit({ type: 'play', cards: [...selected] });
});
$('pickup').addEventListener('click', () => { if (state?.turn === 0 && !paused) commit({ type: 'pickup' }); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopEffects(); clearBot(); motionController?.abort(); } else scheduleBot();
});
window.addEventListener('resize', () => { if (animating) { stopEffects(); motionController?.abort(); } });
reducedMotion.addEventListener('change', changePresentation);
document.addEventListener('pointerdown', () => { void atmosphere.unlock(); }, { capture: true });
document.addEventListener('keydown', () => { void atmosphere.unlock(); }, { capture: true });
document.body.classList.toggle('motion-off', !motionEnabled());
restore(); render(); if (state && ['round-over', 'match-over'].includes(state.phase)) showRound();
