/**
 * Swap Chain — ABI Encoding Unit Tests
 *
 * Tests all 4 encoding functions from `src/lib/services/swap-chain/abi.ts`:
 * - encodeEtherSwapLock
 * - encodeEtherSwapClaim
 * - encodeERC20SwapClaim
 * - encodeEtherSwapRefund
 *
 * These are pure functions using ethers.Interface — no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
	encodeEtherSwapLock,
	encodeEtherSwapClaim,
	encodeERC20SwapClaim,
	encodeEtherSwapRefund
} from '$lib/services/swap-chain/abi';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const preimageHash = '0x' + 'ab'.repeat(32);
const preimage = '0x' + 'cd'.repeat(32);
const claimAddress = '0x' + '11'.repeat(20);
const refundAddress = '0x' + '22'.repeat(20);
const tokenAddress = '0x' + '33'.repeat(20);
const timelock = 1700000000n;
const amount = 50000n;

// ===========================================================================
// encodeEtherSwapLock
// ===========================================================================

describe('encodeEtherSwapLock', () => {
	it('returns 0x-prefixed calldata', () => {
		const calldata = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		expect(calldata).toMatch(/^0x/);
		expect(calldata.length).toBeGreaterThan(10);
	});

	it('produces deterministic output for same inputs', () => {
		const a = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		const b = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		expect(a).toBe(b);
	});

	it('produces different output for different claim addresses', () => {
		const a = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		const b = encodeEtherSwapLock(preimageHash, refundAddress, timelock);
		expect(a).not.toBe(b);
	});

	it('produces different output for different timelocks', () => {
		const a = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		const b = encodeEtherSwapLock(preimageHash, claimAddress, 1800000000n);
		expect(a).not.toBe(b);
	});

	it('accepts number timelock', () => {
		const calldata = encodeEtherSwapLock(preimageHash, claimAddress, 1700000000);
		expect(calldata).toMatch(/^0x/);
	});
});

// ===========================================================================
// encodeEtherSwapClaim
// ===========================================================================

describe('encodeEtherSwapClaim', () => {
	it('returns 0x-prefixed calldata', () => {
		const calldata = encodeEtherSwapClaim(preimage, amount, claimAddress, timelock);
		expect(calldata).toMatch(/^0x/);
		expect(calldata.length).toBeGreaterThan(10);
	});

	it('produces different output from lock for same hash', () => {
		const lock = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		const claim = encodeEtherSwapClaim(preimage, amount, claimAddress, timelock);
		expect(lock).not.toBe(claim);
	});

	it('produces different output for different amounts', () => {
		const a = encodeEtherSwapClaim(preimage, 10000n, claimAddress, timelock);
		const b = encodeEtherSwapClaim(preimage, 99999n, claimAddress, timelock);
		expect(a).not.toBe(b);
	});
});

// ===========================================================================
// encodeERC20SwapClaim
// ===========================================================================

describe('encodeERC20SwapClaim', () => {
	it('returns 0x-prefixed calldata', () => {
		const calldata = encodeERC20SwapClaim(
			preimage,
			1000000n,
			tokenAddress,
			claimAddress,
			refundAddress,
			timelock
		);
		expect(calldata).toMatch(/^0x/);
		expect(calldata.length).toBeGreaterThan(10);
	});

	it('produces different output for different token addresses', () => {
		const a = encodeERC20SwapClaim(
			preimage,
			1000000n,
			tokenAddress,
			claimAddress,
			refundAddress,
			timelock
		);
		const b = encodeERC20SwapClaim(
			preimage,
			1000000n,
			refundAddress,
			claimAddress,
			refundAddress,
			timelock
		);
		expect(a).not.toBe(b);
	});

	it('produces different output from ether claim for same preimage', () => {
		const erc20 = encodeERC20SwapClaim(
			preimage,
			amount,
			tokenAddress,
			claimAddress,
			refundAddress,
			timelock
		);
		const ether = encodeEtherSwapClaim(preimage, amount, claimAddress, timelock);
		expect(erc20).not.toBe(ether);
	});
});

// ===========================================================================
// encodeEtherSwapRefund
// ===========================================================================

describe('encodeEtherSwapRefund', () => {
	it('returns 0x-prefixed calldata', () => {
		const calldata = encodeEtherSwapRefund(preimageHash, claimAddress, timelock);
		expect(calldata).toMatch(/^0x/);
		expect(calldata.length).toBeGreaterThan(10);
	});

	it('produces different output from lock for same hash', () => {
		const lock = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		const refund = encodeEtherSwapRefund(preimageHash, claimAddress, timelock);
		expect(lock).not.toBe(refund);
	});

	it('produces different output for different preimage hashes', () => {
		const otherHash = '0x' + 'ff'.repeat(32);
		const a = encodeEtherSwapRefund(preimageHash, claimAddress, timelock);
		const b = encodeEtherSwapRefund(otherHash, claimAddress, timelock);
		expect(a).not.toBe(b);
	});
});

// ===========================================================================
// Cross-function differentiation
// ===========================================================================

describe('cross-function differentiation', () => {
	it('all four functions produce distinct calldata for equivalent inputs', () => {
		const lock = encodeEtherSwapLock(preimageHash, claimAddress, timelock);
		const claim = encodeEtherSwapClaim(preimage, amount, claimAddress, timelock);
		const erc20 = encodeERC20SwapClaim(
			preimage,
			amount,
			tokenAddress,
			claimAddress,
			refundAddress,
			timelock
		);
		const refund = encodeEtherSwapRefund(preimageHash, claimAddress, timelock);

		const unique = new Set([lock, claim, erc20, refund]);
		expect(unique.size).toBe(4);
	});
});
