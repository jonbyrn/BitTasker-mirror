<!-- WalletBalance.svelte -->
<script lang="ts">
	import type { Wallet } from '$lib/types/wallet';
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import Swiper from '$lib/components/Swiper.svelte';
	import WalletSetup from '$lib/components/wallet/WalletSetup.svelte';
	import BitcoinConnect from '$lib/components/wallet/lightning/BitcoinConnect.svelte';
	import walletService from '$lib/api/services/wallet.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import LightningWalletConnect from './lightning/LightningWalletConnect.svelte';

	let { onTabChange } = $props<{ onTabChange: (tab: string) => void }>();
	let promise = $state<Promise<Wallet[]>>(new Promise(() => {}));
	let showDrawer = $state(false);
	let drawerContent = $state<'options' | 'create' | 'connect'>('connect');
	let direction = $state<'forward' | 'backward'>('forward');

	// Format number with a specific number of decimals
	function formatNumber(number: number, decimals: number): string {
		return number?.toFixed(decimals);
	}

	// Format timestamp to human-readable date
	function formatDate(timestamp: string): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function openDrawer(content: 'options' | 'create' | 'connect' = 'options') {
		drawerContent = content;
		showDrawer = true;
		if (showDrawer) {
			if (content === 'options') {
				direction = 'backward';
			} else {
				direction = 'forward';
			}
		}
	}

	function closeDrawer() {
		showDrawer = false;
		// Reset to options after animation completes
		setTimeout(() => {
			drawerContent = 'options';
		}, 300);
	}

	let wallets = $state<Wallet[]>([
		{
			id: 1,
			network: 'testnet',
			addresses: [
				{
					address: 'bc1q...3f8j',
					path: 'm/84h/1h/0h',
					type: 'internal',
					createdAt: new Date().toISOString()
				}
			],
			createdAt: new Date().toISOString()
		}
	]);
	onMount(async () => {
		// promise = walletService.getWallets();
	});
</script>

