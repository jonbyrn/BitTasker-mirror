<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { calculateUsdtEstimate, formatSatsAmount } from '$lib/utils/helpers/crypto';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	// Props
	const props = $props<{
		bid: TaskBid;
		taskTitle: string;
		onSubmit: (bidId: string, escrowMethod: string, escrowDetails: any) => Promise<void>;
		onCancel: () => void;
	}>();

	// Form state
	let isSubmitting = $state(false);
	let validationErrors = $state<Record<string, string>>({});
	
	// Escrow funding state
	let selectedEscrowTab = $state<'bittasker' | 'external'>('bittasker');
	let selectedBitTaskerAsset = $state<'LBTC' | 'USDT'>('LBTC');
	let selectedExternalMethod = $state<'bitcoin-lightning' | 'lbtc-liquid' | 'usdt-liquid'>('bitcoin-lightning');
	
	// QR codes and addresses
	let qrCodes = $state<Record<string, string>>({});
	let addresses = $state<Record<string, string>>({});
	let btcPrice = $state<number>(63000); // Default fallback price

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
			const escrowDetails = {
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

			await props.onSubmit(props.bid.id, selectedEscrowTab, escrowDetails);
		} catch (error) {
			console.error('Failed to accept bid:', error);
		} finally {
			isSubmitting = false;
		}
	}

	// Copy address to clipboard
	function copyToClipboard(address: string) {
		navigator.clipboard.writeText(address);
		// You could add a toast notification here
	}

	onMount(() => {
		generateAddressesAndQRCodes();
		fetchBtcPrice();
	});
</script>

