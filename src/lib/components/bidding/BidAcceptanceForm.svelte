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

	// Fee calculations - Fixed calculations
	let bidAmountUsd = $derived((props.bid.amount / 100000000) * btcPrice);
	let platformFeeUsd = $derived(bidAmountUsd * 0.025); // 2.5% platform fee
	let transactionFeeUsd = $derived(bidAmountUsd * 0.005); // 0.5% transaction fee
	let totalFiatPrice = $derived(bidAmountUsd + platformFeeUsd + transactionFeeUsd);

	// Convert USD amounts back to sats for display
	let platformFeeSats = $derived(Math.round((platformFeeUsd / btcPrice) * 100000000));
	let transactionFeeSats = $derived(Math.round((transactionFeeUsd / btcPrice) * 100000000));
	let totalSatsPrice = $derived(props.bid.amount + platformFeeSats + transactionFeeSats);

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

	onMount(() => {
		generateAddressesAndQRCodes();
		fetchBtcPrice();
	});
</script>

{#if currentScreen === 'form'}
	<div class="bg-base-100 mx-auto max-h-[80vh] max-w-3xl overflow-y-auto rounded-lg shadow-lg">
		<!-- Header with close button -->
		<div
			class="border-b bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between p-4 pb-4 sm:p-6"
		>
			<h4 class="line-clamp-2 font-bold">Accept Bid & Fund Contract</h4>		
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
		<div class="p-4">
			<!-- Desktop: 2 column layout -->
			<div class="hidden rounded-2xl bg-base-200 lg:flex lg:gap-4">
				<!-- Left Column: Bidder Information -->
				<div class="flex-1">
					<div class="rounded-lg p-3">
						<h5 class="mb-3 line-clamp-1 text-sm font-semibold">{props.taskTitle}</h5>

						<!-- Bidder Profile -->
						<div class="flex items-center gap-3">
							<div class="avatar">
								<div class="bg-base-100 flex h-10 w-10 items-center justify-center rounded-full">
									{#if props.bid.userProfile?.user?.profilePictureUrl}
										<img
											src={props.bid.userProfile.user.profilePictureUrl}
											alt="Bidder Avatar"
											class="h-10 w-10 rounded-full object-cover"
										/>
									{:else}
										<div
											class="avatar placeholder text-neutral-content bg-primary flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-center"
										>
											<span class="text-lg font-semibold">
												{(props.bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
											</span>
										</div>
									{/if}
								</div>
							</div>

							<div class="flex flex-col">
								<span class="text-sm font-medium">
									{props.bid.userProfile?.user?.name ||
										props.bid.userProfile?.professionalTitle ||
										'Anonymous'}
								</span>

								<div class="mt-1 flex items-center">
									{#each Array(5) as _, i}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3 {i < (props.bid.userProfile?.averageRating || 0)
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
									<span class="text-base-content/60 ml-1 text-xs">
										{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid.userProfile
											?.tasksCompleted || 0} tasks)
									</span>
								</div>

								<p class="text-base-content/60 mt-1 text-sm">
									Member since
									{new Date(props.bid.createdAt).toLocaleDateString('en-US', {
										month: '2-digit',
										year: 'numeric'
									})}
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Right Column: Pricing -->
				<div class="flex-1">
					<div class="rounded-lg p-3">
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<span class="text-xs font-medium">Bid Price</span>
								<span class="text-xs font-bold"
									>${formatNumberWithTwoDecimals(props.bid.amount)}
								</span>
							</div>

							<div class="flex items-center justify-between">
								<span class="text-xs font-medium">Platform Fee</span>
								<span class="text-xs font-bold">${platformFeeUsd.toFixed(2)}</span>
							</div>

							<div class="flex items-center justify-between">
								<span class="text-xs font-medium">Est. Transaction Fee</span>
								<span class="text-xs font-bold">${transactionFeeUsd.toFixed(2)}</span>
							</div>

							<div class="border-base-200 border-t pt-2">
								<div class="flex items-center justify-between">
									<span class="text-base font-bold">Total Price</span>
									<span class="text-base font-bold">${totalFiatPrice.toFixed(2)}</span>
								</div>
								<div class="mt-1 flex items-center justify-between">
									<span class="text-base font-semibold"></span>
									<span class="text-base-content/60 text-sm"
										>{satsFromUsd(totalSatsPrice, btcPrice)}</span
									>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Mobile: Full width layout -->
			<div class="bg-base-300 rounded-2xl p-2 lg:hidden">
				<!-- Bidder Information -->
				<div class="mb-3 flex items-center gap-3">
					<div class="avatar">
						<div class=" flex h-8 w-8 items-center justify-center rounded-full">
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
									<span class="text-sm font-semibold">
										{(props.bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
									</span>
								</div>
							{/if}
						</div>
					</div>

					<div class="flex flex-col">
						<span class="text-sm font-medium">
							{props.bid.userProfile?.user?.name ||
								props.bid.userProfile?.professionalTitle ||
								'Anonymous'}
						</span>

						<div class="mt-1 flex items-center">
							{#each Array(5) as _, i}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3 w-3 {i < (props.bid.userProfile?.averageRating || 0)
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
							<span class="text-base-content/60 ml-1 text-xs">
								{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid.userProfile
									?.tasksCompleted || 0} tasks)
							</span>
						</div>

						<p class="text-base-content/60 mt-1 text-sm">
							Member since
							{new Date(props.bid.createdAt).toLocaleDateString('en-US', {
								month: '2-digit',
								year: 'numeric'
							})}
						</p>
					</div>
				</div>

				<!-- Price Breakdown -->
				<div class=" space-y-2 rounded-2xl p-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium">Bid Price</span>
						<span class="text-xs font-bold">${formatNumberWithTwoDecimals(props.bid.amount)} </span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium">Platform Fee</span>
						<span class="text-xs font-bold">${platformFeeUsd.toFixed(2)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium">Est. Transaction Fee</span>
						<span class="text-xs font-bold">${transactionFeeUsd.toFixed(2)}</span>
					</div>
					<div class="border-base-200 border-t pt-2">
						<div class="flex items-center justify-between">
							<span class="text-base font-semibold">Total Price</span>
							<span class="text-base font-bold">${totalFiatPrice.toFixed(2)}</span>
						</div>
						<div class="mt-1 flex items-center justify-between">
							<span class="text-base font-semibold"></span>
							<span class="text-base-content/60 text-sm"
								>{satsFromUsd(totalSatsPrice, btcPrice)}</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Escrow Information -->
			<div class="alert alert-info alert-outline my-4">
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
				<small class="md:text-sm text-xs">
					<strong>Note:</strong> You are entering into a contract with the taskee on the blockchain.
					BitTasker is not able to access your funds or alter the contract after this.
				</small>
			</div>

			<!-- Escrow Funding Section -->
			<div class="mb-4">
				<!-- Tab Navigation -->
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
				{/if}

				<!-- External Wallet Tab -->
				{#if selectedEscrowTab === 'external'}
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<!-- Bitcoin Lightning -->
						<button
							class="group bg-base-100 hover:bg-base-200 relative rounded-4xl border p-3 transition-all duration-200 {selectedExternalMethod ===
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
							class="group bg-base-100 hover:bg-base-200 relative rounded-4xl border p-3 transition-all duration-200 {selectedExternalMethod ===
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
							class="group bg-base-100 hover:bg-base-200 relative rounded-4xl border p-3 transition-all duration-200 {selectedExternalMethod ===
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
				{/if}
			</div>

			<!-- Validation Errors -->
			{#if validationErrors.escrowMethod}
				<div class="alert alert-error mb-4">
					<span>{validationErrors.escrowMethod}</span>
				</div>
			{/if}

			<!-- Submit Buttons -->
			<div
				class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col justify-end gap-3 py-4 sm:flex-row md:py-2"
			>
				<button
					type="button"
					class="btn btn-error"
					onclick={props.onCancel}
					disabled={isSubmitting}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={isSubmitting}
					onclick={handleSubmit}
				>
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
		{escrowDetails}
		{btcPrice}
		onPaymentConfirmed={handleExternalPaymentConfirmed}
		onCancel={handleBackToForm}
	/>
{/if}

{#if currentScreen === 'success' && escrowDetails}
	<EscrowSuccessScreen
		bid={props.bid}
		taskTitle={props.taskTitle}
		{escrowDetails}
		{btcPrice}
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
