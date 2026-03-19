<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly, scale } from 'svelte/transition';
	import { Capacitor } from '@capacitor/core';
import { appStore } from '$lib/stores/app.store';
import { walletManager, transactions } from '$lib/stores/wallet.store';
import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
import { btcUsd, marketPriceMeta } from '$lib/stores/market-price.store';
	import { buildDirectPaymentUri } from '$lib/utils/helpers/evmPaymentIntents';
	import IconClose from '~icons/mdi/close';
	import IconCheck from '~icons/mdi/check';
	import IconChevronLeft from '~icons/mdi/chevron-left';
	import AddressAccordion from '$lib/components/wallet/AddressAccordion.svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onEdit?: () => void; // Callback to return to edit screen

		// Pattern 1: Swap-based payment (provide swapId, modal fetches everything)
		swapId?: string;

		// Pattern 2: Direct address payment (provide all details for non-swap payments like Rootstock)
		address?: string;
		network?: string;
		amount?: number;
		memo?: string;
		chargeFeesToPayer?: boolean; // Whether fees are charged to payer
		totalFees?: number; // Total fees in sats (if chargeFeesToPayer is true)
	}

	let {
		isOpen,
		onClose,
		onEdit,
		swapId,
		address: directAddress,
		network: directNetwork,
		amount: directAmount,
		memo,
		chargeFeesToPayer,
		totalFees
	}: Props = $props();

let qrCodeDataUrl = $state('');
let isLoadingQR = $state(true);
	let isTransactionConfirmed = $state(false);
	let directRequestOpenedAt = $state(0);

	// Determine if this is a swap-based payment or direct address payment
const isSwapBased = $derived.by(() => !!swapId);

	// Find the swap transaction from transactions store (reactive via WebSocket updates)
	const swapTransaction = $derived.by(() => {
		if (!swapId) return null;
		return $transactions.find((tx) => tx.swap?.id === swapId);
	});

	// Get swap data from swap services for static data (invoice/address)
	// This doesn't need to be reactive since invoice/address don't change
	const currentSwap = $derived.by(() => {
		if (!swapId) return undefined;

		// Try to find swap in all swap services
		const reverseSwap = walletManager.reverseSwapService?.getSwap(swapId);
		if (reverseSwap) return { data: reverseSwap, type: 'reverse' as const };

		const chainSwap = walletManager.chainSwapService?.getSwap(swapId);
		if (chainSwap) return { data: chainSwap, type: 'chain' as const };

		const submarineSwap = walletManager.submarineSwapService?.getSwap(swapId);
		if (submarineSwap) return { data: submarineSwap, type: 'submarine' as const };

		return undefined;
	});

	// Derive network - from swap type OR from props
	const network = $derived.by(() => {
		if (currentSwap) {
			// Swap-based: derive from swap type
			if (currentSwap.type === 'chain') return 'liquid-bitcoin';
			return 'lightning-bitcoin'; // Both reverse and submarine use Lightning
		}
		// Direct payment: use provided network
		return directNetwork || 'rootstock-bitcoin';
	});

