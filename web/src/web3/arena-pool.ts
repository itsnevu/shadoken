import { CONTRACTS, MULTIPLAYER } from '../config';
import { appState } from '../app-state';
import { wallet } from '../wallet/wallet';
import type { RunTicket } from '../types';

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
  digest: string;
  signature: string;
  note: string;
}

const RUN_TICKET_KEY = 'shadoken.runTicket.v1';

const SELECTORS = {
  cosmeticPrice: '0x01bb0a9e',
  depositToPool: '0x68b0e070',
  enterTournament: '0xe2a399e5',
  mintCosmetic: '0x4fe661ad',
  claimRun: '0x4d5f2ec5',
  totalPoolBalance: '0x5026d63e',
};

const STORED_CLAIM_KEY = 'shadoken.pendingRunClaim.v1';

function apiBase(): string {
  return CONTRACTS.apiBaseUrl || MULTIPLAYER.url.replace(/^ws/, 'http');
}

function strip0x(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function uint(value: number | string | bigint): string {
  return BigInt(value).toString(16).padStart(64, '0');
}

function address(value: string): string {
  return strip0x(value).toLowerCase().padStart(64, '0');
}

function bytes32(value: string): string {
  const clean = strip0x(value);
  if (clean.length !== 64) throw new Error('Invalid bytes32 value');
  return clean;
}

function bytes(value: string): string {
  const clean = strip0x(value);
  const len = clean.length / 2;
  const padded = clean.padEnd(Math.ceil(clean.length / 64) * 64, '0');
  return `${uint(len)}${padded}`;
}

function encodeClaimRun(claim: RunClaimPayload, signature: string): string {
  const headWords = [
    address(claim.player),
    uint(claim.seasonId),
    bytes32(claim.runId),
    uint(claim.score),
    uint(claim.chambers),
    uint(claim.survivedMs),
    uint(claim.seed),
    uint(claim.badgeId),
    uint(claim.rewardWei),
    uint(claim.deadline),
    uint(11 * 32),
  ];
  return `${SELECTORS.claimRun}${headWords.join('')}${bytes(signature)}`;
}

function encodeUintCall(selector: string, value: number | bigint): string {
  return `${selector}${uint(value)}`;
}

function encodeMintCosmetic(seasonId: number, tokenId: number, amount: number): string {
  return `${SELECTORS.mintCosmetic}${uint(seasonId)}${uint(tokenId)}${uint(amount)}`;
}

async function sendTransaction(data: string, valueWei = '0'): Promise<string> {
  const session = appState.session;
  const provider = wallet.provider();
  if (!session || !provider) throw new Error('Connect MetaMask first.');
  if (!CONTRACTS.arenaPoolAddress) throw new Error('VITE_ARENA_POOL_ADDRESS is not configured.');
  return provider.request<string>({
    method: 'eth_sendTransaction',
    params: [
      {
        from: session.address,
        to: CONTRACTS.arenaPoolAddress,
        data,
        value: `0x${BigInt(valueWei).toString(16)}`,
      },
    ],
  });
}

async function callContract(data: string): Promise<string> {
  const provider = wallet.provider();
  if (!provider) throw new Error('MetaMask provider is not available.');
  if (!CONTRACTS.arenaPoolAddress) throw new Error('VITE_ARENA_POOL_ADDRESS is not configured.');
  return provider.request<string>({
    method: 'eth_call',
    params: [
      {
        to: CONTRACTS.arenaPoolAddress,
        data,
      },
      'latest',
    ],
  });
}

function decodeUint(hex: string): string {
  if (!/^0x[a-fA-F0-9]+$/.test(hex)) throw new Error('Invalid contract response.');
  return BigInt(hex).toString();
}

export function storeRunClaim(claim: RunClaimResponse): void {
  try {
    localStorage.setItem(STORED_CLAIM_KEY, JSON.stringify(claim));
  } catch {
    /* storage unavailable */
  }
}

export function loadRunClaim(): RunClaimResponse | null {
  try {
    const raw = localStorage.getItem(STORED_CLAIM_KEY);
    return raw ? (JSON.parse(raw) as RunClaimResponse) : null;
  } catch {
    return null;
  }
}

export function clearRunClaim(): void {
  try {
    localStorage.removeItem(STORED_CLAIM_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function storeRunTicket(ticket: RunTicket): void {
  try {
    localStorage.setItem(RUN_TICKET_KEY, JSON.stringify(ticket));
  } catch {
    /* storage unavailable */
  }
}

export function loadRunTicket(): RunTicket | null {
  try {
    const raw = localStorage.getItem(RUN_TICKET_KEY);
    return raw ? (JSON.parse(raw) as RunTicket) : null;
  } catch {
    return null;
  }
}

export function clearRunTicket(): void {
  try {
    localStorage.removeItem(RUN_TICKET_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Turn a server-issued run ticket into a signed claim:
 *   1. fetch the exact statement the server expects for this run,
 *   2. sign it with the wallet (proves ownership, costs no gas),
 *   3. the server signs EIP-712 over ITS OWN record of the run.
 * The client never gets to state its own score.
 */
export async function requestRunClaim(ticket: RunTicket): Promise<RunClaimResponse> {
  const session = appState.session;
  const provider = wallet.provider();
  if (!session || !provider) throw new Error('Connect MetaMask first.');
  if (ticket.wallet && ticket.wallet.toLowerCase() !== session.address.toLowerCase()) {
    throw new Error('This run belongs to a different wallet.');
  }

  const challengeUrl = `${apiBase()}/api/run-claim/challenge?runId=${encodeURIComponent(ticket.runId)}&wallet=${encodeURIComponent(session.address)}`;
  const challengeRes = await fetch(challengeUrl);
  const challenge = await challengeRes.json().catch(() => ({}));
  if (!challengeRes.ok || typeof challenge.statement !== 'string') {
    throw new Error(typeof challenge.error === 'string' ? challenge.error : 'Run is no longer claimable.');
  }

  const signature = await provider.request<string>({
    method: 'personal_sign',
    params: [challenge.statement, session.address],
  });

  const res = await fetch(`${apiBase()}/api/run-claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: ticket.runId, wallet: session.address, signature }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Run claim request failed.');
  return body as RunClaimResponse;
}

export async function claimRunOnChain(claim: RunClaimResponse): Promise<string> {
  return sendTransaction(encodeClaimRun(claim.payload, claim.signature));
}

export async function depositPool(valueWei: string): Promise<string> {
  return sendTransaction(encodeUintCall(SELECTORS.depositToPool, CONTRACTS.seasonId), valueWei);
}

export async function enterTournament(seasonId = CONTRACTS.seasonId, entryFeeWei = '0'): Promise<string> {
  return sendTransaction(encodeUintCall(SELECTORS.enterTournament, seasonId), entryFeeWei);
}

export async function getCosmeticPrice(tokenId: number): Promise<string> {
  return decodeUint(await callContract(encodeUintCall(SELECTORS.cosmeticPrice, tokenId)));
}

export async function getTotalPoolBalance(): Promise<string> {
  return decodeUint(await callContract(SELECTORS.totalPoolBalance));
}

export async function mintCosmetic(tokenId: number, amount: number): Promise<string> {
  const priceWei = BigInt(await getCosmeticPrice(tokenId));
  if (priceWei <= 0n) throw new Error('Cosmetic price is not set on-chain.');
  return sendTransaction(
    encodeMintCosmetic(CONTRACTS.seasonId, tokenId, amount),
    (priceWei * BigInt(amount)).toString(),
  );
}

export function isPoolConfigured(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACTS.arenaPoolAddress);
}
