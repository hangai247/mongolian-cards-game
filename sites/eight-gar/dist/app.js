import { controlIcon, setActionButton } from './control-icons.js';
import { renderTrumpCard } from './trump-card.js';
import { SUIT_LABELS as LABELS, JOKER_LABELS, cardLabel, ERRORS, errorText, seatName } from './locale-mn.js';
import { isOpenSeat, teamGroups, switchTeamTarget } from './lobby-teams.js';
import { mountOpenerSelection } from './opener-selection.js';
import { layoutTablePile } from './viewport-table.js?v=ger3';
/** Networked table controller. The server is authoritative; this file renders views, animates committed
 *  transitions and sends intents. It never holds another player's cards. */
import { RANKS, SUITS, JOKERS, applyAction, canLeadThree, canLeadFive } from './engine.js';
import { findPlay } from './strategy.js';
import { transitionSteps, fanLayout } from './presentation.js';
import { animateStep } from './motion.js';
import { sceneFromView, localizeEvents, prepareForTransition, displaySeat, realSeat } from './scene.js';
import * as net from './net.js';
import { createVoice } from './voice.js';
import { createOnlineSignalControls } from './online-signals.js';

const $ = id => document.getElementById(id);
const openerSelection = mountOpenerSelection({ container: $('opening-players'), seatRoot: $('felt'), onChange() { $('confirm-opener').disabled = openerSelection.value === null || confirmPending || !connected; } });
const SYMBOLS = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const NAME_KEY = 'gar:name', SORT_KEY = 'gar:byRank';
const ENGINE_EVENTS = new Set(['played', 'picked-up', 'refilled', 'table-slept']);

// Session and room
let session = null, client = null, room = null, latestView = null, me = 0, names = defaultNames(), connected = false;
// Rendered scene (display coordinates) and animation state
let scene = null, selected = new Set(), liveMove = '', byRank = false, toastTimer = null;
let animating = false, motionController = null, motionEpoch = 0, motionText = '', rosterDirty = false;
let pendingUpdates = [], processing = false;
// Timers from the server (epoch ms on the server clock)
let deadline = null, timerKind = null, reviewUntil = null;
// Voice
let voice = null, voiceInfo = { state: 'off', micOn: false, micWanted: false, micBlocked: false, audioBlocked: false }, speakingIds = new Set(), voiceMembers = new Map();
const MIC_KEY = 'gar:mic';
// Pending intents
let pendingAction = null, continuePending = false, confirmPending = false;
let latestCharacterState = null;
const signalControls = createOnlineSignalControls({ container: document.querySelector('.hand-zone'), onError: toast });
let characterRoom = { update(...args) { latestCharacterState = args; } };
import('./photographic-room.js?v=ger3.2').then(({ CharacterRoom }) => {
  characterRoom = new CharacterRoom($('character-room'));
  if (latestCharacterState) characterRoom.update(...latestCharacterState);
}).catch(() => { $('character-room').dataset.renderer = 'fallback'; });

function defaultNames() { return ['Та', '2-р суудал', '3-р суудал', '4-р суудал', '5-р суудал', '6-р суудал', '7-р суудал', '8-р суудал']; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function shortCard(card) { return card.kind === 'joker' ? `${JOKER_LABELS[card.color]} жокер` : `${card.rank}${SYMBOLS[card.suit]}`; }
const serverNow = () => (client ? client.serverNow() : Date.now());
const seatInfo = display => room?.seats?.[realSeat(display, me)] ?? null;
const store = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage optional */ } };
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };

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
    element.disabled = !scene || scene.turn !== 0 || scene.phase !== 'playing' || animating || !connected;
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
function sortedHand(sceneArg = scene) {
  const suitIndex = card => card.kind === 'joker' ? 4 : SUITS.indexOf(card.suit);
  const rankIndex = card => card.kind === 'joker' ? 10 + JOKERS.indexOf(card.color) : RANKS.indexOf(card.rank);
  return [...sceneArg.hands[0]].sort((a, b) => byRank ? rankIndex(a) - rankIndex(b) || suitIndex(a) - suitIndex(b) : suitIndex(a) - suitIndex(b) || rankIndex(a) - rankIndex(b));
}
function renderHand(sceneArg = scene) {
  const hand = $('hand'), scrollLeft = hand.scrollLeft; hand.replaceChildren();
  if (!sceneArg) { for (let i = 0; i < 5; i++) { const card = document.createElement('div'); card.className = 'card placeholder-card'; card.setAttribute('aria-hidden', 'true'); hand.append(card); } $('hand-count').textContent = 'Эхлэхэд 5 хөзөр'; return; }
  const cards = sortedHand(sceneArg);
  hand.classList.toggle('wide-hand', cards.length > 9);
  hand.style.setProperty('--hand-size', cards.length);
  hand.dataset.count = cards.length;
  cards.forEach((card, index) => {
    const element = cardElement(card, true);
    const position = index - (cards.length - 1) / 2;
    element.style.setProperty('--fan', `${cards.length > 9 ? 0 : position * 4}deg`);
    element.style.setProperty('--lift', `${cards.length > 9 ? 0 : Math.abs(position) ** 1.7 * 2}px`);
    hand.append(element);
  });
  hand.scrollLeft = scrollLeft;
  $('hand-count').textContent = `${sceneArg.hands[0].length} хөзөр`;
  const sortLabel = byRank ? 'Тамгаар эрэмбэлэх' : 'Чансаагаар эрэмбэлэх';
  setActionButton($('sort'), sortLabel, 'sort');
  $('sort').title = sortLabel; $('sort').setAttribute('aria-label', sortLabel);
}
function playError() {
  if (!scene || selected.size === 0) return null;
  try { applyAction(scene, { type: 'play', player: 0, cards: [...selected], expectedRevision: scene.revision }); return null; }
  catch (error) { return error.code; }
}

