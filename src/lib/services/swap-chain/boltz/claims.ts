/**
 * Swap Chain — Boltz Claim Functions
 *
 * Chain-specific claim logic for Boltz swaps:
 * - claimTbtcOnArbitrum: ERC20Swap.claim() on Arbitrum
 * - claimRbtcOnRsk: EtherSwap.claim() on RSK
 */

import { encodeERC20SwapClaim, encodeEtherSwapClaim } from '../abi';
import { ETHERSWAP_ADDRESS, GAS_LIMIT_ARB_CLAIM, GAS_LIMIT_RSK_CLAIM } from '../utils';
import { claimSwapFunds } from './setup';

/**
 * Claim tBTC on Arbitrum by calling ERC20Swap.claim().
 *
 * The ERC20Swap contract on Arbitrum holds tBTC locked by Boltz.
 * After the RSK lockup is confirmed, the user must call claim() with the
 * preimage to release tBTC to their Arbitrum address.
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
	const calldata = encodeERC20SwapClaim(
		params.preimageHex,
		BigInt(params.amount),
		params.tokenAddress,
		params.claimAddress,
		params.refundAddress,
		BigInt(params.timelock)
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
}

/**
 * Claim rBTC on RSK by calling EtherSwap.claim().
 *
 * After Boltz detects the tBTC lockup on Arbitrum, it locks rBTC on RSK.
 * The user calls EtherSwap.claim() with the preimage to release rBTC.
 *
 * The claim call is: claim(bytes32 preimage, uint256 amount, address claimAddress, uint256 timelock)
 * where claimAddress = Boltz's claim address, amount = sats locked, timelock = block height.
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
		params.claimAddress,
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
