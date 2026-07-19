// In-game top bar overlay: wallet chip, live multiplayer status, exit button.
// Mounted into #game-hud by main.ts while a run is active.

import './game-topbar.css';
import { bus } from '../events';
import { appState } from '../app-state';
import type { WalletSession } from '../types';
import { audioSynthBgm } from '../game/systems/audio-synth';

interface TopbarOptions {
  multiplayer: boolean;
  guest?: boolean;
}

export function mountGameTopbar(host: HTMLElement, opts: TopbarOptions): () => void {
  const bar = document.createElement('div');
  bar.className = 'game-topbar';

  const initialMute = localStorage.getItem('shadoken-muted') === 'true';

  bar.innerHTML = `
    <button class="gt-audio" title="Toggle audio" aria-label="Toggle audio">${initialMute ? '🔇' : '🔊'}</button>
    <button class="gt-exit" title="Leave game" aria-label="Leave game">‹ Exit</button>
    <div class="gt-spacer"></div>
    <div class="gt-status ${opts.multiplayer ? 'is-mp' : 'is-solo'}">
      <span class="gt-dot"></span>
      <span class="gt-status-text">${opts.multiplayer ? 'Arena' : 'Solo'}</span>
      <span class="gt-count" hidden>0</span>
    </div>
    ${opts.guest ? '<div class="gt-guest-timer">DEMO: 30s</div>' : ''}
    <div class="gt-wallet">
      <span class="gt-wallet-ic">◈</span>
      <span class="gt-wallet-addr">Guest</span>
    </div>
  `;
  host.appendChild(bar);

  const exitBtn = bar.querySelector('.gt-exit') as HTMLButtonElement;
  const audioBtn = bar.querySelector('.gt-audio') as HTMLButtonElement;
  const walletAddrEl = bar.querySelector('.gt-wallet-addr') as HTMLElement;
  const walletEl = bar.querySelector('.gt-wallet') as HTMLElement;

  let isMuted = initialMute;
  const onToggleAudio = () => {
    isMuted = !isMuted;
    localStorage.setItem('shadoken-muted', String(isMuted));
    audioBtn.textContent = isMuted ? '🔇' : '🔊';
    audioSynthBgm.setMute(isMuted);
    bus.emit('audio:muted', isMuted);
  };
  audioBtn.addEventListener('click', onToggleAudio);

  const updateWalletDisplay = (session: WalletSession | null) => {
    if (session) {
      const lamports = session.lamports;
      const sol = typeof lamports === 'number' ? `(${(lamports / 1e9).toFixed(3)} SOL)` : '';
      walletAddrEl.textContent = `${session.shortAddress} ${sol}`.trim();
      walletEl.title = session.address;
    } else {
      walletAddrEl.textContent = 'Guest';
      walletEl.removeAttribute('title');
    }
  };

  updateWalletDisplay(appState.session);

  const onExit = () => bus.emit('game:exit', undefined);
  exitBtn.addEventListener('click', onExit);

  const countEl = bar.querySelector('.gt-count') as HTMLElement;
  const dot = bar.querySelector('.gt-dot') as HTMLElement;
  const guestTimerEl = bar.querySelector('.gt-guest-timer') as HTMLElement | null;

  const offPlayers = bus.on('net:players', (players) => {
    const n = players.length;
    countEl.hidden = n <= 1;
    countEl.textContent = String(n);
  });
  const offStatus = bus.on('net:status', (status) => {
    dot.dataset.status = status;
  });
  const offWallet = bus.on('wallet:connected', (session) => {
    updateWalletDisplay(session);
  });

  let offGuestTime = () => {};
  if (opts.guest && guestTimerEl) {
    offGuestTime = bus.on('game:guest-time', (sec) => {
      guestTimerEl.textContent = `DEMO: ${sec}s`;
    });
  }

  return () => {
    exitBtn.removeEventListener('click', onExit);
    audioBtn.removeEventListener('click', onToggleAudio);
    offPlayers();
    offStatus();
    offWallet();
    offGuestTime();
    bar.remove();
  };
}
