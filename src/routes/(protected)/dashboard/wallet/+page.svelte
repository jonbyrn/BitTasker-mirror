<script lang="ts">
	import { onMount } from 'svelte';
	import {
		isWalletInitialized as initializeWallet,
		sendTransaction,
		validateAddress,
		generateLightningInvoice
	} from '$lib/utils/helpers/wallet';
	import { walletStore } from '$lib/stores/wallet.store';
	import type { Transaction, WalletAddress, NetworkFee } from '$lib/types/wallet';
	import * as bitcoinWallet from '$lib/utils/helpers/wallet/bitcoin-wallet.service';
	import * as lightningWallet from '$lib/utils/helpers/wallet/lightning-wallet.service';
	import * as liquidWallet from '$lib/utils/helpers/wallet/liquid-wallet.service';
	import * as hardwareWallet from '$lib/utils/helpers/wallet/hardware-wallet.service';

	// UI state
	let activeTab = $state('balance'); // balance, receive, send, transactions
	let selectedAddress = $state<WalletAddress | null>(null);
	let showQR = $state(false);
	let copiedAddress = $state(false);
	let isWalletInitialized = $state(false);
	let isCreatingWallet = $state(false);
	let walletPassword = $state('');
	let passwordError = $state('');
	let isLoading = $state(false);
	let walletNetwork = $state<'Bitcoin' | 'Lightning' | 'Liquid'>('Bitcoin');
	let showHardwareWalletOptions = $state(false);
	let isConnectingHardwareWallet = $state(false);
	let hardwareWalletConnected = $state(false);
	let hardwareWalletType = $state<'ledger' | 'trezor' | null>(null);

	// Send form
	let sendAmount = $state('');
	let sendAddress = $state('');
	let sendNetworkFee = $state<NetworkFee['type']>('medium'); // low, medium, high
	let sendError = $state('');
	let sendNetwork = $state<'Bitcoin' | 'Lightning' | 'Liquid'>('Bitcoin');
	let sendAssetId = $state(''); // For Liquid assets

	// Receive form
	let requestAmount = $state('');
	let requestDescription = $state('');
	let requestCurrency = $state<'BTC' | 'sats'>('BTC');
	let lightningInvoice = $state('');

	// Subscribe to wallet state
	const unsubscribe = walletStore.subscribe((state) => {
		isWalletInitialized = state.isInitialized && state.encryptionStatus === 'unlocked';
		if (state.addresses.length > 0) {
			selectedAddress = state.addresses.find((a) => a.isDefault) || state.addresses[0];
		}
	});

	onMount(async () => {
		// Check if wallet is already initialized
		const isInitialized = initializeWallet();
		isWalletInitialized = isInitialized;

		// Check hardware wallet support
		const hasHardwareSupport = hardwareWallet.checkHardwareWalletSupport();
		if (hasHardwareSupport) {
			showHardwareWalletOptions = true;
		}

		// Check WebLN availability
		const hasWebLN = lightningWallet.checkWebLNAvailability();
	});

	// Format number with a specific number of decimals
	function formatNumber(number: number, decimals: number): string {
		return number.toFixed(decimals);
	}

	// Convert BTC to sats
	function btcToSats(btc: number): number {
		return Math.floor(btc * 100000000);
	}

	// Convert sats to BTC
	function satsToBtc(sats: number): number {
		return sats / 100000000;
	}

	// Format timestamp to human-readable date
	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Truncate address for display
	function truncateAddress(address: string, prefixLength = 8, suffixLength = 4): string {
		if (address.length <= prefixLength + suffixLength) {
			return address;
		}
		return `${address.substring(0, prefixLength)}...${address.substring(address.length - suffixLength)}`;
	}

	// Copy address to clipboard
	function copyToClipboard(text: string): void {
		navigator.clipboard.writeText(text).then(() => {
			copiedAddress = true;
			setTimeout(() => {
				copiedAddress = false;
			}, 2000);
		});
	}

	// Toggle QR code visibility
	function toggleQR(): void {
		showQR = !showQR;
	}

	// Select address type
	function selectNetwork(type: 'Bitcoin' | 'Lightning' | 'Liquid'): void {
		walletNetwork = type;
		const address = walletStore.subscribe((state) => {
			const found = state.addresses.find((a) => a.type === type);
			if (found) {
				selectedAddress = found;
			}
		})();
	}

	// Create or unlock wallet
	async function setupWallet(): Promise<void> {
		if (!walletPassword) {
			passwordError = 'Please enter a password';
			return;
		}

		isLoading = true;
		passwordError = '';

		try {
			// Try to initialize wallet
			const success = await initializeWallet(walletPassword);

			if (!success) {
				passwordError = 'Failed to setup wallet. Please try again.';
			} else {
				isWalletInitialized = true;
				walletPassword = '';
			}
		} catch (error) {
			console.error('Wallet setup error:', error);
			passwordError = 'An error occurred during wallet setup';
		} finally {
			isLoading = false;
		}
	}

	// Connect hardware wallet
	async function connectHardwareWallet(type: 'ledger' | 'trezor'): Promise<void> {
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
	}

	// Generate a new address
	async function generateNewAddress(): Promise<void> {
		try {
			const newAddress = await generateAddress(walletNetwork);
			if (newAddress) {
				selectedAddress = newAddress;
			}
		} catch (error) {
			console.error('Failed to generate address:', error);
		}
	}

	// Generate a Lightning invoice
	async function generatePaymentRequest(): Promise<void> {
		if (!requestAmount) {
			return;
		}

		try {
			// Convert amount to sats if needed
			const amountSats =
				requestCurrency === 'BTC' ? btcToSats(parseFloat(requestAmount)) : parseInt(requestAmount);

			// Generate invoice
			const invoice = await generateLightningInvoice(
				amountSats,
				requestDescription || 'BitTasker Payment',
				3600 // 1 hour expiry
			);

			lightningInvoice = invoice.paymentRequest;
			showQR = true;
		} catch (error) {
			console.error('Failed to generate payment request:', error);
		}
	}

	// Validate send form
	function validateSendForm(): boolean {
		if (!sendAmount || isNaN(parseFloat(sendAmount)) || parseFloat(sendAmount) <= 0) {
			sendError = 'Please enter a valid amount';
			return false;
		}

		// Get current balance from wallet store
		let insufficientFunds = false;
		walletStore.subscribe((state) => {
			if (parseFloat(sendAmount) > state.balance.btc) {
				insufficientFunds = true;
			}
		})();

		if (insufficientFunds) {
			sendError = 'Insufficient balance';
			return false;
		}

		if (!sendAddress.trim()) {
			sendError = 'Please enter a recipient address';
			return false;
		}

		// Validate address based on network
		const isValidAddress = validateAddress(sendAddress, sendNetwork);
		if (!isValidAddress) {
			sendError = `Invalid ${sendNetwork} address`;
			return false;
		}

		sendError = '';
		return true;
	}

	// Send transaction
	async function _sendTransaction(): Promise<void> {
		if (!validateSendForm()) {
			return;
		}

		isLoading = true;
		try {
			const params = {
				amount: parseFloat(sendAmount),
				recipientAddress: sendAddress,
				networkFee: sendNetworkFee,
				description: 'BitTasker Transfer',
				network: sendNetwork,
				...(sendNetwork === 'Liquid' && sendAssetId ? { assetId: sendAssetId } : {})
			};

			const tx = await sendTransaction(params);

			// Reset form
			sendAmount = '';
			sendAddress = '';
			sendNetworkFee = 'medium';

			// Switch to transactions tab to show the new transaction
			activeTab = 'transactions';
		} catch (error) {
			console.error('Failed to send transaction:', error);
			sendError = 'Failed to send transaction. Please try again.';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Bitcoin Wallet</h2>

	{#if !isWalletInitialized}
		<!-- Wallet Setup Screen -->
		<div class="card bg-base-200">
			<div class="card-body">
				<h3 class="card-title">Setup Your Wallet</h3>

				{#if passwordError}
					<div class="alert alert-error mb-4">
						<span>{passwordError}</span>
					</div>
				{/if}

				<div class="form-control">
					<label class="label" for="walletPassword">
						<span class="label-text">Create a Password</span>
					</label>
					<input
						type="password"
						class="input input-bordered"
						placeholder="Strong password for wallet encryption"
						bind:value={walletPassword}
					/>
					<p class="label-text-alt text-warning">
						This password will encrypt your wallet. If lost, you won't be able to recover your
						funds.
					</p>
				</div>

				<div class="mt-4 flex flex-col gap-2">
					<button class="btn btn-primary" onclick={setupWallet} disabled={isLoading}>
						{isLoading ? 'Setting up...' : 'Create Wallet'}
					</button>

					{#if showHardwareWalletOptions}
						<div class="divider">OR</div>

						<div class="flex gap-2">
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
						</div>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<!-- Tabs -->
		<div class="tabs tabs-boxed mb-6">
			<button
				class="tab {activeTab === 'balance' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'balance')}
			>
				Balance
			</button>
			<button
				class="tab {activeTab === 'receive' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'receive')}
			>
				Receive
			</button>
			<button
				class="tab {activeTab === 'send' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'send')}
			>
				Send
			</button>
			<button
				class="tab {activeTab === 'transactions' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'transactions')}
			>
				Transactions
			</button>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'balance'}
			<div class="space-y-6">
				<!-- Balance Card -->
				{#if $walletStore}
					<div class="card bg-primary text-primary-content">
						<div class="card-body">
							<h3 class="card-title mb-2 text-lg">Total Balance</h3>
							<p class="text-4xl font-bold">{formatNumber($walletStore.balance.btc, 8)} BTC</p>
							<p class="opacity-80">{$walletStore.balance.sats.toLocaleString()} sats</p>
							<p class="opacity-80">≈ ${$walletStore.balance.usdValue.toLocaleString()}</p>
						</div>
					</div>

					<!-- Quick Actions -->
					<div class="grid grid-cols-2 gap-4">
						<button class="btn btn-outline btn-primary" onclick={() => (activeTab = 'receive')}>
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
						<button class="btn btn-outline btn-primary" onclick={() => (activeTab = 'send')}>
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
					</div>

					<!-- Recent Transactions -->
					<div>
						<h3 class="mb-3 text-lg font-semibold">Recent Transactions</h3>
						{#if $walletStore.transactions.length > 0}
							<div class="overflow-x-auto">
								<table class="table w-full">
									<thead>
										<tr>
											<th>Type</th>
											<th>Amount</th>
											<th>Date</th>
											<th>Network</th>
										</tr>
									</thead>
									<tbody>
										{#each $walletStore.transactions.slice(0, 3) as tx}
											<tr>
												<td>
													<div class="flex items-center gap-2">
														{#if tx.type === 'received'}
															<div class="badge badge-success">Received</div>
														{:else}
															<div class="badge badge-warning">Sent</div>
														{/if}
													</div>
												</td>
												<td>
													<span class={tx.type === 'received' ? 'text-success' : 'text-warning'}>
														{tx.type === 'received' ? '+' : '-'}{formatNumber(tx.amount, 8)} BTC
													</span>
												</td>
												<td>{formatDate(tx.timestamp)}</td>
												<td>
													<div class="badge">
														{tx.network}
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							<div class="mt-4 text-center">
								<button class="btn btn-ghost btn-sm" onclick={() => (activeTab = 'transactions')}>
									View all transactions
								</button>
							</div>
						{:else}
							<div class="alert">
								<span>No transactions found.</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if activeTab === 'receive'}
			<div class="space-y-6">
				<h3 class="mb-3 text-lg font-semibold">Receive Bitcoin</h3>

				<!-- Network Selection -->
				<div class="tabs tabs-boxed">
					<button
						class="tab {walletNetwork === 'Bitcoin' ? 'tab-active' : ''}"
						onclick={() => selectNetwork('Bitcoin')}
					>
						Bitcoin
					</button>
					<button
						class="tab {walletNetwork === 'Lightning' ? 'tab-active' : ''}"
						onclick={() => selectNetwork('Lightning')}
					>
						Lightning
					</button>
					<button
						class="tab {walletNetwork === 'Liquid' ? 'tab-active' : ''}"
						onclick={() => selectNetwork('Liquid')}
					>
						Liquid
					</button>
				</div>

				<!-- Address Display -->
				<div class="card bg-base-200">
					<div class="card-body">
						<h4 class="card-title text-base">{walletNetwork} Address</h4>

						{#if selectedAddress}
							<div class="bg-base-300 flex items-center justify-between rounded-lg p-3">
								<div class="font-mono text-sm break-all">
									{selectedAddress.address}
								</div>
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => copyToClipboard(selectedAddress?.address || '')}
								>
									{#if copiedAddress}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fill-rule="evenodd"
												d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
												clip-rule="evenodd"
											/>
										</svg>
									{:else}
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
												d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
											/>
										</svg>
									{/if}
								</button>
							</div>
						{:else}
							<div class="alert">No address available. Generate a new one.</div>
						{/if}

						<div class="mt-4 flex gap-2">
							<button class="btn flex-1" onclick={generateNewAddress}>
								Generate New Address
							</button>
							<button class="btn btn-primary flex-1" onclick={toggleQR}>
								{showQR ? 'Hide QR Code' : 'Show QR Code'}
							</button>
						</div>

						{#if showQR && selectedAddress}
							<div class="mt-4 flex justify-center">
								<div class="rounded-lg bg-white p-4">
									<!-- In a real implementation, this would be an actual QR code -->
									<div class="bg-base-100 flex h-60 w-60 items-center justify-center">
										<span class="text-base-content"
											>QR Code for {truncateAddress(selectedAddress.address)}</span
										>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Request Payment Form (for Lightning) -->
				{#if walletNetwork === 'Lightning'}
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="card-title text-base">Generate Lightning Invoice</h4>

							<div class="form-control">
								<div class="label">
									<span class="label-text">Amount</span>
								</div>
								<div class="input-group">
									<input
										type="number"
										placeholder="0.00000000"
										class="input input-bordered w-full"
										bind:value={requestAmount}
									/>
									<select class="select select-bordered" bind:value={requestCurrency}>
										<option value="BTC">BTC</option>
										<option value="sats">sats</option>
									</select>
								</div>
							</div>

							<div class="form-control mt-4">
								<div class="label">
									<span class="label-text">Description (optional)</span>
								</div>
								<input
									type="text"
									placeholder="What's this payment for?"
									class="input input-bordered w-full"
									bind:value={requestDescription}
								/>
							</div>

							<div class="mt-4">
								<button class="btn btn-primary btn-block" onclick={generatePaymentRequest}>
									Generate Invoice
								</button>
							</div>

							{#if lightningInvoice}
								<div class="mt-4">
									<div class="label">
										<span class="label-text font-semibold">Lightning Invoice</span>
									</div>
									<div class="bg-base-300 flex items-center justify-between rounded-lg p-3">
										<div class="font-mono text-xs break-all">
											{lightningInvoice}
										</div>
										<button
											class="btn btn-ghost btn-sm"
											onclick={() => copyToClipboard(lightningInvoice)}
										>
											{#if copiedAddress}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-5 w-5"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
														clip-rule="evenodd"
													/>
												</svg>
											{:else}
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
														d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
													/>
												</svg>
											{/if}
										</button>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		{#if activeTab === 'send'}
			<div class="space-y-6">
				<h3 class="mb-3 text-lg font-semibold">Send Bitcoin</h3>

				<!-- Network Selection -->
				<div class="tabs tabs-boxed mb-4">
					<button
						class="tab {sendNetwork === 'Bitcoin' ? 'tab-active' : ''}"
						onclick={() => (sendNetwork = 'Bitcoin')}
					>
						Bitcoin
					</button>
					<button
						class="tab {sendNetwork === 'Lightning' ? 'tab-active' : ''}"
						onclick={() => (sendNetwork = 'Lightning')}
					>
						Lightning
					</button>
					<button
						class="tab {sendNetwork === 'Liquid' ? 'tab-active' : ''}"
						onclick={() => (sendNetwork = 'Liquid')}
					>
						Liquid
					</button>
				</div>

				<!-- Send Form -->
				<div class="card bg-base-200">
					<div class="card-body">
						{#if sendError}
							<div class="alert alert-error mb-4">
								<div>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-6 w-6 flex-shrink-0 stroke-current"
										fill="none"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
										/></svg
									>
									<span>{sendError}</span>
								</div>
							</div>
						{/if}

						<div class="form-control">
							<div class="label">
								<span class="label-text">Recipient {sendNetwork} Address</span>
							</div>
							<div class="input-group">
								<input
									type="text"
									placeholder={sendNetwork === 'Bitcoin'
										? 'Bitcoin address'
										: sendNetwork === 'Lightning'
											? 'Lightning invoice or address'
											: 'Liquid address'}
									class="input input-bordered w-full"
									bind:value={sendAddress}
								/>
								<button aria-label="Scan QR Code" class="btn">
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
											d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
										/>
									</svg>
								</button>
							</div>
						</div>

						<!-- Amount field in the send form -->
						<div class="form-control mt-4">
							<div class="label">
								<span class="label-text">Amount</span>
								{#if $walletStore}
									<span class="label-text-alt">
										Available: {formatNumber($walletStore.balance.btc, 8)} BTC
									</span>
								{/if}
							</div>
							<div class="input-group">
								<input
									type="number"
									placeholder="0.00000000"
									step="0.00000001"
									class="input input-bordered w-full"
									bind:value={sendAmount}
								/>
								<select class="select select-bordered">
									<option value="BTC">BTC</option>
									<option value="sats">sats</option>
								</select>
							</div>
						</div>

						{#if sendNetwork === 'Bitcoin' || sendNetwork === 'Liquid'}
							<div class="form-control mt-4">
								<div class="label">
									<span class="label-text">Transaction Fee</span>
								</div>
								<div class="btn-group w-full">
									<button
										class="btn flex-1 {sendNetworkFee === 'low' ? 'btn-active' : ''}"
										onclick={() => (sendNetworkFee = 'low')}
									>
										Low
									</button>
									<button
										class="btn flex-1 {sendNetworkFee === 'medium' ? 'btn-active' : ''}"
										onclick={() => (sendNetworkFee = 'medium')}
									>
										Medium
									</button>
									<button
										class="btn flex-1 {sendNetworkFee === 'high' ? 'btn-active' : ''}"
										onclick={() => (sendNetworkFee = 'high')}
									>
										High
									</button>
								</div>
								<div class="text-base-content/70 mt-2 text-sm">
									{#if sendNetworkFee === 'low'}
										Estimated confirmation time: ~60 minutes
									{:else if sendNetworkFee === 'medium'}
										Estimated confirmation time: ~20 minutes
									{:else}
										Estimated confirmation time: ~10 minutes
									{/if}
								</div>
							</div>
						{/if}

						{#if sendNetwork === 'Liquid'}
							<div class="form-control mt-4">
								<div class="label">
									<span class="label-text">Asset Type</span>
								</div>
								<select class="select select-bordered w-full">
									<option value="">L-BTC (default)</option>
									<option value="ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2">
										Tether USD (USDt)
									</option>
								</select>
							</div>
						{/if}

						<div class="mt-6">
							<button
								class="btn btn-primary btn-block"
								onclick={_sendTransaction}
								disabled={isLoading}
							>
								{isLoading ? 'Sending...' : `Send ${sendNetwork}`}
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if activeTab === 'transactions'}
			<div class="space-y-6">
				<h3 class="mb-3 text-lg font-semibold">Transaction History</h3>

				<div class="tabs tabs-boxed mb-4">
					<button
						class="tab {walletNetwork === 'Bitcoin' ? 'tab-active' : ''}"
						onclick={() => selectNetwork('Bitcoin')}
					>
						Bitcoin
					</button>
					<button
						class="tab {walletNetwork === 'Lightning' ? 'tab-active' : ''}"
						onclick={() => selectNetwork('Lightning')}
					>
						Lightning
					</button>
					<button
						class="tab {walletNetwork === 'Liquid' ? 'tab-active' : ''}"
						onclick={() => selectNetwork('Liquid')}
					>
						Liquid
					</button>
					<button
						class="tab {walletNetwork === null ? 'tab-active' : ''}"
						onclick={() => (walletNetwork = null)}
					>
						All
					</button>
				</div>

				{#if $walletStore}
					{#if $walletStore.transactions.length > 0}
						{@const filteredTxs = walletNetwork
							? $walletStore.transactions.filter((tx) => tx.network === walletNetwork)
							: $walletStore.transactions}
						{#if filteredTxs.length > 0}
							<div class="overflow-x-auto">
								<table class="table w-full">
									<thead>
										<tr>
											<th>Type</th>
											<th>Amount</th>
											<th>Date</th>
											<th>Address</th>
											<th>Status</th>
											<th>Network</th>
										</tr>
									</thead>
									<tbody>
										{#each filteredTxs as tx}
											<tr>
												<td>
													<div class="flex items-center gap-2">
														{#if tx.type === 'received'}
															<div class="badge badge-success">Received</div>
														{:else}
															<div class="badge badge-warning">Sent</div>
														{/if}
													</div>
												</td>
												<td>
													<span class={tx.type === 'received' ? 'text-success' : 'text-warning'}>
														{tx.type === 'received' ? '+' : '-'}{formatNumber(tx.amount, 8)} BTC
													</span>
												</td>
												<td>{formatDate(tx.timestamp)}</td>
												<td>
													{#if tx.type === 'received'}
														<span class="font-mono text-xs">From: {truncateAddress(tx.sender)}</span
														>
													{:else}
														<span class="font-mono text-xs"
															>To: {truncateAddress(tx.recipient)}</span
														>
													{/if}
												</td>
												<td>
													{#if tx.network === 'Lightning'}
														<div class="badge badge-success">Confirmed</div>
													{:else if tx.confirmations === 0}
														<div class="badge badge-warning">Pending</div>
													{:else}
														<div class="indicator">
															<span class="indicator-item badge badge-xs">
																{tx.confirmations}
															</span>
															<div class="badge badge-success">Confirmations</div>
														</div>
													{/if}
												</td>
												<td>
													<div class="badge">
														{tx.network}
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<div class="alert">
								<span>No {walletNetwork} transactions found.</span>
							</div>
						{/if}
					{:else}
						<div class="alert">
							<span>No transactions found.</span>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}
</div>
