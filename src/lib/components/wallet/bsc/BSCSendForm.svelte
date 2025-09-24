<script lang="ts">
	import { t } from 'svelte-i18n';
	import { bscUsdtWalletStore, bscUsdtWallet, bscCanPayFeesInUsdt } from '$lib/stores/bscUsdtWallet.store';
	import { BSC_NETWORKS } from '$lib/stores/bscUsdtWallet.store';

	let recipientAddress = $state('');
	let amount = $state('');
	let selectedToken = $state('USDT');
	let payFeesInUsdt = $state(false);
	let isLoading = $state(false);
	let error = $state('');
	let gasEstimate = $state<{ gasLimit: string; gasPrice: string; totalCost: string; totalCostFormatted: string; usdtCost?: string } | null>(null);

	// Get current network info
	const networkInfo = $derived(BSC_NETWORKS[$bscUsdtWalletStore.network]);
	const availableTokens = $derived(networkInfo.tokens);

	// Validate recipient address
	function isValidAddress(address: string): boolean {
		return /^0x[a-fA-F0-9]{40}$/.test(address);
	}

	// Validate amount
	function isValidAmount(amount: string): boolean {
		const num = parseFloat(amount);
		return !isNaN(num) && num > 0;
	}

	// Estimate gas when inputs change
	async function estimateGas() {
		if (!recipientAddress || !amount || !isValidAddress(recipientAddress) || !isValidAmount(amount)) {
			gasEstimate = null;
			return;
		}

		try {
			if (selectedToken === 'USDT') {
				gasEstimate = await bscUsdtWallet.estimateUSDTGas(recipientAddress, amount, payFeesInUsdt);
			} else if (selectedToken === 'BNB') {
				gasEstimate = await bscUsdtWallet.estimateBNBGas(recipientAddress, amount);
			}
		} catch (err) {
			console.error('Gas estimation failed:', err);
			gasEstimate = null;
		}
	}

	// Watch for input changes
	$effect(() => {
		estimateGas();
	});

	// Handle form submission
	async function handleSubmit() {
		if (!recipientAddress || !amount) {
			error = 'Please fill in all fields';
			return;
		}

		if (!isValidAddress(recipientAddress)) {
			error = $t('wallet.bsc.error.invalid_recipient_address');
			return;
		}

		if (!isValidAmount(amount)) {
			error = $t('wallet.bsc.error.invalid_amount');
			return;
		}

		isLoading = true;
		error = '';

		try {
			let txHash: string;

			if (selectedToken === 'USDT') {
				txHash = await bscUsdtWallet.sendUSDT(recipientAddress, amount, payFeesInUsdt);
			} else if (selectedToken === 'BNB') {
				txHash = await bscUsdtWallet.sendBNB(recipientAddress, amount);
			} else {
				throw new Error('Invalid token selection');
			}

		// Reset form on success
		recipientAddress = '';
		amount = '';
		gasEstimate = null;

		// Show success message (you could use a toast notification here)
		console.log('Transaction sent:', txHash);

	} catch (err) {
		error = err instanceof Error ? err.message : $t('wallet.bsc.error.transaction_failed');
	} finally {
		isLoading = false;
	}
	}

	// Copy address to clipboard
	async function copyAddress() {
		if ($bscUsdtWalletStore.address) {
			try {
				await navigator.clipboard.writeText($bscUsdtWalletStore.address);
				// You could show a toast notification here
			} catch (err) {
				console.error('Failed to copy address:', err);
			}
		}
	}
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<h3 class="card-title mb-4">{$t('wallet.bsc.send_token', { values: { token: selectedToken } })}</h3>

		<!-- Token Selection -->
		<div class="form-control mb-4">
			<label class="label" for="send-token-select">
				<span class="label-text">{$t('wallet.bsc.token')}</span>
			</label>
			<select 
				id="send-token-select"
				bind:value={selectedToken} 
				class="select select-bordered w-full"
			>
				<option value="USDT">USDT</option>
				<option value="BNB">BNB</option>
			</select>
		</div>

		<!-- Recipient Address -->
		<div class="form-control mb-4">
			<label class="label" for="recipient-address">
				<span class="label-text">{$t('wallet.bsc.recipient_address')}</span>
			</label>
			<input
				id="recipient-address"
				type="text"
				bind:value={recipientAddress}
				placeholder="0x..."
				class="input input-bordered w-full"
				class:input-error={recipientAddress && !isValidAddress(recipientAddress)}
			/>
			{#if recipientAddress && !isValidAddress(recipientAddress)}
				<div class="label">
					<span class="label-text-alt text-error">{$t('wallet.bsc.invalid_address')}</span>
				</div>
			{/if}
		</div>

		<!-- Amount -->
		<div class="form-control mb-4">
			<label class="label" for="amount-input">
				<span class="label-text">{$t('wallet.bsc.amount')} ({selectedToken})</span>
			</label>
			<input
				id="amount-input"
				type="number"
				bind:value={amount}
				placeholder="0.00"
				step="0.000001"
				min="0"
				class="input input-bordered w-full"
				class:input-error={amount && !isValidAmount(amount)}
			/>
			{#if amount && !isValidAmount(amount)}
				<div class="label">
					<span class="label-text-alt text-error">{$t('wallet.bsc.invalid_amount')}</span>
				</div>
			{/if}
		</div>

		<!-- Fee Payment Option (only for USDT) -->
		{#if selectedToken === 'USDT' && $bscCanPayFeesInUsdt}
			<div class="form-control mb-4">
				<label class="label cursor-pointer">
					<span class="label-text">{$t('wallet.bsc.pay_fees_in_usdt')}</span>
					<input 
						type="checkbox" 
						bind:checked={payFeesInUsdt}
						class="checkbox checkbox-primary" 
					/>
				</label>
			</div>
		{/if}

		<!-- Gas Estimate -->
		{#if gasEstimate}
			<div class="alert alert-info mb-4">
				<div class="flex-1">
					<div class="text-sm font-medium">{$t('wallet.bsc.gas_estimate')}</div>
					<div class="text-xs">
						{$t('wallet.bsc.gas_limit')}: {gasEstimate.gasLimit}
					</div>
					<div class="text-xs">
						{$t('wallet.bsc.gas_price')}: {gasEstimate.gasPrice} wei
					</div>
					<div class="text-xs">
						{$t('wallet.bsc.total_cost')}: {gasEstimate.totalCostFormatted} BNB
					</div>
					{#if gasEstimate.usdtCost}
						<div class="text-xs">
							{$t('wallet.bsc.usdt_cost')}: {gasEstimate.usdtCost} USDT
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Error Message -->
		{#if error}
			<div class="alert alert-error mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		<!-- Submit Button -->
		<div class="card-actions justify-end">
			<button 
				class="btn btn-primary"
				onclick={handleSubmit}
				disabled={isLoading || !recipientAddress || !amount || !isValidAddress(recipientAddress) || !isValidAmount(amount)}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('wallet.bsc.sending')}
				{:else}
					{$t('wallet.bsc.send_token', { values: { token: selectedToken } })}
				{/if}
			</button>
		</div>

		<!-- Your Address -->
		<div class="divider"></div>
		<div class="text-center">
			<div class="text-sm text-base-content/70 mb-2">{$t('wallet.bsc.your_address')}</div>
			<div class="text-xs font-mono break-all bg-base-200 p-2 rounded">
				{$bscUsdtWalletStore.address || $t('wallet.bsc.not_connected')}
			</div>
			<button 
				class="btn btn-sm btn-outline mt-2"
				onclick={copyAddress}
				disabled={!$bscUsdtWalletStore.address}
			>
				{$t('wallet.bsc.copy_address')}
			</button>
		</div>
	</div>
</div>
