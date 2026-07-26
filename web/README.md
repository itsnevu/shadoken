# Shadoken — Web (Numerous Ninjas, reborn for the browser)

A RobinhoodChain, multiplayer, installable (PWA), mobile-responsive rewrite of
the Unity game **Numerous Ninjas**. Command a school of ninjas across endless
gravity-bending chambers, connect **MetaMask**, and race other players in real
time.

Stack: **Vite + TypeScript (strict) + Phaser 3** (game) · **MetaMask / EIP-1193**
(wallet) · **Colyseus** (multiplayer) · **vite-plugin-pwa** (offline installable).

---

## Run it

Dependencies are committed via `package.json` — install once, then run two
processes (game client + multiplayer server).

### 1. Multiplayer server (Colyseus)
```bash
cd server
npm install        # first time only
npm run dev        # → ws://localhost:2567  (monitor: http://localhost:2567/monitor)
```

### 2. Web client (Vite)
```bash
cd web
npm install        # first time only
npm run dev        # → http://localhost:5173
```

Open **http://localhost:5173**, click **Connect MetaMask**, then
**Enter the Arena**.

> The client runs **without** the server too — if the arena is unreachable it
> falls back to solo automatically. Run both for live multiplayer.

### Play on mobile 📱
`npm run dev` binds to your LAN (`host: true`) and prints a `http://192.168.x.x:5173`
URL — open it on a phone on the same Wi‑Fi to test touch controls + responsive UI.

### Production / installable PWA
```bash
cd web
npm run build      # tsc + vite build + service worker
npm run preview    # serve the built PWA, then browser → "Install app"
```

### Config (optional env, `web/.env`)
```
VITE_MULTIPLAYER_URL=ws://localhost:2567
VITE_MULTIPLAYER_ENABLED=true
VITE_ROBINHOODCHAIN_NAME=RobinhoodChain
VITE_ROBINHOODCHAIN_CHAIN_ID=0x...
VITE_ROBINHOODCHAIN_RPC=https://...
VITE_ROBINHOODCHAIN_EXPLORER=https://...
VITE_ROBINHOODCHAIN_SYMBOL=RHC
VITE_ARENA_POOL_ADDRESS=0x...
VITE_API_BASE_URL=http://localhost:2567
VITE_SEASON_ID=1
```

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | `A`/`D` or `←`/`→` | left / right pads |
| Jump / swim up | `Space` (or `↑`/`W`) | ▲ button |
| Rotate gravity 90° | `Shift` (or `R`) | ⟳ button |
| Fire shock sabotage | `E` | ⚡ button |
| Deploy / start | tap / click | tap |

Rotating flips gravity a quarter-turn in your facing direction — the whole world
becomes a new axis to walk on. Over-rotate 3× fast and the camera goes *nauseous*
and locks you out briefly, exactly like the original.

Arena enhancements now include a chamber-10 race target, live rank, pre-match
countdown, elite gauntlets every 5 chambers, coin streaks, perfect-chamber
bonuses, local skin/shield progression, and rotating PvP sabotage:
`Shock Jam`, `Gravity Scramble`, `Shadow Clone`, and `Arrow Rush`.

The Pool console unlocks pool-funded Web3 actions when
`VITE_ARENA_POOL_ADDRESS` is configured: deposit to the prize pool, enter a
season, mint cosmetics, create a server-signed run claim, then mint the run badge
or claim a pool reward on-chain. Claims are EIP-712 signatures bound to the
RobinhoodChain chain id and deployed pool contract address.

---

## Architecture

```
web/                         Vite + Phaser client
  src/
    main.ts                  orchestrator: wires wallet ↔ game ↔ net via the event bus
    config.ts types.ts       shared contracts (RobinhoodChain, multiplayer, view, storage)
    events.ts app-state.ts   typed event bus + app/session state
    landing/                 marketing landing page (hero, features, how-to, roadmap, FAQ)
    wallet/                  MetaMask: detect, connect, personal_sign, session, UI
    game/                    Phaser 3 game
      constants.ts           tuned gameplay constants (from the original Unity build)
      config.ts index.ts     game config + launchGame() → GameHandle
      systems/               orientation (Strategy A gravity), seeded chamber generator
      entities/              Ninja (rotated-frame physics), RemoteGhost (interpolated)
      scenes/                Boot → Preload(procedural art) → Menu → Play + Hud
    net/                     Colyseus client (resilient; solo fallback)
    pwa/                     service-worker registration
  docs/GAMEPLAY_SPEC.md      the faithful mechanics spec extracted from the Unity C#
server/                      Colyseus authoritative arena (shared world seed + live relay)
```

**Multiplayer model:** every player in a room shares one seeded world, so the
endless chambers are identical for everyone. Each client simulates its own ninja
and streams its transform, score, chamber progress and sabotage events (~15 Hz);
the server relays them so you see other players as live translucent **ghosts**
racing the same gauntlet.

**Gravity/rotation (Strategy A):** the physics world stays axis-aligned; an
integer `orientation ∈ {0,1,2,3}` remaps the ninja's local frame to world axes,
gravity is applied as a constant velocity (not acceleration), and the camera
counter-rotates so the current gravity always looks "down".

Faithful to the original tuning: `MOVE_GROUND=58`, `GRAVITY=54`,
`JUMP=[54,64]`, water `×0.43`, nitro `+43`, and the rest live in
[`src/game/constants.ts`](src/game/constants.ts) — see
[`docs/GAMEPLAY_SPEC.md`](docs/GAMEPLAY_SPEC.md).