const isBscDirectNetwork = $derived.by(() => network === 'usdt-bsc' || network === 'bsc');

	function getSwapStringValue(swapData: unknown, key: string): string {
		if (typeof swapData !== 'object' || swapData === null) return '';
		const value = (swapData as Record<string, unknown>)[key];
		return typeof value === 'string' ? value : '';
	}

	function getSwapNumberValue(swapData: unknown, key: string): number {
		if (typeof swapData !== 'object' || swapData === null) return 0;
		const value = (swapData as Record<string, unknown>)[key];
		return typeof value === 'number' ? value : 0;
	}

	// Derive address - from swap data OR from props
	const address = $derived.by(() => {
		if (currentSwap) {
			// Swap-based: extract from swap data
			const swapData = currentSwap.data;

			if (currentSwap.type === 'reverse') {
				return getSwapStringValue(swapData, 'invoice');
			} else if (currentSwap.type === 'chain') {
				return getSwapStringValue(swapData, 'liquidUri');
			} else if (currentSwap.type === 'submarine') {
				return getSwapStringValue(swapData, 'invoice');
			}
			return '';
		}
		// Direct payment: use provided address
		return directAddress || '';
	});

	// Derive amount - from swap data OR from props
	const amount = $derived.by(() => {
		if (currentSwap) {
			// Swap-based: extract from swap data
			const swapData = currentSwap.data;

			if (currentSwap.type === 'reverse') {
				return getSwapNumberValue(swapData, 'amount');
			} else if (currentSwap.type === 'chain') {
				return getSwapNumberValue(swapData, 'toAmount');
			} else if (currentSwap.type === 'submarine') {
				return getSwapNumberValue(swapData, 'invoiceAmount');
			}
			return 0;
		}
		// Direct payment: use provided amount
		return directAmount || 0;
	});

	const paymentRequestValue = $derived.by(() => {
		if (currentSwap) {
			return address;
		}

		if ((network === 'rootstock-bitcoin' || isBscDirectNetwork) && directAddress) {
			return buildDirectPaymentUri({
				address: directAddress,
				network: isBscDirectNetwork ? 'usdt-bsc' : network,
				amount,
				memo
			});
		}

		return address;
	});

	const matchingDirectTransaction = $derived.by(() => {
		if (
			!isOpen ||
			isSwapBased ||
			!isBscDirectNetwork ||
			!Number.isFinite(amount) ||
			amount <= 0 ||
			directRequestOpenedAt <= 0
		) {
			return null;
		}

		const targetAmount = Number(amount.toFixed(6));

		return (
			$transactions.find((tx) => {
				if (
					tx.network !== 'bsc' ||
					tx.type !== 'receive' ||
					tx.amountUnit.toUpperCase() !== 'USDT' ||
					tx.status.label !== 'wallet.transaction.status.confirmed'
				) {
					return false;
				}

				const txTimestamp = new Date(tx.timestamp).getTime();
				if (!Number.isFinite(txTimestamp) || txTimestamp < directRequestOpenedAt) {
					return false;
				}

				const txAmount = Number.parseFloat(tx.value);
				if (!Number.isFinite(txAmount)) {
					return false;
				}

				return Number(txAmount.toFixed(6)) === targetAmount;
			}) ?? null
		);
	});

	// Format sats with thousand separators
	function formatSats(sats: number): string {
		return new Intl.NumberFormat('en-US').format(sats);
	}

	// Format USD
	function formatUSD(usd: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(usd);
	}

	// Calculate the total amount the payer will pay
	// For swap-based payments: use the amount from swap
	// For direct payments: include fees if chargeFeesToPayer is true
	const payerTotalAmount = $derived.by(() => {
		if (!isSwapBased && chargeFeesToPayer && totalFees) {
			return amount + totalFees;
		}
		return amount;
	});

	// Get actual received amount - use actualReceivedAmount if available, otherwise fall back to requested amount
	const displayAmount = $derived.by(() => {
		if (!currentSwap) return amount;
		const swapData = currentSwap.data;

		// Only reverse swaps (Lightning) have onchainAmount property
		if (
			currentSwap.type === 'reverse' &&
			'onchainAmount' in swapData &&
			swapData.onchainAmount !== undefined &&
			swapData.onchainAmount !== null &&
			swapData.onchainAmount > 0
		) {
			return swapData.onchainAmount;
		}
		// Fall back to requested amount
		return amount;
	});

	// Calculate USD for the amount the payer will pay (consistent with payerTotalAmount)
	const payerTotalAmountUSD = $derived.by(() => {
		if (isBscDirectNetwork) return payerTotalAmount;
		if ($btcUsd === 0) return 0;
		return (payerTotalAmount / 100_000_000) * $btcUsd;
	});

	const amountInUSD = $derived.by(() => {
		if (isBscDirectNetwork) return displayAmount;
		if ($btcUsd === 0) return 0;
		// Use actual received amount for USD calculation
		return (displayAmount / 100_000_000) * $btcUsd;
	});

	const isBitcoinPriceLoading = $derived.by(() => {
		if (isBscDirectNetwork || $btcUsd > 0) return false;
		return $marketPriceMeta.isRefreshing || (!$marketPriceMeta.error && $marketPriceMeta.lastFetched === 0);
	});

	const showBitcoinPriceUnavailable = $derived.by(
		() => !isBscDirectNetwork && displayAmount > 0 && !isBitcoinPriceLoading && amountInUSD <= 0
	);

	// Access locale to make this reactive to translation changes
	const networkOptions = [
		{
			value: 'lightning-bitcoin',
			label: $t('wallet.receive_form.networks.lightning_bitcoin.label'),
			icon: null
		},
		{
			value: 'rootstock-bitcoin',
			label: $t('wallet.receive_form.networks.rootstock_bitcoin.label'),
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp'
		},
		{
			value: 'liquid-bitcoin',
			label: $t('wallet.receive_form.networks.liquid_bitcoin.label'),
			icon: '/images/chains/Liquid-Bitcoin.svg'
		},
		{
			value: 'bitcoin',
			label: $t('wallet.receive_form.networks.bitcoin.label'),
			icon: '/images/chains/Bitcoin.svg'
		},
		{
			value: 'usdt-bsc',
			label: 'USDT on BSC',
			icon: '/images/chains/Binance-logo.svg'
		},
		{
			value: 'bsc',
			label: 'USDT on BSC',
			icon: '/images/chains/Binance-logo.svg'
		}
	];

	// Get network info matching receive form structure - make reactive to locale changes
	const networkInfo = $derived.by(() => {
		return (
			networkOptions.find((n) => n.value === network) || {
				value: network,
				label: network,
				icon: null
			}
		);
	});

	// Reactive effect: Monitor swap status changes (triggered by SDK's WebSocket updates via transactions store)
	// Only runs for swap-based payments
	$effect(() => {
		if (isOpen) {
			if (directRequestOpenedAt === 0) {
				directRequestOpenedAt = Date.now();
			}
			return;
		}

		directRequestOpenedAt = 0;
		isTransactionConfirmed = false;
	});

	$effect(() => {
		// Only check for completion when modal is open and we have a swap transaction
		if (!isOpen || !isSwapBased || !swapTransaction) return;

		const status = swapTransaction.status.label;

		// Check if swap is completed (confirmed)
		if (status === 'wallet.transaction.status.confirmed') {
			isTransactionConfirmed = true;
			triggerHaptic(ImpactStyle.Medium);
			appStore.showSuccessToast($t('wallet.payment_request.payment_received'));
			walletManager.loadAssets();
		} else if (status === 'wallet.transaction.status.failed') {
			// Swap failed - show error message
			appStore.showErrorToast($t('wallet.swap.swap_failed'));
		}
	});

	$effect(() => {
		if (!isOpen || isSwapBased || !matchingDirectTransaction || isTransactionConfirmed) {
			return;
		}

		isTransactionConfirmed = true;
		triggerHaptic(ImpactStyle.Medium);
		appStore.showSuccessToast($t('wallet.payment_request.payment_received'));
		walletManager.loadAssets();
	});

	// Generate QR code
	async function generateQRCode() {
		if (!paymentRequestValue) {
			isLoadingQR = false; // Clear loading state if no address
			return;
		}

		try {
			isLoadingQR = true;
			qrCodeDataUrl = await generateQrCodeUrl(paymentRequestValue);
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			appStore.showErrorToast($t('wallet.invoice.qr_generation_failed'));
			qrCodeDataUrl = ''; // Clear QR code on error
		} finally {
			isLoadingQR = false;
		}
	}

	$effect(() => {
		if (!isOpen) return;
		void generateQRCode();
	});

	// Check for reduced motion preference
