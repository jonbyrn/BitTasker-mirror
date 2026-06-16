<script lang="ts">
	import { t } from 'svelte-i18n';

	/**
	 * SwapEstimateCard — Reusable quote/fee/estimate block for form/confirm/success.
	 * Always renders the same card container (no layout shift). Content transitions
	 * between three visual states:
	 *
	 *   1. **Empty** (no amount entered) — dashes
	 *   2. **Loading** (route resolving) — skeleton pulse placeholders (same dims)
	 *   3. **Ready** (data available) — real values
	 *
	 * For non-form variants (confirm-bridge, success-fee, compact) the card
	 * always shows real data — empty/loading only apply to variant="form".
	 */

	export type SwapEstimateVariant = 'form' | 'confirm-bridge' | 'success-fee' | 'compact';

	export interface SwapEstimateCardProps {
		totalSent?: string;
		feeDisplay?: string;
		youReceive?: string;
		providerLabel?: string;
		estimatedTime?: string;
		feePercent?: number;
		isDirectTransfer?: boolean;
		variant?: SwapEstimateVariant;
		loading?: boolean;
		/** When true, applies error border color to the card (e.g. amount below minimum). */
		belowMinimum?: boolean;
	}

	let {
		totalSent,
		feeDisplay,
		youReceive,
		providerLabel,
		estimatedTime,
		feePercent,
		isDirectTransfer = false,
		variant = 'form',
		loading = false,
		belowMinimum = false
	}: SwapEstimateCardProps = $props();

	/** True when the user hasn't entered an amount yet (form variant only). */
	const isEmpty = $derived(variant === 'form' && !loading && !youReceive && !totalSent);

	const sk = 'bg-base-300 animate-pulse rounded inline-block';
</script>

<div
	class="flex flex-col gap-2 rounded-xl border-2 p-3 transition-colors duration-300 sm:p-4 {belowMinimum
		? 'bg-error/5 border-error/40'
		: 'bg-primary/5 border-primary/20'}"
>
	{#if variant === 'form'}
		<!-- Total Sent row -->
		<div class="flex items-center justify-between text-sm">
			<span class="text-base-content/60">{$t('wallet.swap.total_sent') || 'Total Sent'}</span>
			{#if loading}
				<span class="{sk} h-4 w-24"></span>
			{:else if isEmpty}
				<span class="text-base-content/30 tabular-nums">—</span>
			{:else}
				<span class="font-semibold tabular-nums">{totalSent}</span>
			{/if}
		</div>

		<!-- Fee row -->
		<div class="border-base-200 border-t pt-2">
			<div class="text-base-content/60 flex items-center justify-between text-xs">
				<span
					>{isDirectTransfer && (!feePercent || feePercent === 0)
						? $t('wallet.swap.network_fee') || 'Network fee'
						: $t('wallet.swap.fee_percent') || 'Fee'}</span
				>
				{#if loading}
					<span class="{sk} h-3.5 w-20"></span>
				{:else if isEmpty}
					<span class="text-base-content/30 tabular-nums">—</span>
				{:else}
					<span class="tabular-nums">{feeDisplay || '—'}</span>
				{/if}
			</div>
		</div>

		<!-- You Receive row -->
		<div class="border-base-200 flex justify-between border-t pt-2">
			<div>
				<span class="text-sm font-medium">{$t('wallet.swap.you_receive') || 'You Receive'}</span>
				{#if !isEmpty && !loading && providerLabel}
					<div class="text-base-content/60 text-xs">
						{isDirectTransfer
							? $t('wallet.swap.direct_send')
							: `${$t('wallet.swap.route_via')} ${providerLabel}`}
						{#if feePercent && feePercent > 0}
							({feePercent}%)
						{/if}
					</div>
				{/if}
			</div>
			<div class="text-right">
				{#if loading}
					<div class="{sk} ml-auto h-5 w-20"></div>
				{:else if isEmpty}
					<div class="text-base-content/30 text-base font-bold tabular-nums sm:text-lg">—</div>
					<div class="text-base-content/30 text-xs">
						{$t('wallet.swap.estimated_time') || 'Est. time'}: —
					</div>
				{:else}
					<div class="text-base font-bold tabular-nums sm:text-lg">
						{youReceive}
					</div>
					<div class="text-base-content/50 text-xs">
						{$t('wallet.swap.estimated_time') || 'Est. time'}: {estimatedTime || '—'}
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Non-form variants: always show real data (no skeleton/empty states) -->
		{#if totalSent}
			<div class="flex items-center justify-between text-sm">
				<span class="text-base-content/60">{$t('wallet.swap.total_sent') || 'Total Sent'}</span>
				<span class="font-semibold tabular-nums">{totalSent}</span>
			</div>
		{/if}

		{#if feeDisplay && !isDirectTransfer}
			<div class="border-base-200 border-t pt-2">
				<div class="text-base-content/60 flex items-center justify-between text-xs">
					<span>{$t('wallet.swap.fee_percent') || 'Fee'}</span>
					<span class="tabular-nums">{feeDisplay}</span>
				</div>
			</div>
		{/if}

		{#if youReceive}
			<div class="border-base-200 flex justify-between border-t pt-2">
				<div>
					<span class="text-sm font-medium">{$t('wallet.swap.you_receive') || 'You Receive'}</span>
					{#if providerLabel}
						<div class="text-base-content/60 text-xs">
							{isDirectTransfer
								? $t('wallet.swap.direct_send')
								: `${$t('wallet.swap.route_via')} ${providerLabel}`}
							{#if feePercent && feePercent > 0}
								({feePercent}%)
							{/if}
						</div>
					{/if}
				</div>
				<div class="text-right">
					<div class="text-base font-bold tabular-nums sm:text-lg">
						{youReceive}
					</div>
					{#if estimatedTime}
						<div class="text-base-content/50 text-xs">
							{$t('wallet.swap.estimated_time') || 'Est. time'}: {estimatedTime}
						</div>
					{/if}
				</div>
			</div>
		{:else if providerLabel || estimatedTime || feePercent}
			<div class="border-base-200 flex items-center justify-between border-t pt-2 text-xs">
				<span class="text-base-content/60">
					{isDirectTransfer
						? $t('wallet.swap.direct_send')
						: providerLabel
							? `${$t('wallet.swap.route_via')} ${providerLabel}`
							: feePercent != null
								? `${feePercent}%`
								: $t('wallet.swap.best_route') || 'Route'}
					{#if providerLabel && feePercent && feePercent > 0}
						({feePercent}%)
					{/if}
				</span>
				<span class="text-base-content/60"
					>{$t('wallet.swap.estimated_time') || 'Est. time'}: {estimatedTime || '—'}</span
				>
			</div>
		{/if}
	{/if}
</div>
