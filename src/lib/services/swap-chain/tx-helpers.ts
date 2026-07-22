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

/**
 * Extract the revert reason from a UserOperationRevertReason event.
 *
 * The event data format is: (uint256 nonce, bytes revertReason)
 * The revertReason bytes often contain an ExecuteError(uint256 index, bytes error)
 * from the BaseAccount contract, which wraps the inner revert.
 */
function extractUserOpRevertReason(
	logs: Array<{ topics?: string[]; data?: string }>,
	revertReasonSig: string
): string | null {
	for (const log of logs) {
		if (log.topics?.[0] === revertReasonSig && log.data && log.data.length > 130) {
			try {
				// Skip nonce (32 bytes) + offset pointer (32 bytes) to get to the bytes length
				const dataHex = log.data.slice(2); // remove 0x
				// bytes offset is at position 64 (32 bytes = 64 hex chars from start of data)
				const bytesOffset = parseInt(dataHex.slice(64, 128), 16) * 2; // in hex chars
				const bytesLength = parseInt(dataHex.slice(128, 128 + 64), 16) * 2;
				const revertBytes = dataHex.slice(128 + 64, 128 + 64 + bytesLength);

				if (revertBytes.length === 0) return 'empty revert data';

				// Check for ExecuteError(uint256,bytes) selector: 0x5a154675
				if (revertBytes.startsWith('5a154675')) {
					const callIndex = parseInt(revertBytes.slice(8, 72), 16);
					// Inner error offset and length
					const innerOffset = parseInt(revertBytes.slice(72, 136), 16) * 2;
					const innerLength = parseInt(revertBytes.slice(136, 136 + 64), 16) * 2;
					const innerError = revertBytes.slice(136 + 64, 136 + 64 + innerLength);
					if (innerError.length === 0) {
						return `ExecuteError at call index ${callIndex} (empty inner error — likely out of gas or bare revert)`;
					}
					return `ExecuteError at call index ${callIndex}, inner revert: 0x${innerError.slice(0, 64)}`;
				}

				return `revert data: 0x${revertBytes.slice(0, 64)}`;
			} catch {
				return 'could not parse revert reason';
			}
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// ERC-20 Balance Query
// ---------------------------------------------------------------------------

/**
 * Query an ERC-20 token balance on-chain via eth_call.
 *
 * Calls `balanceOf(address)` on the token contract and returns the raw
 * balance in the token's smallest unit (e.g., wei for 18-decimal tokens,
 * sats for 8-decimal tokens).
 *
 * @param tokenAddress - ERC-20 contract address
 * @param walletAddress - Wallet address to query
 * @param chain - Chain to query on
 * @returns Balance as bigint, or null on RPC error (callers must handle)
 */
export async function queryERC20Balance(
	tokenAddress: string,
	walletAddress: string,
	chain: 'rsk' | 'arbitrum' | 'bsc'
): Promise<bigint | null> {
	const rpcUrls = RECEIPT_RPC_URLS[chain];
	if (!rpcUrls) return 0n;

	// balanceOf(address) selector = 0x70a08231
	const paddedAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
	const calldata = `0x70a08231${paddedAddr}`;

	for (const rpcUrl of rpcUrls) {
		try {
			const resp = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_call',
					params: [{ to: tokenAddress, data: calldata }, 'latest'],
					id: 1
				})
			});
			const data = await resp.json();
			if (data.result && data.result !== '0x') {
				return BigInt(data.result);
			}
			return 0n;
		} catch (e) {
			d.warn(
				'queryERC20Balance RPC %s error: %s token=%s chain=%s',
				rpcUrl,
				(e as Error).message,
				tokenAddress.slice(0, 10),
				chain
			);
			// Try next RPC in the list
		}
	}
	return null;
}

/**
 * Poll an ERC-20 balance until it reaches a minimum amount.
 *
 * Used between multi-hop swaps to verify that the intermediate token
 * (e.g., tBTC from Symbiosis) has arrived before the next hop (e.g., Boltz).
 *
 * @param tokenAddress - ERC-20 contract address
 * @param walletAddress - Wallet address to query
 * @param minBalance - Minimum balance to wait for (in smallest unit)
 * @param chain - Chain to query on
 * @param maxWaitMs - Maximum wait time in ms (default 120s)
 * @returns Final balance as bigint (may be 0n on timeout)
 */
