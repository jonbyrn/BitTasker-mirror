<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		estimatedRbtcNeeded,
		estimatedArbReceive,
		totalFees,
		totalFeesPercent,
		remainingSeconds,
		isSubmitting,
		onConfirm,
		onBack,
		onRefreshQuote
	}: {
		estimatedRbtcNeeded: string;
		estimatedArbReceive: string;
		totalFees: string;
		totalFeesPercent: string;
		remainingSeconds: number;
		isSubmitting: boolean;
		onConfirm: () => void;
		onBack: () => void;
		onRefreshQuote?: () => void;
	} = $props();
</script>

<div class="text-base-content/70 text-sm font-medium">
	{$t('wallet.loan.step_review')}
</div>

<!-- Summary card -->
<div class="card bg-base-200 rounded-box">
	<div class="card-body space-y-3 p-4">
		<!-- Step 1: Collateralize -->
		<div class="flex items-start gap-3">
			<div class="bg-primary/10 mt-0.5 rounded-full p-1.5">
				<span class="text-primary text-sm font-bold">1</span>
			</div>
			<div class="flex-1">
				<div class="text-sm font-medium">{$t('wallet.loan.review_step_collateralize')}</div>
				<div class="text-base-content/60 text-xs">
					{$t('wallet.loan.rbtc_needed', { values: { amount: estimatedRbtcNeeded } })}
				</div>
			</div>
		</div>

		<div class="border-base-300 border-t"></div>

		<!-- Step 2: Convert -->
		<div class="flex items-start gap-3">
			<div class="bg-info/10 mt-0.5 rounded-full p-1.5">
				<span class="text-info text-sm font-bold">2</span>
			</div>
			<div class="flex-1">
				<div class="text-sm font-medium">{$t('wallet.loan.review_step_convert')}</div>
				<div class="text-base-content/60 text-xs">
					~${(parseFloat(estimatedArbReceive) + 3).toFixed(0)}
				</div>
			</div>
		</div>

		<div class="border-base-300 border-t"></div>

		<!-- Step 3: Bridge -->
		<div class="flex items-start gap-3">
			<div class="bg-secondary/10 mt-0.5 rounded-full p-1.5">
				<span class="text-secondary text-sm font-bold">3</span>
			</div>
			<div class="flex-1">
				<div class="text-sm font-medium">{$t('wallet.loan.review_step_send')}</div>
				<div class="text-base-content/60 text-xs">
					{$t('wallet.loan.time_estimate', { values: { time: '2–5' } })}
				</div>
			</div>
		</div>

		<div class="border-base-300 border-t"></div>

		<!-- Total -->
		<div class="flex items-center justify-between">
			<span class="text-sm font-semibold"
				>{$t('wallet.loan.you_receive', { values: { amount: estimatedArbReceive } })}</span
			>
			<span class="badge badge-soft">{totalFees} ({totalFeesPercent}%)</span>
		</div>
	</div>
</div>

<!-- Info alert -->
<div class="alert alert-soft alert-info text-xs">
	<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
		/>
	</svg>
	<span>{$t('wallet.loan.info_paused')}</span>
</div>

<div class="flex items-center justify-center gap-2 text-center text-xs">
	<span class="text-base-content/50">
		{$t('wallet.loan.quote_expires', { values: { seconds: remainingSeconds } })}
	</span>
	{#if onRefreshQuote}
		<button class="btn btn-ghost btn-xs text-xs" onclick={onRefreshQuote}>
			{$t('wallet.loan.refresh_quote')}
		</button>
	{/if}
</div>

<!-- Buttons -->
<div class="flex flex-col gap-2">
	<button
		class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base"
		onclick={onConfirm}
		disabled={isSubmitting}
	>
		{$t('wallet.loan.confirm_button')}
	</button>
	<button class="btn btn-ghost min-h-[44px] w-full text-sm sm:text-base" onclick={onBack}>
		{$t('wallet.loan.back_button')}
	</button>
</div>
