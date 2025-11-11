<script lang="ts">
	import type { SubmarineSwapData, WalletAsset } from '@bittasker/wallet-core';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { walletManager, allAssets } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';

	// Form state
	let invoice = $state('');
	let invoiceError = $state<string | null>(null);
	let isCreatingSwap = $state(false);
	let isLockingFunds = $state(false);
	let pendingSwaps = $state<SubmarineSwapData[]>([]);
	let swapLimits = $state<{ minimal: number; maximal: number } | null>(null);
	let isLoadingLimits = $state(false);
	let currentSwap = $state<SubmarineSwapData | null>(null);
	let qrScannerActive = $state(false);

	// Get available RBTC balance
	let availableBalance = $derived(() => {
		const rskAssets = $allAssets.filter((asset: WalletAsset) => asset.network === 'RSK');
		return rskAssets.length > 0 ? rskAssets[0].balance : 0;
	});

	/**
	 * Filter out finished swaps (only show pending ones)
	 * 
	 * Finished states:
	 * - invoice.paid: Boltz successfully paid the Lightning invoice
	 * - transaction.claimed: Boltz claimed the on-chain funds (swap complete)
	 * - swap.refunded: Swap was refunded to user
	 * - transaction.failed: Transaction failed
	 */
	let activePendingSwaps = $derived(() => {
		const finishedStatuses: SubmarineSwapData['status'][] = [
			'invoice.paid',
			'transaction.claimed',
			'swap.refunded',
			'transaction.failed'
		];
		return pendingSwaps.filter((swap) => !finishedStatuses.includes(swap.status));
	});

	/**
	 * Fetch swap limits and recover pending swaps
	 */
	onMount(async () => {
		try {
			// Load swap limits
			isLoadingLimits = true;
			swapLimits = await walletManager.getSubmarineSwapLimits();

			// Recover pending swaps from wallet manager
			const recovered = await walletManager.submarineSwapService.recoverPendingSwaps();
			if (recovered && recovered.length > 0) {
				pendingSwaps = recovered;
				console.log(`✅ Recovered ${recovered.length} pending submarine swap(s)`);
			}
		} catch (error) {
			console.error('Failed to load submarine swap limits:', error);
			appStore.showErrorToast($t('wallet.swap.error.create_failed'));
		} finally {
			isLoadingLimits = false;
		}
	});

	/**
	 * Validate Lightning invoice
	 */
	function validateInvoice(inv: string): { isValid: boolean; error?: string } {
		if (!inv || inv.trim() === '') {
			return { isValid: false, error: $t('wallet.validation.invoice_required') };
		}
		if (!inv.toLowerCase().startsWith('ln')) {
			return { isValid: false, error: $t('wallet.validation.invoice_invalid') };
		}
		return { isValid: true };
	}

	/**
	 * Handle QR code scan
	 */
	function handleQRScan(barcode: Barcode) {
		const scannedData = barcode.displayValue;
		if (scannedData) {
			// Extract invoice from scanned data
			let extractedInvoice = scannedData;

			// Handle lightning: URI format
			if (scannedData.toLowerCase().startsWith('lightning:')) {
				extractedInvoice = scannedData.substring(10);
			}

			// Remove any query parameters
			const queryIndex = extractedInvoice.indexOf('?');
			if (queryIndex > 0) {
				extractedInvoice = extractedInvoice.substring(0, queryIndex);
			}

			invoice = extractedInvoice.trim();
			qrScannerActive = false;

			// Validate the scanned invoice
			const validation = validateInvoice(invoice);
			if (!validation.isValid) {
				invoiceError = validation.error || null;
				appStore.showErrorToast(validation.error || $t('wallet.validation.invoice_invalid'));
			} else {
				invoiceError = null;
			}
		}
	}

	/**
	 * Create submarine swap
	 */
	async function handleCreateSwap() {
		try {
			// Validate invoice
			const validation = validateInvoice(invoice);
			if (!validation.isValid) {
				invoiceError = validation.error || null;
				appStore.showErrorToast(validation.error || $t('wallet.validation.invoice_invalid'));
				return;
			}

			invoiceError = null;
			isCreatingSwap = true;

			// Create submarine swap via wallet manager
			const result = await walletManager.createSubmarineSwap(invoice);

			console.log('📋 Full swap data:', { result });

			// Check swap limits
			if (swapLimits) {
				if (result.swapData.fromAmount < swapLimits.minimal) {
					throw new Error(
						$t('wallet.swap.error.minimum_amount', {
							values: {
								minAmount: swapLimits.minimal,
								minBTC: (swapLimits.minimal / 100000000).toFixed(8)
							}
						})
					);
				}
				if (result.swapData.fromAmount > swapLimits.maximal) {
					throw new Error(
						$t('wallet.swap.error.amount_above_maximum', {
							values: { max: swapLimits.maximal }
						})
					);
				}
			}

			// Check balance
			const rbtcNeeded = result.swapData.fromAmount / 100000000; // Convert sats to RBTC
			if (rbtcNeeded > availableBalance()) {
				throw new Error($t('wallet.validation.insufficient_balance'));
			}

			// Set current swap and add to pending swaps
			currentSwap = result.swapData;
			pendingSwaps = [...pendingSwaps, result.swapData];

			// Clear invoice input
			invoice = '';

			appStore.showSuccessToast($t('wallet.swap.submarine.invoice_created'));
		} catch (error) {
			console.error('Failed to create submarine swap:', error);
			const errorMessage =
				error instanceof Error ? error.message : $t('wallet.swap.error.create_failed');
			invoiceError = errorMessage;
			appStore.showErrorToast(errorMessage);
		} finally {
			isCreatingSwap = false;
		}
	}

	/**
	 * Lock funds for submarine swap
	 */
	async function handleLockFunds(swap: SubmarineSwapData) {
		try {
			isLockingFunds = true;

			console.log('📋 Swap data:', { swap });

			// Lock funds via wallet manager
			const result = await walletManager.lockSubmarineSwapFunds(swap);

			console.log('✅ Funds locked! Transaction:', result.txHash);

			// Update swap in pending swaps list
			const swapIndex = pendingSwaps.findIndex((s) => s.id === swap.id);
			if (swapIndex !== -1) {
				const updatedSwap = walletManager.submarineSwapService.getSwap(swap.id);
				if (updatedSwap) {
					pendingSwaps[swapIndex] = updatedSwap;
					pendingSwaps = [...pendingSwaps]; // Trigger reactivity
				}
			}

			// Clear current swap if it's the one we just locked
			if (currentSwap?.id === swap.id) {
				currentSwap = null;
			}

			appStore.showSuccessToast($t('wallet.swap.submarine.locking_funds'));
		} catch (error) {
			console.error('Failed to lock funds:', error);
			appStore.showErrorToast(
				error instanceof Error ? error.message : $t('wallet.swap.error.create_failed')
			);
		} finally {
			isLockingFunds = false;
		}
	}

	/**
	 * Copy invoice to clipboard
	 */
	async function handleCopyInvoice(inv: string) {
		try {
			await navigator.clipboard.writeText(inv);
			appStore.showSuccessToast($t('wallet.swap.invoice_copied'));
		} catch (error) {
			console.error('Failed to copy invoice:', error);
		}
	}

	/**
	 * Delete submarine swap
	 */
	async function handleDeleteSwap(swapId: string) {
		try {
			const confirmed = confirm($t('wallet.swap.confirm_delete'));
			if (!confirmed) return;

			await walletManager.submarineSwapService.deleteSwap(swapId);
			pendingSwaps = pendingSwaps.filter((s) => s.id !== swapId);

			// Clear current swap if it's the one we deleted
			if (currentSwap?.id === swapId) {
				currentSwap = null;
			}

			appStore.showSuccessToast($t('wallet.swap.deleted'));
		} catch (error) {
			console.error('Failed to delete swap:', error);
			appStore.showErrorToast($t('wallet.swap.error.delete_failed'));
		}
	}

	/**
	 * Delete all submarine swaps
	 */
	async function handleDeleteAll() {
		try {
			const confirmed = confirm($t('wallet.swap.confirm_delete_all'));
			if (!confirmed) return;

			const result = await walletManager.submarineSwapService.deleteAllSwaps();
			pendingSwaps = [];
			currentSwap = null;

			appStore.showSuccessToast(
				$t('wallet.swap.deleted_count', { values: { count: result.count } })
			);
		} catch (error) {
			console.error('Failed to delete all swaps:', error);
			appStore.showErrorToast($t('wallet.swap.error.delete_failed'));
		}
	}
