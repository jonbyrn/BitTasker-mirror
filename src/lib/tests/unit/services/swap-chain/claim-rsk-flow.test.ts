/**
 * Swap Chain — RSK Claim Behavioral Test
 *
 * Uses REAL on-chain data from swap EsqUeKrA4v6f to verify that the
 * claimRbtcOnRsk function produces calldata whose hashValues match
 * the on-chain lockup.
 *
 * The Boltz EtherSwap contract stores swaps as:
 *   swaps[hashValues(preimageHash, amount, claimAddress, refundAddress, timelock)] = true
 *
 * The 4-param claim(bytes32, uint256, address, uint256) function passes
 * msg.sender as claimAddress and the 3rd parameter as refundAddress.
 * If the 3rd param is wrong, the hash won't match → SwapNotFound revert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSendEvmTransaction } = vi.hoisted(() => ({
	mockSendEvmTransaction: vi.fn()
}));

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	sendEvmTransaction: mockSendEvmTransaction
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		extend: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
	})
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { claimRbtcOnRsk } from '$lib/services/swap-chain/boltz/claims';
import { encodeEtherSwapClaim } from '$lib/services/swap-chain/abi';
import { ETHERSWAP_ADDRESS } from '$lib/services/swap-chain/utils';

// ---------------------------------------------------------------------------
// Real on-chain data from swap EsqUeKrA4v6f
// ---------------------------------------------------------------------------

const LOCKUP = {
	preimageHash: '0x409684764895a0f84420f85ebb3d2285d02cf98e8cc73402c1b339083af318f2',
	preimage: '0x3d128c23c5b8646cede7bc2716a20e3da90245c236381a4d549892aaedcc0e8f',
	amountWei: 24_620_000_000_000,
	amountSats: 2462,
	claimAddress: ethers.getAddress('0x9aea6dda21cc99dda8c7345e1a9a834356ef8e1d'),
	refundAddress: ethers.getAddress('0x1bdf482f5da32ef51c20d9a94960385c5be9aab7'),
	timelock: 9_083_732
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 of a hex string (Web Crypto API, works in jsdom) */
async function sha256(hex: string): Promise<string> {
	const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex;
	const bytes = new Uint8Array(hexStr.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
	const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
	return '0x' + Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Contract's hashValues function (from Solidity source) */
function hashValues(preimageHash: string, amount: bigint, claimAddress: string, refundAddress: string, timelock: bigint): string {
	return ethers.solidityPackedKeccak256(
		['bytes32', 'uint256', 'address', 'address', 'uint256'],
		[preimageHash, amount, claimAddress, refundAddress, timelock]
	);
}

// ---------------------------------------------------------------------------
// BeforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	mockSendEvmTransaction.mockResolvedValue({ data: '0xtxhash', error: null });
});

// ===========================================================================
// Tests
// ===========================================================================

