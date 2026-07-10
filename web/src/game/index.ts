// ============================================================================
// Game module entry — launchGame() creates the Phaser.Game and returns the
// GameHandle bridge that main.ts wires to the multiplayer net layer.
// ============================================================================

import Phaser from 'phaser';
import type { GameHandle, GameLaunchOptions, PlayerInputMessage, PlayerSnapshot } from '../types';
import { createGameConfig } from './config';
import { REG, type NetBridge } from './shared';

export function launchGame(opts: GameLaunchOptions): GameHandle {
  const bridge: NetBridge = {
    emit: null,
    remote: [],
    multiplayer: opts.multiplayer,
  };

  const game = new Phaser.Game(createGameConfig(opts.parent));
  // registry is available synchronously after construction; scenes read it in create().
  game.registry.set(REG.launchOptions, opts);
  game.registry.set(REG.netBridge, bridge);

  return {
    destroy(): void {
      try {
        game.destroy(true);
      } catch {
        /* ignore double-destroy */
      }
    },
    onLocalSnapshot(cb: (s: PlayerInputMessage) => void): void {
      bridge.emit = cb;
    },
    setRemotePlayers(players: PlayerSnapshot[]): void {
      bridge.remote = players;
    },
  };
}
