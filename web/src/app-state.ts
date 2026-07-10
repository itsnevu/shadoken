// Central application state: the current screen and the wallet session.
// This is the single source of truth the shell reads; subsystems mutate it
// through these helpers and everyone reacts via the event bus.

import { STORAGE_KEYS } from './config';
import { bus } from './events';
import type { AppScreen, WalletSession } from './types';

interface AppStateShape {
  screen: AppScreen;
  session: WalletSession | null;
  bestScore: number;
}

function loadSession(): WalletSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletSession;
    if (!parsed.address) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadBest(): number {
  const n = Number(localStorage.getItem(STORAGE_KEYS.bestScore) ?? '0');
  return Number.isFinite(n) ? n : 0;
}

const state: AppStateShape = {
  screen: 'landing',
  session: loadSession(),
  bestScore: loadBest(),
};

export const appState = {
  get screen() {
    return state.screen;
  },
  get session() {
    return state.session;
  },
  get bestScore() {
    return state.bestScore;
  },
  get isConnected() {
    return state.session !== null;
  },

  setScreen(screen: AppScreen) {
    if (state.screen === screen) return;
    state.screen = screen;
    bus.emit('screen:change', screen);
  },

  setSession(session: WalletSession | null) {
    state.session = session;
    try {
      if (session) localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEYS.session);
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  },

  recordScore(score: number) {
    if (score > state.bestScore) {
      state.bestScore = score;
      try {
        localStorage.setItem(STORAGE_KEYS.bestScore, String(score));
      } catch {
        /* ignore */
      }
    }
  },
};

/** Shorten a base58 address for display: "Ab12…Yz90". */
export function shortenAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
