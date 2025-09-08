<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';

	// Props
	const props = $props<{
		bid: TaskBid;
		taskTitle: string;
		escrowDetails: {
			method: 'bittasker' | 'external';
			asset?: 'LBTC' | 'USDT';
			paymentMethod?: 'bitcoin-lightning' | 'lbtc-liquid' | 'usdt-liquid';
			address?: string;
			qrCode?: string;
		};
		btcPrice: number;
		onGoToDashboard: () => void;
		onCreateNewTask: () => void;
	}>();

	// Animation state
	let isAnimating = $state(true);
	let showDetails = $state(false);

	// Mock gamification data
	let userTier = $state('Bitcoin Beginner');
	let tasksToNextTier = $state(5);
	let nextTier = $state('Satoshi Stacker');
	let nextTierDate = $state('2024-03-15');

	// Mock transaction data
	let transactionHash = $state(
		'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
	);
	let blockExplorerUrl = $derived(`https://blockstream.info/tx/${transactionHash}`);

	// Calculate pricing breakdown (same as BidAcceptanceForm)
	let bidAmountUsd = $derived((props.bid.amount / 100000000) * props.btcPrice);
	let platformFeeUsd = $derived(bidAmountUsd * 0.03); // 3% platform fee
	let transactionFeeUsd = $derived(bidAmountUsd * 0.005); // 0.5% transaction fee
	let totalFiatPrice = $derived(bidAmountUsd + platformFeeUsd + transactionFeeUsd);
	
	// Convert USD amounts back to sats for display
	let platformFeeSats = $derived(Math.round((platformFeeUsd / props.btcPrice) * 100000000));
	let transactionFeeSats = $derived(Math.round((transactionFeeUsd / props.btcPrice) * 100000000));
	let totalSatsPrice = $derived(props.bid.amount + platformFeeSats + transactionFeeSats);

	onMount(() => {
		// Trigger animation sequence
		setTimeout(() => {
			isAnimating = false;
			setTimeout(() => {
				showDetails = true;
			}, 0);
		}, 0);
	});

	// Copy transaction hash to clipboard
	function copyTransactionHash() {
		navigator.clipboard.writeText(transactionHash);
		// You could add a toast notification here
	}
</script>

<div class="bg-base-100 mx-auto max-h-[70vh] overflow-y-auto rounded-lg shadow-lg">
	<!-- Header with close button -->
	<div
		class="bg-base-100  border-base-300 sticky top-0 z-10 flex items-center justify-between border pb-4 sm:p-6"
	>
		<h4 class="font-bold p-4 sm:p-0">Transaction Overview</h4>
		<button
			type="button"
			class="btn btn-ghost btn-sm btn-circle"
			onclick={props.onGoToDashboard}
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
		<!-- Success Animation -->
		<div class="flex flex-col items-center justify-center pb-5">
			<div class="relative mb-4">
				<!-- Animated checkmark circle -->
				<div
					class="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 {isAnimating
						? 'animate-pulse'
						: ''}"
				>
					<svg
						class="h-8 w-8 {isAnimating ? 'animate-bounce' : ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="3"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>

				<!-- Success rings animation -->
				{#if isAnimating}
					<div class="absolute inset-0 animate-ping rounded-full border-4 border-green-300"></div>
					<div
						class="absolute inset-0 animate-ping rounded-full border-2 border-green-400"
						style="animation-delay: 0.2s;"
					></div>
				{/if}
			</div>

			<h3 class="text-center text-lg font-bold">Escrow Funded Successfully</h3>
			<p class="text-base-content/70 px-4 text-center text-sm">
				Your contract has been created and funded on the blockchain.
			</p>
		</div>

		<!-- Task Details -->
		{#if showDetails}
			<div class="bg-base-200 rounded-lg p-4">
				<!-- Task Title -->
				<h4 class="mb-4 line-clamp-1 text-sm font-semibold">Payment Summary</h4>

				<!-- Pricing Breakdown (same format as BidAcceptanceForm) -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium">Bid Price</span>
						<span class="text-xs font-bold">${formatNumberWithTwoDecimals(props.bid.amount)}</span>
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
								>{satsFromUsd(totalSatsPrice, props.btcPrice)} sats</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- Blockchain Verification -->
			<div class="bg-base-200 mx-2 my-4 rounded-lg p-4">
				<h4 class="mb-3 font-semibold">Blockchain Verification</h4>
				<p class="text-base-content/70 mb-3 text-sm">
					Your transaction has been confirmed on the blockchain. You can verify it using the block
					explorer.
				</p>

				<div class="flex items-center gap-2">
					<span class="text-base-content/60 font-mono text-xs break-all"
						>{transactionHash.slice(0, 20)}...</span
					>
					<button
						class="btn btn-ghost btn-xs"
						onclick={copyTransactionHash}
						title="Copy transaction hash"
						aria-label="Copy transaction hash"
					>
						<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
					</button>
					<a
						href={blockExplorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-primary btn-xs"
					>
						View on Explorer
					</a>
				</div>
			</div>

			<!-- Gamification Progress -->
			<div class="bg-base-200 mx-2 mb-4 rounded-lg p-4">
				<h4 class="mb-3 text-base font-bold">Keep climbing!</h4>
				<p class="mb-3 text-sm break-words">
					Complete <span class="font-bold">{tasksToNextTier} more tasks</span> by
					<span class="font-bold">{nextTierDate}</span>
					to reach <span class="text-primary font-bold">{nextTier}</span>
				</p>
				<div class="bg-base-300 h-2 w-full rounded-full">
					<div class="from-primary to-secondary h-2 w-3/4 rounded-full bg-gradient-to-r"></div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Action Buttons -->
	<div
		class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col justify-end gap-3 border-t p-4 sm:flex-row md:py-2"
	>
		<button type="button" class="btn btn-outline" onclick={props.onGoToDashboard}>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"
				/>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z"
				/>
			</svg>
			Go to Dashboard
		</button>
		<button type="button" class="btn btn-primary" onclick={props.onCreateNewTask}>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 6v6m0 0v6m0-6h6m-6 0H6"
				/>
			</svg>
			Create New Task
		</button>
	</div>
</div>

<style>
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	@keyframes bounce {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}

	@keyframes ping {
		75%,
		100% {
			transform: scale(2);
			opacity: 0;
		}
	}
</style>
