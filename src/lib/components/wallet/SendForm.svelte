<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { allAssets, walletManager, liquidConnection, rskConnection } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import type { WalletAsset } from '$lib/stores/wallet.store';

	// Form state
	let selectedNetwork = $state<'liquid' | 'rsk'>('liquid');
	let selectedAsset = $state<string>('L-BTC');
	let recipientAddress = $state('');
	let amount = $state('');
	let description = $state('');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let feeEstimate = $state<number | null>(null);

	// Available assets based on selected network
	let availableAssets = $derived(
		$allAssets.filter(asset => {
			if (selectedNetwork === 'liquid') {
				return asset.network === 'Liquid' || asset.network === 'Bitcoin';
			} else {
				return asset.network === 'RSK';
			}
		})
	);

	// Auto-select first available asset when network changes
	$effect(() => {
		if (availableAssets.length > 0 && !availableAssets.find(a => a.assetId === selectedAsset)) {
			selectedAsset = availableAssets[0].assetId;
		}
	});

	// Get current asset info
	let currentAsset = $derived(availableAssets.find(asset => asset.assetId === selectedAsset));

	// Validate form
	let isFormValid = $derived(recipientAddress.trim() !== '' && 
					 amount.trim() !== '' && 
					 parseFloat(amount) > 0 && 
					 currentAsset && 
					 parseFloat(amount) <= currentAsset.balance);

	// Network options
	const networkOptions = [
		{
			value: 'liquid',
			label: 'Liquid Network',
			description: 'Lightning, Bitcoin, L-BTC, USDT',
			icon: '🌊',
			disabled: !$liquidConnection.connected
		},
		{
			value: 'rsk',
			label: 'Rootstock Network',
			description: 'rBTC, Smart Contracts',
			icon: '⚡',
			disabled: !$rskConnection.connected
		}
	];

	async function handleSend() {
		if (!isFormValid || !currentAsset) return;

		isLoading = true;
		errorMessage = null;

		try {
			if (selectedNetwork === 'rsk') {
				await walletManager.sendRBTC(recipientAddress, amount);
			} else {
				throw new Error('Liquid transactions not yet implemented');
			}

			// Reset form on success
			recipientAddress = '';
			amount = '';
			description = '';
			appStore.showSuccessToast($t('wallet.send.transaction_sent'));
		} catch (error) {
			console.error('Send transaction error:', error);
			errorMessage = error instanceof Error ? error.message : $t('wallet.send.transaction_failed');
		} finally {
			isLoading = false;
		}
	}

	function handleMaxAmount() {
		if (currentAsset) {
			// Subtract estimated fees
			const maxAmount = Math.max(0, currentAsset.balance - (feeEstimate || 0.001));
			amount = maxAmount.toString();
		}
	}
</script>

<div class="space-y-6">

	{#if errorMessage}
		<div class="alert alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{errorMessage}</span>
		</div>
	{/if}

	<!-- Network Selection -->
	<div class="form-control">
		<label class="label" for="network-select">
			<span class="label-text font-medium">{$t('wallet.select_network')}</span>
		</label>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			{#each networkOptions as network}
				<label class="cursor-pointer">
					<input
						type="radio"
						bind:group={selectedNetwork}
						value={network.value}
						disabled={network.disabled}
						class="sr-only"
					/>
					<div class="card {selectedNetwork === network.value ? 'border-primary border-2' : 'border border-base-300'} {network.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'} transition-colors">
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								<span class="text-2xl">{network.icon}</span>
								<div class="flex-1">
									<div class="font-semibold">{network.label}</div>
									<div class="text-sm opacity-70">{network.description}</div>
								</div>
								{#if selectedNetwork === network.value}
									<div class="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
										<div class="w-2 h-2 rounded-full bg-white"></div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</label>
			{/each}
		</div>
	</div>

	<!-- Asset Selection -->
	{#if availableAssets.length > 0}
		<div class="form-control">
			<label class="label" for="asset-select">
				<span class="label-text font-medium">{$t('wallet.select_asset')}</span>
			</label>
			<select
				id="asset-select"
				bind:value={selectedAsset}
				class="select select-bordered w-full"
				disabled={availableAssets.length <= 1}
			>
				{#each availableAssets as asset}
					<option value={asset.assetId}>
						{asset.icon} {asset.ticker} - {asset.formattedBalance} {$t('wallet.available_balance')}
					</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Recipient Address -->
	<div class="form-control">
		<label class="label" for="recipient-address">
			<span class="label-text font-medium">{$t('wallet.recipient_address')}</span>
		</label>
		<input
			id="recipient-address"
			bind:value={recipientAddress}
			placeholder={selectedNetwork === 'liquid' 
				? $t('wallet.address_placeholder') 
				: $t('wallet.rsk_address_placeholder')}
			class="input input-bordered w-full"
			disabled={isLoading}
		/>
	</div>

	<!-- Amount -->
	<div class="form-control">
		<label class="label" for="amount">
			<span class="label-text font-medium">
				{$t('wallet.amount_btc')} ({currentAsset?.ticker || ''})
			</span>
			{#if currentAsset}
				<span class="label-text-alt">
					{$t('wallet.available_balance')}: {currentAsset.formattedBalance}
				</span>
			{/if}
		</label>
		<div class="join">
			<input
				id="amount"
				bind:value={amount}
				type="number"
				step="any"
				min="0"
				max={currentAsset?.balance}
				placeholder="0.00"
				class="input input-bordered join-item flex-1"
				disabled={isLoading}
			/>
			<button
				class="btn btn-outline join-item"
				onclick={handleMaxAmount}
				disabled={isLoading || !currentAsset}
			>
				{$t('wallet.max')}
			</button>
		</div>
	</div>

	<!-- Description -->
	<div class="form-control">
		<label class="label" for="description">
			<span class="label-text font-medium">{$t('wallet.description_optional')}</span>
		</label>
		<input
			id="description"
			bind:value={description}
			placeholder={$t('wallet.description_placeholder')}
			class="input input-bordered w-full"
			disabled={isLoading}
		/>
	</div>

	<!-- Fee Estimate -->
	{#if feeEstimate !== null}
		<div class="alert alert-info">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>
				{$t('wallet.transaction_fee')}: {feeEstimate} 
				{selectedNetwork === 'liquid' ? 'sats' : 'rBTC'}
			</span>
		</div>
	{/if}

	<!-- Send Button -->
	<button
		class="btn btn-primary w-full"
		onclick={handleSend}
		disabled={!isFormValid || isLoading}
	>
		{#if isLoading}
			<span class="loading loading-spinner loading-sm"></span>
			{$t('wallet.send.processing')}
		{:else}
			{$t('wallet.send_bitcoin')}
		{/if}
	</button>

	<!-- Network Status Info -->
	<div class="text-center text-sm opacity-70">
		{#if selectedNetwork === 'liquid'}
			<p>{$t('wallet.liquid_info')}</p>
		{:else}
			<p>{$t('wallet.rsk_info')}</p>
		{/if}
	</div>
</div>

