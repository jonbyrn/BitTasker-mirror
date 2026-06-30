/**
 * Bitcoin Handlers — Factory functions for Bitcoin-addition handlers
 * extracted from ConnectedWallets.svelte.
 *
 * Each factory receives state setters and store access as parameters,
 * returning handler functions that the component can bind to UI events.
 */

import { get, writable, type Writable } from 'svelte/store';
import type { ConnectorHandle, BitcoinSigner } from '$lib/services/external-wallet/types';
import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
import { getHandle as storeGetHandle } from '$lib/stores/connected-wallets.store';
import {
	getPlatformInfo,
	isTrezorAvailable,
	getLedgerTransport
} from '$lib/services/external-wallet/platform-checks';
import type { ConnectedWalletsState } from '$lib/stores/connected-wallets.store';

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

export interface BtcHandlersParams {
	connectedWalletsStore: Writable<ConnectedWalletsState>;
	replaceConnectedWallet: (handle: ConnectorHandle & { bitcoinSigner: BitcoinSigner }) => void;
	setConnectedWalletError: (error: string) => void;
	t: (key: string) => string;
	// Ledger state setters
	setLedgerBtcError: (error: string) => void;
	setLedgerBtcConnecting: (value: boolean) => void;
	setLedgerBtcStep: (value: boolean) => void;
	setLedgerBtcSuccess: (value: boolean) => void;
	setLedgerConnect: (value: boolean) => void;
	setShowConnectModal: (value: boolean) => void;
	// Trezor state setters
	setTrezorBtcError: (error: string) => void;
	setTrezorBtcConnecting: (value: boolean) => void;
	setTrezorBtcStep: (value: boolean) => void;
	setTrezorBtcSuccess: (value: boolean) => void;
}

export interface CopyAddressParams {
	copyToClipboard: (text: string) => Promise<boolean>;
	appStore: {
		showErrorToast: (message: string) => void;
		showSuccessToast: (message: string) => void;
	};
	t: (key: string) => string;
	setCopiedAddress: (addr: string | null) => void;
}

export interface DisconnectHandlersParams {
	connectedWalletsStore: Writable<ConnectedWalletsState>;
	unregisterConnectedWallet: (walletId: string) => void;
}

// ---------------------------------------------------------------------------
// Handler factories
// ---------------------------------------------------------------------------

/**
 * Creates a handler that adds the Bitcoin app to a connected Ledger wallet.
 * Handles platform checks, dynamic import, read-modify-write via connectorRegistry,
 * success delay, and error classification.
 */
export function createAddLedgerBitcoinHandler(params: BtcHandlersParams): () => Promise<void> {
	const {
		connectedWalletsStore,
		replaceConnectedWallet,
		setConnectedWalletError,
		t,
		setLedgerBtcError,
		setLedgerBtcConnecting,
		setLedgerBtcStep,
		setLedgerBtcSuccess,
		setLedgerConnect,
		setShowConnectModal
	} = params;

	return async function handleAddLedgerBitcoin(): Promise<void> {
		const info = getPlatformInfo(window.navigator);
		const transport = getLedgerTransport(info);
		if (transport === 'unavailable') {
			setLedgerBtcError(t('wallet.connected.error_ledger_platform'));
			return;
		}

		setLedgerBtcError('');
		setLedgerBtcConnecting(true);
		try {
			const { addBitcoinToLedger } = await import('$lib/services/external-wallet/ledger-connector');
			const result = await addBitcoinToLedger({
				registry: connectorRegistry,
				navigator: window.navigator
			});

			// Find the existing Ledger handle in the registry and add bitcoinSigner.
			// Search by walletType since EVM and BTC addresses may differ.
			const ledgerWallet = get(connectedWalletsStore).wallets.find(
				(w) => w.walletType === 'ledger'
			);
			if (ledgerWallet) {
				const currentHandle = storeGetHandle(ledgerWallet.id);
				if (currentHandle) {
					const updatedHandle = {
						...currentHandle,
						bitcoinSigner: result.bitcoinSigner
					} as import('$lib/services/external-wallet/types').ConnectorHandle & {
						bitcoinSigner: import('$lib/services/external-wallet/types').BitcoinSigner;
					};
					replaceConnectedWallet(updatedHandle);
				}
			}

			// Show success briefly before closing
			setLedgerBtcConnecting(false);
			setLedgerBtcStep(false);
			setLedgerBtcSuccess(true);
			await new Promise((resolve) => setTimeout(resolve, 1500));
			setLedgerBtcSuccess(false);
			setLedgerConnect(false);
			setShowConnectModal(false);
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : t('wallet.connected.error_ledger_connect');

			if (
				msg.toLowerCase().includes('bitcoin') ||
				msg.toLowerCase().includes('open the') ||
				msg.toLowerCase().includes('ledger device')
			) {
				setLedgerBtcConnecting(false);
				setLedgerBtcError(msg);
			} else {
				setLedgerBtcConnecting(false);
				setLedgerBtcStep(false);
				setLedgerConnect(false);
				setShowConnectModal(false);
				setConnectedWalletError(msg);
			}
		}
	};
}

