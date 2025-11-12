<script lang="ts">
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';
	import type { SubmarineSwapData, WalletAsset } from '@bittasker/wallet-core';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { walletManager, allAssets } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import { parseLightningInvoice } from '$lib/utils/helpers/lightningInvoice';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';

	// Extended swap data with gas estimation
	type SubmarineSwapWithGas = SubmarineSwapData & {
		estimatedGas?: {
			costWei: bigint;
			costSats: number;
			totalRequired: number;
		};
	};

	// Invoice breakdown from parsed invoice and Boltz quote
	type InvoiceBreakdown = {
		invoiceAmount: number; // Amount from invoice in sats
		serviceFee: number; // Boltz service fee
		minerFee: number; // Miner/network fee
		totalRequired: number; // Total RBTC needed (invoice + fees)
		gasEstimate?: number; // RSK gas in sats
	};

	// Form state
	let invoice = $state('');
	let invoiceError = $state<string | null>(null);
	let isCreatingSwap = $state(false);
	let lockingSwapId = $state<string | null>(null); // Track which swap is being locked
	let pendingSwaps = $state<SubmarineSwapWithGas[]>([]);
	let swapLimits = $state<{ minimal: number; maximal: number } | null>(null);
	let isLoadingLimits = $state(false);
	let currentSwap = $state<SubmarineSwapWithGas | null>(null);
	let qrScannerActive = $state(false);

	// Invoice breakdown state
	let invoiceBreakdown = $state<InvoiceBreakdown | null>(null);
	let isLoadingBreakdown = $state(false);
	let btcPrice = $state<number>(0);

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
		const finishedStatuses: SubmarineSwapWithGas['status'][] = [
			'invoice.paid',
			'transaction.claimed',
			'swap.refunded',
			'transaction.failed'
		];
		return pendingSwaps.filter((swap) => !finishedStatuses.includes(swap.status));
	});

	/**
	 * Fetch swap limits, BTC price, and recover pending swaps
	 */
	onMount(async () => {
		try {
			// Load swap limits
			isLoadingLimits = true;
			swapLimits = await walletManager.getSubmarineSwapLimits();

			// Fetch BTC price for USD display
			try {
				btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			} catch (err) {
				console.error('Failed to fetch BTC price:', err);
				btcPrice = 60000; // Fallback price
			}

			// Recover pending swaps from wallet manager
			const recovered = await walletManager.submarineSwapService.recoverPendingSwaps();
			if (recovered && recovered.length > 0) {
				pendingSwaps = recovered;
				
				// Monitor all recovered swaps
				for (const swap of recovered) {
					monitorSwapStatus(swap.id);
				}
			}
		} catch (error) {
			console.error('Failed to load submarine swap limits:', error);
			appStore.showErrorToast($t('wallet.swap.error.create_failed'));
		} finally {
			isLoadingLimits = false;
		}
	});

	/**
	 * Validate Lightning invoice and parse amount
	 */
	function validateInvoice(inv: string): { isValid: boolean; error?: string; amountSats?: number } {
		if (!inv || inv.trim() === '') {
			return { isValid: false, error: $t('wallet.validation.invoice_required') };
		}
		
		// Basic format check
		if (!inv.toLowerCase().startsWith('ln')) {
			return { isValid: false, error: $t('wallet.validation.invoice_invalid') };
		}

		// Parse invoice to extract amount
		const parsed = parseLightningInvoice(inv);
		
		if (!parsed.isValid) {
			return { isValid: false, error: $t('wallet.validation.invoice_invalid') };
		}

		// Check if invoice has an amount
		if (!parsed.hasAmount || parsed.amountSats === null) {
			return { isValid: false, error: $t('wallet.swap.submarine.error.invoice_no_amount') };
		}

		// Validate amount against limits
		if (swapLimits) {
			if (parsed.amountSats < swapLimits.minimal) {
				return {
					isValid: false,
					error: $t('wallet.swap.error.minimum_amount_sats', {
						values: { minAmount: swapLimits.minimal.toLocaleString() }
					})
				};
			}
			if (parsed.amountSats > swapLimits.maximal) {
				return {
					isValid: false,
					error: $t('wallet.swap.error.maximum_amount_sats', {
						values: { maxAmount: swapLimits.maximal.toLocaleString() }
					})
				};
			}
		}

		return { isValid: true, amountSats: parsed.amountSats };
	}

	/**
	 * Fetch invoice breakdown with real-time fees from Boltz
	 */
	async function fetchInvoiceBreakdown(inv: string): Promise<void> {
		if (!inv || !inv.trim()) {
			invoiceBreakdown = null;
			return;
		}

		try {
			isLoadingBreakdown = true;
			invoiceError = null;

			// Validate and parse invoice
			const validation = validateInvoice(inv);
			if (!validation.isValid || !validation.amountSats) {
				invoiceError = validation.error || null;
				invoiceBreakdown = null;
				return;
			}

			const invoiceAmount = validation.amountSats;

			// Get submarine swap pairs from wallet manager
			const pairsData = await walletManager.getSubmarineSwapPairs();
			
			// For submarine swaps from RBTC to Lightning (BTC), we need the RBTC/BTC pair
			const pair = pairsData?.['RBTC']?.['BTC'];
			
			if (!pair || !pair.fees) {
				throw new Error('Unable to fetch fee information from Boltz for RBTC/BTC pair');
			}

			// Calculate fees based on Boltz fee structure
			// Service fee is a percentage of the amount
			const serviceFeePercentage = pair.fees.percentage; // e.g., 0.1 means 0.1%
			const serviceFee = Math.ceil((invoiceAmount * serviceFeePercentage) / 100);
			
			// Miner fee (network fee for the on-chain transaction)
			const minerFee = pair.fees.minerFees; // e.g., 32 sats for RBTC
			
			// Total required = invoice amount + service fee + miner fee
			const totalRequired = invoiceAmount + serviceFee + minerFee;

			// Check balance
			const availableRBTC = availableBalance();
			const totalRequiredRBTC = totalRequired / 100_000_000;

			if (totalRequiredRBTC > availableRBTC) {
				const shortfallSats = totalRequired - Math.floor(availableRBTC * 100_000_000);
				invoiceError = $t('wallet.swap.error.insufficient_balance_with_fees', {
					values: {
						needed: totalRequired.toLocaleString(),
						available: Math.floor(availableRBTC * 100_000_000).toLocaleString(),
						shortfall: shortfallSats.toLocaleString()
					}
				});
			}

			// Set breakdown
			invoiceBreakdown = {
				invoiceAmount,
				serviceFee,
				minerFee,
				totalRequired
			};
		} catch (error) {
			console.error('Failed to fetch invoice breakdown:', error);
			invoiceError = error instanceof Error ? error.message : $t('wallet.swap.error.fee_fetch_failed');
			invoiceBreakdown = null;
		} finally {
			isLoadingBreakdown = false;
		}
	}

	/**
	 * Monitor swap status and update UI
	 */
	function monitorSwapStatus(swapId: string) {
		// Poll for swap status every 5 seconds
		const interval = setInterval(async () => {
			try {
				const swap = walletManager.submarineSwapService.getSwap(swapId);
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
						currentSwap.lockupTxHash !== swap.lockupTxHash
					) {
						// Preserve estimatedGas from current swap
						const updatedSwap: SubmarineSwapWithGas = {
							...swap,
							estimatedGas: currentSwap.estimatedGas
						};
						pendingSwaps[swapIndex] = updatedSwap;
						pendingSwaps = [...pendingSwaps]; // Trigger reactivity
					}
				}

				// Stop monitoring on final states
				if (
					['invoice.paid', 'transaction.claimed', 'swap.refunded', 'transaction.failed'].includes(
						swap.status
					)
				) {
					clearInterval(interval);

					// Reload assets when swap completes to update balance
					if (swap.status === 'invoice.paid' || swap.status === 'transaction.claimed') {
						await walletManager.loadAssets();
						appStore.showSuccessToast($t('wallet.swap.submarine.invoice_paid'));
					}
				}
			} catch (err) {
				console.error('Error monitoring swap:', err);
			}
		}, 5000);
	}

	/**
	 * Get status display for submarine swap with user-friendly messages
	 */
	function getSwapStatus(swap: SubmarineSwapWithGas): {
		text: string;
		color: string;
		isComplete: boolean;
	} {
		switch (swap.status) {
			case 'swap.created':
				return {
					text: $t('wallet.swap.submarine.status.ready_to_lock'),
					color: 'badge-warning',
					isComplete: false
				};
			case 'transaction.mempool':
				return {
					text: $t('wallet.swap.submarine.status.funds_locked'),
					color: 'badge-info',
					isComplete: false
				};
			case 'transaction.confirmed':
			case 'invoice.pending':
				return {
					text: $t('wallet.swap.submarine.status.lockup_confirmed'),
					color: 'badge-info',
					isComplete: false
				};
			case 'invoice.paid':
			case 'transaction.claimed':
				return {
					text: $t('wallet.swap.submarine.status.swap_complete'),
					color: 'badge-success',
					isComplete: true
				};
			case 'swap.expired':
				return {
					text: $t('wallet.swap.submarine.status.expired'),
					color: 'badge-error',
					isComplete: true
				};
			case 'swap.refunded':
				return {
					text: $t('wallet.swap.submarine.status.refunded'),
					color: 'badge-warning',
					isComplete: true
				};
			case 'transaction.failed':
				return {
					text: $t('wallet.swap.submarine.status.failed'),
					color: 'badge-error',
					isComplete: true
				};
			default:
				// Fallback for any unexpected status - show as processing
				return {
					text: $t('wallet.swap.submarine.status.processing'),
					color: 'badge-ghost',
					isComplete: false
				};
		}
	}

	/**
	 * Handle QR code scan
	 */
	async function handleQRScan(barcode: Barcode) {
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

			// Fetch breakdown for the scanned invoice
			await fetchInvoiceBreakdown(invoice);
		}
	}

	/**
	 * Create submarine swap
	 */
	async function handleCreateSwap() {
		try {
			// Validate invoice (should already be validated via breakdown)
			if (!invoiceBreakdown) {
				await fetchInvoiceBreakdown(invoice);
				if (!invoiceBreakdown || invoiceError) {
					return;
				}
			}

			isCreatingSwap = true;

			// Create submarine swap via wallet manager
			const result = await walletManager.createSubmarineSwap(invoice);

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

			// Check balance including gas fees (if estimated)
			const swapAmount = result.swapData.fromAmount;
			const gasAmount = result.estimatedGas?.costSats || 0;
			const totalRequired = result.estimatedGas?.totalRequired || swapAmount;
			const totalRequiredRBTC = totalRequired / 100000000;
			
			const availableRBTC = availableBalance();
			
			if (totalRequiredRBTC > availableRBTC) {
				const shortfallSats = totalRequired - Math.floor(availableRBTC * 100000000);
				
				if (result.estimatedGas) {
					// Show detailed error with gas breakdown
					throw new Error(
						$t('wallet.swap.error.insufficient_balance_with_gas', {
							values: {
								swapAmount: swapAmount.toLocaleString(),
								gasAmount: gasAmount.toLocaleString(),
								totalNeeded: totalRequired.toLocaleString(),
								available: Math.floor(availableRBTC * 100000000).toLocaleString(),
								shortfall: shortfallSats.toLocaleString()
							}
						})
					);
				} else {
					// Fallback to simple insufficient balance error
					throw new Error($t('wallet.validation.insufficient_balance'));
				}
			}

			// Set current swap and add to pending swaps (with gas estimation)
			const swapWithGas: SubmarineSwapWithGas = {
				...result.swapData,
				estimatedGas: result.estimatedGas
			};
			currentSwap = swapWithGas;
			pendingSwaps = [...pendingSwaps, swapWithGas];

			// Start monitoring swap status
			monitorSwapStatus(result.swapId);

			// Clear invoice input and breakdown
			invoice = '';
			invoiceBreakdown = null;
			invoiceError = null;

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
			lockingSwapId = swap.id; // Set the specific swap being locked

			// Lock funds via wallet manager
			const result = await walletManager.lockSubmarineSwapFunds(swap);

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
			lockingSwapId = null; // Clear the locking state
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
					oninput={(e) => {
						const value = (e.currentTarget as HTMLInputElement).value;
						// Debounce breakdown fetching to avoid too many API calls
						if (value && value.toLowerCase().startsWith('ln')) {
							fetchInvoiceBreakdown(value);
						} else {
							invoiceBreakdown = null;
							invoiceError = null;
						}
					}}
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

		<!-- Invoice Breakdown Card -->
		{#if isLoadingBreakdown}
			<div class="flex items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 p-4">
				<span class="loading loading-spinner loading-sm"></span>
				<span class="text-sm">{$t('wallet.swap.loading_fees')}</span>
			</div>
		{:else if invoiceBreakdown}
			<div class="rounded-lg border border-base-300 bg-base-200 p-4">
				<h4 class="mb-3 text-sm font-semibold">{$t('wallet.swap.submarine.invoice_breakdown')}</h4>
				<div class="space-y-2 text-xs">
					<!-- Invoice Amount -->
					<div class="flex items-center justify-between">
						<span class="opacity-70">{$t('wallet.swap.submarine.invoice_amount')}:</span>
						<div class="text-right font-mono">
							<span class="font-semibold">{invoiceBreakdown.invoiceAmount.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60">
									${((invoiceBreakdown.invoiceAmount / 100_000_000) * btcPrice).toFixed(2)}
								</span>
							{/if}
						</div>
					</div>

					<!-- Service Fee -->
					<div class="flex items-center justify-between">
						<span class="opacity-70">{$t('wallet.swap.service_fee')}:</span>
						<div class="text-right font-mono">
							<span>{invoiceBreakdown.serviceFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60">
									${((invoiceBreakdown.serviceFee / 100_000_000) * btcPrice).toFixed(2)}
								</span>
							{/if}
						</div>
					</div>

					<!-- Miner Fee -->
					<div class="flex items-center justify-between">
						<span class="opacity-70">{$t('wallet.swap.miner_fee')}:</span>
						<div class="text-right font-mono">
							<span>{invoiceBreakdown.minerFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60">
									${((invoiceBreakdown.minerFee / 100_000_000) * btcPrice).toFixed(2)}
								</span>
							{/if}
						</div>
					</div>

					<div class="divider my-1.5"></div>

					<!-- Total Required -->
					<div class="flex items-center justify-between text-sm font-bold text-primary">
						<span>{$t('wallet.swap.submarine.total_required')}:</span>
						<div class="text-right font-mono">
							<span>{invoiceBreakdown.totalRequired.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-70">
									${((invoiceBreakdown.totalRequired / 100_000_000) * btcPrice).toFixed(2)}
								</span>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Create Swap Button -->
		<button
			class="btn btn-primary w-full"
			onclick={handleCreateSwap}
			disabled={!invoiceBreakdown || !!invoiceError || isCreatingSwap || isLoadingLimits || isLoadingBreakdown}
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
			{@const swapStatus = getSwapStatus(currentSwap)}
			<div class="card bg-base-200 border-primary border-2">
				<div class="card-body">
					<div class="flex items-start justify-between gap-2">
						<h3 class="card-title text-primary" style="font-size: 1.25rem;">
							{$t('wallet.swap.submarine.invoice_created')}
						</h3>
						<span class="badge {swapStatus.color} badge-lg">
							{swapStatus.text}
						</span>
					</div>

					<div class="space-y-3">
						<!-- Amount to Lock -->
						<div class="flex flex-col items-start justify-between sm:flex-row">
							<span class="text-sm opacity-70">{$t('wallet.swap.submarine.swap_amount')}:</span>
							<span class="font-bold">
								{(currentSwap.fromAmount / 100000000).toFixed(8)} RBTC
								<span class="text-sm opacity-70">
									({currentSwap.fromAmount.toLocaleString()} sats)
								</span>
							</span>
						</div>

						<!-- Gas Fees (if available) -->
						{#if currentSwap.estimatedGas}
							<div class="flex flex-col items-start justify-between sm:flex-row">
								<span class="text-sm opacity-70">{$t('wallet.swap.submarine.gas_fees')}:</span>
								<span class="font-mono text-sm">
									~{currentSwap.estimatedGas.costSats.toLocaleString()} sats
									<span class="text-xs opacity-70">
										({(currentSwap.estimatedGas.costSats / 100000000).toFixed(8)} RBTC)
									</span>
								</span>
							</div>

							<!-- Total Required -->
							<div class="divider my-1"></div>
							<div class="flex flex-col items-start justify-between sm:flex-row">
								<span class="text-sm font-semibold">{$t('wallet.swap.submarine.total_required')}:</span>
								<span class="font-bold text-primary">
									{(currentSwap.estimatedGas.totalRequired / 100000000).toFixed(8)} RBTC
									<span class="text-sm opacity-70">
										({currentSwap.estimatedGas.totalRequired.toLocaleString()} sats)
									</span>
								</span>
							</div>
						{/if}

						<!-- Invoice (truncated) -->
						<div class="flex flex-col items-start justify-between gap-2 sm:flex-row mt-2">
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
							disabled={lockingSwapId === currentSwap!.id}
						>
							{$t('wallet.swap.delete')}
						</button>
						<button
							class="btn btn-primary"
							onclick={() => handleLockFunds(currentSwap!)}
							disabled={swapStatus.isComplete || lockingSwapId === currentSwap!.id}
						>
							{#if lockingSwapId === currentSwap!.id}
								<span class="loading loading-spinner loading-sm"></span>
								{$t('wallet.swap.submarine.locking_funds')}
							{:else if swapStatus.isComplete}
								✓ {$t('wallet.swap.submarine.swap_complete')}
							{:else}
								{$t('wallet.swap.submarine.pay_invoice_button')}
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
