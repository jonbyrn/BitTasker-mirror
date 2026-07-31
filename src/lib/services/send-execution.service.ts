/**
 * Send Execution Service
 *
 * Pure execution logic extracted from SendPaymentForm.handleSend().
 * Handles per-network send logic for both built-in wallet and connected wallet paths.
 * No Svelte component state — only params and returns.
 *
 * Pattern follows swap-execution.service.ts: typed params, typed results,
 * strategy maps for handler dispatch.
 */

import { isLNURL, fetchLNURLPayInvoice } from '$lib/services/lnurl-pay.service';
import {
	getChainIdForNetwork,
	encodeERC20Transfer,
	getBSCUSDTContractAddress,
	getUSDTContractAddressForNetwork
} from '$lib/services/external-wallet/chain-utils';
import {
	EVMSignerNotAvailableError,
	BitcoinSignerNotAvailableError
} from '$lib/services/external-wallet/types';
import {
	startSwapChain,
	getSwapChainStatus,
	type SwapChainState
} from '$lib/services/swap-chain.service';
import { getHandle, getBitcoinSigner } from '$lib/stores/connected-wallets.store';
import type { Route, SourceWallet, Destination } from '$lib/services/route-resolver';
import { createDebug } from '$lib/utils/debug';
import * as Sentry from '@sentry/sveltekit';

const d = createDebug('send-execution');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal wallet manager interface — only the methods send handlers need. */
export interface SendWalletManager {
	sendRBTC(to: string, amount: string): Promise<string>;
	sendBSCUSDT(to: string, amount: string): Promise<string>;
	sendRSKUSDT0(to: string, amount: string): Promise<string>;
	createSubmarineSwap(
		invoice: string,
		description?: string
	): Promise<{ swapId: string; swapData: Record<string, unknown> }>;
	lockSubmarineSwapFunds(swapData: unknown): Promise<{ txHash: string }>;
}

/** Minimal EVM signer interface for send handlers. */
export interface SendEVMSigner {
	sendTransaction(tx: {
		to: string;
		value?: bigint;
		data?: string;
		chainId: number;
	}): Promise<{ txHash: string; from: string; chainId: number }>;
}

/** Minimal Bitcoin signer interface for send handlers. */
export interface SendBitcoinSigner {
	sendBitcoin(req: {
		recipient: string;
		amount: bigint;
		feeRateSatsPerVbyte: number;
	}): Promise<{ txHash: string }>;
}

/** Parsed payment data from address parser. */
export interface ParsedPaymentData {
	address?: string;
	[key: string]: unknown;
}

export interface SendParams {
	recipient: string;
	amountInSats: number;
	amountInUSD: number;
	network: string;
	memo: string;
	walletManager: SendWalletManager;
	parsedPayment: {
		data: ParsedPaymentData | null;
		lnurlCallback?: string;
	};
}

export interface ConnectedSendParams extends SendParams {
	evmSigner: SendEVMSigner;
	bitcoinSigner?: SendBitcoinSigner;
	walletId: string;
}

export interface SendResult {
	txHash: string | null;
	pendingSwapId?: string;
	changellySwapId?: string;
	/** true when caller should show pending screen instead of success screen */
	earlyReturn?: boolean;
}

export type SendHandler = (params: SendParams) => Promise<SendResult>;
export type ConnectedSendHandler = (params: ConnectedSendParams) => Promise<SendResult>;

// ---------------------------------------------------------------------------
// Amount conversion helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Convert a USD amount to ERC-20 units (BigInt) with configurable decimals. */
export function convertUsdToERC20Units(usdAmount: number, decimals: number = 18): bigint {
	const [whole, frac = '00'] = usdAmount.toFixed(2).split('.');
	return BigInt(whole) * BigInt(10 ** decimals) + BigInt(frac.padEnd(decimals, '0'));
}

