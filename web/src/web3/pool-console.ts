import './pool-console.css';
import { bus } from '../events';
import { appState } from '../app-state';
import { CONTRACTS, ROBINHOODCHAIN } from '../config';
import type { RunResult, RunTicket } from '../types';
import {
  claimRunOnChain,
  clearRunClaim,
  clearRunTicket,
  depositPool,
  loadRunTicket,
  storeRunTicket,
  enterTournament,
  getCosmeticPrice,
  getTotalPoolBalance,
  isPoolConfigured,
  loadRunClaim,
  mintCosmetic,
  requestRunClaim,
  storeRunClaim,
} from './arena-pool';

const LAST_RUN_KEY = 'shadoken.lastRun.v1';

function parseEtherLike(value: string): string {
  const clean = value.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(clean)) throw new Error('Invalid amount.');
  const [whole, frac = ''] = clean.split('.');
  return (BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(frac.padEnd(18, '0'))).toString();
}

function parsePositiveInt(value: string, label: string, max: number): number {
  const n = Number(value.trim());
  if (!Number.isSafeInteger(n) || n <= 0 || n > max) throw new Error(`Invalid ${label}.`);
  return n;
}

function formatWei(valueWei: string): string {
  const value = BigInt(valueWei);
  const whole = value / 1_000_000_000_000_000_000n;
  const frac = (value % 1_000_000_000_000_000_000n).toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${frac}`.replace(/\.?0+$/, '');
}

function html(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

function loadLastRun(): RunResult | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    return raw ? (JSON.parse(raw) as RunResult) : null;
  } catch {
    return null;
  }
}

function storeLastRun(result: RunResult): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, JSON.stringify(result));
  } catch {
    /* storage unavailable */
  }
}

export function mountPoolConsole(host: HTMLElement): () => void {
  let open = false;
  let busy = false;
  let readBusy = false;
  let hasFreshRun = false;
  let poolBalanceWei: string | null = null;
  let cosmeticPriceWei: string | null = null;
  const form = {
    deposit: '0.01',
    entry: '0',
    token: '1001',
    amount: '1',
  };

  const root = document.createElement('div');
  root.className = 'pool-console';
  host.appendChild(root);

  const syncForm = () => {
    form.deposit = root.querySelector<HTMLInputElement>('[data-deposit]')?.value ?? form.deposit;
    form.entry = root.querySelector<HTMLInputElement>('[data-entry]')?.value ?? form.entry;
    form.token = root.querySelector<HTMLInputElement>('[data-token]')?.value ?? form.token;
    form.amount = root.querySelector<HTMLInputElement>('[data-amount]')?.value ?? form.amount;
  };

  const readAction = (task: () => Promise<void>) => {
    if (busy || readBusy) return;
    readBusy = true;
    render();
    task()
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Pool read failed.';
        bus.emit('toast', { message, kind: 'error' });
      })
      .finally(() => {
        readBusy = false;
        render();
      });
  };

  const runAction = (task: () => Promise<string | void>) => {
    if (busy) return;
    busy = true;
    render();
    task()
      .then((tx) => {
        if (tx) bus.emit('toast', { message: `Transaction sent ${tx.slice(0, 10)}...`, kind: 'success' });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Pool action failed.';
        bus.emit('toast', { message, kind: 'error' });
      })
      .finally(() => {
        busy = false;
        render();
      });
  };

  const refreshPoolBalance = async () => {
    if (!isPoolConfigured()) return;
    poolBalanceWei = await getTotalPoolBalance();
  };

  const refreshCosmeticPrice = async () => {
    syncForm();
    const tokenId = parsePositiveInt(form.token, 'cosmetic id', 1_000_000_000);
    cosmeticPriceWei = await getCosmeticPrice(tokenId);
  };

  function render(): void {
    const session = appState.session;
    const configured = isPoolConfigured();
    const claim = loadRunClaim();
    const lastRun = loadLastRun();
    const ticket = loadRunTicket();
    const canWrite = !busy && !!session && configured;
    const symbol = ROBINHOODCHAIN.nativeCurrencySymbol;
    const claimReward = claim ? `${formatWei(claim.payload.rewardWei)} ${symbol}` : 'none';
    const price = cosmeticPriceWei ? `${formatWei(cosmeticPriceWei)} ${symbol}` : 'read on-chain';
    const poolBalance = poolBalanceWei ? `${formatWei(poolBalanceWei)} ${symbol}` : 'read on-chain';
    root.innerHTML = `
      <button class="pool-console__toggle ${hasFreshRun || claim ? 'has-run' : ''}" type="button" data-toggle>
        ${claim ? 'Claim' : hasFreshRun ? 'Run Ready' : 'Pool'}
      </button>
      <section class="pool-console__panel" ${open ? '' : 'hidden'}>
        <div class="pool-console__head">
          <div>
            <div class="pool-console__title">Shadoken Pool</div>
            <div class="pool-console__status">season ${CONTRACTS.seasonId} · ${configured ? 'contract configured' : 'set VITE_ARENA_POOL_ADDRESS'} · ${session ? session.shortAddress : 'connect wallet'}</div>
          </div>
          <button class="pool-console__icon" type="button" title="Refresh pool" data-refresh-pool ${readBusy || !configured ? 'disabled' : ''}>R</button>
        </div>
        ${!configured ? `
          <div class="pool-console__cs-banner">
            <span class="pool-console__cs-badge">COMING SOON</span>
            <p>Shadoken Pool smart contract is not yet deployed on Mainnet/Testnet. Staking pool & reward minting features are currently under integration.</p>
          </div>
        ` : ''}
        <div class="pool-console__grid" ${!configured ? 'style="opacity:0.4;pointer-events:none;"' : ''}>
          <label>Deposit ${html(symbol)}<input data-deposit value="${html(form.deposit)}" inputmode="decimal"></label>
          <label>Entry ${html(symbol)}<input data-entry value="${html(form.entry)}" inputmode="decimal"></label>
          <label>Cosmetic ID<input data-token value="${html(form.token)}" inputmode="numeric"></label>
          <label>Amount<input data-amount value="${html(form.amount)}" inputmode="numeric"></label>
        </div>
        <div class="pool-console__actions" ${!configured ? 'style="opacity:0.4;pointer-events:none;"' : ''}>
          <button type="button" data-deposit-action ${canWrite ? '' : 'disabled'}>Deposit to Pool</button>
          <button type="button" data-enter-action ${canWrite ? '' : 'disabled'}>Enter Season</button>
          <button type="button" data-price-action ${readBusy || !configured ? 'disabled' : ''}>Read Cosmetic Price</button>
          <button type="button" data-mint-action ${canWrite ? '' : 'disabled'}>Mint Cosmetic</button>
          <button type="button" data-create-claim ${busy || !session || !ticket ? 'disabled' : ''}>Sign Run Claim</button>
          <button class="is-primary" type="button" data-claim-action ${canWrite && claim ? '' : 'disabled'}>Mint Badge / Claim Reward</button>
        </div>
        <div class="pool-console__note">
          Pool balance: ${poolBalance}<br>
          Cosmetic price: ${price}<br>
          Last run: ${lastRun ? `${lastRun.score} pts · ${lastRun.chambers} chambers` : 'none yet'}<br>
          Server-verified run: ${ticket ? `${ticket.score} pts · ${ticket.chambers} chambers` : 'none — finish a run online'}<br>
          Pending claim: ${claim ? `badge ${claim.payload.badgeId}, reward ${claimReward}` : 'none'}
        </div>
      </section>
    `;

    root.querySelector<HTMLButtonElement>('[data-toggle]')?.addEventListener('click', () => {
      open = !open;
      if (open && configured) readAction(refreshPoolBalance);
      else render();
    });
    root.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.addEventListener('input', () => {
        syncForm();
        if (input.dataset.token !== undefined) cosmeticPriceWei = null;
      });
    });
    root.querySelector<HTMLButtonElement>('[data-refresh-pool]')?.addEventListener('click', () => readAction(refreshPoolBalance));
    root.querySelector<HTMLButtonElement>('[data-price-action]')?.addEventListener('click', () => readAction(refreshCosmeticPrice));
    root.querySelector<HTMLButtonElement>('[data-deposit-action]')?.addEventListener('click', () => {
      syncForm();
      runAction(async () => {
        const tx = await depositPool(parseEtherLike(form.deposit));
        await refreshPoolBalance().catch(() => undefined);
        return tx;
      });
    });
    root.querySelector<HTMLButtonElement>('[data-enter-action]')?.addEventListener('click', () => {
      syncForm();
      runAction(async () => {
        const tx = await enterTournament(CONTRACTS.seasonId, parseEtherLike(form.entry));
        await refreshPoolBalance().catch(() => undefined);
        return tx;
      });
    });
    root.querySelector<HTMLButtonElement>('[data-mint-action]')?.addEventListener('click', () => {
      syncForm();
      runAction(async () => {
        const tokenId = parsePositiveInt(form.token, 'cosmetic id', 1_000_000_000);
        const amount = parsePositiveInt(form.amount, 'amount', 10_000);
        cosmeticPriceWei = await getCosmeticPrice(tokenId);
        const tx = await mintCosmetic(tokenId, amount);
        await refreshPoolBalance().catch(() => undefined);
        return tx;
      });
    });
    root.querySelector<HTMLButtonElement>('[data-create-claim]')?.addEventListener('click', () => {
      const run = loadRunTicket();
      if (!run) return;
      runAction(async () => {
        const next = await requestRunClaim(run);
        storeRunClaim(next);
        // The ticket is single-use server-side; drop our copy so the UI matches.
        clearRunTicket();
        hasFreshRun = false;
        bus.emit('toast', { message: `Run claim ready for badge ${next.payload.badgeId}.`, kind: 'success' });
      });
    });
    root.querySelector<HTMLButtonElement>('[data-claim-action]')?.addEventListener('click', () => {
      const next = loadRunClaim();
      if (!next) return;
      runAction(async () => {
        const tx = await claimRunOnChain(next);
        clearRunClaim();
        await refreshPoolBalance().catch(() => undefined);
        return tx;
      });
    });
  }

  const offWallet = bus.on('wallet:connected', () => render());
  const offDisconnect = bus.on('wallet:disconnected', () => render());
  const offGameOver = bus.on('game:over', (result: RunResult) => {
    storeLastRun(result);
    render();
  });
  // Only a server-issued ticket makes a run claimable — that is what lights up
  // the console, not the locally reported score.
  const offTicket = bus.on('run:ticket', (ticket: RunTicket) => {
    storeRunTicket(ticket);
    hasFreshRun = true;
    bus.emit('toast', { message: `Run verified — ${ticket.score} pts ready to claim.`, kind: 'success' });
    render();
  });
  const offOpen = bus.on('pool:open-console', () => {
    open = true;
    render();
  });
  render();

  return () => {
    offWallet();
    offDisconnect();
    offGameOver();
    offTicket();
    offOpen();
    root.remove();
  };
}
