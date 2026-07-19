// ============================================================================
// Shadoken — ArenaRoom.
//
// A client-authoritative RELAY room. Clients simulate their own ninja and push
// transform updates via the 'input' message; the room validates lightly and
// stores them on the matching Player so Colyseus fans the state back out. The
// server generates and holds the shared world seed and a simple leaderboard.
// ============================================================================

import { Room, type Client } from '@colyseus/core';
import { ArenaState, Player } from '../schema/ArenaState.js';
import { leaderboardDb } from '../leaderboard-db.js';

/** Ninja logic state — kept in sync with web/src/types.ts NinjaState. */
type NinjaState = 'idle' | 'run' | 'jump' | 'fall' | 'swim' | 'dead';

/** Options the client passes on join. */
interface JoinOptions {
  name?: string;
  wallet?: string;
  skin?: number;
}

/** Shape of the 'input' message (mirrors web PlayerInputMessage). */
interface InputMessage {
  x?: number;
  y?: number;
  angle?: number;
  vx?: number;
  vy?: number;
  facing?: number;
  state?: string;
  score?: number;
  alive?: boolean;
  sabotage?: string;
}

/** One leaderboard row broadcast to clients. */
interface LeaderboardEntry {
  sessionId: string;
  name: string;
  score: number;
  alive: boolean;
}

const VALID_STATES: ReadonlySet<string> = new Set<NinjaState>([
  'idle',
  'run',
  'jump',
  'fall',
  'swim',
  'dead',
]);

// Generous world bounds — the relay only guards against NaN / absurd values,
// simulation authority stays with the client.
const COORD_LIMIT = 1_000_000;

/** Coerce to a finite number within [-limit, limit], falling back to `fallback`. */
function clampFinite(value: unknown, limit: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value > limit) return limit;
  if (value < -limit) return -limit;
  return value;
}

export class ArenaRoom extends Room<ArenaState> {
  maxClients = 16;

  override onCreate(_options: JoinOptions): void {
    const state = new ArenaState();
    state.seed = Math.floor(Math.random() * 2 ** 31);
    state.startedAt = Date.now();
    this.setState(state);

    // ~20 Hz state patches — matches the client's snapshot throttle.
    this.setPatchRate(1000 / 20);

    this.onMessage('input', (client, message: InputMessage) => {
      this.applyInput(client, message);
    });

    // Periodic lightweight leaderboard broadcast (top scores).
    this.clock.setInterval(() => this.broadcastLeaderboard(), 2000);

    console.log(`[arena] room ${this.roomId} created (seed=${state.seed})`);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const p = new Player();
    p.sessionId = client.sessionId;
    p.name = (options?.name ?? '').trim().slice(0, 24) || 'Guest';
    p.wallet = (options?.wallet ?? '').trim().slice(0, 64);
    p.skin = clampFinite(options?.skin, 64, 0) | 0;

    // Spawn defaults — clients overwrite these with their first 'input'.
    p.x = 0;
    p.y = 0;
    p.angle = 0;
    p.vx = 0;
    p.vy = 0;
    p.facing = 1;
    p.state = 'idle';
    p.score = 0;
    p.alive = true;

    this.state.players.set(client.sessionId, p);
    console.log(`[arena] ${p.name} joined ${this.roomId} (${this.clients.length}/${this.maxClients})`);
  }

  override onLeave(client: Client, _consented?: boolean): void {
    this.state.players.delete(client.sessionId);
    console.log(`[arena] ${client.sessionId} left ${this.roomId}`);
  }

  override onDispose(): void {
    console.log(`[arena] room ${this.roomId} disposed`);
  }

  /** Validate + store a client's transform update onto its Player. */
  private applyInput(client: Client, msg: InputMessage): void {
    const p = this.state.players.get(client.sessionId);
    if (!p || msg == null || typeof msg !== 'object') return;

    p.x = clampFinite(msg.x, COORD_LIMIT, p.x);
    p.y = clampFinite(msg.y, COORD_LIMIT, p.y);
    p.angle = clampFinite(msg.angle, 360, p.angle);
    p.vx = clampFinite(msg.vx, COORD_LIMIT, p.vx);
    p.vy = clampFinite(msg.vy, COORD_LIMIT, p.vy);
    p.facing = msg.facing === -1 ? -1 : 1;

    if (typeof msg.state === 'string' && VALID_STATES.has(msg.state)) {
      p.state = msg.state;
    }

    // Score is monotonic — never let a relayed value walk backwards.
    const nextScore = clampFinite(msg.score, COORD_LIMIT, p.score);
    if (nextScore > p.score) {
      p.score = Math.floor(nextScore);
      void leaderboardDb.record(p.name, p.wallet, p.score);
    }

    if (typeof msg.alive === 'boolean') p.alive = msg.alive;

    // Relayed Sabotage Action
    if (typeof msg.sabotage === 'string' && msg.sabotage.length > 0) {
      this.broadcast('sabotage', { senderId: client.sessionId, type: msg.sabotage }, { except: client });
    }
  }

  /** Broadcast a compact top-8 leaderboard to all clients. */
  private broadcastLeaderboard(): void {
    if (this.state.players.size === 0) return;
    const rows: LeaderboardEntry[] = [];
    this.state.players.forEach((p) => {
      rows.push({ sessionId: p.sessionId, name: p.name, score: p.score, alive: p.alive });
    });
    rows.sort((a, b) => b.score - a.score);
    this.broadcast('leaderboard', rows.slice(0, 8));
  }
}
