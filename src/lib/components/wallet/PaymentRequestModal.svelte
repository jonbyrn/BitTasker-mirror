<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore, walletManager, getProvider } from '$lib/stores/wallet.store';
	import { user } from '$lib/stores/user.store';
	import { profileStore } from '$lib/stores/profile.store';
	import { getUserDisplayName } from '$lib/utils/helpers/userDisplayName';
	import { loadNamespace, isI18nLoading } from '$lib/i18n/i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import { locale, isLoading } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { ethers } from 'ethers';
	import IconClose from '~icons/mdi/close';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconCheck from '~icons/mdi/check';
	import IconExternalLink from '~icons/mdi/open-in-new';
	import IconPencil from '~icons/mdi/pencil';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconChevronUp from '~icons/mdi/chevron-up';

	interface Props {
		isOpen: boolean;
		amount: number; // Amount in sats (receiver's requested amount)
		network: string;
		memo?: string;
		address: string; // Payment address/invoice
		swapId?: string; // For Lightning swaps, monitor by swap ID
		chargeFeesToPayer?: boolean; // Whether fees are charged to payer
		totalFees?: number; // Total fees in sats (if chargeFeesToPayer is true)
		onClose: () => void;
		onEdit?: () => void; // Callback to return to edit screen
	}

	const props = $props();

	let qrCodeDataUrl = $state('');
	let addressCopied = $state(false);
	let isLoadingQR = $state(true);
	let btcPrice = $state<number>(0);
	let isTransactionConfirmed = $state(false);
	let confirmationCount = $state(0);
	let monitoringInterval: ReturnType<typeof setInterval> | null = null;
	let swapStatus = $state<string | null>(null);
	let addressExpanded = $state(false); // Track if address is expanded to show full address

	// Get user display name - make reactive to locale changes
	// Prioritize username from database over name, and include profileStore data
	const userName = $derived.by(() => {
		// Access locale to make this reactive to translation changes
		const currentLocale = $locale;
		const displayName = getUserDisplayName(
			{
				username: $user.username,
				name: $profileStore.data?.name || $user.name
			},
			'' // Empty fallback - Avatar will show initials if name is empty
		);
		// If still empty, use npub as fallback
		if (!displayName && $user.npub) {
			return `${$user.npub.slice(0, 8)}...${$user.npub.slice(-4)}`;
		}
		return displayName || $t('wallet.payment_request.you');
	});

	// Get user picture with priority: pictures array > user.picture > profileStore.data.picture
	const userPicture = $derived.by(() => {
		// First priority: first image from pictures array
		if ($profileStore.data?.pictures && $profileStore.data.pictures.length > 0) {
			return $profileStore.data.pictures[0].url;
		}
		// Second priority: user store picture
		if ($user.picture) {
			return $user.picture;
		}
		// Third priority: profile store picture
		if ($profileStore.data?.picture) {
			return $profileStore.data.picture;
		}
		return undefined;
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

	// Calculate the total amount the payer will pay (including fees if chargeFeesToPayer is true)
	const payerTotalAmount = $derived.by(() => {
		if (props.chargeFeesToPayer && props.totalFees) {
			return props.amount + props.totalFees;
		}
		return props.amount;
	});

	const amountInUSD = $derived.by(() => {
		if (btcPrice === 0) return 0;
		// Use payer's total amount (including fees) for USD calculation
		return (payerTotalAmount / 100_000_000) * btcPrice;
	});

	// Get network info matching receive form structure - make reactive to locale changes
	const networkInfo = $derived.by(() => {
		// Access locale to make this reactive to translation changes
		const currentLocale = $locale;
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
		return networkOptions.find((n) => n.value === props.network) || {
			value: props.network,
			label: props.network,
			icon: null
		};
	});

	// Get explorer URL based on network
	const explorerUrl = $derived.by(() => {
		// For Lightning, we can't show explorer link
		if (props.network === 'lightning-bitcoin') {
			return null;
		}

		// For swaps, we might have a transaction hash later
		// For now, return null and update when transaction is detected
		return null;
	});

	// Format address (truncate for display)
	function formatAddress(address: string): string {
		if (address.length <= 20) return address;
		return `${address.slice(0, 10)}...${address.slice(-8)}`;
	}

	// Monitor transaction/swap status
	async function monitorTransaction() {
		if (monitoringInterval) return; // Already monitoring

		monitoringInterval = setInterval(async () => {
			try {
				// For Lightning reverse swaps, monitor swap status
				if (props.network === 'lightning-bitcoin' && props.swapId) {
					const swap = walletManager.reverseSwapService?.getSwap(props.swapId);
					if (swap) {
						swapStatus = swap.status;

						// Check if swap is settled/claimed
						if (
							['invoice.settled', 'claimed'].includes(swap.status) ||
							swap.claimTxHash
						) {
							isTransactionConfirmed = true;
							if (monitoringInterval) {
								clearInterval(monitoringInterval);
								monitoringInterval = null;
							}
							triggerHaptic(ImpactStyle.Medium);
							appStore.showSuccessToast($t('wallet.payment_request.payment_received'));
							await walletManager.loadAssets();
						} else if (['swap.expired', 'transaction.failed'].includes(swap.status)) {
							// Swap failed or expired
							if (monitoringInterval) {
								clearInterval(monitoringInterval);
								monitoringInterval = null;
							}
						}
					}
				} else if (props.network === 'rootstock-bitcoin' || props.network === 'rsk') {
					// For RSK, we'd need a transaction hash to monitor
					// This would be set when we detect an incoming transaction
					// For now, we can't monitor without a tx hash
				} else if (props.network === 'usdt-bsc' || props.network === 'bsc') {
					// For BSC, same as RSK - need tx hash
				}
			} catch (error) {
				console.error('Error monitoring transaction:', error);
				// Continue monitoring on error
			}
		}, 5000); // Poll every 5 seconds
	}

	// Generate QR code
	async function generateQRCode() {
		if (!props.address) return;

		try {
			isLoadingQR = true;
			qrCodeDataUrl = await generateQrCodeUrl(props.address);
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			appStore.showErrorToast($t('wallet.invoice.qr_generation_failed'));
		} finally {
			isLoadingQR = false;
		}
	}

	async function copyAddress() {
		if (props.address) {
			await copyToClipboard(props.address);
			appStore.showSuccessToast($t('wallet.address_copied'));
			addressCopied = true;
			triggerHaptic(ImpactStyle.Light);
			setTimeout(() => {
				addressCopied = false;
			}, 2000);
		}
	}

	async function shareInvoice() {
		if (!props.address) return;

		try {
			if (navigator.share) {
				await navigator.share({
					title: $t('wallet.payment_request.share_title'),
					text: $t('wallet.payment_request.share_text', {
						values: {
							amount: formatSats(payerTotalAmount),
							name: userName
						}
					}),
					url: props.address
				});
				triggerHaptic(ImpactStyle.Light);
			} else {
				// Fallback: copy to clipboard
				await copyAddress();
			}
		} catch (error) {
			// User cancelled or error occurred
			if (error instanceof Error && error.name !== 'AbortError') {
				console.error('Failed to share invoice:', error);
				await copyAddress();
			}
		}
	}

	// Track if translations are loaded
	let translationsLoaded = $state(false);

	// Check if translations are ready (reactive to i18n state)
	const isTranslationsReady = $derived.by(() => {
		return !get(isLoading) && !get(isI18nLoading) && translationsLoaded;
	});

	// Initialize component
	onMount(async () => {
		if (props.isOpen) {
			// Initialize user data if needed
			try {
				await user.getUserData();
			} catch (error) {
				console.error('[PaymentRequestModal] Failed to load user data:', error);
			}
			
			// Initialize profile store if needed
			try {
				if (!$profileStore.data) {
					profileStore.init();
				}
			} catch (error) {
				console.error('[PaymentRequestModal] Failed to initialize profile store:', error);
			}
			
			// Pre-load translations
			try {
				const currentLocale = get(locale) as 'en' | 'es' || 'en';
				await loadNamespace(currentLocale, 'dashboard/wallet');
				translationsLoaded = true;
			} catch (error) {
				console.error('[PaymentRequestModal] Failed to load wallet translations:', error);
				translationsLoaded = true; // Allow rendering even if load fails
			}

			// Fetch BTC price
			try {
				btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			} catch (error) {
				console.error('Failed to fetch BTC price:', error);
			}

			// Generate QR code
			await generateQRCode();

			// Start monitoring transaction
			monitorTransaction();
		}
	});

	// Also load translations when modal opens
	$effect(() => {
		if (props.isOpen && !translationsLoaded) {
			(async () => {
				try {
					const currentLocale = get(locale) as 'en' | 'es' || 'en';
					await loadNamespace(currentLocale, 'dashboard/wallet');
					translationsLoaded = true;
				} catch (error) {
					console.error('[PaymentRequestModal] Failed to load translations in effect:', error);
					translationsLoaded = true;
				}
			})();
		}
	});

	// Watch for isOpen changes
	$effect(() => {
		if (props.isOpen) {
			generateQRCode();
			monitorTransaction();
		} else {
			// Clean up monitoring when modal closes
			if (monitoringInterval) {
				clearInterval(monitoringInterval);
				monitoringInterval = null;
			}
		}
	});

	onDestroy(() => {
		if (monitoringInterval) {
			clearInterval(monitoringInterval);
			monitoringInterval = null;
		}
	});

	// Check for reduced motion preference
	const prefersReducedMotion = $derived(
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
	const isMobile = $derived(Capacitor.getPlatform() !== 'web');
</script>

{#if props.isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-base-content/50 backdrop-blur-sm z-[100]"
		transition:fly={prefersReducedMotion ? undefined : { y: 0, duration: 200 }}
		onclick={props.onClose}
		role="presentation"
		aria-hidden="true"
	></div>

	<!-- Modal Container - Full screen on mobile/tablet -->
	<div
		class="fixed inset-0 lg:inset-x-0 lg:bottom-0 lg:rounded-t-3xl z-[101] bg-base-100 shadow-2xl overflow-y-auto pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
		transition:fly={prefersReducedMotion ? undefined : { y: isMobile ? 0 : 100, duration: 300, easing: (t) => 1 - Math.pow(1 - t, 3) }}
		role="dialog"
		aria-modal="true"
	>
		{#if !isTranslationsReady}
			<div class="flex items-center justify-center h-full">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else}
		<div class="container mx-auto px-3 py-1 space-y-2">

			<!-- Success State -->
			{#if isTransactionConfirmed}
				<div
					class="flex flex-col items-center justify-center space-y-4 py-8"
					transition:scale={prefersReducedMotion ? undefined : { duration: 300, delay: 100 }}
				>
					<div class="rounded-full bg-success/20 p-6">
						<IconCheck class="w-16 h-16 text-success" />
					</div>
					<div class="text-center space-y-2">
						<h3 class="text-2xl font-bold text-success">
							{$t('wallet.payment_request.payment_received')}
						</h3>
						<p class="text-base-content/70">
							{formatSats(payerTotalAmount)} {$t('wallet.sats')} ({formatUSD(amountInUSD)})
						</p>
					</div>
					<button
						class="btn btn-primary w-full touch-manipulation select-none active:scale-95 transition-transform duration-100"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							triggerHaptic(ImpactStyle.Medium);
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
					<div class="flex flex-col items-center gap-1 p-2 bg-primary/10 rounded-2xl border-2 border-primary">
						<div class="flex items-baseline gap-2">
							<span class="text-4xl md:text-5xl font-bold text-primary tabular-nums">
								{formatSats(payerTotalAmount)}
							</span>
							<span class="text-xl md:text-2xl font-semibold text-primary">{$t('wallet.sats')}</span>
						</div>
						{#if btcPrice > 0 && amountInUSD > 0}
							<div class="text-lg md:text-xl text-base-content/70 font-semibold">
								≈ {formatUSD(amountInUSD)}
							</div>
						{/if}
					</div>

					<!-- Network Display - Show icon, translated name, and status indicator -->
					<div class="flex items-center justify-between gap-3 p-3 bg-base-200 rounded-lg">
						<div class="flex items-center gap-3">
							{#if networkInfo.icon}
								<img src={networkInfo.icon} alt={networkInfo.label} class="h-6 w-6" />
							{:else if props.network === 'lightning-bitcoin'}
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
						<!-- Status Indicator (only show when pending) -->
						{#if !isTransactionConfirmed}
							<div class="flex items-center gap-2">
								<span class="loading loading-spinner loading-sm"></span>
								<span class="badge badge-warning text-primary-content">{$t('wallet.transaction.status.pending')}</span>
							</div>
						{/if}
					</div>

					<!-- QR Code (Almost Full Screen Width) -->
					<div class="flex justify-center px-2">
						{#if isLoadingQR}
							<div
								class="flex h-[calc(100vw-4rem)] w-[calc(100vw-4rem)] max-h-[500px] max-w-[500px] items-center justify-center rounded-lg bg-base-200"
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
								class="flex h-[calc(100vw-4rem)] w-[calc(100vw-4rem)] max-h-[500px] max-w-[500px] items-center justify-center rounded-lg bg-base-200"
							>
								<div class="text-center text-base-content/70">
									{$t('wallet.invoice.qr_generation_failed')}
								</div>
							</div>
						{/if}
					</div>

					<!-- Payment Address/Link (Copyable) - One line with expand/collapse -->
					<div class="border-2 border-primary rounded-lg bg-base-100">
						<!-- One-line address display -->
						<div class="flex items-center gap-2 p-2">
							<!-- Copy icon on the left -->
							<button
								class="btn btn-ghost btn-sm btn-circle touch-manipulation select-none active:scale-95 transition-transform duration-100 flex-shrink-0"
								style="-webkit-tap-highlight-color: transparent;"
								onclick={copyAddress}
								aria-label={$t('wallet.copy_address')}
							>
								{#if addressCopied}
									<IconCheck class="w-5 h-5 text-success" />
								{:else}
									<IconContentCopy class="w-5 h-5" />
								{/if}
							</button>
							
							<!-- Compressed address in the middle -->
							<button
								class="flex-1 text-left min-w-0 touch-manipulation select-none active:scale-95 transition-transform duration-100"
								style="-webkit-tap-highlight-color: transparent;"
								onclick={copyAddress}
								aria-label={$t('wallet.copy_address')}
							>
								<code class="text-xs font-mono truncate block">
									{addressExpanded ? props.address : formatAddress(props.address)}
								</code>
							</button>
							
							<!-- Dropdown button on the right -->
							<button
								class="btn btn-ghost btn-sm btn-circle touch-manipulation select-none active:scale-95 transition-transform duration-100 flex-shrink-0"
								style="-webkit-tap-highlight-color: transparent;"
								onclick={() => {
									triggerHaptic(ImpactStyle.Light);
									addressExpanded = !addressExpanded;
								}}
								aria-label={addressExpanded ? 'Collapse address' : 'Expand address'}
							>
								{#if addressExpanded}
									<IconChevronUp class="w-5 h-5" />
								{:else}
									<IconChevronDown class="w-5 h-5" />
								{/if}
							</button>
						</div>
						
						<!-- Expanded full address (shown when expanded) -->
						{#if addressExpanded}
							<div class="px-2 pb-2 border-t border-primary/20">
								<code class="text-xs font-mono break-all whitespace-normal block pt-2">
									{props.address}
								</code>
							</div>
						{/if}
					</div>

					<!-- Transaction Description (if provided) -->
					{#if props.memo}
						<div class="space-y-1">
							<label class="label">
								<span class="label-text font-semibold text-xs">{$t('wallet.description')}</span>
							</label>
							<div class="text-base rounded-lg bg-base-200 p-1">{props.memo}</div>
						</div>
					{/if}

					<!-- Cancel and Edit Buttons -->
					<div class="flex gap-3">
						<button
							class="btn btn-error flex-1 touch-manipulation select-none active:scale-95 transition-transform duration-100"
							style="-webkit-tap-highlight-color: transparent;"
							onclick={() => {
								triggerHaptic(ImpactStyle.Light);
								props.onClose();
							}}
						>
							<IconClose class="w-5 h-5" />
							{$t('wallet.receive.cancel')}
						</button>
						{#if props.onEdit}
							<button
								class="btn btn-primary flex-1 touch-manipulation select-none active:scale-95 transition-transform duration-100"
								style="-webkit-tap-highlight-color: transparent;"
								onclick={() => {
									triggerHaptic(ImpactStyle.Medium);
									props.onEdit?.();
								}}
							>
								<IconPencil class="w-5 h-5" />
								{$t('common.edit')}
							</button>
						{/if}
					</div>
				</div>
			{/if}
			</div>
		{/if}
	</div>
{/if}

