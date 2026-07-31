<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import {
		formatSats,
		formatUsd,
		getProvider,
		walletManager,
		transactions
	} from '$lib/stores/wallet.store';
	import {
		mapBoltzModalStatus,
		getSwapEtaSeconds,
		type ModalTxStatus,
		type SwapType
	} from '$lib/utils/wallet/swapStatusMap';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconLoading from '~icons/mdi/loading';
	import IconClose from '~icons/mdi/close';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		amountSats: number;
		amountUSD: number;
		address: string;
		network: string;
		networkOptions: Record<string, { icon: string; name: string; confirmationTime: number }>;
		txHash: string | null;
		swapId?: string | null;
		swapType?: SwapType;
		onClose: () => void;
	}

	let {
		amountSats,
		amountUSD,
		address,
		network,
		networkOptions,
		txHash,
		swapId = null,
		swapType,
		onClose
	}: Props = $props();

	type TransactionStatus = ModalTxStatus;
	let receiptStatus = $state<TransactionStatus | null>(null);
	let receiptError = $state<string | null>(null);
	let elapsed = $state(0);
	let pollingInterval: ReturnType<typeof setInterval> | null = null;
	let countdownInterval: ReturnType<typeof setInterval> | null = null;
	let isPolling = false;
	let pollErrorCount = 0;

	function isEvmTxHash(hash: string | null | undefined): hash is string {
		return !!hash && /^0x[0-9a-fA-F]{64}$/.test(hash);
	}

	// Get network info
	const networkInfo = $derived.by(() => {
		return networkOptions[network as keyof typeof networkOptions];
	});

	// Get explorer URL for address based on network
	function getAddressExplorerUrl(address: string, network: string | null): string | null {
		if (!address || !network) return null;

		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
		const isMainnet = rskNetwork === 'mainnet';

		if (network === 'rootstock-bitcoin' || network === 'rsk') {
			return isMainnet
				? `https://rootstock.blockscout.com/address/${address}`
				: `https://rootstock-testnet.blockscout.com/address/${address}`;
		} else if (network === 'usdt-bsc' || network === 'bsc') {
			return bscNetwork === 'mainnet'
				? `https://bscscan.com/address/${address}`
				: `https://testnet.bscscan.com/address/${address}`;
		} else if (network === 'bitcoin') {
			return isMainnet
				? `https://blockstream.info/address/${address}`
				: `https://blockstream.info/testnet/address/${address}`;
		} else if (network === 'liquid-bitcoin') {
			return isMainnet
				? `https://blockstream.info/liquid/address/${address}`
				: `https://blockstream.info/liquidtestnet/address/${address}`;
		}

		return null;
	}

	const explorerUrl = $derived.by(() => getAddressExplorerUrl(address, network));

	const swapTransaction = $derived.by(() => {
		if (!swapId) return null;
		return $transactions.find((tx) => tx.swap?.id === swapId) ?? null;
	});

	const rawStatus = $derived.by(() => {
		if (swapTransaction?.swap?.rawStatus) return swapTransaction.swap.rawStatus;
		if (!swapId || !swapType) return null;

		const svc =
			swapType === 'submarine'
				? walletManager.submarineSwapService
				: swapType === 'reverse'
					? walletManager.reverseSwapService
					: walletManager.chainSwapService;
		return svc.getSwap(swapId)?.status ?? null;
	});

	const status = $derived.by((): TransactionStatus => {
		if (swapId && swapType) {
			return mapBoltzModalStatus(rawStatus, swapType);
		}
		return receiptStatus ?? 'sending';
	});

	const etaSeed = $derived.by(() => {
		if (swapId && swapType) return getSwapEtaSeconds(rawStatus, swapType);
		return networkInfo?.confirmationTime ?? 60;
	});

	const swapErrorMessage = $derived.by(() => {
		if (!swapId || status !== 'error' || !rawStatus) return null;
		if (rawStatus === 'transaction.claim.failed') {
			return $t('wallet.swap.failed_receive');
		}
		if (rawStatus === 'swap.expired') {
			return $t('wallet.swap.lightning.status.expired');
		}
		if (rawStatus === 'invoice.failedToPay') {
			return $t('wallet.swap.lightning.status.failed');
		}
		return $t('wallet.send.status.error');
	});

	const __errorMessage = $derived.by(() => swapErrorMessage ?? receiptError);

	// Format address (truncate)
	function formatAddress(address: string): string {
		if (address.length <= 20) return address;
		return `${address.slice(0, 10)}...${address.slice(-8)}`;
	}

	// Derived values for UI
	const statusConfig = $derived.by(() => {
		switch (status) {
			case 'sending':
				return {
					color: 'primary',
					bgColor: 'bg-primary/20',
					textColor: 'text-primary',
					title: $t('wallet.send.status.sending')
				};
			case 'confirming':
				return {
					color: 'warning',
					bgColor: 'bg-warning/20',
					textColor: 'text-warning',
					title: $t('wallet.send.status.confirming')
				};
			case 'success':
				return {
					color: 'success',
					bgColor: 'bg-success/20',
					textColor: 'text-success',
					title: $t('wallet.send.status.success')
				};
			case 'error':
				return {
					color: 'error',
					bgColor: 'bg-error/20',
					textColor: 'text-error',
					title: $t('wallet.send.status.error')
				};
			default:
				return {
					color: 'primary',
					bgColor: 'bg-primary/20',
					textColor: 'text-primary',
					title: $t('wallet.send.status.sending')
				};
		}
	});

	const displayTimeRemaining = $derived.by(() => {
		if (status === 'success' || status === 'error') return 0;
		return Math.max(0, Math.ceil(etaSeed - elapsed));
	});

	// Poll for blockchain confirmation (RBTC/BSC direct sends only — swaps use $transactions)
	async function pollForConfirmation() {
		if (swapId || !isEvmTxHash(txHash) || isPolling) return;
		if (receiptStatus === 'success' || receiptStatus === 'error') return;

		isPolling = true;
		try {
			const provider = getProvider(
				network === 'rootstock-bitcoin' || network === 'rsk'
					? 'rsk'
					: network === 'usdt0-arb' || network === 'arbitrum'
						? 'rsk'
						: 'bsc'
			);
			if (!provider) return;

			const receipt = await provider.getTransactionReceipt(txHash);
			pollErrorCount = 0;
			if (receipt && receipt.blockNumber !== null) {
				if (receipt.status === 1) {
					receiptStatus = 'success';
				} else {
					receiptStatus = 'error';
					receiptError = $t('wallet.send.transaction_failed');
				}
				stopPolling();
			} else {
				receiptStatus = 'confirming';
			}
		} catch (error) {
			pollErrorCount += 1;
			if (pollErrorCount >= 3) {
				receiptStatus = 'error';
				receiptError = $t('wallet.send.transaction_failed');
				stopPolling();
			} else if (import.meta.env.DEV) {
				console.warn('[PendingTransactionScreen] Error polling for confirmation:', error);
			}
		} finally {
			isPolling = false;
		}
	}

	function stopPolling() {
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	}

	onMount(() => {
		let lastRawStatus: string | null = rawStatus;

		if (!swapId && isEvmTxHash(txHash)) {
			receiptStatus = 'sending';
			pollForConfirmation();
			pollingInterval = setInterval(pollForConfirmation, 3000);
		} else if (!swapId && txHash && !isEvmTxHash(txHash)) {
			receiptStatus = 'error';
			receiptError = $t('wallet.send.transaction_failed');
		}

		countdownInterval = setInterval(() => {
			const currentRaw = rawStatus;
			if (currentRaw !== lastRawStatus) {
				lastRawStatus = currentRaw;
				elapsed = 0;
			}
			elapsed += 1;
		}, 1000);
	});

	onDestroy(() => {
		stopPolling();
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	});
</script>

