<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		error,
		onRetry
	}: {
		error: string | null;
		onRetry?: () => void;
	} = $props();

	// Map error messages to specific error types and icons
	const errorConfig = $derived.by(() => {
		if (!error) return null;
		
		const errorLower = error.toLowerCase();
		
		if (errorLower.includes('insufficient balance') || errorLower.includes('insufficient funds')) {
			return {
				title: $t('wallet.gasless_error.insufficient_balance'),
				description: $t('wallet.gasless_error.insufficient_balance_desc'),
				icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
				colorClass: 'alert-error'
			};
		}
		
		if (errorLower.includes('network fee too high') || errorLower.includes('exceeds 5m gas')) {
			return {
				title: $t('wallet.gasless_error.network_fee_high'),
				description: $t('wallet.gasless_error.network_fee_high_desc'),
				icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
				colorClass: 'alert-warning'
			};
		}
		
		if (errorLower.includes('fee tier mismatch')) {
			return {
				title: $t('wallet.gasless_error.fee_tier_mismatch'),
				description: $t('wallet.gasless_error.fee_tier_mismatch_desc'),
				icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
				colorClass: 'alert-error'
			};
		}
		
		if (errorLower.includes('bundler unavailable') || errorLower.includes('alto') || errorLower.includes('relay temporarily unavailable')) {
			return {
				title: $t('wallet.gasless_error.bundler_unavailable'),
				description: $t('wallet.gasless_error.bundler_unavailable_desc'),
				icon: 'M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3',
				colorClass: 'alert-info'
			};
		}
		
		if (errorLower.includes('invalid address') || errorLower.includes('invalid recipient')) {
			return {
				title: $t('wallet.gasless_error.invalid_address'),
				description: $t('wallet.gasless_error.invalid_address_desc'),
				icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
				colorClass: 'alert-error'
			};
		}
		
		// Generic error
		return {
			title: $t('wallet.gasless_error.generic'),
			description: error,
			icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
			colorClass: 'alert-error'
		};
	});
</script>

{#if error && errorConfig}
	<div class="{errorConfig.colorClass} alert">
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
				d={errorConfig.icon}
			/>
		</svg>
		<div class="flex flex-col gap-1">
			<span class="text-sm font-semibold">{errorConfig.title}</span>
			<span class="text-xs opacity-90">{errorConfig.description}</span>
		</div>
		{#if onRetry}
			<button
				class="btn btn-sm btn-ghost"
				onclick={onRetry}
			>
				{$t('common.retry')}
			</button>
		{/if}
	</div>
{/if}
