<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import { darkMode } from '$lib/stores/theme.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	interface Props {
		address: string;
		amount: number; // Amount in sats
		memo?: string;
		network?: string;
		onClose?: () => void;
	}

	const props: Props = $props();

	let qrCodeDataUrl = $state('');
	let addressCopied = $state(false);
	let isLoadingQR = $state(true);
	let btcPrice = $state<number>(0);
	let previousAddress = $state('');

	// Create formatters once to avoid recreating on every call
	const satsFormatter = new Intl.NumberFormat('en-US');
	const usdFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});

	// Format sats with thousand separators
	function formatSats(sats: number): string {
		return satsFormatter.format(sats);
	}

	// Format USD
	function formatUSD(usd: number): string {
		return usdFormatter.format(usd);
	}

	// Build QR data string with EIP-681 URI prefix for RSK/BSC
	function buildQrData(address: string, network?: string, amountSats?: number): string {
		if (network === 'usdt-bsc') {
			return amountSats ? `bsc:${address}?value=${amountSats}` : `bsc:${address}`;
		}
		if (network === 'rootstock-bitcoin') {
			const isMainnet = import.meta.env.VITE_RSK_NETWORK === 'mainnet';
			const chainId = isMainnet ? 30 : 31;
			const base = `rsk:${address}@${chainId}`;
			return amountSats ? `${base}?value=${amountSats}` : base;
		}
		return address;
	}

	// Dark mode state for QR container
	let isDark = $state(false);

	// Fetch BTC price on mount + subscribe to dark mode changes
	onMount(() => {
		isDark = $darkMode;
		cryptoPriceService
			.getCurrentPrice('BTC')
			.then((price) => {
				btcPrice = price;
			})
			.catch((error) => {
				console.error('Failed to fetch BTC price:', error);
			});
	});

	// Generate QR code for a given address
	async function generateQrCode(address: string): Promise<void> {
		if (!address) return;

		isLoadingQR = true;
		try {
			const qrData = buildQrData(
				address,
				props.network,
				props.amount > 0 ? props.amount : undefined
			);
			qrCodeDataUrl = await generateQrCodeUrl(qrData);
			previousAddress = address;
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			appStore.showErrorToast($t('wallet.invoice.qr_generation_failed'));
			qrCodeDataUrl = '';
		} finally {
			isLoadingQR = false;
		}
	}

	const amountInUSD = $derived.by(() => {
		if (btcPrice === 0) return 0;
		return (props.amount / 100_000_000) * btcPrice;
	});

	// Fetch BTC price on mount
	onMount(async () => {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Failed to fetch BTC price:', error);
		}
	});

	// Reactively generate QR code when address changes
	// This is the appropriate use of $effect for async side effects
	$effect(() => {
		// Track the address reactively
		const currentAddress = props.address;

		// Only regenerate if address actually changed
		if (currentAddress && currentAddress !== previousAddress) {
			generateQrCode(currentAddress);
		}
	});

	async function copyAddress() {
		if (props.address) {
			await copyToClipboard(props.address);
			appStore.showSuccessToast($t('wallet.address_copied'));
			addressCopied = true;
			setTimeout(() => {
				addressCopied = false;
			}, 2000);
		}
	}

	async function shareInvoice() {
		if (!props.address) return;

		try {
			// Check if Web Share API is available
			if (navigator.share) {
				await navigator.share({
					title: $t('wallet.invoice.share_title'),
					text: $t('wallet.invoice.share_text', {
						values: {
							amount: formatSats(props.amount),
							address: props.address
						}
					}),
					url: props.address
				});
			} else {
				// Fallback: copy to clipboard
				await copyAddress();
			}
		} catch (error) {
			// User cancelled or error occurred
			if (error instanceof Error && error.name !== 'AbortError') {
				console.error('Failed to share invoice:', error);
				// Fallback to copy
				await copyAddress();
			}
		}
	}
</script>

<div class="invoice-display space-y-6">
	<!-- Header with Close Button -->
	{#if props.onClose}
		<div class="flex items-center justify-between">
			<h3 class="text-xl font-bold">{$t('wallet.invoice.payment_request')}</h3>
			<button
				class="btn btn-ghost btn-sm btn-circle"
				onclick={props.onClose}
				aria-label={$t('common.close')}
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
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	{/if}

	<!-- Very Large QR Code (minimum 300px on mobile, 400px on desktop) -->
	<div class="qr-code-container flex justify-center">
		{#if isLoadingQR}
			<div
				class="bg-base-200 flex h-[300px] w-[300px] items-center justify-center rounded-lg md:h-[400px] md:w-[400px]"
			>
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else if qrCodeDataUrl}
			<div
				class="rounded-lg p-2 shadow-lg"
				class:bg-white={!isDark}
				class:bg-base-100={isDark}
				class:border={isDark}
				class:border-base-300={isDark}
			>
				<div class="w-[300px] md:w-[400px]">
					<img src={qrCodeDataUrl} alt={$t('wallet.invoice.qr_alt')} class="h-full w-full" />
				</div>
			</div>
		{:else}
			<div
				class="bg-base-200 flex h-[300px] w-[300px] items-center justify-center rounded-lg md:h-[400px] md:w-[400px]"
			>
				<div class="text-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-warning mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<p class="text-base-content/70 mt-2 text-sm">
						{$t('wallet.invoice.qr_generation_failed')}
					</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Address Display (copyable) -->
	<div class="address-display">
		<div class="label">
			<span class="label-text font-semibold">{$t('wallet.address')}</span>
		</div>
		<div class="flex items-center gap-2">
			<button
				class="btn btn-outline h-auto min-h-12 flex-1 justify-start p-3 text-left break-all"
				onclick={copyAddress}
				aria-label={$t('wallet.copy_address')}
			>
				<code class="text-xs leading-relaxed break-all whitespace-normal">{props.address}</code>
			</button>
			{#if addressCopied}
				<div class="badge badge-success">{$t('wallet.copied')}</div>
			{:else}
				<button
					class="btn btn-ghost btn-sm btn-circle"
					onclick={copyAddress}
					aria-label={$t('wallet.copy_address')}
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
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- Amount Display -->
	<div class="amount-display">
		<div class="label">
			<span class="label-text font-semibold">{$t('wallet.amount')}</span>
		</div>
		<div class="text-2xl font-bold tabular-nums md:text-3xl">
			{formatSats(props.amount)}
			{$t('wallet.sats')}
		</div>
		{#if btcPrice > 0 && amountInUSD > 0}
			<div class="text-base-content/70 text-lg md:text-xl">
				≈ {formatUSD(amountInUSD)}
			</div>
		{/if}
	</div>

	<!-- Memo (if provided) -->
	{#if props.memo}
		<div class="memo-display">
			<div class="label">
				<span class="label-text font-semibold">{$t('wallet.description')}</span>
			</div>
			<div class="bg-base-200 rounded-lg p-3 text-base">{props.memo}</div>
		</div>
	{/if}

	<!-- Network Display (if provided) -->
	{#if props.network}
		<div class="network-display">
			<div class="label">
				<span class="label-text font-semibold">{$t('wallet.network')}</span>
			</div>
			<div class="badge badge-info badge-lg">{props.network}</div>
		</div>
	{/if}

	<!-- Share Button (mobile) -->
	{#if Capacitor.getPlatform() !== 'web' || !navigator.share}
		<button class="btn btn-outline w-full" onclick={shareInvoice}>
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
					d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
				/>
			</svg>
			{$t('wallet.invoice.share')}
		</button>
	{/if}
</div>
