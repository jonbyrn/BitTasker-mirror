<script lang="ts">
	import type { ChainSwapData } from '@bittasker/wallet-core';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { rskConnection, getWalletManager } from '$lib/stores/wallet.store';
	import PendingSwap from '$lib/components/wallet/PendingSwap.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	// State
	let amount = $state('');
	let description = $state('');
	let isCreatingSwap = $state(false);
	let pendingSwaps = $state<ChainSwapData[]>([]);
	let error = $state<string | null>(null);
	let isDeletingSwaps = $state(false);
	let expandedSwaps = $state<Set<string>>(new Set());
	let minAmount = $state<number>(0);
	let maxAmount = $state<number>(0);
	let isLoadingLimits = $state(true);

	// Fee breakdown state
	let btcPrice = $state<number>(0);
	let networkFee = $state<number>(150); // Estimated network transaction fee in sats
	let isLoadingPrice = $state(false);
	let amountError = $state<string | null>(null);
	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

	// Derived fee calculations - use amount directly for immediate updates
	let amountSats = $derived(parseFloat(amount) || 0);
	let swapFee = $derived(amountSats > 0 ? Math.ceil(amountSats * 0.0045) : 0); // Boltz service fee: ~0.45%
	let totalFees = $derived(swapFee + networkFee);
	let totalReceived = $derived(Math.max(0, amountSats - totalFees));

	// Get network
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

	// Derived values (no longer needed for BTC conversion, but kept for display if needed)
	let minBTC = $derived(minAmount / 100_000_000);
	let maxBTC = $derived(maxAmount / 100_000_000);

	/**
	 * Fetch swap limits and recover pending swaps
	 */
	$effect(() => {
		(async () => {
			try {
				// Fetch swap limits from Boltz
				await fetchSwapLimits();

				// Recover pending swaps from wallet manager
				const walletManager = getWalletManager();
				const recovered = await walletManager.chainSwapService.recoverPendingSwaps();

				if (recovered.length > 0) {
					pendingSwaps = recovered;

					// Monitor all recovered swaps
					for (const swap of recovered) {
						monitorSwapStatus(swap.id);
					}
				}
			} catch (err) {
				console.error('Failed to initialize chain swap service:', err);
			}
		})();
	});

	/**
	 * Fetch BTC price for USD conversion
	 */
	async function fetchBtcPrice() {
		try {
			isLoadingPrice = true;
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (err) {
			console.error('Failed to fetch BTC price:', err);
			// Use fallback price if fetch fails
			btcPrice = 60000; // Fallback to ~$60k
		} finally {
			isLoadingPrice = false;
		}
	}

	/**
	 * Validate amount and update error state
	 */
	function validateAmount(value: string | number) {
		amountError = null;
		
		// Convert to string for validation
		const valueStr = String(value ?? '');
		
		// Check if value is empty or whitespace
		if (valueStr.trim() === '' || value === null || value === undefined) {
			return;
		}

		const amountSats = parseFloat(valueStr);
		
		if (isNaN(amountSats) || amountSats <= 0) {
			amountError = $t('wallet.validation.amount_required');
			return;
		}

		// Only validate against limits if they've been loaded
		if (!isLoadingLimits) {
			if (minAmount > 0 && amountSats < minAmount) {
				amountError = $t('wallet.swap.error.minimum_amount_sats', { values: { minAmount: minAmount.toLocaleString() } });
				return;
			}

			if (maxAmount > 0 && amountSats > maxAmount) {
				amountError = $t('wallet.swap.error.maximum_amount_sats', { values: { maxAmount: maxAmount.toLocaleString() } });
				return;
			}
		}
	}

	/**
	 * Re-validate when limits are loaded or change
	 */
	$effect(() => {
		// Track minAmount and maxAmount to trigger re-validation when limits change
		const currentMinAmount = minAmount;
		const currentMaxAmount = maxAmount;
		const currentIsLoadingLimits = isLoadingLimits;

		// If limits have been loaded and we have an amount, validate immediately
		if (!currentIsLoadingLimits && amount) {
			validateAmount(amount);
		}
	});

	/**
	 * Fetch swap limits from Boltz API
	 */
	async function fetchSwapLimits() {
		try {
			isLoadingLimits = true;
			const walletManager = getWalletManager();
			const limits = await walletManager.chainSwapService.getSwapLimits();
			minAmount = limits.minimal;
			maxAmount = limits.maximal;
			console.log('✅ Fetched chain swap limits:', { minAmount, maxAmount, minBTC, maxBTC });
		} catch (err) {
			console.error('Failed to fetch chain swap limits:', err);
			// Use fallback values
			minAmount = 2500;
			maxAmount = network === 'mainnet' ? 100_000_000 : 10_000_000; // 1 BTC or 0.1 BTC
		} finally {
			isLoadingLimits = false;
		}
	}

	/**
	 * Create chain swap (L-BTC → RBTC)
	 */
	async function createSwap() {
		if (!$rskConnection.address) {
			error = $t('wallet.rsk_not_connected');
			return;
		}

		// Validate amount before proceeding
		validateAmount(amount);
		if (amountError) {
			error = amountError;
			return;
		}

		if (!amount || parseFloat(amount) <= 0) {
			error = $t('wallet.validation.amount_required');
			return;
		}

		// Amount is already in sats, parse as integer
		const amountSats = Math.floor(parseFloat(amount));

		if (minAmount > 0 && amountSats < minAmount) {
			error = $t('wallet.swap.error.minimum_amount_sats', { values: { minAmount: minAmount.toLocaleString() } });
			return;
		}

		if (maxAmount > 0 && amountSats > maxAmount) {
			error = $t('wallet.swap.error.maximum_amount_sats', { values: { maxAmount: maxAmount.toLocaleString() } });
			return;
		}

		isCreatingSwap = true;
		error = null;

		try {
			const walletManager = getWalletManager();
			const result = await walletManager.chainSwapService.createChainSwap({
				amountSats,
				rbtcAddress: $rskConnection.address,
				walletSigner: $rskConnection.wallet // Pass wallet for Smart Wallet address computation
			});

			// Add to pending swaps list
			pendingSwaps = [...pendingSwaps, result.swapData];

			appStore.showSuccessToast($t('wallet.swap.lbtc.address_created'));

			// Monitor swap status
			monitorSwapStatus(result.swapId);

			// Clear form
			amount = '';
			description = '';
		} catch (err) {
			console.error('Failed to create chain swap:', err);
			error = err instanceof Error ? err.message : $t('wallet.swap.error.create_failed');
			appStore.showErrorToast(error);
		} finally {
			isCreatingSwap = false;
		}
	}

	/**
	 * Monitor chain swap status and update UI
	 */
	function monitorSwapStatus(swapId: string) {
		// Poll for swap status every 5 seconds
		const interval = setInterval(async () => {
			try {
				const walletManager = getWalletManager();
				const swap = walletManager.chainSwapService.getSwap(swapId);
				if (!swap) {
					clearInterval(interval);
					return;
				}

				// Update swap in the list without reinitializing the array
				const swapIndex = pendingSwaps.findIndex((s) => s.id === swapId);
				if (swapIndex !== -1) {
					// Only update if there's an actual change to prevent unnecessary re-renders
					const currentSwap = pendingSwaps[swapIndex];
					if (
						currentSwap.status !== swap.status ||
						currentSwap.lockupTxHash !== swap.lockupTxHash ||
						currentSwap.claimTxHash !== swap.claimTxHash
					) {
						pendingSwaps[swapIndex] = swap;
						pendingSwaps = [...pendingSwaps]; // Trigger reactivity
					}
				}

				// Stop monitoring on final states
				if (
					[
						'transaction.claimed',
						'swap.expired',
						'transaction.failed',
						'transaction.refunded'
					].includes(swap.status)
				) {
					clearInterval(interval);

					// Show success message when claimed
					if (swap.status === 'transaction.claimed') {
						appStore.showSuccessToast($t('wallet.swap.lbtc.rbtc_received'));
					}
				}
			} catch (err) {
				console.error('Error monitoring swap:', err);
			}
		}, 5000);
	}

	/**
	 * Delete a single swap event
	 */
	async function deleteSwap(swapId: string) {
		try {
			const walletManager = getWalletManager();
			await walletManager.chainSwapService.deleteSwap(swapId);

			// Remove from UI
			pendingSwaps = pendingSwaps.filter((s) => s.id !== swapId);
			appStore.showSuccessToast($t('wallet.swap.deleted'));
		} catch (err) {
			console.error('Failed to delete swap:', err);
			appStore.showErrorToast($t('wallet.swap.error.delete_failed'));
		}
	}

	/**
	 * Delete all swap events (for testing)
	 */
	async function deleteAllSwaps() {
		if (!confirm($t('wallet.swap.confirm_delete_all'))) {
			return;
		}

		isDeletingSwaps = true;
		error = null;

		try {
			const walletManager = getWalletManager();
			const result = await walletManager.chainSwapService.deleteAllSwaps();
			pendingSwaps = [];
			appStore.showSuccessToast(
				$t('wallet.swap.deleted_count', { values: { count: result.count } })
			);
		} catch (err) {
			console.error('Failed to delete swaps:', err);
			error = err instanceof Error ? err.message : $t('wallet.swap.error.delete_failed');
			appStore.showErrorToast(error);
		} finally {
			isDeletingSwaps = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Developer Tool: Delete All Swaps -->
	{#if import.meta.env.DEV || network === 'regtest'}
		<div class="alert alert-outline alert-horizontal">
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
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<div class="flex w-full flex-col items-center justify-between space-y-2 sm:flex-row">
				<div class="flex-1">
					<h4 class="font-bold">{$t('wallet.swap.dev_tools')}</h4>
					<div class="text-sm">{$t('wallet.swap.dev_tools_description')}</div>
				</div>
				<button
					class="btn btn-error btn-sm mx-auto block"
					onclick={deleteAllSwaps}
					disabled={isDeletingSwaps}
				>
					{#if isDeletingSwaps}
						<span class="loading loading-spinner loading-xs"></span>
						{$t('wallet.swap.deleting')}
					{:else}
						🗑️ {$t('wallet.swap.delete_all')}
					{/if}
				</button>
			</div>
		</div>
	{/if}

	{#if error}
		<div class="alert alert-outline alert-error">
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
			<span>{error}</span>
		</div>
	{/if}

	<!-- Create Swap Form -->
	<div class="space-y-4">
		<!-- <div class="alert alert-outline alert-info">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				class="h-6 w-6 shrink-0 stroke-current"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<h4 class="font-bold">{$t('wallet.swap.lbtc.title')}</h4>
				<div class="text-sm">
					{$t('wallet.swap.lbtc.description')}
				</div>
			</div>
		</div> -->

		<div class="form-control">
			<label class="label" for="amount">
				<span class="label-text">{$t('wallet.swap.amount_sats')}</span>
				<span class="label-text-alt">
					{#if isLoadingLimits}
						<span class="loading loading-spinner loading-xs"></span>
						{$t('wallet.swap.loading')}...
					{:else if minAmount > 0}
						{$t('wallet.swap.min_amount')}: {minAmount.toLocaleString()} {$t('wallet.sats')}
					{/if}
				</span>
			</label>
			<input
				id="amount"
				type="number"
				step="1"
				min={minAmount > 0 ? minAmount : 0}
				max={maxAmount > 0 ? maxAmount : undefined}
				placeholder="100000"
				class="input input-bordered w-full {amountError ? 'input-error' : ''}"
				bind:value={amount}
				oninput={(e) => {
					// Clear existing timeout for immediate validation
					if (debounceTimeout) {
						clearTimeout(debounceTimeout);
					}
					// Validate immediately with the current input value
					const inputValue = (e.currentTarget as HTMLInputElement).value;
					validateAmount(inputValue);
				}}
				disabled={isCreatingSwap || isLoadingLimits}
			/>
			{#if amountError}
				<div class="label">
					<span class="label-text-alt text-error">{amountError}</span>
				</div>
			{/if}
		</div>

		<!-- Fee Breakdown -->
		{#if amount && parseFloat(amount) > 0}
			<div class="rounded-lg border border-base-300 bg-base-200 p-3">
				<div class="space-y-1.5 text-xs">
					<div class="flex justify-between items-center">
						<span class="opacity-70">{$t('wallet.swap.swap_fee')}:</span>
						<div class="text-right">
							<span>{swapFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60">${((swapFee / 100_000_000) * btcPrice).toFixed(2)}</span>
							{/if}
						</div>
					</div>
					<div class="flex justify-between items-center">
						<span class="opacity-70">{$t('wallet.swap.network_transaction_fee')}:</span>
						<div class="text-right">
							<span>{networkFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60">${((networkFee / 100_000_000) * btcPrice).toFixed(2)}</span>
							{/if}
						</div>
					</div>
					<div class="divider my-1.5"></div>
					<div class="flex justify-between items-center font-semibold">
						<span>{$t('wallet.swap.total_fees')}:</span>
						<div class="text-right">
							<span>{totalFees.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60">${((totalFees / 100_000_000) * btcPrice).toFixed(2)}</span>
							{/if}
						</div>
					</div>
					<div class="divider my-1.5"></div>
					<div class="flex justify-between items-center text-sm font-bold text-primary">
						<span>{$t('wallet.swap.total_received_est')}:</span>
						<div class="text-right">
							<span>{totalReceived.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-70">${((totalReceived / 100_000_000) * btcPrice).toFixed(2)}</span>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<div class="form-control">
			<label class="label" for="description">
				<span class="label-text">{$t('wallet.description')}</span>
				<span class="label-text-alt">{$t('wallet.optional')}</span>
			</label>
			<textarea
				id="description"
				placeholder={$t('wallet.payment_for_placeholder')}
				class="textarea textarea-bordered w-full"
				rows="2"
				bind:value={description}
				disabled={isCreatingSwap}
			></textarea>
		</div>

		<button
			class="btn btn-primary w-full"
			onclick={createSwap}
			disabled={isCreatingSwap || !$rskConnection.connected || amountError !== null || !amount || amountSats <= 0 || (minAmount > 0 && amountSats < minAmount)}
		>
			{#if isCreatingSwap}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.swap.creating')}
			{:else}
				{$t('wallet.swap.lbtc.generate_address')}
			{/if}
		</button>
	</div>

	<!-- Pending Swaps List -->
	{#if pendingSwaps.length > 0}
		<div class="space-y-4">
			<div class="divider">{$t('wallet.swap.pending_swaps')}</div>

			{#each pendingSwaps as swap, i (swap.id)}
				<PendingSwap
					{swap}
					swapType="lbtc"
					expanded={expandedSwaps.has(swap.id)}
					onCopyAddress={async (address: string) => {
						const { copyToClipboard } = await import('$lib/utils/helpers/clipboard');
						await copyToClipboard(address);
						appStore.showSuccessToast($t('wallet.swap.address_copied'));
					}}
					onDeleteSwap={deleteSwap}
				/>
			{/each}
		</div>
	{/if}
</div>
