<script lang="ts">
	import type { Signer } from 'ethers';
	import type { BoltzSwapData, ChainSwapData } from '@bittasker/wallet-core';
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';
	import { appStore } from '$lib/stores/app.store';
	import { debounce } from '$lib/utils/helpers/common';
	import { rskConnection, walletManager } from '$lib/stores/wallet.store';
	import PendingSwap from '$lib/components/wallet/PendingSwap.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	type SwapNetwork = 'lightning' | 'liquid';
	type SwapData = BoltzSwapData | ChainSwapData;

	interface SwapNetworkConfig {
		pairKey: string;
		getPairs: () => ReturnType<typeof walletManager.getReverseSwapPairs>;
		getService: () => {
			recoverPendingSwaps(): Promise<SwapData[]>;
			createReverseSwap?: (
				params: Record<string, unknown>
			) => Promise<{ swapData: SwapData; swapId: string }>;
			createChainSwap?: (
				params: Record<string, unknown>
			) => Promise<{ swapData: SwapData; swapId: string }>;
			getSwap(swapId: string): SwapData | undefined;
			deleteSwap(swapId: string): Promise<void>;
			deleteAllSwaps(): Promise<{ count: number }>;
		};
		extractFees(
			pair: Record<string, unknown>
		): { percentage: number; claimFee: number; lockupFee: number };
		finalStates: string[];
		successState: string;
		successToastKey: string;
		createdToastKey: string;
		buttonTextKey: string;
		swapType: 'lightning' | 'lbtc';
		devToolsCondition: (network: string) => boolean;
	}

	let { network }: { network: SwapNetwork } = $props();

	// ── Network configuration ──────────────────────────────────────────
	const networkConfigs: Record<SwapNetwork, SwapNetworkConfig> = {
		lightning: {
			pairKey: 'BTC',
			getPairs: () => walletManager.getReverseSwapPairs(),
			getService: () =>
				walletManager.reverseSwapService as unknown as SwapNetworkConfig['getService'] extends () => infer R
					? R
					: never,
			extractFees: (pair) => {
				const f = pair.fees as { percentage: number; minerFees: { claim: number; lockup: number } };
				return {
					percentage: f.percentage,
					claimFee: f.minerFees.claim,
					lockupFee: f.minerFees.lockup
				};
			},
			finalStates: ['invoice.settled', 'swap.expired', 'transaction.failed', 'claimed'],
			successState: 'invoice.settled',
			successToastKey: 'wallet.swap.lightning.rbtc_received',
			createdToastKey: 'wallet.swap.lightning.invoice_created',
			buttonTextKey: 'wallet.swap.lightning.generate_invoice',
			swapType: 'lightning',
			devToolsCondition: (net) => net !== 'mainnet'
		},
		liquid: {
			pairKey: 'L-BTC',
			getPairs: () => walletManager.getChainSwapPairs(),
			getService: () =>
				walletManager.chainSwapService as unknown as SwapNetworkConfig['getService'] extends () => infer R
					? R
					: never,
			extractFees: (pair) => {
				const f = pair.fees as {
					percentage: number;
					minerFees: { user: { claim: number; lockup: number } };
				};
				return {
					percentage: f.percentage,
					claimFee: f.minerFees.user.claim,
					lockupFee: f.minerFees.user.lockup
				};
			},
			finalStates: [
				'transaction.claimed',
				'swap.expired',
				'transaction.failed',
				'transaction.refunded'
			],
			successState: 'transaction.claimed',
			successToastKey: 'wallet.swap.lbtc.rbtc_received',
			createdToastKey: 'wallet.swap.lbtc.address_created',
			buttonTextKey: 'wallet.swap.lbtc.generate_address',
			swapType: 'lbtc',
			devToolsCondition: (net) => net === 'regtest'
		}
	};

	let config = $derived(networkConfigs[network]);

	// ── Form state ─────────────────────────────────────────────────────
	let amount = $state('');
	let description = $state('');
	let amountError = $state<string | null>(null);

	// ── UI state ───────────────────────────────────────────────────────
	let isCreatingSwap = $state(false);
	let pendingSwaps = $state<SwapData[]>([]);
	let error = $state<string | null>(null);
	let isDeletingSwaps = $state(false);
	let expandedSwaps = $state<Set<string>>(new Set());

	// ── Swap limits and fees ───────────────────────────────────────────
	let swapLimits = $state<{ minimal: number; maximal: number } | null>(null);
	let isLoadingLimits = $state(true);
	let fees = $state<{
		percentage: number;
		claimFee: number;
		lockupFee: number;
	} | null>(null);
	let btcPrice = $state<number>(0);

	// ── Derived values ─────────────────────────────────────────────────
	let amountSats = $derived(parseFloat(amount) || 0);
	let swapFee = $derived(
		fees && amountSats > 0 ? Math.ceil((amountSats * fees.percentage) / 100) : 0
	);
	let networkFee = $derived(fees ? fees.claimFee + fees.lockupFee : 0);
	let totalFees = $derived(swapFee + networkFee);
	let totalReceived = $derived(Math.max(0, amountSats - totalFees));
	/** Whether the swap service is available (limits loaded successfully, no critical error) */
	let swapServiceAvailable = $derived(swapLimits !== null && !error);

	// ── Interval tracking for cleanup ──────────────────────────────────
	const activeIntervals: ReturnType<typeof setInterval>[] = [];

	onDestroy(() => {
		for (const interval of activeIntervals) {
			clearInterval(interval);
		}
		activeIntervals.length = 0;
	});

	/**
	 * Fetch swap limits, fees, and recover pending swaps
	 */
	onMount(async () => {
		try {
			isLoadingLimits = true;

			const pairsData = await config.getPairs();
			const pair = (pairsData as Record<string, Record<string, unknown>>)?.[config.pairKey]?.[
				'RBTC'
			];

			if (pair) {
				const pairData = pair as Record<string, unknown>;
				const limits = pairData.limits as { minimal: number; maximal: number };

				swapLimits = {
					minimal: limits.minimal,
					maximal: limits.maximal
				};

				fees = config.extractFees(pairData);
			}

			// Fetch BTC price for USD conversion
			try {
				btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			} catch (err) {
				Sentry.captureException(err, {
					tags: { feature: 'receive', network, action: 'fetch-btc-price' }
				});
				console.warn('[SwapReceive] BTC price unavailable, hiding USD estimates');
				btcPrice = 0;
			}

			// Recover pending swaps
			const service = config.getService();
			const recovered = await service.recoverPendingSwaps();
			if (recovered.length > 0) {
				pendingSwaps = recovered;

				for (const swap of recovered) {
					monitorSwapStatus(swap.id);
				}
			}
		} catch (err) {
			Sentry.captureException(err, {
				tags: { feature: 'receive', network, action: 'load-swap-data' }
			});
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

		if (!amount || String(amount).trim() === '') {
			return;
		}

		const sats = parseFloat(amount);

		if (isNaN(sats) || sats <= 0) {
			amountError = $t('wallet.validation.amount_required');
			return;
		}

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
	 * Create swap
	 */
	async function createSwap() {
		if (!$rskConnection.address) {
			error = $t('wallet.rsk_not_connected');
			return;
		}

		validateAmount();
		if (amountError) {
			error = amountError;
			return;
		}

		isCreatingSwap = true;
		error = null;

		try {
			const service = config.getService();
			const swapParams: Record<string, unknown> = {
				amountSats: Math.floor(parseFloat(amount)),
				rbtcAddress: $rskConnection.address,
				walletSigner: $rskConnection.wallet as Signer
			};

			// Only lightning reverse swaps accept a description
			if (network === 'lightning' && description) {
				swapParams.description = description;
			}

			let result: { swapData: SwapData; swapId: string };
			if (network === 'lightning' && service.createReverseSwap) {
				result = await service.createReverseSwap(swapParams);
			} else if (service.createChainSwap) {
				result = await service.createChainSwap(swapParams);
			} else {
				throw new Error(`No create swap method available for network: ${network}`);
			}

			pendingSwaps = [...pendingSwaps, result.swapData];
			appStore.showSuccessToast($t(config.createdToastKey));
			monitorSwapStatus(result.swapId);

			amount = '';
			description = '';
		} catch (err) {
			Sentry.captureException(err, {
				tags: { feature: 'receive', network, action: 'create-swap' }
			});
			error = err instanceof Error ? err.message : $t('wallet.swap.error.create_failed');
			appStore.showErrorToast(error);
		} finally {
			isCreatingSwap = false;
		}
	}

	/**
	 * Monitor swap status and update UI. All intervals are tracked and
	 * cleaned up on component destroy to prevent memory leaks.
	 */
	function monitorSwapStatus(swapId: string) {
		const interval = setInterval(async () => {
			try {
				const service = config.getService();
				const swap = service.getSwap(swapId);
				if (!swap) {
					clearInterval(interval);
					return;
				}

				const swapIndex = pendingSwaps.findIndex((s) => s.id === swapId);
				if (swapIndex !== -1) {
					const currentSwap = pendingSwaps[swapIndex];
					if (
						currentSwap.status !== swap.status ||
						currentSwap.lockupTxHash !== swap.lockupTxHash ||
						currentSwap.claimTxHash !== swap.claimTxHash
					) {
						pendingSwaps[swapIndex] = swap;
						pendingSwaps = [...pendingSwaps];
					}
				}

				if (config.finalStates.includes(swap.status)) {
					clearInterval(interval);

					if (swap.status === config.successState) {
						appStore.showSuccessToast($t(config.successToastKey));
					}
				}
			} catch (err) {
				Sentry.captureException(err, {
					tags: { feature: 'receive', network, action: 'monitor-swap' },
					extra: { swapId }
				});
			}
		}, 5000);

		activeIntervals.push(interval);
	}

	/**
	 * Delete a single swap event
	 */
	async function deleteSwap(swapId: string) {
		try {
			const service = config.getService();
			await service.deleteSwap(swapId);
			pendingSwaps = pendingSwaps.filter((s) => s.id !== swapId);
			appStore.showSuccessToast($t('wallet.swap.deleted'));
		} catch (err) {
			Sentry.captureException(err, {
				tags: { feature: 'receive', network, action: 'delete-swap' },
				extra: { swapId }
			});
			appStore.showErrorToast($t('wallet.swap.error.delete_failed'));
		}
	}

	/**
	 * Delete all swap events (dev tool)
	 */
	async function deleteAllSwaps() {
		if (!confirm($t('wallet.swap.confirm_delete_all'))) {
			return;
		}

		isDeletingSwaps = true;
		error = null;

		try {
			const service = config.getService();
			const result = await service.deleteAllSwaps();
			pendingSwaps = [];
			appStore.showSuccessToast(
				$t('wallet.swap.deleted_count', { values: { count: result.count } })
			);
		} catch (err) {
			Sentry.captureException(err, {
				tags: { feature: 'receive', network, action: 'delete-all-swaps' }
			});
			error = err instanceof Error ? err.message : $t('wallet.swap.error.delete_failed');
			appStore.showErrorToast(error);
		} finally {
			isDeletingSwaps = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Developer Tool: Delete All Swaps -->
	{#if import.meta.env.DEV || config.devToolsCondition($appStore.network)}
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

	<!-- Swap service unavailable warning (H22) -->
	{#if !isLoadingLimits && !swapServiceAvailable}
		<div class="alert alert-warning">
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
			<span>{$t('wallet.receive.swap_service_unavailable')}</span>
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

		<!-- Description (lightning only) -->
		{#if network === 'lightning'}
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
		{/if}

		<button
			class="btn btn-primary w-full"
			onclick={createSwap}
			disabled={isCreatingSwap ||
				!$rskConnection.connected ||
				!!amountError ||
				!amount ||
				amountSats <= 0 ||
				isLoadingLimits ||
				!swapServiceAvailable}
		>
			{#if isCreatingSwap}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.swap.creating')}
			{:else}
				{$t(config.buttonTextKey)}
			{/if}
		</button>
	</div>

	<!-- Pending Swaps List -->
	{#if pendingSwaps.length > 0}
		<div class="space-y-4">
			<div class="divider">{$t('wallet.swap.pending_swaps')}</div>

			{#each pendingSwaps as swap (swap.id)}
				<PendingSwap
					{swap}
					swapType={config.swapType}
					expanded={expandedSwaps.has(swap.id)}
					onCopyInvoice={network === 'lightning'
						? async (invoice: string) => {
								const { copyToClipboard } = await import('$lib/utils/helpers/clipboard');
								await copyToClipboard(invoice);
								appStore.showSuccessToast($t('wallet.swap.invoice_copied'));
							}
						: undefined}
					onCopyAddress={network === 'liquid'
						? async (address: string) => {
								const { copyToClipboard } = await import('$lib/utils/helpers/clipboard');
								await copyToClipboard(address);
								appStore.showSuccessToast($t('wallet.swap.address_copied'));
							}
						: undefined}
					onDeleteSwap={deleteSwap}
				/>
			{/each}
		</div>
	{/if}
</div>
