import type { Pool } from './pool.js';
import type { Audit } from '../room/reducer.js';
import type { GameMeta, Player, RoomSnapshot, SeatSlot } from '../room/model.js';

export interface Repository {
  createRoom(snapshot: RoomSnapshot): Promise<void>;
  /** Persists one committed transition. Must reject if snapshot.version is not exactly the stored version + 1. */
  commit(snapshot: RoomSnapshot, audit: Audit | null): Promise<void>;
  loadActiveRooms(updatedSince: number): Promise<RoomSnapshot[]>;
  markAbandoned(roomId: string): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export class VersionConflictError extends Error {
  override readonly name = 'VersionConflictError';
}

/** Development/test store. Mirrors the Postgres version guard so tests exercise the same failure path. */
export class MemoryRepository implements Repository {
  private readonly rooms = new Map<string, RoomSnapshot>();
  private readonly abandoned = new Set<string>();

  async createRoom(snapshot: RoomSnapshot): Promise<void> {
    if (this.rooms.has(snapshot.id)) throw new Error(`room ${snapshot.id} already exists`);
    this.rooms.set(snapshot.id, snapshot);
  }

  async commit(snapshot: RoomSnapshot): Promise<void> {
    const current = this.rooms.get(snapshot.id);
    if (!current) throw new Error(`room ${snapshot.id} does not exist`);
    if (snapshot.version !== current.version + 1) {
      throw new VersionConflictError(`room ${snapshot.id}: expected version ${current.version + 1}, got ${snapshot.version}`);
    }
    this.rooms.set(snapshot.id, snapshot);
  }

  async loadActiveRooms(updatedSince: number): Promise<RoomSnapshot[]> {
    return [...this.rooms.values()].filter(room => !this.abandoned.has(room.id) && room.updatedAt > updatedSince);
  }

  async markAbandoned(roomId: string): Promise<void> {
    this.abandoned.add(roomId);
  }

  async ping(): Promise<boolean> { return true; }
  async close(): Promise<void> { /* nothing to release */ }

  /** Test helper. */
  get(roomId: string): RoomSnapshot | undefined { return this.rooms.get(roomId); }
}

interface RoomRow {
  id: string; code: string; status: string; host_player_id: string; version: string; seats: SeatSlot[];
  created_at_ms: string; updated_at_ms: string;
}
interface PlayerRow { id: string; room_id: string; display_name: string; seat: number; last_seen_at_ms: string }
interface GameRow { room_id: string; state: GameMeta['state']; meta: Omit<GameMeta, 'state'> }

const ms = (value: string | number): number => Math.round(Number(value));

export class PgRepository implements Repository {
  constructor(private readonly pool: Pool) {}

  async createRoom(snapshot: RoomSnapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO rooms (id, code, status, host_player_id, version, seats, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))`,
        [snapshot.id, snapshot.code, snapshot.status, snapshot.hostPlayerId, snapshot.version, JSON.stringify(snapshot.seats), snapshot.createdAt, snapshot.updatedAt],
      );
      await this.writePlayers(client, snapshot);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async commit(snapshot: RoomSnapshot, audit: Audit | null): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE rooms SET status = $2, host_player_id = $3, version = $4, seats = $5, updated_at = to_timestamp($6 / 1000.0)
         WHERE id = $1 AND version = $4 - 1`,
        [snapshot.id, snapshot.status, snapshot.hostPlayerId, snapshot.version, JSON.stringify(snapshot.seats), snapshot.updatedAt],
      );
      if (updated.rowCount !== 1) throw new VersionConflictError(`room ${snapshot.id}: version ${snapshot.version} is not the next version`);
      await this.writePlayers(client, snapshot);
      if (snapshot.game) {
        const { state, ...meta } = snapshot.game;
        await client.query(
          `INSERT INTO game_states (room_id, revision, state, meta, updated_at)
           VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
           ON CONFLICT (room_id) DO UPDATE SET revision = EXCLUDED.revision, state = EXCLUDED.state, meta = EXCLUDED.meta, updated_at = EXCLUDED.updated_at`,
          [snapshot.id, state.revision, JSON.stringify(state), JSON.stringify(meta), snapshot.updatedAt],
        );
      }
      if (audit) {
        await client.query(
          `INSERT INTO moves (room_id, room_version, engine_revision, kind, cause, actor_seat, payload) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [snapshot.id, snapshot.version, snapshot.game?.state.revision ?? null, audit.kind, audit.cause, audit.actorSeat, JSON.stringify(audit.payload)],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async writePlayers(client: { query: Pool['query'] }, snapshot: RoomSnapshot): Promise<void> {
    await client.query('DELETE FROM players WHERE room_id = $1', [snapshot.id]);
    for (const player of Object.values(snapshot.players)) {
      await client.query(
        `INSERT INTO players (id, room_id, display_name, seat, last_seen_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
        [player.id, snapshot.id, player.name, player.seat, player.lastSeenAt],
      );
    }
  }

  async loadActiveRooms(updatedSince: number): Promise<RoomSnapshot[]> {
    const rooms = await this.pool.query<RoomRow>(
      `SELECT id, code, status, host_player_id, version, seats,
              EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
       FROM rooms WHERE status IN ('lobby', 'playing', 'finished') AND updated_at > to_timestamp($1 / 1000.0)`,
      [updatedSince],
    );
    if (rooms.rows.length === 0) return [];
    const ids = rooms.rows.map(row => row.id);
    const players = await this.pool.query<PlayerRow>(
      `SELECT id, room_id, display_name, seat, EXTRACT(EPOCH FROM last_seen_at) * 1000 AS last_seen_at_ms FROM players WHERE room_id = ANY($1)`,
      [ids],
    );
    const games = await this.pool.query<GameRow>('SELECT room_id, state, meta FROM game_states WHERE room_id = ANY($1)', [ids]);
    const gameByRoom = new Map(games.rows.map(row => [row.room_id, row]));
    return rooms.rows.map(row => {
      const roomPlayers: Record<string, Player> = {};
      for (const player of players.rows.filter(candidate => candidate.room_id === row.id)) {
        roomPlayers[player.id] = {
          id: player.id, name: player.display_name, seat: player.seat, connected: false,
          offlineSince: ms(row.updated_at_ms), lastSeenAt: ms(player.last_seen_at_ms),
        };
      }
      const game = gameByRoom.get(row.id);
      return {
        id: row.id, code: row.code, status: row.status as RoomSnapshot['status'], hostPlayerId: row.host_player_id,
        version: Number(row.version), seats: row.seats, players: roomPlayers,
        game: game ? { state: game.state, ...game.meta } : null,
        createdAt: ms(row.created_at_ms), updatedAt: ms(row.updated_at_ms),
      };
    });
  }

  async markAbandoned(roomId: string): Promise<void> {
    await this.pool.query(`UPDATE rooms SET status = 'abandoned', updated_at = now() WHERE id = $1`, [roomId]);
  }

  async ping(): Promise<boolean> {
    try { await this.pool.query('SELECT 1'); return true; } catch { return false; }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
