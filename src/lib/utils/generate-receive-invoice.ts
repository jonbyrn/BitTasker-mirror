/**
 * generate-receive-invoice.ts
 *
 * Invoice generation service extracted from ReceivePaymentForm.svelte.
 * Handles all network-specific invoice/swap creation and delegates
 * to the parent via callback.
 *
 * Pure orchestration logic — no UI, no i18n (caller handles toasts).
 */

import { walletManager } from '$lib/stores/wallet.store';
import { getHandle } from '$lib/stores/connected-wallets.store';
import { createConnectedReverseSwap } from '$lib/services/connected-wallet-reverse-swap';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('generate-receive-invoice');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceFormState {
	amount: string;
	unit: 'sats' | 'usd';
	mathExpression: string;
	memo: string;
	selectedNetwork: string;
	chargeFeesToPayer: boolean;
}

export interface InvoiceResult {
	swapId?: string;
	address?: string;
	amount: number;
	memo?: string;
	network?: string;
	chargeFeesToPayer?: boolean;
	totalFees?: number;
	formState: InvoiceFormState;
}

/**
 * Extracts expiry information from a swap data object.
 * Returns the expiresAt timestamp in ms and whether the swap has expired.
 * Returns null if no expiry data is present.
 */
export function getSwapExpiryInfo(swapData: unknown): {
	expiresAt: number;
	isExpired: boolean;
	remainingMs: number;
} | null {
	if (typeof swapData !== 'object' || swapData === null) return null;
	const val = (swapData as Record<string, unknown>)['expiresAt'];
	if (typeof val !== 'number' || val <= 0) return null;
	const now = Date.now();
	const remainingMs = Math.max(0, val - now);
	return {
		expiresAt: val,
		isExpired: remainingMs <= 0,
		remainingMs
	};
}

export interface GenerateInvoiceParams {
	invoiceAmount: number;
	selectedNetwork: string;
	selectedReceiveWalletId: string | null;
	isReceiveWalletValid: boolean;
	formState: InvoiceFormState;
	totalFees: number;
	/** Wallet store data needed for address resolution */
	rskAddress: string | undefined;
	rskConnected: boolean;
	bscAddress: string | undefined;
	bscConnected: boolean;
	/** Swap routes available (for validation) */
	swapRoutesCount: number;
}

