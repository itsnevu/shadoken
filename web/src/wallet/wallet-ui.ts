// ============================================================================
// Wallet UI: the connect button / connected chip + dropdown, and the
// "install Phantom" modal. Pure DOM, no framework. Reuses the global button
// system and design tokens; component-specific styles live in ./wallet.css.
// ============================================================================

import './wallet.css';
import { bus } from '../events';
import { appState } from '../app-state';
import type { WalletSession } from '../types';
import { wallet } from './wallet';
import { getProvider } from './phantom';

const PHANTOM_DOWNLOAD_URL = 'https://phantom.app/download';

function explorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

/** Copy text to the clipboard with a legacy fallback. Resolves to success. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Connect button / connected chip
// ---------------------------------------------------------------------------

/**
 * Mount the wallet control into `host`. Renders a "Connect Wallet" button when
 * disconnected, and an address chip with a dropdown when connected. Re-renders
 * on wallet events. Returns a cleanup function.
 */
export function mountConnectButton(
  host: HTMLElement,
  opts?: { variant?: 'nav' | 'hero' },
): () => void {
  const variant = opts?.variant ?? 'nav';
  let connecting = false;
  let closeDropdown: (() => void) | null = null;

  function render(): void {
    closeDropdown?.();
    closeDropdown = null;
    host.textContent = '';
    host.classList.add('wallet-slot', `wallet-slot--${variant}`);

    const session = appState.session;
    if (session) {
      host.appendChild(buildChip(session));
    } else {
      host.appendChild(buildConnectButton());
    }
  }

  function buildConnectButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn--phantom wallet-connect-btn${variant === 'hero' ? ' btn--lg' : ''}`;
    btn.setAttribute('aria-label', 'Connect Phantom wallet');
    renderConnectLabel(btn);

    btn.addEventListener('click', () => {
      if (connecting) return;
      connecting = true;
      btn.disabled = true;
      renderConnectLabel(btn);
      void wallet.connect().finally(() => {
        connecting = false;
        // A successful connect re-renders via the bus; on failure restore label.
        if (!appState.session) {
          btn.disabled = false;
          renderConnectLabel(btn);
        }
      });
    });
    return btn;
  }

  function renderConnectLabel(btn: HTMLButtonElement): void {
    btn.textContent = '';
    if (connecting) {
      const sp = document.createElement('span');
      sp.className = 'spinner wallet-spinner';
      btn.appendChild(sp);
      btn.appendChild(document.createTextNode('Connecting…'));
      return;
    }
    const icon = document.createElement('span');
    icon.className = 'wallet-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '◈';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode('Connect Wallet'));
  }

  function buildChip(session: WalletSession): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'wallet-chip-wrap';

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'wallet-chip';
    chip.setAttribute('aria-haspopup', 'menu');
    chip.setAttribute('aria-expanded', 'false');

    const dot = document.createElement('span');
    dot.className = 'wallet-chip__icon';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '◈';

    const addr = document.createElement('span');
    addr.className = 'wallet-chip__addr';
    addr.textContent = session.shortAddress;

    const caret = document.createElement('span');
    caret.className = 'wallet-chip__caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';

    chip.append(dot, addr, caret);
    wrap.appendChild(chip);

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (closeDropdown) {
        closeDropdown();
        return;
      }
      openDropdown(wrap, chip, session);
    });

    return wrap;
  }

  function openDropdown(wrap: HTMLElement, chip: HTMLElement, session: WalletSession): void {
    const menu = document.createElement('div');
    menu.className = 'wallet-menu';
    menu.setAttribute('role', 'menu');

    const header = document.createElement('div');
    header.className = 'wallet-menu__header';
    const full = document.createElement('div');
    full.className = 'wallet-menu__full';
    full.textContent = session.address;
    const net = document.createElement('div');
    net.className = 'wallet-menu__net';
    net.textContent = session.network;
    header.append(full, net);
    menu.appendChild(header);

    if (typeof session.lamports === 'number') {
      const bal = document.createElement('div');
      bal.className = 'wallet-menu__bal';
      const sol = session.lamports / 1_000_000_000;
      bal.textContent = `${sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
      menu.appendChild(bal);
    }

    menu.appendChild(
      menuItem('Copy address', '⧉', () => {
        void copyText(session.address).then((ok) => {
          bus.emit('toast', {
            message: ok ? 'Address copied' : 'Copy failed',
            kind: ok ? 'success' : 'error',
          });
        });
        closeDropdown?.();
      }),
    );

    menu.appendChild(
      menuItem('View on Explorer', '↗', () => {
        window.open(explorerUrl(session.address), '_blank', 'noopener,noreferrer');
        closeDropdown?.();
      }),
    );

    const disconnectItem = menuItem('Disconnect', '⏻', () => {
      closeDropdown?.();
      void wallet.disconnect();
    });
    disconnectItem.classList.add('wallet-menu__item--danger');
    menu.appendChild(disconnectItem);

    wrap.appendChild(menu);
    chip.setAttribute('aria-expanded', 'true');

    const onDocClick = (ev: MouseEvent) => {
      if (!wrap.contains(ev.target as Node)) closeDropdown?.();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeDropdown?.();
    };
    // Defer to avoid catching the opening click.
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
    document.addEventListener('keydown', onKey);

    closeDropdown = () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      menu.remove();
      chip.setAttribute('aria-expanded', 'false');
      closeDropdown = null;
    };
  }

  function menuItem(label: string, glyph: string, onClick: () => void): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'wallet-menu__item';
    item.setAttribute('role', 'menuitem');
    const g = document.createElement('span');
    g.className = 'wallet-menu__glyph';
    g.setAttribute('aria-hidden', 'true');
    g.textContent = glyph;
    const t = document.createElement('span');
    t.textContent = label;
    item.append(g, t);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return item;
  }

  // Initial paint + subscriptions.
  render();
  const offConnected = bus.on('wallet:connected', () => render());
  const offDisconnected = bus.on('wallet:disconnected', () => render());

  return () => {
    offConnected();
    offDisconnected();
    closeDropdown?.();
    host.textContent = '';
    host.classList.remove('wallet-slot', `wallet-slot--${variant}`);
  };
}

