import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io';
import type { Config } from './../config.js';
import type { Logger } from '../logger.js';
import type { ServerToClient } from '../protocol.js';
import type { RoomRegistry } from '../room/registry.js';
import { verifySession } from '../session.js';

export interface SocketData { roomId: string; playerId: string }
export type IoServer = Server<DefaultEventsMap, ServerToClient, DefaultEventsMap, SocketData>;
export type IoSocket = Socket<DefaultEventsMap, ServerToClient, DefaultEventsMap, SocketData>;

export interface SocketDeps {
  readonly config: Config;
  readonly registry: RoomRegistry;
  readonly log: Logger;
}

/** Only same-origin browsers with a valid session token get a socket; everything else is refused at the handshake. */
export function createSocketServer(httpServer: HttpServer, deps: SocketDeps): IoServer {
  const { config, registry } = deps;
  const io: IoServer = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.publicOrigin, credentials: false },
    maxHttpBufferSize: 16 * 1024,
    serveClient: true,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (origin && origin !== config.publicOrigin) return callback('origin not allowed', false);
      callback(null, true);
    },
  });

  io.use((socket, next) => {
    const claims = verifySession(config.sessionSecret, socket.handshake.auth['token']);
    if (!claims) return next(new Error('UNAUTHORIZED'));
    const runtime = registry.getById(claims.roomId);
    if (!runtime || !runtime.current().players[claims.playerId]) return next(new Error('ROOM_NOT_FOUND'));
    socket.data = { roomId: claims.roomId, playerId: claims.playerId };
    next();
  });

  return io;
}