/**
 * Creates a handler that adds the Bitcoin wallet to a connected Trezor device.
 * Handles platform checks, dynamic import, read-modify-write via connectorRegistry,
 * success delay, and error classification.
 */
export function createAddTrezorBitcoinHandler(params: BtcHandlersParams): () => Promise<void> {
	const {
		connectedWalletsStore,
		replaceConnectedWallet,
		setConnectedWalletError,
		t,
		setTrezorBtcError,
		setTrezorBtcConnecting,
		setTrezorBtcStep,
		setTrezorBtcSuccess,
		setShowConnectModal
	} = params;

	return async function handleAddTrezorBitcoin(): Promise<void> {
		const info = getPlatformInfo(window.navigator);
		if (!isTrezorAvailable(info)) {
			setTrezorBtcError(t('wallet.connected.error_trezor_platform'));
			return;
		}

		setTrezorBtcError('');
		setTrezorBtcConnecting(true);
		try {
			const { connectTrezorBitcoin } = await import(
				'$lib/services/external-wallet/trezor-connector'
			);
			const result = await connectTrezorBitcoin({
				registry: connectorRegistry,
				navigator: window.navigator
			});

			// Find the existing Trezor handle in the registry and add bitcoinSigner.
			const trezorWallet = get(connectedWalletsStore).wallets.find(
				(w) => w.walletType === 'trezor'
			);
			if (trezorWallet) {
				const currentHandle = storeGetHandle(trezorWallet.id);
				if (currentHandle) {
					const updatedHandle = {
						...currentHandle,
						bitcoinSigner: result.bitcoinSigner
					} as import('$lib/services/external-wallet/types').ConnectorHandle & {
						bitcoinSigner: import('$lib/services/external-wallet/types').BitcoinSigner;
					};
					replaceConnectedWallet(updatedHandle);
				}
			}

			// Show success briefly before closing
			setTrezorBtcConnecting(false);
			setTrezorBtcStep(false);
			setTrezorBtcSuccess(true);
			await new Promise((resolve) => setTimeout(resolve, 1500));
			setTrezorBtcSuccess(false);
			setShowConnectModal(false);
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : t('wallet.connected.error_trezor_connect');

			if (
				msg.toLowerCase().includes('bitcoin') ||
				msg.toLowerCase().includes('open the') ||
				msg.toLowerCase().includes('trezor')
			) {
				setTrezorBtcConnecting(false);
				setTrezorBtcError(msg);
			} else {
				setTrezorBtcConnecting(false);
				setTrezorBtcStep(false);
				setShowConnectModal(false);
				setConnectedWalletError(msg);
			}
		}
	};
}

/**
 * Creates a copy-to-clipboard handler.
 * Copies the address, shows success/error toast, and resets the visual
 * "copied" indicator after 2 seconds.
 */
export function createCopyAddressHandler(
	params: CopyAddressParams
): (addr: string) => Promise<void> {
	const { copyToClipboard, appStore, t, setCopiedAddress } = params;

	return async function copyAddress(addr: string): Promise<void> {
		const ok = await copyToClipboard(addr);
		if (!ok) {
			appStore.showErrorToast(t('wallet.connected.copy_failed'));
			return;
		}
		setCopiedAddress(addr);
		appStore.showSuccessToast(t('wallet.connected.address_copied'));
		setTimeout(() => {
			setCopiedAddress(null);
		}, 2000);
	};
}

/**
 * Creates disconnect handlers that manage a confirmation modal.
 *
 * Mirrors the exact logic from ConnectedWallets.svelte (lines ~626–639).
 * Returns a writable `showDisconnectId` that the component can use in its
 * template to conditionally render the disconnect confirmation dialog.
 */
export function createDisconnectHandlers(params: DisconnectHandlersParams): {
	showDisconnectId: Writable<string | null>;
	confirmDisconnect: (walletId: string) => void;
	handleDisconnect: () => void;
	cancelDisconnect: () => void;
} {
	const { unregisterConnectedWallet } = params;

	const showDisconnectId = writable<string | null>(null);

	function confirmDisconnect(walletId: string): void {
		showDisconnectId.set(walletId);
	}

	function handleDisconnect(): void {
		const id = get(showDisconnectId);
		if (id) {
			unregisterConnectedWallet(id);
			showDisconnectId.set(null);
		}
	}

	function cancelDisconnect(): void {
		showDisconnectId.set(null);
	}

	return {
		showDisconnectId,
		confirmDisconnect,
		handleDisconnect,
		cancelDisconnect
	};
}
