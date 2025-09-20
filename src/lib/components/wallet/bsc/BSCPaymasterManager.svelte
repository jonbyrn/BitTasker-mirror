<script lang="ts">
	import { t } from 'svelte-i18n';
	import { bscUsdtWalletStore, bscUsdtWallet, bscCanPayFeesInUsdt } from '$lib/stores/bscUsdtWallet.store';

	let depositAmount = $state('');
	let withdrawAmount = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let paymasterStatus = $state<{
		hasDeposit: boolean;
		depositAmount: string;
		canPayInUsdt: boolean;
		usdtPrice: string;
		minDeposit: string;
	} | null>(null);

	// Load paymaster status
	async function loadPaymasterStatus() {
		try {
			paymasterStatus = await bscUsdtWallet.getPaymasterStatus();
		} catch (err) {
			console.error('Failed to load paymaster status:', err);
		}
	}

	// Deposit BNB to paymaster
	async function handleDeposit() {
		if (!depositAmount || parseFloat(depositAmount) <= 0) {
			error = 'Please enter a valid deposit amount';
			return;
		}

		isLoading = true;
		error = '';

		try {
			const txHash = await bscUsdtWallet.depositToPaymaster(depositAmount);
			depositAmount = '';
			await loadPaymasterStatus();
			console.log('Deposit successful:', txHash);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Deposit failed';
		} finally {
			isLoading = false;
		}
	}

	// Withdraw BNB from paymaster
	async function handleWithdraw() {
		if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
			error = 'Please enter a valid withdraw amount';
			return;
		}

		isLoading = true;
		error = '';

		try {
			const txHash = await bscUsdtWallet.withdrawFromPaymaster(withdrawAmount);
			withdrawAmount = '';
			await loadPaymasterStatus();
			console.log('Withdraw successful:', txHash);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Withdraw failed';
		} finally {
			isLoading = false;
		}
	}

	// Load status on mount
	$effect(() => {
		if ($bscUsdtWalletStore.isConnected) {
			loadPaymasterStatus();
		}
	});
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<h3 class="card-title mb-4">{$t('wallet.bsc.paymaster_manager')}</h3>

		<!-- Paymaster Status -->
		{#if paymasterStatus}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
				<div class="stat bg-base-200 rounded-lg">
					<div class="stat-title">{$t('wallet.bsc.deposit_status')}</div>
					<div class="stat-value text-lg">
						{paymasterStatus.hasDeposit ? '✅ ' + $t('wallet.bsc.active') : '❌ ' + $t('wallet.bsc.inactive')}
					</div>
					<div class="stat-desc">
						{paymasterStatus.depositAmount} {$t('wallet.bsc.bnb_deposited')}
					</div>
				</div>

				<div class="stat bg-base-200 rounded-lg">
					<div class="stat-title">{$t('wallet.bsc.usdt_fee_payment')}</div>
					<div class="stat-value text-lg">
						{paymasterStatus.canPayInUsdt ? '✅ ' + $t('wallet.bsc.enabled') : '❌ ' + $t('wallet.bsc.disabled')}
					</div>
					<div class="stat-desc">
						{$t('wallet.bsc.usdt_bnb_rate', { values: { rate: paymasterStatus.usdtPrice } })}
					</div>
				</div>
			</div>

			<!-- Minimum Deposit Info -->
			<div class="alert alert-info mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<div>
					<div class="font-bold">{$t('wallet.bsc.minimum_deposit_required')}</div>
					<div class="text-sm">{$t('wallet.bsc.minimum_deposit_description', { values: { amount: paymasterStatus.minDeposit } })}</div>
				</div>
			</div>
		{/if}

		<!-- Deposit Section -->
		<div class="form-control mb-4">
			<label class="label">
				<span class="label-text">{$t('wallet.bsc.deposit_bnb_to_paymaster')}</span>
			</label>
			<div class="input-group">
				<input
					type="number"
					bind:value={depositAmount}
					placeholder="0.0"
					step="0.001"
					min="0"
					class="input input-bordered flex-1"
				/>
				<span class="btn btn-outline">BNB</span>
			</div>
			<button 
				class="btn btn-primary mt-2"
				onclick={handleDeposit}
				disabled={isLoading || !depositAmount || parseFloat(depositAmount) <= 0}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('wallet.bsc.depositing')}
				{:else}
					{$t('wallet.bsc.deposit_bnb_to_paymaster')}
				{/if}
			</button>
		</div>

		<!-- Withdraw Section -->
		<div class="form-control mb-4">
			<label class="label">
				<span class="label-text">{$t('wallet.bsc.withdraw_bnb_from_paymaster')}</span>
			</label>
			<div class="input-group">
				<input
					type="number"
					bind:value={withdrawAmount}
					placeholder="0.0"
					step="0.001"
					min="0"
					class="input input-bordered flex-1"
				/>
				<span class="btn btn-outline">BNB</span>
			</div>
			<button 
				class="btn btn-secondary mt-2"
				onclick={handleWithdraw}
				disabled={isLoading || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('wallet.bsc.withdrawing')}
				{:else}
					{$t('wallet.bsc.withdraw_bnb_from_paymaster')}
				{/if}
			</button>
		</div>

		<!-- Error Message -->
		{#if error}
			<div class="alert alert-error mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		<!-- Refresh Button -->
		<div class="card-actions justify-end">
			<button 
				class="btn btn-outline btn-sm"
				onclick={loadPaymasterStatus}
				disabled={isLoading}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
				</svg>
				{$t('wallet.bsc.refresh_status')}
			</button>
		</div>

		<!-- EIP-7702 Info -->
		<div class="alert alert-success mt-4">
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<div>
				<div class="font-bold">{$t('wallet.bsc.eip7702_info')}</div>
				<div class="text-sm">
					{$t('wallet.bsc.eip7702_description')}
				</div>
			</div>
		</div>
	</div>
</div>
