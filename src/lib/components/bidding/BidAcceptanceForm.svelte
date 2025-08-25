<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';

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

	// Derived values
	const getFormattedPrice = $derived(formatCurrency(props.bid.amount, props.bid.currency));

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
	});
</script>

<div class="bg-base-100 mx-auto max-w-3xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-xl font-bold">Accept Bid & Fund Escrow</h2>

	<!-- Bid Information Section -->
	<div class="bg-base-200 mb-6 rounded-lg p-4">
		<div class="flex items-start justify-between">
			<div class="flex-1">
				<h3 class="font-semibold text-lg mb-2">{props.taskTitle}</h3>
				
				<!-- Bidder Information -->
				<div class="flex items-center gap-3 mb-3">
					<!-- Avatar -->
					<div class="avatar">
						<div class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full">
							{#if props.bid.freelancer?.user?.profilePicture}
								<img
									src={props.bid.freelancer.user.profilePicture}
									alt="Bidder Avatar"
									class="h-12 w-12 rounded-full object-cover"
								/>
							{:else}
								<div class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-center">
									<span class="text-xl font-semibold">
										{(props.bid.freelancer?.user?.name || 'A').charAt(0).toUpperCase()}
									</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Bidder Details -->
					<div class="flex flex-col">
						<span class="text-base font-medium">
							{props.bid.freelancer?.user?.name || props.bid.freelancer?.professionalTitle || 'Anonymous'}
						</span>
						{#if props.bid.freelancer?.professionalTitle}
							<span class="text-base-content/60 text-sm">{props.bid.freelancer.professionalTitle}</span>
						{/if}
						
						<!-- Review Stars -->
						<div class="flex items-center mt-1">
							{#each Array(5) as _, i}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 {i < (props.bid.freelancer?.averageRating || 0) ? 'text-yellow-400' : 'text-base-content/30'}"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
									/>
								</svg>
							{/each}
							<span class="text-base-content/60 ml-2 text-sm">
								{(props.bid.freelancer?.averageRating || 0).toFixed(1)} ({props.bid.freelancer?.tasksCompleted || 0} tasks)
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Bid Price -->
			<div class="text-right">
				<div class="text-2xl font-bold text-success">{getFormattedPrice}</div>
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

	<!-- Escrow Funding Section -->
	<div class="mb-6">
		<h3 class="text-lg font-semibold mb-4">Escrow Funding</h3>
		
		<!-- Tab Navigation -->
		<div class="tabs tabs-boxed mb-4">
			<button
				class="tab {selectedEscrowTab === 'bittasker' ? 'tab-active' : ''}"
				onclick={() => selectedEscrowTab = 'bittasker'}
			>
				My BitTasker Wallet
			</button>
			<button
				class="tab {selectedEscrowTab === 'external' ? 'tab-active' : ''}"
				onclick={() => selectedEscrowTab = 'external'}
			>
				External Wallet
			</button>
		</div>

		<!-- BitTasker Wallet Tab -->
		{#if selectedEscrowTab === 'bittasker'}
			<div class="bg-base-200 rounded-lg p-4">
				<p class="text-base-content/70 text-sm mb-4">
					Fund escrow directly from your BitTasker wallet balance.
				</p>
				
				<div class="grid grid-cols-2 gap-4">
					<!-- LBTC Option -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedBitTaskerAsset === 'LBTC' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedBitTaskerAsset = 'LBTC'}
					>
						<div class="card-body p-4">
							<div class="flex items-center gap-2 mb-2">
								<span class="text-lg">🌊</span>
								<span class="font-semibold">L-BTC</span>
							</div>
							<div class="text-sm text-base-content/60">
								Available: 0.005 L-BTC
							</div>
						</div>
					</button>

					<!-- USDT Option -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedBitTaskerAsset === 'USDT' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedBitTaskerAsset = 'USDT'}
					>
						<div class="card-body p-4">
							<div class="flex items-center gap-2 mb-2">
								<span class="text-lg">💵</span>
								<span class="font-semibold">USDT</span>
							</div>
							<div class="text-sm text-base-content/60">
								Available: 150.00 USDT
							</div>
						</div>
					</button>
				</div>
			</div>
		{/if}

		<!-- External Wallet Tab -->
		{#if selectedEscrowTab === 'external'}
			<div class="bg-base-200 rounded-lg p-4">
				<p class="text-base-content/70 text-sm mb-4">
					Send funds from your external wallet to fund the escrow.
				</p>
				
				<!-- Payment Method Selection -->
				<div class="grid grid-cols-1 gap-4 mb-4">
					<!-- Bitcoin Lightning -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedExternalMethod === 'bitcoin-lightning' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedExternalMethod = 'bitcoin-lightning'}
					>
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								<span class="text-2xl">⚡</span>
								<div class="flex-1">
									<div class="font-semibold">Bitcoin Lightning</div>
									<div class="text-sm text-base-content/60">Fast, low-fee payments</div>
								</div>
							</div>
						</div>
					</button>

					<!-- LBTC on Liquid -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedExternalMethod === 'lbtc-liquid' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedExternalMethod = 'lbtc-liquid'}
					>
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								<span class="text-2xl">🌊</span>
								<div class="flex-1">
									<div class="font-semibold">L-BTC on Liquid</div>
									<div class="text-sm text-base-content/60">Confidential Bitcoin</div>
								</div>
							</div>
						</div>
					</button>

					<!-- USDT on Liquid -->
					<button
						class="card bg-base-100 hover:bg-base-300 border-2 transition-colors {selectedExternalMethod === 'usdt-liquid' ? 'border-primary' : 'border-base-300'}"
						onclick={() => selectedExternalMethod = 'usdt-liquid'}
					>
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								<span class="text-2xl">💵</span>
								<div class="flex-1">
									<div class="font-semibold">USDT on Liquid</div>
									<div class="text-sm text-base-content/60">Stablecoin payments</div>
								</div>
							</div>
						</div>
					</button>
				</div>

				<!-- Address and QR Code Display -->
				{#if addresses[selectedExternalMethod] && qrCodes[selectedExternalMethod]}
					<div class="bg-base-100 rounded-lg p-4">
						<h4 class="font-semibold mb-3">Send Payment To:</h4>
						
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<!-- QR Code -->
							<div class="flex flex-col items-center">
								<img
									src={qrCodes[selectedExternalMethod]}
									alt="Payment QR Code"
									class="w-48 h-48 border-2 border-base-300 rounded-lg"
								/>
								<p class="text-xs text-base-content/60 mt-2">Scan with your wallet</p>
							</div>

							<!-- Address -->
							<div class="flex flex-col">
								<label class="text-sm font-medium mb-2">Address:</label>
								<button
									class="bg-base-300 hover:bg-base-100 border-base-300 group w-full rounded-lg border px-4 py-3 text-left transition-colors duration-200"
									title="Click to copy"
									onclick={() => copyToClipboard(addresses[selectedExternalMethod])}
								>
									<pre class="text-xs break-all whitespace-pre-wrap transition-colors group-hover:text-primary">
										{addresses[selectedExternalMethod]}
									</pre>
								</button>
								<p class="text-xs text-base-content/60 mt-2">👆 Click to copy address</p>
								
								<div class="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
									<div class="flex items-start gap-2">
										<span class="text-warning">⚠️</span>
										<div class="text-sm">
											<strong>Important:</strong> Send exactly {getFormattedPrice} to this address. 
											Any other amount may result in payment issues.
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
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
			{isSubmitting ? 'Processing...' : 'Accept Bid & Fund Escrow'}
		</button>
	</div>
</div>
