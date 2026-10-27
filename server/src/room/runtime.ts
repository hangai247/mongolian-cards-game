/** One instance per live room: serializes commands, persists before emitting, and owns the timers. */
import type { Timing } from '../config.js';
import type { Logger } from '../logger.js';
import type { Ack, GameUpdatePayload, RoomClosedPayload, RoomStatePayload, ErrorCode } from '../protocol.js';
import type { Repository } from '../db/repo.js';
import { RoomError, type RoomSnapshot } from './model.js';
import { applyCommand, RuleError, type Command, type Result } from './reducer.js';
import { localizeEvents, roomStateFor } from './views.js';
import { TEAMS } from 'mongolian-eight-gar-engine';
import { reconcileSignals, signalsForPlayer } from 'mongolian-eight-gar-engine/signals';
import type { SignalUpdatePayload } from '../protocol.js';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout),
};

/** The slice of a socket.io socket the runtime needs; tests pass fakes. */
export interface SocketLike {
  readonly id: string;
  emit(event: 'room:state', payload: RoomStatePayload): void;
  emit(event: 'game:update', payload: GameUpdatePayload): void;
  emit(event: 'game:signals', payload: SignalUpdatePayload): void;
  emit(event: 'room:closed', payload: RoomClosedPayload): void;
}

export interface RuntimeDeps {
  readonly clock: Clock;
  readonly random: () => number;
  readonly timing: Timing;
  readonly repo: Repository;
  readonly log: Logger;
  readonly voiceEnabled: boolean;
}

export type Outcome =
  | { readonly ok: true; readonly result: Result }
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string };

const CACHE_LIMIT = 64;

export class RoomRuntime {
  private snapshot: RoomSnapshot;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly sockets = new Map<string, Set<SocketLike>>();
  private gameTimer: { key: string; handle: unknown } | null = null;
  private readonly takeoverTimers = new Map<string, { offlineSince: number; handle: unknown }>();
  private readonly acks = new Map<string, Outcome>();
  private disposed = false;

  constructor(snapshot: RoomSnapshot, private readonly deps: RuntimeDeps) {
    this.snapshot = snapshot.game ? { ...snapshot, game: { ...snapshot.game, signals: reconcileSignals(snapshot.game.state, snapshot.game.signals) } } : snapshot;
    this.syncTimers();
  }

  get id(): string { return this.snapshot.id; }
  get code(): string { return this.snapshot.code; }
  current(): RoomSnapshot { return this.snapshot; }
  connectedCount(): number { return this.sockets.size; }

