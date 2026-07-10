// ============================================================================
// Service worker registration — makes Shadoken installable & offline-capable.
//
// vite-plugin-pwa (registerType: 'autoUpdate') generates the service worker;
// the `virtual:pwa-register` module (types via tsconfig "vite-plugin-pwa/client")
// gives us a tiny wrapper to register it and observe lifecycle callbacks.
// ============================================================================

import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toast';

/**
 * Register the service worker. Safe to call once at boot.
 * No-ops in non-browser / unsupported environments (e.g. SSR, older browsers).
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // `updateSW(true)` triggers skipWaiting + reload to apply the new version.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showToast('New version available — reload to update.', 'info', 8000);
      // Apply the update after a short beat so the user sees the toast.
      // (autoUpdate already reloads, but we call it explicitly to be safe.)
      window.setTimeout(() => {
        void updateSW(true);
      }, 1500);
    },
    onOfflineReady() {
      showToast('Ready to play offline ⚡', 'success');
    },
    onRegisterError(error: unknown) {
      console.warn('[pwa] service worker registration failed', error);
    },
  });
}
