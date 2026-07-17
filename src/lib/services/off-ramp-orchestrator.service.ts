/**
 * Off-Ramp Orchestrator
 *
 * Coordinates the sell-side bridge-and-send flow:
 *   1. LI.FI quote - compute bridge + MoonPay fees
 *   2. MoonPay off-ramp order - redirect URL
 *   3. User returns from MoonPay - paste deposit address
 *   4. LI.FI bridge execution (ERC-20 approve + swap tx)
 *   5. Bridge status monitoring (LI.FI getStatus polling)
 *
 * Only supports Arbitrum-sourced assets (LI.FI has no RSK/Bitcoin support):
 *   - usdt0-arb  (USDT0 on Arbitrum, 6 decimals)
 *   - wbtc-arb   (wBTC on Arbitrum, 8 decimals)
 *
 * Target: USDT-BSC on BNB Smart Chain (chain 56).
 *
 * Persists state to Capacitor Preferences for resilience across page refreshes
 * and Capacitor app background/foreground cycles.
 */

import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import * as Sentry from '@sentry/sveltekit';
import { changellyFiatService } from '$lib/services/fiat-ramp.service';
import { lifiService } from '$lib/services/lifi.service';
import type { LifiFeeCost } from '$lib/services/lifi.service';
import { symbiosisService } from '$lib/services/symbiosis.service';
import { sendEvmTransaction } from '$lib/services/swap-chain/tx-helpers';
import { encodeERC20Approve } from '$lib/services/swap-chain/abi';
import {
	CHAIN_ID_ARB,
	CHAIN_ID_BSC,
	CHAIN_ID_RSK,
	NATIVE_TOKEN
} from '$lib/services/swap-chain/utils';
import { isChangeallyFiatEnabled } from '$lib/services/kill-switch';

const debug = createDebug('off-ramp-orchestrator');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIFI_POLL_INTERVAL_MS = 10_000;
const LIFI_POLL_MAX_ATTEMPTS = 60;
const USDT_BSC_ADDR = '0x55d398326f99059fF775485246999027B3197955';
const MOONPAY_FEE_PERCENT = 1.65;
const ESTIMATED_TIME_SECONDS = 180; // ~3 min

/** Stale-flow threshold: flows older than 30 min are auto-expired. */
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Supported asset configuration.
 * Maps each OffRampAsset to its on-chain parameters for the LI.FI bridge.
 */
const ASSET_CONFIG: Record<
	OffRampAsset,
	{ fromChain: number; fromToken: string; decimals: number; bridgeProvider: 'lifi' | 'symbiosis' }
