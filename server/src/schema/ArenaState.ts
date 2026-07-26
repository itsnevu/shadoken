// ============================================================================
// Shadoken — Colyseus schema (v3) for the shared arena state.
//
// The multiplayer model is client-authoritative RELAY: each client simulates
// its own ninja and streams its transform to the server, which fans it out to
// everyone else. The server owns only the shared world `seed`, the room
// `startedAt` timestamp and the map of connected players.
//
// Field layout MUST mirror `web/src/types.ts` PlayerSnapshot so the client can
// map a Player 1:1 into a snapshot.
// ============================================================================

import { Schema, MapSchema, type } from '@colyseus/schema';

/** One connected ninja's networked transform + status. */
export class Player extends Schema {
  @type('string') sessionId = '';
  @type('string') name = 'Guest';
  @type('string') wallet = '';

  @type('number') x = 0;
  @type('number') y = 0;
  /** Body angle in degrees (0 / 90 / 180 / 270). */
  @type('number') angle = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  /** Horizontal facing: 1 (right) or -1 (left). */
  @type('number') facing = 1;

  /** Ninja logic state — 'idle' | 'run' | 'jump' | 'fall' | 'swim' | 'dead'. */
  @type('string') state = 'idle';
  @type('number') score = 0;
  @type('number') chambers = 0;
  @type('boolean') alive = true;
  /** Cosmetic skin index. */
  @type('number') skin = 0;
}

/** Root room state shared by every client in an arena. */
export class ArenaState extends Schema {
  /** Deterministic world seed — every player in the room shares it. */
  @type('number') seed = 0;
  /** Unix ms when the room was created. */
  @type('number') startedAt = 0;

  @type({ map: Player }) players = new MapSchema<Player>();
}
