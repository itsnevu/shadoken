// ============================================================================
// Shadoken — application entry point & orchestrator.
//
// Wires together the four subsystems built independently against the shared
// contracts in ./types.ts and ./events.ts:
//   - landing  (renderLanding)         — the marketing/entry screen
//   - wallet   (wallet)                — MetaMask connect + sign-in auth
//   - game     (launchGame)            — the Phaser game
//   - net      (createNetClient)       — Colyseus multiplayer
//   - pwa      (registerServiceWorker) — installable / offline
// ============================================================================

import './style.css';
import { bus } from './events';
import { appState } from './app-state';
import { MULTIPLAYER } from './config';
import type { GameHandle, NetHandle, PlayerSnapshot } from './types';

import { renderLanding } from './landing/landing';
import { wallet } from './wallet/wallet';
import { launchGame } from './game';
import { createNetClient } from './net';
import { registerServiceWorker } from './pwa/register-sw';
import { mountGameTopbar } from './ui/game-topbar';
import { mountGameLeaderboard } from './ui/game-leaderboard';
import { showToast } from './ui/toast';
import { mountPoolConsole } from './web3/pool-console';

const landingEl = document.getElementById('screen-landing') as HTMLElement;
const gameScreenEl = document.getElementById('screen-game') as HTMLElement;
const gameRootEl = document.getElementById('game-root') as HTMLElement;
const hudEl = document.getElementById('game-hud') as HTMLElement;
const poolConsoleEl = document.getElementById('pool-console-root') as HTMLElement;

let game: GameHandle | null = null;
let net: NetHandle | null = null;
let disposeTopbar: (() => void) | null = null;
let disposeLeaderboard: (() => void) | null = null;

// ---- Screen switching -------------------------------------------------------

function showLanding() {
  gameScreenEl.classList.add('hidden');
  gameScreenEl.setAttribute('aria-hidden', 'true');
  landingEl.classList.remove('hidden');
  document.body.classList.remove('in-game');
  appState.setScreen(appState.isConnected ? 'menu' : 'landing');
}

function showGameScreen() {
  landingEl.classList.add('hidden');
  gameScreenEl.classList.remove('hidden');
  gameScreenEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('in-game');
  appState.setScreen('playing');
}

// ---- Game lifecycle ---------------------------------------------------------

function dailySeed(): number {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return (y * 10000 + m * 100 + day) % 2147483647;
}

async function enterGame(multiplayer: boolean, guest = false, skin = 0, daily = false) {
  // Wallet is required to play.
  if (!guest && !appState.isConnected) {
    const session = await wallet.connect();
    if (!session) {
      showToast('Connect MetaMask to play on RobinhoodChain.', 'error');
      return;
    }
  }
  const session = guest ? null : appState.session;

  // Bring up multiplayer first (best-effort). If it fails we fall back to solo.
  let seed = daily ? dailySeed() : Math.floor((Date.now() % 2147483647));
  let mp = false;
  if (multiplayer && MULTIPLAYER.enabled) {
    try {
      net = createNetClient();
      bus.emit('net:status', 'connecting');
      await net.join(session, skin);
      seed = net.seed;
      mp = true;
    } catch (err) {
      console.warn('[main] multiplayer join failed, falling back to solo', err);
      showToast('Arena unavailable — playing solo.', 'info');
      net?.leave();
      net = null;
    }
  }

  showGameScreen();

  game = launchGame({
    parent: gameRootEl,
    session,
    seed,
    multiplayer: mp,
    skin,
    guest,
  });

  // Bridge game <-> net: local transforms out, remote players in.
  if (net && mp) {
    const liveNet = net;
    game.onLocalSnapshot((snap) => liveNet.sendInput(snap));
    liveNet.onPlayers((players: PlayerSnapshot[]) => {
      const others = players.filter((p) => p.sessionId !== liveNet.sessionId);
      game?.setRemotePlayers(others);
      bus.emit('net:players', players);
    });
  }

  // Top HUD bar (wallet chip, live player count, exit).
  disposeTopbar = mountGameTopbar(hudEl, { multiplayer: mp, guest });

  // Leaderboard overlay (for multiplayer).
  if (mp) {
    disposeLeaderboard = mountGameLeaderboard(hudEl, net?.sessionId ?? null);
  }

  bus.emit('game:ready', undefined);
}

function exitGame() {
  game?.destroy();
  game = null;
  net?.leave();
  net = null;
  disposeTopbar?.();
  disposeTopbar = null;
  disposeLeaderboard?.();
  disposeLeaderboard = null;
  hudEl.innerHTML = '';
  showLanding();
}

// ---- Wire events ------------------------------------------------------------

bus.on('game:enter', ({ multiplayer, guest, skin, daily }) => {
  enterGame(multiplayer, !!guest, skin, !!daily).catch((err) => {
    console.error('[main] enterGame failed', err);
    showToast('Failed to start game.', 'error');
    exitGame();
  });
});

bus.on('wallet:connect-request', () => {
  wallet.connect().then((session) => {
    if (session) {
      exitGame();
      enterGame(true, false).catch((err) => {
        console.error('[main] enterGame after wallet connect failed', err);
      });
    }
  });
});

bus.on('game:exit', () => exitGame());

bus.on('game:over', (result) => {
  appState.recordScore(result.score);
  // Ask the server to file the run — it answers with a 'run-ticket' message,
  // which is what the pool console turns into an on-chain claim.
  net?.endRun();
  // The game shows its own game-over scene; net keeps running for the lobby.
});

bus.on('wallet:connected', (session) => {
  showToast(`Connected ${session.shortAddress}`, 'success');
});
bus.on('wallet:disconnected', () => {
  if (appState.screen !== 'landing') showLanding();
});
bus.on('toast', ({ message, kind }) => showToast(message, kind));

// ---- Boot -------------------------------------------------------------------

function boot() {
  registerServiceWorker();
  renderLanding(landingEl);
  wallet.init(); // eager reconnect + provider event listeners
  // Mount the MetaMask connect button into the landing nav slot.
  const navSlot = document.getElementById('nav-wallet');
  if (navSlot) wallet.mountConnectButton(navSlot, { variant: 'nav' });
  if (poolConsoleEl) mountPoolConsole(poolConsoleEl);
  appState.setScreen(appState.isConnected ? 'menu' : 'landing');
  // eslint-disable-next-line no-console
  console.info('%cShadoken', 'color:#CCFF00;font-weight:bold', 'booted');
}

boot();
