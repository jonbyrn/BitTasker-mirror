<script lang="ts">
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { rskConnection } from '$lib/stores/wallet.store';
	import {
		reverseSwapService,
		type BoltzSwapData
	} from '$lib/integrations/boltz/reverseSwapService';
	import { bytesToHex } from '@noble/hashes/utils';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import PendingSwap from '$lib/components/wallet/PendingSwap.svelte';

	// State
	let amount = $state('');
	let description = $state('');
	let isCreatingSwap = $state(false);
	let pendingSwaps = $state<BoltzSwapData[]>([]);
	let error = $state<string | null>(null);
	let isClaiming = $state(false);
	let nsecHex = $state<string>('');
	let isDeletingSwaps = $state(false);
	let expandedSwaps = $state<Set<string>>(new Set());
	let minAmount = $state<number>(0);
	let maxAmount = $state<number>(0);
	let isLoadingLimits = $state(true);

	// Get network
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

	// Derived values
	let minBTC = $derived(minAmount / 100_000_000);
	let maxBTC = $derived(maxAmount / 100_000_000);

	/**
	 * Get user's nsec and setup wallet getter on component load
	 * Also recover any pending swaps from Nostr and fetch swap limits
	 */
	$effect(() => {
		(async () => {
			try {
				const { nsec } = await getNostrKeyPair();
				nsecHex = bytesToHex(nsec);

				// Set wallet getter for automatic claiming
				reverseSwapService.setWalletGetter(() => $rskConnection.wallet);

				// Fetch swap limits from Boltz
				await fetchSwapLimits();

				// Recover pending swaps from Nostr storage
				const recovered = await reverseSwapService.recoverPendingSwaps(nsecHex);
				console.log('Recovered swaps:', recovered);

				if (recovered.length > 0) {
					pendingSwaps = recovered;

					// Monitor all recovered swaps
					for (const swap of recovered) {
						monitorSwapForClaiming(swap.id);
					}
				} else {
					console.log('ℹ️ No pending swaps found');
				}
			} catch (err) {
				console.error('Failed to initialize swap service:', err);
			}
		})();
	});

	/**
	 * Fetch swap limits from Boltz API
	 */
	async function fetchSwapLimits() {
		try {
			isLoadingLimits = true;
			const limits = await reverseSwapService.getSwapLimits();
			minAmount = limits.minimal;
			maxAmount = limits.maximal;
			console.log('✅ Fetched swap limits:', { minAmount, maxAmount, minBTC, maxBTC });
		} catch (err) {
			console.error('Failed to fetch swap limits:', err);
			// Use fallback values
			minAmount = 2500;
			maxAmount = 100_000_000; // 1 BTC
		} finally {
			isLoadingLimits = false;
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

		if (!nsecHex) {
			error = $t('wallet.swap.error.auth_required');
			return;
		}

		if (!amount || parseFloat(amount) <= 0) {
			error = $t('wallet.validation.amount_required');
			return;
		}

		const amountSats = Math.floor(parseFloat(amount) * 100_000_000);

		if (amountSats < minAmount) {
			error = $t('wallet.swap.error.minimum_amount', { values: { minAmount, minBTC } });
			return;
		}

		isCreatingSwap = true;
		error = null;

		try {
			const result = await reverseSwapService.createReverseSwap({
				amountSats,
				rbtcAddress: $rskConnection.address,
				description: description || undefined,
				nsec: nsecHex,
				walletSigner: $rskConnection.wallet // Pass wallet for Smart Wallet address computation
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
			const swap = reverseSwapService.getSwap(swapId);
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
				['invoice.settled', 'swap.expired', 'transaction.failed', 'claimed'].includes(swap.status)
			) {
				clearInterval(interval);

				// Show success message when settled
				if (swap.status === 'invoice.settled') {
					appStore.showSuccessToast($t('wallet.swap.lightning.rbtc_received'));
				}
			}
		}, 5000);
	}

	/**
	 * Manually claim rBTC
	 * Attempts gasless claim via RIF Relay first, falls back to direct claim if user has gas
	 */
	async function claimRBTC(swap: BoltzSwapData) {
		if (!nsecHex || !$rskConnection.wallet) {
			appStore.showErrorToast($t('wallet.rsk_wallet_not_connected'));
			return;
		}

		isClaiming = true;
		error = null;

		try {
			appStore.showInfoToast($t('wallet.swap.lightning.claiming_gasless'));

			// Attempt gasless claim via RIF Relay
			const result = await reverseSwapService.claimRBTCViaRifRelay(
				swap,
				nsecHex,
				$rskConnection.wallet
			);

			// Update swap in the list
			const swapIndex = pendingSwaps.findIndex((s) => s.id === swap.id);
			if (swapIndex !== -1) {
				pendingSwaps[swapIndex].claimTxHash = result.txHash;
				pendingSwaps[swapIndex].status = 'claimed';
				pendingSwaps[swapIndex].rifRelayUsed = true;
				pendingSwaps = [...pendingSwaps]; // Trigger reactivity
			}

			appStore.showSuccessToast($t('wallet.swap.lightning.claimed_success'));
		} catch (err) {
			console.error('Failed to claim RBTC:', err);
			error = err instanceof Error ? err.message : $t('wallet.swap.error.claim_failed');
			appStore.showErrorToast(error);
		} finally {
			isClaiming = false;
		}
	}

	/**
	 * Delete a single swap event from Nostr
	 */
	async function deleteSwap(swapId: string) {
		if (!nsecHex) {
			appStore.showErrorToast($t('wallet.swap.error.auth_required'));
			return;
		}

		if (!confirm($t('wallet.swap.confirm_delete'))) {
			return;
		}

		try {
			const success = await reverseSwapService.deleteSwapEvent(nsecHex, swapId);
			if (success) {
				// Remove from UI
				pendingSwaps = pendingSwaps.filter((s) => s.id !== swapId);
				appStore.showSuccessToast($t('wallet.swap.deleted'));
			} else {
				appStore.showErrorToast($t('wallet.swap.error.delete_failed'));
			}
		} catch (err) {
			console.error('Failed to delete swap:', err);
			appStore.showErrorToast($t('wallet.swap.error.delete_failed'));
		}
	}

	/**
	 * Delete all swap events from Nostr (for testing)
	 */
	async function deleteAllSwaps() {
		if (!nsecHex) {
			appStore.showErrorToast($t('wallet.swap.error.auth_required'));
			return;
		}

		if (!confirm($t('wallet.swap.confirm_delete_all'))) {
			return;
		}

		isDeletingSwaps = true;
		error = null;

		try {
			const result = await reverseSwapService.deleteAllSwapEvents(nsecHex);
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
		<div class="alert alert-horizontal">
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
			<span>{error}</span>
		</div>
	{/if}

	<!-- Create Swap Form -->
	<div class="space-y-4">
		<div class="alert alert-info">
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
				<h4 class="font-bold">{$t('wallet.swap.lightning.title')}</h4>
				<div class="text-sm">
					{$t('wallet.swap.lightning.description')}
				</div>
			</div>
		</div>

		<div class="form-control">
			<label class="label" for="amount">
				<span class="label-text">{$t('wallet.swap.amount_btc')}</span>
				<span class="label-text-alt">
					{#if isLoadingLimits}
						<span class="loading loading-spinner loading-xs"></span>
						{$t('wallet.swap.loading')}...
					{:else}
						{$t('wallet.swap.min_amount')}: {minBTC.toFixed(8)} BTC ({minAmount.toLocaleString()} sats)
					{/if}
				</span>
			</label>
			<input
				id="amount"
				type="number"
				step="0.00000001"
				placeholder="0.001"
				class="input input-bordered w-full"
				bind:value={amount}
				disabled={isCreatingSwap || isLoadingLimits}
			/>
		</div>

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
			disabled={isCreatingSwap || !$rskConnection.connected}
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
					onClaimRBTC={claimRBTC}
					onDeleteSwap={deleteSwap}
				/>
			{/each}
		</div>
	{/if}
</div>