export async function waitForERC20Balance(
	tokenAddress: string,
	walletAddress: string,
	minBalance: bigint,
	chain: 'rsk' | 'arbitrum' | 'bsc',
	maxWaitMs = 120_000
): Promise<bigint> {
	const startTime = Date.now();
	let pollInterval = 3000;
	const MAX_POLL_INTERVAL = 10_000;

	while (Date.now() - startTime < maxWaitMs) {
		const balance = await queryERC20Balance(tokenAddress, walletAddress, chain);
		// null = RPC error, treat as 0 and retry
		const effectiveBalance = balance ?? 0n;
		if (effectiveBalance >= minBalance) {
			return effectiveBalance;
		}

		const elapsed = Math.round((Date.now() - startTime) / 1000);
		d.log(
			'[waitForERC20Balance] token=%s balance=%s min=%s elapsed=%ds',
			tokenAddress.slice(0, 10),
			effectiveBalance.toString(),
			minBalance.toString(),
			elapsed
		);

		await new Promise((r) => setTimeout(r, pollInterval));
		pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
	}

	// Final check after timeout
	const finalBalance = await queryERC20Balance(tokenAddress, walletAddress, chain);
	return finalBalance ?? 0n;
}

// ---------------------------------------------------------------------------
// Receipt Verification
// ---------------------------------------------------------------------------

/** RPC URLs for receipt polling per chain. Arbitrum has fallback endpoints for resilience. */
const RECEIPT_RPC_URLS: Record<string, string[]> = {
	arbitrum: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
	rsk: ['https://mainnet.sovryn.app/rpc'],
	bsc: ['https://bsc-dataseed.binance.org']
};

/** Polling interval per chain (ms) — Arbitrum has fast blocks, RSK is slower */
const RECEIPT_POLL_INTERVAL_MS: Record<string, number> = {
	arbitrum: 2_000,
	rsk: 5_000,
	bsc: 3_000
};

/** Max polling attempts before giving up (60 × interval ≈ 120s–300s) */
const RECEIPT_MAX_ATTEMPTS = 60;

/**
 * Poll for a transaction receipt until it is available or we time out.
 *
 * @returns Receipt with status and gasUsed, or `null` on timeout.
 */
