// Central configuration for the Shadoken web client.
// Values can be overridden at build time via Vite env vars (VITE_*).

export const APP = {
  name: 'Shadoken',
  fullName: 'Shadoken — Numerous Ninjas',
  tagline: 'A school of ninjas. Any axis. Endless chambers.',
  version: '0.1.0',
} as const;

export type SolanaNetwork = 'devnet' | 'mainnet-beta' | 'testnet';

export const SOLANA = {
  network: (import.meta.env.VITE_SOLANA_NETWORK as SolanaNetwork) || 'devnet',
  rpcEndpoint:
    (import.meta.env.VITE_SOLANA_RPC as string) ||
    'https://api.devnet.solana.com',
  // Message the user signs to prove wallet ownership (sign-in-with-Solana style).
  authStatement:
    'Sign in to Shadoken. This request will not trigger a blockchain transaction or cost any gas fees.',
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
  session: 'shadoken.session.v1',
  settings: 'shadoken.settings.v1',
  bestScore: 'shadoken.best.v1',
} as const;
