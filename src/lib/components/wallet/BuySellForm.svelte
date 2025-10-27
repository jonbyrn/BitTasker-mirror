<script lang="ts">
	import { t } from 'svelte-i18n';
	import { combinedWalletState } from '$lib/stores/wallet.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	
	// State management
	let action = $state<'buy' | 'sell'>('buy');
	let selectedCrypto = $state<'rbtc' | 'usdt-bsc'>('rbtc');
	let selectedFiat = $state<string>('USD'); // Hardcoded to USD
	let amount = $state<string>('');
	let bankDetails = $state<string>('');
	let cardDetails = $state<string>('');
	let showKycWarning = $state<boolean>(false);
	let isLoading = $state<boolean>(false);
	let quoteData = $state<any>(null);
	
	// Hardcoded to USD only
	const selectedFiatCurrency = { code: 'USD', name: 'US Dollar', symbol: '$' };
	
	const digitalAssetOptions = [
		{ id: 'rbtc', name: 'rBTC (Rootstock Bitcoin)', icon: '/images/chains/Bitcoin-Rootstock-logo.webp' },
		{ id: 'usdt-bsc', name: 'USDT (Binance Smart Chain)', icon: '/currency-symbols/USDt.svg' }
	];
	
	
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
	
	let estimatedReceive = $derived(() => {
		if (!amount || !selectedCrypto || !quoteData) return '0.00';
		// Use real quote data from Changelly API
		return quoteData.estimatedAmount || '0.00';
	});
	
	let estimatedSend = $derived(() => {
		if (!amount || !selectedCrypto || !quoteData) return '0.00';
		// Use real quote data from Changelly API
		return quoteData.estimatedAmount || '0.00';
	});
	
	// Methods
	function handleActionChange(newAction: 'buy' | 'sell') {
		action = newAction;
		amount = '';
		bankDetails = '';
		cardDetails = '';
		showKycWarning = false;
		quoteData = null;
	}
	
	function handleCryptoChange(cryptoId: string) {
		if (cryptoId === 'rbtc' || cryptoId === 'usdt-bsc') {
			selectedCrypto = cryptoId;
			amount = '';
			quoteData = null;
		}
	}
	
	async function handleAmountChange() {
		// Trigger KYC warning for amounts over $1000
		if (parseFloat(amount) > 1000) {
			showKycWarning = true;
		} else {
			showKycWarning = false;
		}
		
		// Fetch quote from Changelly API when amount changes
		if (amount && parseFloat(amount) > 0) {
			await fetchQuote();
		} else {
			quoteData = null;
		}
	}
	
	function handleKeyPress(event: KeyboardEvent) {
		// Only allow numbers, decimal point, and control keys
		const allowedKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight'];
		const isControlKey = event.ctrlKey || event.metaKey || event.altKey;
		
		if (!allowedKeys.includes(event.key) && !isControlKey) {
			event.preventDefault();
		}
		
		// Prevent multiple decimal points
		if (event.key === '.' && amount.includes('.')) {
			event.preventDefault();
		}
	}
	
	async function fetchQuote() {
		try {
			// Get real BTC price from API
			const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			
			// Mock API call - replace with real Changelly integration
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Calculate real conversion rates based on current BTC price
			let estimatedAmount: string;
			let rate: number;
			
			if (selectedCrypto === 'rbtc') {
				if (action === 'buy') {
					// Buying rBTC with USD: USD amount / BTC price = rBTC amount
					rate = 1 / btcPrice;
					estimatedAmount = (parseFloat(amount) * rate).toFixed(6);
				} else {
					// Selling rBTC for USD: rBTC amount * BTC price = USD amount
					rate = btcPrice;
					estimatedAmount = (parseFloat(amount) * rate).toFixed(2);
				}
			} else {
				// USDT-BSC: 1:1 with USD
				rate = 1.0;
				estimatedAmount = amount;
			}
			
			quoteData = {
				estimatedAmount,
				rate,
				fee: '0.5',
				totalCost: amount,
				btcPrice
			};
		} catch (error) {
			console.error('Failed to fetch quote:', error);
			quoteData = null;
		}
	}
	
	async function handleSubmit(event: Event) {
		event.preventDefault();
		
		if (!amount || (action === 'sell' && !bankDetails && !cardDetails)) {
			return;
		}
		
		isLoading = true;
		
		try {
			// Mock API call - replace with real Changelly integration
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// Show success message or redirect to Changelly
			console.log('Transaction initiated:', {
				action,
				selectedCrypto,
				selectedFiat: selectedFiatCurrency.code,
				amount,
				bankDetails,
				cardDetails,
				quoteData
			});
		} catch (error) {
			console.error('Transaction failed:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-4 md:space-y-6">
	<!-- Action Selection -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-4 md:p-6">
			<h3 class="card-title text-lg md:text-xl">{$t('wallet.buy_sell.select_action')}</h3>
			
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
				<button
					class="btn btn-outline min-h-[48px] {action === 'buy' ? 'btn-primary' : ''}"
					onclick={() => handleActionChange('buy')}
				>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
					</svg>
					<span class="text-sm md:text-base">{$t('wallet.buy_sell.buy')}</span>
				</button>
				
				<button
					class="btn btn-outline min-h-[48px] {action === 'sell' ? 'btn-primary' : ''}"
					onclick={() => handleActionChange('sell')}
				>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>
					</svg>
					<span class="text-sm md:text-base">{$t('wallet.buy_sell.sell')}</span>
				</button>
			</div>
		</div>
	</div>

	<!-- Digital Asset Selection -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-4 md:p-6">
			<h3 class="card-title text-lg md:text-xl">{$t('wallet.buy_sell.select_digital_asset')}</h3>
			
			<div class="grid grid-cols-1 gap-3">
				{#each digitalAssetOptions as asset}
					<button
						class="btn btn-outline justify-start min-h-[48px] {selectedCrypto === asset.id ? 'btn-primary' : ''}"
						onclick={() => handleCryptoChange(asset.id)}
					>
						<img src={asset.icon} alt={asset.name} class="w-6 h-6 mr-3 flex-shrink-0" />
						<span class="text-sm md:text-base truncate">{asset.name}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Transaction Form -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-4 md:p-6">
			<h3 class="card-title text-lg md:text-xl">
				{action === 'buy' ? $t('wallet.buy_sell.buy_with_fiat') : $t('wallet.buy_sell.sell_to_fiat')}
			</h3>
			
			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Amount Input -->
				<div class="form-control">
					<label for="amount-input" class="label">
						<span class="label-text text-sm md:text-base">
							{action === 'buy' ? $t('wallet.buy_sell.amount_to_buy') : $t('wallet.buy_sell.amount_to_sell')}
						</span>
					</label>
					<div class="relative">
						<input
							id="amount-input"
							type="number"
							class="input input-bordered w-full pr-16 min-h-[48px] text-base"
							placeholder={$t('wallet.buy_sell.enter_amount')}
							bind:value={amount}
							oninput={handleAmountChange}
							onkeypress={handleKeyPress}
							min="0"
							step="0.01"
							pattern="[0-9]*"
							inputmode="numeric"
						/>
						<div class="absolute inset-y-0 right-0 flex items-center pr-3">
							<span class="text-sm text-base-content/70">{selectedFiatCurrency.symbol}</span>
						</div>
					</div>
				</div>

				<!-- Estimated Amount Display -->
				{#if amount}
					<div class="alert alert-outline alert-info">
						<div class="flex items-start">
							<svg class="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<div class="text-sm md:text-base">
								<div>
									{action === 'buy' ? $t('wallet.buy_sell.estimated_receive') : $t('wallet.buy_sell.estimated_send')}: 
									<strong>
										{action === 'buy' ? estimatedReceive() : estimatedSend()} 
										{action === 'buy' ? selectedCrypto.toUpperCase() : selectedFiatCurrency.symbol}
									</strong>
								</div>
								{#if action === 'buy'}
									<div class="text-xs text-base-content/70 mt-1">
										{convertToSats(estimatedReceive(), selectedCrypto)} {$t('wallet.sats')}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Wallet Address Display (for buying) - REMOVED -->
				<!-- Purchases go directly to user's wallet address automatically -->

				<!-- Bank/Card Details (for selling) -->
				{#if action === 'sell'}
					<div class="form-control">
						<label for="bank-details" class="label">
							<span class="label-text text-sm md:text-base">{$t('wallet.buy_sell.bank_details')}</span>
						</label>
						<input
							id="bank-details"
							type="text"
							class="input input-bordered min-h-[48px] text-base"
							placeholder={$t('wallet.buy_sell.bank_details_placeholder')}
							bind:value={bankDetails}
						/>
					</div>
				{/if}

				<!-- KYC Warning -->
				{#if showKycWarning}
					<div class="alert alert-outline alert-warning">
						<div class="flex items-start">
							<svg class="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
							</svg>
							<div>
								<div class="font-semibold text-sm md:text-base">{$t('wallet.buy_sell.kyc_required')}</div>
								<div class="text-xs md:text-sm">{$t('wallet.buy_sell.kyc_description')}</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Submit Button -->
				<div class="card-actions justify-stretch sm:justify-end">
					<button
						type="submit"
						class="btn btn-primary w-full sm:w-auto min-h-[48px]"
						disabled={isLoading || !amount || (action === 'sell' && !bankDetails)}
					>
						{#if isLoading}
							<span class="loading loading-spinner loading-sm mr-2"></span>
						{/if}
						<span class="text-sm md:text-base">
							{action === 'buy' ? $t('wallet.buy_sell.buy') : $t('wallet.buy_sell.sell')}
						</span>
					</button>
				</div>
			</form>
		</div>
	</div>

	<!-- Information Card -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-4 md:p-6">
			<h3 class="card-title text-lg md:text-xl">{$t('wallet.information.buy_sell_info_title')}</h3>
			<div class="text-xs md:text-sm text-base-content/70 space-y-2">
				<p>• {action === 'buy' ? $t('wallet.information.buy_sell_info_1') : $t('wallet.information.buy_sell_info_2')}</p>
				<p>• {$t('wallet.information.buy_sell_info_3')}</p>
				<p>• {$t('wallet.information.buy_sell_info_4')}</p>
				<p>• {$t('wallet.information.buy_sell_info_5')}</p>
			</div>
		</div>
	</div>
</div>
