/**
 * Swap Chain — Transaction Helpers
 *
 * Shared helpers for submitting EVM transactions across the swap system.
 * Eliminates the connected-wallet vs built-in-wallet branching that was
 * duplicated across boltz.ts and executors.ts.
 */

import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { createDebug } from '$lib/utils/debug';
import { getEvmSigner, getHandle } from '$lib/stores/connected-wallets.store';
import { walletStore, sendRawTransaction, sendArbitrumTransaction } from '$lib/stores/wallet.store';
import type { EVMSigner } from '$lib/services/external-wallet/types';
import { safeAddress, type SwapChainState } from './state';
import { CHAIN_ID_ARB, CHAIN_ID_RSK, CHAIN_ID_BSC, GAS_LIMIT_RSK } from './utils';

const d = createDebug('swap-chain:tx');

// ---------------------------------------------------------------------------
// EVM Transaction Helper
// ---------------------------------------------------------------------------

export interface EvmTxParams {
	to: string;
	data: string;
	value: bigint | string;
	chain: 'rsk' | 'arbitrum' | 'bsc';
	gasLimit?: number;
	sourceConnectedWalletId?: string | null;
}

/**
 * Submit an EVM transaction via connected wallet or built-in wallet.
 *
 * Handles the connected-vs-built-in branching that was duplicated across
 * boltz.ts and executors.ts. For Arbitrum connected wallet transactions,
 * tries gasless relay first (via sendConnectedWalletArbitrumTx), then
 * falls back to direct evmSigner.sendTransaction.
 *
 * @returns Transaction hash on success, error on failure.
 */
export async function sendEvmTransaction(
	params: EvmTxParams
): Promise<{ data: string | null; error: Error | null }> {
	const { to, data, value, chain, gasLimit = GAS_LIMIT_RSK, sourceConnectedWalletId } = params;
	const safeTo = safeAddress(to);
	if (!safeTo) {
		return {
			data: null,
			error: new Error(`Invalid destination address: ${to}`)
		};
	}

	try {
		let txHash: string;

		if (sourceConnectedWalletId) {
			const evmSigner = getEvmSigner(sourceConnectedWalletId);
			if (!evmSigner) {
				return {
					data: null,
					error: new Error('Connected wallet EVM signer not available')
				};
			}

			if (chain === 'arbitrum') {
				// Use gasless relay for Arbitrum connected wallet transactions
				txHash = await sendConnectedWalletArbitrumTx(evmSigner, safeTo, data, String(value));
			} else {
				const chainId = chain === 'rsk' ? CHAIN_ID_RSK : CHAIN_ID_BSC;
				const txValue = typeof value === 'string' ? BigInt(value) : value;
				const result = await evmSigner.sendTransaction({
					to: safeTo,
					data,
					value: txValue,
					chainId
				});
				txHash = result.txHash;
			}
		} else {
			// Built-in wallet
			if (chain === 'arbitrum') {
				txHash = await sendArbitrumTransaction({
					to: safeTo,
					data,
					value: String(value),
					gasLimit
				});
			} else {
				txHash = await sendRawTransaction({
					to: safeTo,
					data,
					value: String(value),
					gasLimit
				});
			}
		}

		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		d.error('EVM transaction failed (%s): %s', chain, message);
		Sentry.addBreadcrumb({
			category: 'swap-chain.tx',
			message: `EVM tx failed on ${chain}`,
			level: 'error',
			data: { chain, sourceConnectedWalletId, error: message }
		});
		return { data: null, error: new Error(message) };
	}
}

// ---------------------------------------------------------------------------
// Connected Wallet Arbitrum Gasless Relay
// ---------------------------------------------------------------------------

/**
 * Send an Arbitrum transaction from a connected wallet, trying gasless first.
 *
 * If the gasless relay is available and the user has a JWT, wraps the call
 * in `sendGaslessCalls()` (executeBatch with fee buffer). Falls back to
 * direct `evmSigner.sendTransaction()` if gasless fails or is unavailable.
 */
export async function sendConnectedWalletArbitrumTx(
	evmSigner: EVMSigner,
	to: string,
	data: string,
	value?: string | bigint
): Promise<string> {
	// Try gasless relay first
	try {
		const { sendGaslessCalls } = await import('$lib/wallet/gasless-store');
		const jwt = (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) || '';
		if (jwt) {
			const { USDT0_ADDRESS, FEE_BUFFER_MIN } = await import('$lib/wallet/gasless.config');
			const feeToken = USDT0_ADDRESS;
			const feeBuffer = FEE_BUFFER_MIN[feeToken.toLowerCase()] ?? 10_000_000_000_000_000n;
			const callValue = value ? BigInt(value) : 0n;

			const txHash = await sendGaslessCalls(
				[{ to, data, value: callValue }],
				feeToken,
				feeBuffer,
				jwt
			);
			d.log('Connected wallet Arbitrum tx via gasless: %s', txHash.substring(0, 16));
			return txHash;
		}
	} catch (gaslessErr) {
		d.warn('Gasless relay failed for connected wallet, falling back to direct: %s', gaslessErr);
	}

	// Direct transaction fallback
	const txValue = value ? BigInt(value) : undefined;
	const result = await evmSigner.sendTransaction({
		to,
		data,
		value: txValue,
		chainId: CHAIN_ID_ARB
	});
	return result.txHash;
}

// ---------------------------------------------------------------------------
// Address Resolution
// ---------------------------------------------------------------------------

/**
 * Get the user's own wallet address for a given asset/chain (built-in wallet).
 *
 * For intermediate multi-hop swaps, Changelly should send the swapped funds
 * to the user's own wallet (not the final destination) so that the next hop
 * can process them.
 */
function getUserAddressForChain(asset: string): string {
	const $wallet = get(walletStore);

	switch (asset) {
		case 'BTC':
			// Use BTC wallet address when a native Bitcoin wallet is available.
			// The same BIP-44 seed is used for all chains; RSK address is the
			// fallback until a dedicated BTC wallet is added to the store.
			// BTC addresses are not EVM — cannot checksum; only safeAddress the RSK fallback.
			return (
				($wallet as { btc?: { address?: string } }).btc?.address ?? safeAddress($wallet.rsk.address)
			);
		case 'RBTC':
			return safeAddress($wallet.rsk.address);
		case 'USDT':
			return safeAddress($wallet.bsc.address);
		default:
			return safeAddress($wallet.rsk.address);
	}
}

/**
 * Resolve the user's address for a given chain, checking connected wallet first.
 * Falls back to the built-in wallet store if no connected wallet is active.
 */
export function resolveUserAddress(state: SwapChainState, asset: string): string {
	if (state.sourceConnectedWalletId) {
		const handle = getHandle(state.sourceConnectedWalletId);
		if (handle) {
			// Use the connected wallet's address. The connected wallet may not
			// have chain-specific addresses, but the primary EVM address works
			// for RSK, BSC, and Arbitrum. For BTC, use the BTC address if available.
			if (asset === 'BTC' && handle.bitcoinSigner?.address) {
				return handle.bitcoinSigner.address;
			}
			return safeAddress(handle.address);
		}
	}
	return getUserAddressForChain(asset);
}
