// ============================================================================
// Shared type contracts for the Shadoken web client.
// These interfaces are the integration boundary between subsystems
// (landing / wallet / game / net). Change with care.
// ============================================================================

import type { WalletNetwork } from './config';

/** Authenticated wallet session, persisted to localStorage. */
export interface WalletSession {
  /** Wallet address used as arena identity. */
  address: string;
  /** Human-friendly truncated form, e.g. "Ab12…Yz90". */
  shortAddress: string;
  network: WalletNetwork;
  walletKind: 'metamask';
  chainId?: string;
  /** Unix ms when the session was established. */
  connectedAt: number;
  /** Signed auth statement proving wallet ownership. */
  signature?: string;
  /** Optional cached native balance in the smallest unit. */
  balanceWei?: string;
}

/** Top-level screen the shell is showing. */
export type AppScreen =
  | 'landing'
  | 'connecting'
  | 'menu'
  | 'matchmaking'
  | 'playing'
  | 'gameover';

/** Ninja animation/logic state (mirrors the Unity Biped state machine). */
export type NinjaState = 'idle' | 'run' | 'jump' | 'fall' | 'swim' | 'dead';

/** Orientation quarter-turns: gravity direction the ninja walks against. */
export type Orientation = 0 | 1 | 2 | 3; // * 90deg

/** A single ninja's networked transform + status. */
export interface PlayerSnapshot {
  sessionId: string;
  /** Display name — short wallet address or chosen alias. */
  name: string;
  wallet: string;
  x: number;
  y: number;
  /** Body angle in degrees (0/90/180/270). */
  angle: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: NinjaState;
  score: number;
  chambers: number;
  alive: boolean;
  skin: number;
}

/** Client → server: local ninja transform update (client-authoritative model). */
export interface PlayerInputMessage {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: NinjaState;
  score: number;
  chambers: number;
  alive: boolean;
  sabotage?: string;
}

/**
 * Server-issued proof that a run happened. Only the numbers the arena room
 * observed are in here — the claim endpoint signs these, never client input.
 */
export interface RunTicket {
  runId: string;
  wallet: string;
  score: number;
  chambers: number;
  survivedMs: number;
  seed: number;
  expiresInMs: number;
}

/** Result emitted when a run ends. */
export interface RunResult {
  score: number;
  chambers: number;
  distance: number;
  survivedMs: number;
  seed: number;
}

/** Options passed when launching the Phaser game. */
export interface GameLaunchOptions {
  parent: HTMLElement;
  session: WalletSession | null;
  /** World seed — all players in a room share the same seed. */
  seed: number;
  multiplayer: boolean;
  skin: number;
  guest?: boolean;
}

/** Public surface of the game module (implemented by src/game). */
export interface GameHandle {
  destroy(): void;
  /** Registered by the net layer so the game can push local transforms out. */
  onLocalSnapshot(cb: (s: PlayerInputMessage) => void): void;
  /** Called by the net layer to feed remote players into the game. */
  setRemotePlayers(players: PlayerSnapshot[]): void;
}

/** Public surface of the multiplayer client (implemented by src/net). */
export interface NetHandle {
  readonly connected: boolean;
  readonly sessionId: string | null;
  readonly seed: number;
  join(session: WalletSession | null, skin?: number): Promise<void>;
  leave(): void;
  /** Tell the server the run finished so it files a claimable run ticket. */
  endRun(): void;
  sendInput(msg: PlayerInputMessage): void;
  onPlayers(cb: (players: PlayerSnapshot[]) => void): void;
  onSeed(cb: (seed: number) => void): void;
  onStatus(cb: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void): void;
}

/** Minimal EIP-1193 provider surface used for MetaMask / RobinhoodChain. */
export interface EthereumProvider {
  isMetaMask?: boolean;
  selectedAddress?: string | null;
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?(event: string, handler: (args: unknown) => void): void;
  removeListener?(event: string, handler: (args: unknown) => void): void;
}
