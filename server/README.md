# Shadoken multiplayer server

Colyseus 0.16 authoritative-relay arena for Shadoken (Numerous Ninjas web rewrite).

The model is **client-authoritative relay**: each client simulates its own ninja
and streams its transform to the room, which validates lightly and fans the
combined state back out. The server owns the shared world **seed**, the room
`startedAt` timestamp, the player map, and a periodic leaderboard broadcast.

## Run

```bash
cd server
npm install
npm run dev      # tsx watch — hot-reloads on change
```

The server logs:

```
Shadoken arena listening on ws://localhost:2567
  health   → http://localhost:2567/
  monitor  → http://localhost:2567/monitor
```

Other scripts:

- `npm start` — run once (no watch)
- `npm run build` — compile to `dist/`
- `npm run typecheck` — `tsc --noEmit`

### Environment

- `PORT` — listen port (default `2567`).

## Endpoints

- `GET /` — health JSON: `{ ok, name, rooms, ccu, uptime }`
- `GET /monitor` — Colyseus dashboard (rooms & clients)
- `ws(s)://<host>:2567` — Colyseus WebSocket transport; room name **`arena`**

## Connect the web client

Point the Vite web client at this server via env var (in `web/.env` or the
shell that runs `npm run dev` for the web app):

```
VITE_MULTIPLAYER_URL=ws://localhost:2567
```

When unset the client defaults to `ws://localhost:2567` (or
`wss://<hostname>:2567` over HTTPS). If the server is unreachable the web client
falls back to solo/offline play automatically.

## Protocol

Client → server message **`input`** (mirrors `PlayerInputMessage`):

```ts
{ x, y, angle, vx, vy, facing: 1 | -1, state, score, alive }
```

Server → client:

- Schema state sync (`ArenaState`: `seed`, `startedAt`, `players` map of `Player`)
- Broadcast **`leaderboard`** — top 8 `{ sessionId, name, score, alive }`

## Files

- `src/schema/ArenaState.ts` — `@colyseus/schema` v3 `Player` + `ArenaState`
- `src/rooms/ArenaRoom.ts` — `Room<ArenaState>` relay logic (max 16 clients, 20 Hz)
- `src/index.ts` — Express + Colyseus boot over `@colyseus/ws-transport`
