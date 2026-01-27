<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager } from '$lib/stores/wallet.store';
	import { getProvider } from '$lib/stores/wallet.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { scale } from 'svelte/transition';

	interface Props {
		txHash: string;
		network: string;
		amount: number; // Amount in sats
		recipient: string;
		onClose: () => void;
		onViewDetails?: () => void;
	}

	const props = $props();

	let isConfirmed = $state(false);
	let confirmationCount = $state(0);
	let monitoringInterval: ReturnType<typeof setInterval> | null = null;

	// Get explorer URL based on network
	const explorerUrl = $derived.by(() => {
		if (!props.txHash) return null;

		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
		// Use RSK network setting as the general indicator for mainnet/testnet mode
		// This is consistent with how the app determines network mode
		const isMainnet = rskNetwork === 'mainnet';

		if (props.network === 'rootstock-bitcoin' || props.network === 'rsk') {
			return isMainnet
				? `https://rootstock.blockscout.com/tx/${props.txHash}`
				: `https://rootstock-testnet.blockscout.com/tx/${props.txHash}`;
		} else if (props.network === 'usdt-bsc' || props.network === 'bsc') {
			return bscNetwork === 'mainnet'
				? `https://bscscan.com/tx/${props.txHash}`
				: `https://testnet.bscscan.com/tx/${props.txHash}`;
		} else if (props.network === 'bitcoin') {
			// Bitcoin explorer - supports testnet
			return isMainnet
				? `https://blockstream.info/tx/${props.txHash}`
				: `https://blockstream.info/testnet/tx/${props.txHash}`;
		} else if (props.network === 'liquid-bitcoin') {
			// Liquid explorer - supports testnet
			return isMainnet
				? `https://blockstream.info/liquid/tx/${props.txHash}`
				: `https://blockstream.info/liquidtestnet/tx/${props.txHash}`;
		} else if (props.network === 'lightning-bitcoin') {
			// Lightning doesn't have traditional explorer, but we can show invoice details
			return null;
		}

		return null;
	});

	// Format sats
	function formatSats(sats: number): string {
		return new Intl.NumberFormat('en-US').format(sats);
	}

	// Format address (truncate)
	function formatAddress(address: string): string {
		if (address.length <= 20) return address;
		return `${address.slice(0, 10)}...${address.slice(-8)}`;
	}

	// Monitor transaction confirmation
	async function monitorTransaction() {
		if (monitoringInterval) return; // Already monitoring

		monitoringInterval = setInterval(async () => {
			// Stop polling if already confirmed
			if (isConfirmed) {
				if (monitoringInterval) {
					clearInterval(monitoringInterval);
					monitoringInterval = null;
				}
				return;
			}

			try {
				// For RSK transactions, check receipt
				if (props.network === 'rootstock-bitcoin' || props.network === 'rsk') {
					const provider = getProvider('rsk');
					if (provider) {
						const receipt = await provider.getTransactionReceipt(props.txHash);
						if (receipt) {
							const receiptStatus = receipt.status === 1;
							
							// Check for transaction failure
							if (receipt.status === 0) {
								// Transaction failed - stop monitoring
								if (monitoringInterval) {
									clearInterval(monitoringInterval);
									monitoringInterval = null;
								}
								// Keep isConfirmed as false to show error state
								return;
							}
							
							if (receiptStatus) {
								// Get confirmation count by checking current block
								const currentBlock = await provider.getBlockNumber();
								confirmationCount = receipt.blockNumber ? currentBlock - receipt.blockNumber + 1 : 0;

								// Stop monitoring after confirmation
								if (confirmationCount >= 1) {
									isConfirmed = true;
									if (monitoringInterval) {
										clearInterval(monitoringInterval);
										monitoringInterval = null;
									}
									triggerHaptic(ImpactStyle.Medium);
									appStore.showSuccessToast($t('wallet.send.transaction_confirmed'));
									// Reload assets to update balance
									await walletManager.loadAssets();
								}
							}
						}
					}
				} else if (props.network === 'usdt-bsc' || props.network === 'bsc') {
					// For BSC transactions
					const provider = getProvider('bsc');
					if (provider) {
						const receipt = await provider.getTransactionReceipt(props.txHash);
						if (receipt) {
							const receiptStatus = receipt.status === 1;
							
							// Check for transaction failure
							if (receipt.status === 0) {
								// Transaction failed - stop monitoring
								if (monitoringInterval) {
									clearInterval(monitoringInterval);
									monitoringInterval = null;
								}
								// Keep isConfirmed as false to show error state
								return;
							}
							
							if (receiptStatus) {
								const currentBlock = await provider.getBlockNumber();
								confirmationCount = receipt.blockNumber ? currentBlock - receipt.blockNumber + 1 : 0;

								if (confirmationCount >= 1) {
									isConfirmed = true;
									if (monitoringInterval) {
										clearInterval(monitoringInterval);
										monitoringInterval = null;
									}
									triggerHaptic(ImpactStyle.Medium);
									appStore.showSuccessToast($t('wallet.send.transaction_confirmed'));
									await walletManager.loadAssets();
								}
							}
						}
					}
				} else if (props.network === 'lightning-bitcoin') {
					// For Lightning, check swap status if it's a swap
					// This would need to be implemented based on swap ID if available
					// For now, assume success if we have a txHash
					isConfirmed = true;
					if (monitoringInterval) {
						clearInterval(monitoringInterval);
						monitoringInterval = null;
					}
				}
			} catch (error) {
				console.error('Error monitoring transaction:', error);
				// Continue monitoring on error
			}
		}, 5000); // Poll every 5 seconds
	}

	onMount(() => {
		// Trigger success haptic
		triggerHaptic(ImpactStyle.Medium);
		// Start monitoring transaction
		monitorTransaction();
	});

	onDestroy(() => {
		if (monitoringInterval) {
			clearInterval(monitoringInterval);
			monitoringInterval = null;
		}
	});

	function handleViewExplorer() {
		if (explorerUrl) {
			window.open(explorerUrl, '_blank', 'noopener,noreferrer');
		}
	}

	function handleCopyTxHash() {
		if (props.txHash) {
			navigator.clipboard.writeText(props.txHash);
			appStore.showSuccessToast($t('wallet.transaction.hash_copied'));
		}
	}