<div class="bg-base-100 mx-auto max-w-3xl rounded-lg p-6 shadow-lg">
	<h3 class="mb-6 text-xl font-bold">Accept Bid & Fund Contract</h3>

	<!-- Bid Information Section -->
	<div class="bg-base-200 mb-6 rounded-lg p-4">
		<div class="flex items-center justify-between">
			<div class="flex-1">
				<h4 class="font-semibold text-lg mb-2">{props.taskTitle}</h4>
				
				<!-- Bidder Information -->
				<div class="flex items-center gap-3 mb-3">
					<!-- Avatar -->
					<div class="avatar">
						<div class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full">
							{#if props.bid.userProfile?.user?.profilePictureUrl}
								<img
									src={props.bid.userProfile.user.profilePictureUrl}
									alt="Bidder Avatar"
									class="h-12 w-12 rounded-full object-cover"
								/>
							{:else}
								<div class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-center">
									<span class="text-xl font-semibold">
										{(props.bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
									</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Bidder Details -->
					<div class="flex flex-col">
						<span class="text-base font-medium">
							{props.bid.userProfile?.user?.name || props.bid.userProfile?.professionalTitle || 'Anonymous'}
						</span>
						{#if props.bid.userProfile?.professionalTitle}
							<span class="text-base-content/60 text-sm">{props.bid.userProfile.professionalTitle}</span>
						{/if}
						
						<!-- Review Stars -->
						<div class="flex items-center mt-1">
							{#each Array(5) as _, i}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 {i < (props.bid.userProfile?.averageRating || 0) ? 'text-yellow-400' : 'text-base-content/30'}"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
									/>
								</svg>
							{/each}
							<span class="text-base-content/60 ml-2 text-sm">
								{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid.userProfile?.tasksCompleted || 0} tasks)
							</span>
						</div>
					</div>
				</div>

				<!-- Start and End Time -->
				{#if props.bid.startDate && props.bid.endDate}
					<div class="mt-4 flex items-center gap-4">
						<div class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							<span class="text-sm">
								<strong>Start:</strong> {new Date(props.bid.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {props.bid.startTime || '09:00'}
							</span>
						</div>
						<div class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							<span class="text-sm">
								<strong>End:</strong> {new Date(props.bid.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {props.bid.endTime || '17:00'}
							</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Bid Price -->
			<div class="text-right">
				<div class="text-2xl font-bold">
					${calculateUsdtEstimate(props.bid.amount, btcPrice)}
					<div class="text-base-content/60 text-sm">
						{formatSatsAmount(props.bid.amount)}
					</div>
				</div>
				<div class="text-base-content/60 text-sm">
					{#if props.bid.paymentType === 'HOURLY'}
						{formatCurrency(props.bid.hourlyRate || 0, props.bid.currency)}/hr · Est. {props.bid.estimatedHours || 0} hrs
					{:else}
						Fixed Price
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Escrow Information -->
	<div class="alert alert-info alert-outline my-2">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			class="h-6 w-6 shrink-0 stroke-current"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
		<span>
			<strong>Note:</strong> You are entering into a contract with the taskee on the blockchain. 
			BitTasker is not  able to access your funds or alter the contract after this.
		</span>
	</div>

	<!-- Escrow Funding Section -->
	<div class="mb-6">
		
		<!-- Tab Navigation -->
		<div class="tabs tabs-bordered mb-4">
			<button
				role="tab"
				class="tab {selectedEscrowTab === 'bittasker' ? 'tab-active' : ''}"
				onclick={() => selectedEscrowTab = 'bittasker'}
			>
				My Wallet
			</button>
			<button
				role="tab"
				class="tab {selectedEscrowTab === 'external' ? 'tab-active' : ''}"
				onclick={() => selectedEscrowTab = 'external'}
			>
				External Wallet
			</button>
		</div>

		<!-- BitTasker Wallet Tab -->
		{#if selectedEscrowTab === 'bittasker'}
			<div class="bg-base-200 rounded-lg p-4">
				<!-- <p class="text-base-content/70 text-sm mb-4">
					Fund escrow directly from your BitTasker wallet balance.
				</p> -->
				
				<div class="grid grid-cols-2 gap-4">
					<!-- LBTC Option -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedBitTaskerAsset === 'LBTC' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedBitTaskerAsset = 'LBTC'}
					>
						<div class="card-body p-4">
							<div class="flex items-end justify-between">
								<div class="flex flex-col items-start">
									<img src="/currency-symbols/LBTC.svg" alt="LBTC" class="w-12 h-12 mb-1" />
									<span class="font-semibold text-lg">L-BTC</span>
								</div>
								<div class="flex flex-col items-end">
									<span class="font-bold text-2xl">100,000,120,000</span>
									<span class="text-lg text-base-content/60">SATS</span>
								</div>
							</div>
						</div>
					</button>

					<!-- USDT Option -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedBitTaskerAsset === 'USDT' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedBitTaskerAsset = 'USDT'}
					>
						<div class="card-body p-4">
							<div class="flex items-end justify-between">
								<div class="flex flex-col items-start">
									<img src="/currency-symbols/USDt.svg" alt="USDT" class="w-12 h-12 mb-1" />
									<span class="font-semibold text-lg">USDT</span>
								</div>
								<div class="flex flex-col items-end">
									<span class="font-bold text-2xl">$120.00</span>
									<span class="text-lg text-base-content/60">USDT</span>
								</div>
							</div>
						</div>
					</button>
				</div>
			</div>
		{/if}

		<!-- External Wallet Tab -->
		{#if selectedEscrowTab === 'external'}
			<div class="bg-base-200 rounded-lg p-4">
				<!-- <p class="text-base-content/70 text-sm mb-4">
					Send funds from your external wallet to fund the escrow.
				</p> -->
				
				<!-- Payment Method Selection -->
				<div class="grid grid-cols-3 gap-4">
					<!-- Bitcoin Lightning -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedExternalMethod === 'bitcoin-lightning' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedExternalMethod = 'bitcoin-lightning'}
					>
						<div class="card-body p-4 text-center">
							<div class="flex flex-col items-center">
								<img src="/currency-symbols/Bitcoin.svg" alt="BTC" class="w-12 h-12 mb-2" />
								<div class="font-semibold text-lg">BTC</div>
							</div>
						</div>
					</button>

					<!-- LBTC on Liquid -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedExternalMethod === 'lbtc-liquid' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedExternalMethod = 'lbtc-liquid'}
					>
						<div class="card-body p-4 text-center">
							<div class="flex flex-col items-center">
								<img src="/currency-symbols/LBTC.svg" alt="LBTC" class="w-12 h-12 mb-2" />
								<div class="font-semibold text-lg">L-BTC</div>
							</div>
						</div>
					</button>

					<!-- USDT on Liquid -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedExternalMethod === 'usdt-liquid' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedExternalMethod = 'usdt-liquid'}
					>
						<div class="card-body p-4 text-center">
							<div class="flex flex-col items-center">	
								<img src="/currency-symbols/USDt.svg" alt="USDT" class="w-12 h-12 mb-2" />
								<div class="font-semibold text-lg">USDT</div>
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

	<!-- Submit Buttons -->
	<div class="flex justify-end space-x-3 pt-4">
		<button
			type="button"
			class="btn btn-outline"
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
			{isSubmitting ? 'Processing...' : 'Accept Bid & Fund Contract'}
		</button>
	</div>
</div>

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
