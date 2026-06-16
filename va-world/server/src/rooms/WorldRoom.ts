import { Room, type Client } from "@colyseus/core";

/**
 * Phase 0 stub. The shared world room: for now it only logs lifecycle events so
 * the dev loop is provable. Phase 2 adds authoritative position state, syncs
 * avatars, and binds each session to a real VA via the management app's
 * /api/external/va-profile bridge.
 */
export class WorldRoom extends Room {
  onCreate(): void {
    this.autoDispose = false;
    console.log(`[WorldRoom] created (roomId=${this.roomId})`);
  }

  onJoin(client: Client): void {
    console.log(`[WorldRoom] join ${client.sessionId}`);
  }

  onLeave(client: Client): void {
    console.log(`[WorldRoom] leave ${client.sessionId}`);
  }

  onDispose(): void {
    console.log(`[WorldRoom] disposed (roomId=${this.roomId})`);
  }
}
