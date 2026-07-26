const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const SEASON = 1n;
const BADGE = 3n;
const ONE = ethers.parseEther('1');

const CLAIM_TYPES = {
  RunClaim: [
    { name: 'player', type: 'address' },
    { name: 'seasonId', type: 'uint256' },
    { name: 'runId', type: 'bytes32' },
    { name: 'score', type: 'uint256' },
    { name: 'chambers', type: 'uint256' },
    { name: 'survivedMs', type: 'uint256' },
    { name: 'seed', type: 'uint256' },
    { name: 'badgeId', type: 'uint256' },
    { name: 'rewardWei', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

async function deployFixture() {
  const [owner, signer, treasury, player, other] = await ethers.getSigners();
  const Pool = await ethers.getContractFactory('ShadokenArenaPool');
  const pool = await Pool.deploy(owner.address, signer.address, treasury.address, 'https://x/api/metadata/{id}.json');
  await pool.waitForDeployment();
  return { pool, owner, signer, treasury, player, other };
}

async function makeClaim(pool, signer, overrides = {}) {
  const deadline = (await time.latest()) + 3600;
  const claim = {
    player: overrides.player ?? (await ethers.getSigners())[3].address,
    seasonId: SEASON,
    runId: overrides.runId ?? ethers.hexlify(ethers.randomBytes(32)),
    score: 900n,
    chambers: 12n,
    survivedMs: 90_000n,
    seed: 42n,
    badgeId: BADGE,
    rewardWei: 0n,
    deadline: BigInt(deadline),
    ...overrides,
  };
  const domain = {
    name: 'ShadokenArenaPool',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await pool.getAddress(),
  };
  const signature = await signer.signTypedData(domain, CLAIM_TYPES, claim);
  return { claim, signature };
}

describe('ShadokenArenaPool', () => {
  describe('deployment', () => {
    it('wires owner, signer and treasury and opens season 1', async () => {
      const { pool, owner, signer, treasury } = await loadFixture(deployFixture);
      expect(await pool.owner()).to.equal(owner.address);
      expect(await pool.signers(signer.address)).to.equal(true);
      expect(await pool.treasury()).to.equal(treasury.address);
      const season = await pool.seasons(SEASON);
      expect(season.open).to.equal(true);
      expect(season.rewardBpsPerClaim).to.equal(800n);
    });
  });

  describe('pool accounting', () => {
    it('credits deposits to the season and the global total', async () => {
      const { pool, player } = await loadFixture(deployFixture);
      await expect(pool.connect(player).depositToPool(SEASON, { value: ONE }))
        .to.emit(pool, 'PoolDeposit')
        .withArgs(player.address, SEASON, ONE);
      expect(await pool.totalPoolBalance()).to.equal(ONE);
      expect((await pool.seasons(SEASON)).poolBalance).to.equal(ONE);
    });

    it('splits entry fees between pool and treasury', async () => {
      const { pool, owner, treasury, player } = await loadFixture(deployFixture);
      await pool.connect(owner).configureSeason(SEASON, ONE, 800, 2_500, true);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await pool.connect(player).enterTournament(SEASON, { value: ONE });
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + ONE / 4n);
      expect(await pool.totalPoolBalance()).to.equal((ONE * 3n) / 4n);
      // Index 4 is Season.entries — the name collides with Result.entries().
      expect((await pool.seasons(SEASON))[4]).to.equal(1n);
    });

    it('rejects a wrong entry fee', async () => {
      const { pool, owner, player } = await loadFixture(deployFixture);
      await pool.connect(owner).configureSeason(SEASON, ONE, 800, 0, true);
      await expect(pool.connect(player).enterTournament(SEASON, { value: ONE / 2n })).to.be.revertedWith('BAD_ENTRY_FEE');
    });

    it('never lets the owner sweep pooled funds', async () => {
      const { pool, owner, player } = await loadFixture(deployFixture);
      await pool.connect(player).depositToPool(SEASON, { value: ONE });
      await expect(pool.connect(owner).sweepUnallocated(owner.address, 1n)).to.be.revertedWith('RESERVED_POOL');
    });
  });

  describe('claimRun', () => {
    it('mints the badge for a valid server signature', async () => {
      const { pool, signer, player } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address });
      await expect(pool.connect(player).claimRun(claim, signature)).to.emit(pool, 'RunClaimed');
      expect(await pool.balanceOf(player.address, BADGE)).to.equal(1n);
      expect(await pool.usedRunIds(claim.runId)).to.equal(true);
    });

    it('rejects a claim signed by an unauthorised key', async () => {
      const { pool, other, player } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, other, { player: player.address });
      await expect(pool.connect(player).claimRun(claim, signature)).to.be.revertedWith('BAD_SIGNATURE');
    });

    it('rejects a claim submitted by anyone but the named player', async () => {
      const { pool, signer, player, other } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address });
      await expect(pool.connect(other).claimRun(claim, signature)).to.be.revertedWith('WRONG_PLAYER');
    });

    it('rejects tampered claim fields', async () => {
      const { pool, signer, player } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address });
      await expect(pool.connect(player).claimRun({ ...claim, score: 999_999n }, signature)).to.be.revertedWith(
        'BAD_SIGNATURE',
      );
    });

    it('refuses to replay the same runId', async () => {
      const { pool, signer, player } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address });
      await pool.connect(player).claimRun(claim, signature);
      await expect(pool.connect(player).claimRun(claim, signature)).to.be.revertedWith('RUN_USED');
    });

    it('rejects an expired claim', async () => {
      const { pool, signer, player } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, signer, {
        player: player.address,
        deadline: BigInt((await time.latest()) + 60),
      });
      await time.increase(120);
      await expect(pool.connect(player).claimRun(claim, signature)).to.be.revertedWith('CLAIM_EXPIRED');
    });

    it('rejects a cosmetic id dressed up as a badge', async () => {
      const { pool, signer, player } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address, badgeId: 1_000n });
      await expect(pool.connect(player).claimRun(claim, signature)).to.be.revertedWith('BAD_BADGE');
    });
  });

  describe('claimRun rewards', () => {
    it('pays from the season pool and debits the accounting', async () => {
      const { pool, signer, player, other } = await loadFixture(deployFixture);
      await pool.connect(other).depositToPool(SEASON, { value: ONE });
      const reward = (ONE * 800n) / 10_000n; // exactly the 8% per-claim cap
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address, rewardWei: reward });

      await expect(pool.connect(player).claimRun(claim, signature)).to.changeEtherBalance(player, reward);
      expect(await pool.totalPoolBalance()).to.equal(ONE - reward);
      const season = await pool.seasons(SEASON);
      expect(season.poolBalance).to.equal(ONE - reward);
      expect(season.rewardPaid).to.equal(reward);
    });

    it('rejects a reward above the per-claim cap', async () => {
      const { pool, signer, player, other } = await loadFixture(deployFixture);
      await pool.connect(other).depositToPool(SEASON, { value: ONE });
      const reward = (ONE * 800n) / 10_000n + 1n;
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address, rewardWei: reward });
      await expect(pool.connect(player).claimRun(claim, signature)).to.be.revertedWith('REWARD_OVER_CAP');
    });

    it('pays a wallet at most once per season', async () => {
      const { pool, signer, player, other } = await loadFixture(deployFixture);
      await pool.connect(other).depositToPool(SEASON, { value: ONE });
      const reward = (ONE * 100n) / 10_000n;
      const first = await makeClaim(pool, signer, { player: player.address, rewardWei: reward });
      await pool.connect(player).claimRun(first.claim, first.signature);
      const second = await makeClaim(pool, signer, { player: player.address, rewardWei: reward });
      await expect(pool.connect(player).claimRun(second.claim, second.signature)).to.be.revertedWith(
        'SEASON_REWARD_CLAIMED',
      );
    });

    it('still mints badges for a zero-reward claim after a paid one', async () => {
      const { pool, signer, player, other } = await loadFixture(deployFixture);
      await pool.connect(other).depositToPool(SEASON, { value: ONE });
      const paid = await makeClaim(pool, signer, { player: player.address, rewardWei: (ONE * 100n) / 10_000n });
      await pool.connect(player).claimRun(paid.claim, paid.signature);
      const badgeOnly = await makeClaim(pool, signer, { player: player.address, badgeId: 4n, rewardWei: 0n });
      await pool.connect(player).claimRun(badgeOnly.claim, badgeOnly.signature);
      expect(await pool.balanceOf(player.address, 4n)).to.equal(1n);
    });
  });

  describe('cosmetics', () => {
    it('mints at the configured price and splits the proceeds', async () => {
      const { pool, owner, treasury, player } = await loadFixture(deployFixture);
      await pool.connect(owner).setCosmeticPrice(1_001n, ONE);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await pool.connect(player).mintCosmetic(SEASON, 1_001n, 2n, { value: ONE * 2n });
      expect(await pool.balanceOf(player.address, 1_001n)).to.equal(2n);
      expect(await pool.totalPoolBalance()).to.equal(ONE); // 50% mintFeeBpsToPool
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + ONE);
    });

    it('refuses to price a badge id as a cosmetic', async () => {
      const { pool, owner } = await loadFixture(deployFixture);
      await expect(pool.connect(owner).setCosmeticPrice(5n, ONE)).to.be.revertedWith('BADGE_RESERVED');
    });

    it('rejects an underpaid mint', async () => {
      const { pool, owner, player } = await loadFixture(deployFixture);
      await pool.connect(owner).setCosmeticPrice(1_001n, ONE);
      await expect(pool.connect(player).mintCosmetic(SEASON, 1_001n, 1n, { value: ONE - 1n })).to.be.revertedWith(
        'BAD_PRICE',
      );
    });
  });

  describe('admin', () => {
    it('halts deposits and claims while paused', async () => {
      const { pool, owner, signer, player } = await loadFixture(deployFixture);
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address });
      await pool.connect(owner).pause();
      await expect(pool.connect(player).depositToPool(SEASON, { value: ONE })).to.be.revertedWithCustomError(
        pool,
        'EnforcedPause',
      );
      await expect(pool.connect(player).claimRun(claim, signature)).to.be.revertedWithCustomError(pool, 'EnforcedPause');
      await pool.connect(owner).unpause();
      await pool.connect(player).claimRun(claim, signature);
      expect(await pool.balanceOf(player.address, BADGE)).to.equal(1n);
    });

    it('keeps admin surface owner-only', async () => {
      const { pool, other } = await loadFixture(deployFixture);
      await expect(pool.connect(other).pause()).to.be.revertedWithCustomError(pool, 'OwnableUnauthorizedAccount');
      await expect(pool.connect(other).setSigner(other.address, true)).to.be.revertedWithCustomError(
        pool,
        'OwnableUnauthorizedAccount',
      );
      await expect(pool.connect(other).configureSeason(2n, 0, 800, 0, true)).to.be.revertedWithCustomError(
        pool,
        'OwnableUnauthorizedAccount',
      );
    });

    it('revoking a signer invalidates its future claims', async () => {
      const { pool, owner, signer, player } = await loadFixture(deployFixture);
      await pool.connect(owner).setSigner(signer.address, false);
      const { claim, signature } = await makeClaim(pool, signer, { player: player.address });
      await expect(pool.connect(player).claimRun(claim, signature)).to.be.revertedWith('BAD_SIGNATURE');
    });

    it('caps the reward bps an owner can configure', async () => {
      const { pool, owner } = await loadFixture(deployFixture);
      await expect(pool.connect(owner).configureSeason(2n, 0, 2_001, 0, true)).to.be.revertedWith('REWARD_BPS');
    });

    it('transfers ownership in two steps', async () => {
      const { pool, owner, other } = await loadFixture(deployFixture);
      await pool.connect(owner).transferOwnership(other.address);
      expect(await pool.owner()).to.equal(owner.address);
      await pool.connect(other).acceptOwnership();
      expect(await pool.owner()).to.equal(other.address);
    });
  });
});
