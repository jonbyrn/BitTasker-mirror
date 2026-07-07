<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import {
		connectedWalletsStore,
		hasConnectedWallets,
		registerConnectedWallet,
		unregisterConnectedWallet,
		replaceConnectedWallet,
		setConnectingType,
		setConnectedWalletError,
		hasBitcoinSigner,
		getBitcoinAddress
	} from '$lib/stores/connected-wallets.store';
	import { connectorRegistry as _connectorRegistry } from '$lib/services/external-wallet/connector-registry';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { blockchainToastStore } from '$lib/stores/wallet/blockchain-toast.store';

	// Sub-components
	import WalletCard from './WalletCard.svelte';
	import ConnectModal from './ConnectModal.svelte';
	import DisconnectDialog from './DisconnectDialog.svelte';
	import WalletConnectQRModal from './WalletConnectQRModal.svelte';
	import HelpModal from './HelpModal.svelte';

	// Extracted logic
	import {
		createCloseConnectModalHandler,
		createConnectMetaMaskHandler,
		createConnectWCHandler,
		createWCCancelHandler,
		createConnectTrezorHandler,
		createConnectLedgerHandler
	} from './wallet-connect-handlers';
	import {
		createAddLedgerBitcoinHandler,
		createAddTrezorBitcoinHandler,
		createCopyAddressHandler,
		createDisconnectHandlers,
		type BtcHandlersParams
	} from './wallet-btc-handlers';

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------
	let copiedAddress = $state<string | null>(null);
	let showLedgerConnect = $state(false);
	let ledgerConnectError = $state('');
	let showLedgerBtcStep = $state(false);
	let showLedgerBtcSuccess = $state(false);
	let ledgerBtcError = $state('');
	let ledgerBtcConnecting = $state(false);

	let showTrezorBtcStep = $state(false);
	let showTrezorBtcSuccess = $state(false);
	let trezorBtcError = $state('');
	let trezorBtcConnecting = $state(false);

	let showWCModal = $state(false);
	let wcQRUri = $state<string | null>(null);
	let expandedWalletId = $state<string | null>(null);

	// BTC state (derived via store query facade)
	let btcConnectedWallets = $derived.by(() => {
		return $connectedWalletsStore.wallets.filter((w) => hasBitcoinSigner(w.id)).map((w) => w.id);
	});

	let btcAddressFor = $derived.by(() => {
		const map: Record<string, string> = {};
		for (const w of $connectedWalletsStore.wallets) {
			const addr = getBitcoinAddress(w.id);
			if (addr) map[w.id] = addr;
		}
		return map;
	});

	// Props
	let {
		onSend: _onSend,
		onReceive: _onReceive,
		balancesHidden = false,
		showConnectModal = $bindable(false)
	}: {
		onSend?: () => void;
		onReceive?: () => void;
		balancesHidden?: boolean;
		showConnectModal?: boolean;
	} = $props();

	// Formatters
	const satsFormatter = $derived(new Intl.NumberFormat($locale ?? 'en'));
	const usdFormatter = $derived(
		new Intl.NumberFormat($locale ?? 'en', { style: 'currency', currency: 'USD' })
	);

	// -----------------------------------------------------------------------
	// Wire handler factories
	// -----------------------------------------------------------------------
	const closeConnectModal = createCloseConnectModalHandler({
		setShowConnectModal: (v) => (showConnectModal = v),
		setShowLedgerConnect: (v) => (showLedgerConnect = v),
		setShowLedgerBtcStep: (v) => (showLedgerBtcStep = v),
		setShowLedgerBtcSuccess: (v) => (showLedgerBtcSuccess = v),
		setLedgerBtcError: (v) => (ledgerBtcError = v),
		setLedgerBtcConnecting: (v) => (ledgerBtcConnecting = v),
		setShowTrezorBtcStep: (v) => (showTrezorBtcStep = v),
		setShowTrezorBtcSuccess: (v) => (showTrezorBtcSuccess = v),
		setTrezorBtcError: (v) => (trezorBtcError = v),
		setTrezorBtcConnecting: (v) => (trezorBtcConnecting = v),
		connectedWalletsStore,
		setConnectingType,
		setConnectedWalletError,
		registerConnectedWallet,
		unregisterConnectedWallet
	});

	const handleConnectMetaMask = createConnectMetaMaskHandler({
		setConnectingType,
		setConnectedWalletError,
		closeConnectModal,
		registerConnectedWallet,
		unregisterConnectedWallet
	});

	const handleConnectWC = createConnectWCHandler({
		setConnectingType,
		setConnectedWalletError,
		closeConnectModal,
		registerConnectedWallet,
		unregisterConnectedWallet,
		setShowWCModal: (v) => (showWCModal = v),
		setWcQRUri: (v) => (wcQRUri = v)
	});

	const handleWCCancel = createWCCancelHandler({
		setShowWCModal: (v) => (showWCModal = v),
		setWcQRUri: (v) => (wcQRUri = v),
		setConnectedWalletError
	});

	const handleConnectTrezor = createConnectTrezorHandler({
		setConnectingType,
		setConnectedWalletError,
		registerConnectedWallet,
		unregisterConnectedWallet,
		setShowTrezorBtcStep: (v) => (showTrezorBtcStep = v),
		setTrezorBtcError: (v) => (trezorBtcError = v),
		setTrezorBtcConnecting: (v) => (trezorBtcConnecting = v)
	});

	const handleConnectLedger = createConnectLedgerHandler({
		setConnectingType,
		setConnectedWalletError,
		registerConnectedWallet,
		unregisterConnectedWallet,
		setShowConnectModal: (v) => (showConnectModal = v),
		setShowLedgerConnect: (v) => (showLedgerConnect = v),
		setLedgerConnectError: (v) => (ledgerConnectError = v),
		setShowLedgerBtcStep: (v) => (showLedgerBtcStep = v),
		setLedgerBtcError: (v) => (ledgerBtcError = v)
	});

	const handleAddLedgerBitcoin = createAddLedgerBitcoinHandler({
		connectedWalletsStore,
		replaceConnectedWallet:
			replaceConnectedWallet as unknown as BtcHandlersParams['replaceConnectedWallet'],
		setConnectedWalletError,
		setLedgerBtcError: (v: string) => (ledgerBtcError = v),
		setLedgerBtcConnecting: (v: boolean) => (ledgerBtcConnecting = v),
		setLedgerBtcStep: (v: boolean) => (showLedgerBtcStep = v),
		setLedgerBtcSuccess: (v: boolean) => (showLedgerBtcSuccess = v),
		setLedgerConnect: (v: boolean) => (showLedgerConnect = v),
		setShowConnectModal: (v: boolean) => (showConnectModal = v),
		t: (key: string) => get(t)(key)
	} as unknown as BtcHandlersParams);

	const handleAddTrezorBitcoin = createAddTrezorBitcoinHandler({
		connectedWalletsStore,
		replaceConnectedWallet:
			replaceConnectedWallet as unknown as BtcHandlersParams['replaceConnectedWallet'],
		setConnectedWalletError,
		setTrezorBtcError: (v: string) => (trezorBtcError = v),
		setTrezorBtcConnecting: (v: boolean) => (trezorBtcConnecting = v),
		setTrezorBtcStep: (v: boolean) => (showTrezorBtcStep = v),
		setTrezorBtcSuccess: (v: boolean) => (showTrezorBtcSuccess = v),
		setShowConnectModal: (v: boolean) => (showConnectModal = v),
		t: (key: string) => get(t)(key)
	} as unknown as BtcHandlersParams);

	const copyAddress = createCopyAddressHandler({
		copyToClipboard,
		setCopiedAddress: (v) => (copiedAddress = v),
		appStore,
		t: (key: string) => get(t)(key)
	});

	const { showDisconnectId, confirmDisconnect, handleDisconnect, cancelDisconnect } =
		createDisconnectHandlers({
			connectedWalletsStore,
			unregisterConnectedWallet
		});

	// Pending swaps for the wallet being disconnected — shows warning in DisconnectDialog
	const pendingSwapsForWallet = $derived.by(() => {
		const disconnectId = $showDisconnectId;
		if (!disconnectId) return [];
		const walletAddress = $connectedWalletsStore.wallets.find(
			(w) => w.id === disconnectId
		)?.address;
		if (!walletAddress) return [];
		return $blockchainToastStore.toasts.filter(
			(t) =>
				t.type === 'swap' &&
				t.status !== 'success' &&
				t.status !== 'error' &&
				t.sourceAddress?.toLowerCase() === walletAddress.toLowerCase()
		);
	});

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------
	onMount(() => {
		reconnectPersistedWallets();
	});
