// ============================================================================
// Low-level MetaMask / EIP-1193 provider glue for RobinhoodChain.
// ============================================================================

import { ROBINHOODCHAIN } from '../config';
import type { EthereumProvider } from '../types';

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  return window.ethereum ?? null;
}

export function isMetaMaskInstalled(): boolean {
  return getProvider() !== null;
}

export async function requestAccounts(provider: EthereumProvider): Promise<string[]> {
  return provider.request<string[]>({ method: 'eth_requestAccounts' });
}

export async function getAccounts(provider: EthereumProvider): Promise<string[]> {
  return provider.request<string[]>({ method: 'eth_accounts' });
}

export async function getChainId(provider: EthereumProvider): Promise<string> {
  return provider.request<string>({ method: 'eth_chainId' });
}

export async function fetchBalanceWei(provider: EthereumProvider, address: string): Promise<string | null> {
  try {
    return await provider.request<string>({ method: 'eth_getBalance', params: [address, 'latest'] });
  } catch (err) {
    console.warn('[wallet] balance fetch failed', err);
    return null;
  }
}

export async function signAuthStatement(provider: EthereumProvider, address: string): Promise<string> {
  return provider.request<string>({
    method: 'personal_sign',
    params: [ROBINHOODCHAIN.authStatement, address],
  });
}

export async function switchToRobinhoodChain(provider: EthereumProvider): Promise<void> {
  if (!ROBINHOODCHAIN.chainId) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ROBINHOODCHAIN.chainId }],
    });
  } catch (err) {
    const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
    if (code !== 4902 || !ROBINHOODCHAIN.rpcUrl) throw err;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: ROBINHOODCHAIN.chainId,
          chainName: ROBINHOODCHAIN.name,
          rpcUrls: [ROBINHOODCHAIN.rpcUrl],
          nativeCurrency: {
            name: ROBINHOODCHAIN.nativeCurrencySymbol,
            symbol: ROBINHOODCHAIN.nativeCurrencySymbol,
            decimals: 18,
          },
          blockExplorerUrls: ROBINHOODCHAIN.blockExplorerUrl ? [ROBINHOODCHAIN.blockExplorerUrl] : undefined,
        },
      ],
    });
  }
}

export function isUserRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  if (code === 4001 || code === '4001') return true;
  if (typeof message === 'string' && /reject|denied|cancel/i.test(message)) return true;
  return false;
}
