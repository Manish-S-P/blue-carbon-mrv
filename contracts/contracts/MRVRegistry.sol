// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Blue carbon MRV registry with commit-reveal baselines
/// @notice A plot's counterfactual baseline is committed (hash only) BEFORE any outcome exists.
///         Credits are minted only for carbon above that baseline, after revealing it.
///         All carbon numbers are integers x1000 ("milli"): tCO2e/ha, hectares, tCO2e.
contract MRVRegistry is ERC721, AccessControl {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// Share of each new credit held back in a buffer pool, in basis points (2000 = 20%, ASSUMED).
    uint16 public immutable bufferBps;

    struct Plot {
        address owner;
        bytes32 commitment;      // keccak256(abi.encode(plotKey, baselineMilli, auditHash, salt))
        uint64 areaMilliHa;
        uint8 nQuarters;         // crediting period length
        uint64 registeredAt;
        bool revealed;
        uint256 grossIssuedMilli; // "already_issued": total additional tCO2e credited so far (before buffer)
        uint256 bufferMilli;      // total held back in the buffer
    }

    struct Observation {
        uint256 observedMilli;    // carbon stock, milli tCO2e/ha
        uint256 uncertaintyMilli; // deduction, milli tCO2e/ha
        bool exists;
    }

    struct Credit {
        bytes32 plotKey;
        uint8 quarter;
        uint256 amountMilli;      // credited to the owner (after buffer)
        uint256 bufferMilli;      // held back
        string cid;               // IPFS CID of the audit file
    }

    mapping(bytes32 => Plot) public plots;
    mapping(bytes32 => mapping(uint8 => Observation)) public observations;
    mapping(bytes32 => uint256[]) private _baselines; // filled on reveal
    mapping(uint256 => Credit) public credits;
    mapping(bytes32 => mapping(uint8 => bool)) public settled; // quarter already revealed/minted
    uint256 public nextTokenId = 1;

    event PlotRegistered(bytes32 indexed plotKey, address indexed owner, bytes32 commitment, uint64 areaMilliHa, uint8 nQuarters);
    event ObservationSubmitted(bytes32 indexed plotKey, uint8 quarter, uint256 observedMilli, uint256 uncertaintyMilli);
    event BaselineRevealed(bytes32 indexed plotKey, uint256[] baselineMilli, bytes32 auditHash, bytes32 salt);
    /// Every reveal call ends here, credit or not; cid points to the audit file pinned on IPFS.
    event QuarterSettled(bytes32 indexed plotKey, uint8 quarter, uint256 tokenId, string cid);
    event CreditMinted(uint256 indexed tokenId, bytes32 indexed plotKey, uint8 quarter, uint256 amountMilli, uint256 bufferMilli, string cid);

    error PlotExists();
    error UnknownPlot();
    error BadQuarter();
    error ObservationExists();
    error NoObservation();
    error BaselineMismatch();
    error AlreadySettled();

    constructor(address admin, uint16 bufferBps_) ERC721("Blue Carbon Credit", "BCC") {
        require(bufferBps_ <= 10000, "buffer > 100%");
        bufferBps = bufferBps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    /// @notice Step 4: only the commitment goes on-chain. The baseline and salt stay secret.
    function registerPlot(bytes32 plotKey, address owner, bytes32 commitment, uint64 areaMilliHa, uint8 nQuarters)
        external onlyRole(ORACLE_ROLE)
    {
        if (plots[plotKey].owner != address(0)) revert PlotExists();
        require(owner != address(0) && areaMilliHa > 0 && nQuarters > 0, "bad input");
        plots[plotKey] = Plot(owner, commitment, areaMilliHa, nQuarters, uint64(block.timestamp), false, 0, 0);
        emit PlotRegistered(plotKey, owner, commitment, areaMilliHa, nQuarters);
    }

    /// @notice Step 5: the oracle (backend) records one quarter's carbon estimate. Write-once.
    function submitObservation(bytes32 plotKey, uint8 quarter, uint256 observedMilli, uint256 uncertaintyMilli)
        external onlyRole(ORACLE_ROLE)
    {
        Plot storage p = plots[plotKey];
        if (p.owner == address(0)) revert UnknownPlot();
        if (quarter >= p.nQuarters) revert BadQuarter();
        if (observations[plotKey][quarter].exists) revert ObservationExists();
        observations[plotKey][quarter] = Observation(observedMilli, uncertaintyMilli, true);
        emit ObservationSubmitted(plotKey, quarter, observedMilli, uncertaintyMilli);
    }

    /// @notice Pure helper so anyone can recompute a commitment off-chain the same way.
    function computeCommitment(bytes32 plotKey, uint256[] calldata baselineMilli, bytes32 auditHash, bytes32 salt)
        public pure returns (bytes32)
    {
        return keccak256(abi.encode(plotKey, baselineMilli, auditHash, salt));
    }

    /// @notice Step 6: reveal the committed baseline and mint a credit for `quarter`.
    ///         credit = max(observed - baseline - uncertainty, 0) x area - already_issued, minus buffer.
    ///         If there is no additional carbon, the baseline is still revealed (so anyone can verify)
    ///         and the quarter is settled with tokenId 0 (no NFT).
    function revealAndMint(
        bytes32 plotKey,
        uint8 quarter,
        uint256[] calldata baselineMilli,
        bytes32 auditHash,
        bytes32 salt,
        string calldata cid
    ) external onlyRole(ORACLE_ROLE) returns (uint256 tokenId) {
        Plot storage p = plots[plotKey];
        if (p.owner == address(0)) revert UnknownPlot();
        if (quarter >= p.nQuarters || baselineMilli.length != p.nQuarters) revert BadQuarter();
        if (computeCommitment(plotKey, baselineMilli, auditHash, salt) != p.commitment) revert BaselineMismatch();
        if (settled[plotKey][quarter]) revert AlreadySettled();
        settled[plotKey][quarter] = true;

        if (!p.revealed) {
            p.revealed = true;
            _baselines[plotKey] = baselineMilli;
            emit BaselineRevealed(plotKey, baselineMilli, auditHash, salt);
        }

        (uint256 amount, uint256 buffer) = _newCredit(p, observations[plotKey][quarter], baselineMilli[quarter]);
        if (amount + buffer == 0) {
            emit QuarterSettled(plotKey, quarter, 0, cid);
            return 0;
        }

        tokenId = nextTokenId++;
        credits[tokenId] = Credit(plotKey, quarter, amount, buffer, cid);
        _safeMint(p.owner, tokenId);
        emit CreditMinted(tokenId, plotKey, quarter, amount, buffer, cid);
        emit QuarterSettled(plotKey, quarter, tokenId, cid);
    }

    /// @dev The credit rule. Carbon is a STOCK: this quarter's stock vs this quarter's baseline
    ///      (never summed over quarters). Returns (credited to owner, held in buffer).
    function _newCredit(Plot storage p, Observation memory o, uint256 baseMilli)
        internal returns (uint256 amount, uint256 buffer)
    {
        if (!o.exists) revert NoObservation();
        uint256 floor = baseMilli + o.uncertaintyMilli;
        uint256 perHa = o.observedMilli > floor ? o.observedMilli - floor : 0;
        uint256 total = (perHa * p.areaMilliHa) / 1000; // milli tCO2e
        if (total <= p.grossIssuedMilli) return (0, 0); // nothing new above what was already issued

        uint256 gross = total - p.grossIssuedMilli; // minus already_issued
        buffer = (gross * bufferBps) / 10000;
        amount = gross - buffer;
        p.grossIssuedMilli = total;
        p.bufferMilli += buffer;
    }

    function baselineOf(bytes32 plotKey) external view returns (uint256[] memory) {
        return _baselines[plotKey];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat("ipfs://", credits[tokenId].cid);
    }

    function supportsInterface(bytes4 id) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(id);
    }
}
