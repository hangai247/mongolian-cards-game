import { DEFAULT_AVATAR, type AvatarId } from 'mongolian-eight-gar-engine/avatars';
import { randomUUID } from 'node:crypto';
import type { Repository } from '../db/repo.js';
import type { Logger } from '../logger.js';
import { generateCode } from '../codes.js';
import { RoomError, type RoomSnapshot } from './model.js';
import { createRoom } from './reducer.js';
import { RoomRuntime, type RuntimeDeps } from './runtime.js';

export interface RegistryOptions {
  /** Rooms untouched for longer than these are evicted. */
  readonly lobbyIdleMs: number;
  readonly finishedIdleMs: number;
  readonly abandonedIdleMs: number;
}

export const DEFAULT_REGISTRY_OPTIONS: RegistryOptions = {
  lobbyIdleMs: 2 * 60 * 60 * 1000,
  finishedIdleMs: 24 * 60 * 60 * 1000,
  abandonedIdleMs: 24 * 60 * 60 * 1000,
};

export class RoomRegistry {
  private readonly byCode = new Map<string, RoomRuntime>();
  private readonly byId = new Map<string, RoomRuntime>();

  constructor(
    private readonly deps: RuntimeDeps,
    private readonly repo: Repository,
    private readonly log: Logger,
    private readonly options: RegistryOptions = DEFAULT_REGISTRY_OPTIONS,
  ) {}

  get size(): number { return this.byCode.size; }
  get(code: string): RoomRuntime | undefined { return this.byCode.get(code); }
  getById(id: string): RoomRuntime | undefined { return this.byId.get(id); }

  async create(hostName: string, avatarId: AvatarId = DEFAULT_AVATAR): Promise<{ runtime: RoomRuntime; playerId: string }> {
    let code = generateCode();
    for (let attempt = 0; this.byCode.has(code) && attempt < 10; attempt++) code = generateCode();
    if (this.byCode.has(code)) throw new RoomError('SERVER_ERROR', 'Could not allocate a room code.');
    const playerId = randomUUID();
    const snapshot = createRoom({ id: randomUUID(), code, hostPlayerId: playerId, hostName, avatarId, now: this.deps.clock.now() });
    await this.repo.createRoom(snapshot);
    const runtime = this.register(snapshot);
    this.log.info({ room: code }, 'room created');
    return { runtime, playerId };
  }

  async join(code: string, name: string, avatarId: AvatarId = DEFAULT_AVATAR): Promise<{ runtime: RoomRuntime; playerId: string; seat: number }> {
    const runtime = this.byCode.get(code);
    if (!runtime) throw new RoomError('ROOM_NOT_FOUND', 'No table has that code.');
    const playerId = randomUUID();
    const outcome = await runtime.enqueue({ type: 'join', playerId, name, avatarId });
    if (!outcome.ok) throw new RoomError(outcome.code, outcome.message);
    const seat = outcome.result.snapshot.players[playerId]?.seat;
    if (seat === undefined) throw new RoomError('SERVER_ERROR', 'Join did not assign a seat.');
    return { runtime, playerId, seat };
  }

  private register(snapshot: RoomSnapshot): RoomRuntime {
    const runtime = new RoomRuntime(snapshot, this.deps);
    this.byCode.set(snapshot.code, runtime);
    this.byId.set(snapshot.id, runtime);
    return runtime;
  }

  /** Restores rooms from the database after a restart; every player starts offline. */
  async loadAll(): Promise<number> {
    const now = this.deps.clock.now();
    const rooms = await this.repo.loadActiveRooms(now - this.options.abandonedIdleMs);
    for (const room of rooms) {
      const players = Object.fromEntries(Object.values(room.players).map(player => [player.id, { ...player, connected: false, offlineSince: now }]));
      const restored: RoomSnapshot = { ...room, players };
      // A short grace period lets players reconnect before any timer that expired during the restart fires.
      const game = restored.game && restored.game.deadline !== null && restored.game.deadline < now + 5000
        ? { ...restored.game, phaseSince: Math.max(restored.game.phaseSince, now + 5000 - (restored.game.deadline - restored.game.phaseSince)) }
        : restored.game;
      this.register(game === restored.game ? restored : { ...restored, game: { ...game!, deadline: game!.deadline === null ? null : game!.deadline + (game!.phaseSince - restored.game!.phaseSince) } });
    }
    return rooms.length;
  }

  /** Evicts idle rooms. Safe to call from an interval. */
  async sweep(): Promise<number> {
    const now = this.deps.clock.now();
    let evicted = 0;
    for (const runtime of [...this.byCode.values()]) {
      const snapshot = runtime.current();
      const idle = now - snapshot.updatedAt;
      const anyoneOnline = runtime.connectedCount() > 0;
      const stale = snapshot.status === 'lobby' ? idle > this.options.lobbyIdleMs
        : snapshot.status === 'finished' ? idle > this.options.finishedIdleMs
        : !anyoneOnline && idle > this.options.abandonedIdleMs;
      if (!stale) continue;
      await this.evict(runtime, 'evicted');
      evicted++;
    }
    return evicted;
  }

  async evict(runtime: RoomRuntime, reason: 'evicted' | 'abandoned'): Promise<void> {
    runtime.close(reason);
    this.byCode.delete(runtime.code);
    this.byId.delete(runtime.id);
    try { await this.repo.markAbandoned(runtime.id); } catch (error) { this.log.warn({ err: error, room: runtime.code }, 'could not mark room abandoned'); }
    this.log.info({ room: runtime.code, reason }, 'room evicted');
  }

  closeAll(): void {
    for (const runtime of this.byCode.values()) runtime.close('evicted');
    this.byCode.clear();
    this.byId.clear();
  }
}