/** Convert sats (number) to BigInt. */
export function convertSatsToBigInt(sats: number): bigint {
	return BigInt(sats);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve invoice for LNURL payments.
 * If the recipient is an LNURL and we have a callback, fetch the invoice.
 */
async function resolveInvoice(params: SendParams): Promise<string> {
	const { recipient, amountInSats, parsedPayment } = params;
	if (isLNURL(recipient) && parsedPayment.lnurlCallback) {
		const amountMsats = amountInSats * 1000;
		return await fetchLNURLPayInvoice(parsedPayment.lnurlCallback, amountMsats);
	}
	return recipient;
}

/**
 * Extract lockup address from Boltz submarine swap data.
 * Handles multiple data shapes the API may return.
 */
function extractLockupAddress(swapData: Record<string, unknown>): string | undefined {
	if (typeof swapData.lockupAddress === 'string') return swapData.lockupAddress;
	if (typeof swapData.address === 'string') return swapData.address;
	if (
		typeof swapData.lockupDetails === 'object' &&
		swapData.lockupDetails !== null &&
		typeof (swapData.lockupDetails as Record<string, unknown>).lockupAddress === 'string'
	) {
		return (swapData.lockupDetails as Record<string, unknown>).lockupAddress as string;
	}
	return undefined;
}

/**
 * Extract lockup amount from Boltz submarine swap data.
 */
function extractLockupAmount(swapData: Record<string, unknown>): bigint | undefined {
	const raw = swapData.expectedAmount ?? swapData.amount ?? swapData.userLockAmount;
	if (typeof raw === 'number') return BigInt(raw);
	if (typeof raw === 'string') return BigInt(raw);
	return undefined;
}

// ---------------------------------------------------------------------------
// Built-in wallet handlers
// ---------------------------------------------------------------------------

/**
 * Send RBTC directly via the built-in wallet manager.
 * Returns early — caller should show pending screen.
 */
export async function sendRbtcDirect(params: SendParams): Promise<SendResult> {
	const amountRBTC = (params.amountInSats / 100_000_000).toFixed(8);
	const txHash = await params.walletManager.sendRBTC(params.recipient, amountRBTC);

	d.log('sendRbtcDirect: txHash=%s', txHash);
	Sentry.addBreadcrumb({
		category: 'wallet.send',
		message: 'RBTC direct send',
		data: { txHash, amount: amountRBTC }
	});

	return { txHash };
}

/**
 * Send USDT on BSC via the built-in wallet manager.
 */
export async function sendUsdtBsc(params: SendParams): Promise<SendResult> {
	const usdtAmount = params.amountInUSD.toFixed(2);
	const txHash = await params.walletManager.sendBSCUSDT(params.recipient, usdtAmount);

	d.log('sendUsdtBsc: txHash=%s amount=%s', txHash, usdtAmount);

	return { txHash };
}

/**
 * Send USDT0 on RSK via the built-in wallet manager.
 */
export async function sendUsdt0Rsk(params: SendParams): Promise<SendResult> {
	const usdtAmount = params.amountInUSD.toFixed(2);
	const txHash = await params.walletManager.sendRSKUSDT0(params.recipient, usdtAmount);

	d.log('sendUsdt0Rsk: txHash=%s amount=%s', txHash, usdtAmount);

	return { txHash };
}

/**
 * Send Lightning payment via built-in wallet (submarine swap).
 * Creates a Boltz submarine swap and locks funds using the built-in RSK wallet.
 * Returns early with pendingSwapId — caller should show pending screen.
 *
 * A 2-minute timeout wraps the Boltz API calls (createSubmarineSwap +
 * lockSubmarineSwapFunds) to prevent indefinite hangs if the Boltz API
 * is unresponsive.
 */
export async function sendLightningBuiltin(params: SendParams): Promise<SendResult> {
	const LIGHTNING_TIMEOUT_MS = 120_000; // 2 minutes

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), LIGHTNING_TIMEOUT_MS);

	try {
		const invoiceToPay = await resolveInvoice(params);

		const swapResult = await params.walletManager.createSubmarineSwap(invoiceToPay, params.memo);

		const lockResult = await params.walletManager.lockSubmarineSwapFunds(swapResult.swapData);
		const txHash = lockResult.txHash;

		d.log('sendLightningBuiltin: swapId=%s txHash=%s', swapResult.swapId, txHash);
		Sentry.addBreadcrumb({
			category: 'wallet.send',
			message: 'Lightning builtin submarine swap',
			data: { swapId: swapResult.swapId, txHash }
		});

		if (txHash) {
			return {
				txHash,
				pendingSwapId: swapResult.swapId,
				earlyReturn: true
			};
		}

		return { txHash: null };
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			d.error('Lightning swap timed out after %dms', LIGHTNING_TIMEOUT_MS);
			Sentry.addBreadcrumb({
				category: 'wallet.send',
				message: 'Lightning submarine swap timed out',
				level: 'error'
			});
			throw new Error(
				'Lightning swap timed out — the Boltz API may be unresponsive. Please try again.'
			);
		}
		throw err;
	} finally {
		clearTimeout(timeout);
		controller.abort();
	}
}

