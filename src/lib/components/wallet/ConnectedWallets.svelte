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
	import { isMetaMaskAvailable } from '$lib/services/external-wallet/platform-checks';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import { onMount, onDestroy } from 'svelte';
	import IconClose from '~icons/mdi/close';
	import IconCellphoneLink from '~icons/mdi/cellphone-link';
	import IconWallet from '~icons/mdi/wallet';
	import IconUsbFlashDrive from '~icons/mdi/usb-flash-drive';
	import IconLock from '~icons/mdi/lock';
	import WalletConnectQRModal from './WalletConnectQRModal.svelte';

	let showConnectModal = $state(false);
	let showDisconnectId = $state<string | null>(null);
	let showWCModal = $state(false);
	let wcQRUri = $state<string | null>(null);

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
			const handle = await connectMetaMask({ registry: connectorRegistry, onEvent: () => {} });
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
				<div class="border-primary bg-base-100 rounded-lg border-2 p-3">
					<div class="flex items-center justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2">
							<span class="text-lg">
								{#if wallet.walletType === 'metamask'}<IconWallet class="h-5 w-5 text-orange-500" />
								{:else if wallet.walletType === 'walletconnect'}<IconCellphoneLink
										class="h-5 w-5 text-blue-500"
									/>
								{:else if wallet.walletType === 'trezor'}<IconUsbFlashDrive class="h-5 w-5" />
								{:else}<IconLock class="h-5 w-5" />
								{/if}
							</span>
							<div class="min-w-0">
								<div class="text-sm font-medium">{wallet.walletName}</div>
								<div class="truncate text-xs opacity-60">{wallet.address}</div>
							</div>
						</div>
						<button
							class="btn btn-ghost btn-sm text-error"
							onclick={() => confirmDisconnect(wallet.id)}
						>
							<IconClose class="h-4 w-4" />
						</button>
					</div>
				</div>
			{/each}
		{/if}

		<button class="btn btn-ghost btn-sm w-full" onclick={openConnectModal}>
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
								<IconWallet class="h-5 w-5 text-orange-500" />
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
								<IconCellphoneLink class="h-5 w-5" />
								<div>
									<div class="font-medium">{$t('wallet.connected.walletconnect_name')}</div>
									<div class="text-xs opacity-60">{$t('wallet.connected.walletconnect_desc')}</div>
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
