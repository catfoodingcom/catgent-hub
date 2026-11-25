// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PullOracleConsumerStandardStorage} from "pull-oracle-consumer/PullOracleConsumerStandardStorage.sol";

/// @title CatVerdicts
/// @notice The cat's verdicts on tokenized stocks, recorded on-chain next to an oracle price this contract
///         has verified itself. Each record carries Atlas Oracle's signed price for the token (checked here:
///         signature from an authorized Atlas signer, and fresh), the real share price the cat compared it
///         with, and the gap between them, worked out on-chain.
/// @dev The contract holds the cat to its own price rule: it rejects a "fair" verdict (WATCH) whenever the
///      verified oracle price is further than `maxPremiumBps` from the stated real share price. The real
///      share price is the cat's input (US stocks have no on-chain feed here); the token price is not.
///      Only the cat's attester key records; the owner can change the attester, the price rule and the
///      Atlas signer set. Holds no funds.
contract CatVerdicts is PullOracleConsumerStandardStorage, Ownable2Step {
    enum Verdict {
        REFUSE, // not fair food
        WAIT, // can't be proven fair yet (e.g. the real share isn't trading)
        WATCH // real, fairly priced, checks pass
    }

    struct Record {
        Verdict verdict;
        uint64 recordedAt;
        uint64 oracleTimestamp;
        int32 premiumBps;
        uint16 failedChecks;
        uint256 oraclePrice; // 18 decimals
        uint256 realPrice; // 18 decimals
    }

    /// @notice The cat's key: the only address that records verdicts.
    address public attester;
    /// @notice The price rule: a WATCH needs the verified price within this many basis points of the real share.
    uint16 public maxPremiumBps;
    /// @notice The latest verdict per Atlas feed.
    mapping(bytes4 feedId => Record) public latest;
    /// @notice How many verdicts each feed has had.
    mapping(bytes4 feedId => uint256) public count;

    event VerdictRecorded(
        bytes4 indexed feedId,
        Verdict verdict,
        uint256 oraclePrice,
        uint256 oracleTimestamp,
        uint256 realPrice,
        int256 premiumBps,
        uint16 failedChecks
    );
    event AttesterSet(address attester);
    event MaxPremiumSet(uint16 maxPremiumBps);

    error NotAttester();
    error LengthMismatch();
    error ZeroRealPrice();
    error ZeroAddress();
    /// @notice A WATCH ("fair") verdict that the verified oracle price contradicts.
    error VerdictContradictsOracle(bytes4 feedId, int256 premiumBps);

    constructor(address owner_, address attester_, address[] memory atlasSigners, uint16 maxPremiumBps_, uint48 maxDelay)
        PullOracleConsumerStandardStorage(20, maxDelay, 5, atlasSigners)
        Ownable(owner_)
    {
        _setAttester(attester_);
        _setMaxPremium(maxPremiumBps_);
    }

    modifier onlyAttester() {
        if (msg.sender != attester) revert NotAttester();
        _;
    }

    /// @notice Record one verdict. The transaction must carry Atlas's signed payload appended to its calldata.
    /// @param realPrice The real share price the cat compared with, 18 decimals.
    /// @param failedChecks A bit per failed check, in the order the app lists them (0 = all passed).
    function record(bytes4 feedId, Verdict verdict, uint256 realPrice, uint16 failedChecks) external onlyAttester {
        (uint256 price, uint256 ts) = _getVerifiedFeedData(feedId);
        _record(feedId, verdict, price, ts, realPrice, failedChecks);
    }

    /// @notice Record several verdicts against one signed payload (one signature check for all of them).
    function recordBatch(bytes4[] calldata feedIds, Verdict[] calldata verdicts, uint256[] calldata realPrices, uint16[] calldata failedChecks)
        external
        onlyAttester
    {
        uint256 n = feedIds.length;
        if (verdicts.length != n || realPrices.length != n || failedChecks.length != n) revert LengthMismatch();
        bytes4[] memory ids = feedIds;
        (uint256[] memory prices, uint256[] memory tss) = _getVerifiedFeedDataBatch(ids);
        for (uint256 i; i < n; ++i) {
            _record(feedIds[i], verdicts[i], prices[i], tss[i], realPrices[i], failedChecks[i]);
        }
    }

    /// @notice The gap between a token price and the real share price, in basis points (negative = below).
    function premiumBpsOf(uint256 oraclePrice, uint256 realPrice) public pure returns (int256) {
        if (realPrice == 0) revert ZeroRealPrice();
        return (SafeCast.toInt256(oraclePrice) * 10_000) / SafeCast.toInt256(realPrice) - 10_000;
    }

    function _record(bytes4 feedId, Verdict verdict, uint256 price, uint256 ts, uint256 realPrice, uint16 failedChecks) private {
        int256 premiumBps = premiumBpsOf(price, realPrice);
        uint256 gap = premiumBps < 0 ? uint256(-premiumBps) : uint256(premiumBps);
        if (verdict == Verdict.WATCH && (gap > maxPremiumBps || failedChecks != 0)) revert VerdictContradictsOracle(feedId, premiumBps);

        latest[feedId] = Record({
            verdict: verdict,
            recordedAt: uint64(block.timestamp),
            oracleTimestamp: SafeCast.toUint64(ts),
            premiumBps: SafeCast.toInt32(premiumBps),
            failedChecks: failedChecks,
            oraclePrice: price,
            realPrice: realPrice
        });
        unchecked {
            ++count[feedId];
        }
        emit VerdictRecorded(feedId, verdict, price, ts, realPrice, premiumBps, failedChecks);
    }

    // ---- owner settings ----

    function setAttester(address attester_) external onlyOwner {
        _setAttester(attester_);
    }

    function setMaxPremium(uint16 maxPremiumBps_) external onlyOwner {
        _setMaxPremium(maxPremiumBps_);
    }

    /// @notice Add or remove an Atlas signer (Atlas rotates its key from time to time).
    function setAtlasSigner(address signer, bool status) external onlyOwner {
        _setSignerStatus(signer, status);
    }

    function setMaxDelay(uint48 maxDelay) external onlyOwner {
        _setMaxDelay(maxDelay);
    }

    function _setAttester(address attester_) private {
        if (attester_ == address(0)) revert ZeroAddress();
        attester = attester_;
        emit AttesterSet(attester_);
    }

    function _setMaxPremium(uint16 maxPremiumBps_) private {
        maxPremiumBps = maxPremiumBps_;
        emit MaxPremiumSet(maxPremiumBps_);
    }
}
