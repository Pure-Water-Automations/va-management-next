import type { IncomingMessage } from "node:http";
import { Room, type Client } from "@colyseus/core";
import { zoneRoomFor } from "../../../client/src/world/zones";
import { config } from "../env";
import { guestNameFromEmail, resolveEmail } from "../identity";
import { mintToken } from "../livekit";
import { fetchVaProfile } from "../manager";
import { Player, WorldState } from "../state/WorldState";

// Neutral open-floor spawn (center, row 10) — clear of the stage/meeting zones.
const SPAWN = { x: 11 * 48 + 24, y: 10 * 48 + 24 };
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
  /** Current LiveKit assignment signature per session ("room|canPublish"). */
  private readonly currentAssignment = new Map<string, string>();

  onCreate(): void {
    this.autoDispose = false;
    this.setState(new WorldState());

    this.onMessage("move", (client, message: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof message?.x !== "number" || typeof message?.y !== "number") return;
      player.x = clamp(message.x, 0, WORLD_BOUNDS.width);
      player.y = clamp(message.y, 0, WORLD_BOUNDS.height);
      void this.syncZone(client, player);
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
    player.zone = zoneRoomFor(player.x, player.y).room;
    this.state.players.set(client.sessionId, player);
    console.log(`[WorldRoom] join ${client.sessionId} as ${player.name} (${player.tier})`);

    // Assign the initial LiveKit room (no-op if LiveKit is unset).
    await this.syncZone(client, player);
  }

  // Push a fresh LiveKit token whenever the player's room — or publish role
  // within the stage (audience ⇄ podium) — changes.
  private async syncZone(client: Client, player: Player): Promise<void> {
    const assignment = zoneRoomFor(player.x, player.y);
    player.zone = assignment.room;
    const signature = `${assignment.room}|${assignment.canPublish}`;
    if (this.currentAssignment.get(client.sessionId) === signature) return;

    const token = await mintToken(client.sessionId, player.name, assignment.room, assignment.canPublish);
    if (!token) return; // LiveKit not configured.

    this.currentAssignment.set(client.sessionId, signature);
    client.send("media", {
      url: config.livekitUrl,
      token,
      room: assignment.room,
      mode: assignment.mode,
      canPublish: assignment.canPublish,
      label: assignment.label,
    });
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.currentAssignment.delete(client.sessionId);
    console.log(`[WorldRoom] leave ${client.sessionId}`);
  }

  onDispose(): void {
    console.log(`[WorldRoom] disposed (roomId=${this.roomId})`);
  }
}
