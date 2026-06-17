import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  MAP,
  SPAWN,
  TILE_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../world/tilemap";
import { TEX } from "../world/textures";
import { ZONE_OVERLAYS, rectPx } from "../world/zones";
import { joinWorld } from "../net/room";
import { connectMedia, updateProximity, type MediaMessage } from "../media/livekitClient";

const PLAYER_SPEED = 220;
const SEND_INTERVAL_MS = 100;
const PROXIMITY_INTERVAL_MS = 200;
const REMOTE_LERP = 0.2;

/** Shape of a player entry in the synced room state (see server WorldState). */
type NetPlayer = {
  x: number;
  y: number;
  name: string;
  tier: string;
  isGuest: boolean;
  profileUrl: string;
};

/** A MapSchema as exposed by colyseus.js — only the bits we use. */
type PlayerMap = {
  onAdd(cb: (player: NetPlayer, key: string) => void): void;
  onRemove(cb: (player: NetPlayer, key: string) => void): void;
};

type Remote = {
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  state: NetPlayer;
};

function prettyTier(tier: string): string {
  if (!tier || tier === "GUEST") return "guest";
  return tier.replace(/_/g, " ").toLowerCase();
}

/**
 * Phase 2: networked world. Local movement stays client-predicted (Arcade
 * physics + wall collision); position is sent to the Colyseus server on a
 * throttle. Remote players are rendered from synced state and interpolated.
 * Every avatar carries a floating name + tier label bound to its real VA.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  private room?: Room;
  private mySessionId?: string;
  private localLabel?: Phaser.GameObjects.Text;
  private readonly remotes = new Map<string, Remote>();
  private lastSent = 0;
  private lastProximity = 0;

  constructor() {
    super("WorldScene");
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#0f1115");

    const walls = this.physics.add.staticGroup();
    for (let row = 0; row < MAP.length; row++) {
      for (let col = 0; col < MAP[row].length; col++) {
        const x = col * TILE_SIZE + TILE_SIZE / 2;
        const y = row * TILE_SIZE + TILE_SIZE / 2;
        if (MAP[row][col] === "wall") {
          walls.create(x, y, TEX.wall);
        } else {
          this.add.image(x, y, TEX.floor);
        }
      }
    }

    // Translucent zone overlays + labels (meeting room, stage) under avatars.
    for (const overlay of ZONE_OVERLAYS) {
      const r = rectPx(overlay.rect);
      this.add.rectangle(r.x, r.y, r.w, r.h, overlay.color, 0.12).setOrigin(0, 0).setDepth(1);
      this.add
        .text(r.x + 6, r.y + 4, overlay.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "13px",
          color: "#e6f1ff",
        })
        .setDepth(2);
    }

    this.player = this.physics.add.image(SPAWN.x, SPAWN.y, TEX.player);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, walls);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input is unavailable.");
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.connect();

    // Clean up the socket if the scene is torn down.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.room?.leave());
  }

  private connect(): void {
    joinWorld()
      .then((room) => {
        this.room = room;
        this.mySessionId = room.sessionId;
        const players = (room.state as { players: PlayerMap }).players;

        players.onAdd((player, sessionId) => {
          if (sessionId === this.mySessionId) {
            this.ensureLocalLabel(player);
          } else {
            this.addRemote(sessionId, player);
          }
        });
        players.onRemove((_player, sessionId) => this.removeRemote(sessionId));

        // The server pushes a LiveKit token (room assigned by zone) only when
        // media is configured, and again whenever the player's zone changes.
        room.onMessage("media", (msg: MediaMessage) => {
          connectMedia(msg).catch((err) =>
            console.error("[va-world] media connect failed:", err),
          );
        });
      })
      .catch((err) => console.error("[va-world] failed to join room:", err));
  }

  private makeLabel(player: NetPlayer): Phaser.GameObjects.Text {
    const label = this.add
      .text(player.x, player.y - 30, `${player.name}\n${prettyTier(player.tier)}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: player.isGuest ? "#9aa3b2" : "#e6f1ff",
        align: "center",
        backgroundColor: "rgba(15,17,21,0.6)",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(20);
    return label;
  }

  private ensureLocalLabel(player: NetPlayer): void {
    if (this.localLabel) {
      this.localLabel.setText(`${player.name}\n${prettyTier(player.tier)}`);
      return;
    }
    this.localLabel = this.makeLabel(player);
  }

  private addRemote(sessionId: string, player: NetPlayer): void {
    const sprite = this.add.image(player.x, player.y, TEX.player).setDepth(10);
    sprite.setTint(0x8b5cf6);
    const label = this.makeLabel(player);
    this.remotes.set(sessionId, { sprite, label, state: player });
  }

  private removeRemote(sessionId: string): void {
    const remote = this.remotes.get(sessionId);
    if (!remote) return;
    remote.sprite.destroy();
    remote.label.destroy();
    this.remotes.delete(sessionId);
  }

  update(time: number): void {
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    const velocity = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0),
    );
    if (velocity.lengthSq() > 0) velocity.normalize().scale(PLAYER_SPEED);
    this.player.setVelocity(velocity.x, velocity.y);

    if (this.localLabel) this.localLabel.setPosition(this.player.x, this.player.y - 30);

    // Throttled position upload.
    if (this.room && time - this.lastSent > SEND_INTERVAL_MS) {
      this.lastSent = time;
      this.room.send("move", { x: this.player.x, y: this.player.y });
    }

    // Interpolate remote avatars toward their latest synced position.
    for (const remote of this.remotes.values()) {
      remote.sprite.x = Phaser.Math.Linear(remote.sprite.x, remote.state.x, REMOTE_LERP);
      remote.sprite.y = Phaser.Math.Linear(remote.sprite.y, remote.state.y, REMOTE_LERP);
      remote.label.setPosition(remote.sprite.x, remote.sprite.y - 30);
    }

    // Drive proximity A/V from the synced positions (no-op until media connects).
    if (time - this.lastProximity > PROXIMITY_INTERVAL_MS) {
      this.lastProximity = time;
      const peers = Array.from(this.remotes.entries()).map(([identity, r]) => ({
        identity,
        x: r.state.x,
        y: r.state.y,
      }));
      updateProximity({ x: this.player.x, y: this.player.y }, peers);
    }
  }
}