</script>

<div class="space-y-6">
	<!-- Info Card -->
	<div class="alert alert-outline alert-info">
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
			></path>
		</svg>
		<div>
			<div class="font-bold">{$t('wallet.swap.submarine.title')}</div>
			<div class="text-sm">{$t('wallet.swap.submarine.description')}</div>
		</div>
	</div>

	<!-- Swap Limits -->
	{#if isLoadingLimits}
		<div class="flex items-center justify-center gap-2 text-sm">
			<span class="loading loading-spinner loading-sm"></span>
			<span>{$t('wallet.swap.loading')}</span>
		</div>
	{:else if swapLimits}
		<div class="alert alert-outline bg-base-200 border-base-300">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				class="text-base-content h-6 w-6 shrink-0 stroke-current"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				></path>
			</svg>
			<div>
				<div class="text-base-content/70 text-sm">
					{$t('wallet.swap.min_amount')}: {swapLimits.minimal.toLocaleString()} sats ({(
						swapLimits.minimal / 100000000
					).toFixed(8)} RBTC)
					<br />
					Max: {swapLimits.maximal.toLocaleString()} sats ({(
						swapLimits.maximal / 100000000
					).toFixed(8)} RBTC)
				</div>
			</div>
		</div>
	{/if}

	<!-- Invoice Input Section -->
	{#if !currentSwap}
		<div class="form-control">
			<label class="label" for="lightning-invoice">
				<span class="label-text font-medium">{$t('wallet.swap.submarine.invoice_label')}</span>
			</label>

			<div class="join w-full">
				<input
					id="lightning-invoice"
					type="text"
					bind:value={invoice}
					placeholder={$t('wallet.swap.submarine.invoice_placeholder')}
					class="input input-bordered join-item flex-1"
					class:input-error={invoiceError}
					disabled={isCreatingSwap}
				/>
				<button
					class="btn btn-primary join-item"
					onclick={() => (qrScannerActive = true)}
					disabled={isCreatingSwap}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="h-5 w-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"
						/>
					</svg>
					<span class="hidden sm:inline">{$t('wallet.swap.submarine.scan_qr')}</span>
				</button>
			</div>

			{#if invoiceError}
				<div class="label">
					<span class="label-text-alt text-error">{invoiceError}</span>
				</div>
			{:else}
				<div class="label">
					<span class="label-text-alt">{$t('wallet.swap.submarine.helper.paste_invoice')}</span>
				</div>
			{/if}
		</div>

		<!-- Create Swap Button -->
		<button
			class="btn btn-primary w-full"
			onclick={handleCreateSwap}
			disabled={!invoice.trim() || isCreatingSwap || isLoadingLimits}
		>
			{#if isCreatingSwap}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.swap.creating')}
			{:else}
				{$t('wallet.swap.submarine.generate_swap')}
			{/if}
		</button>
	{/if}

	<!-- Current Swap - Ready to Lock Funds -->
	{#if activePendingSwaps().length > 0}
		{#each activePendingSwaps() as currentSwap, i (currentSwap.id)}
			<div class="card bg-base-200 border-primary border-2">
				<div class="card-body">
					<h3 class="card-title text-primary" style="font-size: 1.25rem;">
						{$t('wallet.swap.submarine.invoice_created')}
					</h3>

					<div class="space-y-3">
						<!-- Amount to Lock -->
						<div class="flex flex-col items-start justify-between sm:flex-row">
							<span class="text-sm opacity-70">{$t('wallet.amount')}:</span>
							<span class="font-bold">
								{(currentSwap.fromAmount / 100000000).toFixed(8)} RBTC
								<span class="text-sm opacity-70">
									({currentSwap.fromAmount.toLocaleString()} sats)
								</span>
							</span>
						</div>

						<!-- Invoice (truncated) -->
						<div class="flex flex-col items-start justify-between gap-2 sm:flex-row">
							<span class="text-sm opacity-70">{$t('wallet.swap.submarine.invoice_label')}:</span>
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => handleCopyInvoice(currentSwap?.invoice || '')}
							>
								{currentSwap.invoice.substring(0, 20)}...
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-4 w-4"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
									/>
								</svg>
							</button>
						</div>

						<!-- Helper Text -->
						<div class="alert alert-outline alert-info">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								class="h-5 w-5 shrink-0 stroke-current"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<span class="text-sm">{$t('wallet.swap.submarine.helper.lock_to_pay')}</span>
						</div>
					</div>

					<!-- Lock Funds Button -->
					<div class="card-actions mt-4 justify-end">
						<button
							class="btn btn-ghost btn-outline w-full sm:w-fit"
							onclick={() => handleDeleteSwap(currentSwap!.id)}
						>
							{$t('wallet.swap.delete')}
						</button>
						<button
							class="btn btn-primary"
							onclick={() => handleLockFunds(currentSwap!)}
							disabled={isLockingFunds}
						>
							{#if isLockingFunds}
								<span class="loading loading-spinner loading-sm"></span>
								{$t('wallet.swap.submarine.locking_funds')}
							{:else}
								{$t('wallet.swap.submarine.lock_funds_button', {
									values: { amount: (currentSwap.fromAmount / 100000000).toFixed(8) }
								})}
							{/if}
						</button>
					</div>
				</div>
			</div>
		{/each}
	{/if}

	<!-- Developer Tools -->
	{#if import.meta.env.DEV && activePendingSwaps().length > 0}
		<details class="collapse-arrow bg-base-200 collapse">
			<summary class="collapse-title text-sm font-medium">
				{$t('wallet.swap.dev_tools')}
			</summary>
			<div class="collapse-content">
				<p class="mb-4 text-sm opacity-70">
					{$t('wallet.swap.dev_tools_description')}
				</p>
				<button class="btn btn-error btn-sm w-full" onclick={handleDeleteAll}>
					{$t('wallet.swap.delete_all')}
				</button>
			</div>
		</details>
	{/if}
</div>

<!-- QR Code Scanner Modal -->
{#if qrScannerActive}
	<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="mb-4 text-lg font-bold">{$t('wallet.swap.submarine.scan_qr')}</h3>

			<QrCodeScanner onScan={handleQRScan} onClose={() => (qrScannerActive = false)} />

			<div class="modal-action">
				<button class="btn" onclick={() => (qrScannerActive = false)}>
					{$t('common.buttons.cancel')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={() => (qrScannerActive = false)}
			aria-label="Close scanner"
		></button>
	</div>
{/if}