export interface GenerateInvoiceCallbacks {
	onSuccess: (result: InvoiceResult) => void;
	onError: (message: string) => void;
	onClose: () => void;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Generate an invoice/swap for the selected network.
 * Calls onSuccess with the result, onError with error message, or onClose when done.
 * Returns true if generation started, false if validation failed.
 */
export async function generateReceiveInvoice(
	params: GenerateInvoiceParams,
	callbacks: GenerateInvoiceCallbacks
): Promise<void> {
	const {
		invoiceAmount,
		selectedNetwork,
		selectedReceiveWalletId,
		isReceiveWalletValid,
		formState,
		totalFees,
		rskAddress,
		rskConnected,
		bscAddress,
		bscConnected,
		swapRoutesCount
	} = params;

	// Validate that a route exists for swap-required networks
	const swapNetworks = ['lightning-bitcoin', 'liquid-bitcoin', 'bitcoin'];
	if (swapNetworks.includes(selectedNetwork) && swapRoutesCount === 0) {
		callbacks.onError('wallet.swap.error.no_routes');
		return;
	}

	const useConnected = !!selectedReceiveWalletId && isReceiveWalletValid;

	try {
		if (selectedNetwork === 'lightning-bitcoin') {
			await handleLightningReceive(
				invoiceAmount,
				useConnected,
				selectedReceiveWalletId,
				formState,
				callbacks
			);
		} else if (selectedNetwork === 'rootstock-bitcoin') {
			handleDirectReceive(
				invoiceAmount,
				useConnected,
				selectedReceiveWalletId,
				formState,
				totalFees,
				rskAddress,
				rskConnected,
				'rootstock-bitcoin',
				callbacks
			);
		} else if (selectedNetwork === 'bitcoin') {
			handleBitcoinReceive(
				invoiceAmount,
				useConnected,
				selectedReceiveWalletId,
				formState,
				totalFees,
				rskAddress,
				rskConnected,
				callbacks
			);
		} else if (selectedNetwork === 'liquid-bitcoin') {
			await handleLiquidReceive(
				invoiceAmount,
				useConnected,
				formState,
				rskConnected,
				rskAddress,
				callbacks
			);
		} else if (selectedNetwork === 'usdt-bsc') {
			handleDirectReceive(
				invoiceAmount,
				useConnected,
				selectedReceiveWalletId,
				formState,
				totalFees,
				bscAddress,
				bscConnected,
				'usdt-bsc',
				callbacks
			);
		} else if (['usdt0-arbitrum', 'wbtc-arbitrum', 'tbtc-arbitrum'].includes(selectedNetwork)) {
			handleDirectReceive(
				invoiceAmount,
				useConnected,
				selectedReceiveWalletId,
				formState,
				totalFees,
				rskAddress,
				rskConnected,
				selectedNetwork,
				callbacks
			);
		} else {
			callbacks.onError('wallet.receive_form.network_not_available');
			return;
		}

		callbacks.onClose();
	} catch (error) {
		d.error('Failed to generate invoice:', error);
		callbacks.onError(error instanceof Error ? error.message : 'wallet.invoice.generation_failed');
	}
}

// ---------------------------------------------------------------------------
// Network-specific handlers
// ---------------------------------------------------------------------------

async function handleLightningReceive(
	invoiceAmount: number,
	useConnected: boolean,
	selectedReceiveWalletId: string | null,
	formState: InvoiceFormState,
	callbacks: GenerateInvoiceCallbacks
): Promise<void> {
	if (useConnected) {
		const handle = getHandle(selectedReceiveWalletId!);
		if (!handle?.address) {
			callbacks.onError('wallet.receive.connected_wallet_not_found');
			return;
		}

		const swap = await createConnectedReverseSwap(
			Math.floor(invoiceAmount),
			handle.address,
			selectedReceiveWalletId!,
			handle.walletName
		);

		callbacks.onSuccess({
			swapId: swap.swapId,
			amount: Math.floor(invoiceAmount),
			formState
		});
	} else {
		const result = await walletManager.createReverseSwap(Math.floor(invoiceAmount));
		callbacks.onSuccess({
			swapId: result.swapId,
			amount: Math.floor(invoiceAmount),
			formState
		});
	}
}

function handleDirectReceive(
	invoiceAmount: number,
	useConnected: boolean,
	selectedReceiveWalletId: string | null,
	formState: InvoiceFormState,
	totalFees: number,
	walletAddress: string | undefined,
	walletConnected: boolean,
	network: string,
	callbacks: GenerateInvoiceCallbacks
): void {
	let address: string;
	if (useConnected) {
		const handle = getHandle(selectedReceiveWalletId!);
		if (!handle?.address) {
			callbacks.onError('wallet.receive.connected_wallet_not_found');
			return;
		}
		address = handle.address;
	} else {
		if (!walletConnected || !walletAddress) {
			callbacks.onError(
				network === 'usdt-bsc' ? 'wallet.bsc.not_connected' : 'wallet.rsk_not_connected'
			);
			return;
		}
		address = walletAddress;
	}

	callbacks.onSuccess({
		address,
		network,
		amount: Math.floor(invoiceAmount),
		memo: formState.memo || undefined,
		chargeFeesToPayer: formState.chargeFeesToPayer,
		totalFees,
		formState
	});
}

function handleBitcoinReceive(
	invoiceAmount: number,
	useConnected: boolean,
	selectedReceiveWalletId: string | null,
	formState: InvoiceFormState,
	totalFees: number,
	rskAddress: string | undefined,
	rskConnected: boolean,
	callbacks: GenerateInvoiceCallbacks
): void {
	let address: string;
	if (useConnected) {
		const handle = getHandle(selectedReceiveWalletId!);
		const btcAddr = handle?.bitcoinSigner?.address;
		if (!btcAddr) {
			callbacks.onError('wallet.receive.connected_wallet_not_found');
			return;
		}
		address = btcAddr;
	} else {
		if (!rskConnected || !rskAddress) {
			callbacks.onError('wallet.rsk_not_connected');
			return;
		}
		address = rskAddress;
	}

	callbacks.onSuccess({
		address,
		network: 'bitcoin',
		amount: Math.floor(invoiceAmount),
		memo: formState.memo || undefined,
		chargeFeesToPayer: formState.chargeFeesToPayer,
		totalFees,
		formState
	});
}

async function handleLiquidReceive(
	invoiceAmount: number,
	useConnected: boolean,
	formState: InvoiceFormState,
	rskConnected: boolean,
	rskAddress: string | undefined,
	callbacks: GenerateInvoiceCallbacks
): Promise<void> {
	if (useConnected) {
		callbacks.onError('wallet.receive.liquid_not_available_connected');
		return;
	}
	if (!rskConnected || !rskAddress) {
		callbacks.onError('wallet.rsk_not_connected');
		return;
	}

	const result = await walletManager.createChainSwap(Math.floor(invoiceAmount));
	callbacks.onSuccess({
		swapId: result.swapId,
		amount: Math.floor(invoiceAmount),
		formState
	});
}
