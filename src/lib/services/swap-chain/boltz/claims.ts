/**
 * Swap Chain — Boltz Claim Functions
 *
 * Chain-specific claim logic for Boltz swaps:
 * - claimTbtcOnArbitrum: ERC20Swap.claim() on Arbitrum (signature-based)
 * - claimRbtcOnRsk: EtherSwap.claim() on RSK
 *
 * The Arbitrum claim uses the EIP-712 signature variant of ERC20Swap.claim()
 * (selector 0xb2b78df8). This allows a smart wallet (EIP-7702 account via
 * executeBatch) to claim tokens even though msg.sender != claimAddress.
 * The contract recovers the claim address from the signature instead of
 * requiring msg.sender to be the claim address.
 */

import { encodeERC20SwapClaimWithSig, encodeEtherSwapClaim } from '../abi';
import { CHAIN_ID_ARB, ETHERSWAP_ADDRESS, GAS_LIMIT_ARB_CLAIM, GAS_LIMIT_RSK_CLAIM } from '../utils';
import { claimSwapFunds } from './setup';
import { ethers } from 'ethers';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('swap-chain:claims');

/**
 * Convert any address to EIP-55 checksummed format.
 *
 * RSKWallet.getAddress() returns EIP-1191 checksummed addresses (chain ID
 * included in hash). ethers v6 signTypedData validates EIP-55 checksums.
 * EIP-1191 ≠ EIP-55 for mixed-case addresses → `bad address checksum`.
 * Lowercasing first ensures getAddress() always succeeds.
 */
function toEip55(addr: string): string {
	return ethers.getAddress(addr.toLowerCase());
}

/**
 * EIP-712 domain for ERC20Swap Claim signatures.
 * Must match the contract's DOMAIN_SEPARATOR exactly.
 */
const ERC20SWAP_CLAIM_DOMAIN = (verifyingContract: string) => ({
	name: 'ERC20Swap',
	version: '6',
	chainId: CHAIN_ID_ARB,
	verifyingContract: verifyingContract as `0x${string}`
});

/**
 * EIP-712 type definition for the Claim struct.
 * Matches the contract's TYPEHASH_CLAIM.
 */
const ERC20SWAP_CLAIM_TYPES = {
	Claim: [
		{ name: 'preimage', type: 'bytes32' },
		{ name: 'amount', type: 'uint256' },
		{ name: 'tokenAddress', type: 'address' },
		{ name: 'refundAddress', type: 'address' },
		{ name: 'timelock', type: 'uint256' },
		{ name: 'destination', type: 'address' }
	]
};

/**
 * Sign an EIP-712 Claim authorization for ERC20Swap.
 *
 * The signature proves the signer (the locked claimAddress) authorizes
 * the destination (msg.sender / smart wallet) to claim the tokens on
 * their behalf. The ERC20Swap contract recovers the signer from the
 * signature and verifies it matches the stored claimAddress.
 *
 * @param wallet - The ethers Wallet that IS the locked claimAddress
 * @param contractAddress - The ERC20Swap contract address (verifyingContract)
 * @param preimage - Preimage secret (bytes32, with `0x` prefix)
 * @param amount - Token amount in smallest unit
 * @param tokenAddress - ERC-20 token contract address
 * @param refundAddress - Address that can refund if timelock expires
 * @param timelock - Original timelock value from the lock
 * @param destination - Address to receive tokens (msg.sender / smart wallet)
 * @returns {v, r, s} signature components
 */
async function signClaimAuthorization(
	wallet: import('ethers').Wallet,
	contractAddress: string,
	preimage: string,
	amount: bigint,
	tokenAddress: string,
	refundAddress: string,
	timelock: number | bigint,
	destination: string
): Promise<{ v: number; r: string; s: string }> {
	// EIP-55 checksum all addresses — ethers v6 signTypedData rejects
	// mixed-case addresses that don't match EIP-55 (e.g. EIP-1191 from RSK).
	const domain = ERC20SWAP_CLAIM_DOMAIN(toEip55(contractAddress));
	const value = {
		preimage: preimage as `0x${string}`,
		amount,
		tokenAddress: toEip55(tokenAddress) as `0x${string}`,
		refundAddress: toEip55(refundAddress) as `0x${string}`,
		timelock: BigInt(timelock),
		destination: toEip55(destination) as `0x${string}`
	};

	d.log(
		'signClaimAuthorization: signer=%s destination=%s contract=%s',
		await wallet.getAddress(),
		destination,
		contractAddress
	);

	const signature = await wallet.signTypedData(domain, ERC20SWAP_CLAIM_TYPES, value);

	// Split signature into v, r, s
	const sig = ethers.Signature.from(signature);
	return { v: sig.v, r: sig.r, s: sig.s };
}

/**
 * Claim tBTC (or any ERC-20 token) on Arbitrum by calling the signature-based
 * ERC20Swap.claim() overload.
 *
 * This uses `claim(bytes32, uint256, address, address, uint256, uint8, bytes32, bytes32)`
 * (selector 0xb2b78df8) which recovers the claim address from an EIP-712
 * signature. This allows a smart wallet (EIP-7702 account executing via
 * executeBatch) to claim tokens even though msg.sender != claimAddress.
 *
 * Flow:
 * 1. Get the user's signing wallet (whose address == claimAddress)
 * 2. Sign an EIP-712 Claim authorization (destination = user's Arb address)
 * 3. Encode claim() with the signature
 * 4. Submit via gasless relay (executeBatch) or direct tx
 *
 * @returns Error if claim failed, null on success
 */
