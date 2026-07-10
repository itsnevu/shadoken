import Phaser from 'phaser';
import { VIEW } from '../../config';

/** Minimal boot: lock the scale config, then hand off to Preload. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scale.setGameSize(VIEW.width, VIEW.height);
    this.scene.start('Preload');
  }
}