export async function waitForReceipt(
	txHash: string,
	chain: string
): Promise<{ status: string; gasUsed: number; logs?: Array<{ topics: string[]; data: string }> } | null> {
	const rpcUrls = RECEIPT_RPC_URLS[chain];
	if (!rpcUrls) {
		d.log('[waitForReceipt] No RPC URL configured for chain:', chain);
		return null;
	}

	const pollInterval = RECEIPT_POLL_INTERVAL_MS[chain] ?? 3_000;

	for (let i = 0; i < RECEIPT_MAX_ATTEMPTS; i++) {
		// First attempt is immediate; subsequent attempts wait the poll interval.
		if (i > 0) {
			await new Promise((r) => setTimeout(r, pollInterval));
		}
		for (const rpcUrl of rpcUrls) {
			try {
				const resp = await fetch(rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getTransactionReceipt',
						params: [txHash],
						id: 1
					})
				});
				const data = await resp.json();
				if (data.result) {
					return {
						status: data.result.status,
						gasUsed: parseInt(data.result.gasUsed, 16),
						logs: data.result.logs || []
					};
				}
				break; // Got a valid response (no receipt yet), no need to try other RPCs
			} catch {
				d.log('[waitForReceipt] RPC %s failed, trying next', rpcUrl);
				// Try next RPC in the list
			}
		}
	}
	return null; // Timed out
}

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
	/** Preferred fee token for gasless relay (e.g., tBTC when claiming tBTC).
	 *  When set, the relay uses this token for the fee buffer instead of
	 *  scanning the user's balance. This enables atomic claim+fee where
	 *  the claim produces the tokens that pay the fee in the same tx. */
	feeToken?: string;
	/** Additional calls to batch with the primary call in a single executeBatch.
	 *  When set, all calls (primary + extra) are wrapped in one UserOp. */
	extraCalls?: Array<{ to: string; data: string; value: bigint }>;
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
	const { to, data, value, chain, gasLimit = GAS_LIMIT_RSK, sourceConnectedWalletId, feeToken, extraCalls } = params;
	const safeTo = safeAddress(to);
	d.log(
		'[sendEvmTransaction] START chain=%s to=%s safeTo=%s value=%s dataLen=%d connected=%s',
		chain,
		to?.slice(0, 10),
		safeTo?.slice(0, 10) || 'EMPTY',
		String(value).slice(0, 20),
		data?.length ?? 0,
		sourceConnectedWalletId ?? 'builtin'
	);
	if (!safeTo) {
		return {
			data: null,
			error: new Error(`Invalid destination address: ${to}`)
		};
	}

	try {
		let txHash: string;

		if (sourceConnectedWalletId) {
			d.log('[sendEvmTransaction] Using connected wallet:', sourceConnectedWalletId);
			const evmSigner = getEvmSigner(sourceConnectedWalletId);
			if (!evmSigner) {
				return {
					data: null,
					error: new Error('Connected wallet EVM signer not available')
				};
			}

			if (chain === 'arbitrum') {
				// Use gasless relay for Arbitrum connected wallet transactions
				d.log('[sendEvmTransaction] Calling sendConnectedWalletArbitrumTx...');
				txHash = await sendConnectedWalletArbitrumTx(evmSigner, safeTo, data, String(value), feeToken);
				d.log('[sendEvmTransaction] sendConnectedWalletArbitrumTx done:', txHash);
			} else {
				const chainId = chain === 'rsk' ? CHAIN_ID_RSK : CHAIN_ID_BSC;
				const txValue = typeof value === 'string' ? BigInt(value) : value;
				d.log('[sendEvmTransaction] Calling evmSigner.sendTransaction chainId=%d...', chainId);
				const result = await evmSigner.sendTransaction({
					to: safeTo,
					data,
					value: txValue,
					chainId
				});
				txHash = result.txHash;
				d.log('[sendEvmTransaction] evmSigner.sendTransaction done:', txHash);
			}
		} else {
			// Built-in wallet
			if (chain === 'arbitrum') {
				d.log('[sendEvmTransaction] Calling sendArbitrumTransaction (built-in)...');
				txHash = await sendArbitrumTransaction({
					to: safeTo,
					data,
					value: String(value),
					gasLimit,
					feeToken,
					extraCalls
				});
			} else {
				d.log('[sendEvmTransaction] Calling sendRawTransaction (built-in RSK/BSC)...');
				txHash = await sendRawTransaction({
					to: safeTo,
					data,
					value: String(value),
					gasLimit,
					chain: chain as 'rsk' | 'bsc'
				});
			}
			d.log('[sendEvmTransaction] Built-in wallet txHash:', txHash);
		}

		// ── Receipt verification ─────────────────────────────────────────
		// A reverted tx still has a hash. We must wait for the receipt and
		// verify on-chain success before declaring the hop complete.
		d.log('[sendEvmTransaction] tx submitted: %s, waiting for receipt...', txHash);

		const receipt = await waitForReceipt(txHash, chain);
		if (!receipt) {
			return {
				data: null,
				error: new Error(`Transaction ${txHash.slice(0, 10)}... failed: no receipt after timeout`)
			};
		}
		if (receipt.status === '0x0' || receipt.status === '0') {
			return {
				data: null,
				error: new Error(
					`Transaction ${txHash.slice(0, 10)}... reverted on-chain (gasUsed: ${receipt.gasUsed})`
				)
			};
		}

		// For gasless (ERC-4337) transactions, verify the UserOp actually
		// succeeded. A bundle transaction can succeed (status=0x1) while
		// the individual UserOp reverts inside it. Check UserOperationEvent
		// logs for success=false.
		if (chain === 'arbitrum' && receipt.logs) {
			const userOpEventSig = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
			const userOpRevertReasonSig = '0x1c4fada7374c0a9ee8841fc38afe82932dc0f8e69012e927f061a8bae611a201';
			for (const log of receipt.logs) {
				if (log.topics?.[0] === userOpEventSig) {
					// UserOperationEvent(bytes32 indexed userOpHash, address indexed sender,
					//   address indexed paymaster, uint256 nonce, bool success,
					//   uint256 actualGasCost, uint256 actualGasUsed)
					const successData = log.data;
					if (successData && successData.length >= 130) {
						// success is the 5th field (index 4) — after nonce
						// offset: 32 bytes nonce + success starts at byte 32
						const successHex = '0x' + successData.slice(66, 130);
						const success = BigInt(successHex) !== 0n;
						if (!success) {
							// Try to extract revert reason from UserOperationRevertReason event
							const revertReason = extractUserOpRevertReason(receipt.logs, userOpRevertReasonSig);
							const detail = revertReason
								? ` — ${revertReason}`
								: '';
							d.log('[sendEvmTransaction] UserOp reverted inside bundle%s', detail);
							return {
								data: null,
								error: new Error(
									`UserOp execution reverted on-chain (bundle tx: ${txHash.slice(0, 10)}...)${detail}`
								)
							};
						}
					}
				}
			}
		}

		d.log(
			'[sendEvmTransaction] tx confirmed: status=%s gasUsed=%s',
			receipt.status,
			receipt.gasUsed
		);

		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		d.log('[sendEvmTransaction] CAUGHT:', message);
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
 * Send an Arbitrum transaction via a connected wallet (e.g. MetaMask).
 *
 * Uses the gasless relay when available. When `preferredFeeToken` is set
 * (atomic claim+fee pattern), the gasless relay is the ONLY path — no
 * direct-tx fallback because the executeBatch bundles claim + fee transfer.
 */
export async function sendConnectedWalletArbitrumTx(
	evmSigner: EVMSigner,
	to: string,
	data: string,
	value?: string | bigint,
	preferredFeeToken?: string
): Promise<string> {
	// Try gasless relay first
	try {
		const { sendGaslessCalls, gaslessWallet } = await import('$lib/wallet/gasless-store');
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		const { TOKENS } = await import('$lib/wallet/gasless.config');

		// Get the smart account address for balance checks
		const state = get(gaslessWallet);
		if (!state.ready || !state.address) {
			throw new Error('Gasless wallet not initialized');
		}
		const sender = state.address;
		const callValue = value ? BigInt(value) : 0n;

		// If a preferred fee token is provided (e.g., tBTC when claiming),
		// use it directly — the claim produces the tokens atomically in the
		// same executeBatch, so no pre-existing balance is needed.
		// Gasless-only: no direct-tx fallback for atomic claim+fee.
		if (preferredFeeToken) {
			const estimate = await estimateFee(preferredFeeToken, 1n, to);
			const feeBuffer = BigInt(estimate.feeBuffer);
			const tokenInfo = TOKENS.find((t) => t.address.toLowerCase() === preferredFeeToken.toLowerCase());
			d.log('Using preferred fee token %s (%s), feeBuffer=%s', tokenInfo?.symbol ?? preferredFeeToken, preferredFeeToken, feeBuffer.toString());

			const txHash = await sendGaslessCalls(
				[{ to, data, value: callValue }],
				preferredFeeToken,
				feeBuffer,
				estimate.estimatedGas
			);
			d.log('Connected wallet Arbitrum tx via gasless (preferred fee in %s): %s', tokenInfo?.symbol ?? preferredFeeToken, txHash.substring(0, 16));
			return txHash;
		}

		// No preferred token — scan all allowed fee token balances
		const balanceChecks = await Promise.all(
			TOKENS.map(async (token) => {
				const balance = await queryERC20Balance(token.address, sender, 'arbitrum');
				return { token: token.address, symbol: token.symbol, balance: balance ?? 0n };
			})
		);

		// Sort by balance descending — prefer the token the user has the most of
		const sorted = balanceChecks.filter((b) => b.balance > 0n).sort((a, b) => (a.balance > b.balance ? -1 : 1));

		if (sorted.length === 0) {
			d.log('No fee token balance found for %s, falling back to direct tx', sender);
			throw new Error('No token balance for gasless fee');
		}

		// Try each token the user holds, starting with the largest balance
		let lastErr: Error | null = null;
		for (const { token: feeToken, symbol } of sorted) {
			try {
				const estimate = await estimateFee(feeToken, 1n, to);
				const feeBuffer = BigInt(estimate.feeBuffer);

				// Check if balance covers the fee
				const tokenBalance = sorted.find((b) => b.token === feeToken)?.balance ?? 0n;
				if (tokenBalance < feeBuffer) {
					d.log('Insufficient %s for fee buffer: have %s, need %s', symbol, tokenBalance.toString(), feeBuffer.toString());
					continue;
				}

				const callValue = value ? BigInt(value) : 0n;
				const txHash = await sendGaslessCalls(
					[{ to, data, value: callValue }],
					feeToken,
					feeBuffer,
					estimate.estimatedGas
				);
				d.log('Connected wallet Arbitrum tx via gasless (fee in %s): %s', symbol, txHash.substring(0, 16));
				return txHash;
			} catch (err) {
				lastErr = err instanceof Error ? err : new Error(String(err));
				d.warn('Gasless relay with %s failed: %s', symbol, lastErr.message);
				continue;
			}
		}

		// All fee tokens exhausted
		if (lastErr) throw lastErr;
		throw new Error('No suitable fee token found');
	} catch (gaslessErr) {
		// When preferredFeeToken is set, this is an atomic claim+fee — no fallback.
		// The direct tx path can't execute the claim+fee bundle, so throw with
		// isRelayFailure flag so the UI can show a clear message.
		if (preferredFeeToken) {
			const relayErr = gaslessErr instanceof Error ? gaslessErr : new Error('Gasless relay unavailable');
			(relayErr as Error & { isRelayFailure?: boolean }).isRelayFailure = true;
			d.warn('Gasless relay failed for atomic claim+fee (no fallback): %s', relayErr.message);
			throw relayErr;
		}

		d.warn('Gasless relay failed for connected wallet, falling back to direct: %s', gaslessErr);
	}

	// Direct transaction fallback (only when no preferredFeeToken)
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
