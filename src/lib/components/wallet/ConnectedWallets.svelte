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
	import { onMount } from 'svelte';
	import IconClose from '~icons/mdi/close';
	import type { ethers as EthersType } from 'ethers';

	let showConnectModal = $state(false);
	let showDisconnectId = $state<string | null>(null);

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
			type EthEventCb = (...args: unknown[]) => void;
		const ethereum = (window as { ethereum?: { isMetaMask?: boolean; request(args: { method: string }): Promise<string[]>; on(event: string, cb: EthEventCb): void; removeListener(event: string, cb: EthEventCb): void; chainId?: string } }).ethereum;
			if (!ethereum) throw new Error('MetaMask not available');

			const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
			const address = accounts[0];
			if (!address) throw new Error('No account selected');

			const chainIdHex = ethereum.chainId || '0x1e';
			const chainId = parseInt(chainIdHex, 16);

			const ethersModule = await import('ethers');
			const provider = new ethersModule.BrowserProvider(ethereum as unknown as import('ethers').Eip1193Provider);
			const signer = await provider.getSigner();

			const connectorId = `metamask-${address.toLowerCase()}`;
			if (connectorRegistry.has(connectorId)) {
				setConnectedWalletError('MetaMask is already connected');
				return;
			}

			const handle = {
				id: connectorId,
				walletName: 'MetaMask',
				walletType: 'metamask' as const,
				address: address.toLowerCase(),
				chainIds: [chainId],
				provider: provider as unknown as EthersType.Provider,
				evmSigner: {
					type: 'evm' as const,
					label: 'MetaMask',
					address: address.toLowerCase(),
					chainId,
					getAddress(): string { return address.toLowerCase(); },
					isConnected(): boolean { return true; },
					async sendTransaction(tx: import('$lib/services/external-wallet/types').EVMTransactionRequest): Promise<import('$lib/services/external-wallet/types').EVMTransactionResult> {
						const txParams: Record<string, unknown> = {
							from: address.toLowerCase(),
							to: tx.to
						};
						if (tx.value !== undefined) txParams.value = '0x' + tx.value.toString(16);
						if (tx.data) txParams.data = tx.data;
						const txHash = await signer.sendTransaction(txParams as unknown as EthersType.TransactionRequest) as unknown as string;
						return { txHash: typeof txHash === 'string' ? txHash : (txHash as { hash: string }).hash, from: address.toLowerCase(), chainId: tx.chainId };
					}
				},
				onEvent() {},
				unsubscribe() {}
			};

			// Wire up MetaMask events
			const accountsChangedCb: EthEventCb = (accts: unknown) => {
				const arr = accts as string[];
				if (arr.length === 0) {
					unregisterConnectedWallet(connectorId);
				}
			};
			ethereum.on('accountsChanged', accountsChangedCb);
			const disconnectCb: EthEventCb = () => unregisterConnectedWallet(connectorId);
			ethereum.on('disconnect', disconnectCb);

			handle.unsubscribe = () => {
				ethereum.removeListener('accountsChanged', accountsChangedCb);
				ethereum.removeListener('disconnect', disconnectCb);
			};

			registerConnectedWallet(handle);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to connect MetaMask';
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
				<span>Connecting {$connectedWalletsStore.connectingType}...</span>
			</div>
		{/if}

		{#if $connectedWalletsStore.error}
			<div class="alert alert-outline alert-error py-2 text-sm">
				<span>{$connectedWalletsStore.error}</span>
				<button class="btn btn-ghost btn-xs" onclick={() => (connectedWalletsStore.update((s) => ({ ...s, error: null })))}>
					<IconClose class="h-4 w-4" />
				</button>
			</div>
		{/if}

		{#if $hasConnectedWallets}
			{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
				<div class="border-primary bg-base-100 rounded-lg border-2 p-3">
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-2 min-w-0">
							<span class="text-lg">
								{#if wallet.walletType === 'metamask'}🦊
								{:else if wallet.walletType === 'walletconnect'}📱
								{:else if wallet.walletType === 'trezor'}🔐
								{:else}🔒
								{/if}
							</span>
							<div class="min-w-0">
								<div class="text-sm font-medium">{wallet.walletName}</div>
								<div class="text-xs opacity-60 truncate">{wallet.address}</div>
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

		<button
			class="btn btn-ghost btn-sm w-full"
			onclick={openConnectModal}
		>
			{'+ ' + $t('wallet.connected.connect')}
		</button>

		<!-- Connect Modal -->
		{#if showConnectModal}
			<dialog class="modal modal-open" onclick={closeConnectModal}>
				<div class="modal-box max-w-sm" onclick={(e: Event) => e.stopPropagation()} role="dialog" aria-modal="true">
					<h3 class="text-lg font-bold mb-3">Connect a Wallet</h3>

					<div class="space-y-2">
						{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_METAMASK)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
								onclick={handleConnectMetaMask}
							>
								<span class="text-xl">🦊</span>
								<div>
									<div class="font-medium">MetaMask</div>
									<div class="text-xs opacity-60">Browser extension wallet</div>
								</div>
							</button>
						{/if}

						{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETCONNECT)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
								disabled
							>
								<span class="text-xl">📱</span>
								<div>
									<div class="font-medium">WalletConnect</div>
									<div class="text-xs opacity-60">Coming soon</div>
								</div>
							</button>
						{/if}
					</div>

					<div class="mt-4">
						<button class="btn btn-ghost btn-sm w-full" onclick={closeConnectModal}>Cancel</button>
					</div>
				</div>
				<form method="dialog" class="modal-backdrop">
					<button>close</button>
				</form>
			</dialog>
		{/if}

		<!-- Disconnect Confirmation -->
		{#if showDisconnectId}
			{@const wallet = $connectedWalletsStore.wallets.find((w) => w.id === showDisconnectId)}
			<dialog class="modal modal-open" onclick={cancelDisconnect}>
				<div class="modal-box max-w-sm" onclick={(e: Event) => e.stopPropagation()} role="alertdialog" aria-modal="true">
					<h3 class="text-lg font-bold mb-2">Disconnect?</h3>
					{#if wallet}
						<p class="text-sm opacity-70 mb-2">{wallet.walletName} · {wallet.address.slice(0, 10)}...</p>
					{/if}
					<p class="text-sm mb-4">Funds remain safe in your wallet.</p>
					<div class="flex justify-end gap-2">
						<button class="btn btn-ghost btn-sm" onclick={cancelDisconnect}>Cancel</button>
						<button class="btn btn-error btn-sm" onclick={handleDisconnect}>Remove</button>
					</div>
				</div>
				<form method="dialog" class="modal-backdrop">
					<button>close</button>
				</form>
			</dialog>
		{/if}
	</div>
{/if}
