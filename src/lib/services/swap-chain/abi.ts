/**
 * Swap Chain — Centralized ABI Encoding
 *
 * Pre-built ethers Interface instances for Boltz EtherSwap and ERC20Swap
 * contract calls. Avoids repeated `new ethers.Interface(...)` construction
 * at every call site.
 *
 * All `bytes32` parameters MUST include the `0x` prefix.
 */

import { ethers } from 'ethers';

// ─── ABI definitions ──────────────────────────────────────────────

const ETHERSWAP_LOCK_ABI = [
	'function lock(bytes32 preimageHash, address claimAddress, uint256 timelock) payable'
];

/** EtherSwap.claim(bytes32, uint256, address, uint256) — RSK rBTC claim */
const ETHERSWAP_CLAIM_ABI = [
	'function claim(bytes32 preimage, uint256 amount, address claimAddress, uint256 timelock)'
];

/** ERC20Swap.claim(bytes32, uint256, address, address, address, uint256) — Arbitrum tBTC claim */
const ERC20SWAP_CLAIM_ABI = [
	'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address claimAddress, address refundAddress, uint256 timelock)'
];

const ETHERSWAP_REFUND_ABI = [
	'function refund(bytes32 preimageHash, address claimAddress, uint256 timelock)'
];

// ─── Singleton Interface instances ────────────────────────────────

const lockInterface = new ethers.Interface(ETHERSWAP_LOCK_ABI);
const etherClaimInterface = new ethers.Interface(ETHERSWAP_CLAIM_ABI);
const erc20ClaimInterface = new ethers.Interface(ERC20SWAP_CLAIM_ABI);
const refundInterface = new ethers.Interface(ETHERSWAP_REFUND_ABI);

// ─── Encoding functions ───────────────────────────────────────────

/**
 * ABI-encode an EtherSwap.lock() call.
 * The EtherSwap contract holds rBTC until Boltz claims using the preimage.
 *
 * @param preimageHash - SHA-256 hash of the preimage (bytes32, with `0x` prefix)
 * @param claimAddress - Boltz claim address
 * @param timelock - Block height after which refund is possible
 */
export function encodeEtherSwapLock(
	preimageHash: string,
	claimAddress: string,
	timelock: number | bigint
): string {
	return lockInterface.encodeFunctionData('lock', [preimageHash, claimAddress, BigInt(timelock)]);
}

/**
 * ABI-encode an EtherSwap.claim() call (RSK rBTC claim).
 *
 * @param preimage - Preimage secret (bytes32, with `0x` prefix)
 * @param amount - Amount in wei
 * @param claimAddress - Address to receive the claimed funds
 * @param timelock - Original timelock value from the lock
 */
export function encodeEtherSwapClaim(
	preimage: string,
	amount: bigint,
	claimAddress: string,
	timelock: number | bigint
): string {
	return etherClaimInterface.encodeFunctionData('claim', [
		preimage,
		amount,
		claimAddress,
		BigInt(timelock)
	]);
}

/**
 * ABI-encode an ERC20Swap.claim() call (Arbitrum tBTC claim).
 *
 * @param preimage - Preimage secret (bytes32, with `0x` prefix)
 * @param amount - Token amount (in smallest unit)
 * @param tokenAddress - ERC-20 token contract address
 * @param claimAddress - Address to receive the claimed tokens
 * @param refundAddress - Address that can refund if timelock expires
 * @param timelock - Original timelock value from the lock
 */
export function encodeERC20SwapClaim(
	preimage: string,
	amount: bigint,
	tokenAddress: string,
	claimAddress: string,
	refundAddress: string,
	timelock: number | bigint
): string {
	return erc20ClaimInterface.encodeFunctionData('claim', [
		preimage,
		amount,
		tokenAddress,
		claimAddress,
		refundAddress,
		BigInt(timelock)
	]);
}

/**
 * ABI-encode an EtherSwap.refund() call.
 *
 * @param preimageHash - SHA-256 hash of the preimage (bytes32, with `0x` prefix)
 * @param claimAddress - Original claim address from the lock
 * @param timelock - Original timelock value from the lock
 */
export function encodeEtherSwapRefund(
	preimageHash: string,
	claimAddress: string,
	timelock: number | bigint
): string {
	return refundInterface.encodeFunctionData('refund', [
		preimageHash,
		claimAddress,
		BigInt(timelock)
	]);
}
