// ============================================================================
// Shadoken — server-side run registry.
//
// The arena is a client-authoritative relay, so a claim can never be signed
// from numbers the client POSTs at claim time. Instead the room finalizes a run
// from the state IT observed and files a single-use ticket here. The claim
// endpoint may only sign what this registry holds.
//
// Tickets live in memory: they expire, they are single-use, and a server
// restart simply invalidates outstanding claims (the player replays a run).
// ============================================================================

import { randomBytes } from 'crypto';

export interface RunTicket {
  runId: string;
  /** Lowercased wallet the player joined with — the only address allowed to claim. */
  wallet: string;
  name: string;
  score: number;
  chambers: number;
  survivedMs: number;
  seed: number;
  roomId: string;
  sessionId: string;
  createdAt: number;
  used: boolean;
}

export interface RunFinalization {
  wallet: string;
  name: string;
  score: number;
  chambers: number;
  survivedMs: number;
  seed: number;
  roomId: string;
  sessionId: string;
}

/** How long a filed run stays claimable. */
const TICKET_TTL_MS = 30 * 60 * 1000;
/** Hard cap on retained tickets — oldest are evicted first. */
const MAX_TICKETS = 2_000;

// Plausibility ceilings for a relayed run. Anything above these is a client
// feeding the relay fabricated numbers, so no ticket is filed at all.
const MAX_SCORE_PER_SECOND = 400;
const MAX_CHAMBERS_PER_MINUTE = 30;
const MIN_RUN_MS = 3_000;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

const tickets = new Map<string, RunTicket>();

function prune(now: number): void {
  for (const [runId, ticket] of tickets) {
    if (ticket.used || now - ticket.createdAt > TICKET_TTL_MS) tickets.delete(runId);
  }
  while (tickets.size > MAX_TICKETS) {
    const oldest = tickets.keys().next();
    if (oldest.done) break;
    tickets.delete(oldest.value);
  }
}

/**
 * True when a relayed run is physically achievable. Guards the claim path
 * against a client that simply relays an absurd score before disconnecting.
 */
export function isPlausibleRun(score: number, chambers: number, survivedMs: number): boolean {
  if (survivedMs < MIN_RUN_MS) return false;
  const seconds = survivedMs / 1000;
  if (score > seconds * MAX_SCORE_PER_SECOND) return false;
  // The +3 slack covers a fast opening streak before the sustained rate applies.
  if (chambers > (seconds / 60) * MAX_CHAMBERS_PER_MINUTE + 3) return false;
  return true;
}

/**
 * File a finished run. Returns the ticket the room hands to that one client, or
 * null when the run is unclaimable (no wallet, or implausible numbers).
 */
export function fileRun(run: RunFinalization): RunTicket | null {
  const wallet = run.wallet.trim().toLowerCase();
  if (!EVM_ADDRESS.test(wallet)) return null;
  if (run.score <= 0) return null;
  if (!isPlausibleRun(run.score, run.chambers, run.survivedMs)) {
    console.warn(
      `[runs] implausible run rejected sessionId=${run.sessionId} score=${run.score} chambers=${run.chambers} ms=${run.survivedMs}`,
    );
    return null;
  }

  const now = Date.now();
  prune(now);

  const ticket: RunTicket = {
    runId: `0x${randomBytes(32).toString('hex')}`,
    wallet,
    name: run.name,
    score: Math.floor(run.score),
    chambers: Math.floor(run.chambers),
    survivedMs: Math.floor(run.survivedMs),
    seed: Math.floor(run.seed),
    roomId: run.roomId,
    sessionId: run.sessionId,
    createdAt: now,
    used: false,
  };
  tickets.set(ticket.runId, ticket);
  return ticket;
}

/** The exact text a player signs with their wallet to prove they own the run. */
export function claimStatement(runId: string, wallet: string): string {
  return [
    'Shadoken run claim',
    'Sign to prove this wallet owns the finished run. No gas, no transaction.',
    `run: ${runId}`,
    `wallet: ${wallet.toLowerCase()}`,
  ].join('\n');
}

/** Look up a ticket without spending it. */
export function peekRunTicket(runId: string): RunTicket | null {
  const ticket = tickets.get(runId);
  if (!ticket || ticket.used) return null;
  if (Date.now() - ticket.createdAt > TICKET_TTL_MS) {
    tickets.delete(runId);
    return null;
  }
  return ticket;
}

/**
 * Spend a ticket for `wallet`. Throws with a player-facing reason when the run
 * is unknown, expired, already claimed, or belongs to another wallet.
 */
export function consumeRunTicket(runId: string, wallet: string): RunTicket {
  const ticket = peekRunTicket(runId);
  if (!ticket) throw new Error('Run is unknown, expired or already claimed');
  if (ticket.wallet !== wallet.toLowerCase()) throw new Error('Run belongs to a different wallet');
  ticket.used = true;
  tickets.delete(runId);
  return ticket;
}

/** Test/ops helper — number of live claimable runs. */
export function pendingRunCount(): number {
  prune(Date.now());
  return tickets.size;
}