  /** Applies a command after every previously queued one. Never rejects: failures come back as outcomes. */
  enqueue(command: Command, actionKey?: string): Promise<Outcome> {
    const run = () => this.run(command, actionKey);
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async run(command: Command, actionKey?: string): Promise<Outcome> {
    if (this.disposed) return { ok: false, code: 'ROOM_CLOSED', message: 'This table has closed.' };
    if (actionKey) {
      const cached = this.acks.get(actionKey);
      if (cached) return cached;
    }
    let result: Result;
    try {
      result = applyCommand(this.snapshot, command, { now: this.deps.clock.now(), random: this.deps.random, timing: this.deps.timing });
    } catch (error) {
      const outcome = this.failure(error);
      if (actionKey) this.remember(actionKey, outcome);
      return outcome;
    }
    if (result.snapshot !== this.snapshot) {
      try {
        await this.deps.repo.commit(result.snapshot, result.audit);
      } catch (error) {
        this.deps.log.error({ err: error, room: this.code, command: command.type }, 'persist failed; transition dropped');
        return { ok: false, code: 'SERVER_ERROR', message: 'The table could not be saved. Please try again.' };
      }
      this.snapshot = result.snapshot;
      this.emitResult(result);
      this.syncTimers();
    }
    const outcome: Outcome = { ok: true, result };
    if (actionKey) this.remember(actionKey, outcome);
    return outcome;
  }

  private failure(error: unknown): Outcome {
    if (error instanceof RoomError || error instanceof RuleError) return { ok: false, code: error.code, message: error.message };
    this.deps.log.error({ err: error, room: this.code }, 'unexpected reducer failure');
    return { ok: false, code: 'SERVER_ERROR', message: 'Something went wrong on the table. Please try again.' };
  }

  private remember(key: string, outcome: Outcome): void {
    this.acks.set(key, outcome);
    if (this.acks.size > CACHE_LIMIT) {
      const oldest = this.acks.keys().next().value;
      if (oldest !== undefined) this.acks.delete(oldest);
    }
  }

  private emitResult(result: Result): void {
    const now = this.deps.clock.now();
    const game = this.snapshot.game;
    if (result.signalTeam !== undefined && game) {
      for (const [playerId, sockets] of this.sockets) {
        const player = this.snapshot.players[playerId];
        if (!player || this.snapshot.seats[player.seat]?.kind !== 'human' || TEAMS[player.seat] !== result.signalTeam) continue;
        const payload: SignalUpdatePayload = {
          version: this.snapshot.version, revision: game.state.revision,
          signals: signalsForPlayer(reconcileSignals(game.state, game.signals), player.seat),
        };
        for (const socket of sockets) socket.emit('game:signals', payload);
      }
    }
    if (result.gameChanged && game) {
      for (const [playerId, sockets] of this.sockets) {
        const player = this.snapshot.players[playerId];
        if (!player || this.snapshot.seats[player.seat]?.kind !== 'human') continue;
        const payload: GameUpdatePayload = {
          version: this.snapshot.version,
          signals: signalsForPlayer(reconcileSignals(game.state, game.signals), player.seat),
          view: roomStateFor(this.snapshot, playerId, now, this.deps.timing, this.deps.voiceEnabled)!.game!.view,
          events: [...result.roomEvents, ...localizeEvents(result.engineEvents, player.seat)],
          deadline: game.deadline, timer: game.timer, reviewUntil: game.reviewUntil, cause: result.cause, serverNow: now,
        };
        for (const socket of sockets) socket.emit('game:update', payload);
      }
    }
    if (result.rosterChanged) {
      for (const [playerId, sockets] of this.sockets) {
        const payload = roomStateFor(this.snapshot, playerId, now, this.deps.timing, this.deps.voiceEnabled);
        if (!payload) {
          for (const socket of sockets) socket.emit('room:closed', { reason: 'left' });
          continue;
        }
        for (const socket of sockets) socket.emit('room:state', payload);
      }
    }
  }

  /** Re-arms timers from the snapshot so they are a pure function of persisted state. */
  private syncTimers(): void {
    if (this.disposed) return;
    const { clock, timing } = this.deps;
    const game = this.snapshot.game;
    if (game && game.timer && game.deadline !== null) {
      const timer = game.timer;
      const revision = game.state.revision;
      const key = `${timer}:${game.deadline}:${revision}`;
      if (this.gameTimer?.key !== key) {
        if (this.gameTimer) clock.clearTimeout(this.gameTimer.handle);
        const delay = Math.max(0, game.deadline - clock.now());
        this.gameTimer = { key, handle: clock.setTimeout(() => { void this.enqueue({ type: 'timer', timer, revision }); }, delay) };
      }
    } else if (this.gameTimer) {
      clock.clearTimeout(this.gameTimer.handle);
      this.gameTimer = null;
    }
    const live = new Set<string>();
    for (const player of Object.values(this.snapshot.players)) {
      if (player.connected || player.offlineSince === null) continue;
      live.add(player.id);
      const existing = this.takeoverTimers.get(player.id);
      if (existing?.offlineSince === player.offlineSince) continue;
      if (existing) clock.clearTimeout(existing.handle);
      const offlineSince = player.offlineSince;
      const delay = Math.max(0, offlineSince + timing.botTakeoverMs - clock.now());
      this.takeoverTimers.set(player.id, {
        offlineSince,
        handle: clock.setTimeout(() => { void this.enqueue({ type: 'bot-takeover', playerId: player.id, offlineSince }); }, delay),
      });
    }
    for (const [playerId, entry] of this.takeoverTimers) {
      if (live.has(playerId)) continue;
      clock.clearTimeout(entry.handle);
      this.takeoverTimers.delete(playerId);
    }
  }

  /** Registers a socket for a player, marks them connected on the first socket, then sends a full sync. */
  async attach(playerId: string, socket: SocketLike): Promise<Outcome> {
    const set = this.sockets.get(playerId) ?? new Set<SocketLike>();
    const first = set.size === 0;
    set.add(socket);
    this.sockets.set(playerId, set);
    const outcome = first ? await this.enqueue({ type: 'connect', playerId }) : { ok: true as const, result: unchangedResult(this.snapshot) };
    if (outcome.ok) this.sendState(playerId, socket);
    return outcome;
  }

  async detach(playerId: string, socket: SocketLike): Promise<void> {
    const set = this.sockets.get(playerId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      this.sockets.delete(playerId);
      await this.enqueue({ type: 'disconnect', playerId });
    }
  }

  sendState(playerId: string, socket: SocketLike): void {
    const payload = roomStateFor(this.snapshot, playerId, this.deps.clock.now(), this.deps.timing, this.deps.voiceEnabled);
    if (payload) socket.emit('room:state', payload);
  }

  ack<T extends object>(outcome: Outcome, data: (result: Result) => T): Ack<T> {
    return outcome.ok ? { ok: true, ...data(outcome.result) } : { ok: false, code: outcome.code, message: outcome.message };
  }

  /** Stops timers and tells everyone the table is gone. */
  close(reason: RoomClosedPayload['reason']): void {
    this.disposed = true;
    if (this.gameTimer) this.deps.clock.clearTimeout(this.gameTimer.handle);
    for (const entry of this.takeoverTimers.values()) this.deps.clock.clearTimeout(entry.handle);
    this.takeoverTimers.clear();
    for (const sockets of this.sockets.values()) for (const socket of sockets) socket.emit('room:closed', { reason });
    this.sockets.clear();
  }
}

function unchangedResult(snapshot: RoomSnapshot): Result {
  return { snapshot, engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: false, gameChanged: false, audit: null };
}
