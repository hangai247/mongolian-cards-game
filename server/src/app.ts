import { createServer, type Server as HttpServer } from 'node:http';
import { randomInt } from 'node:crypto';
import type { Config } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { MemoryRepository, PgRepository, type Repository } from './db/repo.js';
import { createHttpApp } from './http.js';
import { RoomRegistry } from './room/registry.js';
import { systemClock, type Clock } from './room/runtime.js';
import { registerHandlers } from './socket/handlers.js';
import { createSocketServer, type IoServer } from './socket/server.js';

export interface AppOverrides {
  readonly clock?: Clock;
  readonly random?: () => number;
  readonly repo?: Repository;
  readonly log?: Logger;
}

export interface App {
  readonly httpServer: HttpServer;
  readonly io: IoServer;
  readonly registry: RoomRegistry;
  readonly repo: Repository;
  readonly log: Logger;
  listen(): Promise<{ port: number; host: string }>;
  close(): Promise<void>;
}

/** Cryptographic shuffle source: 32 random bits mapped into [0, 1). */
export const secureRandom = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

export async function createApp(config: Config, overrides: AppOverrides = {}): Promise<App> {
  const log = overrides.log ?? createLogger(config.logLevel, { sha: config.gitSha });
  const clock = overrides.clock ?? systemClock;
  const random = overrides.random ?? secureRandom;

  let repo = overrides.repo;
  if (!repo) {
    if (config.databaseUrl) {
      const pool = createPool(config.databaseUrl);
      await migrate(pool, log);
      repo = new PgRepository(pool);
    } else {
      log.warn('DATABASE_URL is not set: room state lives in memory and is lost on restart');
      repo = new MemoryRepository();
    }
  }

  const registry = new RoomRegistry({ clock, random, timing: config.timing, repo, log, voiceEnabled: config.livekit !== null }, repo, log);
  const restored = await registry.loadAll();
  if (restored > 0) log.info({ rooms: restored }, 'restored rooms from storage');

  const app = createHttpApp({ config, registry, repo, log, clock });
  const httpServer = createServer(app);
  httpServer.keepAliveTimeout = 65_000;
  const io = createSocketServer(httpServer, { config, registry, log });
  registerHandlers(io, { config, registry, log, clock });

  const sweeper = setInterval(() => {
    registry.sweep().then(count => { if (count > 0) log.info({ evicted: count }, 'swept idle rooms'); })
      .catch(error => log.error({ err: error }, 'sweep failed'));
  }, 5 * 60 * 1000);
  sweeper.unref();

  return {
    httpServer, io, registry, repo, log,
    listen: () => new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(config.port, config.host, () => {
        const address = httpServer.address();
        const port = typeof address === 'object' && address ? address.port : config.port;
        resolve({ port, host: config.host });
      });
    }),
    close: async () => {
      clearInterval(sweeper);
      registry.closeAll();
      await new Promise<void>(resolve => io.close(() => resolve()));
      await new Promise<void>(resolve => httpServer.close(() => resolve()));
      await repo.close();
    },
  };
}
