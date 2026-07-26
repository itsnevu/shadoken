// Run with: npm test  (node --test via tsx)
import test from 'node:test';
import assert from 'node:assert/strict';

import { fixedWindowRateLimit, parseAllowedOrigins, requireBasicAuth } from '../src/http-guards.js';

// ---- helpers ---------------------------------------------------------------

interface FakeExchange {
  status: number | null;
  headers: Record<string, string>;
  body: unknown;
  nexted: boolean;
}

function runMiddleware(
  handler: ReturnType<typeof fixedWindowRateLimit>,
  req: { ip?: string; headers?: Record<string, string> },
): FakeExchange {
  const exchange: FakeExchange = { status: null, headers: {}, body: null, nexted: false };
  const res = {
    setHeader(name: string, value: string) {
      exchange.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      exchange.status = code;
      return res;
    },
    json(payload: unknown) {
      exchange.body = payload;
      return res;
    },
  };
  const request = { ip: req.ip ?? '10.0.0.1', headers: req.headers ?? {}, socket: {} };
  handler(request as never, res as never, () => {
    exchange.nexted = true;
  });
  return exchange;
}

// ---- rate limiter ----------------------------------------------------------

test('rate limiter passes requests under the limit and blocks the excess', () => {
  let clock = 1_000_000;
  const limiter = fixedWindowRateLimit({ limit: 3, windowMs: 60_000, now: () => clock });

  for (let i = 0; i < 3; i++) {
    assert.equal(runMiddleware(limiter, { ip: 'a' }).nexted, true, `request ${i + 1} allowed`);
  }
  const blocked = runMiddleware(limiter, { ip: 'a' });
  assert.equal(blocked.nexted, false);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['retry-after']) >= 1);

  // A different client keeps its own budget.
  assert.equal(runMiddleware(limiter, { ip: 'b' }).nexted, true);

  // A fresh window resets the exhausted client.
  clock += 60_000;
  assert.equal(runMiddleware(limiter, { ip: 'a' }).nexted, true);
});

// ---- basic auth ------------------------------------------------------------

function basicHeader(user: string, pass: string): Record<string, string> {
  return { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
}

test('basic auth admits the right credentials and rejects everything else', () => {
  const guard = requireBasicAuth('admin', 's3cret');

  assert.equal(runMiddleware(guard, { headers: basicHeader('admin', 's3cret') }).nexted, true);

  for (const headers of [
    {},
    { authorization: 'Bearer nope' },
    basicHeader('admin', 'wrong'),
    basicHeader('intruder', 's3cret'),
    { authorization: 'Basic not-base64!!' },
  ]) {
    const denied = runMiddleware(guard, { headers });
    assert.equal(denied.nexted, false);
    assert.equal(denied.status, 401);
    assert.match(denied.headers['www-authenticate'] ?? '', /^Basic /);
  }
});

test('basic auth handles passwords containing colons', () => {
  const guard = requireBasicAuth('admin', 'a:b:c');
  assert.equal(runMiddleware(guard, { headers: basicHeader('admin', 'a:b:c') }).nexted, true);
});

// ---- CORS allowlist --------------------------------------------------------

test('parseAllowedOrigins splits, trims and strips trailing slashes', () => {
  assert.equal(parseAllowedOrigins(undefined), null);
  assert.equal(parseAllowedOrigins(''), null);
  assert.equal(parseAllowedOrigins(' , ,'), null);
  assert.deepEqual(parseAllowedOrigins('https://shadoken.example'), ['https://shadoken.example']);
  assert.deepEqual(parseAllowedOrigins(' https://a.example/ , https://b.example '), [
    'https://a.example',
    'https://b.example',
  ]);
});