export async function claimTbtcOnArbitrum(params: {
	contractAddress: string;
	preimageHex: string;
	amount: number;
	tokenAddress: string;
	claimAddress: string;
	refundAddress: string;
	timelock: number;
	sourceConnectedWalletId: string | null;
}): Promise<Error | null> {
	const dClaim = createDebug('swap-chain:tBTC-on-Arbitrum');

	try {
	// Get the signing wallet — must be the locked claimAddress
	const { getWalletManager } = await import('$lib/stores/wallet/wallet-state');

	let signerWallet: import('ethers').Wallet;
	let signerAddress: string;

	if (params.sourceConnectedWalletId) {
		// Connected wallet: get the EVM signer
		const { getEvmSigner } = await import('$lib/stores/connected-wallets.store');
		const evmSigner = getEvmSigner(params.sourceConnectedWalletId);
		if (!evmSigner) {
			return new Error('Connected wallet EVM signer not available for claim signing');
		}
		// For connected wallets, we need a Wallet instance for signTypedData.
		// The EvmSigner wraps a Wallet internally.
		const wallet = (evmSigner as unknown as { wallet?: import('ethers').Wallet }).wallet;
		if (!wallet || typeof wallet.signTypedData !== 'function') {
			return new Error('Connected wallet does not support signTypedData');
		}
		signerWallet = wallet;
		signerAddress = await wallet.getAddress();
	} else {
		// Built-in wallet: use the RSK wallet (same key as Arbitrum EIP-7702 EOA)
		const manager = getWalletManager();
		if (!manager?.rskWallet) {
			return new Error('Built-in wallet not initialized for claim signing');
		}
		signerWallet = manager.rskWallet.getWallet() as import('ethers').Wallet;
		signerAddress = manager.rskWallet.getAddress();
	}

	// Verify signer matches the locked claimAddress
	if (signerAddress.toLowerCase() !== params.claimAddress.toLowerCase()) {
		dClaim.error(
			'Signer %s does not match claimAddress %s',
			signerAddress,
			params.claimAddress
		);
		return new Error(
			`Signer ${signerAddress} is not the locked claim address ${params.claimAddress} — cannot sign claim authorization`
		);
	}

	// The destination is the same as the signer (tokens go to the user's own address).
	// For EIP-7702 accounts, the smart wallet IS the user's EOA, so msg.sender == destination.
	const destination = signerAddress;

	dClaim.log(
		'Signing claim authorization: signer=%s contract=%s amount=%s',
		signerAddress.slice(0, 10),
		params.contractAddress.slice(0, 10),
		params.amount
	);

	// Sign the EIP-712 Claim authorization
	const { v, r, s } = await signClaimAuthorization(
		signerWallet,
		params.contractAddress,
		params.preimageHex,
		BigInt(params.amount),
		params.tokenAddress,
		params.refundAddress,
		BigInt(params.timelock),
		destination
	);

	dClaim.log('Claim signature: v=%d r=%s s=%s', v, r.slice(0, 10), s.slice(0, 10));

	// Encode the signature-based claim calldata
	const calldata = encodeERC20SwapClaimWithSig(
		params.preimageHex,
		BigInt(params.amount),
		params.tokenAddress,
		params.refundAddress,
		BigInt(params.timelock),
		v,
		r,
		s
	);

	dClaim.log(
		'Encoded claim calldata: selector=%s len=%d',
		calldata.slice(0, 10),
		calldata.length
	);

	return claimSwapFunds({
		contractAddress: params.contractAddress,
		chain: 'arbitrum',
		calldata,
		gasLimit: GAS_LIMIT_ARB_CLAIM,
		sourceConnectedWalletId: params.sourceConnectedWalletId,
		logLabel: 'tBTC-on-Arbitrum',
		feeToken: params.tokenAddress
	});

	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		dClaim.error('claimTbtcOnArbitrum failed: %s', message);
		return new Error(`Claim signing/encoding failed: ${message}`);
	}
}

/**
 * Claim rBTC on RSK by calling EtherSwap.claim().
 *
 * After Boltz detects the tBTC lockup on Arbitrum, it locks rBTC on RSK.
 * The user calls EtherSwap.claim() with the preimage to release rBTC.
 *
 * The contract's 4-param claim function is:
 *   claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock)
 * where:
 *   - refundAddress = the address that locked the Ether (Boltz)
 *   - claimAddress is implicitly msg.sender (the user calling claim)
 *   - amount = wei locked
 *   - timelock = block height
 *
 * The contract hashes (preimageHash, amount, msg.sender, refundAddress, timelock)
 * and looks up the swap by that hash. Passing the wrong refundAddress produces
 * a different hash → SwapNotFound revert.
 *
 * @returns Error if claim failed, null on success
 */
export async function claimRbtcOnRsk(params: {
	preimageHex: string;
	amount: number;
	claimAddress: string;
	refundAddress: string;
	timelock: number;
	sourceConnectedWalletId: string | null;
}): Promise<Error | null> {
	const calldata = encodeEtherSwapClaim(
		'0x' + params.preimageHex,
		BigInt(params.amount) * BigInt(1e10), // sats → wei
		params.refundAddress, // contract's 3rd param is refundAddress (Boltz), NOT claimAddress (user)
		BigInt(params.timelock)
	);

	return claimSwapFunds({
		contractAddress: ETHERSWAP_ADDRESS,
		chain: 'rsk',
		calldata,
		gasLimit: GAS_LIMIT_RSK_CLAIM,
		sourceConnectedWalletId: params.sourceConnectedWalletId,
		logLabel: 'rBTC-on-RSK'
	});
}
