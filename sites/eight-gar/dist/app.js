import { keepLatestPlayVisible } from './viewport-table.js';
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
const SYMBOLS = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' };
const LABELS = { hearts: 'Hearts', diamonds: 'Diamonds', spades: 'Spades', clubs: 'Clubs' };
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
import('./characters.js').then(({ CharacterRoom }) => {
  characterRoom = new CharacterRoom($('character-room'));
  if (latestCharacterState) characterRoom.update(...latestCharacterState);
}).catch(() => { $('character-room').dataset.renderer = 'fallback'; });

function defaultNames() { return ['You', 'Seat 2', 'Seat 3', 'Seat 4', 'Seat 5', 'Seat 6', 'Seat 7', 'Seat 8']; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function cardLabel(card) { return card.kind === 'joker' ? `${card.color} joker` : `${card.rank} of ${card.suit}`; }
function shortCard(card) { return card.kind === 'joker' ? `${card.color} joker` : `${card.rank}${SYMBOLS[card.suit]}`; }
const serverNow = () => (client ? client.serverNow() : Date.now());
const seatInfo = display => room?.seats?.[realSeat(display, me)] ?? null;
const store = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage optional */ } };
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };

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
    element.disabled = !scene || scene.turn !== 0 || scene.phase !== 'playing' || animating || !connected;
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
function sortedHand(sceneArg = scene) {
  const suitIndex = card => card.kind === 'joker' ? 4 : SUITS.indexOf(card.suit);
  const rankIndex = card => card.kind === 'joker' ? 10 + JOKERS.indexOf(card.color) : RANKS.indexOf(card.rank);
  return [...sceneArg.hands[0]].sort((a, b) => byRank ? rankIndex(a) - rankIndex(b) || suitIndex(a) - suitIndex(b) : suitIndex(a) - suitIndex(b) || rankIndex(a) - rankIndex(b));
}
function renderHand(sceneArg = scene) {
  const hand = $('hand'); hand.replaceChildren();
  if (!sceneArg) { for (let i = 0; i < 5; i++) { const card = document.createElement('div'); card.className = 'card placeholder-card'; card.setAttribute('aria-hidden', 'true'); hand.append(card); } $('hand-count').textContent = '5 cards to start'; return; }
  const cards = sortedHand(sceneArg);
  hand.classList.toggle('wide-hand', cards.length > 9);
  cards.forEach((card, index) => {
    const element = cardElement(card, true);
    const position = index - (cards.length - 1) / 2;
    element.style.setProperty('--fan', `${cards.length > 9 ? 0 : position * 4}deg`);
    element.style.setProperty('--lift', `${cards.length > 9 ? 0 : Math.abs(position) ** 1.7 * 2}px`);
    hand.append(element);
  });
  $('hand-count').textContent = `${sceneArg.hands[0].length} card${sceneArg.hands[0].length === 1 ? '' : 's'}`;
  $('sort').textContent = byRank ? 'Sort by suit ⇅' : 'Sort by rank ⇅';
}
function playError() {
  if (!scene || selected.size === 0) return null;
  try { applyAction(scene, { type: 'play', player: 0, cards: [...selected], expectedRevision: scene.revision }); return null; }
  catch (error) { return error.code; }
}
const ERRORS = {
  INVALID_LEAD: 'Lead 1 card, a pair + 1, or an eligible two-pair set of 5.', THREE_CARD_LEAD_BLOCKED: 'Three-card leads need all eight players to have at least three cards.',
  FIVE_CARD_LEAD_BLOCKED: 'Five-card leads need empty reserve and all eight hands at least five.', INVALID_RESPONSE: 'Match the table’s card count and beat every card. Jokers play alone.',
  INVALID_CARDS: 'Choose distinct cards from your hand.', WRONG_TURN: 'Wait for your turn.', ROUND_CLOSED: 'This round has finished.', STALE_ACTION: 'The table moved on. Take another look.',
  REVIEW_IN_PROGRESS: 'Give everyone a moment to review the table.', NOT_YOUR_TEAM: 'The winning team deals the next round.', NOT_HOST: 'Only the host can do that.',
  SEATS_NOT_FILLED: 'Every seat needs a player or a computer first.', SEAT_TAKEN: 'That seat is taken.', ROOM_STARTED: 'That table has already started.', ROOM_FULL: 'That table is full.',
  ROOM_NOT_FOUND: 'No table has that code.', NAME_TAKEN: 'Someone at that table already uses that name.', RATE_LIMITED: 'Too many attempts. Wait a moment.',
  VOICE_UNAVAILABLE: 'Voice is not available on this table.', NETWORK: 'Could not reach the table server.', TIMEOUT: 'The table did not answer in time.',
};
const errorText = error => ERRORS[error?.code] || error?.message || 'The table has settled. Please try again.';

