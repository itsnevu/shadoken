// ============================================================================
// Shadoken — HTTP hardening middleware.
//
// Small, dependency-free guards for the public Express surface: a fixed-window
// per-IP rate limiter for the claim endpoints, HTTP basic auth for the
// Colyseus monitor, and the CORS allowlist parser. All state is in memory —
// consistent with the run registry, a restart simply resets the counters.
// ============================================================================

import { createHash, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface RateLimitOptions {
  /** Requests allowed per client per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface WindowEntry {
  windowStart: number;
  count: number;
}

/** Hard cap on tracked clients — oldest windows are swept before this bites. */
const MAX_TRACKED_CLIENTS = 10_000;

/**
 * Fixed-window per-IP rate limiter. Answers 429 with a Retry-After header once
 * a client exhausts its window. Keyed on `req.ip`, so set TRUST_PROXY when the
 * server sits behind a reverse proxy or every player shares one bucket.
 */
export function fixedWindowRateLimit(opts: RateLimitOptions): RequestHandler {
  const { limit, windowMs } = opts;
  const now = opts.now ?? Date.now;
  const windows = new Map<string, WindowEntry>();

  function sweep(at: number): void {
    for (const [key, entry] of windows) {
      if (at - entry.windowStart >= windowMs) windows.delete(key);
    }
    while (windows.size > MAX_TRACKED_CLIENTS) {
      const oldest = windows.keys().next();
      if (oldest.done) break;
      windows.delete(oldest.value);
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const at = now();

    let entry = windows.get(key);
    if (!entry || at - entry.windowStart >= windowMs) {
      sweep(at);
      entry = { windowStart: at, count: 0 };
      windows.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > limit) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + windowMs - at) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: 'Too many requests — slow down and retry shortly' });
      return;
    }
    next();
  };
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time string comparison via fixed-length digests. */
function safeEquals(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * HTTP basic auth gate for the monitor dashboard. Compares in constant time so
 * the password cannot be probed byte by byte.
 */
export function requireBasicAuth(user: string, password: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      if (sep >= 0) {
        const okUser = safeEquals(decoded.slice(0, sep), user);
        const okPass = safeEquals(decoded.slice(sep + 1), password);
        if (okUser && okPass) {
          next();
          return;
        }
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="shadoken-monitor", charset="UTF-8"');
    res.status(401).json({ error: 'Authentication required' });
  };
}

/**
 * Parse the CORS_ORIGIN env var — a comma-separated origin allowlist. Returns
 * null when unset/empty, which callers treat as "allow any origin" (dev mode).
 */
export function parseAllowedOrigins(value: string | undefined): string[] | null {
  if (!value) return null;
  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : null;
}
