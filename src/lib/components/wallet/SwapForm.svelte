<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
	import { swapStore } from '$lib/stores/swap.store';
	import { isChangeallySwapsEnabled } from '$lib/services/kill-switch';
	import type { CurrentSwap } from '$lib/stores/swap.store';

	// -----------------------------------------------------------------------
	// Feature flag — entire component is hidden when swaps are disabled
	// -----------------------------------------------------------------------
	let featureEnabled = $state(isChangeallySwapsEnabled());

	// -----------------------------------------------------------------------
	// Swap store subscription
	// -----------------------------------------------------------------------
	let currentSwap = $state<CurrentSwap | null>(null);
	let isSwapActive = $state(false);

	$effect(() => {
		const unsubSwap = swapStore.subscribe((s) => {
			currentSwap = s.currentSwap;
			isSwapActive = s.currentSwap !== null && s.currentSwap.status !== 'idle';
		});
		return () => unsubSwap();
	});

	// -----------------------------------------------------------------------
	// UI state
	// -----------------------------------------------------------------------
	let fromToken = $state<{
		ticker: string;
		name: string;
		network: string;
	}>({ ticker: 'usdt', name: 'USDT (BSC)', network: 'bsc' });
	let toToken = $state<{
		ticker: string;
		name: string;
		network: string;
	}>({ ticker: 'rbtc', name: 'rBTC', network: 'rsk' });
	let fromAmount = $state<string>('');
	let toAmount = $state<string>('');
	let destinationAddress = $state<string>('');
	let showPreview = $state<boolean>(false);
	let quoteResult = $state<{
		estimatedAmount: string;
		rate: string;
		fee: string;
		minerFee: string;
	} | null>(null);
	let errorMessage = $state<string>('');

	// Changelly-supported tokens. In production the worker proxy returns
	// the live list; this static set covers the most common pairs.
	const supportedTokens = [
		{ ticker: 'btc', name: 'Bitcoin', network: 'bitcoin' },
		{ ticker: 'eth', name: 'Ethereum', network: 'ethereum' },
		{ ticker: 'usdt', name: 'USDT (BSC)', network: 'bsc' },
		{ ticker: 'usdt', name: 'USDT (Ethereum)', network: 'ethereum' },
		{ ticker: 'usdc', name: 'USDC (Ethereum)', network: 'ethereum' },
		{ ticker: 'rbtc', name: 'rBTC', network: 'rsk' },
		{ ticker: 'bnb', name: 'BNB', network: 'bsc' }
	];

	// -----------------------------------------------------------------------
	// Wallet balances from walletStore
	// -----------------------------------------------------------------------
	function getBalance(token: { ticker: string; network: string }): string {
		if (token.network === 'rsk' && token.ticker === 'rbtc') {
			return $walletStore.rsk?.formattedBalance || '0.00';
		}
		if (token.network === 'bsc') {
			if (token.ticker === 'usdt') {
				return $walletStore.bsc?.formattedUsdtBalance || '0.00';
			}
			if (token.ticker === 'bnb') {
				return $walletStore.bsc?.formattedBnbBalance || '0.00';
			}
		}
		return '0.00';
	}

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------
	let isInsufficientBalance = $derived(() => {
		const balance = getBalance(fromToken);
		return balance ? parseFloat(fromAmount) > parseFloat(balance) : false;
	});

	// -----------------------------------------------------------------------
	// Convert to sats for display (keeps existing pattern)
	// -----------------------------------------------------------------------
	function convertToSats(amount: string, token: { ticker: string; network: string }): string {
		if (!amount) return '0';
		const numAmount = parseFloat(amount);
		if (token.ticker === 'rbtc') {
			return Math.round(numAmount * 100000000).toLocaleString();
		}
		if (token.ticker === 'usdt' || token.ticker === 'usdc') {
			return Math.round(numAmount * 100).toLocaleString();
		}
		if (token.ticker === 'btc') {
			return Math.round(numAmount * 100000000).toLocaleString();
		}
		return numAmount.toLocaleString();
	}

	// -----------------------------------------------------------------------
	// Methods
	// -----------------------------------------------------------------------
	function swapTokens() {
		const temp = fromToken;
		fromToken = toToken;
		toToken = temp;
		fromAmount = '';
		toAmount = '';
		showPreview = false;
		quoteResult = null;
		errorMessage = '';
	}

	async function handleFromAmountChange() {
		showPreview = false;
		errorMessage = '';

		if (fromAmount && parseFloat(fromAmount) > 0) {
			await fetchQuote();
		} else {
			quoteResult = null;
			toAmount = '';
		}
	}

	async function fetchQuote() {
		if (!featureEnabled) return;

		const result = await swapStore.initiateSwap({
			fromToken: fromToken.ticker,
			toToken: toToken.ticker,
			fromAmount
		});

		if (result.success && result.estimatedAmount) {
			toAmount = result.estimatedAmount;
			quoteResult = {
				estimatedAmount: result.estimatedAmount,
				rate: result.rate || '0',
				fee: result.fee || '0',
				minerFee: result.minerFee || '0'
			};
		} else {
			errorMessage = result.error || 'Failed to fetch quote';
			toAmount = '';
			quoteResult = null;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
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
		const currentValue = (event.target as HTMLInputElement).value;
		if (event.key === '.' && currentValue.includes('.')) {
			event.preventDefault();
		}
	}

	function setMaxAmount() {
		const balance = getBalance(fromToken);
		if (balance && balance !== '0.00') {
			fromAmount = balance;
			handleFromAmountChange();
		}
	}

	function handleSwap(event: Event) {
		event.preventDefault();
		if (!fromAmount || !toAmount || isInsufficientBalance() || !featureEnabled) {
			return;
		}
		showPreview = true;
	}

	async function confirmSwap() {
		if (!destinationAddress) {
			errorMessage = 'Destination address is required';
			return;
		}

		const result = await swapStore.confirmAndCreateSwap(destinationAddress);

		if (!result.success) {
			errorMessage = result.error || 'Swap creation failed';
		}
		// On success the store transitions to 'polling'; the UI stays on
		// the preview panel showing the swapId.
	}

	function cancelSwap() {
		showPreview = false;
		errorMessage = '';
	}

	function resetForm() {
		fromAmount = '';
		toAmount = '';
		destinationAddress = '';
		showPreview = false;
		quoteResult = null;
		errorMessage = '';
		swapStore.clearCurrentSwap();
	}
</script>

{#if featureEnabled}
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

				{#if currentSwap && (currentSwap.status === 'polling' || currentSwap.status === 'completed' || currentSwap.status === 'failed')}
					<!-- Post-swap status -->
					<div class="space-y-4">
						{#if currentSwap.status === 'completed'}
							<div class="alert alert-outline alert-success">
								<span class="text-sm md:text-base">{$t('wallet.swap.swap_successful')}</span>
							</div>
						{:else if currentSwap.status === 'failed'}
							<div class="alert alert-outline alert-error">
								<span class="text-sm md:text-base"
									>{currentSwap.error || $t('wallet.swap.swap_failed')}</span
								>
							</div>
						{:else}
							<div class="alert alert-outline alert-info">
								<span class="loading loading-spinner loading-sm mr-2"></span>
								<span class="text-sm md:text-base">
									{$t('wallet.swap.creating')} ({currentSwap.swapId || ''})
								</span>
							</div>
						{/if}

						{#if currentSwap.swapId}
							<div class="bg-base-200 rounded-lg p-3 text-xs md:text-sm">
								<div class="flex justify-between">
									<span class="font-medium">Swap ID:</span>
									<span class="font-mono">{currentSwap.swapId}</span>
								</div>
							</div>
						{/if}

						<button class="btn btn-primary min-h-[48px] w-full sm:w-auto" onclick={resetForm}>
							<span class="text-sm md:text-base">{$t('wallet.swap.swap_now')}</span>
						</button>
					</div>
				{:else if !showPreview}
					<!-- Swap Form -->
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
									onchange={() => {
										fromAmount = '';
										toAmount = '';
										quoteResult = null;
									}}
								>
									{#each supportedTokens as token (token.name)}
										<option value={token}>{token.name}</option>
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
									{$t('wallet.available_balance')}: {getBalance(fromToken) || '0.00'}
									({convertToSats(getBalance(fromToken), fromToken)}
									{$t('wallet.sats')})
								</span>
							</div>
						</div>

						<!-- Swap Direction Button -->
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
									onchange={() => {
										fromAmount = '';
										toAmount = '';
										quoteResult = null;
									}}
								>
									{#each supportedTokens as token (token.name)}
										<option value={token}>{token.name}</option>
									{/each}
								</select>
								<input
									type="number"
									class="input input-bordered min-h-[48px] flex-1 text-base"
									placeholder={$t('wallet.swap.enter_amount')}
									bind:value={toAmount}
									readonly
								/>
							</div>
							<div class="label">
								<span class="label-text-alt text-xs md:text-sm">
									{$t('wallet.available_balance')}: {getBalance(toToken) || '0.00'}
									({convertToSats(getBalance(toToken), toToken)}
									{$t('wallet.sats')})
								</span>
							</div>
						</div>

						<!-- Quote / rate info -->
						{#if quoteResult}
							<div class="alert alert-outline alert-info">
								<div class="space-y-1 text-xs md:text-sm">
									<div>
										{$t('wallet.swap.swap_rate')}: 1 {fromToken.ticker.toUpperCase()} = {quoteResult.rate}
										{toToken.ticker.toUpperCase()}
									</div>
									<div>
										{$t('wallet.swap.network_fee')}: {quoteResult.fee}
										{fromToken.ticker.toUpperCase()}
									</div>
									<div>
										{$t('wallet.swap.miner_fee')}: {quoteResult.minerFee}
										{fromToken.ticker.toUpperCase()}
									</div>
								</div>
							</div>
						{/if}

						<!-- Error -->
						{#if errorMessage}
							<div class="alert alert-outline alert-error">
								<span class="text-xs md:text-sm">{errorMessage}</span>
							</div>
						{/if}

						<!-- Insufficient balance -->
						{#if isInsufficientBalance()}
							<div class="alert alert-outline alert-error">
								<span class="text-xs md:text-sm">{$t('wallet.swap.insufficient_balance')}</span>
							</div>
						{/if}

						<!-- Submit -->
						<div class="card-actions justify-stretch sm:justify-end">
							<button
								type="submit"
								class="btn btn-primary min-h-[48px] w-full sm:w-auto"
								disabled={!fromAmount || !toAmount || isInsufficientBalance() || isSwapActive}
							>
								{#if isSwapActive}
									<span class="loading loading-spinner loading-sm mr-2"></span>
								{/if}
								<span class="text-sm md:text-base">{$t('wallet.swap.swap_now')}</span>
							</button>
						</div>
					</form>
				{:else}
					<!-- Preview & Confirm -->
					<div class="space-y-4">
						<h4 class="text-lg font-semibold md:text-xl">{$t('wallet.swap.swap_preview')}</h4>

						<div class="bg-base-200 space-y-3 rounded-lg p-4">
							<div class="flex items-center justify-between">
								<span class="text-sm md:text-base">{$t('wallet.swap.from')}:</span>
								<span class="text-sm font-semibold md:text-base"
									>{fromAmount} {fromToken.ticker.toUpperCase()}</span
								>
							</div>
							<div class="text-base-content/70 text-right text-xs md:text-sm">
								{convertToSats(fromAmount, fromToken)}
								{$t('wallet.sats')}
							</div>

							<div class="flex items-center justify-between">
								<span class="text-sm md:text-base">{$t('wallet.swap.to')}:</span>
								<span class="text-sm font-semibold md:text-base"
									>{toAmount} {toToken.ticker.toUpperCase()}</span
								>
							</div>
							<div class="text-base-content/70 text-right text-xs md:text-sm">
								{convertToSats(toAmount, toToken)}
								{$t('wallet.sats')}
							</div>

							{#if quoteResult}
								<div class="flex items-center justify-between">
									<span class="text-sm md:text-base">{$t('wallet.swap.swap_rate')}:</span>
									<span class="text-xs md:text-sm"
										>1 {fromToken.ticker.toUpperCase()} = {quoteResult.rate}
										{toToken.ticker.toUpperCase()}</span
									>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-sm md:text-base">{$t('wallet.swap.network_fee')}:</span>
									<span class="text-xs md:text-sm"
										>{quoteResult.fee} {fromToken.ticker.toUpperCase()}</span
									>
								</div>
							{/if}

							<!-- Destination Address -->
							<div class="form-control">
								<label for="dest-address" class="label">
									<span class="label-text text-sm md:text-base"
										>{$t('wallet.swap.destination')}</span
									>
								</label>
								<input
									id="dest-address"
									type="text"
									class="input input-bordered min-h-[48px] text-base"
									placeholder={$t('wallet.swap.enter_address_placeholder', {
										values: { crypto: toToken.ticker.toUpperCase() }
									})}
									bind:value={destinationAddress}
								/>
							</div>

							<div class="border-base-300 flex items-center justify-between border-t pt-2">
								<span class="text-sm font-semibold md:text-base"
									>{$t('wallet.swap.estimated_total')}:</span
								>
								<span class="text-sm font-semibold md:text-base"
									>{toAmount} {toToken.ticker.toUpperCase()}</span
								>
							</div>
						</div>

						{#if errorMessage}
							<div class="alert alert-outline alert-error">
								<span class="text-xs md:text-sm">{errorMessage}</span>
							</div>
						{/if}

						<div class="card-actions justify-stretch gap-2 sm:justify-end">
							<button class="btn btn-outline min-h-[48px] w-full sm:w-auto" onclick={cancelSwap}>
								<span class="text-sm md:text-base">{$t('wallet.buy_sell.cancel')}</span>
							</button>
							<button
								class="btn btn-primary min-h-[48px] w-full sm:w-auto"
								onclick={confirmSwap}
								disabled={isSwapActive || !destinationAddress}
							>
								{#if isSwapActive}
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
{/if}
