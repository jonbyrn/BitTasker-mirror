<script lang="ts">
	import { t } from 'svelte-i18n';

	// -----------------------------------------------------------------------
	// Types
	// -----------------------------------------------------------------------

	/**
	 * Token metadata passed to the display.
	 */
	interface FeeTokenInfo {
		/** Token ticker symbol (e.g. 'USDT', 'BNB') */
		symbol: string;
	}

	/**
	 * Gas fee estimate returned by a GasAbstractionProvider.
	 */
	interface GasEstimate {
		/** Human-readable fee string (e.g. '0.02') */
		formattedTokenCost: string;
		/** Optional USD equivalent */
		fiatCost?: number;
		/** 0-1 confidence score (1 = highest reliability) */
		confidence: number;
	}

	/**
	 * Status of the paymaster for gas abstraction.
	 */
	type PaymasterStatus = 'available' | 'degraded' | 'unavailable';

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------

	/**
	 * Props:
	 * - estimate: the current gas fee estimate (null while loading)
	 * - token: the gas token to use
	 * - paymasterStatus: current paymaster health indicator
	 * - isLoading: force skeleton state (e.g. during estimation)
	 */
	let {
		estimate = null,
		token = { symbol: 'USDT' },
		paymasterStatus = 'available' as PaymasterStatus,
		isLoading = false
	}: {
		estimate: GasEstimate | null;
		token: FeeTokenInfo;
		paymasterStatus?: PaymasterStatus;
		isLoading?: boolean;
	} = $props();

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------

	/** Confidence percentage (0-100) for display */
	const confidencePercent = $derived.by(() => {
		if (estimate === null) return 0;
		return Math.round(estimate.confidence * 100);
	});

	/** Config for the paymaster status dot */
	const statusDot = $derived.by(() => {
		switch (paymasterStatus) {
			case 'available':
				return {
					cssClass: 'bg-success',
					ariaLabel: $t('wallet.gas_fee_display.paymaster_status_green'),
					statusKey: $t('wallet.gas_fee_display.paymaster_available')
				};
			case 'degraded':
				return {
					cssClass: 'bg-warning',
					ariaLabel: $t('wallet.gas_fee_display.paymaster_status_grey'),
					statusKey: $t('wallet.gas_fee_display.paymaster_degraded')
				};
			case 'unavailable':
				return {
					cssClass: 'bg-error',
					ariaLabel: $t('wallet.gas_fee_display.paymaster_status_red'),
					statusKey: $t('wallet.gas_fee_display.paymaster_unavailable')
				};
			default:
				return {
					cssClass: 'bg-success',
					ariaLabel: $t('wallet.gas_fee_display.paymaster_status_green'),
					statusKey: $t('wallet.gas_fee_display.paymaster_available')
				};
		}
	});
</script>

<div class="space-y-2">
	<!-- Label -->
	<div class="text-sm font-medium opacity-70">
		{$t('wallet.gas_fee_display.gas_fee')}
	</div>

	<!-- Fee Card -->
	<div class="border-base-300 bg-base-200 rounded-box flex flex-col gap-2 border p-3">
		{#if isLoading || estimate === null}
			<!-- Skeleton loading state -->
			<div class="space-y-2">
				<div class="skeleton h-5 w-32 rounded"></div>
				<div class="skeleton h-4 w-24 rounded"></div>
				<div class="skeleton h-3 w-20 rounded"></div>
			</div>
			<span class="text-base-content/50 mt-1 text-xs">
				{$t('wallet.gas_fee_display.estimating')}
			</span>
		{:else}
			<!-- Fee amount -->
			<div class="flex items-center justify-between">
				<span class="text-sm">{$t('wallet.transaction_fee')}</span>
				<span class="text-sm font-semibold">
					{$t('wallet.gas_fee_display.fee_amount', {
						values: {
							amount: estimate.formattedTokenCost,
							token: token.symbol
						}
					})}
				</span>
			</div>

			<!-- Fiat equivalent (if available) -->
			{#if estimate.fiatCost !== undefined && estimate.fiatCost !== null}
				<div class="flex items-center justify-between">
					<span class="text-base-content/60 text-xs"></span>
					<span class="text-base-content/60 text-xs">
						≈ ${Number(estimate.fiatCost).toFixed(2)}
					</span>
				</div>
			{/if}

			<!-- Divider -->
			<div class="border-base-300 border-t"></div>

			<!-- Confidence row -->
			<div class="flex items-center justify-between">
				<span class="text-base-content/70 text-xs">
					{$t('wallet.gas_fee_display.confidence', { values: { percent: confidencePercent } })}
				</span>

				<!-- Confidence bar -->
				<div class="bg-base-300 h-1.5 w-20 overflow-hidden rounded-full">
					<div
						class="h-full rounded-full transition-all duration-500"
						class:bg-success={confidencePercent >= 80}
						class:bg-warning={confidencePercent >= 40 && confidencePercent < 80}
						class:bg-error={confidencePercent < 40}
						style="width: {confidencePercent}%"
					></div>
				</div>
			</div>

			<!-- Paymaster status row -->
			<div class="flex items-center justify-between">
				<span class="text-base-content/70 text-xs">
					{$t('wallet.gas_fee_display.paymaster_status', {
						values: { status: statusDot.statusKey }
					})}
				</span>
				<div
					class="{statusDot.cssClass} h-2 w-2 rounded-full"
					role="status"
					aria-label={statusDot.ariaLabel}
				></div>
			</div>
		{/if}
	</div>
</div>
