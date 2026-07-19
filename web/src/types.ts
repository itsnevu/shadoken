// ============================================================================
// Shared type contracts for the Shadoken web client.
// These interfaces are the integration boundary between subsystems
// (landing / wallet / game / net). Change with care.
// ============================================================================

import type { SolanaNetwork } from './config';

/** Authenticated wallet session, persisted to localStorage. */
export interface WalletSession {
  /** base58-encoded Solana public key. */
  address: string;
  /** Human-friendly truncated form, e.g. "Ab12…Yz90". */
  shortAddress: string;
  network: SolanaNetwork;
  /** Unix ms when the session was established. */
  connectedAt: number;
  /** base58 signature of the auth statement (sign-in-with-Solana). */
  signature?: string;
  /** Optional cached SOL balance (lamports) for HUD display. */
  lamports?: number;
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
  alive: boolean;
}

/** Result emitted when a run ends. */
export interface RunResult {
  score: number;
  chambers: number;
  distance: number;
  survivedMs: number;
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
  join(session: WalletSession | null): Promise<void>;
  leave(): void;
  sendInput(msg: PlayerInputMessage): void;
  onPlayers(cb: (players: PlayerSnapshot[]) => void): void;
  onSeed(cb: (seed: number) => void): void;
  onStatus(cb: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void): void;
}

/** Minimal Phantom provider surface we rely on (injected by the wallet). */
export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  isConnected: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: 'utf8' | 'hex'): Promise<{ signature: Uint8Array }>;
  on(event: string, handler: (args: unknown) => void): void;
  removeListener(event: string, handler: (args: unknown) => void): void;
}
