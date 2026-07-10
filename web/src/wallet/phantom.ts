// ============================================================================
// Low-level Phantom (Solana) provider glue.
//   - detection of the injected provider
//   - connect / disconnect
//   - sign-in-with-Solana message signing
//   - best-effort SOL balance fetch
// Higher-level orchestration (sessions, events, UI) lives in ./wallet.ts.
// ============================================================================

import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA } from '../config';
import type { PhantomProvider } from '../types';

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

/** Resolve the injected Phantom provider, if any. */
export function getProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null;
  const fromNamespace = window.phantom?.solana;
  if (fromNamespace && fromNamespace.isPhantom) return fromNamespace;
  const legacy = window.solana;
  if (legacy && legacy.isPhantom) return legacy;
  return null;
}

/** Is a Phantom provider currently injected into the page? */
export function isPhantomInstalled(): boolean {
  return getProvider() !== null;
}

/** Convert raw signature bytes into a lowercase hex string (no deps). */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sign the Shadoken auth statement, proving control of the wallet.
 * Returns the signature as a hex string.
 */
export async function signAuthStatement(provider: PhantomProvider): Promise<string> {
  const encoded = new TextEncoder().encode(SOLANA.authStatement);
  const { signature } = await provider.signMessage(encoded, 'utf8');
  return bytesToHex(signature);
}

/**
 * Best-effort SOL balance (in lamports). Never throws — resolves to null on
 * any RPC/network failure so callers can treat it as purely cosmetic.
 */
export async function fetchLamports(address: string): Promise<number | null> {
  try {
    const connection = new Connection(SOLANA.rpcEndpoint, 'confirmed');
    const lamports = await connection.getBalance(new PublicKey(address));
    return typeof lamports === 'number' ? lamports : null;
  } catch (err) {
    console.warn('[wallet] balance fetch failed', err);
    return null;
  }
}

/** True when the user rejected the request in their wallet (Phantom code 4001). */
export function isUserRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  if (code === 4001 || code === '4001') return true;
  if (typeof message === 'string' && /reject|denied|cancel/i.test(message)) return true;
  return false;
}
