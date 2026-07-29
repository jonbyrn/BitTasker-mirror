/**
 * Tests for the swap recovery page address checksumming.
 *
 * Verifies that all addresses passed to ethers.js are properly EIP-55
 * checksummed, preventing "bad address checksum" errors during claim encoding.
 */
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { encodeERC20SwapClaim, encodeEtherSwapClaim } from '$lib/services/swap-chain/abi';
import { TBTC_ARB } from '$lib/services/swap-chain/utils';

/**
 * Simulate what `cs()` in the debug page does: checksum an address.
 * IMPORTANT: must lowercase first — ethers.getAddress() throws on
 * mixed-case input that doesn't match EIP-55 (e.g. "0x9AEA6DDA...")
 */
function cs(addr: string): string {
	return ethers.getAddress(addr.toLowerCase());
}

describe('Swap recovery — address checksumming', () => {
	// Use lowercase addresses — ethers.getAddress() always checksums these correctly
	const rawClaimAddress = '0x9aea6dda21cc99dda8c7345e1a9a834356ef8e1d';
	const rawRefundAddress = '0xa6d0956216da39aa1989066a9b22b64c30924dcd';
	const rawPreimage = 'a56245c62c48a82d2d6500d696eb5e53a5aa43b37cf0d569ebb4f16c47ab0c21';
	const amount = 30680000000000;
	const timelock = 25561562;

	it('cs() should produce valid EIP-55 checksum from lowercase address', () => {
		const checksummed = cs(rawClaimAddress);
		// Verify it's valid by passing to ethers (would throw if not checksummed)
		expect(() => ethers.getAddress(checksummed)).not.toThrow();
		// Should be deterministic
		expect(cs(checksummed)).toBe(checksummed);
	});

	it('raw mixed-case address (from Nostr) should FAIL with raw ethers.getAddress', () => {
		// This is the exact address the user saw: 0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d
		// It has mixed casing that doesn't match EIP-55 — ethers v6 rejects it
		const mixedCase = '0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d';
		expect(() => ethers.getAddress(mixedCase)).toThrow(/bad address checksum|INVALID_ARGUMENT/);
	});

	it('cs() should handle mixed-case addresses by lowercasing first', () => {
		// The exact error case: mixed-case from Nostr data
		const mixedCase = '0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d';
		const checksummed = cs(mixedCase);
		// Should produce valid EIP-55
		expect(() => ethers.getAddress(checksummed)).not.toThrow();
		// Should match the lowercase version
		expect(checksummed).toBe(cs(mixedCase.toLowerCase()));
	});

	it('cs() with lowercase should produce same result as cs() with mixed-case lowercase', () => {
		const fromLower = cs(rawClaimAddress);
		const fromLowerAgain = cs(rawClaimAddress.toLowerCase());
		expect(fromLower).toBe(fromLowerAgain);
	});

	it('encodeERC20SwapClaim should work with cs()-checksummed addresses', () => {
		const claimAddr = cs(rawClaimAddress);
		const refundAddr = cs(rawRefundAddress);
		const preimage = '0x' + rawPreimage;

		// This is what claimTbtcOnArbitrum does — should NOT throw
		expect(() => {
			encodeERC20SwapClaim(
				preimage,
				BigInt(amount),
				TBTC_ARB,
				claimAddr,
				refundAddr,
				BigInt(timelock)
			);
		}).not.toThrow();
	});

	it('encodeERC20SwapClaim should FAIL with raw mixed-case addresses (the bug before fix)', () => {
		// This is what happened BEFORE the fix — raw address from Nostr data passed directly
		// ethers v6 rejects non-EIP-55 mixed-case addresses
		const mixedCase = '0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d';
		expect(() => {
			encodeERC20SwapClaim(
				'0x' + rawPreimage,
				BigInt(amount),
				TBTC_ARB,
				mixedCase, // NOT lowercased+checksummed by cs()
				rawRefundAddress,
				BigInt(timelock)
			);
		}).toThrow(/bad address checksum|INVALID_ARGUMENT/);
	});

	it('encodeERC20SwapClaim should SUCCEED with cs()-fixed mixed-case addresses (the fix)', () => {
		// After the fix: cs() lowercases first, then checksums
		const mixedCase = '0x9AEA6DDA21cc99ddA8c7345E1a9a834356EF8E1d';
		const fixed = cs(mixedCase);
		expect(() => {
			encodeERC20SwapClaim(
				'0x' + rawPreimage,
				BigInt(amount),
				TBTC_ARB,
				fixed,
				cs(rawRefundAddress),
				BigInt(timelock)
			);
		}).not.toThrow();
	});

	it('encodeEtherSwapClaim should work with cs()-checksummed addresses', () => {
		const claimAddr = cs(rawClaimAddress);

		expect(() => {
			encodeEtherSwapClaim(
				'0x' + rawPreimage,
				BigInt(amount) * BigInt(1e10), // sats → wei
				claimAddr,
				BigInt(timelock)
			);
		}).not.toThrow();
	});

	it('decoded claim calldata should contain correct checksummed addresses', () => {
		const claimAddr = cs(rawClaimAddress);
		const refundAddr = cs(rawRefundAddress);
		const preimage = '0x' + rawPreimage;

		const calldata = encodeERC20SwapClaim(
			preimage,
			BigInt(amount),
			TBTC_ARB,
			claimAddr,
			refundAddr,
			BigInt(timelock)
		);

		// Decode the calldata and verify the addresses are correct
		const iface = new ethers.Interface([
			'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address claimAddress, address refundAddress, uint256 timelock)'
		]);
		const decoded = iface.decodeFunctionData('claim', calldata);

		expect(decoded[0].toLowerCase()).toBe('0x' + rawPreimage.toLowerCase());
		expect(decoded[1]).toBe(BigInt(amount));
		expect(decoded[2].toLowerCase()).toBe(TBTC_ARB.toLowerCase());
		expect(decoded[3]).toBe(claimAddr);
		expect(decoded[4]).toBe(refundAddr);
		expect(decoded[5]).toBe(BigInt(timelock));
	});

	it('event topic address parsing should produce valid checksummed addresses', () => {
		// Simulate parsing an address from event topic (32 bytes, left-padded with zeros)
		// This is what fetchClaimDetailsFromChain does
		const topic = '0x0000000000000000000000009aea6dda21cc99dda8c7345e1a9a834356ef8e1d';
		const parsed = cs('0x' + topic.slice(26));

		// Should be a valid checksummed address
		expect(() => ethers.getAddress(parsed)).not.toThrow();
		expect(parsed.toLowerCase()).toBe(rawClaimAddress.toLowerCase());

		// Should work in encodeERC20SwapClaim
		expect(() => {
			encodeERC20SwapClaim(
				'0x' + rawPreimage,
				BigInt(amount),
				TBTC_ARB,
				parsed,
				cs(rawRefundAddress),
				BigInt(timelock)
			);
		}).not.toThrow();
	});
});