<div class="bg-base-100 flex h-full min-h-0 w-full flex-1 flex-col">
	<!-- Pending Transaction Content -->
	<div
		class="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8"
	>
		<!-- Transaction Status -->
		<div class="flex flex-col items-center gap-4" transition:fade={{ duration: 300 }}>
			<div
				class="flex h-24 w-24 items-center justify-center rounded-full transition-all duration-500 sm:h-32 sm:w-32 {statusConfig.bgColor} {statusConfig.textColor}"
				transition:scale={{ duration: 300 }}
			>
				{#if status === 'confirming'}
					<IconLoading class="h-[77px] w-[77px] animate-spin sm:h-[102px] sm:w-[102px]" />
				{:else if status === 'sending'}
					<IconClockOutline class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
				{:else if status === 'success'}
					<IconCheckCircle class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
				{:else if status === 'error'}
					<IconAlertCircle class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
				{/if}
			</div>
			<div class="space-y-2 text-center">
				<h3
					class="text-xl font-bold transition-colors duration-500 sm:text-2xl {statusConfig.textColor}"
				>
					{statusConfig.title}
				</h3>
				{#if displayTimeRemaining !== null && displayTimeRemaining > 0}
					<p class="text-base-content/70 text-xs sm:text-sm">
						{$t('wallet.debug_wallet.send_form.estimated_time_remaining')}
					</p>
					<p class="text-base-content/70 text-sm sm:text-base">
						<span class="font-semibold {statusConfig.textColor} text-2xl sm:text-3xl"
							>{displayTimeRemaining}s</span
						>
					</p>
				{:else if status === 'success'}
					<p class="text-base-content/70 text-xs sm:text-sm">
						{$t('wallet.send.status.confirmed')}
					</p>
				{:else if status === 'error'}
					<p class="text-error text-xs sm:text-sm">
						{__errorMessage || $t('wallet.send.status.error')}
					</p>
				{/if}
			</div>
		</div>

		<!-- Safe to Close Note -->
		{#if status === 'sending' || status === 'confirming'}
			<p class="text-base-content/70 max-w-md text-center text-sm">
				{$t('wallet.send.can_close_safely')}
			</p>
		{/if}

		<!-- Transaction Details Card -->
		<div class="card bg-base-200 w-full max-w-md space-y-4 p-4">
			<!-- Amount Display -->
			<div class="space-y-2">
				<div class="text-sm font-medium opacity-70">{$t('wallet.send.amount')}</div>
				<div class="space-y-1">
					<div class="text-lg font-semibold">
						{formatSats(amountSats)}
						{$t('wallet.sats')}
					</div>
					<div class="text-sm opacity-70">
						≈ {formatUsd(amountUSD)}
					</div>
				</div>
			</div>

			<!-- Network Display -->
			{#if networkInfo}
				<div class="space-y-2">
					<div class="text-sm font-medium opacity-70">{$t('wallet.network')}</div>
					<div class="border-base-300 bg-primary/10 rounded-lg border p-1.5 sm:p-2">
						<div class="flex items-center justify-between gap-1.5 pl-1.5 sm:gap-2 sm:pl-2">
							<div class="flex items-center gap-1.5 sm:gap-2">
								{#if networkInfo.icon}
									<img
										src={networkInfo.icon}
										alt={networkInfo.name}
										class="h-4 w-4 sm:h-5 sm:w-5"
									/>
								{/if}
								<span class="text-sm font-medium sm:text-base">{networkInfo.name}</span>
							</div>
							{#if explorerUrl}
								<a
									href={explorerUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									aria-label={$t('wallet.view_explorer')}
								>
									<IconOpenInNew class="h-4 w-4 sm:h-5 sm:w-5" />
								</a>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Address Display -->
			<div class="space-y-2">
				<div class="text-sm font-medium opacity-70">{$t('wallet.send.address_or_invoice')}</div>
				<div class="font-mono text-sm break-all">{formatAddress(address)}</div>
			</div>
		</div>
	</div>

	<!-- Close Button -->
	<div class="shrink-0 p-4 pt-0">
		<button
			class="btn btn-error min-h-[48px] w-full touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => {
				onClose();
			}}
		>
			<IconClose class="mr-2 h-5 w-5" />
			{$t('common.buttons.close')}
		</button>
	</div>
</div>
