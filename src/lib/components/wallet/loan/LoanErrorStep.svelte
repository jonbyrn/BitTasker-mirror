<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		errorType,
		errorMessage,
		onRetryExecution,
		onSwapManually,
		onResetInput,
		onKeepAsUsdt0,
		onDismiss
	}: {
		errorType: 'mint' | 'swap' | 'bridge' | 'timeout' | 'generic';
		errorMessage: string;
		onRetryExecution: () => void;
		onSwapManually: () => void;
		onResetInput: () => void;
		onKeepAsUsdt0: () => void;
		onDismiss: () => void;
	} = $props();
</script>

<div class="flex flex-col items-center gap-4 py-2">
	<!-- Error icon -->
	<div class="bg-warning/10 rounded-full p-4">
		<svg class="text-warning h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
			/>
		</svg>
	</div>

	<div class="space-y-1 text-center">
		<div class="text-lg font-bold">
			{#if errorType === 'swap'}
				{$t('wallet.loan.error_swap_failed')}
			{:else if errorType === 'bridge' || errorType === 'timeout'}
				{$t('wallet.loan.error_bridge_timeout')}
			{:else if errorType === 'mint'}
				{$t('wallet.loan.error_mint_failed')}
			{:else}
				{$t('wallet.loan.error_mint_failed')}
			{/if}
		</div>
		<div class="text-base-content/60 text-sm">{errorMessage}</div>
	</div>

	<!-- Recovery actions -->
	<div class="w-full space-y-2">
		{#if errorType === 'swap'}
			<button
				class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base"
				onclick={onRetryExecution}
			>
				{$t('wallet.loan.paused_retry_swap')}
			</button>
			<button
				class="btn btn-outline min-h-[44px] w-full text-sm sm:text-base"
				onclick={onSwapManually}
			>
				{$t('wallet.loan.swap_manually')}
			</button>
			<button class="btn btn-ghost min-h-[44px] w-full text-sm sm:text-base" onclick={onResetInput}>
				{$t('wallet.loan.paused_redeem_rbtc')}
			</button>
		{:else if errorType === 'bridge' || errorType === 'timeout'}
			<button
				class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base"
				onclick={onRetryExecution}
			>
				{$t('wallet.loan.paused_retry_bridge')}
			</button>
			<button
				class="btn btn-outline min-h-[44px] w-full text-sm sm:text-base"
				onclick={onKeepAsUsdt0}
			>
				{$t('wallet.loan.keep_as_usdt0')}
			</button>
			<button class="btn btn-ghost min-h-[44px] w-full text-sm sm:text-base" onclick={onDismiss}>
				{$t('wallet.loan.paused_keep')}
			</button>
		{:else}
			<button
				class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base"
				onclick={onResetInput}
			>
				{$t('wallet.loan.paused_retry_swap')}
			</button>
		{/if}
	</div>

	<button class="btn btn-ghost min-h-[44px] w-full text-sm sm:text-base" onclick={onDismiss}>
		{$t('wallet.loan.paused_dismiss')}
	</button>
</div>
