import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = await createApp(config);
const { port, host } = await app.listen();
app.log.info({ port, host, origin: config.publicOrigin, voice: config.livekit !== null, db: config.databaseUrl ? 'postgres' : 'memory' }, 'eight-gar server listening');

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  const timeout = setTimeout(() => { app.log.error('shutdown timed out'); process.exit(1); }, 10_000);
  timeout.unref();
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'shutdown failed');
    process.exit(1);
  }
}
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('unhandledRejection', reason => { app.log.error({ err: reason }, 'unhandled rejection'); });
