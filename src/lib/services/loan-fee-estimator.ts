/**
 * Loan Fee Estimator Service
 *
 * Provides real-time fee estimation for the RBTC-backed USDT0 loan flow.
 * Fetches live quotes from MoC (on-chain), OpenOcean (REST API, with
 * LIFI/Symbiosis fallbacks), and LayerZero OFT bridge (on-chain) to
 * calculate total costs and expected Arbitrum receipt.
 *
 * Called by the LoanFlowDrawer UI component.
 *
 * Flow:
 *   USD amount → RBTC price conversion → MoC DOC mint → DOC→USDT0 swap
 *   → LayerZero bridge quote → gas estimate → aggregated FeeBreakdown
 */

import type { ethers } from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { openoceanService } from '$lib/services/openocean.service';
import { lifiService } from '$lib/services/lifi.service';
import { symbiosisService } from '$lib/services/symbiosis.service';
import { loanMonitoringService } from '$lib/services/loan-monitoring.service';
import cryptoPriceService from '$lib/api/services/crypto-price.service';

const debug = createDebug('loan-fee-estimator');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** DOC token address on RSK mainnet (18 decimals). */
const DOC_ADDRESS: string = '0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db';

/** USDT0 token address on RSK mainnet (6 decimals). */
const USDT0_RSK_ADDRESS: string = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';

/** RSK chain ID. */
const RSK_CHAIN_ID = 30;

/** LayerZero EID for RSK. */
const _LZ_EID_RSK = 30333;

/** LayerZero EID for Arbitrum. */
const LZ_EID_ARBITRUM = 30110;

/** DOC token decimals. */
const DOC_DECIMALS = 18;

/** USDT0 token decimals. */
const USDT0_DECIMALS = 6;

/** Quote expiry time in seconds. */
const QUOTE_EXPIRY_SECONDS = 30;

/** USDT0 OFT bridge contract address on RSK. */
const OFT_RSK_ADDRESS: string = '0x1a594d5d5d1c426281C1064B07f23F57B2716B61';

/** Default bridge fee in USD (used when on-chain LayerZero quote fails). */
const DEFAULT_BRIDGE_FEE_USD = 0.5;

/** Default gas cost in USD (used when provider gas estimation fails). */
const DEFAULT_GAS_COST_USD = 3.5;

/** MoC DOC mint fee rate: 0.20% (per https://wiki.moneyonchain.com/en/faq). */
const MOC_FEE_RATE = 0.002;

/** Gas per transaction type on RSK (standard EVM estimates verified on-chain). */
const GAS_PER_TX = {
	mint: 152_000, // value transfer to MoC contract (~150k verified via estimateGas)
	approve: 45_000, // ERC20 approve (standard)
	swap: 250_000, // DEX aggregator interaction (~250k typical)
	bridge: 250_000 // OFT.send cross-chain (~250k typical)
} as const;

/** Total gas for full loan flow (mint + approve + swap + approve + bridge). */
const TOTAL_FLOW_GAS =
	GAS_PER_TX.mint + GAS_PER_TX.approve + GAS_PER_TX.swap + GAS_PER_TX.approve + GAS_PER_TX.bridge;
// = 742,000 gas

/** Promise timeout for availability checks (ms). */
const AVAILABILITY_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single fee line item for the breakdown display. */
export interface FeeItem {
	/** Human-readable label (e.g., "DOC Mint Fee"). */
	label: string;
	/** Formatted amount string (e.g., "$2.50" or "0.00015000 RBTC"). */
	amount: string;
	/** Whether this item is still being fetched. */
	loading?: boolean;
}

