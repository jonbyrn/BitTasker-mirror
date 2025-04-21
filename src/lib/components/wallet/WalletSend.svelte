<!-- WalletSend.svelte -->
<script lang="ts">
	import type { NetworkFee } from '$lib/types/wallet';
	import { walletStore } from '$lib/stores/wallet.store';

	let { onTabChange } = $props<{ onTabChange: (tab: string) => void }>();

	// Component state
	let sendAmount = $state('');
	let sendAddress = $state('');
	let sendNetworkFee = $state<NetworkFee['type']>('medium'); // low, medium, high
	let sendError = $state('');
	let sendNetwork = $state<'Bitcoin' | 'Lightning' | 'Liquid'>('Bitcoin');
	let sendAssetId = $state(''); // For Liquid assets
	let isLoading = $state(false);

	// Functions
	function formatNumber(number: number, decimals: number): string {
		return number.toFixed(decimals);
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
		// In a real implementation, this would call an address validation service
		// For now, we'll assume all addresses are valid
		const isValidAddress = true;
		if (!isValidAddress) {
			sendError = `Invalid ${sendNetwork} address`;
			return false;
		}

		sendError = '';
		return true;
	}

	// Send transaction
	async function sendTransaction(): Promise<void> {
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

			const tx = await walletStore.sendTransaction(params);

			// Reset form on success
			if (tx) {
				sendAmount = '';
				sendAddress = '';
				sendNetworkFee = 'medium';
				sendError = '';
			}
		} catch (error) {
			console.error('Failed to send transaction:', error);
			sendError = 'Failed to send transaction. Please try again.';
		} finally {
			isLoading = false;
		}
	}
</script>

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
					<select class="select select-bordered w-full" bind:value={sendAssetId}>
						<option value="">L-BTC (default)</option>
						<option value="ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2">
							Tether USD (USDt)
						</option>
					</select>
				</div>
			{/if}

			<div class="mt-6">
				<button class="btn btn-primary btn-block" onclick={sendTransaction} disabled={isLoading}>
					{isLoading ? 'Sending...' : `Send ${sendNetwork}`}
				</button>
			</div>
		</div>
	</div>
</div>
