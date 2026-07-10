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

const port = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

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
