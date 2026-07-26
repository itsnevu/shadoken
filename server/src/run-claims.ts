// ============================================================================
// Shadoken — EIP-712 run claim signer.
//
// The server only ever signs a run that ArenaRoom filed in the run registry,
// and only for the wallet that proved ownership with a personal_sign over the
// run's claim statement. Numbers in the request body are never trusted.
// ============================================================================

import { Wallet, TypedDataEncoder, getAddress, verifyMessage, type TypedDataField } from 'ethers';
import { claimStatement, consumeRunTicket, peekRunTicket } from './run-registry.js';

export interface RunClaimRequest {
  /** Run id issued by ArenaRoom over the 'run-ticket' message. */
  runId?: string;
  wallet?: string;
  /** personal_sign of `claimStatement(runId, wallet)`. */
  signature?: string;
}

export interface RunClaimPayload {
  player: string;
  seasonId: number;
  runId: string;
  score: number;
  chambers: number;
  survivedMs: number;
  seed: number;
  badgeId: number;
  rewardWei: string;
  deadline: number;
}

export interface RunClaimResponse {
  signer: string;
  payload: RunClaimPayload;
  typedData: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    };
    types: typeof RUN_CLAIM_TYPES;
  };
  digest: string;
  signature: string;
  note: string;
}

const MIN_BADGE_CHAMBERS = 3;
const MIN_REWARD_CHAMBERS = 10;
const SIGNING_ENABLED_VALUE = 'true';
const RUN_CLAIM_TYPES: Record<string, TypedDataField[]> = {
  RunClaim: [
    { name: 'player', type: 'address' },
    { name: 'seasonId', type: 'uint256' },
    { name: 'runId', type: 'bytes32' },
    { name: 'score', type: 'uint256' },
    { name: 'chambers', type: 'uint256' },
    { name: 'survivedMs', type: 'uint256' },
    { name: 'seed', type: 'uint256' },
    { name: 'badgeId', type: 'uint256' },
    { name: 'rewardWei', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function badgeFor(chambers: number, score: number): number {
  if (chambers >= 20) return 4;
  if (chambers >= 10) return 3;
  if (score >= 500) return 2;
  return 1;
}

function rewardFor(chambers: number): bigint {
  if (chambers < MIN_REWARD_CHAMBERS) return 0n;
  const configured = process.env.RUN_REWARD_WEI;
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);
  return 0n;
}

function chainId(): number {
  const n = Number(process.env.ROBINHOODCHAIN_CHAIN_ID);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('ROBINHOODCHAIN_CHAIN_ID is not configured');
  return n;
}

function poolAddress(): string {
  const addr = process.env.ARENA_POOL_ADDRESS;
  if (!addr) throw new Error('ARENA_POOL_ADDRESS is not configured');
  return getAddress(addr);
}

export async function createRunClaim(req: RunClaimRequest): Promise<RunClaimResponse> {
  if (process.env.RUN_CLAIM_SIGNING_ENABLED !== SIGNING_ENABLED_VALUE) {
    throw new Error('RUN_CLAIM_SIGNING_ENABLED must be true before server signs run claims');
  }

  const privateKey = process.env.RUN_CLAIM_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('RUN_CLAIM_SIGNER_PRIVATE_KEY is not configured');
  }

  const player = getAddress(String(req.wallet ?? ''));
  const runId = String(req.runId ?? '');
  const signature = String(req.signature ?? '');
  if (!/^0x[a-fA-F0-9]{64}$/.test(runId)) throw new Error('A valid runId is required');
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) throw new Error('A wallet signature is required');

  // Prove wallet ownership before spending the ticket, so a bad signature does
  // not burn a legitimate run.
  const pending = peekRunTicket(runId);
  if (!pending) throw new Error('Run is unknown, expired or already claimed');

  let recovered: string;
  try {
    recovered = verifyMessage(claimStatement(runId, player), signature);
  } catch {
    throw new Error('Signature could not be verified');
  }
  if (getAddress(recovered) !== player) throw new Error('Signature does not match the wallet');

  const ticket = consumeRunTicket(runId, player);
  const { score, chambers, survivedMs, seed } = ticket;
  if (chambers < MIN_BADGE_CHAMBERS || score <= 0) {
    throw new Error(`Run must clear at least ${MIN_BADGE_CHAMBERS} chambers and score above zero`);
  }

  const wallet = new Wallet(privateKey);
  const domain = {
    name: 'ShadokenArenaPool',
    version: '1',
    chainId: chainId(),
    verifyingContract: poolAddress(),
  };
  const payload: RunClaimPayload = {
    player,
    seasonId: envInt('SEASON_ID', 1),
    runId,
    score,
    chambers,
    survivedMs,
    seed,
    badgeId: badgeFor(chambers, score),
    rewardWei: rewardFor(chambers).toString(),
    deadline: Math.floor(Date.now() / 1000) + envInt('RUN_CLAIM_TTL_SECONDS', 3600),
  };

  const digest = TypedDataEncoder.hash(domain, RUN_CLAIM_TYPES, payload);

  return {
    signer: wallet.address,
    payload,
    typedData: { domain, types: RUN_CLAIM_TYPES },
    digest,
    signature: await wallet.signTypedData(domain, RUN_CLAIM_TYPES, payload),
    note: 'EIP-712 claim signed from server-recorded run state. Contract verifies the signer before minting badges or paying from the RobinhoodChain season pool.',
  };
}
