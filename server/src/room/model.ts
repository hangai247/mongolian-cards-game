import type { AvatarId } from 'mongolian-eight-gar-engine/avatars';
import type { State } from 'mongolian-eight-gar-engine';
import type { Signals } from 'mongolian-eight-gar-engine/signals';
import type { Cause, ErrorCode, TimerKind } from '../protocol.js';

export type SeatSlot =
  | { readonly kind: 'empty' }
  | { readonly kind: 'human'; readonly playerId: string }
  /** A server bot holds the seat; reservedFor names the disconnected human who may reclaim it. */
  | { readonly kind: 'bot'; readonly reservedFor: string | null };

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly avatarId: AvatarId;
  readonly seat: number;
  readonly connected: boolean;
  readonly offlineSince: number | null;
  readonly lastSeenAt: number;
}

export interface GameMeta {
  /** Absent in older saved rooms; revalidate before use. */
  readonly signals?: Signals;
  /** Full engine state. Never leaves the server; clients get viewForPlayer. */
  readonly state: State;
  /** When the current phase/turn began; deadlines derive from it. */
  readonly phaseSince: number;
  readonly deadline: number | null;
  readonly timer: TimerKind;
  readonly reviewUntil: number | null;
  readonly leaderConfirmedBy: { readonly seat: number; readonly playerId: string | null } | null;
  readonly lastCause: Cause;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomSnapshot {
  readonly id: string;
  readonly code: string;
  /** Increments on every committed change; the database rejects writes that skip a version. */
  readonly version: number;
  readonly status: RoomStatus;
  readonly hostPlayerId: string;
  readonly seats: readonly SeatSlot[];
  readonly players: Readonly<Record<string, Player>>;
  readonly game: GameMeta | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const SEAT_COUNT = 8;

export class RoomError extends Error {
  override readonly name = 'RoomError';
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
  }
}

export function seatOf(snapshot: RoomSnapshot, playerId: string): number | null {
  return snapshot.players[playerId]?.seat ?? null;
}

export function playerAtSeat(snapshot: RoomSnapshot, seat: number): Player | null {
  const slot = snapshot.seats[seat];
  if (!slot) return null;
  const playerId = slot.kind === 'human' ? slot.playerId : slot.kind === 'bot' ? slot.reservedFor : null;
  return playerId ? snapshot.players[playerId] ?? null : null;
}