const prefersReducedMotion = $derived.by(() =>
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="bg-base-content/50 fixed inset-0 z-100 backdrop-blur-sm"
		transition:fly={prefersReducedMotion ? undefined : { y: 0, duration: 200 }}
		onclick={onClose}
		role="presentation"
		aria-hidden="true"
	></div>

	<!-- Modal Container - Full screen on mobile/tablet -->
	<div
		class="bg-base-100 pb-safe fixed inset-0 z-101 flex flex-col overflow-y-auto py-1 shadow-2xl lg:inset-x-0 lg:bottom-0 lg:rounded-t-3xl lg:pb-0"
		transition:fly={prefersReducedMotion
			? undefined
			: {
					y: Capacitor.getPlatform() !== 'web' ? 0 : 100,
					duration: 300,
					easing: (t) => 1 - Math.pow(1 - t, 3)
				}}
		role="dialog"
		aria-modal="true"
	>
		<div class="container mx-auto flex min-h-0 flex-1 flex-col px-3 py-1">
			<!-- Scrollable Content Area -->
			<div class="min-h-0 flex-1 overflow-y-auto">
				<!-- Success State -->
				{#if isTransactionConfirmed}
					<div
						class="flex flex-1 flex-col items-center justify-center space-y-4"
						transition:scale={prefersReducedMotion ? undefined : { duration: 300, delay: 100 }}
					>
						<div class="bg-success/20 rounded-full p-6">
							<IconCheck class="text-success h-16 w-16" />
						</div>
						<div class="space-y-2 text-center">
							<h3 class="text-success text-2xl font-bold">
								{$t('wallet.payment_request.payment_received')}
							</h3>
							<p class="text-base-content/70">
								{#if isBscDirectNetwork}
									{displayAmount.toFixed(6).replace(/\.?0+$/, '')} USDT ({formatUSD(amountInUSD)})
								{:else}
									{formatSats(displayAmount)}
									{$t('wallet.sats')}
									{#if amountInUSD > 0}
										({formatUSD(amountInUSD)})
									{:else if showBitcoinPriceUnavailable}
										(Exchange rate unavailable)
									{/if}
								{/if}
							</p>
							<!-- Network Display -->
							<div class="border-base-300 bg-primary/10 mt-4 rounded-lg border p-4">
								<div class="flex items-center gap-2">
									{#if networkInfo.icon}
										<img src={networkInfo.icon} alt={networkInfo.label} class="h-5 w-5" />
									{:else if network === 'lightning-bitcoin'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5 text-yellow-500"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M13 10V3L4 14h7v7l9-11h-7z"
											/>
										</svg>
									{/if}
									<span class="font-medium">{networkInfo.label}</span>
								</div>
							</div>
						</div>
						<button
							class="btn btn-primary w-full touch-manipulation transition-transform duration-100 select-none active:scale-95"
							style="-webkit-tap-highlight-color: transparent;"
							onclick={async () => {
								triggerHaptic(ImpactStyle.Medium);
								// Refresh balance before closing
								await walletManager.loadAssets();
								// Close both modals and return to wallet balance screen
								onClose();
							}}
						>
							{$t('common.done')}
						</button>
					</div>
				{:else}
					<!-- Payment Request Content -->
					<div class="space-y-2">
						<!-- Total Amount Display (Prominent) -->
						{#if network !== 'rootstock-bitcoin'}
							<div
								class="bg-primary/10 border-primary flex flex-col items-center gap-1 rounded-2xl border-2 p-2"
							>
								<div class="flex items-baseline gap-2">
									<span class="text-primary text-3xl font-bold tabular-nums md:text-4xl">
										{isBscDirectNetwork
											? payerTotalAmount.toFixed(6).replace(/\.?0+$/, '')
											: formatSats(payerTotalAmount)}
									</span>
									<span class="text-primary text-xl font-semibold md:text-2xl">
										{isBscDirectNetwork ? 'USDT' : $t('wallet.sats')}
									</span>
								</div>
								{#if payerTotalAmountUSD > 0}
									<div class="text-base-content/70 text-lg font-semibold md:text-xl">
										≈ {formatUSD(payerTotalAmountUSD)}
									</div>
								{:else if !isBscDirectNetwork && payerTotalAmount > 0}
									<div class="text-base-content/60 text-sm md:text-base">
										{isBitcoinPriceLoading
											? 'Loading price...'
											: 'Exchange rate unavailable'}
									</div>
								{/if}
							</div>
						{/if}

						<!-- Network Display - Show icon, translated name, and status indicator -->
						<div class="bg-base-200 flex items-center justify-between gap-3 rounded-lg p-2">
							<div class="flex items-center gap-3">
								{#if networkInfo.icon}
									<img src={networkInfo.icon} alt={networkInfo.label} class="h-6 w-6" />
								{:else if network === 'lightning-bitcoin'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-6 w-6 text-yellow-500"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
								{/if}
								<span class="text-base font-medium">{networkInfo.label}</span>
							</div>
							<!-- Status Indicator (only show for swap-based payments) -->
							<!-- {#if isSwapBased && swapStatus && !isTransactionConfirmed}
					{@const IconComponent = swapStatus.icon}
					<div class="flex items-center gap-2">
						{#if swapStatus.label === 'wallet.transaction.status.pending'}
							<span class="loading loading-spinner loading-sm"></span>
						{/if}
									<span
										class="badge"
							class:badge-warning={swapStatus.label === 'wallet.transaction.status.pending'}
							class:badge-success={swapStatus.label === 'wallet.transaction.status.confirmed'}
										class:badge-error={swapStatus.label === 'wallet.transaction.status.failed'}
									>
							<IconComponent class="mr-1 h-4 w-4" />
							{$t(swapStatus.label)}
						</span>
					</div>
				{/if} -->
						</div>

						<!-- Invoice Total (Rootstock only, above QR code) -->
						{#if (network === 'rootstock-bitcoin' || isBscDirectNetwork) && payerTotalAmount > 0}
							<div
								class="border-primary bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 sm:p-4"
							>
								<span class="text-center text-xs opacity-70"
									>{$t('wallet.receive.invoice_total')}</span
								>
								<div class="flex w-full items-center justify-center gap-1.5">
									<span class="text-primary text-xl font-bold">
										{#if isBscDirectNetwork}
											{payerTotalAmount.toFixed(6).replace(/\.?0+$/, '')} USDT
										{:else}
											{formatSats(payerTotalAmount)}
											{$t('wallet.sats')}
										{/if}
									</span>
									{#if payerTotalAmountUSD > 0}
										<span class="text-xs opacity-60">≈ {formatUSD(payerTotalAmountUSD)}</span>
									{:else if !isBscDirectNetwork}
										<span class="text-xs opacity-60">
											{isBitcoinPriceLoading
												? 'Loading price...'
												: 'Exchange rate unavailable'}
										</span>
									{/if}
								</div>
							</div>
						{/if}

						<!-- QR Code (Almost Full Screen Width) -->
						<div class="flex justify-center px-2">
							{#if isLoadingQR}
								<div
									class="bg-base-200 flex h-[calc(100vw-4rem)] max-h-[500px] w-[calc(100vw-4rem)] max-w-[500px] items-center justify-center rounded-lg"
								>
									<span class="loading loading-spinner loading-lg"></span>
								</div>
							{:else if qrCodeDataUrl}
								<div class="rounded-lg bg-white p-2 shadow-lg">
									<div class="w-[calc(100vw-4rem)] max-w-[500px]">
										<img src={qrCodeDataUrl} alt="Payment QR Code" class="h-full w-full" />
									</div>
								</div>
							{:else}
								<div
									class="bg-base-200 flex h-[calc(100vw-4rem)] max-h-[500px] w-[calc(100vw-4rem)] max-w-[500px] items-center justify-center rounded-lg"
								>
									<div class="text-base-content/70 text-center">
										{$t('wallet.invoice.qr_generation_failed')}
									</div>
								</div>
							{/if}
						</div>

						<!-- Payment Address/Link (Copyable) - One line with expand/collapse -->
						<AddressAccordion address={paymentRequestValue} />

						{#if !isSwapBased && (network === 'rootstock-bitcoin' || isBscDirectNetwork)}
							<div class="bg-warning/10 border-warning/40 rounded-lg border p-3 text-sm">
								Only send {networkInfo.label} to this payment request.
							</div>
						{/if}

						<!-- Transaction Description (if provided) -->
						{#if memo}
							<div class="space-y-1">
								<div class="label">
									<span class="label-text text-xs font-semibold">{$t('wallet.description')}</span>
								</div>
								<div class="bg-base-200 rounded-lg p-1 text-base">{memo}</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Fixed Action Buttons at Bottom -->
			<div
				class="bg-base-100 sticky bottom-0 z-10 mt-auto flex shrink-0 gap-2 pt-2 pb-1 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:gap-3 sm:py-1 md:static md:py-0 md:shadow-none"
			>
				{#if !isTransactionConfirmed}
					<!-- Back Button (show if onEdit callback exists) -->
					{#if onEdit}
						<button
							class="btn btn-outline min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px] md:min-h-[56px]"
							style="-webkit-tap-highlight-color: transparent;"
							onclick={() => {
								triggerHaptic(ImpactStyle.Light);
								onEdit?.();
							}}
						>
							<IconChevronLeft class="h-4 w-4 sm:h-5 sm:w-5" />
							<span class="text-sm sm:text-base">{$t('common.back')}</span>
						</button>
					{/if}
					<!-- Cancel Button -->
					<button
						class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px] md:min-h-[56px]"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							triggerHaptic(ImpactStyle.Light);
							onClose();
						}}
					>
						<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
						<span class="text-sm sm:text-base">{$t('common.close')}</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