describe('claimRbtcOnRsk — behavioral test with real on-chain data', () => {
	it('preimage hashes to the on-chain preimageHash', async () => {
		const computed = await sha256(LOCKUP.preimage);
		expect(computed).toBe(LOCKUP.preimageHash);
	});

	it('produces calldata whose hashValues matches the on-chain lockup', async () => {
		// encodeEtherSwapClaim(preimage, amountWei, refundAddress, timelock)
		// The contract's 4-param claim() uses msg.sender as claimAddress (user)
		// and the 3rd param as refundAddress (Boltz).
		const calldata = encodeEtherSwapClaim(
			LOCKUP.preimage,
			BigInt(LOCKUP.amountSats) * BigInt(1e10),
			LOCKUP.refundAddress, // the fix: pass Boltz, not user
			BigInt(LOCKUP.timelock)
		);

		const iface = new ethers.Interface(['function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock)']);
		const decoded = iface.decodeFunctionData('claim', calldata);

		// Verify encoded values
		expect(decoded[0] as string).toBe(LOCKUP.preimage);
		expect(decoded[1] as bigint).toBe(BigInt(LOCKUP.amountWei));
		expect((decoded[2] as string).toLowerCase()).toBe(LOCKUP.refundAddress.toLowerCase());
		expect(Number(decoded[3])).toBe(LOCKUP.timelock);

		// Compute the hash the contract would produce:
		// hashValues(sha256(preimage), amount, msg.sender, 3rd_param, timelock)
		const preimageHash = await sha256(decoded[0] as string);
		const claimHash = hashValues(
			preimageHash,
			decoded[1] as bigint,
			LOCKUP.claimAddress, // msg.sender = user
			decoded[2] as string, // 3rd param = Boltz
			decoded[3] as bigint
		);

		// Compute the lockup hash
		const lockupHash = hashValues(
			LOCKUP.preimageHash,
			BigInt(LOCKUP.amountWei),
			LOCKUP.claimAddress,
			LOCKUP.refundAddress,
			BigInt(LOCKUP.timelock)
		);

		// THE CRITICAL ASSERTION
		expect(claimHash).toBe(lockupHash);
	});

	it('REVERT PROOF: passing user instead of Boltz as 3rd param produces wrong hash', async () => {
		// This is what the OLD code did: passed params.claimAddress (user) instead of
		// params.refundAddress (Boltz) as the 3rd parameter to encodeEtherSwapClaim.
		const wrongCalldata = encodeEtherSwapClaim(
			LOCKUP.preimage,
			BigInt(LOCKUP.amountSats) * BigInt(1e10),
			LOCKUP.claimAddress, // WRONG: user instead of Boltz
			BigInt(LOCKUP.timelock)
		);

		const iface = new ethers.Interface(['function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock)']);
		const decoded = iface.decodeFunctionData('claim', wrongCalldata);

		const preimageHash = await sha256(decoded[0] as string);
		const wrongHash = hashValues(
			preimageHash,
			decoded[1] as bigint,
			LOCKUP.claimAddress, // msg.sender = user
			decoded[2] as string, // 3rd param = user (WRONG!)
			decoded[3] as bigint
		);

		const lockupHash = hashValues(
			LOCKUP.preimageHash,
			BigInt(LOCKUP.amountWei),
			LOCKUP.claimAddress,
			LOCKUP.refundAddress,
			BigInt(LOCKUP.timelock)
		);

		// The wrong hash does NOT match — this is exactly why every claim reverted
		expect(wrongHash).not.toBe(lockupHash);
	});

	it('calls sendEvmTransaction with correct calldata after fix', async () => {
		const error = await claimRbtcOnRsk({
			preimageHex: LOCKUP.preimage.slice(2),
			amount: LOCKUP.amountSats,
			claimAddress: LOCKUP.claimAddress,
			refundAddress: LOCKUP.refundAddress,
			timelock: LOCKUP.timelock,
			sourceConnectedWalletId: null
		});

		expect(error).toBeNull();
		expect(mockSendEvmTransaction).toHaveBeenCalledTimes(1);

		const call = mockSendEvmTransaction.mock.calls[0][0];
		expect(call.to.toLowerCase()).toBe(ETHERSWAP_ADDRESS.toLowerCase());
		expect(call.chain).toBe('rsk');

		// Decode and verify the 3rd param is Boltz (refundAddress), not user (claimAddress)
		const iface = new ethers.Interface(['function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock)']);
		const decoded = iface.decodeFunctionData('claim', call.data);

		expect((decoded[2] as string).toLowerCase()).toBe(LOCKUP.refundAddress.toLowerCase());
		expect((decoded[2] as string).toLowerCase()).not.toBe(LOCKUP.claimAddress.toLowerCase());

		// Verify the hash matches
		const preimageHash = await sha256(decoded[0] as string);
		const claimHash = hashValues(preimageHash, decoded[1] as bigint, LOCKUP.claimAddress, decoded[2] as string, decoded[3] as bigint);
		const lockupHash = hashValues(LOCKUP.preimageHash, BigInt(LOCKUP.amountWei), LOCKUP.claimAddress, LOCKUP.refundAddress, BigInt(LOCKUP.timelock));
		expect(claimHash).toBe(lockupHash);
	});
});
