import { createHmac, timingSafeEqual } from 'node:crypto';

/** Claims embedded in a guest session token. Rooms are short-lived, so there is no expiry beyond the room's life. */
export interface SessionClaims {
  readonly roomId: string;
  readonly playerId: string;
  readonly iat: number;
}

const VERSION = 'v1';

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(`${VERSION}.${payload}`).digest('base64url');
}

export function signSession(secret: string, claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify({ r: claims.roomId, p: claims.playerId, iat: claims.iat }), 'utf8').toString('base64url');
  return `${VERSION}.${payload}.${sign(secret, payload)}`;
}

/** Returns the claims for a well-formed, correctly signed token, otherwise null. Never throws. */
export function verifySession(secret: string, token: unknown): SessionClaims | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(secret, payload), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!decoded || typeof decoded !== 'object') return null;
  const { r, p, iat } = decoded as Record<string, unknown>;
  if (typeof r !== 'string' || typeof p !== 'string' || typeof iat !== 'number' || !Number.isFinite(iat)) return null;
  return { roomId: r, playerId: p, iat };
}