function renderActions() {
  const active = scene?.phase === 'playing' && scene.turn === 0 && !animating && connected;
  for (const id of ['new-match', 'rules-open', 'sort']) $(id).disabled = animating;
  $('felt').setAttribute('aria-busy', String(animating));
  const error = active ? playError() : null;
  $('play').disabled = !active || selected.size === 0 || !!error || !!pendingAction;
  $('pickup').disabled = !active || scene.table.pile.length === 0 || !!pendingAction;
  $('hint').disabled = !active;
  setActionButton($('play'), 'Тавих', 'chevron', true);
  $('play').setAttribute('aria-label', selected.size ? `${selected.size} хөзөр тавих` : 'Тавих');
  document.body.dataset.selection = String(selected.size);
  document.body.classList.toggle('my-turn', !!active);
  setActionButton($('pickup'), scene?.table.pile.length ? `${scene.table.pile.length} хөзөр авах` : 'Авах', 'cards');
  if (animating) $('guidance').textContent = motionText;
  else if (!session) $('guidance').textContent = 'Хөзрөө харахын тулд ширээ нээх эсвэл ширээнд нэгдээрэй.';
  else if (!scene) $('guidance').textContent = 'Тоглогчдыг хүлээж байна. Ширээ нээсэн хүн тоглолт эхлүүлэхэд хөзөр тараана.';
  else if (!connected) $('guidance').textContent = 'Ширээнд дахин холбогдож байна…';
  else if (scene.phase === 'choosing-leader') $('guidance').textContent = 'Хөзөр тараалаа. Эхлэх багийн шийдвэрийг хүлээж байна.';
  else if (scene.phase !== 'playing') $('guidance').textContent = scene.winner === 0 ? 'Энэ үед танай баг хожлоо.' : 'Энэ үед эсрэг баг хожлоо.';
  else if (scene.turn !== 0) $('guidance').textContent = `${names[scene.turn]} нүүдлээ сонгож байна…`;
  else if (error) $('guidance').textContent = ERRORS[error] || 'Эдгээр хөзрийг хамтад нь тавих боломжгүй.';
  else if (selected.size) $('guidance').textContent = 'Энэ нүүдэл зөв. Бэлэн бол тавиарай.';
  else if (scene.table.highest.length) $('guidance').textContent = `${scene.table.highest.length} хөзрийг дарах эсвэл ширээний бүх хөзрийг аваарай.`;
  else $('guidance').textContent = canLeadThree(scene)
    ? `Та эхэлнэ. Нэг эсвэл гурван хөзөр${canLeadFive(scene) ? ', эсвэл хоёр хостой таван хөзөр' : ''} сонгоорой.`
    : 'Нэг хөзрөөр эхэлнэ. Гурваас цөөн хөзөртэй тоглогч байна.';
}
function seatStatus(sceneArg, index, motion, count, active, winning) {
  const info = seatInfo(index);
  const moving = motion?.player === index ? motion.type : '';
  if (moving === 'pickup') return 'Авч байна'; if (moving === 'play') return 'Тоглож байна'; if (moving === 'refill') return 'Нөхөж байна'; if (moving === 'sleep') return 'Унтана';
  if (!sceneArg) return info?.kind === 'bot' ? 'Компьютер' : info?.kind === 'human' ? (info.connected ? 'Бэлэн' : 'Холболтгүй') : 'Сул';
  if (winning) return 'Үед хожлоо';
  if (info?.kind === 'human' && !info.connected && index !== 0) return active ? 'Холболтгүй · хугацаа явж байна' : 'Холболтгүй';
  if (active) return index === 0 && !motion ? 'Таны ээлж' : 'Бодож байна';
  if (count === 1) return 'Сүүлийн хөзөр';
  return info?.kind === 'bot' ? 'Компьютер' : 'Хүлээж байна';
}
function render(sceneArg = scene, motion = null) {
  document.body.classList.toggle('has-match', !!sceneArg);
  $('welcome').hidden = !!sceneArg;
  $('table-stats').hidden = !sceneArg;
  $('new-match').hidden = !session;
  $('score-us').textContent = sceneArg?.scores[0] || 0;
  $('score-them').textContent = sceneArg?.scores[1] || 0;
  for (const [id, team] of [['dots-us', 0], ['dots-them', 1]]) $(''+id).innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < (sceneArg?.scores[team] || 0) ? 'filled' : ''}"></i>`).join('');
  $('round-label').textContent = `${sceneArg?.round || 1}-Р ҮЕ`;
  renderTrumpCard($('trump-label'), $('trump-name'), sceneArg?.trump || 'hearts');
  $('team-us-names').textContent = [0, 2, 4, 6].map(d => names[d]).join(' · ');
  $('team-them-names').textContent = [1, 3, 5, 7].map(d => names[d]).join(' · ');
  $('seats').replaceChildren();
  $('self-seat').replaceChildren();
  for (let index = 0; index < 8; index++) {
    const info = seatInfo(index);
    const count = sceneArg?.hands[index].length ?? 0;
    const shownCount = motion?.beforeCounts && ['pickup','refill'].includes(motion.type) && motion.player === index ? motion.beforeCounts[index] : count;
    const active = sceneArg?.phase === 'playing' && sceneArg.turn === index;
    const winning = ['round-over','match-over'].includes(sceneArg?.phase) && sceneArg.winner === index % 2;
    const status = seatStatus(sceneArg, index, motion, count, active, winning);
    const offline = info?.kind === 'human' && !info.connected && index !== 0;
    const speaking = info?.playerId && speakingIds.has(info.playerId);
    const seat = document.createElement('div');
    seat.className = `seat seat-${index} ${index % 2 ? 'theirs' : 'ours'}${active ? ' active' : ''}${winning ? ' celebrating' : ''}${offline ? ' offline' : ''}${info?.kind === 'bot' ? ' bot' : ''}${speaking ? ' speaking' : ''}`;
    seat.dataset.status = status; seat.dataset.player = index;
    seat.setAttribute('aria-label', `${names[index]}, ${index % 2 ? 'эсрэг баг' : 'танай баг'}, ${shownCount} хөзөр${active ? ', одоогийн ээлж' : ''}${offline ? ', холболтгүй' : ''}`);
    const mic = micBadge(info, index);
    seat.innerHTML = `<div class="avatar">${index === 0 ? 'Т' : names[index].slice(0, 1)}</div><div><span class="seat-name">${escapeHtml(names[index])}${mic}</span><span class="seat-meta">${controlIcon('cards')} ${shownCount}</span></div><span class="player-status">${status}</span>`;
    if (index > 0) {
      const fan = document.createElement('div'); fan.className = 'opponent-hand';
      fan.setAttribute('aria-label', `${names[index]} · ${shownCount} далд хөзөртэй`);
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
  characterRoom.update({ handCounts: sceneArg?.hands.map(hand => hand.length) ?? Array(8).fill(0), phase: sceneArg?.phase, turn: sceneArg?.turn, winner: sceneArg?.winner, paused: false }, motion);
  $('highest').replaceChildren();
  $('pile-key').hidden = !sceneArg?.table.pile.length;
  if (sceneArg?.table.pile.length) {
    const size = sceneArg.table.highest.length;
    const latestStart = sceneArg.table.pile.length - size;
    for (let offset = 0; offset < sceneArg.table.pile.length; offset += size) {
      const latest = offset === latestStart;
      const group = document.createElement('div');
      group.className = `table-play${latest ? ' latest-play' : ''}`;
      group.setAttribute('role', 'listitem');
      group.setAttribute('aria-label', latest ? 'Сүүлийн нүүдэл: дарах хөзөр' : `Өмнөх нүүдэл ${offset / size + 1}`);
      for (const card of sceneArg.table.pile.slice(offset, offset + size)) group.append(cardElement(card));
      $('highest').append(group);
    }
  }
  else if (sceneArg && sceneArg.phase !== 'choosing-leader') { const empty = document.createElement('span'); empty.className = 'empty-table'; empty.textContent = 'Шинээр эхэлнэ.'; $('highest').append(empty); }
  layoutTablePile($('highest'));
  $('turn-label').textContent = !sceneArg ? 'ТАНЫ СУУДАЛ БЭЛЭН' : sceneArg.phase === 'choosing-leader' ? 'ХӨЗӨР ТАРААЛАА · БАГААРАА ЯРИЛЦАХ' : sceneArg.phase !== 'playing' ? 'ҮЕ ДУУСЛАА' : sceneArg.turn === 0 ? 'ТАНЫ ЭЭЛЖ' : `${names[sceneArg.turn].toUpperCase()} · ЭЭЛЖ`;
  if (motion) $('turn-label').textContent = ({ pickup: 'ХӨЗӨР АВЧ БАЙНА', play: 'ХӨЗӨР ТАВЬЖ БАЙНА', refill: 'НӨӨЦӨӨС НӨХӨЖ БАЙНА', sleep: 'УНТАНА' })[motion.type];
  $('reserve-count').textContent = sceneArg?.reserve.length ?? 3;
  $('reserve-count').parentElement.classList.toggle('empty-reserve', $('reserve-count').textContent === '0');
  $('pile-count').textContent = sceneArg?.table.pile.length ?? 0;
  $('pile-open').disabled = animating || !sceneArg?.table.pile.length;
  $('table-message').hidden = connected || !session;
  $('table-message').textContent = 'Холболт тасарлаа. Дахин холбогдож байна…';
  $('live-move').textContent = liveMove;
  $('live-move').title = liveMove;
  $('live-move').hidden = !liveMove;
  renderHand(sceneArg);
  if (motion?.player === 0 && motion.beforeCounts && ['pickup','refill'].includes(motion.type)) $('hand-count').textContent = `${motion.beforeCounts[0]} хөзөр`;
  renderActions(); renderDiscussion(sceneArg); renderLobby(); renderHeader(); renderTimer(); signalControls.render();
}
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

// ---- Header, timer, voice ----
function renderHeader() {
  $('room-badge').hidden = !session;
  if (session) $('room-code').textContent = session.code;
  $('conn-status').hidden = !session || connected;
  const voiceOn = !!room?.config?.voice && !!session;
  // The same microphone toggle appears at the table and in the lobby, so a player can unmute before the deal.
  const icon = voiceInfo.state === 'connecting' ? 'loading' : voiceInfo.micOn ? 'mic' : 'micOff';
  const label = voiceInfo.state === 'connecting' ? 'Дуут сувагт холбогдож байна' : voiceInfo.state === 'error' ? 'Дуут холболт тасарсан'
    : voiceInfo.micBlocked ? 'Микрофон хаагдсан · дахин оролдох' : voiceInfo.micOn ? 'Микрофон асаалттай' : 'Микрофон хаалттай';
  const title = voiceInfo.state !== 'on' ? 'Дуут сувагт автоматаар дахин холбогдоно' : voiceInfo.micBlocked ? 'Хөтөчдөө микрофон ашиглахыг зөвшөөрөөд дахин дарна уу'
    : voiceInfo.micOn ? 'Дарж микрофоноо хаана уу' : 'Та бусдыг сонсож байна. Ярихын тулд дарж микрофоноо асаана уу';
  for (const button of [$('voice-mic'), $('lobby-mic')]) {
    button.hidden = !voiceOn;
    button.className = `quiet-button voice-button ${voiceInfo.state}${voiceInfo.micOn ? ' live' : ' muted'}${voiceInfo.micBlocked ? ' blocked' : ''}`;
    button.innerHTML = `${controlIcon(icon)} <span class="label">${label}</span>`; button.title = title; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(voiceInfo.micOn));
    button.disabled = voiceInfo.state === 'connecting';
  }
  $('audio-banner').hidden = !voiceOn || !voiceInfo.audioBlocked || voiceInfo.state !== 'on';
  $('lobby-voice').hidden = !voiceOn;
  $('lobby-voice-note').textContent = voiceInfo.state === 'connecting' ? 'Дуут сувагт холбогдож байна…'
    : voiceInfo.state === 'error' ? 'Дуут суваг түр тасарлаа. Автоматаар дахин холбогдоно.'
    : voiceInfo.audioBlocked ? 'Хөтөч дууг хаасан байна. Товчийг дарж бусдыг сонсоно.'
    : voiceInfo.micOn ? 'Багийнхан таныг сонсож байна. Дарж микрофоноо хаана.'
    : 'Та бусдыг сонсож байна. Ярихын тулд микрофоноо асаана уу.';
}
/** 🎙 live microphone, 🔇 in the voice channel but muted, nothing when not connected to voice. */
function micBadge(info, display) {
  if (!room?.config?.voice || !info || info.kind !== 'human') return '';
  const member = display === 0 ? (voiceInfo.state === 'on' ? { micOn: voiceInfo.micOn } : null) : voiceMembers.get(info.playerId) ?? null;
  if (!member) return '';
  return `<span class="seat-mic${member.micOn ? ' live' : ''}" title="${member.micOn ? 'Микрофон асаалттай' : 'Микрофон хаалттай'}" aria-label="${member.micOn ? 'микрофон асаалттай' : 'микрофон хаалттай'}">${controlIcon(member.micOn ? 'mic' : 'micOff')}</span>`;
}
async function toggleMic() {
  if (!voice) return;
  if (voiceInfo.audioBlocked) await voice.resumeAudio();
  const on = await voice.setMic(!voiceInfo.micWanted || voiceInfo.micBlocked ? true : false);
  store(MIC_KEY, voice.micWanted ? '1' : '0');
  if (voice.micWanted && !on && voiceInfo.micBlocked) toast('Хөтөч микрофоныг хаасан байна. Энэ сайтад микрофон ашиглахыг зөвшөөрөөд дахин дарна уу.');
}
function maybeJoinVoice() {
  if (!voice || !room?.config?.voice || voiceInfo.state !== 'off') return;
  voice.join();
}
let lastTimerText = '';
function renderTimer() {
  const timer = $('turn-timer');
  const show = !!scene && deadline !== null && ['playing', 'choosing-leader'].includes(scene.phase) && !animating;
  timer.hidden = !show;
  if (!show) { lastTimerText = ''; return; }
  const left = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
  const clock = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left} сек`;
  const text = scene.phase === 'choosing-leader' ? `Шийдвэр гаргах: ${clock}` : `${scene.turn === 0 ? 'Таны хугацаа' : 'Хугацаа'} ${clock}`;
  if (text !== lastTimerText) { timer.textContent = text; lastTimerText = text; }
  timer.classList.toggle('urgent', left <= 10 && scene.turn === 0);
  timer.closest('.turn-hud')?.style.setProperty('--turn-progress', `${Math.min(100, left / 180 * 100)}%`);
}
function tick() {
  if (session) { renderTimer(); updateRoundControls(); updateDiscussionCountdown(); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function applySpeaking() {
  for (let index = 0; index < 8; index++) {
    const info = seatInfo(index);
    const speaking = !!(info?.playerId && speakingIds.has(info.playerId));
    document.querySelector(`.seat-${index}`)?.classList.toggle('speaking', speaking);
    document.querySelector(`.seat-row[data-display="${index}"]`)?.classList.toggle('speaking', speaking);
  }
}

// ---- Lobby ----
function codeFromUrl() { const match = location.pathname.match(/^\/r\/([A-Za-z0-9-]{4,16})/); return match ? match[1].toUpperCase().replace(/[^A-Z0-9]/g, '') : ''; }
/** An invitation link already names the table, so the entry form only asks for a name and offers Join. */
function setEntryMode(code) {
  const joining = !!code;
  $('lobby-entry').classList.toggle('joining', joining);
  $('lobby-code').value = code;
  $('lobby-intro').textContent = joining
    ? 'Таныг ширээнд урьсан байна. Нэрээ оруулаад суудалдаа нэгдээрэй. Найман суудал, хоёр баг, нэг дуут суваг.'
    : 'Найман суудал. Хоёр баг. Нэг дуут суваг. Ширээ нээж долоон найздаа холбоосыг илгээгээрэй. Эсвэл сул суудлыг компьютер тоглогчоор дүүргэж болно.';
  $('lobby-code-caption').textContent = joining ? 'Ширээний код' : 'Эсвэл ширээний кодоор нэгдэх';
  $('join').className = joining ? 'button light' : 'quiet-button';
  $('join').innerHTML = joining ? 'Ширээнд нэгдэх <span aria-hidden="true">→</span>' : 'Нэгдэх';
}
function renderLobby() {
  const inRoom = !!session && !!room;
  $('lobby-entry').hidden = inRoom;
  $('lobby-room').hidden = !inRoom;
  if (!inRoom) return;
  $('lobby-code-label').textContent = room.code;
  $('share-link').value = `${location.origin}/r/${room.code}`;
  const humans = room.seats.filter(s => s.kind === 'human').length, filled = room.seats.filter(s => s.kind !== 'empty').length;
  $('lobby-title').textContent = room.status === 'lobby' ? (filled === 8 ? 'Ширээ дүүрлээ.' : 'Тоглогчид цуглаж байна') : 'Ширээнд буцаж орж байна…';
  $('host-actions').hidden = !room.you.isHost;
  $('start-game').disabled = filled !== 8 || !connected;
  $('fill-bots').disabled = filled === 8 || !connected;
  $('lobby-status').textContent = room.you.isHost
    ? (filled === 8 ? 'Бүгд суудалдаа орлоо. Бэлэн бол хөзрөө тараагаарай.' : `${humans} тоглогч суусан · ${8 - filled} сул суудал. Компьютероор дүүргэх эсвэл найзуудаа хүлээгээрэй.`)
    : (filled === 8 ? 'Ширээ нээсэн хүн хөзөр тараахыг хүлээж байна.' : `${humans} тоглогч суусан. Найман суудал дүүрмэгц ширээ нээсэн хүн хөзөр тараана.`);
  const groups = $('seat-list'); groups.replaceChildren();
  const switchTarget = switchTeamTarget(room.seats, me);
  for (const group of teamGroups(room.seats, me)) {
    const section = document.createElement('section');
    section.className = `team-group ${group.ours ? 'ours' : 'theirs'}`;
    const heading = document.createElement('h3'); heading.className = 'team-heading';
    const seatNumbers = group.seats.map(info => info.seat + 1).join(' · ');
    heading.innerHTML = `<span>${group.ours ? 'Танай баг' : 'Эсрэг баг'}</span><small>${seatNumbers}-р суудал</small>`;
    section.append(heading);
    if (!group.ours) {
      // Teams follow seat parity, so switching team is a move into the other team's first open seat.
      const button = document.createElement('button'); button.className = 'quiet-button switch-team'; button.type = 'button';
      button.textContent = 'Энэ багт шилжих';
      button.disabled = switchTarget === null || !connected || room.status !== 'lobby';
      button.title = switchTarget === null ? 'Эсрэг багт сул суудал алга.' : `${switchTarget + 1}-р суудалд шилжинэ`;
      button.addEventListener('click', () => { if (switchTarget !== null) lobbyRequest('room:move', { seat: switchTarget }); });
      heading.append(button);
    }
    const list = document.createElement('ul'); list.className = 'seat-list'; list.setAttribute('aria-label', group.ours ? 'Танай багийн суудлууд' : 'Эсрэг багийн суудлууд');
    for (const info of group.seats) list.append(seatRow(info, group.ours));
    section.append(list);
    groups.append(section);
  }
}
function seatRow(info, ours) {
  const display = displaySeat(info.seat, me);
  const row = document.createElement('li');
  const mine = info.seat === me;
  const clickable = !mine && isOpenSeat(info);
  row.className = `seat-row ${ours ? 'ours' : 'theirs'}${mine ? ' me' : ''}${info.kind === 'empty' ? ' empty' : ''}${info.kind === 'bot' ? ' bot' : ''}${clickable ? ' clickable' : ''}${info.playerId && speakingIds.has(info.playerId) ? ' speaking' : ''}`;
  row.dataset.seat = info.seat; row.dataset.display = display;
  const who = info.kind === 'empty' ? 'Сул суудал' : mine ? `${info.name} (та)` : seatName(info);
  const tags = [info.isHost ? 'Зохион байгуулагч' : '', info.kind === 'human' ? `<span class="${info.connected ? 'online' : 'offline'}">${info.connected ? 'Холбогдсон' : 'Холболтгүй'}</span>` : '', micBadge(info, display)].filter(Boolean).join(' · ');
  row.innerHTML = `<span class="seat-no">${info.seat + 1}</span><span class="seat-who">${escapeHtml(who)}</span><span class="seat-tags">${tags}</span>`;
  if (clickable) { row.setAttribute('role', 'button'); row.tabIndex = 0; row.setAttribute('aria-label', `${info.seat + 1}-р суудалд шилжих`); row.addEventListener('click', () => lobbyRequest('room:move', { seat: info.seat })); row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lobbyRequest('room:move', { seat: info.seat }); } }); }
  if (room.you.isHost && isOpenSeat(info)) {
    const button = document.createElement('button'); button.className = 'text-button'; button.type = 'button';
    button.textContent = info.kind === 'empty' ? '+ Компьютер' : 'Хасах';
    button.addEventListener('click', e => { e.stopPropagation(); lobbyRequest('room:setBot', { seat: info.seat, bot: info.kind === 'empty' }); });
    row.append(button);
  }
  return row;
}
async function lobbyRequest(event, payload = {}) {
  if (!client) return;
  try { await client.request(event, payload); } catch (error) { toast(errorText(error)); }
}
function showLobbyError(message) { $('lobby-error').textContent = message || ''; }
async function createOrJoin(kind) {
  const name = $('lobby-name').value.trim();
  if (!name) { showLobbyError('Эхлээд нэрээ оруулна уу.'); $('lobby-name').focus(); return; }
  store(NAME_KEY, name);
  const code = $('lobby-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (kind === 'join' && code.length < 4) { showLobbyError('Зургаан тэмдэгттэй ширээний кодыг оруулна уу.'); $('lobby-code').focus(); return; }
  for (const id of ['create', 'join']) $(id).disabled = true;
  showLobbyError('');
  try {
    const result = kind === 'create' ? await net.createRoom(name) : await net.joinRoom(code, name);
    enterRoom(result);
  } catch (error) {
    showLobbyError(errorText(error));
  } finally { for (const id of ['create', 'join']) $(id).disabled = false; }
}

// ---- Room lifecycle ----
function enterRoom(result) {
  session = result; me = result.seat; room = null; latestView = null; scene = null; names = defaultNames();
  net.saveSession(result);
  if (codeFromUrl() !== result.code) history.replaceState(null, '', `/r/${result.code}`);
  client = net.connect(result.token);
  client.onState(onRoomState);
  client.onUpdate(onGameUpdate);
  client.onClosed(payload => leaveLocally(payload.reason === 'left' ? 'Та ширээнээс гарлаа.' : 'Ширээ хаагдлаа.'));
  client.onConnection((isConnected, error) => {
    connected = isConnected;
    if (!isConnected && error && ['UNAUTHORIZED', 'ROOM_NOT_FOUND', 'ROOM_CLOSED'].includes(error.code)) { leaveLocally('Энэ ширээ хаагдсан байна.'); return; }
    if (!animating) render(); else rosterDirty = true;
  });
  signalControls.connect(client);
  voice = createVoice({ requestToken: () => client.request('voice:token', {}), micPreferred: read(MIC_KEY) === '1' });
  let voiceWasOn = false;
  voice.onState(info => {
    voiceInfo = info; renderHeader();
    if (info.state === 'on' && !voiceWasOn) { voiceWasOn = true; toast(info.micOn ? 'Дуут сувагт холбогдлоо. Таны микрофон асаалттай.' : 'Дуут сувагт холбогдлоо. Та бусдыг сонсоно; ярихын тулд микрофоноо асаагаарай.'); }
    if (info.state === 'error') toast('Дуут холболт тасарлаа. Дахин холбогдож байна…');
    if (!animating) render();
  });
  voice.onSpeakers(ids => { speakingIds = new Set(ids); applySpeaking(); });
  voice.onParticipants(members => { voiceMembers = members; if (!animating) render(); });
  render();
}
function leaveLocally(message) {
  signalControls.close();
  if (session) net.clearSession(session.code);
  client?.close(); client = null;
  voice?.leave(); voice = null; voiceInfo = { state: 'off', micOn: false, micWanted: false, micBlocked: false, audioBlocked: false }; speakingIds = new Set(); voiceMembers = new Map();
  motionEpoch++; motionController?.abort(); motionController = null; animating = false; pendingUpdates = []; processing = false;
  session = null; room = null; latestView = null; scene = null; me = 0; names = defaultNames(); connected = false;
  deadline = null; timerKind = null; reviewUntil = null; liveMove = ''; selected.clear(); pendingAction = null;
  if ($('round-dialog').open) $('round-dialog').close();
  history.replaceState(null, '', '/');
  setEntryMode('');
  render();
  if (message) toast(message);
}
function updateNames() {
  names = Array.from({ length: 8 }, (_, d) => d === 0 ? 'Та' : seatName(seatInfo(d)));
}
function onRoomState(payload) {
  room = payload; me = payload.you.seat; updateNames();
  maybeJoinVoice();
  if (payload.game) {
    deadline = payload.game.deadline; timerKind = payload.game.timer; reviewUntil = payload.game.reviewUntil;
    const incoming = payload.game.view;
    const known = latestView && latestView.revision === incoming.revision && latestView.round === incoming.round;
    if (!known) {
      // Resync: whatever we were animating is stale. Replace the scene without animation.
      motionEpoch++; motionController?.abort(); motionController = null; animating = false; pendingUpdates = [];
      latestView = incoming; scene = sceneFromView(incoming); selected.clear();
      if ($('round-dialog').open && !['round-over', 'match-over'].includes(scene.phase)) $('round-dialog').close();
    }
  } else if (scene) {
    motionEpoch++; motionController?.abort(); motionController = null; animating = false; pendingUpdates = [];
    latestView = null; scene = null; selected.clear(); liveMove = ''; deadline = null; timerKind = null; reviewUntil = null;
  }
  if (animating) { rosterDirty = true; return; }
  render(); maybeShowRound();
}
function onGameUpdate(update) {
  latestView = update.view; deadline = update.deadline; timerKind = update.timer; reviewUntil = update.reviewUntil;
  pendingUpdates.push(update);
  processQueue();
}
function describe(update, events, previous) {
  const actorEvent = events.find(e => e.type === 'played' || e.type === 'picked-up');
  if (actorEvent) {
    const actor = actorEvent.player;
    if (actorEvent.type === 'played') {
      const cards = actorEvent.cards.map(shortCard).join(' · ');
      const target = previous?.table.highest.map(shortCard).join(' · ') || '';
      liveMove = actorEvent.lead || !target ? `${names[actor]} ${cards} тавьж эхэллээ.` : `${names[actor]} ${target} хөзрийг ${cards} хөзрөөр дарлаа.`;
    } else liveMove = `${names[actor]} ширээнээс ${actorEvent.cards.length} хөзөр авлаа.`;
    if (update.cause === 'timeout') liveMove += actor === 0 ? ' (Таны хугацаа дууссан.)' : ' (Хугацаа дууссан.)';
    if (events.some(e => e.type === 'table-slept')) liveMove += ` Унтана — хөзөр тоглоомоос гарлаа.${update.view.phase === 'playing' ? ` ${actor === 0 ? 'Та' : `${names[actor]}`} дахин эхэлнэ.` : ' Үе дууслаа.'}`;
    if (update.cause === 'timeout' && actor === 0) toast('Хугацаа дууслаа. Таны өмнөөс автоматаар нүүдэл хийлээ.');
  }
  for (const event of events) {
    if (event.type === 'leader-chosen') liveMove = event.bySeat === null ? `${names[event.leader]} эхэлнэ (автоматаар сонгосон).` : `${names[event.bySeat]} баталлаа: ${names[event.leader]} эхэлнэ.`;
    if (event.type === 'round-dealt') liveMove = `${event.round}-р үеийн хөзөр тараалаа · Хөзөр: ${SYMBOLS[event.trump]} ${LABELS[event.trump]}.`;
    if (event.type === 'rematch') liveMove = 'Шинэ тоглолт эхэллээ. Суудал хэвээр, хөзрийг дахин тараана.';
  }
}
async function processQueue() {
  if (processing) { if (pendingUpdates.length > 1) motionController?.abort(); return; }
  processing = true;
  try {
    while (pendingUpdates.length) {
      const update = pendingUpdates.shift();
      const jump = pendingUpdates.length > 0 || document.hidden;
      const events = localizeEvents(update.events, me);
      const engineEvents = events.filter(e => ENGINE_EVENTS.has(e.type));
      const previous = scene;
      describe(update, events, previous);
      if (events.some(e => e.type === 'round-dealt' || e.type === 'rematch') && $('round-dialog').open) $('round-dialog').close();
      const next = sceneFromView(update.view);
      const animate = previous && engineEvents.length > 0 && !jump && previous.round === next.round && previous.revision < next.revision;
      scene = next; selected.clear(); pendingAction = null;
      if (animate) {
        const start = prepareForTransition(previous, events);
        const token = ++motionEpoch;
        animating = true; motionController = new AbortController();
        renderActions();
        try {
          for (const step of transitionSteps(start, engineEvents)) {
            if (motionController.signal.aborted || token !== motionEpoch) break;
            const actor = names[step.player];
            motionText = step.type === 'pickup' ? `${actor} · ${step.cards.length} хөзөр авч байна…` : step.type === 'refill' ? 'Нөөцөөс нөхөж байна…' : step.type === 'sleep' ? 'Унтана · хөзрийг хурааж байна…' : `${actor} · ${step.cards.length} хөзөр тавьж байна…`;
            await animateStep(step, { render, cardElement, signal: motionController.signal });
          }
        } catch (error) { console.error(error); }
        finally { if (token === motionEpoch) { animating = false; motionController = null; motionText = ''; } }
      }
      if (rosterDirty) { rosterDirty = false; updateNames(); }
      render();
    }
  } finally {
    processing = false;
    render(); maybeShowRound();
  }
}

// ---- Intents ----
async function commit(move) {
  if (!scene || scene.phase !== 'playing' || animating || !client || pendingAction) return;
  const key = JSON.stringify({ ...move, revision: latestView.revision });
  // Reuse the action id when retrying the same move so a reconnect cannot double-submit.
  const actionId = pendingAction?.key === key ? pendingAction.actionId : crypto.randomUUID();
  pendingAction = { key, actionId };
  renderActions();
  try {
    const payload = move.type === 'play'
      ? { cards: move.cards, expectedRevision: latestView.revision, actionId }
      : { expectedRevision: latestView.revision, actionId };
    await client.request(move.type === 'play' ? 'game:play' : 'game:pickup', payload);
  } catch (error) {
    pendingAction = null;
    toast(errorText(error));
    if (error.code === 'STALE_ACTION' || error.code === 'TIMEOUT') client.request('room:sync', {}).catch(() => {});
    renderActions();
  }
}
function renderDiscussion(sceneArg = scene) {
  const waiting = sceneArg?.phase === 'choosing-leader';
  $('discussion').hidden = !waiting;
  if (!waiting) { openerSelection.reset(); return; }
  const ours = sceneArg.openingTeam === 0;
  $('discussion-title').textContent = ours ? 'Танай баг эхэлнэ.' : 'Эсрэг баг эхэлнэ.';
  $('discussion-copy').textContent = ours
    ? 'Дуут сувгаар ярилцаад эхлэх тоглогчийн суудлыг сонгоорой.'
    : 'Хөзөр тараалаа. Эсрэг баг эхлэх тоглогчоо сонгож байна.';
  $('human-discussion').hidden = !ours;
  $('computer-discussion').hidden = ours;
  if (ours) {
    openerSelection.render({ key: `${session?.code}:${sceneArg.round}:${me}`, entries: [0, 2, 4, 6].map(seat => ({ seat, name: seat === 0 ? 'Та' : names[seat], count: sceneArg.hands[seat].length })), busy: confirmPending || !connected });
    $('confirm-opener').disabled = openerSelection.value === null || confirmPending || !connected;
  }
  updateDiscussionCountdown();
}
function updateDiscussionCountdown() {
  if (!scene || scene.phase !== 'choosing-leader' || $('discussion').hidden) return;
  const left = deadline ? Math.max(0, Math.ceil((deadline - serverNow()) / 1000)) : null;
  const note = scene.openingTeam === 0 ? 'Таны хөзөр бусдад харагдахгүй. Нийтийн дуут сувгаар багтайгаа ярилцаарай.' : 'Таны хөзөр бусдад харагдахгүй. Нийтийн дуут сувгаар тэдний яриаг сонсож болно.';
  const text = left === null ? note : `${note} ${left} секундын дараа ${scene.openingTeam === 0 ? 'танай багийн' : 'эсрэг багийн'} эхлэх тоглогчийг автоматаар сонгоно.`;
  if ($('discussion-note').textContent !== text) $('discussion-note').textContent = text;
}
async function confirmOpeningPlayer(display) {
  if (scene?.phase !== 'choosing-leader' || !client || confirmPending) return;
  confirmPending = true; renderDiscussion();
  try { await client.request('game:confirmLeader', { leader: realSeat(display, me), expectedRevision: latestView.revision }); }
  catch (error) { toast(error.code === 'STALE_ACTION' || error.code === 'BAD_PHASE' ? 'Багийн тоглогч эхлэх тоглогчийг аль хэдийн баталсан байна.' : errorText(error)); }
  finally { confirmPending = false; renderDiscussion(); }
}
function maybeShowRound() {
  if (!scene || processing || animating) return;
  if (['round-over', 'match-over'].includes(scene.phase)) showRound();
  else if ($('round-dialog').open) $('round-dialog').close();
}
function showRound() {
  const matchOver = scene.phase === 'match-over', won = scene.winner === 0;
  $('result-eyebrow').textContent = matchOver ? 'ТОГЛОЛТ ДУУСЛАА' : `${scene.round}-Р ҮЕ ДУУСЛАА`;
  $('result-icon').textContent = won ? '✧' : '◇';
  $('result-title').textContent = won ? matchOver ? 'Танай баг яллаа!' : 'Танай баг нэг хожил авлаа.' : matchOver ? 'Сайхан тоглолт боллоо.' : 'Эсрэг баг нэг хожил авлаа.';
  $('result-detail').textContent = `${names[scene.turn]} бүх хөзрөө дуусгалаа. ${scene.scores[0]}–${scene.scores[1]}${matchOver ? ' — түрүүлж таван үе хожсон баг ялна.' : ` · Дараагийн хөзөр: ${SYMBOLS[SUITS[scene.round % 4]]} ${LABELS[SUITS[scene.round % 4]]}.`}`;
  if (!$('round-dialog').open) $('round-dialog').show();
  updateRoundControls();
}
let lastReviewText = '';
function updateRoundControls() {
  if (!$('round-dialog').open || !scene || !room) return;
  const matchOver = scene.phase === 'match-over';
  const now = serverNow();
  const reviewLeft = reviewUntil ? Math.max(0, Math.ceil((reviewUntil - now) / 1000)) : 0;
  const dealLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const eligible = matchOver ? room.you.isHost : (scene.winner === 0 || room.you.isHost);
  const button = $('continue');
  button.textContent = matchOver ? 'Дахин тоглох →' : 'Дараагийн үеийн хөзөр тараах →';
  button.hidden = !eligible;
  let note;
  if (reviewLeft > 0) { note = `Ширээний хөзрийг хараарай · ${reviewLeft} сек`; button.disabled = true; }
  else if (eligible) { note = matchOver ? 'Суудал хэвээр, хөзрийг дахин тараана.' : dealLeft === null ? 'Танай баг бэлэн бол хөзрөө тараагаарай.' : `Бэлэн бол тараагаарай · ${dealLeft} секундын дараа автоматаар тараана`; button.disabled = continuePending || !connected; }
  else note = matchOver ? 'Ширээ нээсэн хүн шинэ тоглолт эхлүүлэхийг хүлээж байна.' : dealLeft === null ? 'Хожсон баг хөзөр тараахыг хүлээж байна…' : `Хожсон багийг хүлээж байна… ${dealLeft} секундын дараа тараана`;
  if (note !== lastReviewText) { $('review-note').textContent = note; lastReviewText = note; }
}
async function continueRound() {
  if (!scene || !client || continuePending) return;
  continuePending = true; updateRoundControls();
  try {
    if (scene.phase === 'match-over') await client.request('room:rematch', {});
    else await client.request('game:continue', { expectedRevision: latestView.revision });
  } catch (error) { if (error.code !== 'STALE_ACTION' && error.code !== 'BAD_PHASE') toast(errorText(error)); }
  finally { continuePending = false; updateRoundControls(); }
}
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(`${label} хууллаа.`); }
  catch { toast(text); }
}

// ---- Wiring ----
$('confirm-opener').addEventListener('click', () => { if (scene?.openingTeam === 0 && openerSelection.value !== null) confirmOpeningPlayer(openerSelection.value); });
$('continue').addEventListener('click', continueRound);
$('round-dialog').addEventListener('cancel', event => event.preventDefault());
function openDialog(id) { if (animating) return; $(id).showModal(); }
$('rules-open').addEventListener('click', () => openDialog('rules-dialog'));
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('pile-open').addEventListener('click', () => { if (!scene) return; $('pile-cards').replaceChildren(...scene.table.pile.map(card => cardElement(card))); openDialog('pile-dialog'); });
$('create').addEventListener('click', () => createOrJoin('create'));
$('join').addEventListener('click', () => createOrJoin('join'));
$('lobby-code').addEventListener('keydown', e => { if (e.key === 'Enter') createOrJoin('join'); });
$('lobby-name').addEventListener('keydown', e => { if (e.key === 'Enter') createOrJoin($('lobby-code').value.trim() ? 'join' : 'create'); });
$('fill-bots').addEventListener('click', () => lobbyRequest('room:fillBots'));
$('start-game').addEventListener('click', () => lobbyRequest('room:start'));
$('share-copy').addEventListener('click', () => copyText($('share-link').value, 'Ширээний холбоос'));
$('copy-link').addEventListener('click', () => { if (session) copyText(`${location.origin}/r/${session.code}`, 'Ширээний холбоос'); });
$('lobby-leave').addEventListener('click', async () => { if (client) { try { await client.request('room:leave', {}); } catch { /* leaving anyway */ } } leaveLocally('Та ширээнээс гарлаа.'); });
$('new-match').addEventListener('click', () => { if (!session) return; if (scene) openDialog('new-dialog'); else $('lobby-leave').click(); });
$('new-confirm').addEventListener('click', async () => { $('new-dialog').close(); if (client) { try { await client.request('room:leave', {}); } catch { /* leaving anyway */ } } leaveLocally('Та ширээнээс гарлаа. Ижил холбоосоор буцаж орж болно.'); });
$('voice-mic').addEventListener('click', toggleMic);
$('lobby-mic').addEventListener('click', toggleMic);
$('audio-resume').addEventListener('click', async () => { await voice?.resumeAudio(); renderHeader(); });
$('sort').addEventListener('click', () => { byRank = !byRank; store(SORT_KEY, byRank ? '1' : '0'); if (scene) renderHand(); });
$('play').addEventListener('click', () => { if (scene?.turn === 0 && selected.size) commit({ type: 'play', cards: [...selected] }); });
$('pickup').addEventListener('click', () => { if (scene?.turn === 0) commit({ type: 'pickup' }); });
$('hint').addEventListener('click', () => {
  if (scene?.turn !== 0) return;
  const cards = findPlay(scene); selected = new Set(cards || []); renderHand(); renderActions();
  if (!cards) toast('Дарах хөзөр алга. Ширээний хөзрийг аваарай.');
  else toast(`Санал болгосон ${cards.length} хөзрийг сонголоо. Тавих эсэхээ та шийдээрэй.`);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) motionController?.abort(); });
window.addEventListener('resize', () => motionController?.abort());
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => motionController?.abort());
window.addEventListener('popstate', () => { if (!session) setEntryMode(codeFromUrl()); });

// ---- Boot ----
byRank = read(SORT_KEY) === '1';
$('lobby-name').value = read(NAME_KEY) || '';
{
  const code = codeFromUrl();
  const saved = code ? net.loadSession(code) : null;
  if (saved && saved.code === code) enterRoom(saved);
  else {
    setEntryMode(code);
    render();
    ($('lobby-name').value ? (code ? $('join') : $('create')) : $('lobby-name')).focus({ preventScroll: true });
  }
}