// ---------------------------------------------------------------------------
// Connected wallet handlers
// ---------------------------------------------------------------------------

/**
 * Send RBTC via connected wallet's EVM signer.
 * Converts sats to wei (18 decimals) for the RBTC transfer.
 */
export async function sendConnectedRbtc(params: ConnectedSendParams): Promise<SendResult> {
	const chainId = getChainIdForNetwork('rootstock-bitcoin');
	const valueWei = convertSatsToBigInt(params.amountInSats) * 10n ** 10n; // sats → wei (RBTC 18 decimals)

	const txResult = await params.evmSigner.sendTransaction({
		to: params.recipient,
		value: valueWei,
		chainId
	});

	d.log('sendConnectedRbtc: txHash=%s', txResult.txHash);
	Sentry.addBreadcrumb({
		category: 'wallet.send',
		message: 'Connected RBTC send',
		data: { txHash: txResult.txHash, walletId: params.walletId }
	});

	return { txHash: txResult.txHash };
}

/**
 * Send USDT (BEP-20) via connected wallet's EVM signer.
 * Encodes ERC-20 transfer() calldata and sends to the BSC USDT contract.
 */
export async function sendConnectedUsdtBsc(params: ConnectedSendParams): Promise<SendResult> {
	const chainId = getChainIdForNetwork('usdt-bsc');
	const usdtUnits = convertUsdToERC20Units(params.amountInUSD);
	const contractAddress = getBSCUSDTContractAddress();
	const data = encodeERC20Transfer(params.recipient, usdtUnits);

	const txResult = await params.evmSigner.sendTransaction({
		to: contractAddress,
		data,
		chainId
	});

	d.log('sendConnectedUsdtBsc: txHash=%s', txResult.txHash);

	return { txHash: txResult.txHash };
}

/**
 * Send USDT0 on RSK via connected wallet's EVM signer.
 * Encodes ERC-20 transfer() calldata and sends to the RSK USDT0 contract.
 */
export async function sendConnectedUsdt0Rsk(params: ConnectedSendParams): Promise<SendResult> {
	const chainId = getChainIdForNetwork('rootstock-bitcoin');
	const usdtUnits = convertUsdToERC20Units(params.amountInUSD, 6);
	const data = encodeERC20Transfer(params.recipient, usdtUnits);

	const txResult = await params.evmSigner.sendTransaction({
		to: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
		data,
		chainId
	});

	d.log('sendConnectedUsdt0Rsk: txHash=%s', txResult.txHash);

	return { txHash: txResult.txHash };
}

/**
 * Send USDT on a generic EVM chain (Ethereum, Arbitrum, Polygon, etc.) via connected wallet.
 * Encodes ERC-20 transfer() calldata and sends to the chain-specific USDT contract.
 */
