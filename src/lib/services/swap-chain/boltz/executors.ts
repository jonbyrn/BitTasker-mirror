/**
 * Swap Chain — Boltz Swap Executors
 *
 * Direction-specific swap execution functions and the central dispatcher.
 * Each executor handles one swap direction (e.g., tBTC→RBTC) and delegates
 * common setup/funding to the setup module.
 */

import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import {
	walletStore,
	createSubmarineSwap,
	lockSubmarineSwapFunds,
	createChainSwap
} from '$lib/stores/wallet.store';
import { getHandle } from '$lib/stores/connected-wallets.store';
import {
	sendEvmTransaction,
	resolveUserAddress,
	queryERC20Balance,
	waitForERC20Balance
} from '../tx-helpers';
import { parseDecimalToSmallestUnit, satsToWei } from '$lib/utils/amount-conversion';
import { generateSwapPreimage } from '$lib/utils/swap-preimage';
import { TBTC_ARB } from '../utils';
import { boltzProvider } from '$lib/services/BoltzProvider';
import { encodeERC20Approve, encodeERC20SwapLock, buildExecuteBatchCallData } from '../abi';
import type { RouteHop } from '$lib/services/route-resolver';
import { safeAddress, boltzAddress, type SwapChainState, setSwapProgress } from '../state';
import { getEthers, prepareChainSwap, lockRskFunds, storeBoltzSwapData } from './setup';
import type { BoltzHopResult } from './setup';

const d = createDebug('swap-chain');

// boltzProvider singleton — aliased as 'boltz' for brevity
const boltz = boltzProvider;

// ---------------------------------------------------------------------------
// Swap branches
// ---------------------------------------------------------------------------

/**
 * tBTC → RBTC via Boltz direct chain swap.
 * Sends tBTC (ERC-20 on Arbitrum) to a Boltz lockup address; Boltz releases rBTC on RSK.
 * Verifies tBTC balance before creating the swap; handles ERC-20 approve + lock.
 */
