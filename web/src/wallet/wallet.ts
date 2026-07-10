// ============================================================================
// Public wallet API — the single surface main.ts (and the shell) imports.
// Wraps the low-level Phantom provider glue in ./phantom.ts with session
// management, event-bus notifications and the connect-button UI.
// ============================================================================

import { SOLANA } from '../config';
import { bus } from '../events';
import { appState, shortenAddress } from '../app-state';
import type { PhantomProvider, WalletSession } from '../types';
import {
  fetchLamports,
  getProvider,
  isPhantomInstalled,
  isUserRejection,
  signAuthStatement,
} from './phantom';
import { openInstallModal, mountConnectButton } from './wallet-ui';

// Provider-level listeners are registered once; keep references so they can be
// swapped if the provider re-injects (rare, but keeps us leak-free).
let boundProvider: PhantomProvider | null = null;
let handleConnect: ((arg: unknown) => void) | null = null;
let handleDisconnect: ((arg: unknown) => void) | null = null;
let handleAccountChanged: ((arg: unknown) => void) | null = null;

function extractAddress(arg: unknown): string | null {
  if (arg && typeof arg === 'object' && 'toString' in arg) {
    const s = (arg as { toString(): string }).toString();
    if (s && s !== '[object Object]') return s;
  }
  return null;
}

/** Refresh (best-effort, non-blocking) the cached lamports on the live session. */
function hydrateBalance(address: string): void {
  void fetchLamports(address).then((lamports) => {
    if (lamports == null) return;
    const current = appState.session;
    if (!current || current.address !== address) return;
    appState.setSession({ ...current, lamports });
  });
}

function bindProviderListeners(provider: PhantomProvider): void {
  if (boundProvider === provider) return;
  // Detach from a stale provider first.
  if (boundProvider) {
    if (handleConnect) boundProvider.removeListener('connect', handleConnect);
    if (handleDisconnect) boundProvider.removeListener('disconnect', handleDisconnect);
    if (handleAccountChanged) boundProvider.removeListener('accountChanged', handleAccountChanged);
  }

  handleConnect = (arg: unknown) => {
    // Trust an existing signed session; only hydrate the balance here.
    const addr = extractAddress(arg) ?? provider.publicKey?.toString() ?? null;
    if (addr) hydrateBalance(addr);
  };

  handleDisconnect = () => {
    if (appState.session) {
      appState.setSession(null);
      bus.emit('wallet:disconnected', undefined);
    }
  };

  handleAccountChanged = (arg: unknown) => {
    const addr = extractAddress(arg);
    if (!addr) {
      // Phantom passes a falsy value when the user disconnects the account.
      if (appState.session) {
        appState.setSession(null);
        bus.emit('wallet:disconnected', undefined);
      }
      return;
    }
    // Account switched under us — the old signature is no longer valid.
    if (appState.session && appState.session.address !== addr) {
      appState.setSession(null);
      bus.emit('wallet:disconnected', undefined);
      bus.emit('wallet:error', { message: 'Wallet account changed — please reconnect.' });
    }
  };

  provider.on('connect', handleConnect);
  provider.on('disconnect', handleDisconnect);
  provider.on('accountChanged', handleAccountChanged);
  boundProvider = provider;
}

async function eagerReconnect(provider: PhantomProvider): Promise<void> {
  const stored = appState.session;
  if (!stored) return;
  try {
    const { publicKey } = await provider.connect({ onlyIfTrusted: true });
    const address = publicKey.toString();
    if (address === stored.address) {
      // Still trusted & same account — keep the persisted session, refresh HUD.
      appState.setSession({ ...stored, network: SOLANA.network });
      hydrateBalance(address);
    } else {
      // Different account is trusted now — drop the stale session silently.
      appState.setSession(null);
    }
  } catch {
    // Not trusted anymore (or user cleared the connection). Leave the stored
    // session in place — the shell treats it as "connected" for UX, and the
    // next explicit action will re-trigger a full connect if needed.
  }
}

export const wallet = {
  /** Eager reconnect + register provider listeners. Safe to call once at boot. */
  init(): void {
    const provider = getProvider();
    if (!provider) return;
    bindProviderListeners(provider);
    void eagerReconnect(provider);
  },

  /**
   * Full connect flow: detect Phantom, connect, sign the auth statement and
   * establish a persisted session. Resolves to null on any failure or if the
   * user rejects — never throws.
   */
  async connect(): Promise<WalletSession | null> {
    bus.emit('wallet:connecting', undefined);

    const provider = getProvider();
    if (!provider) {
      const modalRoot = document.getElementById('wallet-modal-root');
      if (modalRoot) openInstallModal(modalRoot);
      bus.emit('wallet:error', { message: 'Phantom wallet not found.' });
      return null;
    }

    bindProviderListeners(provider);

    try {
      const { publicKey } = await provider.connect();
      const address = publicKey.toString();

      const signature = await signAuthStatement(provider);

      const session: WalletSession = {
        address,
        shortAddress: shortenAddress(address),
        network: SOLANA.network,
        connectedAt: Date.now(),
        signature,
      };

      appState.setSession(session);
      bus.emit('wallet:connected', session);

      // Non-blocking cosmetic balance.
      hydrateBalance(address);

      return session;
    } catch (err) {
      const message = isUserRejection(err)
        ? 'Wallet connection was cancelled.'
        : err instanceof Error && err.message
          ? err.message
          : 'Could not connect to Phantom.';
      bus.emit('wallet:error', { message });
      bus.emit('toast', { message, kind: 'error' });
      return null;
    }
  },

  /** Disconnect the provider and clear the persisted session. */
  async disconnect(): Promise<void> {
    const provider = getProvider();
    try {
      if (provider) await provider.disconnect();
    } catch (err) {
      console.warn('[wallet] provider disconnect failed', err);
    } finally {
      appState.setSession(null);
      bus.emit('wallet:disconnected', undefined);
    }
  },

  /** Is Phantom currently injected into the page? */
  installed(): boolean {
    return isPhantomInstalled();
  },

  /** The live provider, or null when Phantom is not installed. */
  provider(): PhantomProvider | null {
    return getProvider();
  },

  /**
   * Render the connect button / connected chip into `host`. Re-renders on
   * wallet connect/disconnect. Returns a cleanup function.
   */
  mountConnectButton(host: HTMLElement, opts?: { variant?: 'nav' | 'hero' }): () => void {
    return mountConnectButton(host, opts);
  },
};