// ---------------------------------------------------------------------------
// Install-Phantom modal
// ---------------------------------------------------------------------------

let activeModalCleanup: (() => void) | null = null;

/** Open the "install Phantom" modal into `root`. Idempotent. */
export function openInstallModal(root: HTMLElement): void {
  if (activeModalCleanup) return; // already open

  const backdrop = document.createElement('div');
  backdrop.className = 'wallet-modal__backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'wallet-modal-title');

  const panel = document.createElement('div');
  panel.className = 'wallet-modal';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'wallet-modal__close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '✕';

  const badge = document.createElement('div');
  badge.className = 'wallet-modal__badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = '◈';

  const title = document.createElement('h2');
  title.className = 'wallet-modal__title';
  title.id = 'wallet-modal-title';
  title.textContent = 'Phantom wallet required';

  const body = document.createElement('p');
  body.className = 'wallet-modal__body';
  body.textContent =
    'Shadoken uses Phantom to sign you in on Solana — no passwords, no gas. Install the Phantom browser extension (or app), then come back and retry.';

  const actions = document.createElement('div');
  actions.className = 'wallet-modal__actions';

  const install = document.createElement('a');
  install.className = 'btn btn--phantom btn--block';
  install.href = PHANTOM_DOWNLOAD_URL;
  install.target = '_blank';
  install.rel = 'noopener noreferrer';
  install.textContent = 'Get Phantom';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn--ghost btn--block';
  retry.textContent = 'Retry';

  actions.append(install, retry);
  panel.append(close, badge, title, body, actions);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  function cleanup(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    activeModalCleanup = null;
  }
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') cleanup();
  }

  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) cleanup();
  });
  close.addEventListener('click', cleanup);
  document.addEventListener('keydown', onKey);

  retry.addEventListener('click', () => {
    if (getProvider()) {
      cleanup();
      void wallet.connect();
    } else {
      bus.emit('toast', { message: 'Still no Phantom detected.', kind: 'error' });
    }
  });

  activeModalCleanup = cleanup;
  // Focus the primary action for keyboard users.
  requestAnimationFrame(() => install.focus());
}