function renderActions() {
  const active = scene?.phase === 'playing' && scene.turn === 0 && !animating && connected;
  for (const id of ['new-match', 'rules-open', 'resources-open', 'sort']) $(id).disabled = animating;
  $('felt').setAttribute('aria-busy', String(animating));
  const error = active ? playError() : null;
  $('play').disabled = !active || selected.size === 0 || !!error || !!pendingAction;
  $('pickup').disabled = !active || scene.table.pile.length === 0 || !!pendingAction;
  $('hint').disabled = !active;
  $('play').textContent = selected.size ? `Play ${selected.size} card${selected.size === 1 ? '' : 's'} ↑` : 'Play cards ↑';
  $('pickup').textContent = scene?.table.pile.length ? `Pick up ${scene.table.pile.length}` : 'Pick up';
  if (animating) $('guidance').textContent = motionText;
  else if (!session) $('guidance').textContent = 'Open or join a table to see your cards.';
  else if (!scene) $('guidance').textContent = 'Waiting in the lobby. Cards are dealt when the host starts.';
  else if (!connected) $('guidance').textContent = 'Reconnecting to the table…';
  else if (scene.phase === 'choosing-leader') $('guidance').textContent = 'Cards are dealt. Play waits for the opening team’s decision.';
  else if (scene.phase !== 'playing') $('guidance').textContent = scene.winner === 0 ? 'Your team takes this round.' : 'The other team takes this round.';
  else if (scene.turn !== 0) $('guidance').textContent = `${names[scene.turn]} is choosing a move…`;
  else if (error) $('guidance').textContent = ERRORS[error] || 'These cards cannot be played together.';
  else if (selected.size) $('guidance').textContent = 'This play is valid. Ready when you are.';
  else if (scene.table.highest.length) $('guidance').textContent = `Beat ${scene.table.highest.length} card${scene.table.highest.length === 1 ? '' : 's'}, or pick up the whole table.`;
  else $('guidance').textContent = canLeadThree(scene)
    ? `Your lead. Choose 1 or 3 cards${canLeadFive(scene) ? ', or a two-pair set of 5' : ''}.`
    : 'Lead 1 card. A player has fewer than three cards.';
}
function seatStatus(sceneArg, index, motion, count, active, winning) {
  const info = seatInfo(index);
  const moving = motion?.player === index ? motion.type : '';
  if (moving === 'pickup') return 'Collecting'; if (moving === 'play') return 'Playing'; if (moving === 'refill') return 'Drawing'; if (moving === 'sleep') return 'Унтана';
  if (!sceneArg) return info?.kind === 'bot' ? 'Computer' : info?.kind === 'human' ? (info.connected ? 'Ready' : 'Offline') : 'Empty';
  if (winning) return 'Round won';
  if (info?.kind === 'human' && !info.connected && index !== 0) return active ? 'Offline · clock running' : 'Offline';
  if (active) return index === 0 && !motion ? 'Your turn' : 'Thinking';
  if (count === 1) return 'Last card';
  return info?.kind === 'bot' ? 'Computer' : 'Waiting';
}
function render(sceneArg = scene, motion = null) {
  document.body.classList.toggle('has-match', !!sceneArg);
  $('welcome').hidden = !!sceneArg;
  $('table-stats').hidden = !sceneArg;
  $('new-match').hidden = !session;
  $('score-us').textContent = sceneArg?.scores[0] || 0;
  $('score-them').textContent = sceneArg?.scores[1] || 0;
  for (const [id, team] of [['dots-us', 0], ['dots-them', 1]]) $(''+id).innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < (sceneArg?.scores[team] || 0) ? 'filled' : ''}"></i>`).join('');
  $('round-label').textContent = `ROUND ${String(sceneArg?.round || 1).padStart(2, '0')}`;
  $('trump-label').textContent = `${SYMBOLS[sceneArg?.trump || 'hearts']} ${LABELS[sceneArg?.trump || 'hearts']} trump`;
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
    seat.setAttribute('aria-label', `${names[index]}, ${index % 2 ? 'other' : 'your'} team, ${shownCount} cards${active ? ', current turn' : ''}${offline ? ', offline' : ''}`);
    const mic = micBadge(info, index);
    seat.innerHTML = `<div class="avatar">${index === 0 ? 'Y' : names[index].slice(0, 1)}</div><div><span class="seat-name">${escapeHtml(names[index])}${mic}</span><span class="seat-meta"><span class="seat-back" aria-hidden="true"></span> ${shownCount} cards</span></div><span class="player-status">${status}</span>`;
    if (index > 0) {
      const fan = document.createElement('div'); fan.className = 'opponent-hand';
      fan.setAttribute('aria-label', `${names[index]} holds ${shownCount} face-down cards`);
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
  const pileScroll = $('highest').scrollLeft;
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
      group.setAttribute('aria-label', latest ? 'Latest play: cards to beat' : `Earlier play ${offset / size + 1}`);
      for (const card of sceneArg.table.pile.slice(offset, offset + size)) group.append(cardElement(card));
      $('highest').append(group);
    }
  }
  else if (sceneArg && sceneArg.phase !== 'choosing-leader') { const empty = document.createElement('span'); empty.className = 'empty-table'; empty.textContent = 'A fresh lead.'; $('highest').append(empty); }
  keepLatestPlayVisible($('highest'), sceneArg?.table.pile, pileScroll);
  $('turn-label').textContent = !sceneArg ? 'YOUR SEAT IS READY' : sceneArg.phase === 'choosing-leader' ? 'DEALT · TEAM DISCUSSION' : sceneArg.phase !== 'playing' ? 'ROUND COMPLETE' : sceneArg.turn === 0 ? 'YOUR TURN' : `${names[sceneArg.turn].toUpperCase()}’S TURN`;
  if (motion) $('turn-label').textContent = ({ pickup: 'COLLECTING CARDS', play: 'PLAYING CARDS', refill: 'DRAWING RESERVE', sleep: 'УНТАНА' })[motion.type];
  $('reserve-count').textContent = sceneArg?.reserve.length ?? 3;
  $('pile-count').textContent = sceneArg?.table.pile.length ?? 0;
  $('pile-open').disabled = animating || !sceneArg?.table.pile.length;
  $('table-message').hidden = connected || !session;
  $('table-message').textContent = 'Connection lost. Reconnecting…';
  $('live-move').textContent = liveMove;
  $('live-move').title = liveMove;
  $('live-move').hidden = !liveMove;
  renderHand(sceneArg);
  if (motion?.player === 0 && motion.beforeCounts && ['pickup','refill'].includes(motion.type)) $('hand-count').textContent = `${motion.beforeCounts[0]} cards`;
  renderActions(); renderDiscussion(sceneArg); renderLobby(); renderHeader(); renderTimer(); signalControls.render();
}
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

