<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';

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

	// Calculate totals
	let totalFiatPrice = $derived((props.bid.amount / 100000000) * props.btcPrice);

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

<div class="bg-base-100 mx-auto max-h-[80vh] max-w-2xl overflow-y-auto rounded-lg shadow-lg">
	<!-- Header with close button -->
	<div
		class="bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between border-b p-4 pb-4 sm:p-6"
	>
		<h4 class="font-bold">Escrow Funded Successfully</h4>
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
						class="h-8 w-8 text-white {isAnimating ? 'animate-bounce' : ''}"
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

			<h3 class="text-center text-lg font-bold text-white">Escrow Funded Successfully</h3>
			<p class="text-base-content/70 px-4 text-center text-sm">
				Your contract has been created and funded on the blockchain.
			</p>
		</div>

		<!-- Task Details -->
		{#if showDetails}
			<div class="bg-base-200 mx-2 rounded-lg p-4">
				<!-- Task Title -->
				<h4 class="mb-3 line-clamp-1 text-base font-bold break-words text-white">
					{props.taskTitle}
				</h4>

				<!-- Bidder Info with Rating -->
				<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex min-w-0 flex-1 items-center gap-2">
						<svg
							class="text-base-content/60 h-4 w-4 flex-shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
							/>
						</svg>
						<span class="truncate text-sm text-white">
							{props.bid.userProfile?.user?.name ||
								props.bid.userProfile?.professionalTitle ||
								'Anonymous'}
						</span>
						<div class="flex flex-shrink-0 items-center gap-1">
							{#each Array(5) as _, i}
								<svg
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
							<span class="text-base-content/60 ml-1 text-xs whitespace-nowrap">
								{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid.userProfile
									?.tasksCompleted || 0} tasks)
							</span>
						</div>
					</div>
					<div class="text-right sm:text-right">
						<div class="text-base font-bold text-white">
							{formatNumberWithTwoDecimals(props.bid.amount)}
						</div>
					</div>
				</div>

				<!-- Financial Details - Responsive Grid -->
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-base-content/70 text-xs">Bid Price</span>
							<span class="text-xs font-bold break-all text-white"
								>{formatNumberWithTwoDecimals(props.bid.amount)} Sats</span
							>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/70 text-xs">Contract ID</span>
							<span class="text-xs font-bold text-white">ctr_8G7KZ</span>
						</div>
						<div class="text-base-content/70 text-xs break-words">
							Created: {new Date().toLocaleDateString('en-GB', {
								day: '2-digit',
								month: 'short',
								year: 'numeric'
							})}, {new Date().toLocaleTimeString('en-US', {
								hour: '2-digit',
								minute: '2-digit',
								hour12: false
							})}
						</div>
					</div>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-base-content/70 text-xs">Platform Fee</span>
							<span class="text-xs font-bold text-white">3,100 Sats</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/70 text-xs">Total (Fiat)</span>
							<span class="text-xs font-bold text-white">${totalFiatPrice.toFixed(2)}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/70 text-xs">Total (Sats)</span>
							<span class="text-xs font-bold break-all text-white"
								>{formatNumberWithTwoDecimals(props.bid.amount + 3100)}</span
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
				<h4 class="mb-3 text-base font-bold text-white">Keep climbing!</h4>
				<p class="mb-3 text-sm break-words text-white">
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
