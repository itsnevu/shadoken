// Tiny typed event bus — zero dependencies. Used as the decoupled message
// channel between the shell, wallet, game and net subsystems.

import type { AppScreen, WalletSession, RunResult, PlayerSnapshot } from './types';

export interface AppEventMap {
  'wallet:connecting': void;
  'wallet:connected': WalletSession;
  'wallet:disconnected': void;
  'wallet:error': { message: string };
  'wallet:connect-request': void;
  'screen:change': AppScreen;
  'game:enter': { multiplayer: boolean; guest?: boolean };
  'game:ready': void;
  'game:exit': void;
  'game:over': RunResult;
  'game:guest-time': number;
  'net:status': 'connecting' | 'connected' | 'disconnected' | 'error';
  'net:players': PlayerSnapshot[];
  'toast': { message: string; kind?: 'info' | 'success' | 'error' };
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private map = new Map<keyof AppEventMap, Set<Handler<unknown>>>();

  on<K extends keyof AppEventMap>(type: K, handler: Handler<AppEventMap[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(type, handler);
  }

  once<K extends keyof AppEventMap>(type: K, handler: Handler<AppEventMap[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof AppEventMap>(type: K, handler: Handler<AppEventMap[K]>): void {
    this.map.get(type)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof AppEventMap>(type: K, payload: AppEventMap[K]): void {
    this.map.get(type)?.forEach((h) => {
      try {
        (h as Handler<AppEventMap[K]>)(payload);
      } catch (err) {
        console.error(`[events] handler for "${String(type)}" threw`, err);
      }
    });
  }
}

/** Singleton application event bus. */
export const bus = new EventBus();
