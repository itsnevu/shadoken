# Shadoken Contracts

Pool-funded RobinhoodChain mainnet contracts for the web game.

## Build

```bash
npm install
npm run build
```

The compiler writes `artifacts/ShadokenArenaPool.json`.

## Test

```bash
npm test
```

24 Hardhat tests cover pool accounting, entry-fee splits, EIP-712 claim
verification (bad signer, wrong player, tampered fields, replay, expiry),
reward caps and per-season payout limits, cosmetics pricing, pause and the
owner-only admin surface. Hardhat is used for tests only — deployment stays on
the dependency-light `scripts/` pipeline.

## Deploy RobinhoodChain Mainnet

```bash
ROBINHOODCHAIN_RPC_URL=https://...
ROBINHOODCHAIN_CHAIN_ID=...
DEPLOYER_PRIVATE_KEY=0x...
INITIAL_OWNER=0x...
RUN_CLAIM_SIGNER_ADDRESS=0x...
TREASURY_ADDRESS=0x...
TOKEN_BASE_URI=https://your-server.example/api/metadata/{id}.json
npm run deploy:mainnet
```

Deployment writes `deployments/robinhoodchain-mainnet.json`.

## Contract

`ShadokenArenaPool` includes:

- prize pool deposits
- season entry fees
- EIP-712 server-signed run claims
- pool reward payout caps per season
- one paid reward per player per season
- OpenZeppelin ERC1155 badges and cosmetics
- Ownable2Step admin transfer
- pause/unpause emergency stop
- ReentrancyGuard on payable/claim paths
- per-season pool accounting

## How a run becomes a claim

Gameplay is a client-authoritative relay, so nothing a client reports at claim
time is trusted. The flow is:

1. `ArenaRoom` observes the run (monotonic score, chambers, server-clocked
   duration) and on `run-end`/disconnect files it in the in-memory run registry
   — implausible runs are dropped there and never become claimable.
2. The room sends that one client a `run-ticket` (single-use, 30 min TTL).
3. The player fetches `GET /api/run-claim/challenge` and signs the statement
   with their wallet (`personal_sign`, no gas) — proving wallet ownership.
4. `POST /api/run-claim` verifies the signature, spends the ticket, and signs
   EIP-712 over **the server's own record** of the run.
5. `claimRun` on-chain verifies the signer, the `msg.sender`, the deadline and
   the runId replay guard before minting a badge or paying from the pool.

Required server env for run claims:

```bash
RUN_CLAIM_SIGNER_PRIVATE_KEY=0x...
RUN_CLAIM_SIGNING_ENABLED=true
ROBINHOODCHAIN_CHAIN_ID=...
ARENA_POOL_ADDRESS=0x...
SEASON_ID=1
RUN_REWARD_WEI=0
RUN_CLAIM_TTL_SECONDS=3600
TOKEN_METADATA_BASE_URL=https://your-server.example
```

Required web env after deployment:

```bash
VITE_ARENA_POOL_ADDRESS=0x...
VITE_API_BASE_URL=http://localhost:2567
VITE_SEASON_ID=1
```

Mainnet rule: do not use the deployer wallet as `RUN_CLAIM_SIGNER_ADDRESS`.
Use a separate hot signer for server claims and keep owner/treasury in secured
wallets.

Audit note: `RUN_CLAIM_SIGNING_ENABLED` is intentionally opt-in because the
current game simulation is client-authoritative. Keep `RUN_REWARD_WEI=0` until
server-side replay validation or another authoritative anti-cheat gate is added;
the contract still caps reward size and limits paid rewards to once per player
per season.

Keep `RUN_REWARD_WEI=0` until the backend run-verification path is authoritative
enough for real-money payouts. Badges can be signed first; rewards can be
enabled later without redeploying the contract.
