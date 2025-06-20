<script lang="ts">
	import { wallet } from '$lib/utils/consts';
	import { getMnemonic } from '$lib/wallet/helper';
	import { goto } from '$app/navigation';
	import BalanceCard from './_components/balanceTab/BalanceCard.svelte';
	import RecentTransactions from './_components/balanceTab/RecentTransactions.svelte';
	// import NetworkSelection from './_components/receiveTab/NetworkSelection.svelte';
	import TransactionHistory from './_components/transactionsTab/TransactionHistory.svelte';
	// UI state
	let activeTab = $state('balance'); // balance, receive, send, transactions
	let selectedAddress = $state(wallet.addresses.find((a) => a.isDefault) || wallet.addresses[0]);
	let showQR = $state(false);

	// Send form
	let sendAmount = $state('');
	let sendAddress = $state('');
	let sendNetworkFee = $state('medium'); // low, medium, high
	let sendError = $state('');

	// Format number with a specific number of decimals
	function formatNumber(number: number, decimals: number): string {
		return number.toFixed(decimals);
	}

	// Select address type
	function selectAddress(type: string): void {
		const found = wallet.addresses.find((a) => a.type === type);
		if (found) {
			selectedAddress = found;
		}
	}

	// Validate send form
	function validateSendForm(): boolean {
		if (!sendAmount || isNaN(parseFloat(sendAmount)) || parseFloat(sendAmount) <= 0) {
			sendError = 'Please enter a valid amount';
			return false;
		}

		if (parseFloat(sendAmount) > wallet.balance.btc) {
			sendError = 'Insufficient balance';
			return false;
		}

		if (!sendAddress.trim()) {
			sendError = 'Please enter a recipient address';
			return false;
		}

		sendError = '';
		return true;
	}

	// Send transaction
	function sendTransaction(): void {
		if (!validateSendForm()) {
			return;
		}

		// In a real implementation, this would call an API to send the transaction
		alert(`Transaction initiated: ${sendAmount} BTC to ${sendAddress}`);

		// Reset form
		sendAmount = '';
		sendAddress = '';
		sendNetworkFee = 'medium';
	}

	$effect.pre(() => {
		getMnemonic()
			.then(() => {
				console.log('mnemonic found, staying on wallet page');
			})
			.catch((error) => {
				console.error('Error getting mnemonic', error);
				goto('/dashboard/wallet/error?type=no-mnemonic');
				return;
			});
	});
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Bitcoin Wallet</h2>

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
			<BalanceCard />

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
			<RecentTransactions {activeTab} />
		</div>
	{/if}

	{#if activeTab === 'receive'}
		<div class="space-y-6">
			<h3 class="mb-3 text-lg font-semibold">Receive Bitcoin</h3>

			<!-- Network Selection -->
			<!-- TODO: Implement this section -->
			<!-- <NetworkSelection /> -->

			<!-- Request Payment Form -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h4 class="card-title text-base">Request Specific Amount</h4>

					<div class="form-control">
						<div class="label">
							<span class="label-text">Amount (BTC)</span>
						</div>
						<div class="input-group">
							<input type="number" placeholder="0.00000000" class="input input-bordered w-full" />
							<select class="select select-bordered">
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
						/>
					</div>

					<div class="mt-4">
						<button class="btn btn-primary btn-block"> Generate Payment Request </button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'send'}
		<div class="space-y-6">
			<h3 class="mb-3 text-lg font-semibold">Send Bitcoin</h3>

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
							<span class="label-text">Recipient Address</span>
						</div>
						<div class="input-group">
							<input
								type="text"
								placeholder="Bitcoin, Lightning, or Liquid address"
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

					<div class="form-control mt-4">
						<div class="label">
							<span class="label-text">Amount</span>
							<span class="label-text-alt"
								>Available: {formatNumber(wallet.balance.btc, 8)} BTC</span
							>
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

					<div class="form-control mt-4">
						<div class="label">
							<span class="label-text">Description (optional)</span>
						</div>
						<input
							type="text"
							placeholder="What's this payment for?"
							class="input input-bordered w-full"
						/>
					</div>

					<div class="mt-6">
						<button class="btn btn-primary btn-block" onclick={sendTransaction}>
							Send Bitcoin
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'transactions'}
		<TransactionHistory />
	{/if}
</div>