</script>

{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)}
	<div class="flex flex-col gap-2">
		{#if $connectedWalletsStore.connectingType}
			<div class="alert alert-outline alert-info py-2 text-sm" aria-live="polite">
				<span class="loading loading-spinner loading-xs"></span>
				<span
					>{$t('wallet.connected.connecting', {
						values: { type: $connectedWalletsStore.connectingType }
					})}</span
				>
			</div>
		{/if}

		{#if $connectedWalletsStore.error}
			<div class="alert alert-outline alert-error py-2 text-sm" role="alert">
				<span>{$connectedWalletsStore.error}</span>
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => connectedWalletsStore.update((s) => ({ ...s, error: null }))}
					aria-label="Dismiss error"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
		{/if}

		<!-- Individual Wallet Cards -->
		{#if $hasConnectedWallets}
			{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
				<WalletCard
					{wallet}
					{balancesHidden}
					expanded={expandedWalletId === wallet.id}
					btcConnected={btcConnectedWallets.includes(wallet.id)}
					btcAddress={btcAddressFor[wallet.id] ?? null}
					{copiedAddress}
					{satsFormatter}
					{usdFormatter}
					onExpand={() => (expandedWalletId = expandedWalletId === wallet.id ? null : wallet.id)}
					onCopy={copyAddress}
					onConnectBitcoin={(type) => {
						if (type === 'ledger') {
							showLedgerConnect = true;
							showConnectModal = true;
							showLedgerBtcStep = true;
							ledgerBtcError = '';
						} else {
							showConnectModal = true;
							showLedgerBtcStep = false;
							showTrezorBtcStep = true;
							trezorBtcError = '';
						}
					}}
					onDisconnect={() => confirmDisconnect(wallet.id)}
				/>
			{/each}
		{/if}
	</div>

	<HelpModal />

	<!-- Connect Modal -->
	<ConnectModal
		show={showConnectModal}
		onClose={closeConnectModal}
		connectingType={$connectedWalletsStore.connectingType}
		{showLedgerConnect}
		{showLedgerBtcStep}
		{showLedgerBtcSuccess}
		{ledgerConnectError}
		{ledgerBtcError}
		{ledgerBtcConnecting}
		{showTrezorBtcStep}
		{showTrezorBtcSuccess}
		{trezorBtcError}
		{trezorBtcConnecting}
		onConnectMetaMask={handleConnectMetaMask}
		onConnectWC={handleConnectWC}
		onConnectTrezor={handleConnectTrezor}
		onConnectLedger={handleConnectLedger}
		onAddLedgerBitcoin={handleAddLedgerBitcoin}
		onAddTrezorBitcoin={handleAddTrezorBitcoin}
		onLedgerSkip={() => {
			showLedgerBtcStep = false;
			showLedgerConnect = false;
			closeConnectModal();
		}}
		onTrezorSkip={() => {
			showTrezorBtcStep = false;
			closeConnectModal();
		}}
	/>

	<WalletConnectQRModal isOpen={showWCModal} qrUri={wcQRUri} onCancel={handleWCCancel} />

	<DisconnectDialog
		show={$showDisconnectId !== null}
		walletName={$connectedWalletsStore.wallets.find((w) => w.id === $showDisconnectId)
			?.walletName ?? ''}
		walletAddress={$connectedWalletsStore.wallets
			.find((w) => w.id === $showDisconnectId)
			?.address?.slice(0, 10) ?? ''}
		pendingSwaps={pendingSwapsForWallet}
		onCancel={cancelDisconnect}
		onConfirm={handleDisconnect}
	/>
{/if}
