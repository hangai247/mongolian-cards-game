import { AccessToken, TrackSource } from 'livekit-server-sdk';
import type { LiveKitConfig } from '../config.js';
import type { VoiceTokenResult } from '../protocol.js';

export function voiceRoomName(code: string): string {
  return `gar-${code}`;
}

/** Audio-only grant scoped to one table. Tokens are short-lived; the client asks again when LiveKit drops it. */
export async function mintVoiceToken(config: LiveKitConfig, code: string, player: { id: string; name: string }): Promise<VoiceTokenResult> {
  const roomName = voiceRoomName(code);
  const token = new AccessToken(config.apiKey, config.apiSecret, { identity: player.id, name: player.name, ttl: '1h' });
  token.addGrant({
    roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE],
  });
  return { url: config.url, token: await token.toJwt(), roomName, identity: player.id };
}
