import Phaser from "phaser";
import { TILE_SIZE } from "./tilemap";

export const TEX = {
  floor: "tile_floor",
  wall: "tile_wall",
  player: "player",
} as const;

/**
 * Generate all placeholder textures programmatically so the repo carries no
 * binary art during Phase 0–1. Real sprite sheets land in a later phase.
 */
export function createPlaceholderTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Floor tile: dark slate with a subtle grid border.
  g.clear();
  g.fillStyle(0x1b2030, 1);
  g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  g.lineStyle(1, 0x262c40, 1);
  g.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  g.generateTexture(TEX.floor, TILE_SIZE, TILE_SIZE);

  // Wall tile: lighter block with a highlighted edge.
  g.clear();
  g.fillStyle(0x3a4260, 1);
  g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  g.lineStyle(2, 0x4d567f, 1);
  g.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  g.generateTexture(TEX.wall, TILE_SIZE, TILE_SIZE);

  // Player: a rounded teal token, a bit smaller than a tile.
  const size = TILE_SIZE - 12;
  g.clear();
  g.fillStyle(0x2dd4bf, 1);
  g.fillRoundedRect(0, 0, size, size, 8);
  g.lineStyle(2, 0x0f766e, 1);
  g.strokeRoundedRect(1, 1, size - 2, size - 2, 8);
  g.generateTexture(TEX.player, size, size);

  g.destroy();
}
