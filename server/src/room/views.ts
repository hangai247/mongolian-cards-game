/** Everything a client may see. Hands other than the viewer's never pass through here. */
import { AVATAR_IDS, normalizeAvatar, botAvatar } from 'mongolian-eight-gar-engine/avatars';
import { TEAMS, viewForPlayer, type Event as EngineEvent } from 'mongolian-eight-gar-engine';
import type { Timing } from '../config.js';
import type { ClientEvent, GameInfo, PublicRoomInfo, RoomStatePayload, SeatInfo } from '../protocol.js';
import type { RoomSnapshot } from './model.js';
import { reconcileSignals, signalsForPlayer } from 'mongolian-eight-gar-engine/signals';

// Indexed like AVATAR_IDS: a computer is named after the face it is drawn with.
const BOT_NAMES = ['Temu', 'Bataa', 'Sarnai', 'Anu', 'Bold', 'Naraa', 'Oyu'];
export function botName(seat: number): string {
  return `${BOT_NAMES[AVATAR_IDS.indexOf(botAvatar(seat))] ?? 'Bot'} (computer)`;
}

export function seatInfos(snapshot: RoomSnapshot): SeatInfo[] {
  return snapshot.seats.map((slot, seat) => {
    const playerId = slot.kind === 'human' ? slot.playerId : null;
    const player = playerId ? snapshot.players[playerId] : null;
    const reserved = slot.kind === 'bot' && slot.reservedFor ? snapshot.players[slot.reservedFor] : null;
    return {
      seat, kind: slot.kind, team: TEAMS[seat] ?? 0,
      name: player?.name ?? (slot.kind === 'bot' ? botName(seat) : null),
      avatarId: player || reserved ? normalizeAvatar((player ?? reserved)?.avatarId) : slot.kind === 'bot' ? botAvatar(seat) : null,
      playerId, connected: player?.connected ?? false,
      isHost: playerId !== null && playerId === snapshot.hostPlayerId,
      reservedForName: reserved?.name ?? null,
    };
  });
}

export function gameInfoFor(snapshot: RoomSnapshot, seat: number): GameInfo | null {
  const game = snapshot.game;
  if (!game) return null;
  const confirmedBy = game.leaderConfirmedBy;
  const confirmer = confirmedBy?.playerId ? snapshot.players[confirmedBy.playerId] : null;
  return {
    view: viewForPlayer(game.state, seat),
    signals: signalsForPlayer(reconcileSignals(game.state, game.signals), seat),
    deadline: game.deadline, timer: game.timer, reviewUntil: game.reviewUntil,
    leaderConfirmedBy: confirmedBy ? { seat: confirmedBy.seat, name: confirmer?.name ?? null } : null,
  };
}

export function roomStateFor(snapshot: RoomSnapshot, playerId: string, now: number, timing: Timing, voice: boolean): RoomStatePayload | null {
  const player = snapshot.players[playerId];
  if (!player) return null;
  return {
    code: snapshot.code, status: snapshot.status, version: snapshot.version,
    you: { playerId, seat: player.seat, isHost: snapshot.hostPlayerId === playerId },
    seats: seatInfos(snapshot),
    game: gameInfoFor(snapshot, player.seat),
    serverNow: now,
    config: { turnMs: timing.turnMs, roundReviewMs: timing.roundReviewMs, roundOverMs: timing.roundOverMs, voice },
  };
}

export function publicRoomInfo(snapshot: RoomSnapshot): PublicRoomInfo {
  const seats = seatInfos(snapshot);
  return {
    code: snapshot.code, status: snapshot.status,
    seats: seats.map(({ seat, kind, name, avatarId }) => ({ seat, kind, name, avatarId })),
    humanCount: seats.filter(seat => seat.kind === 'human').length,
  };
}

/** Refill cards are private to the drawer; everyone else learns only the count. */
export function localizeEvents(events: readonly EngineEvent[], seat: number): ClientEvent[] {
  return events.map(event => {
    if (event.type !== 'refilled') return event;
    return event.player === seat ? event : { type: 'refilled', player: event.player, count: event.cards.length };
  });
}