export async function sendConnectedUsdtEvm(params: ConnectedSendParams): Promise<SendResult> {
	const chainId = getChainIdForNetwork(params.network);
	const usdtContractAddress = getUSDTContractAddressForNetwork(params.network);
	const usdtUnits = convertUsdToERC20Units(params.amountInUSD, 6);
	const data = encodeERC20Transfer(params.recipient, usdtUnits);

	const txResult = await params.evmSigner.sendTransaction({
		to: usdtContractAddress,
		data,
		chainId
	});

	d.log('sendConnectedUsdtEvm: network=%s txHash=%s', params.network, txResult.txHash);

	return { txHash: txResult.txHash };
}

/**
 * Send BTC on-chain via connected wallet's Bitcoin signer (hardware wallet).
 */
export async function sendConnectedBitcoin(params: ConnectedSendParams): Promise<SendResult> {
	if (!params.bitcoinSigner) {
		throw new BitcoinSignerNotAvailableError(params.walletId);
	}

	const amountSatsBigInt = convertSatsToBigInt(params.amountInSats);
	const feeRateSatsPerVbyte = 10; // Standard priority fee rate

	const txResult = await params.bitcoinSigner.sendBitcoin({
		recipient: params.recipient,
		amount: amountSatsBigInt,
		feeRateSatsPerVbyte
	});

	d.log('sendConnectedBitcoin: txHash=%s', txResult.txHash);
	Sentry.addBreadcrumb({
		category: 'wallet.send',
		message: 'Connected Bitcoin send',
		data: { txHash: txResult.txHash, walletId: params.walletId }
	});

	return { txHash: txResult.txHash };
}

/**
 * Send Lightning payment via connected wallet (Boltz submarine swap).
 * The connected wallet locks RBTC on RSK to the Boltz lockup address.
 * Returns early with pendingSwapId — caller should show pending screen.
 *
 * A 2-minute timeout wraps the Boltz API call (createSubmarineSwap) to
 * prevent indefinite hangs if the Boltz API is unresponsive.
 */
export async function sendConnectedLightning(params: ConnectedSendParams): Promise<SendResult> {
	const LIGHTNING_TIMEOUT_MS = 120_000; // 2 minutes

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), LIGHTNING_TIMEOUT_MS);

	try {
		const invoiceToPay = await resolveInvoice(params);

		const swapResult = await params.walletManager.createSubmarineSwap(invoiceToPay, params.memo);

		// Extract lockup details from swapData
		const swapData = (swapResult.swapData ?? {}) as Record<string, unknown>;
		const lockupAddress = extractLockupAddress(swapData);
		const lockupAmount = extractLockupAmount(swapData);

		if (typeof lockupAddress !== 'string') {
			throw new Error('Could not extract lockup address from Boltz swap data');
		}
		if (lockupAmount === undefined) {
			throw new Error('Could not extract lockup amount from Boltz swap data');
		}

		// Send RBTC to Boltz lockup address via connected wallet's EVM signer
		const chainId = getChainIdForNetwork('rootstock-bitcoin');
		const lockupTx = await params.evmSigner.sendTransaction({
			to: lockupAddress,
			value: lockupAmount,
			data: '0x',
			chainId
		});

		const txHash = lockupTx.txHash;

		d.log(
			'sendConnectedLightning: swapId=%s txHash=%s lockupAddress=%s',
			swapResult.swapId,
			txHash,
			lockupAddress
		);
		Sentry.addBreadcrumb({
			category: 'wallet.send',
			message: 'Connected Lightning submarine swap',
			data: { swapId: swapResult.swapId, txHash, lockupAddress }
		});

		if (txHash) {
			return {
				txHash,
				pendingSwapId: swapResult.swapId,
				earlyReturn: true
			};
		}

		return { txHash: null };
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			d.error('Connected Lightning swap timed out after %dms', LIGHTNING_TIMEOUT_MS);
			Sentry.addBreadcrumb({
				category: 'wallet.send',
				message: 'Connected Lightning submarine swap timed out',
				level: 'error'
			});
			throw new Error(
				'Lightning swap timed out — the Boltz API may be unresponsive. Please try again.'
			);
		}
		throw err;
	} finally {
		clearTimeout(timeout);
		controller.abort();
	}
}

