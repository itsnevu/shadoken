// ============================================================================
// Public wallet API — the single surface main.ts (and the shell) imports.
// Wraps the low-level MetaMask provider glue in ./metamask.ts with session
// management, event-bus notifications and the connect-button UI.
// ============================================================================

import { ROBINHOODCHAIN } from '../config';
import { bus } from '../events';
import { appState, shortenAddress } from '../app-state';
import type { EthereumProvider, WalletSession } from '../types';
import {
  fetchBalanceWei,
  getAccounts,
  getChainId,
  getProvider,
  isMetaMaskInstalled,
  isUserRejection,
  requestAccounts,
  signAuthStatement,
  switchToRobinhoodChain,
} from './metamask';
import { openInstallModal, mountConnectButton } from './wallet-ui';

// Provider-level listeners are registered once; keep references so they can be
// swapped if the provider re-injects (rare, but keeps us leak-free).
let boundProvider: EthereumProvider | null = null;
let handleConnect: ((arg: unknown) => void) | null = null;
let handleDisconnect: ((arg: unknown) => void) | null = null;
let handleAccountChanged: ((arg: unknown) => void) | null = null;
let handleChainChanged: ((arg: unknown) => void) | null = null;

function extractAddress(arg: unknown): string | null {
  if (typeof arg === 'string' && arg.length > 0) return arg;
  if (Array.isArray(arg) && typeof arg[0] === 'string' && arg[0].length > 0) return arg[0];
  if (arg && typeof arg === 'object' && 'toString' in arg) {
    const s = (arg as { toString(): string }).toString();
    if (s && s !== '[object Object]') return s;
  }
  return null;
}

/** Refresh (best-effort, non-blocking) the cached native balance on the live session. */
function hydrateBalance(provider: EthereumProvider, address: string): void {
  void fetchBalanceWei(provider, address).then((balanceWei) => {
    if (balanceWei == null) return;
    const current = appState.session;
    if (!current || current.address !== address) return;
    const updated = { ...current, balanceWei };
    appState.setSession(updated);
    bus.emit('wallet:connected', updated);
  });
}

function bindProviderListeners(provider: EthereumProvider): void {
  if (boundProvider === provider) return;
  // Detach from a stale provider first.
  if (boundProvider) {
    if (handleConnect) boundProvider.removeListener?.('connect', handleConnect);
    if (handleDisconnect) boundProvider.removeListener?.('disconnect', handleDisconnect);
    if (handleAccountChanged) boundProvider.removeListener?.('accountsChanged', handleAccountChanged);
    if (handleChainChanged) boundProvider.removeListener?.('chainChanged', handleChainChanged);
  }

  handleConnect = (arg: unknown) => {
    const addr = extractAddress(arg) ?? provider.selectedAddress ?? null;
    if (addr) hydrateBalance(provider, addr);
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

  handleChainChanged = (arg: unknown) => {
    const current = appState.session;
    if (!current || typeof arg !== 'string') return;
    appState.setSession({ ...current, chainId: arg, network: 'robinhoodchain' });
  };

  provider.on?.('connect', handleConnect);
  provider.on?.('disconnect', handleDisconnect);
  provider.on?.('accountsChanged', handleAccountChanged);
  provider.on?.('chainChanged', handleChainChanged);
  boundProvider = provider;
}

async function eagerReconnect(provider: EthereumProvider): Promise<void> {
  const stored = appState.session;
  if (!stored) return;
  try {
    const accounts = await getAccounts(provider);
    const address = accounts[0] ?? null;
    if (address && address.toLowerCase() === stored.address.toLowerCase()) {
      const chainId = await getChainId(provider).catch(() => stored.chainId);
      appState.setSession({ ...stored, address, shortAddress: shortenAddress(address), network: 'robinhoodchain', chainId });
      hydrateBalance(provider, address);
    } else {
      appState.setSession(null);
    }
  } catch {
    appState.setSession(null);
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
   * Full connect flow: detect MetaMask, connect, sign the auth statement and
   * establish a persisted session. Resolves to null on any failure or if the
   * user rejects — never throws.
   */
  async connect(): Promise<WalletSession | null> {
    bus.emit('wallet:connecting', undefined);

    const provider = getProvider();
    if (!provider) {
      const modalRoot = document.getElementById('wallet-modal-root');
      if (modalRoot) openInstallModal(modalRoot);
      bus.emit('wallet:error', { message: 'MetaMask wallet not found.' });
      return null;
    }

    bindProviderListeners(provider);

    try {
      await switchToRobinhoodChain(provider);
      const accounts = await requestAccounts(provider);
      const address = accounts[0];
      if (!address) throw new Error('No MetaMask account selected.');
      const chainId = await getChainId(provider).catch(() => ROBINHOODCHAIN.chainId || undefined);

      const signature = await signAuthStatement(provider, address);

      const session: WalletSession = {
        address,
        shortAddress: shortenAddress(address),
        network: 'robinhoodchain',
        walletKind: 'metamask',
        chainId,
        connectedAt: Date.now(),
        signature,
      };

      appState.setSession(session);
      bus.emit('wallet:connected', session);

      hydrateBalance(provider, address);

      return session;
    } catch (err) {
      const message = isUserRejection(err)
        ? 'Wallet connection was cancelled.'
        : err instanceof Error && err.message
          ? err.message
          : 'Could not connect to MetaMask.';
      bus.emit('wallet:error', { message });
      bus.emit('toast', { message, kind: 'error' });
      return null;
    }
  },

  /** Disconnect the provider and clear the persisted session. */
  async disconnect(): Promise<void> {
    appState.setSession(null);
    bus.emit('wallet:disconnected', undefined);
  },

  /** Is MetaMask currently injected into the page? */
  installed(): boolean {
    return isMetaMaskInstalled();
  },

  /** The live provider, or null when MetaMask is not installed. */
  provider(): EthereumProvider | null {
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
