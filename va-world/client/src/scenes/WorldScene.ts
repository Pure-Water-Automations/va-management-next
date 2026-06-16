import Phaser from "phaser";
import {
  MAP,
  SPAWN,
  TILE_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../world/tilemap";
import { TEX } from "../world/textures";

const PLAYER_SPEED = 220;

/**
 * Phase 1: single-player world. Renders the tile grid, spawns the player on an
 * Arcade body, handles WASD/arrow movement with wall collision, and follows
 * the player with the camera. No networking yet.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

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

    this.player = this.physics.add.image(SPAWN.x, SPAWN.y, TEX.player);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, walls);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error("Keyboard input is unavailable in this environment.");
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  update(): void {
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);

    const velocity = new Phaser.Math.Vector2(vx, vy);
    if (velocity.lengthSq() > 0) {
      velocity.normalize().scale(PLAYER_SPEED);
    }
    this.player.setVelocity(velocity.x, velocity.y);
  }
}
