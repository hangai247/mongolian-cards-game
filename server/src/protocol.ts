/** Wire contract between browser and server. Every inbound payload is validated with these schemas. */
import { z } from 'zod';
import type { Card, Event as EngineEvent, PlayerView, Suit, Team, ErrorCode as EngineErrorCode } from 'mongolian-eight-gar-engine';
import { CODE_PATTERN, normalizeCode } from './codes.js';

export const DisplayName = z.string().trim().min(1).max(20).regex(/^[^\p{C}]+$/u, 'Use printable characters only');
export const RoomCodeInput = z.string().min(1).max(16).transform(normalizeCode).pipe(z.string().regex(CODE_PATTERN, 'Room codes are six letters or digits'));
export const Seat = z.number().int().min(0).max(7);
export const Revision = z.number().int().min(0).max(1_000_000_000);
export const CardId = z.string().min(1).max(40);
export const ActionId = z.uuid();

export const CreateRoomBody = z.object({ name: DisplayName }).strict();
export const JoinRoomBody = z.object({ name: DisplayName }).strict();

export const C2S = {
  'room:sync': z.object({}).strict(),
  'room:move': z.object({ seat: Seat }).strict(),
  'room:setBot': z.object({ seat: Seat, bot: z.boolean() }).strict(),
  'room:fillBots': z.object({}).strict(),
  'room:start': z.object({}).strict(),
  'room:leave': z.object({}).strict(),
  'room:rematch': z.object({}).strict(),
  'game:confirmLeader': z.object({ leader: Seat, expectedRevision: Revision }).strict(),
  'game:play': z.object({ cards: z.array(CardId).min(1).max(5), expectedRevision: Revision, actionId: ActionId }).strict(),
  'game:pickup': z.object({ expectedRevision: Revision, actionId: ActionId }).strict(),
  'game:continue': z.object({ expectedRevision: Revision }).strict(),
  'voice:token': z.object({}).strict(),
} as const;
export type ClientEventName = keyof typeof C2S;
export type ClientPayload<K extends ClientEventName> = z.output<typeof C2S[K]>;

export type ErrorCode = EngineErrorCode
  | 'UNAUTHORIZED' | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROOM_STARTED' | 'ROOM_CLOSED'
  | 'NOT_HOST' | 'SEAT_TAKEN' | 'NOT_SEATED' | 'NOT_YOUR_TEAM' | 'SEATS_NOT_FILLED' | 'BAD_PHASE'
  | 'REVIEW_IN_PROGRESS' | 'NAME_TAKEN' | 'RATE_LIMITED' | 'INVALID_PAYLOAD' | 'VOICE_UNAVAILABLE' | 'SERVER_ERROR';

export type Empty = Record<never, never>;
export type Ack<T extends object = Empty> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string };

export type SeatKind = 'empty' | 'human' | 'bot';
export interface SeatInfo {
  readonly seat: number;
  readonly kind: SeatKind;
  readonly team: Team;
  readonly name: string | null;
  readonly playerId: string | null;
  readonly connected: boolean;
  readonly isHost: boolean;
  /** Name of the disconnected human a bot is holding the seat for. */
  readonly reservedForName: string | null;
}

export type TimerKind = 'leader' | 'turn' | 'round-over' | null;
export type Cause = 'action' | 'timeout' | 'bot' | 'deal';

export interface GameInfo {
  readonly view: PlayerView;
  readonly deadline: number | null;
  readonly timer: TimerKind;
  readonly reviewUntil: number | null;
  readonly leaderConfirmedBy: { readonly seat: number; readonly name: string | null } | null;
}

export interface RoomStatePayload {
  readonly code: string;
  readonly status: 'lobby' | 'playing' | 'finished';
  readonly version: number;
  readonly you: { readonly playerId: string; readonly seat: number; readonly isHost: boolean };
  readonly seats: readonly SeatInfo[];
  readonly game: GameInfo | null;
  readonly serverNow: number;
  readonly config: { readonly turnMs: number; readonly roundReviewMs: number; readonly roundOverMs: number; readonly voice: boolean };
}

export type ClientEvent =
  | Exclude<EngineEvent, { type: 'refilled' }>
  | { readonly type: 'refilled'; readonly player: number; readonly cards: readonly Card[] }
  | { readonly type: 'refilled'; readonly player: number; readonly count: number }
  | { readonly type: 'leader-chosen'; readonly leader: number; readonly bySeat: number | null }
  | { readonly type: 'round-dealt'; readonly round: number; readonly trump: Suit }
  | { readonly type: 'rematch' };

export interface GameUpdatePayload {
  readonly version: number;
  readonly view: PlayerView;
  readonly events: readonly ClientEvent[];
  readonly deadline: number | null;
  readonly timer: TimerKind;
  readonly reviewUntil: number | null;
  readonly cause: Cause;
  readonly serverNow: number;
}

export interface RoomClosedPayload { readonly reason: 'abandoned' | 'evicted' | 'left' }

export interface VoiceTokenResult { readonly url: string; readonly token: string; readonly roomName: string; readonly identity: string }

export interface ServerToClient {
  'room:state': (payload: RoomStatePayload) => void;
  'game:update': (payload: GameUpdatePayload) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
}

export type ClientToServer = {
  [K in ClientEventName]: (payload: z.input<typeof C2S[K]>, ack: (result: Ack<AckData<K>>) => void) => void;
};

export type AckData<K extends ClientEventName> =
  K extends 'game:play' | 'game:pickup' | 'game:confirmLeader' | 'game:continue' ? { readonly revision: number }
  : K extends 'voice:token' ? VoiceTokenResult
  : Empty;

export interface JoinResult { readonly code: string; readonly playerId: string; readonly seat: number; readonly token: string }
export interface PublicRoomInfo {
  readonly code: string;
  readonly status: 'lobby' | 'playing' | 'finished';
  readonly seats: readonly { readonly seat: number; readonly kind: SeatKind; readonly name: string | null }[];
  readonly humanCount: number;
}
