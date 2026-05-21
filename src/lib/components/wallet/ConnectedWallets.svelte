<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		connectedWalletsStore,
		hasConnectedWallets,
		registerConnectedWallet,
		unregisterConnectedWallet,
		setConnectingType,
		setConnectedWalletError,
		restoreConnectedWalletState
	} from '$lib/stores/connected-wallets.store';
	import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
	import {
		isMetaMaskAvailable,
		isTrezorAvailable,
		getLedgerTransport,
		getPlatformInfo
	} from '$lib/services/external-wallet/platform-checks';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import { onMount, onDestroy } from 'svelte';
	import IconClose from '~icons/mdi/close';
	import IconContentCopy from '~icons/mdi/content-copy';
	import WalletConnectQRModal from './WalletConnectQRModal.svelte';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	let copiedAddress = $state<string | null>(null);

	// With Multichain SDK, MetaMask connects to ALL configured chains simultaneously.
	// Balances queried from all scopes — no manual switching needed.

	async function copyAddress(addr: string): Promise<void> {
		await copyToClipboard(addr);
		copiedAddress = addr;
		appStore.showSuccessToast('Address copied');
		setTimeout(() => {
			copiedAddress = null;
		}, 2000);
	}

	function walletLogo(type: string): string {
		switch (type) {
			case 'metamask':
				return '/images/wallets/metamask.svg';
			case 'walletconnect':
				return '/images/wallets/walletconnect.svg';
			case 'trezor':
				return '/images/wallets/trezor.svg';
			case 'ledger':
				return '/images/wallets/ledger.svg';
			default:
				return '';
		}
	}

	let showConnectModal = $state(false);
	let showDisconnectId = $state<string | null>(null);
	let showWCModal = $state(false);
	let wcQRUri = $state<string | null>(null);
	let expandedWalletId = $state<string | null>(null);

	onDestroy(() => {
		connectorRegistry.clear();
	});

	onMount(async () => {
		await restoreConnectedWalletState();
	});

	function openConnectModal(): void {
		showConnectModal = true;
	}

	function closeConnectModal(): void {
		showConnectModal = false;
	}

	async function handleConnectMetaMask(): Promise<void> {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_METAMASK)) return;
		if (!isMetaMaskAvailable()) {
			setConnectedWalletError('MetaMask not detected. Please install MetaMask to continue.');
			return;
		}
		setConnectingType('metamask');
		closeConnectModal();

		try {
			const { connectMetaMask } = await import('$lib/services/external-wallet/metamask-connector');
			const handle = await connectMetaMask({
				registry: connectorRegistry,
				onEvent: (event) => {
					if (event.type === 'disconnect') {
						// Find and unregister the wallet by address from the store
						const wallets = $connectedWalletsStore.wallets;
						const w = wallets.find((w) => w.walletType === 'metamask');
						if (w) unregisterConnectedWallet(w.id);
					}
				}
			});
			registerConnectedWallet(handle);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to connect MetaMask';
			setConnectedWalletError(message);
		}
	}

	async function handleConnectWC(): Promise<void> {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETCONNECT)) return;
		setConnectingType('walletconnect');
		closeConnectModal();
		showWCModal = true;

		try {
			const { connectWC } = await import('$lib/services/external-wallet/walletconnect-connector');
			const handle = await connectWC({}, (uri: string) => {
				wcQRUri = uri;
			});
			registerConnectedWallet(handle);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'WalletConnect failed';
			setConnectedWalletError(message);
		} finally {
			showWCModal = false;
			wcQRUri = null;
		}
	}

	function handleWCCancel(): void {
		showWCModal = false;
		wcQRUri = null;
		setConnectedWalletError('');
	}

	async function handleConnectTrezor(): Promise<void> {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_TREZOR)) return;
		const info = getPlatformInfo(window.navigator);
		if (!isTrezorAvailable(info)) {
			setConnectedWalletError('Trezor requires a desktop browser or Android with USB OTG.');
			return;
		}
		setConnectingType('trezor');
		closeConnectModal();

		try {
			const { connectTrezor } = await import('$lib/services/external-wallet/trezor-connector');
			const handle = await connectTrezor({
				registry: connectorRegistry,
				navigator: window.navigator
			});
			registerConnectedWallet(handle);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to connect Trezor';
			setConnectedWalletError(message);
		}
	}

	async function handleConnectLedger(): Promise<void> {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_LEDGER)) return;
		const info = getPlatformInfo(window.navigator);
		const transport = getLedgerTransport(info);
		if (transport === 'unavailable') {
			setConnectedWalletError('Ledger requires Bluetooth (mobile) or USB (desktop).');
			return;
		}
		setConnectingType('ledger');
		closeConnectModal();

		try {
			const { connectLedger } = await import('$lib/services/external-wallet/ledger-connector');
			const handle = await connectLedger({
				registry: connectorRegistry,
				navigator: window.navigator
			});
			registerConnectedWallet(handle);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to connect Ledger';
			setConnectedWalletError(message);
		}
	}

	function confirmDisconnect(walletId: string): void {
		showDisconnectId = walletId;
	}

	function handleDisconnect(): void {
		if (showDisconnectId) {
			unregisterConnectedWallet(showDisconnectId);
			showDisconnectId = null;
		}
	}

	function cancelDisconnect(): void {
		showDisconnectId = null;
	}