// ---------------------------------------------------------------------------
// Strategy maps
// ---------------------------------------------------------------------------

async function sendUsdtArbitrumBuiltin(params: SendParams): Promise<SendResult> {
	const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

	const tokenAddress = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
	const decimals = 6;
	const amountWei = BigInt(Math.round(params.amountInUSD * 10 ** decimals));

	const transferData = encodeERC20Transfer(params.recipient, amountWei);
	const txHash = await sendArbitrumTransaction({
		to: tokenAddress,
		data: transferData,
		value: '0'
	});

	return { txHash };
}

async function sendViaChangelly(params: SendParams): Promise<SendResult> {
	const { changellyService } = await import('$lib/services/changelly.service');
	const { resolveFromTicker, resolveToTicker } = await import('$lib/services/changelly-ticker-map');
	const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

	const fromTicker = resolveFromTicker(params.network);
	const toTicker = resolveToTicker();

	const swap = await changellyService.createSwap({
		from: fromTicker,
		to: toTicker,
		amount: String(params.amountInUSD),
		address: params.recipient
	});

	if (!swap.payinAddress) {
		throw new Error('Changelly swap did not return a payin address');
	}

	const amountWei = BigInt(Math.round(params.amountInUSD * 1_000_000));
	const transferData = encodeERC20Transfer(swap.payinAddress, amountWei);
	const txHash = await sendArbitrumTransaction({
		to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		data: transferData,
		value: '0'
	});

	return { txHash, changellySwapId: swap.id };
}

export const BUILTIN_HANDLERS: Record<string, SendHandler> = {
	'rootstock-bitcoin': sendRbtcDirect,
	'usdt-bsc': sendUsdtBsc,
	'usdt0-rsk': sendUsdt0Rsk,
	'usdt0-arb': sendUsdtArbitrumBuiltin,
	'lightning-bitcoin': sendLightningBuiltin,
	'usdt-ethereum': sendViaChangelly,
	'usdt-avalanche': sendViaChangelly,
	'usdt-base': sendViaChangelly,
	'usdt-optimism': sendViaChangelly,
	'usdt-polygon': sendViaChangelly
};

export const CONNECTED_HANDLERS: Record<string, ConnectedSendHandler> = {
	'rootstock-bitcoin': sendConnectedRbtc,
	'usdt-bsc': sendConnectedUsdtBsc,
	'usdt-ethereum': sendConnectedUsdtEvm,
	'usdt0-arb': sendConnectedUsdtEvm,
	'usdt-polygon': sendConnectedUsdtEvm,
	'usdt0-rsk': sendConnectedUsdt0Rsk,
	bitcoin: sendConnectedBitcoin,
	'lightning-bitcoin': sendConnectedLightning
};

// ---------------------------------------------------------------------------
// executeSend — orchestrator
// ---------------------------------------------------------------------------

/** Unified params for the top-level executeSend dispatcher. */
export interface ExecuteSendParams {
	network: string;
	recipient: string;
	amountInSats: number;
	amountInUSD: number;
	memo: string;
	selectedWalletId: string;
	parsedPayment: {
		data: ParsedPaymentData | null;
		lnurlCallback?: string;
	};
	walletManager: SendWalletManager;
	/** Multi-hop route from the route engine. When present with hops > 1, the swap-chain path is taken. */
	route?: Route | null;
	/** Resolved source wallet type for swap-chain routing. */
	sourceWalletId: SourceWallet;
	/** Resolved destination for swap-chain routing. */
	dest: Destination | null;
}

