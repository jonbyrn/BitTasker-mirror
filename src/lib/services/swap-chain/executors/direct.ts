/**
 * Swap Chain — Direct Hop Executor
 *
 * Executes direct wallet-to-wallet transfers (rBTC, USDT) using either
 * the built-in wallet or a connected wallet's EVM signer.
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { sendRBTC, sendBSCUSDT } from '$lib/stores/wallet.store';
import { getEvmSigner } from '$lib/stores/connected-wallets.store';
import type { RouteHop } from '$lib/services/route-resolver';
import type { EVMSigner, EVMTransactionRequest } from '$lib/services/external-wallet/types';
import {
	encodeERC20Transfer,
	getBSCUSDTContractAddress
} from '$lib/services/external-wallet/chain-utils';
import { parseDecimalToSmallestUnit } from '$lib/utils/amount-conversion';
import { CHAIN_ID_RSK, CHAIN_ID_BSC } from '../utils';
import type { SwapChainState } from '../state';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Direct hop
// ---------------------------------------------------------------------------

export async function executeDirectHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	if (!state.destination || state.destination.type !== 'address') {
		return { data: null, error: new Error('Direct hop requires an address destination') };
	}

	const address = state.destination.address;
	const amount = state.amount;

	if (!amount) {
		return { data: null, error: new Error('Amount is required for direct transfer') };
	}

	// If source is a connected wallet, use its EVM signer instead of built-in wallet
	if (state.sourceConnectedWalletId) {
		const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
		d.log('executeDirectHop: using connected wallet %s', state.sourceConnectedWalletId);
		if (!evmSigner) {
			return {
				data: null,
				error: new Error('Connected wallet EVM signer not available')
			};
		}

		if (hop.fromAsset === 'RBTC') {
			return executeConnectedWalletTransfer(evmSigner, address, amount);
		}

		if (hop.fromAsset === 'USDT') {
			// ERC-20 transfer via connected wallet on BSC (chain 56, 18 decimals)
			d.log('executeDirectHop: USDT ERC-20 transfer via connected wallet');
			const usdtContract = getBSCUSDTContractAddress();
			const amountWei = parseDecimalToSmallestUnit(amount, 18);
			return executeConnectedERC20Transfer(
				evmSigner,
				usdtContract,
				address,
				amountWei,
				CHAIN_ID_BSC
			);
		}

		return {
			data: null,
			error: new Error(`Unsupported asset for connected wallet transfer: ${hop.fromAsset}`)
		};
	}

	// Built-in wallet path
	if (hop.fromAsset === 'RBTC') {
		const { data: txHash, error } = await tryCatch(sendRBTC(address, amount));
		if (error !== null) {
			return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
		}
		return { data: txHash ?? null, error: null };
	}

	if (hop.fromAsset === 'USDT') {
		const { data: txHash, error } = await tryCatch(sendBSCUSDT(address, amount));
		if (error !== null) {
			return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
		}
		return { data: txHash ?? null, error: null };
	}

	return { data: null, error: new Error(`Unsupported asset for direct hop: ${hop.fromAsset}`) };
}

// ---------------------------------------------------------------------------
// Connected wallet transfers
// ---------------------------------------------------------------------------

/**
 * Execute an rBTC transfer using a connected wallet's EVM signer.
 * Converts the amount from rBTC string → wei, builds the transaction,
 * and sends it via the connector handle.
 */
async function executeConnectedWalletTransfer(
	signer: EVMSigner,
	to: string,
	amount: string
): Promise<{ data: string | null; error: Error | null }> {
	try {
		const amountWei = parseDecimalToSmallestUnit(amount, 18);
		const tx: EVMTransactionRequest = {
			to,
			value: amountWei,
			chainId: CHAIN_ID_RSK,
			data: '0x'
		};
		const result = await signer.sendTransaction(tx);
		return { data: result.txHash, error: null };
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}

/**
 * Execute an ERC-20 transfer via a connected wallet's EVM signer.
 * Encodes the standard `transfer(address,uint256)` calldata and sends it
 * to the token contract address.
 */
export async function executeConnectedERC20Transfer(
	signer: EVMSigner,
	tokenAddress: string,
	recipient: string,
	amount: bigint,
	chainId: number
): Promise<{ data: string | null; error: Error | null }> {
	try {
		const data = encodeERC20Transfer(recipient, amount);
		const result = await signer.sendTransaction({
			to: tokenAddress,
			data,
			chainId
		});
		return { data: result.txHash, error: null };
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}
