<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import SwapFallback from '$lib/components/wallet/SwapFallback.svelte';
	import type { SmartRoute } from '$lib/services/SmartRouter';

	let { errorMessage, smartRoute, onRetry, onReset } = $props<{
		errorMessage: string;
		smartRoute: SmartRoute | null;
		onRetry: (route: SmartRoute) => void;
		onReset: () => void;
	}>();
</script>

<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col gap-4 py-4">
	{#if smartRoute?.fallbackRoutes && smartRoute.fallbackRoutes.length > 0}
		<SwapFallback {smartRoute} onRetry={(route: SmartRoute) => onRetry(route)} />
	{:else}
		<div class="flex flex-col items-center gap-3 py-6">
			<div class="bg-error/10 rounded-full p-3">
				<svg
					class="text-error h-10 w-10 sm:h-12 sm:w-12"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<h4 class="text-lg font-bold sm:text-xl">
				{$t('wallet.swap.swap_failed')}
			</h4>
			<p class="text-base-content/60 text-center text-xs sm:text-sm">{errorMessage}</p>
			<button
				class="btn btn-primary min-h-[44px] touch-manipulation active:scale-95 sm:min-h-[48px]"
				onclick={onReset}
			>
				{$t('common.buttons.retry')}
			</button>
		</div>
	{/if}
</div>
