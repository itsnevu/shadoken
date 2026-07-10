// ============================================================================
// Phaser game configuration + the single source of tuned gameplay constants.
//
// All CONST.* below are the EXACT serialized values from the original Unity
// build (see GAMEPLAY_SPEC.md). They are expressed in "world units". SCALE
// converts world units -> screen pixels so the game reads well at VIEW size.
// ============================================================================

import Phaser from 'phaser';
import { VIEW } from '../config';

import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { PlayScene } from './scenes/PlayScene';
import { HudScene } from './scenes/HudScene';

// CONST / CEIL_BOT live in a dependency-free module so they initialise before
// the scene imports above (which transitively read CONST at module top level).
// Re-exported here for backwards-compatible `import { CONST } from '../config'`.
export { CONST, CEIL_BOT } from './constants';

const BG_HEX = 0x16191d;

/**
 * Build the Phaser game config. Scenes are registered here; the first one
 * (Boot) auto-starts and chains Preload -> Menu -> Play + Hud.
 */
export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: BG_HEX,
    transparent: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIEW.width,
      height: VIEW.height,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    render: {
      antialias: true,
      pixelArt: false,
      powerPreference: 'high-performance',
    },
    // Enough simultaneous pointers for the left/right pad + jump + rotate.
    input: { activePointers: 4 },
    scene: [BootScene, PreloadScene, MenuScene, PlayScene, HudScene],
  };
}