<div class="space-y-6">
	<!-- Wallet Slider -->
	<Swiper items={wallets} slidesPerView={1.2} swiperStyle="width: 100%; padding: 0 1rem;">
		{#snippet children({ item, index, swiper })}
			<!-- Internal Wallet Card -->
			<div class="swiper-slide" style="height: 100%;">
				<div class="card bg-primary text-primary-content h-full">
					<div class="card-body">
						<h3 class="card-title mb-2 text-lg">Internal Wallet</h3>
						<p class="text-4xl font-bold">{formatNumber(item?.balance?.btc, 4)} BTC</p>
						<p class="opacity-80">
							{item.balance?.sats.toLocaleString()} sats
						</p>
						<p class="opacity-80">≈ ${item.balance?.usd.toLocaleString()}</p>

						<!-- Quick Actions -->
						<!-- <div class="card-actions mt-4 justify-end">
						<button class="btn btn-ghost btn-sm" onclick={() => onTabChange('receive')}>
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
									d="M19 9l-7 7-7-7"
								/>
							</svg>
							Receive
						</button>
						<button class="btn btn-ghost btn-sm" onclick={() => onTabChange('send')}>
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
									d="M5 15l7-7 7 7"
								/>
							</svg>
							Send
						</button>
					</div> -->
					</div>
				</div>
			</div>

			<!-- External Connected Wallets would go here -->
		{/snippet}
		<!-- Add Wallet Card -->
		{#snippet lastEl()}
			<div class="swiper-slide" style="height: 100%;">
				<div
					role="button"
					tabindex="0"
					class="card bg-base-200 hover:bg-base-300 flex h-full cursor-pointer items-center justify-center transition-colors"
					onclick={() => openDrawer()}
					onkeydown={() => {}}
				>
					<div class="p-6 text-center">
						<div
							class="bg-base-content/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-8 w-8"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4v16m8-8H4"
								/>
							</svg>
						</div>
						<h3 class="mb-2 text-xl font-semibold">Add a wallet</h3>
						<p class="text-base-content/70">It's free, and you can create as many as you like.</p>
					</div>
				</div>
			</div>
		{/snippet}
	</Swiper>

	<!-- <div class="grid grid-cols-2 gap-4">
		<button class="btn btn-outline btn-primary" onclick={() => onTabChange('receive')}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
			Receive
		</button>
		<button class="btn btn-outline btn-primary" onclick={() => onTabChange('send')}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
			</svg>
			Send
		</button>
	</div> -->

	<!-- Recent Transactions Section -->
	<div class="px-6">
		<h3 class="mb-3 text-lg font-semibold">Recent Transactions</h3>
		<div class="overflow-x-auto">
			{#await walletService.getTransactions()}
				<div class="my-5 flex items-center justify-center">
					<div
						class="border-l-primary h-10 w-10 animate-spin rounded-full border-2 border-t-transparent border-r-transparent border-b-transparent"
					></div>
				</div>
			{:then transactions}
				{#if transactions.length > 0}
					<table class="table w-full">
						<thead>
							<tr>
								<th>Type</th>
								<th>Amount</th>
								<th>Date</th>
								<th>Fees</th>
							</tr>
						</thead>
						<tbody>
							{#each transactions?.slice(0, 3) as tx}
								<tr>
									<td>
										<div class="flex items-center gap-2">
											{#if tx.type === 'incoming'}
												<div class="badge badge-success">Received</div>
											{:else if tx.type === 'outgoing'}
												<div class="badge badge-warning">Sent</div>
											{/if}
										</div>
									</td>
									<td>
										<span class={tx.type === 'incoming' ? 'text-success' : 'text-warning'}>
											{tx.type === 'incoming' ? '+' : '-'}{formatNumber(tx.amount, 8)} BTC
										</span>
									</td>
									<td>{formatDate(tx.confirmationTime)}</td>
									<td>
										<div class="badge">
											{tx.fees}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<div class="mt-4 text-center">
						<button
							class="btn btn-ghost btn-sm btn-outline"
							onclick={() => onTabChange('transactions')}
						>
							View all transactions
						</button>
					</div>
				{:else}
					<div class="my-5 flex items-center justify-center text-center">
						<p class="text-accent">
							Your transactions will appear here, <br /> Start with your wallet
						</p>
					</div>
				{/if}
			{:catch error}
				<div class="flex items-center justify-center">
					<p class="text-error">Error loading transactions: {error.message}</p>
				</div>
			{/await}
		</div>
	</div>
</div>

<!-- Drawer -->
<Drawer isOpen={true} title="Add a Wallet" onClose={closeDrawer}>
	<!-- showDrawer -->
	<div class="bg-base-100 min-h-full w-full max-w-md">
		{#if drawerContent === 'options'}
			<div
				class="space-y-4"
				in:fly={{
					duration: 200,
					easing: linear,
					y: 0,
					x: direction === 'forward' ? 20 : -20
				}}
			>
				<button
					class="card bg-base-200 hover:bg-base-300 w-full cursor-pointer p-4 transition-colors"
					onclick={() => openDrawer('create')}
				>
					<div class="flex items-center space-x-4">
						<div class="bg-primary/10 rounded-full p-3">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-primary h-6 w-6"
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
						</div>
						<div class="w-full">
							<h3 class="font-semibold">Create New Wallet</h3>
							<p class="text-base-content/70 text-sm">Create a new internal BitTasker wallet</p>
						</div>
					</div>
				</button>

				<button
					class="card bg-base-200 hover:bg-base-300 w-full cursor-pointer p-4 transition-colors"
					onclick={() => openDrawer('connect')}
				>
					<div class="flex items-center space-x-4">
						<div class="bg-secondary/10 rounded-full p-3">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-secondary h-6 w-6"
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
						</div>
						<div class="w-full">
							<h3 class="font-semibold">Connect External Wallet</h3>
							<p class="text-base-content/70 text-sm">Import your existing wallet</p>
						</div>
					</div>
				</button>
			</div>
		{:else if drawerContent === 'create'}
			<div
				in:fly={{
					duration: 200,
					easing: linear,
					y: 0,
					x: direction === 'forward' ? 20 : -20
				}}
			>
				<div class="mb-6 flex items-center justify-between">
					<button aria-label="Back" class="btn btn-ghost btn-sm" onclick={() => openDrawer()}>
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
				<WalletSetup onWalletCreated={() => closeDrawer()} />
			</div>
		{:else}
			<div
				in:fly={{
					duration: 200,
					easing: linear,
					y: 0,
					x: direction === 'forward' ? 20 : -20
				}}
			>
				<div class="mb-6 flex items-center justify-between">
					<button aria-label="Back" class="btn btn-ghost btn-sm" onclick={() => openDrawer()}>
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
				<LightningWalletConnect />
				<!-- <BitcoinConnect /> -->
			</div>
		{/if}
	</div>
</Drawer>