/** Unified result returned by executeSend. */
export interface ExecuteSendResult {
	txHash: string | null;
	pendingSwapId?: string;
	changellySwapId?: string;
	/** When set, caller should initialise the pending-swap-chain UI. */
	pendingSwapChain?: SwapChainState;
	/** True when the caller should show a pending screen immediately (swap completes async). */
	earlyReturn?: boolean;
}

/** Networks that have registered send handlers (built-in or connected). */
const SUPPORTED_NETWORKS = new Set([
	'rootstock-bitcoin',
	'usdt-bsc',
	'usdt0-rsk',
	'usdt0-arb',
	'lightning-bitcoin',
	'usdt-ethereum',
	'usdt-avalanche',
	'usdt-base',
	'usdt-optimism',
	'usdt-polygon',
	'bitcoin'
]);

/**
 * Top-level send dispatcher.
 *
 * Routes to the correct handler based on wallet type (connected vs built-in)
 * and network.  Handles multi-hop swap-chain routes as a special case.
 *
 * Returns a flat result object — caller maps it onto component state.
 */
export async function executeSend(params: ExecuteSendParams): Promise<ExecuteSendResult> {
	const {
		network,
		recipient,
		amountInSats,
		amountInUSD,
		memo,
		selectedWalletId,
		parsedPayment,
		walletManager,
		route,
		sourceWalletId,
		dest
	} = params;

	if (!SUPPORTED_NETWORKS.has(network)) {
		throw new Error(`Sending on ${network} is not yet supported`);
	}

	const isConnectedSource = selectedWalletId !== 'builtin';

	// ── Multi-hop swap chain ───────────────────────────────────────────────
	if (route && route.hops.length > 1 && dest) {
		d.log('executeSend: swap-chain route hops=%d', route.hops.length);

		const { data: swapData, error: swapError } = await startSwapChain(
			route,
			sourceWalletId,
			dest,
			String(amountInSats),
			isConnectedSource ? selectedWalletId : null
		);

		if (swapError || !swapData) {
			throw new Error(swapError?.message || 'Swap chain failed');
		}

		const status = getSwapChainStatus(swapData);
		if (status.isComplete || status.isActive) {
			Sentry.addBreadcrumb({
				category: 'wallet.send',
				message: 'Swap chain started',
				data: { routeId: route.id, phase: swapData.phase }
			});
			return { txHash: null, pendingSwapChain: swapData };
		}

		throw new Error(status.message || 'Swap chain failed');
	}

	// ── Connected wallet (EVM / Bitcoin signer) ───────────────────────────
	if (isConnectedSource) {
		const handle = getHandle(selectedWalletId);
		if (!handle?.evmSigner) {
			throw new EVMSignerNotAvailableError(selectedWalletId);
		}

		const connectedParams: ConnectedSendParams = {
			recipient,
			amountInSats,
			amountInUSD,
			network,
			memo,
			walletManager,
			parsedPayment,
			evmSigner: handle.evmSigner,
			bitcoinSigner: getBitcoinSigner(selectedWalletId),
			walletId: selectedWalletId
		};

		const handler = CONNECTED_HANDLERS[network];
		if (!handler) {
			throw new Error(`No connected handler registered for network: ${network}`);
		}

		d.log('executeSend: connected wallet network=%s walletId=%s', network, selectedWalletId);
		return await handler(connectedParams);
	}

	// ── Built-in wallet ────────────────────────────────────────────────────
	const builtinParams: SendParams = {
		recipient,
		amountInSats,
		amountInUSD,
		network,
		memo,
		walletManager,
		parsedPayment
	};

	const handler = BUILTIN_HANDLERS[network];
	if (!handler) {
		throw new Error(`No built-in handler registered for network: ${network}`);
	}

	d.log('executeSend: built-in wallet network=%s', network);
	return await handler(builtinParams);
}
