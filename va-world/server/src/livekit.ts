import { AccessToken } from "livekit-server-sdk";
import { config } from "./env";

/** The single world-wide LiveKit room used for proximity A/V (Phase 3). */
export const WORLD_ROOM = "world";

/**
 * Mint a LiveKit access token for one participant. The participant identity is
 * the caller's Colyseus sessionId, so a LiveKit participant maps 1:1 to a synced
 * player position. Returns null when LiveKit isn't configured (media disabled).
 */
export async function mintToken(identity: string, name: string): Promise<string | null> {
  if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) {
    return null;
  }

  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    name,
  });
  token.addGrant({
    roomJoin: true,
    room: WORLD_ROOM,
    canPublish: true,
    canSubscribe: true,
  });
  return token.toJwt();
}
