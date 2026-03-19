<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
	import { btcUsd } from '$lib/stores/market-price.store';

	// State management
	let fromToken = $state<'usdt-bsc' | 'rbtc'>('usdt-bsc');
	let toToken = $state<'usdt-bsc' | 'rbtc'>('rbtc');
	let fromAmount = $state<string>('');
	let toAmount = $state<string>('');
	let slippage = $state<number>(0.5); // Hardcoded to 0.5%
	let isLoading = $state<boolean>(false);
	let showPreview = $state<boolean>(false);
	let quoteData = $state<any>(null);
	const btcPrice = $derived.by(() => ($btcUsd > 0 ? $btcUsd : null));
	const priceUnavailableMessage =
		'Live BTC price unavailable. Swap quote is unavailable right now.';

	// Token options
	const tokenOptions = $derived([
		{
			id: 'usdt-bsc',
			name: 'USDT (BSC)',
			symbol: 'USDT',
			icon: '/currency-symbols/USDt.svg',
			balance: $walletStore.bsc?.formattedUsdtBalance || '0.00',
			balanceSats: $walletStore.bsc?.usdtBalance || 0
		},
		{
			id: 'rbtc',
			name: 'rBTC',
			symbol: 'rBTC',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			balance: $walletStore.rsk?.formattedBalance || '0.00',
			balanceSats: $walletStore.rsk?.balance || 0
		}
	]);

	// Computed values
	let swapRate = $derived.by(() => quoteData?.rate ?? null);

	let estimatedToAmount = $derived(() => {
		if (!fromAmount || !swapRate || !quoteData) return '0.00';
		// Use real quote data from API
		return quoteData.estimatedAmount || '0.00';
	});

	let networkFee = $derived(fromToken === 'usdt-bsc' ? '0.50' : '0.001');
	let isQuoteUnavailable = $derived.by(
		() => Boolean(fromAmount) && fromToken !== toToken && btcPrice === null
	);

	let isInsufficientBalance = $derived(() => {
		const fromTokenData = tokenOptions.find((t) => t.id === fromToken);
		return fromTokenData ? parseFloat(fromAmount) > parseFloat(fromTokenData.balance) : false;
	});

	// Convert to sats for display
	function convertToSats(amount: string, tokenId: string): string {
		if (!amount) return '0';
		const numAmount = parseFloat(amount);
		if (tokenId === 'rbtc') {
			// Convert rBTC to sats (1 rBTC = 100,000,000 sats)
			return Math.round(numAmount * 100000000).toLocaleString();
		} else if (tokenId === 'usdt-bsc') {
			// USDT is already in smallest unit (cents), so convert to sats equivalent
			return Math.round(numAmount * 100).toLocaleString();
		}
		return amount;
	}

	// Methods
	function swapTokens() {
		const temp = fromToken;
		fromToken = toToken;
		toToken = temp;
		fromAmount = '';
		toAmount = '';
		showPreview = false;
		quoteData = null;
	}

	async function handleFromAmountChange() {
		toAmount = '';
		showPreview = false;

		// Fetch quote from API when amount changes
		if (fromAmount && parseFloat(fromAmount) > 0) {
			await fetchQuote();
		} else {
			quoteData = null;
		}
	}

	async function fetchQuote() {
		try {
			// Mock API call - replace with real Changelly integration
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Calculate real conversion rates based on current BTC price
			const amount = parseFloat(fromAmount);
			let estimatedAmount: string;
			let rate: number;

			const liveBtcPrice = btcPrice;
			if (fromToken !== toToken && liveBtcPrice === null) {
				quoteData = null;
				toAmount = '';
				return;
			}

			if (fromToken === 'usdt-bsc' && toToken === 'rbtc') {
				// USDT to rBTC: USDT amount / BTC price = rBTC amount
				rate = 1 / liveBtcPrice;
				estimatedAmount = (amount * rate).toFixed(6);
			} else if (fromToken === 'rbtc' && toToken === 'usdt-bsc') {
				// rBTC to USDT: rBTC amount * BTC price = USDT amount
				rate = liveBtcPrice;
				estimatedAmount = (amount * rate).toFixed(2);
			} else {
				// Same token swap (shouldn't happen in current UI)
				rate = 1.0;
				estimatedAmount = amount.toString();
			}

			quoteData = {
				estimatedAmount,
				rate,
				fee: networkFee,
				btcPrice: btcPrice
			};

			toAmount = quoteData.estimatedAmount;
		} catch (error) {
			console.error('Failed to fetch quote:', error);
			quoteData = null;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		// Only allow numbers, decimal point, and control keys
		const allowedKeys = [
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
			'8',
			'9',
			'.',
			'Backspace',
			'Delete',
			'Tab',
			'Enter',
			'ArrowLeft',
			'ArrowRight'
		];
		const isControlKey = event.ctrlKey || event.metaKey || event.altKey;

		if (!allowedKeys.includes(event.key) && !isControlKey) {
			event.preventDefault();
		}

		// Prevent multiple decimal points
		const currentValue = (event.target as HTMLInputElement).value;
		if (event.key === '.' && currentValue.includes('.')) {
			event.preventDefault();
		}
	}

	function setMaxAmount() {
		const fromTokenData = tokenOptions.find((t) => t.id === fromToken);
		if (fromTokenData) {
			fromAmount = fromTokenData.balance;
			handleFromAmountChange();
		}
	}

	async function handleSwap(event: Event) {
		event.preventDefault();

		if (
			!fromAmount ||
			!toAmount ||
			isInsufficientBalance() ||
			(fromToken !== toToken && !quoteData)
		) {
			return;
		}

		showPreview = true;
	}

	async function confirmSwap() {
		isLoading = true;

		try {
			// Mock API call - replace with real Changelly integration
			await new Promise((resolve) => setTimeout(resolve, 2000));

			console.log('Swap initiated:', {
				fromToken,
				toToken,
				fromAmount,
				toAmount,
				slippage,
				swapRate
			});

			// Reset form
			fromAmount = '';
			toAmount = '';
			showPreview = false;
		} catch (error) {
			console.error('Swap failed:', error);
		} finally {
			isLoading = false;
		}
	}

	function cancelSwap() {
		showPreview = false;
	}
</script>

<div class="space-y-4 md:space-y-6">
	<!-- Swap Form -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-4 md:p-6">
			<h3 class="card-title text-lg md:text-xl">{$t('wallet.swap.swap_digital_assets')}</h3>
			<div class="alert alert-outline alert-info mb-4">
				<div class="flex items-start">
					<svg
						class="mt-0.5 mr-2 h-5 w-5 shrink-0"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						></path>
					</svg>
					<span class="text-xs font-medium md:text-sm">{$t('wallet.swap.timing_note')}</span>
				</div>
			</div>

			{#if !showPreview}
				<form onsubmit={handleSwap} class="space-y-4">
					<!-- From Token -->
					<div class="form-control">
						<label for="from-token" class="label">
							<span class="label-text text-sm md:text-base">{$t('wallet.swap.from')}</span>
						</label>
						<div class="flex flex-col gap-2">
							<select
								id="from-token"
								class="select select-bordered min-h-[48px] w-full text-base"
								bind:value={fromToken}
							>
								{#each tokenOptions as token}
									<option value={token.id}>{token.name}</option>
								{/each}
							</select>
							<div class="join w-full">
								<input
									type="number"
									class="input input-bordered join-item min-h-[48px] flex-1 rounded-r-none text-base"
									placeholder={$t('wallet.swap.enter_amount')}
									bind:value={fromAmount}
									oninput={handleFromAmountChange}
									onkeypress={handleKeyPress}
									min="0"
									step="0.000001"
									pattern="[0-9]*"
									inputmode="numeric"
									style="border-radius: 0.5rem 0 0 0.5rem !important; border-right-color: var(--color-primary) !important;"
								/>
								<button
									type="button"
									class="btn btn-primary join-item min-h-[48px] rounded-l-none"
									onclick={setMaxAmount}
								>
									<span class="text-xs md:text-sm">{$t('wallet.max')}</span>
								</button>
							</div>
						</div>
						<div class="label">
							<span class="label-text-alt text-xs md:text-sm">
								Balance: {tokenOptions.find((t) => t.id === fromToken)?.balance || '0.00'}
								{tokenOptions.find((t) => t.id === fromToken)?.symbol || ''}
								({convertToSats(
									tokenOptions.find((t) => t.id === fromToken)?.balance || '0',
									fromToken
								)} sats)
							</span>
						</div>
					</div>

					<!-- Swap Button -->
					<div class="flex justify-center">
						<button
							type="button"
							class="btn btn-circle btn-outline min-h-[48px] min-w-[48px]"
							onclick={swapTokens}
							aria-label="Swap tokens"
						>
							<svg
								class="h-5 w-5 md:h-6 md:w-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
								></path>
							</svg>
						</button>
					</div>

					<!-- To Token -->
					<div class="form-control">
						<label for="to-token" class="label">
							<span class="label-text text-sm md:text-base">{$t('wallet.swap.to')}</span>
						</label>
						<div class="flex flex-col gap-2 sm:flex-row">
							<select
								id="to-token"
								class="select select-bordered min-h-[48px] flex-1 text-base"
								bind:value={toToken}
							>
								{#each tokenOptions as token}
									<option value={token.id}>{token.name}</option>
								{/each}
							</select>
							<input
								type="number"
								class="input input-bordered min-h-[48px] flex-1 text-base"
								placeholder={$t('wallet.swap.enter_amount')}
								bind:value={toAmount}
								onkeypress={handleKeyPress}
								min="0"
								step="0.000001"
								pattern="[0-9]*"
								inputmode="numeric"
							/>
						</div>
						<div class="label">
							<span class="label-text-alt text-xs md:text-sm">
								Balance: {tokenOptions.find((t) => t.id === toToken)?.balance || '0.00'}
								{tokenOptions.find((t) => t.id === toToken)?.symbol || ''}
								({convertToSats(
									tokenOptions.find((t) => t.id === toToken)?.balance || '0',
									toToken
								)} sats)
							</span>
						</div>
					</div>

					<!-- Swap Rate Display -->
					{#if fromAmount && toAmount && quoteData}
						<div class="alert alert-outline alert-info">
							<div class="flex items-start">
								<svg
									class="mt-0.5 mr-2 h-5 w-5 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									></path>
								</svg>
								<span class="text-xs md:text-sm">
									{$t('wallet.swap.swap_rate')}: 1 {tokenOptions.find((t) => t.id === fromToken)
										?.symbol || ''} = {quoteData.rate}
									{tokenOptions.find((t) => t.id === toToken)?.symbol || ''}
								</span>
							</div>
						</div>
					{:else if isQuoteUnavailable}
						<div class="alert alert-outline alert-warning">
							<div class="flex items-start">
								<svg
									class="mt-0.5 mr-2 h-5 w-5 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
									></path>
								</svg>
								<span class="text-xs md:text-sm">{priceUnavailableMessage}</span>
							</div>
						</div>
					{/if}

					<!-- Error Messages -->
					{#if isInsufficientBalance()}
						<div class="alert alert-outline alert-error">
							<div class="flex items-start">
								<svg
									class="mt-0.5 mr-2 h-5 w-5 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
									></path>
								</svg>
								<span class="text-xs md:text-sm">{$t('wallet.swap.insufficient_balance')}</span>
							</div>
						</div>
					{/if}

					<!-- Submit Button -->
					<div class="card-actions justify-stretch sm:justify-end">
						<button
							type="submit"
							class="btn btn-primary min-h-[48px] w-full sm:w-auto"
							disabled={!fromAmount || !toAmount || isInsufficientBalance() || isQuoteUnavailable}
						>
							<span class="text-sm md:text-base">{$t('wallet.swap.swap_now')}</span>
						</button>
					</div>
				</form>
			{:else}
				<!-- Swap Preview -->
				<div class="space-y-4">
					<h4 class="text-lg font-semibold md:text-xl">{$t('wallet.swap.swap_preview')}</h4>

					<div class="bg-base-200 space-y-3 rounded-lg p-4">
						<div class="flex items-center justify-between">
							<span class="text-sm md:text-base">{$t('wallet.swap.from')}:</span>
							<span class="text-sm font-semibold md:text-base"
								>{fromAmount} {tokenOptions.find((t) => t.id === fromToken)?.symbol || ''}</span
							>
						</div>
						<div class="text-base-content/70 text-right text-xs md:text-sm">
							{convertToSats(fromAmount, fromToken)}
							{$t('wallet.sats')}
						</div>

						<div class="flex items-center justify-between">
							<span class="text-sm md:text-base">{$t('wallet.swap.to')}:</span>
							<span class="text-sm font-semibold md:text-base"
								>{toAmount} {tokenOptions.find((t) => t.id === toToken)?.symbol || ''}</span
							>
						</div>
						<div class="text-base-content/70 text-right text-xs md:text-sm">
							{convertToSats(toAmount, toToken)}
							{$t('wallet.sats')}
						</div>

						<div class="flex items-center justify-between">
							<span class="text-sm md:text-base">{$t('wallet.swap.swap_rate')}:</span>
							<span class="text-xs md:text-sm"
								>1 {tokenOptions.find((t) => t.id === fromToken)?.symbol || ''} = {quoteData?.rate}
								{tokenOptions.find((t) => t.id === toToken)?.symbol || ''}</span
							>
						</div>

						<div class="flex items-center justify-between">
							<span class="text-sm md:text-base">{$t('wallet.swap.network_fee')}:</span>
							<span class="text-xs md:text-sm"
								>{networkFee} {tokenOptions.find((t) => t.id === fromToken)?.symbol || ''}</span
							>
						</div>

						<div class="border-base-300 flex items-center justify-between border-t pt-2">
							<span class="text-sm font-semibold md:text-base"
								>{$t('wallet.swap.estimated_total')}:</span
							>
							<span class="text-sm font-semibold md:text-base"
								>{toAmount} {tokenOptions.find((t) => t.id === toToken)?.symbol || ''}</span
							>
						</div>
						<div class="text-base-content/70 text-right text-xs md:text-sm">
							{convertToSats(toAmount, toToken)}
							{$t('wallet.sats')}
						</div>
					</div>

					<div class="card-actions justify-stretch gap-2 sm:justify-end">
						<button class="btn btn-outline min-h-[48px] w-full sm:w-auto" onclick={cancelSwap}>
							<span class="text-sm md:text-base">{$t('wallet.buy_sell.cancel')}</span>
						</button>
						<button
							class="btn btn-primary min-h-[48px] w-full sm:w-auto"
							onclick={confirmSwap}
							disabled={isLoading}
						>
							{#if isLoading}
								<span class="loading loading-spinner loading-sm mr-2"></span>
							{/if}
							<span class="text-sm md:text-base">{$t('wallet.swap.confirm_swap')}</span>
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Information Card -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-4 md:p-6">
			<h3 class="card-title text-lg md:text-xl">{$t('wallet.information.swap_info_title')}</h3>
			<div class="text-base-content/70 space-y-2 text-xs md:text-sm">
				<p>• {$t('wallet.information.swap_info_1')}</p>
				<p>• {$t('wallet.information.swap_info_2')}</p>
				<p>• {$t('wallet.information.swap_info_3')}</p>
				<p>• {$t('wallet.information.swap_info_4')}</p>
			</div>
		</div>
	</div>
</div>

<style>
	/* Make the Max button look integrated with the input */
	.join .btn.join-item {
		border-left: none;
	}

	.join .input.join-item {
		border-right: none;
	}
</style>