async function executeTbtcToRbtcSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	d.log('[executeTbtcToRbtcSwap] START amount=%s', state.amount);
	const amount = state.amount;
	if (!amount) return { data: null, error: new Error('Amount is required') };
	const expectedAmountSats = Number(parseDecimalToSmallestUnit(amount, 8));
	d.log('[executeTbtcToRbtcSwap] expectedAmountSats=%d', expectedAmountSats);
	if (expectedAmountSats <= 0) return { data: null, error: new Error('Invalid amount') };

	try {
		const rskAddr = boltzAddress(get(walletStore).rsk.address ?? '');
		d.log('[executeTbtcToRbtcSwap] rskAddr=%s', rskAddr || 'EMPTY');
		if (!rskAddr) return { data: null, error: new Error('No RSK wallet address') };

		// Resolve the user's Arbitrum address for balance check
		const arbAddr = state.sourceConnectedWalletId
			? safeAddress(getHandle(state.sourceConnectedWalletId)?.address ?? '')
			: safeAddress(get(walletStore).arb?.address || get(walletStore).rsk.address || '');
		if (!arbAddr)
			return { data: null, error: new Error('No Arbitrum wallet address for balance check') };

		// Wait for tBTC balance to arrive on Arbitrum.
		// For 2-hop routes (e.g., wBTC→Symbiosis→tBTC→Boltz→rBTC), the tBTC
		// may arrive asynchronously from the Symbiosis swap. We wait until the
		// balance is sufficient or timeout.
		const expectedWei = satsToWei(expectedAmountSats);
		setSwapProgress('locking-tbtc', 'Waiting for tBTC delivery on Arbitrum...');
		d.log(
			'[executeTbtcToRbtcSwap] Waiting for tBTC balance at %s (need %s wei)...',
			arbAddr,
			expectedWei.toString()
		);

		const tbtcBalance = await waitForERC20Balance(
			TBTC_ARB,
			arbAddr,
			expectedWei,
			'arbitrum',
			180_000 // 3 minutes — generous for same-chain DEX swap
		);

		d.log(
			'[executeTbtcToRbtcSwap] tBTC balance: %s wei (expected: %s)',
			tbtcBalance.toString(),
			expectedWei.toString()
		);

		if (tbtcBalance === 0n) {
			return {
				data: null,
				error: new Error('tBTC balance is 0 on Arbitrum — swap delivery may have failed')
			};
		}

		// Use the actual balance if it's less than expected (Symbiosis slippage/fees).
		// Convert wei to sats: sats = wei / 1e10
		const actualAmountSats = Number(tbtcBalance / 10_000_000_000n);
		const amountSats = Math.min(expectedAmountSats, actualAmountSats);

		if (amountSats < 100) {
			return {
				data: null,
				error: new Error(`tBTC balance too low: ${actualAmountSats} sats (minimum 100 sats)`)
			};
		}

		if (actualAmountSats < expectedAmountSats) {
			d.log(
				'[executeTbtcToRbtcSwap] Using reduced amount: %d sats (expected %d, slippage %d sats)',
				actualAmountSats,
				expectedAmountSats,
				expectedAmountSats - actualAmountSats
			);
			d.warn(
				'TBTC balance lower than expected: got %d sats, wanted %d sats (slippage: %d)',
				actualAmountSats,
				expectedAmountSats,
				expectedAmountSats - actualAmountSats
			);
		}

		// Create Boltz swap with the actual available amount
		const refundWallet = (await getEthers()).ethers.Wallet.createRandom();
		const { preimageHex, hashHex } = await generateSwapPreimage();

		d.log('Creating TBTC→RBTC chain swap: %d sats to %s', amountSats, rskAddr);
		const swapResult = await boltz.createSwap({
			amountSats,
			claimAddress: rskAddr,
			preimageHash: hashHex,
			refundPublicKey: refundWallet.publicKey.slice(2),
			fromSymbol: 'TBTC',
			toSymbol: 'RBTC'
		});
		d.log(
			'[executeTbtcToRbtcSwap] boltz.createSwap OK: id=%s lockup=%s expectedAmt=%d',
			swapResult.swapId,
			swapResult.lockupAddress,
			swapResult.expectedAmount
		);
		d.log('Chain swap created: id=%s lockup=%s', swapResult.swapId, swapResult.lockupAddress);

		setSwapProgress('locking-tbtc', `Locking tBTC → ${swapResult.swapId}`);

		await storeBoltzSwapData({
			swapId: swapResult.swapId,
			preimageHex,
			hashHex,
			claimDetails: swapResult.claimDetails,
			lockupAddress: swapResult.lockupAddress,
			timeoutBlockHeight: swapResult.timeoutBlockHeight,
			claimAddress: swapResult.claimAddress
		});

		// Use the Boltz expected amount for the lock (may differ slightly from our amountSats)
		const lockAmountSats = swapResult.expectedAmount || amountSats;
		const tbtcAmount = satsToWei(lockAmountSats);

		// Verify balance still sufficient after Boltz swap creation
		const currentBalance = await queryERC20Balance(TBTC_ARB, arbAddr, 'arbitrum');
		if (currentBalance === null) {
			return { data: null, error: new Error('Failed to query tBTC balance (RPC error)') };
		}
		if (currentBalance < tbtcAmount) {
			return {
				data: null,
				error: new Error(
					`Insufficient tBTC for lock: have ${currentBalance.toString()} wei, need ${tbtcAmount.toString()} wei`
				)
			};
		}

		// Batch approve + lock into a single gasless UserOp via executeBatch.
		// This eliminates the second round-trip and prevents timing issues where
		// the Boltz swap expires between the two separate transactions.
		const lockupContract = swapResult.lockupAddress;
		const approveCalldata = encodeERC20Approve(lockupContract, tbtcAmount);
		const lockCalldata = encodeERC20SwapLock(
			'0x' + hashHex,
			tbtcAmount,
			TBTC_ARB,
			swapResult.claimAddress,
			swapResult.timeoutBlockHeight
		);

		d.log(
			'[executeTbtcToRbtcSwap] Batching approve + lock: approve tBTC for %s, then ERC20Swap.lock() amount=%s',
			lockupContract,
			tbtcAmount.toString()
		);
		setSwapProgress('locking-tbtc', `Locking tBTC → ${swapResult.swapId}`);

		const { data: lockupTxHash, error: lockupError } = await sendEvmTransaction({
			to: TBTC_ARB,
			data: approveCalldata,
			value: 0n,
			chain: 'arbitrum',
			sourceConnectedWalletId: state.sourceConnectedWalletId,
			extraCalls: [{ to: lockupContract, data: lockCalldata, value: 0n }]
		});
		d.log(
			'[executeTbtcToRbtcSwap] lock result: tx=%s error=%s',
			lockupTxHash ?? 'null',
			lockupError?.message ?? 'none'
		);
		if (lockupError) return { data: null, error: lockupError };
		d.log('TBTC lockup tx: %s', lockupTxHash);
		setSwapProgress(
			'locking-tbtc',
			`Lockup tx sent: ${lockupTxHash?.substring(0, 16) ?? 'unknown'}...`
		);
		return { data: swapResult.swapId, error: null };
	} catch (err) {
		d.log('[executeTbtcToRbtcSwap] CAUGHT:', (err as Error).message);
		d.error('TBTC→RBTC chain swap failed: %s', (err as Error).message);
		Sentry.captureException(err, { tags: { area: 'swap-chain.tbtc-to-rbtc' } });
		return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

/**
 * RBTC → Lightning via Boltz submarine swap.
 *
 * The user sends rBTC to a Boltz lockup address. Boltz pays the Lightning
 * invoice on the user's behalf.
 */
async function executeRbtcToLightningSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	if (!state.destination || state.destination.type !== 'invoice') {
		return { data: null, error: new Error('Lightning hop requires an invoice destination') };
	}

	const { data: swapResult, error: createError } = await tryCatch(
		createSubmarineSwap(state.destination.invoice)
	);

	if (createError !== null) {
		return {
			data: null,
			error: createError instanceof Error ? createError : new Error(String(createError))
		};
	}

	// Lock funds to execute the swap
	if (state.sourceConnectedWalletId) {
		d.log(
			'executeRbtcToLightningSwap: using connected wallet %s for lockup',
			state.sourceConnectedWalletId
		);

		// Extract lockup details from SubmarineSwapResult.swapData (typed from wallet-core SDK).
		const lockupAddress = swapResult.swapData.lockupAddress;
		const lockupAmountRaw = swapResult.swapData.expectedAmount;

		if (!lockupAddress) {
			return { data: null, error: new Error('Could not extract lockup address from swap data') };
		}
		if (typeof lockupAmountRaw !== 'number' && typeof lockupAmountRaw !== 'string') {
			return { data: null, error: new Error('Could not extract lockup amount from swap data') };
		}

		const lockupAmountWei = BigInt(lockupAmountRaw);

		const { data: txHash, error: txError } = await sendEvmTransaction({
			to: lockupAddress,
			data: '0x',
			value: lockupAmountWei,
			chain: 'rsk',
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});
		if (txError) return { data: null, error: txError };
		return { data: txHash, error: null };
	}

	// Built-in wallet lockup
	const { data: lockResult, error: lockError } = await tryCatch(
		lockSubmarineSwapFunds(swapResult.swapData)
	);

	if (lockError !== null) {
		return {
			data: null,
			error: lockError instanceof Error ? lockError : new Error(String(lockError))
		};
	}

	return { data: lockResult?.txHash ?? null, error: null };
}