</script>

{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)}
	<div class="space-y-3">
		{#if $connectedWalletsStore.connectingType}
			<div class="alert alert-outline alert-info py-2 text-sm">
				<span class="loading loading-spinner loading-xs"></span>
				<span
					>{$t('wallet.connected.connecting', {
						values: { type: $connectedWalletsStore.connectingType }
					})}</span
				>
			</div>
		{/if}

		{#if $connectedWalletsStore.error}
			<div class="alert alert-outline alert-error py-2 text-sm">
				<span>{$connectedWalletsStore.error}</span>
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => connectedWalletsStore.update((s) => ({ ...s, error: null }))}
				>
					<IconClose class="h-4 w-4" />
				</button>
			</div>
		{/if}

		{#if $hasConnectedWallets}
			{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
				{@const logo = walletLogo(wallet.walletType)}
				{@const isExpanded = expandedWalletId === wallet.id}
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={isExpanded}
				>
					<button
						type="button"
						class="collapse-title flex min-h-0 items-center gap-2 px-3 py-2 pr-10 text-base font-medium"
						onclick={() => (expandedWalletId = isExpanded ? null : wallet.id)}
					>
						{#if logo}
							<img src={logo} alt={wallet.walletName} class="h-6 w-6 shrink-0" />
						{/if}
						<span>{wallet.walletName}</span>
						<span class="text-base-content/50 ml-auto truncate pr-6 text-sm font-normal">
							{wallet.address.slice(0, 10)}...{wallet.address.slice(-6)}
						</span>
					</button>
					<div class="collapse-content px-2">
						<div class="border-base-300 space-y-2 border-t pt-2">
							<!-- Copy-able address -->
							<button
								type="button"
								class="hover:bg-base-200 flex w-full items-center justify-end gap-2 rounded p-1.5 text-xs transition-colors"
								onclick={() => copyAddress(wallet.address)}
								title="Copy address"
							>
								<span class="truncate text-right font-mono opacity-60">{wallet.address}</span>
								<IconContentCopy
									class="h-4 w-4 shrink-0 {copiedAddress === wallet.address
										? 'text-success'
										: 'opacity-40'}"
								/>
							</button>

							<!-- Balances: by wallet type + available chains -->
							<div class="space-y-1">
								{#if true}
									{@const isHardwareWallet =
										wallet.walletType === 'trezor' || wallet.walletType === 'ledger'}
									{@const isEVM =
										wallet.walletType === 'metamask' ||
										wallet.walletType === 'walletconnect' ||
										isHardwareWallet}

									<!-- Bitcoin L1 — only hardware wallets -->
									{#if isHardwareWallet}
										<div class="flex items-center justify-between text-sm">
											<span class="flex items-center gap-1.5">
												<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4" />
												Bitcoin
											</span>
											<span class="font-semibold"
												>{wallet.balances?.btc?.raw
													? Number(wallet.balances.btc.raw).toLocaleString('en-US')
													: '0'} Sats</span
											>
										</div>
									{/if}

									<!-- rBTC on RSK — all EVM wallets + hardware -->
									{#if isEVM}
										<div class="flex items-center justify-between text-sm">
											<span class="flex items-center gap-1.5">
												<img
													src="/images/chains/Bitcoin-Rootstock-logo.webp"
													alt="rBTC"
													class="h-4 w-4"
												/>
												rBTC
											</span>
											<span class="font-semibold"
												>{wallet.balances?.rbtc?.raw
													? Number(wallet.balances.rbtc.raw).toLocaleString('en-US')
													: '0'} Sats</span
											>
										</div>
									{/if}

									<!-- USDT on BSC — all EVM wallets + hardware -->
									{#if isEVM}
										<div class="flex items-center justify-between text-sm">
											<span class="flex items-center gap-1.5">
												<img src="/images/chains/Binance-logo.svg" alt="USDT" class="h-4 w-4" />
												USDT (BSC)
											</span>
											<span class="font-semibold"
												>{wallet.balances?.usdt?.raw
													? '$' +
														(Number(wallet.balances.usdt.raw) / 1e6).toLocaleString('en-US', {
															minimumFractionDigits: 2,
															maximumFractionDigits: 2
														})
													: '$0.00'}</span
											>
										</div>
									{/if}
								{/if}
							</div>

							<!-- Disconnect button — min 44px, right-aligned -->
							<div class="flex justify-end">
								<button
									class="btn btn-ghost btn-sm text-error min-h-[44px]"
									onclick={() => confirmDisconnect(wallet.id)}
								>
									<IconClose class="mr-1 h-4 w-4" />
									Disconnect
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		{/if}

		<button
			class="btn btn-primary btn-block min-h-[44px] touch-manipulation transition-transform duration-100 select-none active:scale-95"
			style="-webkit-tap-highlight-color: transparent"
			onclick={openConnectModal}
		>
			{'+ ' + $t('wallet.connected.connect')}
		</button>

		<!-- Connect Modal -->
		{#if showConnectModal}
			<dialog
				class="modal modal-open"
				onclick={closeConnectModal}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Escape') closeConnectModal();
				}}
			>
				<div
					class="modal-box max-w-sm"
					onclick={(e: Event) => e.stopPropagation()}
					role="dialog"
					aria-modal="true"
				>
					<h3 class="mb-3 text-lg font-bold">{$t('wallet.connected.connect_modal_title')}</h3>

					<div class="space-y-2">
						{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_METAMASK)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
								onclick={handleConnectMetaMask}
							>
								<img src="/images/wallets/metamask.svg" alt="MetaMask" class="h-8 w-8" />
								<div>
									<div class="font-medium">{$t('wallet.connected.metamask_name')}</div>
									<div class="text-xs opacity-60">{$t('wallet.connected.metamask_desc')}</div>
								</div>
							</button>
						{/if}

						{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETCONNECT)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
								onclick={handleConnectWC}
							>
								<img src="/images/wallets/walletconnect.svg" alt="WalletConnect" class="h-8 w-8" />
								<div>
									<div class="font-medium">{$t('wallet.connected.walletconnect_name')}</div>
									<div class="text-xs opacity-60">{$t('wallet.connected.walletconnect_desc')}</div>
								</div>
							</button>
						{/if}

						{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_TREZOR)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
								onclick={handleConnectTrezor}
							>
								<img src="/images/wallets/trezor.svg" alt="Trezor" class="h-8 w-8" />
								<div>
									<div class="font-medium">Trezor</div>
									<div class="text-xs opacity-60">Hardware wallet</div>
								</div>
							</button>
						{/if}

						{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_LEDGER)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
								onclick={handleConnectLedger}
							>
								<img src="/images/wallets/ledger.svg" alt="Ledger" class="h-8 w-8" />
								<div>
									<div class="font-medium">Ledger</div>
									<div class="text-xs opacity-60">Hardware wallet</div>
								</div>
							</button>
						{/if}
					</div>

					<div class="mt-4">
						<button class="btn btn-ghost btn-sm w-full" onclick={closeConnectModal}
							>{$t('common.cancel')}</button
						>
					</div>
				</div>
				<form method="dialog" class="modal-backdrop">
					<button>close</button>
				</form>
			</dialog>
		{/if}

		<!-- WalletConnect QR Modal -->
		<WalletConnectQRModal isOpen={showWCModal} qrUri={wcQRUri} onCancel={handleWCCancel} />

		<!-- Disconnect Confirmation -->
		{#if showDisconnectId}
			{@const wallet = $connectedWalletsStore.wallets.find((w) => w.id === showDisconnectId)}
			<dialog
				class="modal modal-open"
				onclick={cancelDisconnect}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Escape') cancelDisconnect();
				}}
			>
				<div
					class="modal-box max-w-sm"
					onclick={(e: Event) => e.stopPropagation()}
					role="alertdialog"
					aria-modal="true"
				>
					<h3 class="mb-2 text-lg font-bold">{$t('wallet.connected.disconnect_title')}</h3>
					{#if wallet}
						<p class="mb-2 text-sm opacity-70">
							{wallet.walletName} · {wallet.address.slice(0, 10)}...
						</p>
					{/if}
					<p class="mb-4 text-sm">{$t('wallet.connected.disconnect_msg')}</p>
					<div class="flex justify-end gap-2">
						<button class="btn btn-ghost btn-sm" onclick={cancelDisconnect}
							>{$t('common.cancel')}</button
						>
						<button class="btn btn-error btn-sm" onclick={handleDisconnect}
							>{$t('wallet.connected.remove')}</button
						>
					</div>
				</div>
				<form method="dialog" class="modal-backdrop">
					<button>close</button>
				</form>
			</dialog>
		{/if}
	</div>
{/if}