/** Aggregated loan fee estimate returned to the UI. */
export interface LoanFeeEstimate {
	/** Breakdown of individual fees for display. */
	fees: FeeItem[];
	/** Total RBTC needed (principal + gas + bridge fee) in RBTC units. */
	totalRbtcNeeded: string;
	/** Estimated USDT0 amount received on Arbitrum in USDT0 units. */
	estimatedArbReceive: string;
	/** DOC amount that will be minted in DOC units. */
	docAmount: string;
	/** USDT0 amount on RSK before bridging in USDT0 units. */
	usdt0RskAmount: string;
	/** MoC global coverage ratio at quote time. */
	coverageRatio: number | null;
	/** Route provider used for the DOC→USDT0 swap quote. */
	routeProvider: string;
	/** Seconds until this quote should be considered stale. */
	quoteExpiresIn: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format a numeric amount to a USD string with $ prefix.
 */
function formatUsd(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

/**
 * Fetch RBTC price from Coinbase (via cryptoPriceService).
 * Always returns a fresh price (cache is per-instance, 5 min TTL).
 */
async function getRbtcPrice(): Promise<number> {
	const { data: price, error } = await tryCatch(cryptoPriceService.getCurrentPrice('RBTC'));

	if (error || !price || price <= 0) {
		debug.error('Failed to fetch RBTC price: %s', error?.message ?? 'invalid price');
		loanMonitoringService.healthCheck('crypto-price', false, undefined, error?.message);
		throw new Error(
			`Unable to fetch RBTC price: ${error?.message ?? 'zero or negative price returned'}`
		);
	}

	loanMonitoringService.healthCheck('crypto-price', true);
	debug.log('RBTC price: $%d', price);
	return price;
}

// ---------------------------------------------------------------------------
// Step 2: MoC DOC Mint Estimate
// ---------------------------------------------------------------------------

interface MocEstimateResult {
	docAmount: string;
	coverageRatio: number | null;
}

async function getMocEstimate(
	signer: ethers.Wallet,
	rbtcWei: string,
	rbtcPrice: number,
	fees: FeeItem[]
): Promise<MocEstimateResult> {
	const { ethers } = await import('ethers');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mocService: any = null;

	try {
		const mod = await import('@bittasker/wallet-core');
		if (mod.MoCMintingService) {
			mocService = new mod.MoCMintingService();
		}
	} catch {
		// Dynamic import failed — fall through to use fixed-rate estimate
	}

	fees.push({ label: 'DOC Mint Fee', amount: '...', loading: true });
	const stepStart = Date.now();

	if (mocService) {
		try {
			mocService.getMoCContract(signer);
		} catch {
			// getMoCContract failed — fall through to use fixed-rate estimate
			mocService = null;
		}
	}

	if (mocService) {
		const { data: mocResult, error: mocError } = await tryCatch(
			mocService.estimateDocMint(rbtcWei)
		);

		if (mocError || !mocResult) {
			// MoC on-chain estimate failed — use documented 0.20% rate as fallback
			const rbtcValueUsd = parseFloat(ethers.formatEther(rbtcWei)) * rbtcPrice;
			const fallbackFeeUsd = rbtcValueUsd * MOC_FEE_RATE;
			fees[fees.length - 1] = {
				label: 'DOC Mint Fee',
				amount: formatUsd(fallbackFeeUsd),
				loading: false
			};
			return {
				docAmount: rbtcWei,
				coverageRatio: null,
				feeUsd: fallbackFeeUsd,
				rate: MOC_FEE_RATE
			};
		}

		// Real fee from MoC contract
		const feeRbtc = parseFloat(ethers.formatEther(mocResult.fee ?? mocResult));
		const feeUsd = feeRbtc * rbtcPrice;
		fees[fees.length - 1] = {
			label: 'DOC Mint Fee',
			amount: formatUsd(feeUsd),
			loading: false
		};
		const elapsed = Date.now() - stepStart;
		if (stepTimings) stepTimings.push({ step: 'moc', ms: elapsed });

		return {
			docAmount: mocResult.docAmount ?? rbtcWei,
			coverageRatio: mocResult.coverageRatio ?? null,
			feeUsd,
			rate: MOC_FEE_RATE
		};
	}

	// mocService is null — use documented 0.20% rate as fallback
	const rbtcValueUsd = parseFloat(ethers.formatEther(rbtcWei)) * rbtcPrice;
	const fallbackFeeUsd = rbtcValueUsd * MOC_FEE_RATE;
	fees[fees.length - 1] = {
		label: 'DOC Mint Fee',
		amount: formatUsd(fallbackFeeUsd),
		loading: false
	};
	return { docAmount: rbtcWei, coverageRatio: null, feeUsd: fallbackFeeUsd, rate: MOC_FEE_RATE };
}

// ---------------------------------------------------------------------------
// Step 3: DOC → USDT0 Swap Quote (OpenOcean → LIFI → Symbiosis)
// ---------------------------------------------------------------------------

interface SwapQuoteResult {
	usdt0AmountRaw: string;
	usdt0Amount: string;
	provider: string;
}

async function getSwapQuote(
	signer: ethers.Wallet,
	docAmountWei: string,
	fees: FeeItem[]
): Promise<SwapQuoteResult> {
	const { ethers } = await import('ethers');
	fees.push({ label: 'Swap Impact/Fee', amount: '...', loading: true });
	const userAddress = await signer.getAddress();
	const docFormatted = ethers.formatEther(docAmountWei);
	const stepStart = Date.now();

	// --- Primary: OpenOcean ---
	const ooResult = await trySwapOpenOcean(docFormatted, stepStart);
	if (ooResult) return finalizeSwapFee(fees, ooResult, docFormatted, userAddress);

	// --- Fallback 1: LIFI ---
	const lifiResult = await trySwapLifi(docFormatted, userAddress, stepStart);
	if (lifiResult) return finalizeSwapFee(fees, lifiResult, docFormatted, userAddress);

	// --- Fallback 2: Symbiosis ---
	const symbiosisResult = await trySwapSymbiosis(docFormatted, userAddress, stepStart);
	if (symbiosisResult) return finalizeSwapFee(fees, symbiosisResult, docFormatted, userAddress);

	// All providers failed — return fallback with zero fee and the original amount
	const idx = fees.findIndex((f) => f.label === 'Swap Impact/Fee' && f.loading);
	if (idx >= 0) fees[idx] = { label: 'Swap Impact/Fee', amount: formatUsd(0) };
	debug.warn(
		'All swap providers (OpenOcean, LIFI, Symbiosis) failed to return a quote — using $0.00 fallback'
	);
	return {
		usdt0AmountRaw: docAmountWei,
		usdt0Amount: docFormatted,
		provider: 'fallback'
	};
}

async function trySwapOpenOcean(
	docFormatted: string,
	stepStart: number
): Promise<SwapQuoteResult | null> {
	const { ethers } = await import('ethers');
	const { data: quoteData, error } = await tryCatch(
		openoceanService.getQuote({ docAmount: docFormatted })
	);

	if (error || !quoteData) {
		debug.warn('OpenOcean swap quote failed: %s', error?.message ?? 'no data');
		return null;
	}

	loanMonitoringService.healthCheck('openocean', true, Date.now() - stepStart);
	debug.log(
		'OpenOcean swap quote: in=%s out=%s impact=%s%%',
		quoteData.inAmount,
		quoteData.outAmount,
		quoteData.priceImpact
	);

	return {
		usdt0AmountRaw: quoteData.outAmount,
		usdt0Amount: ethers.formatUnits(quoteData.outAmount, USDT0_DECIMALS),
		provider: 'openocean'
	};
}

async function trySwapLifi(
	docFormatted: string,
	userAddress: string,
	stepStart: number
): Promise<SwapQuoteResult | null> {
	const { ethers } = await import('ethers');
	const { data: route, error } = await tryCatch(
		lifiService.getQuote({
			fromChain: RSK_CHAIN_ID,
			toChain: RSK_CHAIN_ID,
			fromToken: DOC_ADDRESS,
			toToken: USDT0_RSK_ADDRESS,
			fromAmount: docFormatted,
			fromAddress: userAddress
		})
	);

	if (error || !route) {
		debug.warn('LIFI swap quote failed: %s', error?.message ?? 'no data');
		return null;
	}

	loanMonitoringService.healthCheck('lifi', true, Date.now() - stepStart);
	debug.log('LIFI swap quote: from=%s to=%s', route.estimate.fromAmount, route.estimate.toAmount);

	return {
		usdt0AmountRaw: route.estimate.toAmount,
		usdt0Amount: ethers.formatUnits(route.estimate.toAmount, USDT0_DECIMALS),
		provider: 'lifi'
	};
}

async function trySwapSymbiosis(
	docFormatted: string,
	userAddress: string,
	stepStart: number
): Promise<SwapQuoteResult | null> {
	const { ethers } = await import('ethers');
	const { data: quote, error } = await tryCatch(
		symbiosisService.getQuote({
			tokenAmountIn: {
				address: DOC_ADDRESS,
				chainId: RSK_CHAIN_ID,
				symbol: 'DOC',
				decimals: DOC_DECIMALS,
				amount: docFormatted
			},
			tokenOut: {
				address: USDT0_RSK_ADDRESS,
				chainId: RSK_CHAIN_ID,
				symbol: 'USDT0',
				decimals: USDT0_DECIMALS
			},
			from: userAddress,
			to: userAddress,
			slippage: 50
		})
	);

	if (error || !quote || !quote.tokenAmountOut?.amount) {
		debug.warn('Symbiosis swap quote failed: %s', error?.message ?? 'no data');
		return null;
	}

	loanMonitoringService.healthCheck('symbiosis', true, Date.now() - stepStart);
	debug.log('Symbiosis swap quote: out=%s', quote.tokenAmountOut.amount);

	return {
		usdt0AmountRaw: quote.tokenAmountOut.amount,
		usdt0Amount: ethers.formatUnits(quote.tokenAmountOut.amount, USDT0_DECIMALS),
		provider: 'symbiosis'
	};
}

function finalizeSwapFee(
	fees: FeeItem[],
	result: SwapQuoteResult,
	docFormatted: string,
	_userAddress: string
): SwapQuoteResult {
	// Compute swap fee in USD: difference between DOC in and USDT0 out (both ~$1)
	const docInNum = parseFloat(docFormatted);
	const usdt0OutNum = parseFloat(result.usdt0Amount);
	const swapFeeUsd = docInNum > 0 ? Math.max(0, docInNum - usdt0OutNum) : 0;

	const idx = fees.findIndex((f) => f.label === 'Swap Impact/Fee' && f.loading);
	const swapFeeLabel = formatUsd(swapFeeUsd);

	if (idx >= 0) {
		fees[idx] = { label: 'Swap Impact/Fee', amount: swapFeeLabel };
	} else {
		fees.push({ label: 'Swap Impact/Fee', amount: swapFeeLabel });
	}

	return result;
}

// ---------------------------------------------------------------------------
// Step 4: LayerZero Bridge Quote
// ---------------------------------------------------------------------------

interface BridgeQuoteResult {
	bridgeFeeRbtc: number;
}

async function getBridgeQuote(
	signer: ethers.Wallet,
	usdt0AmountRaw: string,
	rbtcPrice: number,
	fees: FeeItem[]
): Promise<BridgeQuoteResult> {
	fees.push({ label: 'Bridge Fee', amount: '...', loading: true });
	const stepStart = Date.now();

	const { ethers } = await import('ethers');

	try {
		// LayerZero OFT quoteSend ABI (minimal)
		const oftAbi = [
			'function quoteSend((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) _sendParam, bytes _extraOptions, bool _payInLzToken, bytes _composeMsg, bytes _oftCmd) external view returns ((uint256 nativeFee, uint256 lzTokenFee) msgFee, (uint256 minAmountLD, uint256 maxAmountLD) oftLimit, (uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt, (uint256 feeAmountLD, string description)[] oftFeeDetails)'
		];

		const oftContract = new ethers.Contract(OFT_RSK_ADDRESS, oftAbi, signer.provider);
		const userAddr = await signer.getAddress();
		const toBytes32 = ethers.zeroPadValue(userAddr, 32);

		const sendParam = {
			dstEid: LZ_EID_ARBITRUM,
			to: toBytes32,
			amountLD: usdt0AmountRaw,
			minAmountLD: usdt0AmountRaw,
			extraOptions: '0x',
			composeMsg: '0x',
			oftCmd: '0x'
		};

		const [msgFee] = await oftContract.quoteSend(
			sendParam,
			'0x', // _extraOptions
			false, // _payInLzToken
			'0x', // _composeMsg
			'0x' // _oftCmd
		);

		loanMonitoringService.healthCheck('layerzero-bridge', true, Date.now() - stepStart);

		const bridgeFeeRbtc = parseFloat(ethers.formatEther(msgFee.nativeFee));
		const bridgeFeeUsd = bridgeFeeRbtc * rbtcPrice;

		const idx = fees.findIndex((f) => f.label === 'Bridge Fee' && f.loading);
		if (idx >= 0) {
			fees[idx] = { label: 'Bridge Fee', amount: formatUsd(bridgeFeeUsd) };
		} else {
			fees.push({ label: 'Bridge Fee', amount: formatUsd(bridgeFeeUsd) });
		}

		return { bridgeFeeRbtc };
	} catch (err) {
		debug.warn(
			'LayerZero bridge quote failed, using default $%.2f: %s',
			DEFAULT_BRIDGE_FEE_USD,
			(err as Error)?.message ?? 'unknown'
		);
	}

	// Fallback: all on-chain methods failed
	const defaultFeeRbtc = DEFAULT_BRIDGE_FEE_USD / rbtcPrice;
	const idx = fees.findIndex((f) => f.label === 'Bridge Fee' && f.loading);
	if (idx >= 0) fees[idx] = { label: 'Bridge Fee', amount: formatUsd(DEFAULT_BRIDGE_FEE_USD) };
	loanMonitoringService.healthCheck(
		'layerzero-bridge',
		false,
		Date.now() - stepStart,
		'all methods failed'
	);
	return { bridgeFeeRbtc: defaultFeeRbtc };
}

// ---------------------------------------------------------------------------
// Step 5: Gas Estimate
// ---------------------------------------------------------------------------

interface GasEstimateResult {
	gasCostRbtc: number;
}

async function getGasEstimate(
	provider: ethers.JsonRpcProvider,
	rbtcPrice: number,
	fees: FeeItem[]
): Promise<GasEstimateResult> {
	fees.push({ label: 'Gas Fee', amount: '...', loading: true });

	const { ethers } = await import('ethers');

	// Query on-chain for the live gas price; use documented per-tx gas values for the total
	const { data: feeData, error: feeDataError } = await tryCatch(provider.getFeeData());

	if (feeDataError || !feeData) {
		debug.warn(
			'Gas price fetch failed, using default $%.2f: %s',
			DEFAULT_GAS_COST_USD,
			feeDataError?.message ?? 'no data'
		);
		const defaultGasRbtc = DEFAULT_GAS_COST_USD / rbtcPrice;
		const idx = fees.findIndex((f) => f.label === 'Gas Fee' && f.loading);
		if (idx >= 0) fees[idx] = { label: 'Gas Fee', amount: formatUsd(DEFAULT_GAS_COST_USD) };
		return { gasCostRbtc: defaultGasRbtc };
	}

	const gasPrice = feeData.gasPrice ?? ethers.parseUnits('0.04', 'gwei');

	// Total gas cost = documented total gas per flow × live on-chain gas price
	const totalGasCostWei = BigInt(TOTAL_FLOW_GAS) * gasPrice;
	const gasCostRbtc = parseFloat(ethers.formatEther(totalGasCostWei));
	const gasCostUsd = gasCostRbtc * rbtcPrice;

	const idx = fees.findIndex((f) => f.label === 'Gas Fee' && f.loading);
	if (idx >= 0) {
		fees[idx] = { label: 'Gas Fee', amount: formatUsd(gasCostUsd) };
	} else {
		fees.push({ label: 'Gas Fee', amount: formatUsd(gasCostUsd) });
	}

	debug.log(
		'Gas: %d total gas × %s gwei = %s RBTC ($%.2f)',
		TOTAL_FLOW_GAS,
		ethers.formatUnits(gasPrice, 'gwei'),
		gasCostRbtc.toFixed(8),
		gasCostUsd
	);

	return { gasCostRbtc };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const loanFeeEstimator = {
	/**
	 * Estimate total fees for a given USD amount in the RBTC → DOC → USDT0 → Arbitrum loan flow.
	 *
	 * Fetches live quotes from MoC (on-chain), a swap aggregator (OpenOcean →
	 * LIFI → Symbiosis fallback chain), and LayerZero OFT bridge (on-chain).
	 * Falls back gracefully with default estimates if any source is unavailable.
	 *
	 * @param params.usdAmount - User-input USD amount as a numeric string (e.g., "100.00")
	 * @param params.signer - Connected RSK wallet signer (ethers.Wallet)
	 * @param params.provider - RSK JSON-RPC provider for gas estimates
	 * @returns Aggregated LoanFeeEstimate with fee breakdown, totals, and route metadata
	 */
	async estimateFees(params: {
		usdAmount: string;
		signer: ethers.Wallet;
		provider: ethers.JsonRpcProvider;
	}): Promise<LoanFeeEstimate> {
		const { ethers } = await import('ethers');
		const { usdAmount, signer, provider } = params;
		const startTime = Date.now();
		const fees: FeeItem[] = [];
		let routeProvider = 'unknown';
		const usdAmountNum = parseFloat(usdAmount);
		if (usdAmountNum <= 0) {
			throw new Error('USD amount must be greater than zero');
		}
		const rbtcPrice = await getRbtcPrice();
		const rbtcNeeded = usdAmountNum / rbtcPrice;
		const rbtcWei = ethers.parseEther(rbtcNeeded.toFixed(18));

		debug.log('RBTC needed: %s (wei: %s)', rbtcNeeded.toFixed(8), rbtcWei.toString());

		// -------------------------------------------------------------------
		// Step 2: MoC DOC Mint Estimate (on-chain)
		// -------------------------------------------------------------------
		let docAmountWei = rbtcWei.toString();
		let coverageRatio: number | null = null;
		try {
			const mocResult = await getMocEstimate(signer, docAmountWei, rbtcPrice, fees);
			docAmountWei = mocResult.docAmount;
			coverageRatio = mocResult.coverageRatio;
		} catch (err) {
			debug.error('MoC estimate threw: %s', (err as Error)?.message);
			// fees row is already pushed and left as loading — mark it with fallback
			const idx = fees.findIndex((f) => f.label === 'DOC Mint Fee' && f.loading);
			if (idx >= 0)
				fees[idx] = {
					label: 'DOC Mint Fee',
					amount: formatUsd(parseFloat(ethers.formatEther(rbtcWei)) * rbtcPrice * MOC_FEE_RATE)
				};
		}

		// -------------------------------------------------------------------
		// Step 3: DOC → USDT0 Swap Quote (OpenOcean → LIFI → Symbiosis)
		// -------------------------------------------------------------------
		let swapResult: SwapQuoteResult = {
			usdt0AmountRaw: docAmountWei,
			usdt0Amount: ethers.formatEther(docAmountWei),
			provider: 'fallback'
		};
		try {
			swapResult = await getSwapQuote(signer, docAmountWei, fees);
		} catch (err) {
			debug.error('Swap quote threw: %s', (err as Error)?.message);
		}
		routeProvider = swapResult.provider;

		// -------------------------------------------------------------------
		// Step 4: LayerZero Bridge Quote (on-chain)
		// -------------------------------------------------------------------
		let bridgeResult: BridgeQuoteResult = { bridgeFeeRbtc: DEFAULT_BRIDGE_FEE_USD / rbtcPrice };
		try {
			bridgeResult = await getBridgeQuote(signer, swapResult.usdt0AmountRaw, rbtcPrice, fees);
		} catch (err) {
			debug.error('Bridge quote threw: %s', (err as Error)?.message);
			const idx = fees.findIndex((f) => f.label === 'Bridge Fee' && f.loading);
			if (idx >= 0) fees[idx] = { label: 'Bridge Fee', amount: formatUsd(DEFAULT_BRIDGE_FEE_USD) };
		}

		// -------------------------------------------------------------------
		// Step 5: Gas Estimate (on-chain)
		// -------------------------------------------------------------------
		let gasResult: GasEstimateResult = { gasCostRbtc: DEFAULT_GAS_COST_USD / rbtcPrice };
		try {
			gasResult = await getGasEstimate(provider, rbtcPrice, fees);
		} catch (err) {
			debug.error('Gas estimate threw: %s', (err as Error)?.message);
			const idx = fees.findIndex((f) => f.label === 'Gas Fee' && f.loading);
			if (idx >= 0) fees[idx] = { label: 'Gas Fee', amount: formatUsd(DEFAULT_GAS_COST_USD) };
		}

		// -------------------------------------------------------------------
		// Aggregate totals
		// -------------------------------------------------------------------
		const totalRbtcNeeded = rbtcNeeded + gasResult.gasCostRbtc + bridgeResult.bridgeFeeRbtc;
		const docFormatted = ethers.formatEther(docAmountWei);
		const usdt0RskFormatted = swapResult.usdt0Amount;

		const estimate: LoanFeeEstimate = {
			fees,
			totalRbtcNeeded: totalRbtcNeeded.toFixed(8),
			estimatedArbReceive: usdt0RskFormatted,
			docAmount: docFormatted,
			usdt0RskAmount: usdt0RskFormatted,
			coverageRatio,
			routeProvider,
			quoteExpiresIn: QUOTE_EXPIRY_SECONDS
		};

		debug.log(
			'Fee estimation complete in %dms: totalRbtc=%s arbReceive=%s provider=%s',
			Date.now() - startTime,
			estimate.totalRbtcNeeded,
			estimate.estimatedArbReceive,
			estimate.routeProvider
		);

		loanMonitoringService.lifecycleEvent('completed', {
			usdAmount,
			totalRbtcNeeded: estimate.totalRbtcNeeded,
			durationMs: Date.now() - startTime
		});

		return estimate;
	},

	/**
	 * Check if fee estimation is available.
	 *
	 * Verifies that:
	 *   1. RBTC price feed is reachable (Coinbase API)
	 *   2. At least one swap provider (OpenOcean, LIFI, or Symbiosis) is reachable
	 *
	 * MoC and LayerZero on-chain checks are not included here because they
	 * require a signer/provider — this is a lightweight pre-flight check.
	 *
	 * @returns Availability status with optional reason if unavailable
	 */
	async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
		debug.log('Checking fee estimator availability...');

		// Check RBTC price feed
		const { data: price, error: priceError } = await tryCatch(
			cryptoPriceService.getCurrentPrice('RBTC')
		);

		if (priceError || !price || price <= 0) {
			const reason = `RBTC price feed unavailable: ${priceError?.message ?? 'zero price'}`;
			debug.warn('Availability check failed: %s', reason);
			loanMonitoringService.healthCheck('fee-estimator', false, undefined, reason);
			return { available: false, reason };
		}

		// Check at least one swap provider
		const openoceanOk = await pingOpenOcean();
		if (openoceanOk) {
			loanMonitoringService.healthCheck('fee-estimator', true);
			return { available: true };
		}

		const lifiOk = await pingLifi();
		if (lifiOk) {
			loanMonitoringService.healthCheck('fee-estimator', true);
			return { available: true };
		}

		const symbiosisOk = await pingSymbiosis();
		if (symbiosisOk) {
			loanMonitoringService.healthCheck('fee-estimator', true);
			return { available: true };
		}

		const reason = 'No swap provider available (OpenOcean, LIFI, Symbiosis all unreachable)';
		debug.warn('Availability check failed: %s', reason);
		loanMonitoringService.healthCheck('fee-estimator', false, undefined, reason);
		return { available: false, reason };
	}
};

// ---------------------------------------------------------------------------
// Availability ping helpers
// ---------------------------------------------------------------------------

async function pingOpenOcean(): Promise<boolean> {
	try {
		const { data, error } = await tryCatch(
			Promise.race([
				openoceanService.getQuote({ docAmount: '1.0' }),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('timeout')), AVAILABILITY_TIMEOUT_MS)
				)
			])
		);
		return !!(data && data.outAmount) && !error;
	} catch {
		return false;
	}
}

