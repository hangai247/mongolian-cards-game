import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { Repository } from './db/repo.js';
import { RateLimiter } from './ratelimit.js';
import { signSession } from './session.js';
import { CreateRoomBody, JoinRoomBody, RoomCodeInput, type ErrorCode, type JoinResult } from './protocol.js';
import { RoomError } from './room/model.js';
import type { RoomRegistry } from './room/registry.js';
import { publicRoomInfo } from './room/views.js';
import type { Clock } from './room/runtime.js';

export interface HttpDeps {
  readonly config: Config;
  readonly registry: RoomRegistry;
  readonly repo: Repository;
  readonly log: Logger;
  readonly clock: Clock;
}

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  ROOM_NOT_FOUND: 404, ROOM_FULL: 409, ROOM_STARTED: 409, NAME_TAKEN: 409, ROOM_CLOSED: 410,
  RATE_LIMITED: 429, INVALID_PAYLOAD: 400, UNAUTHORIZED: 401,
};

function fail(res: Response, code: ErrorCode, message: string): void {
  res.status(STATUS_BY_CODE[code] ?? 500).json({ ok: false, code, message });
}

export function createHttpApp(deps: HttpDeps): express.Express {
  const { config, registry, repo, log, clock } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', 'weak');

  const createLimiter = new RateLimiter(5, 10 * 60 * 1000, clock);
  const joinLimiter = new RateLimiter(20, 10 * 60 * 1000, clock);
  const lookupLimiter = new RateLimiter(15, 5 * 60 * 1000, clock);
  const ip = (req: Request): string => req.ip ?? 'unknown';

  app.get('/healthz', async (_req, res) => {
    const db = await repo.ping();
    res.status(db ? 200 : 503).json({ ok: db, sha: config.gitSha, rooms: registry.size, db: db ? 'ok' : 'down' });
  });

  const api = express.Router();
  api.use(express.json({ limit: '2kb' }));

  api.post('/rooms', async (req, res) => {
    if (!createLimiter.hit(ip(req))) return fail(res, 'RATE_LIMITED', 'Too many tables created from your network. Try again later.');
    const body = CreateRoomBody.safeParse(req.body);
    if (!body.success) return fail(res, 'INVALID_PAYLOAD', body.error.issues[0]?.message ?? 'Invalid request.');
    const { runtime, playerId } = await registry.create(body.data.name);
    const token = signSession(config.sessionSecret, { roomId: runtime.id, playerId, iat: clock.now() });
    const result: JoinResult = { code: runtime.code, playerId, seat: 0, token };
    res.status(201).json(result);
  });

  api.post('/rooms/:code/join', async (req, res) => {
    if (!joinLimiter.hit(ip(req))) return fail(res, 'RATE_LIMITED', 'Too many join attempts from your network. Try again later.');
    const code = RoomCodeInput.safeParse(req.params.code);
    const body = JoinRoomBody.safeParse(req.body);
    const issue = !code.success ? code.error.issues[0] : !body.success ? body.error.issues[0] : undefined;
    if (!code.success || !body.success) return fail(res, 'INVALID_PAYLOAD', issue?.message ?? 'Invalid request.');
    if (!registry.get(code.data)) {
      if (!lookupLimiter.hit(ip(req))) return fail(res, 'RATE_LIMITED', 'Too many unknown codes from your network. Try again later.');
      return fail(res, 'ROOM_NOT_FOUND', 'No table has that code.');
    }
    const { runtime, playerId, seat } = await registry.join(code.data, body.data.name);
    const token = signSession(config.sessionSecret, { roomId: runtime.id, playerId, iat: clock.now() });
    const result: JoinResult = { code: runtime.code, playerId, seat, token };
    res.json(result);
  });

  api.get('/rooms/:code', (req, res) => {
    const code = RoomCodeInput.safeParse(req.params.code);
    const runtime = code.success ? registry.get(code.data) : undefined;
    if (!runtime) {
      if (!lookupLimiter.hit(ip(req))) return fail(res, 'RATE_LIMITED', 'Too many unknown codes from your network. Try again later.');
      return fail(res, 'ROOM_NOT_FOUND', 'No table has that code.');
    }
    res.json(publicRoomInfo(runtime.current()));
  });

  api.use((_req, res) => fail(res, 'ROOM_NOT_FOUND', 'Unknown API route.'));
  app.use('/api', api);

  const engineFile = (name: string) => (_req: Request, res: Response) => {
    res.sendFile(path.join(config.engineDistDir, name), { maxAge: 0, headers: { 'Cache-Control': 'no-cache' } });
  };
  app.get('/engine.js', engineFile('engine.js'));
  app.get('/strategy.js', engineFile('strategy.js'));

  const index = path.join(config.staticDir, 'index.html');
  app.get('/r/:code', (_req, res) => { res.sendFile(index, { headers: { 'Cache-Control': 'no-cache' } }); });
  app.use(express.static(config.staticDir, {
    index: 'index.html', redirect: false,
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', file.includes(`${path.sep}vendor${path.sep}`) || file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=86400' : 'no-cache');
    },
  }));

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof RoomError) return fail(res, error.code, error.message);
    if (error && typeof error === 'object' && (error as { type?: string }).type === 'entity.parse.failed') {
      return fail(res, 'INVALID_PAYLOAD', 'Malformed JSON body.');
    }
    log.error({ err: error, path: req.path }, 'unhandled http error');
    fail(res, 'SERVER_ERROR', 'Something went wrong.');
  });

  return app;
}
