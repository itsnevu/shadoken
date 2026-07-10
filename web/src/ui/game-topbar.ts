// In-game top bar overlay: wallet chip, live multiplayer status, exit button.
// Mounted into #game-hud by main.ts while a run is active.

import './game-topbar.css';
import { bus } from '../events';
import { appState } from '../app-state';

interface TopbarOptions {
  multiplayer: boolean;
}

export function mountGameTopbar(host: HTMLElement, opts: TopbarOptions): () => void {
  const bar = document.createElement('div');
  bar.className = 'game-topbar';

  const session = appState.session;
  const walletLabel = session ? session.shortAddress : 'Guest';

  bar.innerHTML = `
    <button class="gt-exit" title="Leave game" aria-label="Leave game">‹ Exit</button>
    <div class="gt-spacer"></div>
    <div class="gt-status ${opts.multiplayer ? 'is-mp' : 'is-solo'}">
      <span class="gt-dot"></span>
      <span class="gt-status-text">${opts.multiplayer ? 'Arena' : 'Solo'}</span>
      <span class="gt-count" hidden>0</span>
    </div>
    <div class="gt-wallet" title="${session?.address ?? ''}">
      <span class="gt-wallet-ic">◈</span>
      <span class="gt-wallet-addr">${walletLabel}</span>
    </div>
  `;
  host.appendChild(bar);

  const exitBtn = bar.querySelector('.gt-exit') as HTMLButtonElement;
  const onExit = () => bus.emit('game:exit', undefined);
  exitBtn.addEventListener('click', onExit);

  const countEl = bar.querySelector('.gt-count') as HTMLElement;
  const dot = bar.querySelector('.gt-dot') as HTMLElement;

  const offPlayers = bus.on('net:players', (players) => {
    const n = players.length;
    countEl.hidden = n <= 1;
    countEl.textContent = String(n);
  });
  const offStatus = bus.on('net:status', (status) => {
    dot.dataset.status = status;
  });

  return () => {
    exitBtn.removeEventListener('click', onExit);
    offPlayers();
    offStatus();
    bar.remove();
  };
}
