import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  HOST: z.string().min(1).default('127.0.0.1'),
  PUBLIC_ORIGIN: z.url(),
  LIVEKIT_URL: z.string().min(1).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  DATABASE_URL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TURN_SECONDS: z.coerce.number().positive().default(180),
  LEADER_SECONDS: z.coerce.number().positive().default(180),
  ROUND_REVIEW_SECONDS: z.coerce.number().nonnegative().default(10),
  ROUND_OVER_SECONDS: z.coerce.number().positive().default(60),
  BOT_DELAY_MS: z.coerce.number().nonnegative().default(1500),
  BOT_TAKEOVER_SECONDS: z.coerce.number().positive().default(180),
  STATIC_DIR: z.string().min(1).default(path.resolve(here, '../../sites/eight-gar/dist')),
  ENGINE_DIST_DIR: z.string().min(1).default(path.resolve(here, '../../dist')),
  GIT_SHA: z.string().min(1).default('dev'),
  TRUST_PROXY: z.string().min(1).default('loopback'),
});

export interface Timing {
  readonly turnMs: number;
  readonly leaderMs: number;
  readonly roundReviewMs: number;
  readonly roundOverMs: number;
  readonly botDelayMs: number;
  readonly botTakeoverMs: number;
}

export interface LiveKitConfig {
  readonly url: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

export interface Config {
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly port: number;
  readonly host: string;
  readonly publicOrigin: string;
  readonly sessionSecret: string;
  readonly databaseUrl: string | null;
  readonly logLevel: z.infer<typeof Env>['LOG_LEVEL'];
  readonly livekit: LiveKitConfig | null;
  readonly timing: Timing;
  readonly staticDir: string;
  readonly engineDistDir: string;
  readonly gitSha: string;
  readonly trustProxy: string | boolean | number;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Parses process.env (or a test substitute) into a validated Config. Throws ConfigError on bad input. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    throw new ConfigError(`Invalid environment: ${issues}`);
  }
  const e = parsed.data;
  const livekitKeys = [e.LIVEKIT_URL, e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET];
  const configuredCount = livekitKeys.filter(Boolean).length;
  if (configuredCount !== 0 && configuredCount !== 3) {
    throw new ConfigError('LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set together');
  }
  const trustProxy: string | boolean | number = e.TRUST_PROXY === 'true' ? true
    : e.TRUST_PROXY === 'false' ? false
    : /^\d+$/.test(e.TRUST_PROXY) ? Number(e.TRUST_PROXY) : e.TRUST_PROXY;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    publicOrigin: new URL(e.PUBLIC_ORIGIN).origin,
    sessionSecret: e.SESSION_SECRET,
    databaseUrl: e.DATABASE_URL ?? null,
    logLevel: e.LOG_LEVEL,
    livekit: e.LIVEKIT_URL && e.LIVEKIT_API_KEY && e.LIVEKIT_API_SECRET
      ? { url: e.LIVEKIT_URL, apiKey: e.LIVEKIT_API_KEY, apiSecret: e.LIVEKIT_API_SECRET } : null,
    timing: {
      turnMs: e.TURN_SECONDS * 1000,
      leaderMs: e.LEADER_SECONDS * 1000,
      roundReviewMs: e.ROUND_REVIEW_SECONDS * 1000,
      roundOverMs: e.ROUND_OVER_SECONDS * 1000,
      botDelayMs: e.BOT_DELAY_MS,
      botTakeoverMs: e.BOT_TAKEOVER_SECONDS * 1000,
    },
    staticDir: e.STATIC_DIR,
    engineDistDir: e.ENGINE_DIST_DIR,
    gitSha: e.GIT_SHA,
    trustProxy,
  };
}
