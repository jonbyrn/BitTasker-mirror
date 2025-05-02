<script lang="ts">
	import type { TransactionType, Wallet } from '$lib/types/wallet';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import TransactionList from '$lib/components/wallet/details/TransactionList.svelte';
	import WalletSettings from '$lib/components/wallet/details/WalletSettings.svelte';
	import walletService from '$lib/api/services/wallet.service';

	// Get data from page store
	let wallet = $state<Wallet>();
	let transactions = $state<TransactionType[]>([]);

	onMount(async () => {
		wallet = await walletService.getWallet(page.params.id);
		transactions = await walletService.getWalletTransactions(page.params.id);
	});

	// State management using runes
	let isSettingsOpen = $state(false);

	function toggleSettings() {
		isSettingsOpen = !isSettingsOpen;
	}

	function handleSend() {
		// TODO: Implement send functionality
		console.log('Send clicked');
	}

	function handleReceive() {
		// TODO: Implement receive functionality
		console.log('Receive clicked');
	}

	// Helper function to get total balance from addresses
	function getTotalBalance(wallet: Wallet): string {
		if (wallet.totalWalletBalance) {
			return wallet.totalWalletBalance;
		}
		
		if (wallet.addresses && wallet.addresses.length > 0) {
			const total = wallet.addresses.reduce((sum, addr) => sum + addr.balance, 0);
			return total.toString();
		}

		return '0';
	}
</script>

<div class="bg-base-100 flex h-full flex-col" in:fly={{ y: 20, duration: 300, easing: cubicOut }}>
	<!-- Navigation Bar -->
	<div class="navbar bg-base-200 px-4">
		<div class="navbar-start">
			<button
				aria-label="back"
				class="btn btn-ghost btn-circle"
				onclick={() => goto('/dashboard/wallet')}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
			</button>
		</div>
		<div class="navbar-end">
			<button aria-label="settings" class="btn btn-ghost btn-circle" onclick={toggleSettings}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 6v6m0 0v6m0-6h6m-6 0H6"
					/>
				</svg>
			</button>
		</div>
	</div>

	{#if wallet}
		<!-- Wallet Content -->
		<div class="flex flex-1 flex-col">
			<!-- Wallet Header -->
			<div
				class="from-primary to-primary-focus text-primary-content relative overflow-hidden rounded-lg bg-gradient-to-br p-6"
			>
				<!-- Bitcoin logo watermark -->
				<div class="absolute top-4 right-4 opacity-10">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path
							d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12zm-.75-13.5c.69 0 1.25-.56 1.25-1.25s-.56-1.25-1.25-1.25S10 8.56 10 9.25s.56 1.25 1.25 1.25zm1.5 0c.69 0 1.25-.56 1.25-1.25s-.56-1.25-1.25-1.25-1.25.56-1.25 1.25.56 1.25 1.25 1.25z"
						/>
					</svg>
				</div>

				<!-- Wallet info -->
				<div class="relative z-10">
					<h2 class="mb-2 text-2xl font-bold">Wallet {wallet.id}</h2>
					<div class="flex items-baseline gap-2">
						<span class="text-3xl font-bold">{getTotalBalance(wallet)}</span>
						<span class="text-lg opacity-80">BTC</span>
					</div>
					<div class="mt-2 text-sm opacity-80">
						Network: {wallet.network}
					</div>
					{#if wallet.addresses && wallet.addresses.length > 0}
						<div class="mt-2 text-sm opacity-80">
							Primary Address: {wallet.addresses[0].address}
						</div>
					{/if}
				</div>
			</div>

			<!-- Transaction List -->
			<div class="flex-1 overflow-y-auto px-4">
				<TransactionList transactions={transactions} />
			</div>

			<!-- Action Buttons -->
			<div class="bg-base-100 sticky bottom-0 w-full p-4 shadow-lg">
				<div class="grid grid-cols-2 gap-4">
					<button class="btn btn-primary" onclick={handleSend}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 10l7-7m0 0l7 7m-7-7v18"
							/>
						</svg>
						Send
					</button>
					<button class="btn btn-primary" onclick={handleReceive}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 14l-7 7m0 0l-7-7m7 7V3"
							/>
						</svg>
						Receive
					</button>
				</div>
			</div>
		</div>

		<!-- Settings Modal -->
		{#if isSettingsOpen}
			<WalletSettings wallet={wallet} onClose={toggleSettings} />
		{/if}
	{:else}
		<div class="flex flex-1 items-center justify-center">
			<p class="text-error">Wallet not found</p>
		</div>
	{/if}
</div>
