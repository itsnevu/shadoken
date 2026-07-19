// ============================================================================
// Shadoken — multiplayer client (Colyseus 0.16).
//
// Implements NetHandle from ../types.ts. Client-authoritative RELAY: the game
// pushes local transforms via sendInput(); the server fans everyone's Player
// state back out, which we rebuild into PlayerSnapshot[] and hand to the game.
//
// Resilience contract (see main.ts):
//   - join() REJECTS on failure so the shell can fall back to solo mode.
//   - nothing else here ever throws uncaught; sends are wrapped in try/catch.
// ============================================================================

import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { MULTIPLAYER } from '../config';
import type {
  NetHandle,
  PlayerSnapshot,
  PlayerInputMessage,
  WalletSession,
  NinjaState,
} from '../types';

type NetStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const VALID_STATES: ReadonlySet<string> = new Set<NinjaState>([
  'idle',
  'run',
  'jump',
  'fall',
  'swim',
  'dead',
]);

// Minimal structural view of a server Player. We read fields defensively rather
// than importing the server schema class (subsystems stay decoupled).
interface RemotePlayerLike {
  sessionId?: string;
  name?: string;
  wallet?: string;
  x?: number;
  y?: number;
  angle?: number;
  vx?: number;
  vy?: number;
  facing?: number;
  state?: string;
  score?: number;
  alive?: boolean;
  skin?: number;
}

/** MapSchema callback surface exposed by getStateCallbacks at runtime. */
interface CollectionCallbackLike {
  onAdd(cb: (item: RemotePlayerLike, key: string) => void, immediate?: boolean): () => void;
  onRemove(cb: (item: RemotePlayerLike, key: string) => void): () => void;
  onChange(cb: (item: RemotePlayerLike, key: string) => void): () => void;
}

interface ArenaStateLike {
  seed?: number;
  players?: {
    forEach(cb: (value: RemotePlayerLike, key: string) => void): void;
  };
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toSnapshot(sessionId: string, p: RemotePlayerLike): PlayerSnapshot {
  const rawState = typeof p.state === 'string' && VALID_STATES.has(p.state) ? p.state : 'idle';
  return {
    sessionId,
    name: typeof p.name === 'string' && p.name.length > 0 ? p.name : 'Guest',
    wallet: typeof p.wallet === 'string' ? p.wallet : '',
    x: num(p.x),
    y: num(p.y),
    angle: num(p.angle),
    vx: num(p.vx),
    vy: num(p.vy),
    facing: p.facing === -1 ? -1 : 1,
    state: rawState as NinjaState,
    score: num(p.score),
    alive: p.alive !== false,
    skin: num(p.skin) | 0,
  };
}

class NetClient implements NetHandle {
  private room: Room | null = null;

  private _connected = false;
  private _sessionId: string | null = null;
  private _seed = 0;

  private playersCb: ((players: PlayerSnapshot[]) => void) | null = null;
  private seedCb: ((seed: number) => void) | null = null;
  private statusCb: ((status: NetStatus) => void) | null = null;

  // Snapshot throttle (~20 Hz).
  private lastEmit = 0;
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private static readonly INTERVAL_MS = 50;

  get connected(): boolean {
    return this._connected;
  }
  get sessionId(): string | null {
    return this._sessionId;
  }
  get seed(): number {
    return this._seed;
  }

  onPlayers(cb: (players: PlayerSnapshot[]) => void): void {
    this.playersCb = cb;
  }
  onSeed(cb: (seed: number) => void): void {
    this.seedCb = cb;
    if (this._seed) cb(this._seed);
  }
  onStatus(cb: (status: NetStatus) => void): void {
    this.statusCb = cb;
  }

  private setStatus(status: NetStatus): void {
    try {
      this.statusCb?.(status);
    } catch (err) {
      console.error('[net] status callback threw', err);
    }
  }

  private setSeed(seed: number): void {
    if (!Number.isFinite(seed) || seed === this._seed) return;
    this._seed = seed;
    try {
      this.seedCb?.(seed);
    } catch (err) {
      console.error('[net] seed callback threw', err);
    }
  }

