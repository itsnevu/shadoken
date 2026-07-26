// Run with: npm test  (node --test via tsx)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, TypedDataEncoder, verifyTypedData } from 'ethers';

import { claimStatement, consumeRunTicket, fileRun, isPlausibleRun, peekRunTicket } from '../src/run-registry.js';
import { createRunClaim } from '../src/run-claims.js';

const player = Wallet.createRandom();
const serverSigner = Wallet.createRandom();
const POOL = '0x1111111111111111111111111111111111111111';

process.env.RUN_CLAIM_SIGNING_ENABLED = 'true';
process.env.RUN_CLAIM_SIGNER_PRIVATE_KEY = serverSigner.privateKey;
process.env.ROBINHOODCHAIN_CHAIN_ID = '31337';
process.env.ARENA_POOL_ADDRESS = POOL;
process.env.SEASON_ID = '1';

/** A run good enough to earn a badge, filed the way ArenaRoom files one. */
function fileGoodRun(overrides: Partial<Parameters<typeof fileRun>[0]> = {}) {
  return fileRun({
    wallet: player.address,
    name: 'tester',
    score: 900,
    chambers: 12,
    survivedMs: 120_000,
    seed: 42,
    roomId: 'room1',
    sessionId: 'sess1',
    ...overrides,
  });
}

async function signStatement(runId: string, wallet = player) {
  return wallet.signMessage(claimStatement(runId, wallet.address));
}

test('plausibility rejects impossible runs', () => {
  assert.equal(isPlausibleRun(900, 12, 120_000), true);
  assert.equal(isPlausibleRun(9_000_000, 12, 120_000), false, 'score far above the per-second ceiling');
  assert.equal(isPlausibleRun(100, 5_000, 120_000), false, 'chambers far above the per-minute ceiling');
  assert.equal(isPlausibleRun(100, 1, 500), false, 'run shorter than the minimum');
});

test('fileRun refuses runs without a valid wallet or with fabricated numbers', () => {
  assert.equal(fileGoodRun({ wallet: '' }), null);
  assert.equal(fileGoodRun({ wallet: 'not-an-address' }), null);
  assert.equal(fileGoodRun({ score: 0 }), null);
  assert.equal(fileGoodRun({ score: 10_000_000 }), null);
});

test('a ticket is single-use and wallet-bound', () => {
  const ticket = fileGoodRun();
  assert.ok(ticket);
  assert.equal(peekRunTicket(ticket.runId)?.score, 900);
  assert.throws(() => consumeRunTicket(ticket.runId, Wallet.createRandom().address), /different wallet/);
  assert.equal(consumeRunTicket(ticket.runId, player.address).runId, ticket.runId);
  assert.throws(() => consumeRunTicket(ticket.runId, player.address), /unknown, expired or already claimed/);
});

test('claim signs the run the SERVER recorded, and the payload verifies on-chain terms', async () => {
  const ticket = fileGoodRun();
  assert.ok(ticket);
  const claim = await createRunClaim({
    runId: ticket.runId,
    wallet: player.address,
    signature: await signStatement(ticket.runId),
  });

  assert.equal(claim.payload.player, player.address);
  assert.equal(claim.payload.runId, ticket.runId);
  assert.equal(claim.payload.score, 900);
  assert.equal(claim.payload.chambers, 12);
  assert.equal(claim.signer, serverSigner.address);
  assert.equal(claim.payload.badgeId, 3);

  const recovered = verifyTypedData(claim.typedData.domain, claim.typedData.types, claim.payload, claim.signature);
  assert.equal(recovered, serverSigner.address);
  assert.equal(claim.digest, TypedDataEncoder.hash(claim.typedData.domain, claim.typedData.types, claim.payload));
});

test('claim ignores any score the caller tries to smuggle in', async () => {
  const ticket = fileGoodRun();
  assert.ok(ticket);
  const claim = await createRunClaim({
    runId: ticket.runId,
    wallet: player.address,
    signature: await signStatement(ticket.runId),
    // Extra fields are not part of RunClaimRequest — they must have no effect.
    ...({ score: 9_999_999, chambers: 999, badgeId: 4 } as object),
  });
  assert.equal(claim.payload.score, 900);
  assert.equal(claim.payload.chambers, 12);
});

test('claim rejects a signature from another wallet', async () => {
  const ticket = fileGoodRun();
  assert.ok(ticket);
  const impostor = Wallet.createRandom();
  await assert.rejects(
    createRunClaim({
      runId: ticket.runId,
      wallet: player.address,
      signature: await impostor.signMessage(claimStatement(ticket.runId, player.address)),
    }),
    /Signature does not match the wallet/,
  );
  // A failed signature must NOT burn the ticket.
  assert.ok(peekRunTicket(ticket.runId));
});

test('claim rejects a signature over a different run', async () => {
  const a = fileGoodRun();
  const b = fileGoodRun({ sessionId: 'sess2' });
  assert.ok(a && b);
  await assert.rejects(
    createRunClaim({ runId: a.runId, wallet: player.address, signature: await signStatement(b.runId) }),
    /Signature does not match the wallet/,
  );
});

test('claim rejects an unknown run and malformed input', async () => {
  const unknown = `0x${'ab'.repeat(32)}`;
  await assert.rejects(
    createRunClaim({ runId: unknown, wallet: player.address, signature: await signStatement(unknown) }),
    /unknown, expired or already claimed/,
  );
  await assert.rejects(createRunClaim({ runId: '0xdead', wallet: player.address, signature: '0x' }), /valid runId/);
});

test('claim refuses to sign while signing is disabled', async () => {
  const ticket = fileGoodRun();
  assert.ok(ticket);
  process.env.RUN_CLAIM_SIGNING_ENABLED = 'false';
  await assert.rejects(
    createRunClaim({
      runId: ticket.runId,
      wallet: player.address,
      signature: await signStatement(ticket.runId),
    }),
    /RUN_CLAIM_SIGNING_ENABLED/,
  );
  process.env.RUN_CLAIM_SIGNING_ENABLED = 'true';
});
