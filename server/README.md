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
- `npm test` — run-registry + run-claim suite (`node --test` via tsx)

### Environment

- `PORT` — listen port (default `2567`).
- `RUN_CLAIM_SIGNING_ENABLED=true` — explicit production guard before `/api/run-claim` signs anything.
- `RUN_CLAIM_SIGNER_PRIVATE_KEY` — EVM private key that signs claimable run results.
- `ROBINHOODCHAIN_CHAIN_ID` — numeric RobinhoodChain mainnet chain id used for EIP-712.
- `ARENA_POOL_ADDRESS` — deployed `ShadokenArenaPool` address used for EIP-712.
- `SEASON_ID` — season id embedded into signed run claims (default `1`).
- `RUN_REWARD_WEI` — optional per-qualified-run reward paid by the pool contract (default `0`).
- `RUN_CLAIM_TTL_SECONDS` — claim signature validity window (default `3600`).
- `TOKEN_METADATA_BASE_URL` — public base URL used inside ERC1155 metadata image links.
- `CORS_ORIGIN` — comma-separated origin allowlist (e.g. `https://shadoken.example`). Unset = any origin (dev only).
- `MONITOR_PASSWORD` — basic-auth password for `/monitor`. Without it the monitor is **disabled when `NODE_ENV=production`**.
- `MONITOR_USER` — basic-auth username for `/monitor` (default `admin`).
- `RUN_CLAIM_RATE_LIMIT_PER_MINUTE` — per-IP request cap for `/api/run-claim*` (default `30`).
- `TRUST_PROXY` — hop count when behind a reverse proxy (e.g. `1` behind Caddy/nginx) so rate limiting sees real client IPs.

## Endpoints

- `GET /` — health JSON: `{ ok, name, rooms, ccu, uptime }`
- `GET /monitor` — Colyseus dashboard (rooms & clients); basic-auth via `MONITOR_PASSWORD`, disabled in production without it
- `GET /api/leaderboard` — top local high scores
- `GET /api/run-claim/challenge?runId&wallet` — statement the player signs to prove wallet ownership
- `POST /api/run-claim` — `{ runId, wallet, signature }` → server-signed EIP-712 claim for `ShadokenArenaPool`
- `GET /api/metadata/:id.json` — ERC1155 metadata for badges/cosmetics
- `GET /api/metadata/:id.svg` — generated RobinhoodChain-themed token image
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
{ x, y, angle, vx, vy, facing: 1 | -1, state, score, chambers, alive, sabotage? }
```

Server → client:

- Schema state sync (`ArenaState`: `seed`, `startedAt`, `players` map of `Player`)
- Broadcast **`leaderboard`** — top 8 `{ sessionId, name, score, alive }`
- Broadcast **`sabotage`** — relayed PvP power event from one client to the others.
- Direct **`run-ticket`** — sent only to the client whose run just ended.

### Run claims

The arena is a relay, so a claim is never signed from numbers a client sends at
claim time. On **`run-end`** (or disconnect) the room files the run from the
state IT observed — monotonic score, chambers, server-clocked duration — and
drops implausible runs outright. It replies with a single-use `run-ticket`
(30 min TTL). The player then signs the challenge statement with their wallet
and `POST /api/run-claim` signs EIP-712 over the server's own record.

`npm test` covers the registry and the claim path (wallet-binding, single use,
forged score rejection, signature mismatches).

## Files

- `src/schema/ArenaState.ts` — `@colyseus/schema` v3 `Player` + `ArenaState`
- `src/rooms/ArenaRoom.ts` — `Room<ArenaState>` relay logic (max 16 clients, 20 Hz)
- `src/index.ts` — Express + Colyseus boot over `@colyseus/ws-transport`
