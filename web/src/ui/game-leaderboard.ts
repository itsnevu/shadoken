// In-game live leaderboard overlay: ranks players by score and shows alive status.
// Mounted into #game-hud by main.ts while a multiplayer run is active.

import './game-leaderboard.css';
import { bus } from '../events';
import type { PlayerSnapshot } from '../types';

export function mountGameLeaderboard(host: HTMLElement, localSessionId: string | null): () => void {
  const container = document.createElement('div');
  container.className = 'game-leaderboard';

  container.innerHTML = `
    <div class="gl-title">🏆 Arena Leaderboard</div>
    <div class="gl-list" data-list></div>
  `;
  host.appendChild(container);

  const listEl = container.querySelector('[data-list]') as HTMLElement;

  const offPlayers = bus.on('net:players', (players: PlayerSnapshot[]) => {
    // Sort players by score descending
    const sorted = [...players].sort((a, b) => b.score - a.score);

    listEl.innerHTML = sorted.map((p, idx) => {
      const isLocal = p.sessionId === localSessionId;
      const rank = idx + 1;
      const rowClasses = [
        'gl-row',
        isLocal ? 'is-local' : '',
        !p.alive ? 'is-dead' : ''
      ].filter(Boolean).join(' ');

      const statusIcon = !p.alive ? '<span class="gl-status-icon">💀</span>' : '';

      return `
        <div class="${rowClasses}">
          <div class="gl-player-info">
            <span class="gl-rank">${rank}.</span>
            <span class="gl-name" title="${p.name}">${p.name}</span>
          </div>
          <div class="gl-score-wrap">
            <span class="gl-score">${p.score}</span>
            ${statusIcon}
          </div>
        </div>
      `;
    }).join('');
  });

  return () => {
    offPlayers();
    container.remove();
  };
}
