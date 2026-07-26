// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title ShadokenArenaPool
/// @notice Mainnet-focused RobinhoodChain pool rewards + achievement/cosmetic ERC1155.
/// @dev Gameplay stays off-chain. Server signs verified run results; the contract mints badges and pays from season pools.
contract ShadokenArenaPool is ERC1155, ERC1155Supply, Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_REWARD_BPS_PER_CLAIM = 2_000;
    uint256 public constant BADGE_MAX_ID = 999;
    uint256 public constant COSMETIC_MIN_ID = 1_000;

    bytes32 public constant RUN_CLAIM_TYPEHASH = keccak256(
        "RunClaim(address player,uint256 seasonId,bytes32 runId,uint256 score,uint256 chambers,uint256 survivedMs,uint256 seed,uint256 badgeId,uint256 rewardWei,uint256 deadline)"
    );

    struct Season {
        uint256 entryFee;
        uint256 rewardBpsPerClaim;
        uint256 treasuryBps;
        bool open;
        uint256 entries;
        uint256 poolBalance;
        uint256 rewardPaid;
    }

    struct RunClaim {
        address player;
        uint256 seasonId;
        bytes32 runId;
        uint256 score;
        uint256 chambers;
        uint256 survivedMs;
        uint256 seed;
        uint256 badgeId;
        uint256 rewardWei;
        uint256 deadline;
    }

    string public name = "Shadoken Arena";
    string public symbol = "SHADO";
    address public treasury;
    uint256 public totalPoolBalance;
    uint256 public mintFeeBpsToPool = 5_000;

    mapping(uint256 seasonId => Season) public seasons;
    mapping(address signer => bool allowed) public signers;
    mapping(bytes32 runId => bool used) public usedRunIds;
    mapping(uint256 seasonId => mapping(address player => bool claimed)) public seasonRewardClaimed;
    mapping(uint256 tokenId => uint256 price) public cosmeticPrice;

    event PoolDeposit(address indexed from, uint256 indexed seasonId, uint256 amount);
    event TournamentEntry(address indexed player, uint256 indexed seasonId, uint256 amount, uint256 toPool, uint256 toTreasury);
    event RunClaimed(
        address indexed player,
        uint256 indexed seasonId,
        bytes32 indexed runId,
        uint256 score,
        uint256 chambers,
        uint256 badgeId,
        uint256 reward
    );
    event CosmeticMinted(address indexed player, uint256 indexed seasonId, uint256 indexed tokenId, uint256 amount, uint256 price);
    event SignerUpdated(address indexed signer, bool allowed);
    event SeasonUpdated(uint256 indexed seasonId, uint256 entryFee, uint256 rewardBpsPerClaim, uint256 treasuryBps, bool open);
    event TreasuryUpdated(address indexed treasury);
    event MintFeeSplitUpdated(uint256 poolBps);
    event UnallocatedSwept(address indexed to, uint256 amount);

    constructor(address initialOwner, address initialSigner, address treasury_, string memory baseUri_)
        ERC1155(baseUri_)
        Ownable(initialOwner == address(0) ? msg.sender : initialOwner)
        EIP712("ShadokenArenaPool", "1")
    {
        treasury = treasury_ == address(0) ? owner() : treasury_;
        if (initialSigner != address(0)) {
            signers[initialSigner] = true;
            emit SignerUpdated(initialSigner, true);
        }
        _configureSeason(1, 0, 800, 0, true);
        emit TreasuryUpdated(treasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setURI(string calldata next) external onlyOwner {
        _setURI(next);
        emit URI(next, 0);
    }

    function setTreasury(address next) external onlyOwner {
        require(next != address(0), "ZERO_TREASURY");
        treasury = next;
        emit TreasuryUpdated(next);
    }

    function setSigner(address signer, bool allowed) external onlyOwner {
        require(signer != address(0), "ZERO_SIGNER");
        signers[signer] = allowed;
        emit SignerUpdated(signer, allowed);
    }

    function setMintFeeBpsToPool(uint256 next) external onlyOwner {
        require(next <= BPS_DENOMINATOR, "BPS");
        mintFeeBpsToPool = next;
        emit MintFeeSplitUpdated(next);
    }

    function setCosmeticPrice(uint256 tokenId, uint256 price) external onlyOwner {
        require(tokenId >= COSMETIC_MIN_ID, "BADGE_RESERVED");
        cosmeticPrice[tokenId] = price;
    }

    function configureSeason(uint256 seasonId, uint256 entryFee, uint256 rewardBpsPerClaim, uint256 treasuryBps, bool open)
        external
        onlyOwner
    {
        _configureSeason(seasonId, entryFee, rewardBpsPerClaim, treasuryBps, open);
    }

    function depositToPool(uint256 seasonId) external payable nonReentrant whenNotPaused {
        _depositPool(msg.sender, seasonId, msg.value);
    }

    function enterTournament(uint256 seasonId) external payable nonReentrant whenNotPaused {
        Season storage season = seasons[seasonId];
        require(season.open, "SEASON_CLOSED");
        require(msg.value == season.entryFee, "BAD_ENTRY_FEE");
        season.entries++;

        uint256 toTreasury = (msg.value * season.treasuryBps) / BPS_DENOMINATOR;
        uint256 toPool = msg.value - toTreasury;
        if (toPool > 0) _depositPool(msg.sender, seasonId, toPool);
        if (toTreasury > 0) _sendValue(treasury, toTreasury);

        emit TournamentEntry(msg.sender, seasonId, msg.value, toPool, toTreasury);
    }

    function mintCosmetic(uint256 seasonId, uint256 tokenId, uint256 amount) external payable nonReentrant whenNotPaused {
        require(seasons[seasonId].open, "SEASON_CLOSED");
        require(tokenId >= COSMETIC_MIN_ID, "BADGE_RESERVED");
        require(amount > 0, "ZERO_AMOUNT");
        uint256 total = cosmeticPrice[tokenId] * amount;
        require(total > 0, "PRICE_NOT_SET");
        require(msg.value == total, "BAD_PRICE");

        uint256 toPool = (msg.value * mintFeeBpsToPool) / BPS_DENOMINATOR;
        uint256 toTreasury = msg.value - toPool;
        if (toPool > 0) _depositPool(msg.sender, seasonId, toPool);
        if (toTreasury > 0) _sendValue(treasury, toTreasury);

        _mint(msg.sender, tokenId, amount, "");
        emit CosmeticMinted(msg.sender, seasonId, tokenId, amount, msg.value);
    }

    function claimRun(RunClaim calldata claim, bytes calldata signature) external nonReentrant whenNotPaused {
        require(claim.player == msg.sender, "WRONG_PLAYER");
        require(block.timestamp <= claim.deadline, "CLAIM_EXPIRED");
        require(!usedRunIds[claim.runId], "RUN_USED");
        require(claim.badgeId > 0 && claim.badgeId <= BADGE_MAX_ID, "BAD_BADGE");

        Season storage season = seasons[claim.seasonId];
        require(season.open, "SEASON_CLOSED");
        address signer = _hashTypedDataV4(_claimStructHash(claim)).recover(signature);
        require(signers[signer], "BAD_SIGNATURE");

        usedRunIds[claim.runId] = true;
        _mint(claim.player, claim.badgeId, 1, "");

        uint256 reward = claim.rewardWei;
        if (reward > 0) {
            require(!seasonRewardClaimed[claim.seasonId][claim.player], "SEASON_REWARD_CLAIMED");
            uint256 maxReward = (season.poolBalance * season.rewardBpsPerClaim) / BPS_DENOMINATOR;
            require(reward <= maxReward, "REWARD_OVER_CAP");
            require(reward <= season.poolBalance, "POOL_LOW");
            seasonRewardClaimed[claim.seasonId][claim.player] = true;
            season.poolBalance -= reward;
            season.rewardPaid += reward;
            totalPoolBalance -= reward;
            _sendValue(claim.player, reward);
        }

        emit RunClaimed(claim.player, claim.seasonId, claim.runId, claim.score, claim.chambers, claim.badgeId, reward);
    }

    function sweepUnallocated(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "ZERO_TO");
        uint256 unallocated = address(this).balance - totalPoolBalance;
        require(amount <= unallocated, "RESERVED_POOL");
        _sendValue(to, amount);
        emit UnallocatedSwept(to, amount);
    }

    function _configureSeason(uint256 seasonId, uint256 entryFee, uint256 rewardBpsPerClaim, uint256 treasuryBps, bool open) private {
        require(seasonId != 0, "ZERO_SEASON");
        require(rewardBpsPerClaim <= MAX_REWARD_BPS_PER_CLAIM, "REWARD_BPS");
        require(treasuryBps <= BPS_DENOMINATOR, "TREASURY_BPS");
        Season storage season = seasons[seasonId];
        season.entryFee = entryFee;
        season.rewardBpsPerClaim = rewardBpsPerClaim;
        season.treasuryBps = treasuryBps;
        season.open = open;
        emit SeasonUpdated(seasonId, entryFee, rewardBpsPerClaim, treasuryBps, open);
    }

    function _depositPool(address from, uint256 seasonId, uint256 amount) private {
        require(amount > 0, "ZERO_DEPOSIT");
        require(seasons[seasonId].open, "SEASON_CLOSED");
        seasons[seasonId].poolBalance += amount;
        totalPoolBalance += amount;
        emit PoolDeposit(from, seasonId, amount);
    }

    function _claimStructHash(RunClaim calldata claim) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                RUN_CLAIM_TYPEHASH,
                claim.player,
                claim.seasonId,
                claim.runId,
                claim.score,
                claim.chambers,
                claim.survivedMs,
                claim.seed,
                claim.badgeId,
                claim.rewardWei,
                claim.deadline
            )
        );
    }

    function _sendValue(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "NATIVE_SEND_FAILED");
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
        whenNotPaused
    {
        super._update(from, to, ids, values);
    }
}
