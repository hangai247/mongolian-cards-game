import type { z } from 'zod';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { C2S, type Ack, type AckData, type ClientEventName, type Empty } from '../protocol.js';
import { RateLimiter } from '../ratelimit.js';
import type { RoomRegistry } from '../room/registry.js';
import type { Clock, Outcome, RoomRuntime } from '../room/runtime.js';
import { mintVoiceToken } from '../voice/livekit.js';
import type { IoServer, IoSocket } from './server.js';

export interface HandlerDeps {
  readonly config: Config;
  readonly registry: RoomRegistry;
  readonly log: Logger;
  readonly clock: Clock;
}

type Handler<K extends ClientEventName> = (payload: z.output<typeof C2S[K]>) => Promise<Ack<AckData<K>>>;

const revisionOf = (outcome: Outcome): { revision: number } =>
  ({ revision: outcome.ok ? outcome.result.snapshot.game?.state.revision ?? 0 : 0 });

export function registerHandlers(io: IoServer, deps: HandlerDeps): void {
  const { config, registry, log, clock } = deps;

  io.on('connection', socket => {
    const { roomId, playerId } = socket.data;
    const runtime = registry.getById(roomId);
    if (!runtime) { socket.emit('room:closed', { reason: 'evicted' }); socket.disconnect(true); return; }
    const eventLimiter = new RateLimiter(20, 1000, clock);
    const invalidLimiter = new RateLimiter(5, 60_000, clock);
    const child = log.child({ room: runtime.code, player: playerId, socket: socket.id });

    // socket.io's typed `on` cannot express a generic event name, so listen through the untyped surface.
    const listen = (socket as unknown as { on(event: string, listener: (...args: unknown[]) => void): void }).on.bind(socket);
    const bind = <K extends ClientEventName>(name: K, handler: Handler<K>): void => {
      listen(name, async (...args: unknown[]) => {
        const payload = args[0];
        const ack = typeof args[args.length - 1] === 'function' ? (args[args.length - 1] as (result: Ack<AckData<K>>) => void) : () => undefined;
        if (!eventLimiter.hit(socket.id)) return ack({ ok: false, code: 'RATE_LIMITED', message: 'Slow down a little.' });
        const parsed = C2S[name].safeParse(payload ?? {});
        if (!parsed.success) {
          ack({ ok: false, code: 'INVALID_PAYLOAD', message: parsed.error.issues[0]?.message ?? 'Invalid request.' });
          if (!invalidLimiter.hit(socket.id)) { child.warn('too many invalid payloads; disconnecting'); socket.disconnect(true); }
          return;
        }
        try {
          ack(await handler(parsed.data as z.output<typeof C2S[K]>));
        } catch (error) {
          child.error({ err: error, event: name }, 'handler failed');
          ack({ ok: false, code: 'SERVER_ERROR', message: 'Something went wrong on the table.' });
        }
      });
    };

    const simple = (outcome: Outcome): Ack<Empty> => runtime.ack(outcome, () => ({}));

    bind('room:sync', async () => { runtime.sendState(playerId, socket); return { ok: true }; });
    bind('room:setAvatar', async ({ avatarId }) => simple(await runtime.enqueue({ type: 'set-avatar', playerId, avatarId })));
    bind('room:move', async ({ seat }) => simple(await runtime.enqueue({ type: 'move', playerId, seat })));
    bind('room:setBot', async ({ seat, bot }) => simple(await runtime.enqueue({ type: 'set-bot', playerId, seat, bot })));
    bind('room:fillBots', async () => simple(await runtime.enqueue({ type: 'fill-bots', playerId })));
    bind('room:start', async () => simple(await runtime.enqueue({ type: 'start', playerId })));
    bind('room:rematch', async () => simple(await runtime.enqueue({ type: 'rematch', playerId })));
    bind('room:leave', async () => {
      const outcome = await runtime.enqueue({ type: 'leave', playerId });
      setImmediate(() => socket.disconnect(true));
      return simple(outcome);
    });
    bind('game:confirmLeader', async ({ leader, expectedRevision }) => {
      const outcome = await runtime.enqueue({ type: 'confirm-leader', playerId, leader, expectedRevision });
      return runtime.ack(outcome, () => revisionOf(outcome));
    });
    bind('game:play', async ({ cards, expectedRevision, actionId }) => {
      const outcome = await runtime.enqueue({ type: 'play', playerId, cards, expectedRevision }, `${playerId}:${actionId}`);
      return runtime.ack(outcome, () => revisionOf(outcome));
    });
    bind('game:pickup', async ({ expectedRevision, actionId }) => {
      const outcome = await runtime.enqueue({ type: 'pickup', playerId, expectedRevision }, `${playerId}:${actionId}`);
      return runtime.ack(outcome, () => revisionOf(outcome));
    });
    bind('game:continue', async ({ expectedRevision }) => {
      const outcome = await runtime.enqueue({ type: 'continue', playerId, expectedRevision });
      return runtime.ack(outcome, () => revisionOf(outcome));
    });
    bind('game:signal', async ({ size, enabled, expectedRevision }) => {
      const outcome = await runtime.enqueue({ type: 'signal', playerId, size, enabled, expectedRevision });
      return runtime.ack(outcome, () => revisionOf(outcome));
    });
    bind('voice:token', async () => {
      if (!config.livekit) return { ok: false, code: 'VOICE_UNAVAILABLE', message: 'Voice is not configured on this server.' };
      const snapshot = runtime.current();
      const player = snapshot.players[playerId];
      if (!player || snapshot.seats[player.seat]?.kind !== 'human') return { ok: false, code: 'NOT_SEATED', message: 'Take a seat before joining voice.' };
      const token = await mintVoiceToken(config.livekit, runtime.code, { id: player.id, name: player.name });
      return { ok: true, ...token };
    });

    socket.on('disconnect', reason => {
      child.debug({ reason }, 'socket disconnected');
      void runtime.detach(playerId, socket);
    });

    void runtime.attach(playerId, socket).then(outcome => {
      if (!outcome.ok) { socket.emit('room:closed', { reason: 'evicted' }); socket.disconnect(true); }
    });
  });
}

export type { IoSocket, RoomRuntime };
