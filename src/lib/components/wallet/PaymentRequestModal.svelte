<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager, transactions } from '$lib/stores/wallet.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import IconClose from '~icons/mdi/close';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconCheck from '~icons/mdi/check';
	import IconPencil from '~icons/mdi/pencil';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconChevronUp from '~icons/mdi/chevron-up';

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

	const props: Props = $props();

	let qrCodeDataUrl = $state('');
	let addressCopied = $state(false);
	let isLoadingQR = $state(true);
	let btcPrice = $state<number>(0);
	let isTransactionConfirmed = $state(false);
	let addressExpanded = $state(false); // Track if address is expanded to show full address
	
	// Determine if this is a swap-based payment or direct address payment
	const isSwapBased = $derived(!!props.swapId);
	
	// Find the swap transaction from transactions store (reactive via WebSocket updates)
	const swapTransaction = $derived.by(() => {
		if (!props.swapId) return null;
		return $transactions.find(tx => tx.swap?.id === props.swapId);
	});
	
	// Get status from transaction (reactive and UI-ready with label, icon, color)
	const swapStatus = $derived.by(() => {
		if (!swapTransaction) return null;
		return swapTransaction.status;
	});
	
	// Get swap data from swap services for static data (invoice/address)
	// This doesn't need to be reactive since invoice/address don't change
	const currentSwap = $derived.by(() => {
		if (!props.swapId) return undefined;
		
		// Try to find swap in all swap services
		const reverseSwap = walletManager.reverseSwapService?.getSwap(props.swapId);
		if (reverseSwap) return { data: reverseSwap, type: 'reverse' as const };
		
		const chainSwap = walletManager.chainSwapService?.getSwap(props.swapId);
		if (chainSwap) return { data: chainSwap, type: 'chain' as const };
		
		const submarineSwap = walletManager.submarineSwapService?.getSwap(props.swapId);
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
		return props.network || 'rootstock-bitcoin';
	});
	
	// Derive address - from swap data OR from props
	const address = $derived.by(() => {
		if (currentSwap) {
			// Swap-based: extract from swap data
			const swapData = currentSwap.data;
			
			if (currentSwap.type === 'reverse') {
				return (swapData as any).invoice || '';
			} else if (currentSwap.type === 'chain') {
				return (swapData as any).liquidUri || '';
			} else if (currentSwap.type === 'submarine') {
				return (swapData as any).invoice || '';
			}
			return '';
		}
		// Direct payment: use provided address
		return props.address || '';
	});
	
	// Derive amount - from swap data OR from props
	const amount = $derived.by(() => {
		if (currentSwap) {
			// Swap-based: extract from swap data
			const swapData = currentSwap.data;
			
			if (currentSwap.type === 'reverse') {
				return (swapData as any).amount || 0;
			} else if (currentSwap.type === 'chain') {
				return (swapData as any).toAmount || 0;
			} else if (currentSwap.type === 'submarine') {
				return (swapData as any).invoiceAmount || 0;
			}
			return 0;
		}
		// Direct payment: use provided amount
		return props.amount || 0;
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
		if (!isSwapBased && props.chargeFeesToPayer && props.totalFees) {
			return amount + props.totalFees;
		}
		return amount;
	});

	// Get actual received amount - use actualReceivedAmount if available, otherwise fall back to requested amount
	const displayAmount = $derived.by(() => {
		if (!currentSwap) return amount;
		const swapData = currentSwap.data;
		
		// Only reverse swaps (Lightning) have onchainAmount property
		if (currentSwap.type === 'reverse' && 'onchainAmount' in swapData && swapData.onchainAmount !== undefined && swapData.onchainAmount !== null && swapData.onchainAmount > 0) {
			return swapData.onchainAmount;
		}
		// Fall back to requested amount
		return amount;
	});

	const amountInUSD = $derived.by(() => {
		if (btcPrice === 0) return 0;
		// Use actual received amount for USD calculation
		return (displayAmount / 100_000_000) * btcPrice;
	});

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
			label: 'BSC USDT', // TODO: Add translation
			icon: null
		},
		{
			value: 'bsc',
			label: 'BSC', // TODO: Add translation
			icon: null
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

	// Format address (truncate for display)
	function formatAddress(address: string): string {
		if (address.length <= 20) return address;
		return `${address.slice(0, 10)}...${address.slice(-8)}`;
	}

	// Reactive effect: Monitor swap status changes (triggered by SDK's WebSocket updates via transactions store)
	// Only runs for swap-based payments
	$effect(() => {
		// Only check for completion when modal is open and we have a swap transaction
		if (!props.isOpen || !isSwapBased || !swapTransaction) return;
		
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

	// Generate QR code
	async function generateQRCode() {
		if (!address) {
			isLoadingQR = false; // Clear loading state if no address
			return;
		}

		try {
			isLoadingQR = true;
			qrCodeDataUrl = await generateQrCodeUrl(address);
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			appStore.showErrorToast($t('wallet.invoice.qr_generation_failed'));
			qrCodeDataUrl = ''; // Clear QR code on error
		} finally {
			isLoadingQR = false;
		}
	}

	async function copyAddress() {
		if (address) {
			await copyToClipboard(address);
			appStore.showSuccessToast($t('wallet.address_copied'));
			addressCopied = true;
			triggerHaptic(ImpactStyle.Light);
			setTimeout(() => {
				addressCopied = false;
			}, 2000);
		}
	}

	// Initialize component
	onMount(async () => {
		// Fetch BTC price and generate QR code in parallel
		await Promise.allSettled([
			cryptoPriceService.getCurrentPrice('BTC').then((price) => {
				btcPrice = price;
			}),
			generateQRCode()
		]);
	});

	// Check for reduced motion preference
	const prefersReducedMotion = $derived(
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
</script>

{#if props.isOpen}
	<!-- Backdrop -->
	<div
		class="bg-base-content/50 fixed inset-0 z-100 backdrop-blur-sm"
		transition:fly={prefersReducedMotion ? undefined : { y: 0, duration: 200 }}
		onclick={props.onClose}
		role="presentation"
		aria-hidden="true"
	></div>

	<!-- Modal Container - Full screen on mobile/tablet -->
	<div
		class="bg-base-100 fixed inset-0 z-101 flex flex-col overflow-y-auto pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:inset-x-0 lg:bottom-0 lg:rounded-t-3xl"
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
		<div class="container mx-auto flex flex-1 flex-col px-3 py-1">
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
								{formatSats(displayAmount)}
								{$t('wallet.sats')} ({formatUSD(amountInUSD)})
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
								props.onClose();
							}}
						>
							{$t('common.done')}
						</button>
					</div>
				{:else}
					<!-- Payment Request Content -->
					<div class="space-y-3">
						<!-- Total Amount Display (Prominent) -->
						<div
							class="bg-primary/10 border-primary flex flex-col items-center gap-1 rounded-2xl border-2 p-2"
						>
							<div class="flex items-baseline gap-2">
								<span class="text-primary text-4xl font-bold tabular-nums md:text-5xl">
									{formatSats(payerTotalAmount)}
								</span>
								<span class="text-primary text-xl font-semibold md:text-2xl"
									>{$t('wallet.sats')}</span
								>
							</div>
							{#if btcPrice > 0 && amountInUSD > 0}
								<div class="text-base-content/70 text-lg font-semibold md:text-xl">
									≈ {formatUSD(amountInUSD)}
								</div>
							{/if}
						</div>

						<!-- Network Display - Show icon, translated name, and status indicator -->
						<div class="bg-base-200 flex items-center justify-between gap-3 rounded-lg p-3">
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
				{#if isSwapBased && swapStatus && !isTransactionConfirmed}
					{@const IconComponent = swapStatus.icon}
					<div class="flex items-center gap-2">
						<!-- Only show spinner when actually pending -->
						{#if swapStatus.label === 'wallet.transaction.status.pending'}
							<span class="loading loading-spinner loading-sm"></span>
						{/if}
						<!-- Dynamic status badge with proper colors -->
						<span class="badge" 
							class:badge-warning={swapStatus.label === 'wallet.transaction.status.pending'}
							class:badge-success={swapStatus.label === 'wallet.transaction.status.confirmed'}
							class:badge-error={swapStatus.label === 'wallet.transaction.status.failed'}>
							<IconComponent class="mr-1 h-4 w-4" />
							{$t(swapStatus.label)}
						</span>
					</div>
				{/if}
				</div>

						<!-- QR Code (Almost Full Screen Width) -->
						<div class="flex justify-center px-2">
							{#if isLoadingQR}
								<div
									class="bg-base-200 flex h-[calc(100vw-4rem)] max-h-[500px] w-[calc(100vw-4rem)] max-w-[500px] items-center justify-center rounded-lg"
								>
									<span class="loading loading-spinner loading-lg"></span>
								</div>
							{:else if qrCodeDataUrl}
								<div class="rounded-lg bg-white p-3 shadow-lg">
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
						<div class="border-primary bg-base-100 rounded-lg border-2">
							<!-- One-line address display -->
							<div class="flex items-center gap-2 p-2">
								<!-- Copy icon on the left -->
								<button
									class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									onclick={copyAddress}
									aria-label={$t('wallet.copy_address')}
								>
									{#if addressCopied}
										<IconCheck class="text-success h-5 w-5" />
									{:else}
										<IconContentCopy class="h-5 w-5" />
									{/if}
								</button>

								<!-- Compressed address in the middle -->
								<button
									class="min-w-0 flex-1 touch-manipulation text-left transition-transform duration-100 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									onclick={copyAddress}
									aria-label={$t('wallet.copy_address')}
								>
									<code class="block truncate font-mono text-xs">
										{addressExpanded ? address : formatAddress(address)}
									</code>
								</button>

								<!-- Dropdown button on the right -->
								<button
									class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									onclick={() => {
										triggerHaptic(ImpactStyle.Light);
										addressExpanded = !addressExpanded;
									}}
									aria-label={addressExpanded ? 'Collapse address' : 'Expand address'}
								>
									{#if addressExpanded}
										<IconChevronUp class="h-5 w-5" />
									{:else}
										<IconChevronDown class="h-5 w-5" />
									{/if}
								</button>
							</div>

							<!-- Expanded full address (shown when expanded) -->
							{#if addressExpanded}
								<div class="border-primary/20 border-t px-2 pb-2">
									<code class="block pt-2 font-mono text-xs break-all whitespace-normal">
										{address}
									</code>
								</div>
							{/if}
						</div>

						<!-- Transaction Description (if provided) -->
						{#if props.memo}
							<div class="space-y-1">
								<div class="label">
									<span class="label-text text-xs font-semibold">{$t('wallet.description')}</span>
								</div>
								<div class="bg-base-200 rounded-lg p-1 text-base">{props.memo}</div>
							</div>
						{/if}

						<!-- Cancel and Edit Buttons -->
						<div class="flex gap-3">
							<button
								class="btn btn-error flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95"
								style="-webkit-tap-highlight-color: transparent;"
								onclick={() => {
									triggerHaptic(ImpactStyle.Light);
									props.onClose();
								}}
							>
								<IconClose class="h-5 w-5" />
								{$t('wallet.receive.cancel')}
							</button>
							{#if props.onEdit}
								<button
									class="btn btn-primary flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									onclick={() => {
										triggerHaptic(ImpactStyle.Medium);
										props.onEdit?.();
									}}
								>
									<IconPencil class="h-5 w-5" />
									{$t('common.edit')}
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
	</div>
{/if}
