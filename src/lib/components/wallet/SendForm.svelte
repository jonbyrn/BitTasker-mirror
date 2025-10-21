<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { allAssets, walletManager, liquidConnection, rskConnection } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import type { WalletAsset } from '$lib/types/wallet';

	// Extended asset type that includes Lightning Bitcoin
	type ExtendedAsset = WalletAsset | {
		assetId: string;
		name: string;
		ticker: string;
		network: string;
		balance: number;
		formattedBalance: string;
		icon: string | null;
	};

	// Form state
	let selectedAsset = $state<'bitcoin' | 'usd'>('bitcoin');
	let selectedNetwork = $state<string>('lightning-bitcoin');
	let recipientAddress = $state('');
	let amount = $state('');
	let description = $state('');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let feeEstimate = $state<number | null>(null);
	let dropdownKey = $state(0);

	// Asset options (Bitcoin and USD)
	let assetOptions = $derived([
		{
			value: 'bitcoin',
			label: 'Bitcoin',
			description: 'Bitcoin and Bitcoin-based networks',
			icon: '/images/chains/Bitcoin.svg',
			disabled: false
		},
		{
			value: 'usd',
			label: 'USD',
			description: 'USD-pegged stablecoins',
			icon: '/images/chains/Tether-USD.svg',
			disabled: false
		}
	]);

	// Network options based on selected asset
	let networkOptions = $derived(() => {
		if (selectedAsset === 'bitcoin') {
			return [
				{
					value: 'lightning-bitcoin',
					label: 'Lightning Bitcoin',
					description: 'Lightning Network payments',
					icon: null // Will use lightning icon
				},
				{
					value: 'rootstock-bitcoin',
					label: 'L2 BTC',
					description: 'rBTC on Rootstock network',
					icon: '/images/chains/Bitcoin-Rootstock-logo.webp'
				},
				{
					value: 'liquid-bitcoin',
					label: 'Liquid Bitcoin',
					description: 'L-BTC on Liquid network',
					icon: '/images/chains/Liquid-Bitcoin.svg'
				},
				{
					value: 'bitcoin',
					label: 'Bitcoin',
					description: 'Native Bitcoin network',
					icon: '/images/chains/Bitcoin.svg'
				}
			];
		} else {
			return [
				{
					value: 'liquid-usdt',
					label: 'Liquid USDT',
					description: 'USDT on Liquid network',
					icon: '/images/chains/Tether-USD.svg'
				}
			];
		}
	});

	// Get selected network info
	let selectedNetworkInfo = $derived(
		networkOptions().find(network => network.value === selectedNetwork)
	);

	// Available assets based on selected network
	let availableAssets = $derived(() => {
		if (selectedAsset === 'bitcoin') {
			if (selectedNetwork === 'rootstock-bitcoin') {
				return $allAssets.filter(asset => asset.network === 'RSK');
			} else if (selectedNetwork === 'liquid-bitcoin') {
				return $allAssets.filter(asset => asset.network === 'Liquid' || asset.network === 'Bitcoin');
			} else if (selectedNetwork === 'lightning-bitcoin') {
				// For Lightning Bitcoin, show Rootstock balance since it will be swapped
				const rskAssets = $allAssets.filter(asset => asset.network === 'RSK');
				const lightningAsset: ExtendedAsset = {
					assetId: 'lightning-bitcoin',
					name: 'Lightning Bitcoin',
					ticker: 'BTC',
					network: 'Lightning',
					balance: rskAssets.length > 0 ? rskAssets[0].balance : 0,
					formattedBalance: rskAssets.length > 0 ? rskAssets[0].formattedBalance : '0.00 BTC',
					icon: null
				};
				return [lightningAsset];
			} else if (selectedNetwork === 'bitcoin') {
				return $allAssets.filter(asset => asset.network === 'Bitcoin');
			}
		} else if (selectedAsset === 'usd') {
			return $allAssets.filter(asset => asset.network === 'Liquid' && asset.ticker === 'USDT');
		}
		return [];
	});

	// Auto-select first available network when asset changes
	$effect(() => {
		const networks = networkOptions();
		if (networks.length > 0 && !networks.find(n => n.value === selectedNetwork)) {
			selectedNetwork = networks[0].value;
		}
	});

	// Get current asset info based on selected network
	let currentAsset = $derived(() => {
		const assets = availableAssets();
		if (assets.length > 0) {
			return assets[0]; // Return the first (and typically only) asset for the selected network
		}
		return null;
	});

	function closeNetworkDropdown() {
		dropdownKey++;
	}

	// Enhanced form validation
	let isFormValid = $derived(
		recipientAddress.trim() !== '' && 
		amount.trim() !== '' && 
		parseFloat(amount) > 0 && 
		currentAsset() && 
		parseFloat(amount) <= (currentAsset()?.balance || 0)
	);
	
	// Individual validation states for better UX
	let hasValidAddress = $derived(recipientAddress.trim() !== '');
	let hasValidAmount = $derived(amount.trim() !== '' && parseFloat(amount) > 0);
	let hasSufficientBalance = $derived(currentAsset() && parseFloat(amount) <= (currentAsset()?.balance || 0));
	
	// Validation error messages
	let validationErrors = $derived.by(() => {
		const errors = [];
		if (!hasValidAddress) {
			errors.push($t('wallet.validation.address_required'));
		}
		if (!hasValidAmount) {
			errors.push($t('wallet.validation.amount_required'));
		}
		if (hasValidAmount && !hasSufficientBalance) {
			errors.push($t('wallet.validation.insufficient_balance'));
		}
		return errors;
	});


	async function handleSend() {
		if (!isFormValid || !currentAsset) return;

		isLoading = true;
		errorMessage = null;

		try {
			if (selectedNetwork === 'rootstock-bitcoin') {
				await walletManager.sendRBTC(recipientAddress, amount);
			} else if (selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'bitcoin') {
				throw new Error('Liquid and Bitcoin transactions not yet implemented');
			} else if (selectedNetwork === 'lightning-bitcoin') {
				throw new Error('Lightning Bitcoin transactions not yet implemented');
			} else {
				throw new Error('Transaction type not yet implemented');
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
		if (currentAsset()) {
			// Subtract estimated fees
			const maxAmount = Math.max(0, (currentAsset()?.balance || 0) - (feeEstimate || 0.001));
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

	<!-- Asset Selection -->
	<div class="form-control">
		<label class="label" for="asset-select">
			<span class="label-text font-medium">Select Asset</span>
		</label>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			{#each assetOptions as asset}
				<label class="cursor-pointer">
					<input
						type="radio"
						bind:group={selectedAsset}
						value={asset.value}
						disabled={asset.disabled}
						class="sr-only"
					/>
					<div class="card {selectedAsset === asset.value ? 'border-primary border-2' : 'border border-base-300'} {asset.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'} transition-colors">
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								{#if asset.icon.startsWith('/')}
									<img src={asset.icon} alt="Asset icon" class="h-8 w-8" />
								{:else}
									<span class="text-2xl">{asset.icon}</span>
								{/if}
								<div class="flex-1">
									<div class="font-semibold">{asset.label}</div>
									<div class="text-sm opacity-70">{asset.description}</div>
								</div>
								{#if selectedAsset === asset.value}
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

	<!-- Coming Soon Alert for USD -->
	{#if selectedAsset === 'usd'}
		<div class="alert alert-outline alert-info">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<div>
				<div class="font-bold">Coming Soon</div>
				<div class="text-sm">USD sending functionality is not yet available.</div>
			</div>
		</div>
	{/if}

	<!-- Network Selection -->
	{#if selectedAsset === 'bitcoin'}
		<div class="form-control">
			<label class="label" for="network-select">
				<span class="label-text font-medium">Select Network</span>
			</label>
			{#key dropdownKey}
				<div class="dropdown dropdown-bottom w-full">
					<div tabindex="0" role="button" class="btn btn-outline w-full justify-between">
						<div class="flex items-center gap-2">
							{#if selectedNetworkInfo?.icon}
								<img
									src={selectedNetworkInfo.icon}
									alt={selectedNetworkInfo.label}
									class="h-5 w-5"
								/>
							{:else if selectedNetworkInfo?.value === 'lightning-bitcoin'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 text-yellow-500"
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
							{/if}
							<span class="font-medium">{selectedNetworkInfo?.label}</span>
						</div>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 opacity-70"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<ul class="dropdown-content menu bg-base-100 rounded-box w-full p-2 shadow">
						{#each networkOptions() as network}
							<li>
								<button
									class="flex w-full items-center justify-start gap-2"
									onclick={() => {
										selectedNetwork = network.value;
										closeNetworkDropdown();
									}}
								>
									{#if network.icon}
										<img src={network.icon} alt={network.label} class="h-5 w-5" />
									{:else if network.value === 'lightning-bitcoin'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5 text-yellow-500"
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
									{/if}
									<span class="font-medium">{network.label}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/key}
			{#if selectedNetworkInfo?.description}
				<div class="label">
					<span class="label-text-alt">{selectedNetworkInfo.description}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Coming Soon Alerts -->
	{#if selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'bitcoin'}
		<div class="alert alert-outline alert-info">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<div>
				<div class="font-bold">Coming Soon</div>
				<div class="text-sm">This network is not yet available for sending.</div>
			</div>
		</div>
	{/if}

	<!-- Available Balance Display -->
	{#if availableAssets().length > 0}
		{#if selectedNetwork === 'rootstock-bitcoin'}
			<div class="alert alert-outline bg-base-200 border-base-300">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6 text-base-content">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<div class="font-bold text-base-content">Available Balance</div>
					<div class="text-sm text-base-content/70">{availableAssets()[0]?.formattedBalance || '0.00'} rBTC</div>
				</div>
			</div>
		{:else if selectedNetwork === 'lightning-bitcoin'}
			<div class="alert alert-outline bg-base-200 border-base-300">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6 text-base-content">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<div class="font-bold text-base-content">Available Balance</div>
					<div class="text-sm text-base-content/70">{availableAssets()[0]?.formattedBalance || '0.00'} rBTC</div>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Input Fields - Hidden for Coming Soon networks -->
	{#if selectedAsset !== 'usd' && selectedNetwork !== 'liquid-bitcoin' && selectedNetwork !== 'bitcoin'}
		<!-- Recipient Address -->
		<div class="form-control">
			<label class="label" for="recipient-address">
				<span class="label-text font-medium">{$t('wallet.recipient_address')}</span>
			</label>
			<input
				id="recipient-address"
				bind:value={recipientAddress}
				placeholder={selectedNetwork === 'lightning-bitcoin'
					? 'Lightning invoice or Lightning address'
					: selectedNetwork === 'liquid-bitcoin'
						? 'Liquid address'
						: selectedNetwork === 'bitcoin'
							? 'Bitcoin address'
							: selectedNetwork === 'liquid-usdt'
								? 'Liquid USDT address'
								: 'Rootstock address (0x...)'}
				class="input input-bordered w-full {!hasValidAddress && recipientAddress.trim() !== '' ? 'input-error' : ''}"
				disabled={isLoading}
			/>
		</div>

	<!-- Amount -->
	<div class="form-control">
		<label class="label" for="amount">
			<span class="label-text font-medium">
				Amount ({currentAsset()?.ticker || 'BTC'})
			</span>
		</label>
		
		<!-- Amount Input with Max Button -->
		<div class="join w-full">
			<input
				id="amount"
				bind:value={amount}
				type="number"
				step="any"
				min="0"
				max={currentAsset()?.balance}
				placeholder="0.00"
				class="input input-bordered join-item flex-1 rounded-r-none {!hasValidAmount && amount.trim() !== '' ? 'input-error' : ''}"
				style="border-radius: 0.5rem 0 0 0.5rem !important; border-right-color: var(--color-primary) !important;"
				disabled={isLoading}
			/>
			<button
				class="btn btn-primary join-item rounded-l-none"
				onclick={handleMaxAmount}
				disabled={isLoading || !currentAsset()}
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
			{selectedNetwork === 'lightning-bitcoin' 
				? 'Send Lightning Bitcoin' 
				: selectedNetwork === 'liquid-bitcoin'
					? 'Send Liquid Bitcoin'
					: selectedNetwork === 'bitcoin'
						? 'Send Bitcoin'
						: selectedNetwork === 'liquid-usdt'
							? 'Send USDT'
							: 'Send rBTC'}
		{/if}
	</button>

	{/if}
</div>

<style>
	/* Ensure the dropdown has proper z-index and styling */
	.dropdown-content {
		max-height: 300px;
		overflow-y: auto;
	}
	
	/* Make the Max button look integrated with the input */
	.join .btn.join-item {
		border-left: none;
	}
	
	.join .input.join-item {
		border-right: none;
	}
</style>