</script>

<div class="transaction-success-screen flex flex-col items-center justify-center space-y-6 p-6">
	<!-- Success Icon with Animation -->
	<div
		class="success-icon-container"
		transition:scale={{ duration: 300, delay: 100 }}
		style="animation: successPulse 0.6s ease-out;"
	>
		<div class="rounded-full bg-success/20 p-6">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-24 w-24 text-success"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		</div>
	</div>

	<!-- Success Message -->
	<div class="text-center space-y-2">
		<h2 class="text-2xl md:text-3xl font-bold">{$t('wallet.send.success.payment_sent')}</h2>
		<p class="text-base-content/70">
			{formatSats(props.amount)} {$t('wallet.sats')} {$t('wallet.send.success.sent_to')}
		</p>
		<p class="text-sm font-mono text-base-content/60">{formatAddress(props.recipient)}</p>
	</div>

	<!-- Transaction Details Card -->
	<div class="card bg-base-200 w-full max-w-md p-4 space-y-3">
		<div class="flex items-center justify-between">
			<span class="text-sm text-base-content/70">{$t('wallet.send.success.transaction_hash')}:</span>
			<div class="flex items-center gap-2">
				<code class="text-xs font-mono break-all">{formatAddress(props.txHash)}</code>
				<button
					class="btn btn-ghost btn-xs btn-circle"
					onclick={handleCopyTxHash}
					aria-label={$t('wallet.copy')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
				</button>
			</div>
		</div>

		<div class="flex items-center justify-between">
			<span class="text-sm text-base-content/70">{$t('wallet.network')}:</span>
			<span class="badge badge-info">{props.network}</span>
		</div>

		{#if isConfirmed}
			<div class="flex items-center justify-between">
				<span class="text-sm text-base-content/70">{$t('wallet.transaction.status')}:</span>
				<span class="badge badge-success">{$t('wallet.transaction.status.confirmed')}</span>
			</div>
			{#if confirmationCount > 0}
				<div class="flex items-center justify-between">
					<span class="text-sm text-base-content/70">{$t('wallet.transaction.status.confirmations')}:</span>
					<span class="text-sm font-semibold">{confirmationCount}</span>
				</div>
			{/if}
		{:else}
			<div class="flex items-center justify-between">
				<span class="text-sm text-base-content/70">{$t('wallet.transaction.status')}:</span>
				<div class="flex items-center gap-2">
					<span class="loading loading-spinner loading-sm"></span>
					<span class="badge badge-warning">{$t('wallet.transaction.status.pending')}</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Action Buttons -->
	<div class="flex flex-col gap-3 w-full max-w-md">
		{#if explorerUrl}
			<button
				class="btn btn-outline btn-lg w-full touch-manipulation select-none active:scale-95 transition-transform duration-100"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					handleViewExplorer();
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
					/>
				</svg>
				{$t('wallet.send.success.view_on_explorer')}
			</button>
		{/if}

		<button
			class="btn btn-primary btn-lg w-full touch-manipulation select-none active:scale-95 transition-transform duration-100"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => {
				triggerHaptic(ImpactStyle.Light);
				props.onClose();
			}}
		>
			{$t('common.done')}
		</button>
	</div>
</div>

<style>
	@keyframes successPulse {
		0% {
			transform: scale(0);
			opacity: 0;
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>

