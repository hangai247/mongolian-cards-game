import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, extra: Record<string, unknown> = {}): Logger {
  return pino({ level, base: { service: 'eight-gar', ...extra }, timestamp: pino.stdTimeFunctions.isoTime });
}