/**
 * RBTC → BTC via Boltz chain swap (on-chain Bitcoin).
 *
 * Connected wallet: creates the swap via Boltz API and sends an rBTC lockup
 * via the EtherSwap.lock() contract on RSK.
 * Built-in wallet: delegates to `createChainSwap` (handles everything).
 */
async function executeRbtcToBtcSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	const amount = state.amount;
	if (!amount) {
		return { data: null, error: new Error('Amount is required for chain swap') };
	}

	const amountSats = Number(parseDecimalToSmallestUnit(amount, 8));
	if (amountSats <= 0) {
		return { data: null, error: new Error('Invalid amount for chain swap') };
	}

	// Connected wallet path: create the swap via Boltz API and send lockup via evmSigner
	if (state.sourceConnectedWalletId) {
		d.log(
			'executeRbtcToBtcSwap: using connected wallet %s for RBTC→BTC',
			state.sourceConnectedWalletId
		);

		try {
			const btcAddr = resolveUserAddress(state, 'BTC');
			if (!btcAddr) {
				return { data: null, error: new Error('No BTC address available for claim') };
			}

			const { data: setup, error: setupError } = await prepareChainSwap(
				state,
				boltzAddress(btcAddr)
			);
			if (setupError || !setup) return { data: null, error: setupError };

			const { data: lockupTxHash, error: lockupError } = await lockRskFunds(
				setup,
				state.sourceConnectedWalletId
			);
			if (lockupError) return { data: null, error: lockupError };
			d.log('Boltz chain swap (BTC) lockup tx: %s', lockupTxHash);

			return { data: setup.swapResult.swapId, error: null };
		} catch (err) {
			d.error('Boltz chain swap (RBTC→BTC) failed: %s', (err as Error).message);
			return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
		}
	}

	// Built-in wallet path
	const { data: swapResult, error: chainError } = await tryCatch(createChainSwap(amountSats));
	if (chainError !== null) {
		return {
			data: null,
			error: chainError instanceof Error ? chainError : new Error(String(chainError))
		};
	}
	return { data: swapResult?.swapId ?? null, error: null };
}

