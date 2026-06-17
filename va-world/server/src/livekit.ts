import { AccessToken } from "livekit-server-sdk";
import { config } from "./env";

// Re-export the default room name so callers don't hardcode it.
export { WORLD_ROOM } from "../../client/src/world/zones";

/**
 * Mint a LiveKit access token for one participant in a specific room. The
 * participant identity is the caller's Colyseus sessionId, so a LiveKit
 * participant maps 1:1 to a synced player position. `canPublish` is false for
 * stage audience (listen-only). Returns null when LiveKit isn't configured.
 */
export async function mintToken(
  identity: string,
  name: string,
  room: string,
  canPublish: boolean,
): Promise<string | null> {
  if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) {
    return null;
  }

  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    name,
  });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish,
    canSubscribe: true,
  });
  return token.toJwt();
}
