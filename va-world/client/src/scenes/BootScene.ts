import Phaser from "phaser";
import { createPlaceholderTextures } from "../world/textures";

/** Builds placeholder textures, then hands off to the world. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    createPlaceholderTextures(this);
    this.scene.start("WorldScene");
  }
}
