<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';
	import EscrowSuccessScreen from './EscrowSuccessScreen.svelte';
	import ExternalWalletPaymentScreen from './ExternalWalletPaymentScreen.svelte';
	// Props
	const props = $props<{
		bid: TaskBid;
		taskTitle: string;
		onSubmit: (bidId: string, escrowMethod: string, escrowDetails: any) => Promise<void>;
		onCancel: () => void;
		onGoToDashboard?: () => void;
		onCreateNewTask?: () => void;
	}>();

	// Form state
	let isSubmitting = $state(false);
	let validationErrors = $state<Record<string, string>>({});
	let currentScreen = $state<'form' | 'external-payment' | 'success'>('form');
	let escrowDetails = $state<any>(null);

	// Escrow funding state
	let selectedEscrowTab = $state<'bittasker' | 'external'>('bittasker');
	let selectedBitTaskerAsset = $state<'LBTC' | 'USDT'>('LBTC');
	let selectedExternalMethod = $state<'bitcoin-lightning' | 'lbtc-liquid' | 'usdt-liquid'>(
		'bitcoin-lightning'
	);

	// QR codes and addresses
	let qrCodes = $state<Record<string, string>>({});
	let addresses = $state<Record<string, string>>({});
	let btcPrice = $state<number>(63000); // Default fallback price

	// Fee calculations
	let platformFee = $derived(calculatePlatformFee(props.bid.amount, btcPrice));
	let transactionFee = $derived(calculateTransactionFee(props.bid.amount, btcPrice));
	let totalFiatPrice = $derived(
		(props.bid.amount / 100000000) * btcPrice + platformFee + transactionFee
	);

	// Fetch BTC price on mount
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	// Generate sample addresses and QR codes (in real implementation, these would come from the backend)
	async function generateAddressesAndQRCodes() {
		const sampleAddresses = {
			'bitcoin-lightning': 'lnbc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
			'lbtc-liquid': 'VJL8rRKYNNvEYpef4nqEGtTGjpYYTzGcUDGvvTp9tgUNGLRBwUuB',
			'usdt-liquid': 'VJL8rRKYNNvEYpef4nqEGtTGjpYYTzGcUDGvvTp9tgUNGLRBwUuB'
		};

		// Generate QR codes for each address
		for (const [method, address] of Object.entries(sampleAddresses)) {
			try {
				const qrDataUrl = await QRCode.toDataURL(address, {
					width: 200,
					margin: 2,
					color: {
						dark: '#000000',
						light: '#FFFFFF'
					}
				});
				qrCodes[method] = qrDataUrl;
				addresses[method] = address;
			} catch (error) {
				console.error(`Failed to generate QR code for ${method}:`, error);
			}
		}
	}

	// Form validation
	function validateForm() {
		const errors: Record<string, string> = {};

		if (!selectedEscrowTab) {
			errors.escrowMethod = 'Please select an escrow funding method';
		}

		validationErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Handle form submission
	async function handleSubmit() {
		if (!validateForm() || !props.bid.id) {
			return;
		}

		isSubmitting = true;

		try {
			escrowDetails = {
				method: selectedEscrowTab,
				...(selectedEscrowTab === 'bittasker' && {
					asset: selectedBitTaskerAsset
				}),
				...(selectedEscrowTab === 'external' && {
					paymentMethod: selectedExternalMethod,
					address: addresses[selectedExternalMethod],
					qrCode: qrCodes[selectedExternalMethod]
				})
			};

			// For BitTasker wallet, go directly to success screen
			if (selectedEscrowTab === 'bittasker') {
				await props.onSubmit(props.bid.id, selectedEscrowTab, escrowDetails);
				currentScreen = 'success';
			} else {
				// For external wallet, show payment screen
				currentScreen = 'external-payment';
			}
		} catch (error) {
			console.error('Failed to accept bid:', error);
		} finally {
			isSubmitting = false;
		}
	}

	// Handle external payment confirmation
	async function handleExternalPaymentConfirmed() {
		try {
			await props.onSubmit(props.bid.id, selectedEscrowTab, escrowDetails);
			currentScreen = 'success';
		} catch (error) {
			console.error('Failed to confirm external payment:', error);
		}
	}

	// Handle going back to form
	function handleBackToForm() {
		currentScreen = 'form';
	}

	// Handle going to dashboard
	function handleGoToDashboard() {
		if (props.onGoToDashboard) {
			props.onGoToDashboard();
		} else {
			props.onCancel();
		}
	}

	// Handle creating new task
	function handleCreateNewTask() {
		if (props.onCreateNewTask) {
			props.onCreateNewTask();
		} else {
			props.onCancel();
		}
	}

	// Copy address to clipboard
	function copyToClipboard(address: string) {
		navigator.clipboard.writeText(address);
		// You could add a toast notification here
	}

	// Format time to AM/PM
	function formatTimeToAMPM(timeString: string): string {
		if (!timeString) return '9:00 AM';

		try {
			const [hours, minutes] = timeString.split(':').map(Number);
			const date = new Date();
			date.setHours(hours, minutes);

			return date.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
		} catch (error) {
			return timeString; // Return original if parsing fails
		}
	}

	// Calculate platform fee (2.5% of bid amount)
	function calculatePlatformFee(amountSats: number, btcPriceUsd: number): number {
		const amountUsd = (amountSats / 100000000) * btcPriceUsd; // Convert sats to USD
		return amountUsd * 0.025; // 2.5% platform fee
	}

	// Calculate estimated transaction fee (based on current network conditions)
	function calculateTransactionFee(amountSats: number, btcPriceUsd: number): number {
		// Estimate transaction fee as a percentage of the amount
		// This is a simplified calculation - in reality it would depend on network congestion
		const amountUsd = (amountSats / 100000000) * btcPriceUsd; // Convert sats to USD
		return amountUsd * 0.005; // 0.5% estimated transaction fee
	}

	onMount(() => {
		generateAddressesAndQRCodes();
		fetchBtcPrice();
	});
</script>

{#if currentScreen === 'form'}
<div class="bg-base-100 mx-auto max-h-[80vh] max-w-3xl overflow-y-auto rounded-lg shadow-lg">
	<!-- Header with close button -->
	<div
		class="bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between border-b p-4 pb-4 sm:p-6"
	>
		<h4 class="font-bold">Accept Bid & Fund Contract</h4>
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
		<!-- Bid Information Section -->
		<div class="bg-base-200 mb-4 rounded-lg p-3">
			<!-- Mobile: Stacked layout, Desktop: Side by side -->
			<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div class="flex-1">
					<small class="card-title mb-2 line-clamp-2">{props.taskTitle}</small>

					<!-- Bidder Information -->
					<div class="mb-3 flex items-center gap-3">
						<div class="avatar">
							<div class="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full">
								{#if props.bid.userProfile?.user?.profilePictureUrl}
									<img
										src={props.bid.userProfile.user.profilePictureUrl}
										alt="Bidder Avatar"
										class="h-8 w-8 rounded-full object-cover"
									/>
								{:else}
									<div
										class="avatar placeholder text-neutral-content bg-primary flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-center"
									>
										<span class="text-xl font-semibold">
											{(props.bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
										</span>
									</div>
								{/if}
							</div>
						</div>

						<div class="flex flex-col">
							<span class="text-base font-medium">
								{props.bid.userProfile?.user?.name ||
									props.bid.userProfile?.professionalTitle ||
									'Anonymous'}
							</span>
							{#if props.bid.userProfile?.professionalTitle}
								<span class="text-base-content/60 text-sm"
									>{props.bid.userProfile.professionalTitle}</span
								>
							{/if}

							<div class="mt-1 flex items-center">
								{#each Array(5) as _, i}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4 {i < (props.bid.userProfile?.averageRating || 0)
											? 'text-yellow-400'
											: 'text-base-content/30'}"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
										/>
									</svg>
								{/each}
								<span class="text-base-content/60 ml-2 text-sm">
									{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid.userProfile
										?.tasksCompleted || 0} tasks)
								</span>
							</div>
						</div>
					</div>

					<!-- Location -->
					<!-- 	{#if props.bid.task?.pickupLocation?.displayName || props.bid.task?.dropOffLocation?.displayName}
					<div class="mt-4 flex items-center gap-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-base-content/60 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
						<span class="text-sm">
							<strong>Location:</strong>
							{props.bid.task?.pickupLocation?.displayName ||
								props.bid.task?.dropOffLocation?.displayName}
						</span>
					</div>
				{/if} -->

					<!-- Start and End Time -->
					<!-- {#if props.bid.startDate && props.bid.endDate}
					<div class="mt-4 flex flex-col gap-2">
						<div class="flex items-center gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-base-content/60 h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
							<span class="text-sm">
								<strong>Start:</strong>
								{new Date(props.bid.startDate).toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})} at {formatTimeToAMPM(props.bid.startTime || '09:00')}
							</span>
						</div>
						<div class="flex items-center gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-base-content/60 h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
							<span class="text-sm">
								<strong>End:</strong>
								{new Date(props.bid.endDate).toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})} at {formatTimeToAMPM(props.bid.endTime || '17:00')}
							</span>
						</div>
					</div>
				{/if} -->
				</div>

				<!-- Bid Price - Mobile: Full width, Desktop: Right aligned -->
				<div class="w-full lg:flex lg:w-auto lg:justify-end lg:gap-8">
					<!-- Mobile: Single column layout -->
					<div class="lg:hidden">
						<div class="bg-base-100 space-y-3 rounded-lg p-4">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">Bid Price:</span>
								<span class="text-sm font-bold">${satsFromUsd(props.bid.amount, btcPrice)}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">Platform Fee:</span>
								<span class="text-base-content/60 text-sm">${platformFee.toFixed(2)}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">Est. Transaction Fee:</span>
								<span class="text-base-content/60 text-sm">${transactionFee.toFixed(2)}</span>
							</div>
							<div class="border-base-300 border-t pt-3">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium">Total Fiat Price:</span>
									<span class="text-lg font-bold">${totalFiatPrice.toFixed(2)}</span>
								</div>
								<div class="mt-1 flex items-center justify-between">
									<span class="text-sm font-medium">Total Sats Price:</span>
									<span class="text-base-content/60 text-lg font-bold">
										${formatNumberWithTwoDecimals(props.bid.amount)}
									</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Desktop: Two column layout -->
					<div class="hidden lg:flex lg:justify-end lg:gap-8">
						<!-- Left Column - Labels -->
						<div class="flex flex-col items-end space-y-1 text-right">
							<div class="text-sm font-medium">Bid Price:</div>
							<div class="text-sm font-medium">Platform Fee:</div>
							<div class="text-sm font-medium">Est. Transaction Fee:</div>
							<div class="pt-2 text-sm font-medium">Total Fiat Price:</div>
							<div class="text-sm font-medium">Total Sats Price:</div>
						</div>

						<!-- Right Column - Values -->
						<div class="flex flex-col items-end space-y-1 text-right">
							<div class="text-sm">
								${satsFromUsd(props.bid.amount, btcPrice)}
							</div>
							<div class="text-base-content/60 text-xs">
								${platformFee.toFixed(2)}
							</div>
							<div class="text-base-content/60 pb-1 text-xs">
								${transactionFee.toFixed(2)}
							</div>
							<div class="text-md font-bold">
								${totalFiatPrice.toFixed(2)}
							</div>
							<div class="text-base-content/60 text-md font-bold">
								${formatNumberWithTwoDecimals(props.bid.amount)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Escrow Information -->
		<div class="alert alert-info alert-outline my-2 text-sm">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				class="h-5 w-5 shrink-0 stroke-current"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>
				<strong>Note:</strong> You are entering into a contract with the taskee on the blockchain. BitTasker
				is not able to access your funds or alter the contract after this.
			</span>
		</div>

		<!-- Escrow Funding Section -->
		<div class="mb-4">
			<!-- Tab Navigation - Mobile: Full width, Desktop: Auto width -->
			<div class="tabs tabs-bordered mb-3 w-full">
				<button
					role="tab"
					class="tab flex-1 {selectedEscrowTab === 'bittasker' ? 'tab-active' : ''}"
					onclick={() => (selectedEscrowTab = 'bittasker')}
				>
					<span class="hidden sm:inline">My Wallet</span>
					<span class="sm:hidden">My Wallet</span>
				</button>
				<button
					role="tab"
					class="tab flex-1 {selectedEscrowTab === 'external' ? 'tab-active' : ''}"
					onclick={() => (selectedEscrowTab = 'external')}
				>
					<span class="hidden sm:inline">External Wallet</span>
					<span class="sm:hidden">External</span>
				</button>
			</div>

			<!-- BitTasker Wallet Tab -->
			{#if selectedEscrowTab === 'bittasker'}
				<div class="">
					<!-- <p class="text-base-content/70 text-sm mb-4">
					Fund escrow directly from your BitTasker wallet balance.
				</p> -->

					<!-- Mobile: Single column, Desktop: Two columns -->
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<!-- LBTC Option -->
						<button
							class="card bg-base-100 hover:bg-base-200 border-2 transition-colors {selectedBitTaskerAsset ===
							'LBTC'
								? 'border-primary'
								: 'border-base-300'}"
							onclick={() => (selectedBitTaskerAsset = 'LBTC')}
						>
							<div class="card-body p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<img src="/currency-symbols/LBTC.svg" alt="LBTC" class="h-8 w-8" />
										<div class="flex flex-col text-start">
											<span class="text-lg font-semibold">L-BTC</span>
											<span class="text-base-content/60 text-sm">Liquid Bitcoin</span>
										</div>
									</div>
									<div class="flex flex-col items-end">
										<span class="text-lg font-bold">100,000</span>
										<span class="text-base-content/60 text-sm">SATS</span>
									</div>
								</div>
							</div>
						</button>

						<!-- USDT Option -->
						<button
							class="card bg-base-100 hover:bg-base-200 border-2 transition-colors {selectedBitTaskerAsset ===
							'USDT'
								? 'border-primary'
								: 'border-base-300'}"
							onclick={() => (selectedBitTaskerAsset = 'USDT')}
						>
							<div class="card-body p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<img src="/currency-symbols/USDt.svg" alt="USDT" class="h-8 w-8" />
										<div class="flex flex-col text-start">
											<span class="text-lg font-semibold">USDT</span>
											<span class="text-base-content/60 text-sm">Tether USD</span>
										</div>
									</div>
									<div class="flex flex-col items-end">
										<span class="text-lg font-bold">$120.00</span>
										<span class="text-base-content/60 text-sm">USDT</span>
									</div>
								</div>
							</div>
						</button>
					</div>
				</div>
			{/if}

			<!-- External Wallet Tab -->
			{#if selectedEscrowTab === 'external'}
				<div class="">
					<!-- <p class="text-base-content/70 text-sm mb-4">
					Send funds from your external wallet to fund the escrow.
				</p> -->

					<!-- Payment Method Selection - Responsive grid -->
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<!-- Bitcoin Lightning -->
						<button
							class="group bg-base-100 hover:bg-base-200 border relative rounded-4xl p-3 transition-all duration-200 {selectedExternalMethod ===
							'bitcoin-lightning'
								? 'border-primary '
								: 'border-base-300 '}"
							onclick={() => (selectedExternalMethod = 'bitcoin-lightning')}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div class="flex h-10 w-10 items-center justify-center rounded-full">
										<img src="/currency-symbols/Bitcoin.svg" alt="BTC" class="h-6 w-6" />
									</div>
									<div class="flex flex-col text-start">
										<span class="text-base font-bold">BTC</span>
										<span class="text-base-content/70 text-xs">Lightning Network</span>
									</div>
								</div>
								<div class="flex flex-col items-end text-right">
									<span class="text-primary text-xs font-bold">Fast</span>
									<span class="text-base-content/60 text-xs">Payments</span>
								</div>
							</div>
						</button>

						<!-- LBTC on Liquid -->
						<button
							class="group bg-base-100 hover:bg-base-200 border relative rounded-4xl p-3 transition-all duration-200 {selectedExternalMethod ===
							'lbtc-liquid'
								? 'border-primary'
								: 'border-base-300'}"
							onclick={() => (selectedExternalMethod = 'lbtc-liquid')}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div class="flex h-10 w-10 items-center justify-center rounded-full">
										<img src="/currency-symbols/LBTC.svg" alt="LBTC" class="h-6 w-6" />
									</div>
									<div class="flex flex-col text-start">
										<span class="text-base font-bold">L-BTC</span>
										<span class="text-base-content/70 text-xs">Liquid Bitcoin</span>
									</div>
								</div>
								<div class="flex flex-col items-end text-right">
									<span class="text-base-content text-xs font-bold">Private</span>
									<span class="text-base-content/60 text-xs">Confidential</span>
								</div>
							</div>
						</button>

						<!-- USDT on Liquid -->
						<button
							class="group bg-base-100 hover:bg-base-200 border relative rounded-4xl p-3 transition-all duration-200 {selectedExternalMethod ===
							'usdt-liquid'
								? 'border-primary'
								: 'border-base-300'}"
							onclick={() => (selectedExternalMethod = 'usdt-liquid')}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div class="flex h-10 w-10 items-center justify-center rounded-full">
										<img src="/currency-symbols/USDt.svg" alt="USDT" class="h-6 w-6" />
									</div>
									<div class="flex flex-col text-start">
										<span class="text-base font-bold">USDT</span>
										<span class="text-base-content/70 text-xs">Tether USD</span>
									</div>
								</div>
								<div class="flex flex-col items-end text-right">
									<span class="text-base-content text-xs font-bold">Stable</span>
									<span class="text-base-content/60 text-xs"> Pegged</span>
								</div>
							</div>
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Validation Errors -->
		{#if validationErrors.escrowMethod}
			<div class="alert alert-error mb-4">
				<span>{validationErrors.escrowMethod}</span>
			</div>
		{/if}

		<!-- Submit Buttons - Mobile: Stacked, Desktop: Side by side -->
		<div
			class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col justify-end gap-3 py-4 sm:flex-row md:py-2"
		>
			<button type="button" class="btn btn-error" onclick={props.onCancel} disabled={isSubmitting}>
				Cancel
			</button>
			<button type="button" class="btn btn-primary" disabled={isSubmitting} onclick={handleSubmit}>
				<span class="hidden sm:inline"
					>{isSubmitting ? 'Processing...' : 'Accept Bid & Fund Contract'}</span
				>
				<span class="sm:hidden">{isSubmitting ? 'Processing...' : 'Accept & Fund'}</span>
			</button>
		</div>
	</div>
</div>
{/if}

{#if currentScreen === 'external-payment' && escrowDetails}
<ExternalWalletPaymentScreen
	bid={props.bid}
	taskTitle={props.taskTitle}
	escrowDetails={escrowDetails}
	btcPrice={btcPrice}
	onPaymentConfirmed={handleExternalPaymentConfirmed}
	onCancel={handleBackToForm}
/>
{/if}

{#if currentScreen === 'success' && escrowDetails}
<EscrowSuccessScreen
	bid={props.bid}
	taskTitle={props.taskTitle}
	escrowDetails={escrowDetails}
	btcPrice={btcPrice}
	onGoToDashboard={handleGoToDashboard}
	onCreateNewTask={handleCreateNewTask}
/>
{/if}

<style>
	.tab.tab-active {
		position: relative;
	}

	.tab.tab-active::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 2px;
		background-color: orange; /* Match the Tabs.svelte component */
		border-radius: 1px;
	}
</style>