  async join(session: WalletSession | null, skin = 0): Promise<void> {
    this.setStatus('connecting');
    try {
      const client = new Client(MULTIPLAYER.url);

      const room = await client.joinOrCreate(MULTIPLAYER.roomName, {
        wallet: session?.address ?? '',
        name: session?.shortAddress ?? 'Guest',
        skin,
      });

      this.room = room;
      this._sessionId = room.sessionId;
      this._connected = true;

      // Seed may or may not be synced yet — read now and again on first state.
      const state = room.state as ArenaStateLike;
      if (typeof state?.seed === 'number' && state.seed !== 0) {
        this.setSeed(state.seed);
      }
      room.onStateChange.once((s) => {
        const st = s as ArenaStateLike;
        if (typeof st?.seed === 'number') this.setSeed(st.seed);
        this.scheduleEmit();
      });

      room.onMessage('sabotage', (data: { type: string }) => {
        bus.emit('game:recv-sabotage', data.type);
      });

      this.subscribePlayers(room);

      room.onLeave(() => {
        this._connected = false;
        this.setStatus('disconnected');
      });
      room.onError((code, message) => {
        console.warn('[net] room error', code, message);
        this._connected = false;
        this.setStatus('error');
      });

      this.setStatus('connected');
    } catch (err) {
      this._connected = false;
      this.room = null;
      this.setStatus('error');
      // Reject so the shell can fall back to solo.
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Subscribe to player collection changes. Uses getStateCallbacks (the 0.16
   * way) for granular add/remove/change, and ALSO rebuilds on every full
   * onStateChange so the snapshot list stays correct even if a callback path
   * misfires.
   */
  private subscribePlayers(room: Room): void {
    try {
      const $ = getStateCallbacks(room);
      const state = room.state as ArenaStateLike;
      // The proxy's static type collapses our structural state to a scalar
      // callback; the runtime object is a MapSchema callback proxy, so cast.
      const proxy = $(room.state) as unknown as { players?: CollectionCallbackLike };
      const players = proxy.players;
      if (players && state.players) {
        players.onAdd(() => this.scheduleEmit());
        players.onRemove(() => this.scheduleEmit());
        players.onChange(() => this.scheduleEmit());
      }
    } catch (err) {
      // Non-fatal: onStateChange below is the resilient fallback.
      console.warn('[net] getStateCallbacks unavailable, using onStateChange', err);
    }

    room.onStateChange(() => this.scheduleEmit());
  }

  /** Throttle snapshot rebuilds to ~20 Hz. */
  private scheduleEmit(): void {
    if (!this.playersCb || !this.room) return;
    const now = Date.now();
    const since = now - this.lastEmit;
    if (since >= NetClient.INTERVAL_MS) {
      this.emitPlayers();
      return;
    }
    if (this.pending) return;
    this.pending = true;
    this.timer = setTimeout(() => {
      this.pending = false;
      this.timer = null;
      this.emitPlayers();
    }, NetClient.INTERVAL_MS - since);
  }

  private emitPlayers(): void {
    this.lastEmit = Date.now();
    const room = this.room;
    const cb = this.playersCb;
    if (!room || !cb) return;

    const state = room.state as ArenaStateLike;
    const players = state?.players;
    if (!players || typeof players.forEach !== 'function') return;

    const snapshots: PlayerSnapshot[] = [];
    players.forEach((p, key) => {
      const id = typeof p.sessionId === 'string' && p.sessionId.length > 0 ? p.sessionId : key;
      snapshots.push(toSnapshot(id, p));
    });

    try {
      cb(snapshots);
    } catch (err) {
      console.error('[net] players callback threw', err);
    }
  }

  sendInput(msg: PlayerInputMessage): void {
    if (!this._connected || !this.room) return;
    try {
      this.room.send('input', msg);
    } catch (err) {
      console.warn('[net] sendInput failed', err);
    }
  }

  leave(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = false;
    this._connected = false;
    const room = this.room;
    this.room = null;
    if (room) {
      try {
        void room.leave();
      } catch (err) {
        console.warn('[net] leave failed', err);
      }
    }
  }
}

/** Factory used by the shell (main.ts). */
export function createNetClient(): NetHandle {
  return new NetClient();
}
