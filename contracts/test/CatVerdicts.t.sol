// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CatVerdicts} from "../src/CatVerdicts.sol";

contract CatVerdictsTest is Test {
    uint256 constant ATLAS_PK = 0xA71A5;
    uint256 constant ROGUE_PK = 0xBAD;
    address atlas = vm.addr(ATLAS_PK);
    address owner = makeAddr("owner");
    address cat = makeAddr("cat");

    bytes4 constant TSLAB = 0x000003a5; // feed 933
    bytes4 constant NVDAB = 0x000003a6; // feed 934
    uint16 constant MAGIC = 0x7096;

    CatVerdicts v;

    function setUp() public {
        vm.warp(1_800_000_000);
        address[] memory signers = new address[](1);
        signers[0] = atlas;
        v = new CatVerdicts(owner, cat, signers, 100, 300);
    }

    // Atlas's payload layout: [id 4B][price 10B][ts 6B]... [count 1B][sig r,s,v 65B][marker 2B];
    // the signature covers the packages and the count (raw keccak, no prefix).
    function _payload(uint256 pk, bytes4[] memory ids, uint256[] memory prices, uint256 ts) internal pure returns (bytes memory) {
        bytes memory packages;
        for (uint256 i; i < ids.length; ++i) packages = abi.encodePacked(packages, ids[i], uint80(prices[i]), uint48(ts));
        bytes32 digest = keccak256(abi.encodePacked(packages, uint8(ids.length)));
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(packages, uint8(ids.length), r, s, sv, MAGIC);
    }

    function _one(bytes4 id, uint256 price) internal pure returns (bytes4[] memory ids, uint256[] memory prices) {
        ids = new bytes4[](1);
        prices = new uint256[](1);
        ids[0] = id;
        prices[0] = price;
    }

    function _record(uint256 pk, bytes4 id, uint256 oraclePrice, uint256 ts, CatVerdicts.Verdict verdict, uint256 real, uint16 failed)
        internal
        returns (bool ok, bytes memory ret)
    {
        (bytes4[] memory ids, uint256[] memory prices) = _one(id, oraclePrice);
        bytes memory data = abi.encodePacked(abi.encodeCall(CatVerdicts.record, (id, verdict, real, failed)), _payload(pk, ids, prices, ts));
        vm.prank(cat);
        (ok, ret) = address(v).call(data);
    }

    function test_records_a_fair_verdict_with_the_verified_price() public {
        (bool ok,) = _record(ATLAS_PK, TSLAB, 380e18, block.timestamp - 10, CatVerdicts.Verdict.WATCH, 382e18, 0);
        assertTrue(ok);
        (CatVerdicts.Verdict verdict,, uint64 oracleTs, int32 premiumBps,, uint256 oraclePrice, uint256 realPrice) = v.latest(TSLAB);
        assertEq(uint8(verdict), uint8(CatVerdicts.Verdict.WATCH));
        assertEq(oraclePrice, 380e18);
        assertEq(realPrice, 382e18);
        assertEq(oracleTs, block.timestamp - 10);
        assertEq(premiumBps, -53); // 380/382 - 1 = -0.52%
        assertEq(v.count(TSLAB), 1);
    }

    function test_rejects_fair_when_the_oracle_says_otherwise() public {
        (bool ok, bytes memory ret) = _record(ATLAS_PK, TSLAB, 374e18, block.timestamp, CatVerdicts.Verdict.WATCH, 384e18, 0);
        assertFalse(ok);
        assertEq(bytes4(ret), CatVerdicts.VerdictContradictsOracle.selector);
    }

    function test_rejects_fair_with_a_failed_check() public {
        (bool ok, bytes memory ret) = _record(ATLAS_PK, TSLAB, 383e18, block.timestamp, CatVerdicts.Verdict.WATCH, 384e18, 1 << 5);
        assertFalse(ok);
        assertEq(bytes4(ret), CatVerdicts.VerdictContradictsOracle.selector);
    }

    function test_records_a_refusal_whatever_the_gap() public {
        (bool ok,) = _record(ATLAS_PK, TSLAB, 374e18, block.timestamp, CatVerdicts.Verdict.REFUSE, 384e18, 1 << 4);
        assertTrue(ok);
        (,,, int32 premiumBps, uint16 failed,,) = v.latest(TSLAB);
        assertEq(premiumBps, -261);
        assertEq(failed, 1 << 4);
    }

    function test_rejects_a_price_not_signed_by_atlas() public {
        (bool ok,) = _record(ROGUE_PK, TSLAB, 384e18, block.timestamp, CatVerdicts.Verdict.WATCH, 384e18, 0);
        assertFalse(ok);
        assertEq(v.count(TSLAB), 0);
    }

    function test_rejects_a_stale_price() public {
        (bool ok,) = _record(ATLAS_PK, TSLAB, 384e18, block.timestamp - 301, CatVerdicts.Verdict.REFUSE, 384e18, 0);
        assertFalse(ok);
    }

    function test_rejects_a_tampered_price() public {
        (bytes4[] memory ids, uint256[] memory prices) = _one(TSLAB, 374e18);
        bytes memory p = _payload(ATLAS_PK, ids, prices, block.timestamp);
        p[13] = bytes1(uint8(p[13]) ^ 0x01); // change the price after signing
        bytes memory data = abi.encodePacked(abi.encodeCall(CatVerdicts.record, (TSLAB, CatVerdicts.Verdict.REFUSE, 384e18, 0)), p);
        vm.prank(cat);
        (bool ok,) = address(v).call(data);
        assertFalse(ok);
    }

    function test_only_the_cat_records() public {
        (bytes4[] memory ids, uint256[] memory prices) = _one(TSLAB, 384e18);
        bytes memory data =
            abi.encodePacked(abi.encodeCall(CatVerdicts.record, (TSLAB, CatVerdicts.Verdict.WATCH, 384e18, 0)), _payload(ATLAS_PK, ids, prices, block.timestamp));
        (bool ok, bytes memory ret) = address(v).call(data);
        assertFalse(ok);
        assertEq(bytes4(ret), CatVerdicts.NotAttester.selector);
    }

    function test_batch_records_against_one_signature() public {
        bytes4[] memory ids = new bytes4[](2);
        uint256[] memory prices = new uint256[](2);
        (ids[0], ids[1]) = (TSLAB, NVDAB);
        (prices[0], prices[1]) = (374e18, 147e18);
        CatVerdicts.Verdict[] memory verdicts = new CatVerdicts.Verdict[](2);
        (verdicts[0], verdicts[1]) = (CatVerdicts.Verdict.REFUSE, CatVerdicts.Verdict.WAIT);
        uint256[] memory reals = new uint256[](2);
        (reals[0], reals[1]) = (384e18, 147.5e18);
        uint16[] memory failed = new uint16[](2);
        failed[0] = 1 << 4;
        bytes memory data = abi.encodePacked(abi.encodeCall(CatVerdicts.recordBatch, (ids, verdicts, reals, failed)), _payload(ATLAS_PK, ids, prices, block.timestamp));
        vm.prank(cat);
        (bool ok,) = address(v).call(data);
        assertTrue(ok);
        assertEq(v.count(TSLAB), 1);
        assertEq(v.count(NVDAB), 1);
        (CatVerdicts.Verdict nv,,, int32 nbps,,,) = v.latest(NVDAB);
        assertEq(uint8(nv), uint8(CatVerdicts.Verdict.WAIT));
        assertEq(nbps, -34);
    }

    function test_owner_rotates_the_atlas_signer() public {
        address next = vm.addr(ROGUE_PK);
        vm.prank(owner);
        v.setAtlasSigner(next, true);
        (bool ok,) = _record(ROGUE_PK, TSLAB, 384e18, block.timestamp, CatVerdicts.Verdict.WATCH, 384e18, 0);
        assertTrue(ok);
        vm.expectRevert();
        v.setAtlasSigner(atlas, false); // not the owner
    }
}
