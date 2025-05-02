
<script lang="ts">
	import type { Wallet, ConnectedWallet } from '$lib/types/wallet';
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { onConnected, onDisconnected } from '@getalby/bitcoin-connect';
	import Swiper from '$lib/components/Swiper.svelte';
	import WalletSetup from '$lib/components/wallet/WalletSetup.svelte';
	import walletService from '$lib/api/services/wallet.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import WalletConnect from '$lib/components/wallet/WalletConnect.svelte';
	import TransactionList from '$lib/components/wallet/details/TransactionList.svelte';

	let promise = $state<Promise<{ wallets: (Wallet | ConnectedWallet)[]; totalBalance: number }>>(
		new Promise(() => {})
	);
	let showDrawer = $state(false);
	let loading = $state(true);
	let drawerContent = $state<'options' | 'create' | 'connect'>('connect');
	let direction = $state<'forward' | 'backward'>('forward');
	let wallets = $state<(Wallet | ConnectedWallet)[]>([]);
	let totalBalance = $state(0);

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

	async function getWallets() {
		loading = true;
		const walletsList: (Wallet | ConnectedWallet)[] = [];
		const { wallets: internalWallets, totalBalance: internalTotalBalance } =
			await walletService.getWallets();
		walletsList.push(...internalWallets);

		let balance = 0;

		const unsubConnected = onConnected(async (provider) => {
			const info = await provider.getInfo();
			const pbalance = await provider.getBalance?.();
			const isEnabled = await provider.isEnabled?.();
			balance += pbalance?.balance ?? 0;
			
			// Create a new array with the connected wallet
			const updatedWallets = [...walletsList];
			updatedWallets.push({
				info,
				balance: pbalance?.balance,
				currency: pbalance?.currency,
				isEnabled: isEnabled,
				connected: true
			});
			
			// Update state in a batch
			loading = true;
			wallets = updatedWallets;
			totalBalance = internalTotalBalance + balance;
			setTimeout(() => {
				loading = false;
			}, 0);
		});

		const unsubDisconnected = onDisconnected(() => {
			// Remove the last connected wallet
			const updatedWallets = walletsList.filter(wallet => {
				return !('connected' in wallet) || !wallet.connected;
			});
			balance = 0;
			
			// Update state in a batch
			loading = true;
			wallets = updatedWallets;
			totalBalance = internalTotalBalance + balance;
			setTimeout(() => {
				loading = false;
			}, 0);
		});

		// Set initial values
		wallets = [...walletsList];
		totalBalance = internalTotalBalance + balance;
		
		// Small delay to ensure DOM is ready
		setTimeout(() => {
			loading = false;
		}, 0);

		return {
			cleanup: () => {
				unsubConnected();
				unsubDisconnected();
			}
		};
	}

	onMount(() => {
		let cleanup: (() => void) | undefined;
		getWallets().then((result) => {
			cleanup = result.cleanup;
		});

		return () => {
			cleanup?.();
		};
	});

	// TODO: Check hardware wallet support
	/* function checkHardwareWalletSupport(): boolean {
		const hasWebUSB = typeof navigator !== 'undefined' && 'usb' in navigator;
		const hasWebHID = typeof navigator !== 'undefined' && 'hid' in navigator;

		return hasWebUSB || hasWebHID;
	} */

	// TODO: Connect hardware wallet
	/* let isConnectingHardwareWallet = $state(false);
	async function connectHardwareWallet(type: 'ledger' | 'trezor'): Promise<void> {
		return console.warn('Hardware wallet not implemented');
		isConnectingHardwareWallet = true;

		try {
			const connected = await connectHardwareWallet(type);
			if (connected) {
				hardwareWalletConnected = true;
				hardwareWalletType = type;
			}
		} catch (error) {
			console.error(`Failed to connect ${type}:`, error);
		} finally {
			isConnectingHardwareWallet = false;
		}
	} */
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg py-6 shadow-lg">
	<h2 class="mb-6 px-6 text-2xl font-bold">Wallet</h2>
	<div class="space-y-6">
		<!-- Wallet Slider -->
		<div class="px-6">
			<h3 class="mb-2 text-sm">Total Balance</h3>
			<p class="text-xl font-bold">{formatNumber(totalBalance, 4)} BTC</p>
		</div>
		{#if loading}
			<div class="skeleton mx-auto h-72 w-[90%]"></div>
		{:else}
			<Swiper items={wallets} slidesPerView={1.2} swiperStyle="width: 100%; padding: 0 1rem;">
				{#snippet children({ item })}
					<!-- Internal Wallet Card -->
					{#if !item.connected}
						<div class="swiper-slide" style="height: 100%;">
							<div class="card bg-primary text-primary-content h-full">
								<div class="card-body">
									<h3 class="card-title mb-2 text-lg">Internal Wallet</h3>
									<p class="text-4xl font-bold">{formatNumber(item?.balance?.btc, 4)} BTC</p>
									<p class="opacity-80">
										{item.balance?.sats?.toLocaleString()} sats
									</p>
									<p class="opacity-80">≈ ${item.balance?.usd?.toLocaleString()}</p>
								</div>
							</div>
						</div>
					{/if}
					{#if item.connected}
						<div class="swiper-slide" style="height: 100%;">
							<div class="card bg-accent text-primary-content h-full">
								<div class="card-body">
									<h3 class="card-title mb-2 text-lg">Connected Wallet</h3>
									<p class="text-4xl font-bold">
										{formatNumber(item?.balance, 4)}
										{item?.currency}
									</p>
									<p>{item?.isEnabled ? 'Enabled' : 'Disabled'}</p>
								</div>
							</div>
						</div>
					{/if}
				{/snippet}
				{#snippet lastEl()}
					<!-- Add Wallet Card -->
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
								<p class="text-base-content/70">
									It's free, and you can create as many as you like.
								</p>
							</div>
						</div>
					</div>
				{/snippet}
			</Swiper>
		{/if}

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
		<div class="space-y-4 px-6">
			<h3 class="text-lg font-semibold">Recent Transactions</h3>

			{#await walletService.getTransactions()}
				<div class="my-5 flex items-center justify-center">
					<div
						class="border-l-primary h-10 w-10 animate-spin rounded-full border-2 border-t-transparent border-r-transparent border-b-transparent"
					></div>
				</div>
			{:then transactions}
				<TransactionList {transactions} />
			{:catch error}
				<div class="flex items-center justify-center">
					<p class="text-error">Error loading transactions: {error.message}</p>
				</div>
			{/await}
		</div>
	</div>
</div>

<Drawer isOpen={showDrawer} title="Add a Wallet" onClose={closeDrawer}>
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
							<h3 class="font-semibold">Connect Existing Wallet</h3>
							<p class="text-base-content/70 text-sm">Connect your existing wallet</p>
						</div>
					</div>
				</button>

				<!-- TODO: Connect hardware wallet -->
				<!-- <div class="flex gap-2">
					<button
						class="btn flex-1"
						onclick={() => connectHardwareWallet('ledger')}
						disabled={isConnectingHardwareWallet}
					>
						Connect Ledger
					</button>
					<button
						class="btn flex-1"
						onclick={() => connectHardwareWallet('trezor')}
						disabled={isConnectingHardwareWallet}
					>
						Connect Trezor
					</button>
				</div> -->
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
				<WalletConnect />
			</div>
		{/if}
	</div>
</Drawer>