> = {
	'usdt0-arb': {
		fromChain: CHAIN_ID_ARB,
		fromToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		decimals: 6,
		bridgeProvider: 'lifi'
	},
	'wbtc-arb': {
		fromChain: CHAIN_ID_ARB,
		fromToken: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		decimals: 8,
		bridgeProvider: 'lifi'
	},
	rbtc: {
		fromChain: CHAIN_ID_RSK,
		fromToken: NATIVE_TOKEN,
		decimals: 18,
		bridgeProvider: 'symbiosis'
	}
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OffRampAsset = 'usdt0-arb' | 'wbtc-arb' | 'rbtc';

export type OffRampStage =
	| 'idle'
	| 'quote_loading'
	| 'quote_ready'
	| 'opening_moonpay'
	| 'awaiting_deposit_address'
	| 'bridging'
	| 'complete'
	| 'failed';

export interface OffRampQuote {
	inputAmount: string;
	inputAsset: OffRampAsset;
	/** Which bridge provider to use (LI.FI for Arbitrum assets, Symbiosis for RSK). */
	bridgeProvider: 'lifi' | 'symbiosis';
	/** USDT-BSC amount received after bridge completes. */
	bridgeOutputAmount: string;
	bridgeFeePercent: string;
	bridgeFeeUsd: string;
	/** Always "1.65" - MoonPay's flat off-ramp fee. */
	moonpayFeePercent: string;
	moonpayFeeUsd: string;
	/** Estimated USD fiat received after all fees. */
	estimatedFiatReceived: string;
	totalFeeUsd: string;
	totalFeePercent: string;
	estimatedTimeSeconds: number;
	fromChainId: number;
	fromTokenAddress: string;
	/** Input amount in wei (smallest unit). */
	fromAmountWei: string;
	fromDecimals: number;
}

export interface OffRampFlowState {
	stage: OffRampStage;
	externalOrderId: string;
	orderId: string;
	redirectUrl: string;
	quote: OffRampQuote;
	sourceWalletId: string;
	sourceAddress: string;
	depositAddress?: string;
	bridgeTxHash?: string;
	lifiStatus?: 'PENDING' | 'DONE' | 'FAILED' | 'NOT_FOUND';
	/** Symbiosis tx data stored from quote for executeBridge to use. */
	symbiosisTx?: { to: string; data: string; value: string; chainId: number; approveTo?: string };
	error?: string;
	updatedAt: number;
	startedAt: number;
}

export interface CreateQuoteParams {
	asset: OffRampAsset;
	/** Human-readable amount (e.g. "100.5" or "0.001"). */
	amount: string;
	/** User's Arbitrum wallet address. */
	sourceAddress: string;
	/** Connected wallet ID for EVM tx signing (empty string = built-in). */
	sourceWalletId: string;
}

type StageChangeCallback = (state: OffRampFlowState) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireOnline(): void {
	if (typeof window !== 'undefined' && !navigator.onLine) {
		throw new Error('Cannot proceed while offline');
	}
}

function requireEnabled(): void {
	if (!isChangeallyFiatEnabled()) {
		throw new Error('Off-ramp is not enabled');
	}
}

/**
 * Convert a human-readable token amount to its smallest-unit (wei) string.
 *
 * Handles fractional amounts by splitting on "." and padding the fraction
 * to the correct number of decimals. No floating-point math involved.
 *
 * @example toAmountWei("100.5", "usdt0-arb") // "100500000"
 * @example toAmountWei("0.001", "wbtc-arb")   // "100000"
 */
function toAmountWei(amount: string, asset: OffRampAsset): string {
	const decimals = ASSET_CONFIG[asset].decimals;
	const [whole, fraction = ''] = amount.split('.');
	const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
	const wholePart = BigInt(whole || '0') * BigInt(10 ** decimals);
	const fractionPart = BigInt(paddedFraction);
	return (wholePart + fractionPart).toString();
}

/**
 * Parse LI.FI estimate to compute bridge fee in USD and as a percentage.
 *
 * For stablecoin-to-stablecoin (USDT0 to USDT-BSC) the fee is the simple
 * difference between input and output (both approximately $1).
 *
 * For wBTC to USDT-BSC the fee is embedded in the swap rate. We extract
 * USD-denominated fee costs from the LI.FI estimate when available,
 * otherwise return "0.00" (the output amount itself is the authoritative
 * figure the user should rely on).
 */
function computeBridgeFee(
	fromAmount: string,
	toAmount: string,
	fromDecimals: number,
	feeCosts?: LifiFeeCost[]
): { feeUsd: string; feePercent: string } {
	// Stablecoin to stablecoin (USDT0-Arb 6 dec to USDT-BSC 18 dec)
	if (fromDecimals === 6) {
		const fromHuman = Number(fromAmount) / 1e6;
		const toHuman = Number(toAmount) / 1e18;
		const fee = Math.max(0, fromHuman - toHuman);
		const feePercent = fromHuman > 0 ? (fee / fromHuman) * 100 : 0;
		return { feeUsd: fee.toFixed(2), feePercent: feePercent.toFixed(2) };
	}

	// wBTC (8 dec) to USDT-BSC: try to sum USD-denominated fee costs
	if (feeCosts && feeCosts.length > 0) {
		let totalFeeUsd = 0;
		for (const fc of feeCosts) {
			if (fc.token.decimals === 6) {
				// USDT / USDC (6 decimals)
				totalFeeUsd += Number(fc.amount) / 1e6;
			} else if (fc.token.decimals === 18) {
				// 18-decimal stablecoins (DAI, etc.) - guard against non-stable values
				const amount = Number(fc.amount) / 1e18;
				if (amount > 0 && amount < 10_000) {
					totalFeeUsd += amount;
				}
			}
		}
		if (totalFeeUsd > 0) {
			const toHuman = Number(toAmount) / 1e18;
			const base = toHuman + totalFeeUsd;
			const feePercent = base > 0 ? (totalFeeUsd / base) * 100 : 0;
			return { feeUsd: totalFeeUsd.toFixed(2), feePercent: feePercent.toFixed(2) };
		}
	}

	return { feeUsd: '0.00', feePercent: '0.00' };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class OffRampOrchestrator {
	private flow: OffRampFlowState | null = null;
	private lifiPollTimer: ReturnType<typeof setInterval> | null = null;
	private lifiPollAttempts = 0;
	private _visibilityHandler: (() => void) | null = null;
	private listeners: StageChangeCallback[] = [];

	/**
	 * Initialize the orchestrator — restores persisted flow from Capacitor Preferences.
	 * Must be called once after construction.
	 */
	async init(): Promise<void> {
		await this.restoreFlow();
	}

	// -- Public API ---------------------------------------------------------

	/**
	 * Fetch a LI.FI bridge quote for the given asset and amount.
	 *
	 * Computes bridge fees, MoonPay fees, and estimated fiat received.
	 * Transitions: idle/failed -> quote_loading -> quote_ready.
	 */
	async createQuote(params: CreateQuoteParams): Promise<OffRampQuote> {
		requireEnabled();
		requireOnline();

		// Allow new quote if old flow is stale, terminal, or already quoted (re-quote with new amount)
		if (this.flow && !['idle', 'complete', 'failed', 'quote_ready'].includes(this.flow.stage)) {
			if (Date.now() - this.flow.updatedAt < STALE_THRESHOLD_MS) {
				throw new Error('wallet.buy_sell.off_ramp_in_progress');
			}
			debug.log(
				'Clearing stale flow (age=%d min)',
				Math.round((Date.now() - this.flow.updatedAt) / 60000)
			);
			this.stopAllPolling();
			this.flow = null;
		}

		Sentry.addBreadcrumb({
			category: 'off-ramp-orchestrator',
			message: 'Creating LI.FI quote',
			data: { asset: params.asset, amount: params.amount },
			level: 'info'
		});

		// Enter loading state with a minimal placeholder flow
		const placeholderQuote: OffRampQuote = {
			inputAmount: params.amount,
			inputAsset: params.asset,
			bridgeProvider: ASSET_CONFIG[params.asset].bridgeProvider,
			bridgeOutputAmount: '',
			bridgeFeePercent: '',
			bridgeFeeUsd: '',
			moonpayFeePercent: '',
			moonpayFeeUsd: '',
			estimatedFiatReceived: '',
			totalFeeUsd: '',
			totalFeePercent: '',
			estimatedTimeSeconds: 0,
			fromChainId: ASSET_CONFIG[params.asset].fromChain,
			fromTokenAddress: ASSET_CONFIG[params.asset].fromToken,
			fromAmountWei: '',
			fromDecimals: ASSET_CONFIG[params.asset].decimals
		};

		this.flow = {
			stage: 'quote_loading',
			externalOrderId: '',
			orderId: '',
			redirectUrl: '',
			quote: placeholderQuote,
			sourceWalletId: params.sourceWalletId,
			sourceAddress: params.sourceAddress,
			updatedAt: Date.now(),
			startedAt: Date.now()
		};
		this.notifyListeners();

		const config = ASSET_CONFIG[params.asset];
		const fromAmountWei = toAmountWei(params.amount, params.asset);

		let bridgeOutputAmount: string;
		let bridgeFeeUsd: string;
		let bridgeFeePercent: string;
		let estimatedTimeSeconds: number;

		if (config.bridgeProvider === 'symbiosis') {
			// Symbiosis path for rBTC (RSK → BSC)
			debug.log(
				'Fetching Symbiosis quote: %s %s -> USDT-BSC (fromAmount=%s)',
				params.amount,
				params.asset,
				fromAmountWei
			);

			const { data: symQuote, error: symError } = await tryCatch(
				symbiosisService.getQuote({
					tokenAmountIn: {
						address: config.fromToken,
						chainId: config.fromChain,
						symbol: params.asset === 'rbtc' ? 'RBTC' : params.asset.toUpperCase(),
						decimals: config.decimals,
						amount: fromAmountWei
					},
					tokenOut: {
						address: USDT_BSC_ADDR,
						chainId: CHAIN_ID_BSC,
						symbol: 'USDT',
						decimals: 18
					},
					from: params.sourceAddress,
					to: params.sourceAddress
				})
			);

			if (symError || !symQuote?.tokenAmountOut) {
				const err = symError || new Error('Symbiosis returned no route');
				Sentry.captureException(err, {
					tags: { component: 'off-ramp-orchestrator', action: 'createQuote-symbiosis' }
				});
				this.flow.stage = 'failed';
				this.flow.error = 'wallet.buy_sell.no_bridge_route';
				await this.persistFlow();
				this.notifyListeners();
				throw err;
			}

			bridgeOutputAmount = (
				Number(symQuote.tokenAmountOut.amount) /
				10 ** symQuote.tokenAmountOut.decimals
			).toFixed(6);

			// For Symbiosis, fee is embedded in the output amount
			const inputUsd = Number(params.amount) * (params.asset === 'rbtc' ? 59000 : 1); // rough estimate
			const outputUsd = Number(bridgeOutputAmount);
			bridgeFeeUsd = Math.max(0, inputUsd - outputUsd).toFixed(2);
			bridgeFeePercent =
				inputUsd > 0 ? (((inputUsd - outputUsd) / inputUsd) * 100).toFixed(2) : '0.00';
			estimatedTimeSeconds = symQuote.estimatedTime || ESTIMATED_TIME_SECONDS;

			// Store Symbiosis tx data for executeBridge
			if (symQuote.tx) {
				this.flow.symbiosisTx = {
					to: symQuote.tx.to,
					data: symQuote.tx.data,
					value: symQuote.tx.value,
					chainId: symQuote.tx.chainId,
					approveTo: symQuote.approveTo
				};
			}
		} else {
			// LI.FI path for Arbitrum assets
			debug.log(
				'Fetching LI.FI quote: %s %s -> USDT-BSC (fromAmount=%s)',
				params.amount,
				params.asset,
				fromAmountWei
			);

			const { data: route, error: quoteError } = await tryCatch(
				lifiService.getQuote({
					fromChain: config.fromChain,
					toChain: CHAIN_ID_BSC,
					fromToken: config.fromToken,
					toToken: USDT_BSC_ADDR,
					fromAmount: fromAmountWei,
					fromAddress: params.sourceAddress
				})
			);

			if (quoteError || !route) {
				const err = quoteError || new Error('No bridge route available');
				Sentry.captureException(err, {
					tags: { component: 'off-ramp-orchestrator', action: 'createQuote-lifi' }
				});
				this.flow.stage = 'failed';
				this.flow.error = 'wallet.buy_sell.no_bridge_route';
				await this.persistFlow();
				this.notifyListeners();
				throw err;
			}

			const estimate = route.estimate;
			bridgeOutputAmount = (Number(estimate.toAmount) / 1e18).toFixed(6);

			const fee = computeBridgeFee(
				estimate.fromAmount,
				estimate.toAmount,
				config.decimals,
				estimate.feeCosts
			);
			bridgeFeeUsd = fee.feeUsd;
			bridgeFeePercent = fee.feePercent;
			estimatedTimeSeconds = estimate.executionDuration || ESTIMATED_TIME_SECONDS;
		}

		// MoonPay fee: 1.65% of bridge output
		const moonpayFeeUsd = ((Number(bridgeOutputAmount) * MOONPAY_FEE_PERCENT) / 100).toFixed(2);

		// Estimated fiat = bridge output minus MoonPay fee
		const estimatedFiatReceived = (Number(bridgeOutputAmount) - Number(moonpayFeeUsd)).toFixed(2);

		const totalFeeUsd = (Number(bridgeFeeUsd) + Number(moonpayFeeUsd)).toFixed(2);
		const inputHuman = Number(params.amount);
		const totalFeePercent =
			inputHuman > 0 ? ((Number(totalFeeUsd) / inputHuman) * 100).toFixed(2) : '0.00';

		const quote: OffRampQuote = {
			inputAmount: params.amount,
			inputAsset: params.asset,
			bridgeProvider: config.bridgeProvider,
			bridgeOutputAmount,
			bridgeFeePercent,
			bridgeFeeUsd,
			moonpayFeePercent: String(MOONPAY_FEE_PERCENT),
			moonpayFeeUsd,
			estimatedFiatReceived,
			totalFeeUsd,
			totalFeePercent,
			estimatedTimeSeconds,
			fromChainId: config.fromChain,
			fromTokenAddress: config.fromToken,
			fromAmountWei,
			fromDecimals: config.decimals
		};

		this.flow.stage = 'quote_ready';
		this.flow.quote = quote;
		await this.persistFlow();
		this.notifyListeners();

		debug.log(
			'Quote ready: output=%s USDT, bridgeFee=$%s, moonpayFee=$%s, fiat=%s',
			bridgeOutputAmount,
			bridgeFeeUsd,
			moonpayFeeUsd,
			estimatedFiatReceived
		);

		return quote;
	}

	/**
	 * Create a MoonPay off-ramp order via Changelly.
	 *
	 * Stores the redirect URL, order ID, and external order ID in flow state.
	 * Transitions: quote_ready -> opening_moonpay.
	 *
	 * @returns MoonPay redirect URL for the user to complete KYC/checkout.
	 */
	async openMoonPay(country: string): Promise<string> {
		requireEnabled();
		requireOnline();

		if (!this.flow || this.flow.stage !== 'quote_ready') {
			throw new Error('No quote available. Create a quote first.');
		}

		Sentry.addBreadcrumb({
			category: 'off-ramp-orchestrator',
			message: 'Creating MoonPay off-ramp order',
			data: {
				outputAmount: this.flow.quote.bridgeOutputAmount,
				sourceAddress: this.flow.sourceAddress
			},
			level: 'info'
		});

		this.flow.stage = 'opening_moonpay';
		await this.persistFlow();
		this.notifyListeners();

		const { data: order, error: orderError } = await tryCatch(
			changellyFiatService.createOffRampOrder({
				cryptoCurrency: 'USDTBSC',
				cryptoAmount: this.flow.quote.bridgeOutputAmount,
				fiatCurrency: 'USD',
				providerCode: 'moonpay',
				country,
				fiatAddress: this.flow.sourceAddress
			})
		);

		if (orderError || !order) {
			const err = orderError || new Error('MoonPay order creation returned no data');
			Sentry.captureException(err, {
				tags: { component: 'off-ramp-orchestrator', action: 'openMoonPay' }
			});
			this.flow.stage = 'failed';
			this.flow.error = 'wallet.buy_sell.transaction_failed';
			await this.persistFlow();
			this.notifyListeners();
			throw err;
		}

		this.flow.externalOrderId = order.externalOrderId;
		this.flow.orderId = order.orderId;
		this.flow.redirectUrl = order.redirectUrl;
		this.flow.updatedAt = Date.now();
		await this.persistFlow();
		this.notifyListeners();

		debug.log('MoonPay order created: orderId=%s', order.orderId);

		return order.redirectUrl;
	}

	/**
	 * Validate and store the deposit address the user pasted from MoonPay.
	 *
	 * Uses ethers.getAddress() for EIP-55 checksum validation.
	 * Throws on invalid address.
	 */
	async setDepositAddress(address: string): Promise<void> {
		if (!this.flow) {
			throw new Error('No active flow');
		}

		// Dynamic import to keep ethers out of the initial bundle
		const { data: ethersLib, error: importError } = await tryCatch(import('ethers'));
		if (importError || !ethersLib) {
			const err = importError || new Error('Failed to load address validation library');
			Sentry.captureException(err, {
				tags: { component: 'off-ramp-orchestrator', action: 'setDepositAddress' }
			});
			throw err;
		}

		// Lowercase first to avoid ethers throwing on bad checksum input,
		// then checksum via getAddress (throws on truly invalid).
		const checksummed = ethersLib.ethers.getAddress(address.toLowerCase());

		this.flow.depositAddress = checksummed;
		this.flow.updatedAt = Date.now();
		await this.persistFlow();
		this.notifyListeners();

		debug.log('Deposit address set: %s', checksummed);
	}

	/**
	 * Execute the bridge: approve ERC-20 (if needed) + send swap tx.
	 * Uses LI.FI for Arbitrum assets, Symbiosis for RSK (rBTC).
	 *
	 * Transitions: awaiting_deposit_address -> bridging -> complete | failed.
	 */
	async executeBridge(): Promise<void> {
		requireEnabled();
		requireOnline();

		if (!this.flow || !this.flow.quote) {
			throw new Error('No active flow with quote');
		}
		if (!this.flow.depositAddress) {
			throw new Error('No deposit address set. Call setDepositAddress first.');
		}

		const quote = this.flow.quote;
		const isSymbiosis = quote.bridgeProvider === 'symbiosis';

		Sentry.addBreadcrumb({
			category: 'off-ramp-orchestrator',
			message: `Executing ${isSymbiosis ? 'Symbiosis' : 'LI.FI'} bridge`,
			data: { asset: quote.inputAsset, fromChain: quote.fromChainId, amount: quote.fromAmountWei },
			level: 'info'
		});

		this.flow.stage = 'bridging';
		await this.persistFlow();
		this.notifyListeners();

		let txTo: string;
		let txData: string;
		let txValue: bigint;
		let txChain: 'arbitrum' | 'rsk' | 'bsc';

		if (isSymbiosis) {
			// -- Symbiosis path (rBTC on RSK) --------------------------------
			const symTx = this.flow.symbiosisTx;
			if (!symTx) {
				const err = new Error('No Symbiosis transaction data. Call createQuote first.');
				await this.failFlow(err, 'wallet.buy_sell.bridge_tx_invalid');
				throw err;
			}

			txTo = symTx.to;
			txData = symTx.data;
			try {
				txValue = BigInt(symTx.value);
			} catch {
				const err = new Error('Invalid Symbiosis transaction value');
				await this.failFlow(err, 'wallet.buy_sell.bridge_tx_invalid');
				throw err;
			}
			txChain = 'rsk';

			debug.log('Symbiosis tx: to=%s value=%s dataLen=%d', txTo, txValue, txData.length);
		} else {
			// -- LI.FI path (Arbitrum assets) ---------------------------------
			debug.log('Fetching LI.FI step transaction');
			const { data: txReq, error: txError } = await tryCatch(
				lifiService.getStepTransaction({
					fromChain: quote.fromChainId,
					toChain: CHAIN_ID_BSC,
					fromToken: quote.fromTokenAddress,
					toToken: USDT_BSC_ADDR,
					fromAmount: quote.fromAmountWei,
					fromAddress: this.flow.sourceAddress
				})
			);

			if (txError || !txReq) {
				const err = txError || new Error('LI.FI returned no transaction request');
				await this.failFlow(err, 'wallet.buy_sell.no_bridge_route');
				throw err;
			}

			debug.log(
				'LI.FI step tx: to=%s value=%s dataLen=%d',
				txReq.to,
				txReq.value,
				txReq.data.length
			);

			// ERC-20 approval (skip for native token)
			if (quote.fromTokenAddress !== NATIVE_TOKEN) {
				debug.log('Approving ERC-20 for LI.FI router: %s', txReq.to);
				const approveData = encodeERC20Approve(txReq.to, (1n << 256n) - 1n);

				const { data: approveResult, error: approveException } = await tryCatch(
					sendEvmTransaction({
						to: quote.fromTokenAddress,
						data: approveData,
						value: 0n,
						chain: 'arbitrum',
						sourceConnectedWalletId: this.flow.sourceWalletId || null
					})
				);

				if (approveException) {
					await this.failFlow(approveException, 'wallet.buy_sell.bridge_approval_failed');
					throw approveException;
				}
				if (approveResult?.error) {
					await this.failFlow(approveResult.error, 'wallet.buy_sell.bridge_approval_failed');
					throw approveResult.error;
				}
				if (!approveResult?.data) {
					const err = new Error('ERC-20 approval returned no transaction hash');
					await this.failFlow(err, 'wallet.buy_sell.bridge_approval_failed');
					throw err;
				}
				debug.log('ERC-20 approval tx: %s', approveResult.data);
			}

			txTo = txReq.to;
			txData = txReq.data;
			try {
				txValue = BigInt(txReq.value);
			} catch {
				const err = new Error('Invalid bridge transaction value from LI.FI');
				await this.failFlow(err, 'wallet.buy_sell.bridge_tx_invalid');
				throw err;
			}
			txChain = 'arbitrum';
		}

		// -- Send bridge swap transaction -----------------------------------
		debug.log('Sending bridge swap tx to: %s (chain=%s)', txTo, txChain);
		const { data: swapResult, error: swapException } = await tryCatch(
			sendEvmTransaction({
				to: txTo,
				data: txData,
				value: txValue,
				chain: txChain,
				sourceConnectedWalletId: this.flow.sourceWalletId || null
			})
		);

		if (swapException) {
			await this.failFlow(swapException, 'wallet.buy_sell.bridge_tx_failed');
			throw swapException;
		}
		if (swapResult?.error) {
			await this.failFlow(swapResult.error, 'wallet.buy_sell.bridge_tx_failed');
			throw swapResult.error;
		}
		if (!swapResult?.data) {
			const err = new Error('Bridge transaction returned no hash');
			await this.failFlow(err, 'wallet.buy_sell.bridge_tx_failed');
			throw err;
		}

		this.flow.bridgeTxHash = swapResult.data;
		await this.persistFlow();
		this.notifyListeners();

		debug.log('Bridge tx submitted: %s', swapResult.data);

		// -- Start monitoring -----------------------------------------------
		this.startBridgeMonitoring();
	}

	/**
	 * Track when the user returns to the app after the MoonPay checkout redirect.
	 *
	 * Uses the visibilitychange event - works even when window.open returns
	 * null (which happens with noopener,noreferrer cross-origin popups in Chrome).
	 *
	 * When the document becomes visible again and the stage is opening_moonpay,
	 * transitions to awaiting_deposit_address so the UI can prompt for the
	 * deposit address.
	 */
	trackCheckoutReturn(): void {
		debug.log('Setting up visibilitychange listener for MoonPay return');
		this._visibilityHandler = () => {
			if (document.visibilityState === 'visible') {
				debug.log('Document became visible - user returned from MoonPay checkout');
				if (this.flow && this.flow.stage === 'opening_moonpay') {
					this.flow.stage = 'awaiting_deposit_address';
					this.flow.updatedAt = Date.now();
					this.persistFlow()
						.then(() => this.notifyListeners())
						.catch((e) => debug.warn('persistFlow failed after checkout return:', e));
				}
			}
		};
		document.addEventListener('visibilitychange', this._visibilityHandler);
	}

	/**
	 * Reset to the quote-ready stage so the user can create a new MoonPay order.
	 *
	 * Preserves the quote and source wallet info; clears MoonPay-specific
	 * fields (order IDs, deposit address, bridge tx hash, errors).
	 */
	async startOver(): Promise<void> {
		if (!this.flow) return;

		debug.log('Starting over - resetting to quote_ready');
		this.stopAllPolling();

		this.flow.stage = 'quote_ready';
		this.flow.externalOrderId = '';
		this.flow.orderId = '';
		this.flow.redirectUrl = '';
		this.flow.depositAddress = undefined;
		this.flow.bridgeTxHash = undefined;
		this.flow.lifiStatus = undefined;
		this.flow.error = undefined;
		this.flow.updatedAt = Date.now();

		await this.persistFlow();
		this.notifyListeners();
	}

	/** Subscribe to stage changes. Returns an unsubscribe function. */
	onStageChange(callback: StageChangeCallback): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== callback);
		};
	}

	/** Get the current flow state (or null if no active flow). */
	getActiveFlow(): OffRampFlowState | null {
		return this.flow;
	}

	/** Cancel the current flow and clear persisted state. */
	async cancel(): Promise<void> {
		this.stopAllPolling();
		this.flow = null;
		await this.clearPersistedFlow();
		this.notifyListeners();
	}

	/** Cleanup - call on component destroy. */
	destroy(): void {
		this.stopAllPolling();
		this.listeners = [];
	}

	// -- Internal: Bridge Monitoring ----------------------------------------

	private startBridgeMonitoring(): void {
		this.stopBridgeMonitoring();
		this.lifiPollAttempts = 0;
		this.lifiPollTimer = setInterval(
			() => {
				this.pollLifiStatus().catch((e) => debug.warn('LI.FI poll failed:', e));
			},
			LIFI_POLL_INTERVAL_MS
		);
		// First poll immediately
		this.pollLifiStatus().catch((e) => debug.warn('LI.FI initial poll failed:', e));
	}

	private stopBridgeMonitoring(): void {
		if (this.lifiPollTimer) {
			clearInterval(this.lifiPollTimer);
			this.lifiPollTimer = null;
		}
		this.lifiPollAttempts = 0;
	}

	private async pollLifiStatus(): Promise<void> {
		if (!this.flow || !this.flow.bridgeTxHash) {
			debug.warn('pollBridgeStatus: no active flow or tx hash');
			return;
		}

		const isSymbiosis = this.flow.quote?.bridgeProvider === 'symbiosis';

		this.lifiPollAttempts++;
		debug.log(
			'pollBridgeStatus attempt %d/%d for tx %s (%s)',
			this.lifiPollAttempts,
			LIFI_POLL_MAX_ATTEMPTS,
			this.flow.bridgeTxHash.slice(0, 10),
			isSymbiosis ? 'symbiosis' : 'lifi'
		);

		if (this.lifiPollAttempts > LIFI_POLL_MAX_ATTEMPTS) {
			debug.warn('Bridge polling timeout after %d attempts', this.lifiPollAttempts);
			this.stopBridgeMonitoring();
			this.flow.error = 'wallet.buy_sell.bridge_timeout_error';
			this.flow.lifiStatus = 'FAILED';
			this.updateStage('failed');
			await this.persistFlow();
			return;
		}

		if (isSymbiosis) {
			// Symbiosis status check
			const { data: symStatus, error: symError } = await tryCatch(
				symbiosisService.getSwapStatus(this.flow.bridgeTxHash, this.flow.quote.fromChainId)
			);

			if (symError || !symStatus) {
				debug.warn('Symbiosis status poll failed: %s', symError?.message);
				return;
			}

			const statusCode = symStatus.status?.code;
			this.flow.updatedAt = Date.now();
			debug.log('Symbiosis status: code=%d text=%s', statusCode, symStatus.status?.text ?? 'n/a');

			if (statusCode === 0) {
				// Symbiosis status code 0 = SUCCESS (relayer delivered)
				debug.log('Symbiosis bridge complete');
				this.stopBridgeMonitoring();
				this.updateStage('complete');
			} else if (statusCode < 0) {
				// Negative = terminal failure
				debug.warn('Symbiosis bridge failed (code=%d)', statusCode);
				this.stopBridgeMonitoring();
				this.flow.error = 'wallet.buy_sell.bridge_onchain_failed';
				this.updateStage('failed');
			}
			// Positive = still pending, keep polling
		} else {
			// LI.FI status check
			const { data: status, error: statusError } = await tryCatch(
				lifiService.getStatus(this.flow.bridgeTxHash)
			);

			if (statusError || !status) {
				debug.warn('LI.FI status poll failed: %s', statusError?.message);
				return;
			}

			this.flow.lifiStatus = status.status;
			this.flow.updatedAt = Date.now();
			debug.log('LI.FI status: %s (substatus=%s)', status.status, status.substatus ?? 'n/a');

			if (status.status === 'DONE') {
				debug.log('Bridge complete');
				this.stopBridgeMonitoring();
				this.updateStage('complete');
			} else if (status.status === 'FAILED') {
				debug.warn('Bridge failed (substatus=%s)', status.substatus ?? 'n/a');
				this.stopBridgeMonitoring();
				this.flow.error = 'wallet.buy_sell.bridge_onchain_failed';
				this.updateStage('failed');
			}
		}
		// 'PENDING' / 'NOT_FOUND' -> keep polling

		await this.persistFlow();
	}

	// -- Internal: Error Handling -------------------------------------------

	/** Transition to 'failed', persist, notify, and report to Sentry. */
	private async failFlow(err: Error, i18nKey?: string): Promise<void> {
		Sentry.captureException(err, {
			tags: { component: 'off-ramp-orchestrator', action: 'executeBridge' }
		});
		if (this.flow) {
			this.flow.stage = 'failed';
			this.flow.error = i18nKey ?? 'wallet.buy_sell.transaction_failed';
			this.flow.updatedAt = Date.now();
			await this.persistFlow();
			this.notifyListeners();
		}
	}

	// -- Internal: Stage Management -----------------------------------------

	private updateStage(stage: OffRampStage): void {
		if (!this.flow) return;
		this.flow.stage = stage;
		this.flow.updatedAt = Date.now();
		this.notifyListeners();
	}

	private notifyListeners(): void {
		if (!this.flow) return;
		const snapshot = { ...this.flow };
		for (const listener of this.listeners) {
			try {
				listener(snapshot);
			} catch (err) {
				debug.error('OffRampOrchestrator listener error:', err);
			}
		}
	}

	// -- Internal: Persistence ----------------------------------------------

	private async persistFlow(): Promise<void> {
		if (!this.flow) return;
		try {
			await Preferences.set({
				key: StorageKeys.OFF_RAMP_FLOW,
				value: JSON.stringify(this.flow)
			});
		} catch (e) {
			debug.warn('Preferences set failed:', e);
		}
	}

	private async restoreFlow(): Promise<void> {
		try {
			const { value: stored } = await Preferences.get({ key: StorageKeys.OFF_RAMP_FLOW });
			if (!stored) return;
			const raw = JSON.parse(stored);
			if (
				!raw ||
				typeof raw !== 'object' ||
				typeof raw.stage !== 'string' ||
				typeof raw.updatedAt !== 'number' ||
				typeof raw.sourceAddress !== 'string' ||
				typeof raw.sourceWalletId !== 'string' ||
				!raw.quote ||
				typeof raw.quote !== 'object'
			) {
				debug.warn('Invalid persisted flow data, clearing');
				await Preferences.remove({ key: StorageKeys.OFF_RAMP_FLOW });
				return;
			}
			const parsed = raw as OffRampFlowState;

			// Don't restore terminal states
			if (['complete', 'failed', 'idle'].includes(parsed.stage)) {
				await Preferences.remove({ key: StorageKeys.OFF_RAMP_FLOW });
				return;
			}

			// Auto-expire stale flows (>30 minutes old)
			if (Date.now() - parsed.updatedAt > STALE_THRESHOLD_MS) {
				debug.log(
					'Flow stale (age=%d min), expiring',
					Math.round((Date.now() - parsed.updatedAt) / 60000)
				);
				await Preferences.remove({ key: StorageKeys.OFF_RAMP_FLOW });
				return;
			}

			this.flow = parsed;
			debug.log('Restored persisted flow: stage=%s', parsed.stage);

			// Resume monitoring if bridging
			if (parsed.stage === 'bridging' && parsed.bridgeTxHash) {
				this.startBridgeMonitoring();
			}
		} catch (e) {
			debug.warn('Preferences get failed:', e);
			try {
				await Preferences.remove({ key: StorageKeys.OFF_RAMP_FLOW });
			} catch (removeErr) {
				debug.warn('Preferences remove also failed:', removeErr);
			}
		}
	}

	private async clearPersistedFlow(): Promise<void> {
		try {
			await Preferences.remove({ key: StorageKeys.OFF_RAMP_FLOW });
		} catch (e) {
			debug.warn('Preferences remove failed:', e);
		}
	}

	private stopCheckoutListener(): void {
		if (this._visibilityHandler) {
			document.removeEventListener('visibilitychange', this._visibilityHandler);
			this._visibilityHandler = null;
		}
	}

	private stopAllPolling(): void {
		this.stopBridgeMonitoring();
		this.stopCheckoutListener();
	}
}
