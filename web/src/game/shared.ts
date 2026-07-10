// Shared in-game channels passed through the Phaser registry.
//   - VirtualInput : written by HudScene (touch controls), read by PlayScene.
//   - NetBridge    : set by index.ts (launchGame); PlayScene pushes local
//                    snapshots out and reads remote players in.
//   - HudData      : written by PlayScene each frame, read by HudScene.

import type { PlayerInputMessage, PlayerSnapshot } from '../types';

export interface VirtualInput {
  left: boolean;
  right: boolean;
  /** Edge-triggered: Hud sets true, PlayScene consumes and clears. */
  jump: boolean;
  /** Edge-triggered: Hud sets true, PlayScene consumes and clears. */
  rotate: boolean;
}

export interface NetBridge {
  emit: ((s: PlayerInputMessage) => void) | null;
  remote: PlayerSnapshot[];
  multiplayer: boolean;
}

export interface HudData {
  score: number;
  alive: number;
  total: number;
  chambers: number;
  best: number;
  players: number;
  over: boolean;
}

export const REG = {
  launchOptions: 'launchOptions',
  netBridge: 'netBridge',
  input: 'input',
  hud: 'hud',
} as const;
