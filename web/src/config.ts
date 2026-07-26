// Central configuration for the Shadoken web client.
// Values can be overridden at build time via Vite env vars (VITE_*).

export const APP = {
  name: 'Shadoken',
  fullName: 'Shadoken — RobinhoodChain Arena',
  tagline: 'A neon swarm. Any axis. Endless chambers.',
  version: '0.1.0',
} as const;

export type WalletNetwork = 'robinhoodchain';

export const ROBINHOODCHAIN = {
  name: (import.meta.env.VITE_ROBINHOODCHAIN_NAME as string) || 'RobinhoodChain',
  chainId: (import.meta.env.VITE_ROBINHOODCHAIN_CHAIN_ID as string) || '',
  rpcUrl: (import.meta.env.VITE_ROBINHOODCHAIN_RPC as string) || '',
  blockExplorerUrl: (import.meta.env.VITE_ROBINHOODCHAIN_EXPLORER as string) || '',
  nativeCurrencySymbol: (import.meta.env.VITE_ROBINHOODCHAIN_SYMBOL as string) || 'RHC',
  authStatement:
    'Sign in to Shadoken on RobinhoodChain. This request will not trigger a blockchain transaction or cost gas fees.',
} as const;

export const CONTRACTS = {
  arenaPoolAddress: (import.meta.env.VITE_ARENA_POOL_ADDRESS as string) || '',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string) || '',
  seasonId: Math.max(1, Math.floor(Number(import.meta.env.VITE_SEASON_ID) || 1)),
} as const;

export const MULTIPLAYER = {
  // Colyseus endpoint. Defaults to localhost dev server.
  url:
    (import.meta.env.VITE_MULTIPLAYER_URL as string) ||
    (location.protocol === 'https:'
      ? `wss://${location.hostname}:2567`
      : 'ws://localhost:2567'),
  roomName: 'arena',
  // If the server is unreachable, the game still runs in solo/offline mode.
  enabled: (import.meta.env.VITE_MULTIPLAYER_ENABLED ?? 'true') !== 'false',
  reconnectAttempts: 3,
} as const;

// Fixed logical resolution the game world is designed against. The Phaser
// Scale Manager fits this into the viewport (letterbox) so mobile & desktop
// share identical physics.
export const VIEW = {
  width: 960,
  height: 540,
  minWidth: 320,
  minHeight: 480,
} as const;

export const STORAGE_KEYS = {
  session: 'shadoken.session.v2',
  settings: 'shadoken.settings.v1',
  bestScore: 'shadoken.best.v1',
} as const;