async function pingLifi(): Promise<boolean> {
	try {
		const { data, error } = await tryCatch(
			Promise.race([
				lifiService.getQuote({
					fromChain: RSK_CHAIN_ID,
					toChain: RSK_CHAIN_ID,
					fromToken: DOC_ADDRESS,
					toToken: USDT0_RSK_ADDRESS,
					fromAmount: '1',
					fromAddress: '0x0000000000000000000000000000000000000000'
				}),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('timeout')), AVAILABILITY_TIMEOUT_MS)
				)
			])
		);
		return !!data?.estimate?.toAmount && !error;
	} catch {
		return false;
	}
}

async function pingSymbiosis(): Promise<boolean> {
	try {
		const { data, error } = await tryCatch(
			Promise.race([
				symbiosisService.getQuote({
					tokenAmountIn: {
						address: DOC_ADDRESS,
						chainId: RSK_CHAIN_ID,
						symbol: 'DOC',
						decimals: DOC_DECIMALS,
						amount: '1'
					},
					tokenOut: {
						address: USDT0_RSK_ADDRESS,
						chainId: RSK_CHAIN_ID,
						symbol: 'USDT0',
						decimals: USDT0_DECIMALS
					},
					from: '0x0000000000000000000000000000000000000000',
					to: '0x0000000000000000000000000000000000000000',
					slippage: 50
				}),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('timeout')), AVAILABILITY_TIMEOUT_MS)
				)
			])
		);
		return !!data?.tokenAmountOut?.amount && !error;
	} catch {
		return false;
	}
}
