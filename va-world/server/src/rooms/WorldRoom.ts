import type { IncomingMessage } from "node:http";
import { Room, type Client } from "@colyseus/core";
import { config } from "../env";
import { guestNameFromEmail, resolveEmail } from "../identity";
import { mintToken } from "../livekit";
import { fetchVaProfile } from "../manager";
import { Player, WorldState } from "../state/WorldState";

// Spawn near the top-left room (matches the client's open-floor area).
const SPAWN = { x: 120, y: 72 };
const WORLD_BOUNDS = { width: 24 * 48, height: 18 * 48 };

type JoinOptions = { email?: string };

/** Identity resolved during onAuth and consumed in onJoin. */
type Identity = {
  name: string;
  tier: string;
  status: string;
  vaId: string;
  profileUrl: string;
  isGuest: boolean;
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export class WorldRoom extends Room<WorldState> {
  onCreate(): void {
    this.autoDispose = false;
    this.setState(new WorldState());

    this.onMessage("move", (client, message: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof message?.x !== "number" || typeof message?.y !== "number") return;
      player.x = clamp(message.x, 0, WORLD_BOUNDS.width);
      player.y = clamp(message.y, 0, WORLD_BOUNDS.height);
    });

    console.log(`[WorldRoom] created (roomId=${this.roomId})`);
  }

  // Resolve the connecting user's VA identity from the Cloudflare Access email
  // (or a dev fallback), via the manager bridge. Unresolved → guest identity.
  async onAuth(_client: Client, options: JoinOptions, request?: IncomingMessage): Promise<Identity> {
    const email = resolveEmail({
      cfHeader: request?.headers["cf-access-authenticated-user-email"] ?? null,
      optionEmail: options?.email,
      fallbackEmail: config.devFallbackEmail,
    });

    const profile = email ? await fetchVaProfile(email) : null;
    if (profile) {
      return {
        name: profile.name,
        tier: profile.tier,
        status: profile.status,
        vaId: profile.vaId,
        profileUrl: profile.notionProfileUrl ?? "",
        isGuest: false,
      };
    }

    return {
      name: guestNameFromEmail(email),
      tier: "GUEST",
      status: "",
      vaId: "",
      profileUrl: "",
      isGuest: true,
    };
  }

  async onJoin(client: Client): Promise<void> {
    const identity = client.auth as Identity;
    const player = new Player();
    player.x = SPAWN.x;
    player.y = SPAWN.y;
    player.name = identity.name;
    player.tier = identity.tier;
    player.status = identity.status;
    player.vaId = identity.vaId;
    player.profileUrl = identity.profileUrl;
    player.isGuest = identity.isGuest;
    this.state.players.set(client.sessionId, player);
    console.log(`[WorldRoom] join ${client.sessionId} as ${player.name} (${player.tier})`);

    // Hand the client a LiveKit token (identity = sessionId) so proximity A/V
    // participants map 1:1 to synced positions. Skipped if LiveKit is unset.
    const token = await mintToken(client.sessionId, identity.name);
    if (token) {
      client.send("media", { url: config.livekitUrl, token });
    }
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    console.log(`[WorldRoom] leave ${client.sessionId}`);
  }

  onDispose(): void {
    console.log(`[WorldRoom] disposed (roomId=${this.roomId})`);
  }
}
