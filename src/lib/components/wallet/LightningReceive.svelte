<script lang="ts">
	import type { Signer } from 'ethers';
	import type { BoltzSwapData } from '@bittasker/wallet-core';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import { debounce } from '$lib/utils/helpers/common';
	import { rskConnection, walletManager } from '$lib/stores/wallet.store';
	import PendingSwap from '$lib/components/wallet/PendingSwap.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	// Form state
	let amount = $state('');
	let description = $state('');
	let amountError = $state<string | null>(null);

	// UI state
	let isCreatingSwap = $state(false);
	let pendingSwaps = $state<BoltzSwapData[]>([]);
	let error = $state<string | null>(null);
	let isDeletingSwaps = $state(false);
	let expandedSwaps = $state<Set<string>>(new Set());

	// Swap limits and fees
	let swapLimits = $state<{ minimal: number; maximal: number } | null>(null);
	let isLoadingLimits = $state(true);
	let fees = $state<{
		percentage: number;
		claimFee: number;
		lockupFee: number;
	} | null>(null);
	let btcPrice = $state<number>(0);

	// Derived values
	let amountSats = $derived(parseFloat(amount) || 0);
	let swapFee = $derived(
		fees && amountSats > 0 ? Math.ceil((amountSats * fees.percentage) / 100) : 0
	);
	let networkFee = $derived(fees ? fees.claimFee + fees.lockupFee : 0);
	let totalFees = $derived(swapFee + networkFee);
	let totalReceived = $derived(Math.max(0, amountSats - totalFees));

	/**
	 * Fetch swap limits, fees, and recover pending swaps
	 */
	onMount(async () => {
		try {
			isLoadingLimits = true;

			// Fetch pairs data from Boltz to get fees and limits
			const pairsData = await walletManager.getReverseSwapPairs();

			// For reverse swaps (Lightning → RBTC), we need the BTC/RBTC pair
			const pair = pairsData?.['BTC']?.['RBTC'];

			if (pair) {
				// Set limits
				swapLimits = {
					minimal: pair.limits.minimal,
					maximal: pair.limits.maximal
				};

				// Set fees
				type MinerFeesVariant = number | { lockup: number; claim: number } | { user: { lockup: number; claim: number } };
				const minerFees = pair.fees.minerFees as MinerFeesVariant;
				fees = {
					percentage: pair.fees.percentage,
					claimFee: typeof minerFees === 'number' 
						? minerFees 
						: 'user' in minerFees 
							? (minerFees as { user: { claim: number } }).user.claim 
							: (minerFees as { claim: number }).claim ?? 0,
					lockupFee: typeof minerFees === 'number'
						? 0
						: 'user' in minerFees 
							? (minerFees as { user: { lockup: number } }).user.lockup 
							: (minerFees as { lockup: number }).lockup ?? 0
				};
			}

			// Fetch BTC price for USD conversion
			try {
				btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			} catch (err) {
				console.error('Failed to fetch BTC price:', err);
				btcPrice = 60000; // Fallback price
			}

			// Recover pending swaps
			const recovered = await walletManager.reverseSwapService.recoverPendingSwaps();
			if (recovered.length > 0) {
				pendingSwaps = recovered;

				// Monitor all recovered swaps
				for (const swap of recovered) {
					monitorSwapForClaiming(swap.id);
				}
			}
		} catch (err) {
			console.error('Failed to load reverse swap data:', err);
			error = $t('wallet.swap.error.failed_to_load');
		} finally {
			isLoadingLimits = false;
		}
	});

	/**
	 * Validate amount against limits
	 */
	function validateAmount() {
		amountError = null;

		// Skip validation if amount is empty
		if (!amount || String(amount).trim() === '') {
			return;
		}

		const sats = parseFloat(amount);

		// Check for valid number
		if (isNaN(sats) || sats <= 0) {
			amountError = $t('wallet.validation.amount_required');
			return;
		}

		// Validate against limits (only if loaded)
		if (swapLimits && !isLoadingLimits) {
			if (sats < swapLimits.minimal) {
				amountError = $t('wallet.swap.error.minimum_amount_sats', {
					values: { minAmount: swapLimits.minimal.toLocaleString() }
				});
				return;
			}

			if (sats > swapLimits.maximal) {
				amountError = $t('wallet.swap.error.maximum_amount_sats', {
					values: { maxAmount: swapLimits.maximal.toLocaleString() }
				});
				return;
			}
		}
	}

	/**
	 * Create reverse swap
	 */
	async function createSwap() {
		if (!$rskConnection.address) {
			error = $t('wallet.rsk_not_connected');
			return;
		}

		// Validate amount before proceeding
		validateAmount();
		if (amountError) {
			error = amountError;
			return;
		}

		isCreatingSwap = true;
		error = null;

		try {
			const result = await walletManager.reverseSwapService.createReverseSwap({
				amountSats: Math.floor(parseFloat(amount)),
				rbtcAddress: $rskConnection.address,
				description: description || undefined,
				walletSigner: $rskConnection.wallet as Signer // Pass wallet for Smart Wallet address computation
			});

			// Add to pending swaps list
			pendingSwaps = [...pendingSwaps, result.swapData];

			appStore.showSuccessToast($t('wallet.swap.lightning.invoice_created'));

			// Monitor swap for automatic claiming
			monitorSwapForClaiming(result.swapId);

			// Clear form
			amount = '';
			description = '';
		} catch (err) {
			console.error('Failed to create swap:', err);
			error = err instanceof Error ? err.message : $t('wallet.swap.error.create_failed');
			appStore.showErrorToast(error);
		} finally {
			isCreatingSwap = false;
		}
	}

	/**
	 * Monitor swap status and update UI
	 */
	function monitorSwapForClaiming(swapId: string) {
		// Poll for swap status every 5 seconds
		const interval = setInterval(async () => {
			try {
				const swap = walletManager.reverseSwapService.getSwap(swapId);
				if (!swap) {
					clearInterval(interval);
					return;
				}

				// Update swap in the list
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
					['invoice.settled', 'swap.expired', 'transaction.failed', 'claimed'].includes(swap.status)
				) {
					clearInterval(interval);

					// Show success message when settled
					if (swap.status === 'invoice.settled') {
						appStore.showSuccessToast($t('wallet.swap.lightning.rbtc_received'));
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
			await walletManager.reverseSwapService.deleteSwap(swapId);

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
			const result = await walletManager.reverseSwapService.deleteAllSwaps();
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
	{#if import.meta.env.DEV || $appStore.network !== 'mainnet'}
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
		<div class="form-control">
			<label class="label flex flex-col items-start sm:flex-row sm:items-center" for="amount">
				<span class="label-text">{$t('wallet.swap.amount_btc')}</span>
				<span class="label-text-alt">
					{#if isLoadingLimits}
						<span class="loading loading-spinner loading-xs"></span>
						{$t('wallet.swap.loading')}...
					{:else if swapLimits}
						{$t('wallet.swap.min_amount')}: {swapLimits.minimal.toLocaleString()}
						{$t('wallet.sats')}
					{/if}
				</span>
			</label>
			<input
				id="amount"
				type="number"
				step="1"
				min={swapLimits?.minimal || 0}
				max={swapLimits?.maximal || undefined}
				placeholder="100000"
				class="input input-bordered w-full"
				class:input-error={amountError}
				bind:value={amount}
				oninput={debounce(() => validateAmount(), 500)}
				disabled={isCreatingSwap || isLoadingLimits}
			/>
			{#if amountError}
				<div class="label">
					<span class="label-text-alt text-error">{amountError}</span>
				</div>
			{/if}
		</div>

		<!-- Fee Breakdown -->
		{#if amount && parseFloat(amount) > 0 && fees}
			<div class="border-base-300 bg-base-200 rounded-lg border p-3">
				<div class="space-y-1.5 text-xs">
					<!-- Swap Fee -->
					<div class="flex items-center justify-between">
						<span class="opacity-70">{$t('wallet.swap.swap_fee')}:</span>
						<div class="text-right">
							<span>{swapFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60"
									>${((swapFee / 100_000_000) * btcPrice).toFixed(2)}</span
								>
							{/if}
						</div>
					</div>

					<!-- Network Transaction Fee -->
					<div class="flex items-center justify-between">
						<span class="opacity-70">{$t('wallet.swap.network_transaction_fee')}:</span>
						<div class="text-right">
							<span>{networkFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60"
									>${((networkFee / 100_000_000) * btcPrice).toFixed(2)}</span
								>
							{/if}
						</div>
					</div>

					<div class="divider my-1.5"></div>

					<!-- Total Fees -->
					<div class="flex items-center justify-between font-semibold">
						<span>{$t('wallet.swap.total_fees')}:</span>
						<div class="text-right">
							<span>{totalFees.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60"
									>${((totalFees / 100_000_000) * btcPrice).toFixed(2)}</span
								>
							{/if}
						</div>
					</div>

					<div class="divider my-1.5"></div>

					<!-- Total Received (You get) -->
					<div class="text-primary flex items-center justify-between text-sm font-bold">
						<span>{$t('wallet.swap.total_received_est')}:</span>
						<div class="text-right">
							<span>{totalReceived.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-70"
									>${((totalReceived / 100_000_000) * btcPrice).toFixed(2)}</span
								>
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
			disabled={isCreatingSwap ||
				!$rskConnection.connected ||
				!!amountError ||
				!amount ||
				amountSats <= 0 ||
				isLoadingLimits}
		>
			{#if isCreatingSwap}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.swap.creating')}
			{:else}
				{$t('wallet.swap.lightning.generate_invoice')}
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
					swapType="lightning"
					expanded={expandedSwaps.has(swap.id)}
					onCopyInvoice={async (invoice: string) => {
						const { copyToClipboard } = await import('$lib/utils/helpers/clipboard');
						await copyToClipboard(invoice);
						appStore.showSuccessToast($t('wallet.swap.invoice_copied'));
					}}
					onDeleteSwap={deleteSwap}
				/>
			{/each}
		</div>
	{/if}
</div>