/**
 * RBTC or BTC → tBTC on Arbitrum via Boltz chain swap.
 * User locks rBTC on RSK; Boltz releases tBTC on Arbitrum. Claim handled by pollBoltzChainSwapCompletion.
 */
async function executeRbtcToArbitrumSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	d.log('executeRbtcToArbitrumSwap: connected=%s', state.sourceConnectedWalletId ?? 'builtin');

	try {
		const arbAddr = state.sourceConnectedWalletId
			? boltzAddress(getHandle(state.sourceConnectedWalletId)?.address ?? '')
			: boltzAddress(get(walletStore).arb?.address || get(walletStore).rsk.address || '');
		if (!arbAddr) return { data: null, error: new Error('No Arbitrum wallet address available') };

		const { data: setup, error: setupError } = await prepareChainSwap(state, arbAddr);
		if (setupError || !setup) return { data: null, error: setupError };

		setSwapProgress('locking-rbtc', `Locking rBTC → ${setup.swapResult.swapId}`);

		const { data: lockupTxHash, error: lockupError } = await lockRskFunds(
			setup,
			state.sourceConnectedWalletId
		);
		if (lockupError) {
			d.error('Boltz lockup failed: %s', lockupError.message);
			return { data: null, error: lockupError };
		}
		d.log('Boltz chain swap lockup tx: %s', lockupTxHash);
		setSwapProgress(
			'locking-rbtc',
			`Lockup tx sent: ${lockupTxHash?.substring(0, 16) ?? 'unknown'}...`
		);
		return { data: setup.swapResult.swapId, error: null };
	} catch (err) {
		d.error('Boltz chain swap failed: %s', err instanceof Error ? err.message : String(err));
		return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a Boltz swap hop. Routes to the appropriate swap function based
 * on source asset and destination chain.
 */
export async function executeBoltzHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<BoltzHopResult> {
	const from = hop.fromAsset.toUpperCase();
	const to = hop.toChain;

	d.log('executeBoltzHop: from=%s to=%s', from, to);

	if (from === 'TBTC' && to === 'rsk') return executeTbtcToRbtcSwap(state, hop);
	if (from === 'RBTC' && to === 'lightning') return executeRbtcToLightningSwap(state, hop);
	if (from === 'RBTC' && to === 'bitcoin') return executeRbtcToBtcSwap(state, hop);
	if ((from === 'RBTC' || from === 'BTC') && to === 'arbitrum')
		return executeRbtcToArbitrumSwap(state, hop);

	return {
		data: null,
		error: new Error(`Unsupported Boltz swap: ${hop.fromAsset} -> ${to}`)
	};
}
