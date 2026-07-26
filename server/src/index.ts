// ============================================================================
// Shadoken — multiplayer server boot.
//
// Express (health + CORS + Colyseus monitor) sharing one HTTP server with a
// Colyseus 0.16 game server over the WebSocket transport. Rooms are defined in
// ./rooms/ArenaRoom.
// ============================================================================

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';

import { ArenaRoom } from './rooms/ArenaRoom.js';
import { leaderboardDb } from './leaderboard-db.js';
import { createRunClaim } from './run-claims.js';
import { claimStatement, peekRunTicket } from './run-registry.js';
import { tokenMetadata, tokenSvg } from './token-metadata.js';

const port = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

// High scores API.
app.get('/api/leaderboard', (_req, res) => {
  leaderboardDb.getScores()
    .then((scores) => res.json(scores))
    .catch((err) => {
      console.error('[server] leaderboard fetch failed', err);
      res.status(500).json({ error: 'Failed to retrieve highscores' });
    });
});

// Statement the player signs with their wallet to prove they own a filed run.
app.get('/api/run-claim/challenge', (req, res) => {
  const runId = String(req.query.runId ?? '');
  const wallet = String(req.query.wallet ?? '');
  if (!/^0x[a-fA-F0-9]{64}$/.test(runId) || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    res.status(400).json({ error: 'runId and wallet are required' });
    return;
  }
  const ticket = peekRunTicket(runId);
  if (!ticket) {
    res.status(404).json({ error: 'Run is unknown, expired or already claimed' });
    return;
  }
  res.json({
    statement: claimStatement(runId, wallet),
    run: { score: ticket.score, chambers: ticket.chambers, survivedMs: ticket.survivedMs, seed: ticket.seed },
  });
});

// Server-signed run claim for pool-funded badge/reward contracts.
app.post('/api/run-claim', (req, res) => {
  try {
    void createRunClaim(req.body ?? {}).then((claim) => res.json(claim)).catch((err) => {
      const message = err instanceof Error ? err.message : 'Failed to create run claim';
      const status = /configured/i.test(message) ? 503 : 400;
      res.status(status).json({ error: message });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create run claim';
    const status = /configured/i.test(message) ? 503 : 400;
    res.status(status).json({ error: message });
  }
});

// ERC1155 metadata for badges and cosmetics.
app.get('/api/metadata/:id.json', (req, res) => {
  const tokenId = Number(req.params.id);
  const origin = `${req.protocol}://${req.get('host')}`;
  const metadata = tokenMetadata(tokenId, process.env.TOKEN_METADATA_BASE_URL || origin);
  if (!metadata) {
    res.status(404).json({ error: 'Token metadata not found' });
    return;
  }
  res.json(metadata);
});

app.get('/api/metadata/:id.svg', (req, res) => {
  const tokenId = Number(req.params.id);
  const svg = tokenSvg(tokenId);
  if (!svg) {
    res.status(404).type('text/plain').send('Token image not found');
    return;
  }
  res.type('image/svg+xml').send(svg);
});

// Health check — reports live room count for uptime probes / the web client.
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'shadoken-arena',
    rooms: matchMaker.stats.local.roomCount,
    ccu: matchMaker.stats.local.ccu,
    uptime: process.uptime(),
  });
});

// Dev/admin dashboard.
app.use('/monitor', monitor());

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('arena', ArenaRoom);

gameServer
  .listen(port)
  .then(() => {
    console.log(`Shadoken arena listening on ws://localhost:${port}`);
    console.log(`  health   → http://localhost:${port}/`);
    console.log(`  monitor  → http://localhost:${port}/monitor`);
  })
  .catch((err) => {
    console.error('[server] failed to start', err);
    process.exit(1);
  });

// Graceful shutdown so `tsx watch` restarts release the port cleanly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void gameServer.gracefullyShutdown().finally(() => process.exit(0));
  });
}
