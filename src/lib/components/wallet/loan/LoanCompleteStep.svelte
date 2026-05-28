<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		finalAmount,
		finalTxHash,
		onDone
	}: {
		finalAmount: string;
		finalTxHash: string;
		onDone: () => void;
	} = $props();
</script>

<div class="flex flex-col items-center gap-4 py-4">
	<!-- Success checkmark -->
	<div class="bg-success rounded-full p-4">
		<svg
			class="text-success-content h-12 w-12"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
		</svg>
	</div>

	<div class="space-y-1 text-center">
		<div class="text-lg font-bold">
			{$t('wallet.loan.you_receive', { values: { amount: finalAmount } })}
		</div>
		<div class="text-base-content/60 text-sm">
			{$t('wallet.loan.complete_balance_banner')}
		</div>
	</div>

	<!-- Arbiscan link -->
	<a
		href={`https://arbiscan.io/tx/${finalTxHash}`}
		target="_blank"
		rel="noopener noreferrer"
		class="btn btn-outline btn-sm gap-1"
	>
		{$t('wallet.loan.view_on_arbiscan')}
		<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
			/>
		</svg>
	</a>

	<!-- USDT0 on Arbitrum in balances -->
	<div class="bg-base-200 rounded-box flex items-center gap-2 p-3 text-sm">
		<svg
			class="text-success h-4 w-4 shrink-0"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
		<span class="text-base-content/70">{$t('wallet.loan.complete_balance_banner')}</span>
	</div>

	<button class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base" onclick={onDone}>
		{$t('wallet.loan.paused_dismiss')}
	</button>
</div>