// ---- Header, timer, voice ----
function renderHeader() {
  $('room-badge').hidden = !session;
  if (session) $('room-code').textContent = session.code;
  $('conn-status').hidden = !session || connected;
  const voiceOn = !!room?.config?.voice && !!session;
  const button = $('voice-mic');
  button.hidden = !voiceOn;
  button.className = `quiet-button voice-button ${voiceInfo.state}${voiceInfo.micOn ? ' live' : ' muted'}${voiceInfo.micBlocked ? ' blocked' : ''}`;
  const [icon, label] = voiceInfo.state === 'connecting' ? ['…', 'Joining voice'] : voiceInfo.state === 'error' ? ['🔇', 'Voice offline']
    : voiceInfo.micBlocked ? ['🎙', 'Mic blocked · retry'] : voiceInfo.micOn ? ['🎙', 'Mic on'] : ['🔇', 'Muted'];
  const title = voiceInfo.state !== 'on' ? 'Voice reconnects automatically' : voiceInfo.micBlocked ? 'Allow the microphone in your browser, then click to retry'
    : voiceInfo.micOn ? 'Click to mute yourself' : 'You can hear the table. Click to unmute and talk';
  button.innerHTML = `${icon} <span class="label">${label}</span>`; button.title = title; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(voiceInfo.micOn));
  button.disabled = voiceInfo.state === 'connecting';
  $('audio-banner').hidden = !voiceOn || !voiceInfo.audioBlocked || voiceInfo.state !== 'on';
}
/** 🎙 live microphone, 🔇 in the voice channel but muted, nothing when not connected to voice. */
function micBadge(info, display) {
  if (!room?.config?.voice || !info || info.kind !== 'human') return '';
  const member = display === 0 ? (voiceInfo.state === 'on' ? { micOn: voiceInfo.micOn } : null) : voiceMembers.get(info.playerId) ?? null;
  if (!member) return '';
  return `<span class="seat-mic${member.micOn ? ' live' : ''}" title="${member.micOn ? 'Microphone on' : 'Muted'}" aria-label="${member.micOn ? 'microphone on' : 'muted'}">${member.micOn ? '🎙' : '🔇'}</span>`;
}
async function toggleMic() {
  if (!voice) return;
  if (voiceInfo.audioBlocked) await voice.resumeAudio();
  const on = await voice.setMic(!voiceInfo.micWanted || voiceInfo.micBlocked ? true : false);
  store(MIC_KEY, voice.micWanted ? '1' : '0');
  if (voice.micWanted && !on && voiceInfo.micBlocked) toast('The browser blocked the microphone. Allow it for this site, then click the mic again.');
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
  const clock = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left} s`;
  const text = scene.phase === 'choosing-leader' ? `Decision in ${clock}` : `${scene.turn === 0 ? 'Your clock' : 'Clock'} ${clock}`;
  if (text !== lastTimerText) { timer.textContent = text; lastTimerText = text; }
  timer.classList.toggle('urgent', left <= 10 && scene.turn === 0);
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
function renderLobby() {
  const inRoom = !!session && !!room;
  $('lobby-entry').hidden = inRoom;
  $('lobby-room').hidden = !inRoom;
  if (!inRoom) return;
  $('lobby-code-label').textContent = room.code;
  $('share-link').value = `${location.origin}/r/${room.code}`;
  const humans = room.seats.filter(s => s.kind === 'human').length, filled = room.seats.filter(s => s.kind !== 'empty').length;
  $('lobby-title').textContent = room.status === 'lobby' ? (filled === 8 ? 'The table is full.' : 'Gathering the table') : 'Rejoining the table…';
  $('host-actions').hidden = !room.you.isHost;
  $('start-game').disabled = filled !== 8 || !connected;
  $('fill-bots').disabled = filled === 8 || !connected;
  $('lobby-status').textContent = room.you.isHost
    ? (filled === 8 ? 'Everyone is seated. Deal when ready.' : `${humans} player${humans === 1 ? '' : 's'} seated · ${8 - filled} empty seat${8 - filled === 1 ? '' : 's'}. Fill the rest with computers or wait for friends.`)
    : (filled === 8 ? 'Waiting for the host to deal.' : `${humans} player${humans === 1 ? '' : 's'} seated. The host deals once all eight seats are filled.`);
  const list = $('seat-list'); list.replaceChildren();
  for (const info of room.seats) {
    const display = displaySeat(info.seat, me);
    const row = document.createElement('li');
    const mine = info.seat === me;
    const clickable = !mine && (info.kind === 'empty' || (info.kind === 'bot' && !info.reservedForName));
    row.className = `seat-row ${info.team === room.seats[me].team ? 'ours' : 'theirs'}${mine ? ' me' : ''}${info.kind === 'empty' ? ' empty' : ''}${info.kind === 'bot' ? ' bot' : ''}${clickable ? ' clickable' : ''}${info.playerId && speakingIds.has(info.playerId) ? ' speaking' : ''}`;
    row.dataset.seat = info.seat; row.dataset.display = display;
    const who = info.kind === 'empty' ? 'Empty seat' : mine ? `${info.name} (you)` : info.name;
    const tags = [info.isHost ? 'Host' : '', info.kind === 'human' ? `<span class="${info.connected ? 'online' : 'offline'}">${info.connected ? 'Online' : 'Offline'}</span>` : '', micBadge(info, display)].filter(Boolean).join(' · ');
    row.innerHTML = `<span class="seat-no">${info.seat + 1}</span><span class="seat-who">${escapeHtml(who)}</span><span class="seat-tags">${tags}</span>`;
    if (clickable) { row.setAttribute('role', 'button'); row.tabIndex = 0; row.setAttribute('aria-label', `Move to seat ${info.seat + 1}`); row.addEventListener('click', () => lobbyRequest('room:move', { seat: info.seat })); row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lobbyRequest('room:move', { seat: info.seat }); } }); }
    if (room.you.isHost && (info.kind === 'empty' || (info.kind === 'bot' && !info.reservedForName))) {
      const button = document.createElement('button'); button.className = 'text-button'; button.type = 'button';
      button.textContent = info.kind === 'empty' ? '+ Computer' : 'Remove';
      button.addEventListener('click', e => { e.stopPropagation(); lobbyRequest('room:setBot', { seat: info.seat, bot: info.kind === 'empty' }); });
      row.append(button);
    }
    list.append(row);
  }
}
async function lobbyRequest(event, payload = {}) {
  if (!client) return;
  try { await client.request(event, payload); } catch (error) { toast(errorText(error)); }
}
function showLobbyError(message) { $('lobby-error').textContent = message || ''; }
async function createOrJoin(kind) {
  const name = $('lobby-name').value.trim();
  if (!name) { showLobbyError('Choose a name first.'); $('lobby-name').focus(); return; }
  store(NAME_KEY, name);
  const code = $('lobby-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (kind === 'join' && code.length < 4) { showLobbyError('Enter the six-character table code.'); $('lobby-code').focus(); return; }
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
  client.onClosed(payload => leaveLocally(payload.reason === 'left' ? 'You left the table.' : 'The table was closed.'));
  client.onConnection((isConnected, error) => {
    connected = isConnected;
    if (!isConnected && error && ['UNAUTHORIZED', 'ROOM_NOT_FOUND', 'ROOM_CLOSED'].includes(error.code)) { leaveLocally('That table is no longer open.'); return; }
    if (!animating) render(); else rosterDirty = true;
  });
  signalControls.connect(client);
  voice = createVoice({ requestToken: () => client.request('voice:token', {}), micPreferred: read(MIC_KEY) === '1' });
  let voiceWasOn = false;
  voice.onState(info => {
    voiceInfo = info; renderHeader();
    if (info.state === 'on' && !voiceWasOn) { voiceWasOn = true; toast(info.micOn ? 'Voice on. Your microphone is live.' : 'Voice on. You can hear the table; unmute to talk.'); }
    if (info.state === 'error') toast('Voice is offline, reconnecting…');
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
  $('lobby-code').value = '';
  render();
  if (message) toast(message);
}
function updateNames() {
  names = Array.from({ length: 8 }, (_, d) => d === 0 ? 'You' : (seatInfo(d)?.name ?? 'Empty seat'));
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
      liveMove = actorEvent.lead || !target ? `${names[actor]} led ${cards}.` : `${names[actor]} beat ${target} with ${cards}.`;
    } else liveMove = `${names[actor]} picked up ${actorEvent.cards.length} table card${actorEvent.cards.length === 1 ? '' : 's'}.`;
    if (update.cause === 'timeout') liveMove += actor === 0 ? ' (Your clock ran out.)' : ' (Clock ran out.)';
    if (events.some(e => e.type === 'table-slept')) liveMove += ` Унтана — the pile is out of play.${update.view.phase === 'playing' ? ` ${actor === 0 ? 'You lead' : `${names[actor]} leads`} again.` : ' Round complete.'}`;
    if (update.cause === 'timeout' && actor === 0) toast('Time ran out. The table played for you.');
  }
  for (const event of events) {
    if (event.type === 'leader-chosen') liveMove = event.bySeat === null ? `${names[event.leader]} opens (chosen automatically).` : `${names[event.bySeat]} confirmed: ${names[event.leader]} opens.`;
    if (event.type === 'round-dealt') liveMove = `Round ${event.round} dealt · ${SYMBOLS[event.trump]} ${LABELS[event.trump]} is trump.`;
    if (event.type === 'rematch') liveMove = 'A new match. Same seats, fresh deck.';
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
            motionText = step.type === 'pickup' ? `${actor} · collecting ${step.cards.length} card${step.cards.length === 1 ? '' : 's'}…` : step.type === 'refill' ? 'Drawing from reserve…' : step.type === 'sleep' ? 'Унтана · clearing the pile…' : `${actor} · playing ${step.cards.length} card${step.cards.length === 1 ? '' : 's'}…`;
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
  if (!waiting) return;
  const ours = sceneArg.openingTeam === 0;
  $('discussion-title').textContent = ours ? 'Your team opens.' : 'The other team opens.';
  $('discussion-copy').textContent = ours
    ? 'Look at your dealt hand below. Talk it over with your team on voice, then any of you can confirm who leads.'
    : 'The cards are dealt. The other team is agreeing on its opener.';
  $('human-discussion').hidden = !ours;
  $('computer-discussion').hidden = ours;
  if (ours) {
    const select = $('opening-player');
    const current = select.value;
    select.replaceChildren(new Option('Choose after discussion…', ''));
    for (const d of [0, 2, 4, 6]) select.append(new Option(d === 0 ? 'You' : names[d], String(d)));
    select.value = [...select.options].some(o => o.value === current) ? current : '';
    $('confirm-opener').disabled = select.value === '' || confirmPending || !connected;
  }
  updateDiscussionCountdown();
}
function updateDiscussionCountdown() {
  if (!scene || scene.phase !== 'choosing-leader' || $('discussion').hidden) return;
  const left = deadline ? Math.max(0, Math.ceil((deadline - serverNow()) / 1000)) : null;
  const note = scene.openingTeam === 0 ? 'Your hand stays private. Talk it over on the shared voice channel.' : 'Your hand stays private. You can hear their discussion on the shared voice channel.';
  const text = left === null ? note : `${note} ${scene.openingTeam === 0 ? 'The table picks for you' : 'The table picks for them'} in ${left} s.`;
  if ($('discussion-note').textContent !== text) $('discussion-note').textContent = text;
}
async function confirmOpeningPlayer(display) {
  if (scene?.phase !== 'choosing-leader' || !client || confirmPending) return;
  confirmPending = true; $('confirm-opener').disabled = true;
  try { await client.request('game:confirmLeader', { leader: realSeat(display, me), expectedRevision: latestView.revision }); }
  catch (error) { toast(error.code === 'STALE_ACTION' || error.code === 'BAD_PHASE' ? 'A teammate already confirmed the opener.' : errorText(error)); }
  finally { confirmPending = false; renderDiscussion(); }
}
function maybeShowRound() {
  if (!scene || processing || animating) return;
  if (['round-over', 'match-over'].includes(scene.phase)) showRound();
  else if ($('round-dialog').open) $('round-dialog').close();
}
function showRound() {
  const matchOver = scene.phase === 'match-over', won = scene.winner === 0;
  $('result-eyebrow').textContent = matchOver ? 'MATCH COMPLETE' : `ROUND ${scene.round} COMPLETE`;
  $('result-icon').textContent = won ? '✧' : '◇';
  $('result-title').textContent = won ? matchOver ? 'Your team wins!' : 'One for your team.' : matchOver ? 'A well-played match.' : 'One for the other team.';
  $('result-detail').textContent = `${names[scene.turn]} emptied their hand. ${scene.scores[0]}–${scene.scores[1]}${matchOver ? ' — the first team to five takes the match.' : ` · Next trump: ${SYMBOLS[SUITS[scene.round % 4]]} ${LABELS[SUITS[scene.round % 4]]}.`}`;
  updateRoundControls();
  if (!$('round-dialog').open) $('round-dialog').showModal();
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
  button.textContent = matchOver ? 'Play again →' : 'Deal next round →';
  button.hidden = !eligible;
  let note;
  if (reviewLeft > 0) { note = `Take a look at the table · ${reviewLeft} s`; button.disabled = true; }
  else if (eligible) { note = matchOver ? 'Same seats, fresh deck.' : dealLeft === null ? 'Deal when your team is ready.' : `Deal when ready · the table deals in ${dealLeft} s`; button.disabled = continuePending || !connected; }
  else note = matchOver ? 'Waiting for the host to start a new match.' : dealLeft === null ? 'Waiting for the winning team to deal…' : `Waiting for the winning team… next deal in ${dealLeft} s`;
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
  try { await navigator.clipboard.writeText(text); toast(`${label} copied.`); }
  catch { toast(text); }
}

// ---- Wiring ----
$('opening-player').addEventListener('change', () => { $('confirm-opener').disabled = $('opening-player').value === '' || confirmPending; });
$('confirm-opener').addEventListener('click', () => { if (scene?.openingTeam === 0 && $('opening-player').value !== '') confirmOpeningPlayer(Number($('opening-player').value)); });
$('continue').addEventListener('click', continueRound);
$('round-dialog').addEventListener('cancel', event => event.preventDefault());
function openDialog(id) { if (animating) return; $(id).showModal(); }
for (const [button, dialog] of [['rules-open', 'rules-dialog'], ['resources-open', 'resources-dialog']]) $(button).addEventListener('click', () => openDialog(dialog));
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('pile-open').addEventListener('click', () => { if (!scene) return; $('pile-cards').replaceChildren(...scene.table.pile.map(card => cardElement(card))); openDialog('pile-dialog'); });
$('create').addEventListener('click', () => createOrJoin('create'));
$('join').addEventListener('click', () => createOrJoin('join'));
$('lobby-code').addEventListener('keydown', e => { if (e.key === 'Enter') createOrJoin('join'); });
$('lobby-name').addEventListener('keydown', e => { if (e.key === 'Enter') createOrJoin($('lobby-code').value.trim() ? 'join' : 'create'); });
$('fill-bots').addEventListener('click', () => lobbyRequest('room:fillBots'));
$('start-game').addEventListener('click', () => lobbyRequest('room:start'));
$('share-copy').addEventListener('click', () => copyText($('share-link').value, 'Table link'));
$('copy-link').addEventListener('click', () => { if (session) copyText(`${location.origin}/r/${session.code}`, 'Table link'); });
$('lobby-leave').addEventListener('click', async () => { if (client) { try { await client.request('room:leave', {}); } catch { /* leaving anyway */ } } leaveLocally('You left the table.'); });
$('new-match').addEventListener('click', () => { if (!session) return; if (scene) openDialog('new-dialog'); else $('lobby-leave').click(); });
$('new-confirm').addEventListener('click', async () => { $('new-dialog').close(); if (client) { try { await client.request('room:leave', {}); } catch { /* leaving anyway */ } } leaveLocally('You left the table. Open the same link to come back.'); });
$('voice-mic').addEventListener('click', toggleMic);
$('audio-resume').addEventListener('click', async () => { await voice?.resumeAudio(); renderHeader(); });
$('sort').addEventListener('click', () => { byRank = !byRank; store(SORT_KEY, byRank ? '1' : '0'); if (scene) renderHand(); });
$('play').addEventListener('click', () => { if (scene?.turn === 0 && selected.size) commit({ type: 'play', cards: [...selected] }); });
$('pickup').addEventListener('click', () => { if (scene?.turn === 0) commit({ type: 'pickup' }); });
$('hint').addEventListener('click', () => {
  if (scene?.turn !== 0) return;
  const cards = findPlay(scene); selected = new Set(cards || []); renderHand(); renderActions();
  if (!cards) toast('No beating response is available. Pick up the table.');
  else toast(`Suggested ${cards.length}-card play selected. You decide whether to play it.`);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) motionController?.abort(); });
window.addEventListener('resize', () => motionController?.abort());
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => motionController?.abort());
window.addEventListener('popstate', () => { if (!session && codeFromUrl()) $('lobby-code').value = codeFromUrl(); });

// ---- Boot ----
byRank = read(SORT_KEY) === '1';
$('lobby-name').value = read(NAME_KEY) || '';
{
  const code = codeFromUrl();
  const saved = code ? net.loadSession(code) : null;
  if (saved && saved.code === code) enterRoom(saved);
  else {
    if (code) $('lobby-code').value = code;
    render();
    ($('lobby-name').value ? (code ? $('join') : $('create')) : $('lobby-name')).focus({ preventScroll: true });
  }
}
