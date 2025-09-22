<!--
	Amount Input Component
	Handles amount input with unit conversion and balance display
-->
<script lang="ts">
	import { walletStore, selectedAsset, walletRates } from '$lib/stores/breezWallet.store';
	import { t } from 'svelte-i18n';

	// Props
	let {
		amount = $bindable(''),
		selectedAsset: selectedAssetTicker = 'L-BTC',
		useMainUnit = $bindable(false),
		fiatCurrency = 'USD',
		limits = {},
		estimatedFees = 0,
		isLoadingFees = false,
		addressType = 'unknown',
		recipientAddress = '',
		validationError = null,
		onAmountChange = (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => {}
	} = $props();

	// Get data from wallet store
	let fiatRates = $derived($walletRates.fiatRates);
	let availableBalance = $derived($selectedAsset?.balance || 0);

	function getAmountPlaceholder(): string {
		if (selectedAssetTicker === 'L-BTC' || selectedAssetTicker === 'BTC') {
			return useMainUnit ? '0.00000000' : '0';
		} else if (selectedAssetTicker === 'USDt') {
			return '0.00';
		}
		return '0';
	}

	function getAmountStep(): string {
		if (selectedAssetTicker === 'L-BTC' || selectedAssetTicker === 'BTC') {
			return useMainUnit ? '0.00000001' : '1';
		} else if (selectedAssetTicker === 'USDt') {
			return '0.01';
		}
		return '1';
	}

	function getDisplayUnit(): string {
		if (selectedAssetTicker === 'L-BTC' || selectedAssetTicker === 'BTC') {
			return useMainUnit ? selectedAssetTicker : 'sats';
		}
		return selectedAssetTicker;
	}

	function convertToSatoshis(inputAmount: string): number {
		const numericAmount = parseFloat(inputAmount);

		if (selectedAssetTicker === 'L-BTC' || selectedAssetTicker === 'BTC') {
			if (useMainUnit) {
				// Input is in BTC, convert to sats
				return Math.floor(numericAmount * 100_000_000);
			} else {
				// Input is already in sats
				return Math.floor(numericAmount);
			}
		} else if (selectedAssetTicker === 'USDt') {
			// For USDT, use the amount as-is (asset amount, not sats)
			return Math.floor(numericAmount * 100_000_000); // Convert to asset base units
		}

		return Math.floor(numericAmount);
	}

	function formatSatsDisplay(sats: number): string {
		if (selectedAssetTicker === 'L-BTC' || selectedAssetTicker === 'BTC') {
			return `${sats.toLocaleString()} sats`;
		} else if (selectedAssetTicker === 'USDt') {
			return `${(sats / 100_000_000).toFixed(2)} USDt`;
		}
		return `${sats} units`;
	}

	function getFiatEquivalent(): string {
		if (!amount || !fiatRates) return '';

		const amountSats = convertToSatoshis(amount);
		const rates: Record<string, number> = fiatRates.reduce(
			(acc: Record<string, number>, rate: any) => ({ ...acc, [rate.coin]: rate.value }),
			{} as Record<string, number>
		);

		if (!rates[fiatCurrency]) return '';

		if (selectedAssetTicker === 'L-BTC' || selectedAssetTicker === 'BTC') {
			const btcAmount = amountSats / 100_000_000;
			const btcRate = rates['BTC'] || 0;
			const fiatValue = btcAmount * btcRate;
			return `≈ ${walletStore.formatUsd(fiatValue)}`;
		} else if (selectedAssetTicker === 'USDt') {
			const usdtAmount = amountSats / 100_000_000;
			if (fiatCurrency === 'USD') {
				return `≈ ${walletStore.formatUsd(usdtAmount)}`;
			}
			// For other currencies, convert from USD
			const usdRate = rates['USD'] || 1;
			const targetRate = rates[fiatCurrency] || 0;
			const fiatValue = usdtAmount * (targetRate / usdRate);
			return `≈ ${fiatValue.toFixed(2)} ${fiatCurrency}`;
		}

		return '';
	}

	function getBtcEquivalent(): string {
		if (!amount || (selectedAssetTicker !== 'L-BTC' && selectedAssetTicker !== 'BTC')) return '';
		if (useMainUnit) return '';

		const amountSats = convertToSatoshis(amount);
		const btcAmount = amountSats / 100_000_000;
		return `≈ ${btcAmount.toFixed(8)} ${selectedAssetTicker}`;
	}

	function toggleUnitType() {
		if (selectedAssetTicker !== 'L-BTC' && selectedAssetTicker !== 'BTC') return;

		useMainUnit = !useMainUnit;

		if (amount) {
			const currentSats = convertToSatoshis(amount);
			if (useMainUnit) {
				// Convert to BTC
				amount = (currentSats / 100_000_000).toString();
			} else {
				// Convert to sats
				amount = currentSats.toString();
			}
		}
	}
</script>

<div class="form-control">
	<div class="label">
		<span class="label-text text-sm sm:text-base">{$t('common.components.wallet.amount_input.amount')}</span>
		<div class="label-text-alt flex items-center gap-2 text-xs">
			{#if selectedAssetTicker === 'L-BTC' && limits.lightning?.send}
				<span class="text-info">
					{$t('common.components.wallet.amount_input.min_max', { values: { min: formatSatsDisplay(limits.lightning.send.minSat), max: formatSatsDisplay(limits.lightning.send.maxSat) } })}
				</span>
			{:else if selectedAssetTicker === 'BTC' && limits.onchain?.send}
				<span class="text-info">
					{$t('common.components.wallet.amount_input.min_max', { values: { min: formatSatsDisplay(limits.onchain.send.minSat), max: formatSatsDisplay(limits.onchain.send.maxSat) } })}
				</span>
			{:else if selectedAssetTicker === 'USDt'}
				<span class="text-info"> Min: 0.01 USDt - Max: 10,000.00 USDt </span>
			{:else}
				<span class="text-base-content/60"> {$t('common.components.wallet.amount_input.loading_limits')} </span>
			{/if}
		</div>
	</div>

	<!-- Amount Input -->
	<div class="join w-full">
		<input
			type="number"
			step={getAmountStep()}
			placeholder={getAmountPlaceholder()}
			class="input input-bordered join-item flex-1 font-mono text-sm sm:text-base"
			bind:value={amount}
			oninput={(e) => onAmountChange(e)}
		/>
		<div class="btn btn-disabled join-item bg-base-200 min-w-fit px-3 text-xs sm:text-sm">
			{getDisplayUnit()}
		</div>

		<!-- Unit Toggle Button (only for Bitcoin assets) -->
		{#if selectedAssetTicker === 'L-BTC' || selectedAssetTicker === 'BTC'}
			<button
				class="btn btn-outline join-item px-3"
				onclick={toggleUnitType}
				title="Switch to {useMainUnit ? 'satoshis' : selectedAssetTicker}"
				aria-label="Switch to {useMainUnit ? 'satoshis' : selectedAssetTicker}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
					/>
				</svg>
			</button>
		{/if}
	</div>

	<!-- Conversion Displays -->
	<div class="mt-2 space-y-1">
		{#if getBtcEquivalent()}
			<div class="text-base-content/60 text-xs">
				{getBtcEquivalent()}
			</div>
		{/if}
		{#if getFiatEquivalent()}
			<div class="text-base-content/60 text-xs">
				{getFiatEquivalent()}
			</div>
		{/if}

		<!-- Fee Information -->
		<div class="flex flex-col gap-1 text-xs">
			{#if recipientAddress && (estimatedFees || validationError)}
				<div class="text-base-content/60 flex items-center justify-between">
					<span>{$t('common.components.wallet.amount_input.available_balance')}</span>
					<span class="font-mono">{formatSatsDisplay(availableBalance)}</span>
				</div>

				{#if validationError}
					<!-- Show validation error (e.g., insufficient funds from Breez SDK) -->
					<div
						class="text-error border-base-300 flex items-start justify-between gap-1 border-t pt-1"
					>
						<span>{$t('common.components.wallet.amount_input.error')}</span>
						<span class="font-mono text-xs">{validationError}</span>
					</div>
				{:else}
					<!-- Show normal fee information -->
					<div class="text-base-content/60 flex items-center justify-between">
						<span>{$t('common.components.wallet.amount_input.estimated_fees')}</span>
						<span class="font-mono">
							{#if isLoadingFees}
								<span class="loading loading-spinner loading-xs"></span>
							{:else if estimatedFees > 0}
								<span class="text-warning">~{formatSatsDisplay(estimatedFees)}</span>
							{:else}
								<span class="text-base-content/40">Calculating...</span>
							{/if}
						</span>
					</div>
					{#if availableBalance > estimatedFees}
						<div
							class="text-base-content/60 border-base-300 flex items-center justify-between border-t pt-1"
						>
							<span>{$t('common.components.wallet.amount_input.max_sendable')}</span>
							<span class="text-success font-mono">
								{formatSatsDisplay(availableBalance - estimatedFees)}
							</span>
						</div>
					{:else}
						<div class="text-error border-base-300 flex items-center justify-between border-t pt-1">
							<span>{$t('common.components.wallet.amount_input.status')}</span>
							<span class="font-mono text-xs">{$t('common.components.wallet.amount_input.insufficient_funds')}</span>
						</div>
					{/if}
				{/if}
			{/if}
		</div>
	</div>
</div>
