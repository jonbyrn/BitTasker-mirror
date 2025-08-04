<!--
	Amount Input Component
	Handles amount input with unit conversion and balance display
-->
<script lang="ts">
	// Props
	let {
		amount = $bindable(''),
		selectedAsset = 'L-BTC',
		useMainUnit = $bindable(false),
		fiatCurrency = 'USD',
		fiatRates = {},
		limits = {},
		availableBalance = 0,
		estimatedFees = 0,
		isLoadingFees = false,
		addressType = 'unknown',
		recipientAddress = '',
		onAmountChange = (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => {}
	} = $props();

	function getAmountPlaceholder(): string {
		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			return useMainUnit ? '0.00000000' : '0';
		} else if (selectedAsset === 'USDt') {
			return '0.00';
		}
		return '0';
	}

	function getAmountStep(): string {
		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			return useMainUnit ? '0.00000001' : '1';
		} else if (selectedAsset === 'USDt') {
			return '0.01';
		}
		return '1';
	}

	function getDisplayUnit(): string {
		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			return useMainUnit ? selectedAsset : 'sats';
		}
		return selectedAsset;
	}

	function convertToSatoshis(inputAmount: string): number {
		const numericAmount = parseFloat(inputAmount);

		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			if (useMainUnit) {
				// Input is in BTC, convert to sats
				return Math.floor(numericAmount * 100_000_000);
			} else {
				// Input is already in sats
				return Math.floor(numericAmount);
			}
		} else if (selectedAsset === 'USDt') {
			// For USDT, use the amount as-is (asset amount, not sats)
			return Math.floor(numericAmount * 100_000_000); // Convert to asset base units
		}

		return Math.floor(numericAmount);
	}

	function formatSatsDisplay(sats: number): string {
		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			return `${sats.toLocaleString()} sats`;
		} else if (selectedAsset === 'USDt') {
			return `${(sats / 100_000_000).toFixed(2)} USDt`;
		}
		return `${sats} units`;
	}

	function getFiatEquivalent(): string {
		if (!amount || !fiatRates[fiatCurrency]) return '';

		const amountSats = convertToSatoshis(amount);

		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			const btcAmount = amountSats / 100_000_000;
			const fiatValue = btcAmount * fiatRates[fiatCurrency];
			return `≈ ${fiatValue.toFixed(2)} ${fiatCurrency}`;
		} else if (selectedAsset === 'USDt') {
			const usdtAmount = amountSats / 100_000_000;
			if (fiatCurrency === 'USD') {
				return `≈ $${usdtAmount.toFixed(2)}`;
			}
			// For other currencies, convert from USD
			const fiatValue = usdtAmount * (fiatRates[fiatCurrency] / fiatRates['USD']);
			return `≈ ${fiatValue.toFixed(2)} ${fiatCurrency}`;
		}

		return '';
	}

	function getBtcEquivalent(): string {
		if (!amount || (selectedAsset !== 'L-BTC' && selectedAsset !== 'BTC')) return '';
		if (useMainUnit) return '';

		const amountSats = convertToSatoshis(amount);
		const btcAmount = amountSats / 100_000_000;
		return `≈ ${btcAmount.toFixed(8)} ${selectedAsset}`;
	}

	function toggleUnitType() {
		if (selectedAsset !== 'L-BTC' && selectedAsset !== 'BTC') return;

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
		<span class="label-text text-sm sm:text-base">Amount</span>
		<div class="label-text-alt flex items-center gap-2 text-xs">
			{#if selectedAsset === 'L-BTC' && limits.lightning?.send}
				<span class="text-info">
					Min: {formatSatsDisplay(limits.lightning.send.minSat)} - Max: {formatSatsDisplay(
						limits.lightning.send.maxSat
					)}
				</span>
			{:else if selectedAsset === 'BTC' && limits.onchain?.send}
				<span class="text-info">
					Min: {formatSatsDisplay(limits.onchain.send.minSat)} - Max: {formatSatsDisplay(
						limits.onchain.send.maxSat
					)}
				</span>
			{:else if selectedAsset === 'USDt'}
				<span class="text-info"> Min: 0.01 USDt - Max: 10,000.00 USDt </span>
			{:else}
				<span class="text-base-content/60"> Loading limits... </span>
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
		{#if selectedAsset === 'L-BTC' || selectedAsset === 'BTC'}
			<button
				class="btn btn-outline join-item px-3"
				onclick={toggleUnitType}
				title="Switch to {useMainUnit ? 'satoshis' : selectedAsset}"
				aria-label="Switch to {useMainUnit ? 'satoshis' : selectedAsset}"
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

		<!-- Balance and Fee Information -->
		{#if availableBalance > 0}
			<div class="flex flex-col gap-1 text-xs">
				<div class="text-base-content/60 flex items-center justify-between">
					<span>Available Balance:</span>
					<span class="font-mono">{formatSatsDisplay(availableBalance)}</span>
				</div>
				{#if recipientAddress && addressType !== 'unknown'}
					<div class="text-base-content/60 flex items-center justify-between">
						<span>Estimated Fees:</span>
						<span class="font-mono">
							{#if isLoadingFees}
								<span class="loading loading-spinner loading-xs"></span>
							{:else if estimatedFees > 0}
								<span class="text-warning">~{formatSatsDisplay(estimatedFees)}</span>
							{:else}
								<span class="text-base-content/40 italic">Calculating...</span>
							{/if}
						</span>
					</div>
					{#if estimatedFees > 0}
						{#if availableBalance > estimatedFees}
							<div
								class="text-base-content/60 border-base-300 flex items-center justify-between border-t pt-1"
							>
								<span>Max Sendable:</span>
								<span class="text-success font-mono"
									>{formatSatsDisplay(availableBalance - estimatedFees)}</span
								>
							</div>
						{:else}
							<div
								class="text-error border-base-300 flex items-center justify-between border-t pt-1"
							>
								<span>Status:</span>
								<span class="font-mono text-xs">Insufficient funds</span>
							</div>
						{/if}
					{:else}
						<div
							class="text-base-content/60 border-base-300 flex items-center justify-between border-t pt-1"
						>
							<span>Max Sendable:</span>
							<span class="text-base-content/40 font-mono italic"
								>Unknown (fees calculating)</span
							>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>