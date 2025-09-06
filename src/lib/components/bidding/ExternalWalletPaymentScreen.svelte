<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';

	// Props
	const props = $props<{
		bid: TaskBid;
		taskTitle: string;
		escrowDetails: {
			paymentMethod: 'bitcoin-lightning' | 'lbtc-liquid' | 'usdt-liquid';
			address: string;
			qrCode: string;
		};
		btcPrice: number;
		onPaymentConfirmed: () => void;
		onCancel: () => void;
	}>();

	// State
	let isPaymentConfirmed = $state(false);
	let countdown = $state(5);
	let isCountingDown = $state(false);
	let copied = $state(false);

	// Calculate totals
	let totalFiatPrice = $derived(
		(props.bid.amount / 100000000) * props.btcPrice
	);

	// Get payment method display info
	let paymentInfo = $derived(() => {
		switch (props.escrowDetails.paymentMethod) {
			case 'bitcoin-lightning':
				return {
					name: 'Bitcoin Lightning',
					icon: '/currency-symbols/Bitcoin.svg',
					color: 'from-orange-400 to-orange-600',
					network: 'Lightning Network'
				};
			case 'lbtc-liquid':
				return {
					name: 'L-BTC',
					icon: '/currency-symbols/LBTC.svg',
					color: 'from-cyan-400 to-cyan-600',
					network: 'Liquid Network'
				};
			case 'usdt-liquid':
				return {
					name: 'USDT',
					icon: '/currency-symbols/USDt.svg',
					color: 'from-cyan-400 to-cyan-600',
					network: 'Liquid Network'
				};
			default:
				return {
					name: 'Unknown',
					icon: '/currency-symbols/Bitcoin.svg',
					color: 'from-gray-400 to-gray-600',
					network: 'Unknown Network'
				};
		}
	});

	// Copy address to clipboard
	async function copyAddress() {
		try {
			await navigator.clipboard.writeText(props.escrowDetails.address);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy address:', error);
		}
	}

	// Simulate payment confirmation
	function confirmPayment() {
		isCountingDown = true;
		const interval = setInterval(() => {
			countdown--;
			if (countdown <= 0) {
				clearInterval(interval);
				isPaymentConfirmed = true;
				// Call the success callback after a short delay
				setTimeout(() => {
					props.onPaymentConfirmed();
				}, 500);
			}
		}, 1000);
	}

	onMount(() => {
		// Auto-start countdown after 2 seconds (simulating user making payment)
		setTimeout(() => {
			if (!isPaymentConfirmed) {
				confirmPayment();
			}
		}, 2000);
	});
</script>

<div class="bg-base-100 mx-auto max-h-[80vh] max-w-2xl overflow-y-auto rounded-lg shadow-lg">
	<!-- Header with close button -->
	<div class="bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between border-b p-4 pb-4 sm:p-6">
		<h4 class="font-bold">Complete Payment</h4>
		<button
			type="button"
			class="btn btn-ghost btn-sm btn-circle"
			onclick={props.onCancel}
			aria-label="Close dialog"
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

	<!-- Content with padding -->
	<div class="p-4 sm:p-6">
		<!-- Payment Method Info -->
		<div class="mb-6 flex items-center justify-center">
			<div class="flex items-center gap-3 rounded-lg bg-base-200 p-4">
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br {paymentInfo().color}">
					<img src={paymentInfo().icon} alt={paymentInfo().name} class="h-7 w-7" />
				</div>
				<div class="text-center">
					<h3 class="text-lg font-bold">{paymentInfo().name}</h3>
					<p class="text-sm text-base-content/70">{paymentInfo().network}</p>
				</div>
			</div>
		</div>

		<!-- Payment Amount -->
		<div class="mb-6 text-center">
			<div class="text-3xl font-bold">${totalFiatPrice.toFixed(2)}</div>
			<div class="text-lg text-base-content/70">{formatNumberWithTwoDecimals(props.bid.amount)} sats</div>
		</div>

		<!-- QR Code Section -->
		<div class="mb-6 flex justify-center">
			<div class="rounded-lg bg-white p-4 shadow-lg">
				<img src={props.escrowDetails.qrCode} alt="Payment QR Code" class="h-48 w-48" />
			</div>
		</div>

		<!-- Address Section -->
		<div class="mb-6">
			<label for="payment-address" class="mb-2 block text-sm font-medium">Payment Address</label>
			<div class="flex items-center gap-2 rounded-lg bg-base-200 p-3">
				<span id="payment-address" class="flex-1 break-all text-sm font-mono">{props.escrowDetails.address}</span>
				<button
					class="btn btn-ghost btn-sm {copied ? 'btn-success' : ''}"
					onclick={copyAddress}
					disabled={copied}
				>
					{#if copied}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						Copied!
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
						Copy
					{/if}
				</button>
			</div>
		</div>

		<!-- Task Details -->
		<div class="bg-base-200 mb-6 rounded-lg p-4">
			<h3 class="mb-3 text-lg font-semibold">Task Details</h3>
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">Task:</span>
					<span class="text-sm">{props.taskTitle}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">Bidder:</span>
					<span class="text-sm">
						{props.bid.userProfile?.user?.name ||
							props.bid.userProfile?.professionalTitle ||
							'Anonymous'}
					</span>
				</div>
			</div>
		</div>

		<!-- Payment Status -->
		{#if isCountingDown}
			<div class="mb-6 text-center">
				<div class="mb-2 text-lg font-semibold text-primary">Payment Confirmed!</div>
				<div class="text-sm text-base-content/70">
					Processing transaction... {countdown}s
				</div>
				<div class="mt-2">
					<div class="loading loading-spinner loading-md text-primary"></div>
				</div>
			</div>
		{:else if isPaymentConfirmed}
			<div class="mb-6 text-center">
				<div class="mb-2 text-lg font-semibold text-green-600">Payment Successful!</div>
				<div class="text-sm text-base-content/70">
					Redirecting to confirmation page...
				</div>
			</div>
		{:else}
			<div class="mb-6 text-center">
				<div class="mb-2 text-lg font-semibold">Send Payment</div>
				<div class="text-sm text-base-content/70">
					Scan the QR code or copy the address to complete your payment
				</div>
			</div>
		{/if}

		<!-- Instructions -->
		<div class="bg-info/10 border-info/20 mb-6 rounded-lg border p-4">
			<div class="flex items-start gap-3">
				<svg class="h-5 w-5 text-info mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<div class="text-sm">
					<p class="font-medium text-info mb-1">Payment Instructions:</p>
					<ul class="list-disc list-inside space-y-1 text-base-content/80">
						<li>Send exactly <span class="font-bold">${totalFiatPrice.toFixed(2)}</span> to the address above</li>
						<li>Use the {paymentInfo().network} network for this transaction</li>
						<li>Do not send from an exchange - use a personal wallet</li>
						<li>Your payment will be confirmed automatically</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col justify-end gap-3 border-t p-4 sm:flex-row md:py-2">
		<button 
			type="button" 
			class="btn btn-error" 
			onclick={props.onCancel}
			disabled={isCountingDown || isPaymentConfirmed}
		>
			Cancel
		</button>
		<button 
			type="button" 
			class="btn btn-primary" 
			onclick={confirmPayment}
			disabled={isCountingDown || isPaymentConfirmed}
		>
			{#if isCountingDown}
				<div class="loading loading-spinner loading-sm"></div>
				Processing... {countdown}s
			{:else if isPaymentConfirmed}
				<div class="loading loading-spinner loading-sm"></div>
				Confirmed!
			{:else}
				I've Sent the Payment
			{/if}
		</button>
	</div>
</div>
