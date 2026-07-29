<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import type { SmartRoute } from '$lib/services/SmartRouter';

	const PROVIDER_LABELS: Record<string, string> = {
		boltz: 'Boltz',
		lifi: 'LI.FI',
		paraswap: 'ParaSwap',
		direct: 'Direct'
	};

	let {
		primaryRoute = $bindable(''),
		fallbackRoute = $bindable(''),
		show = $bindable(false),
		onConfirm = () => {},
		onCancel = () => {},
		// Support for SwapForm usage (smartRoute + onRetry)
		smartRoute = undefined,
		onRetry = undefined
	}: {
		primaryRoute?: string;
		fallbackRoute?: string;
		show?: boolean;
		onConfirm?: () => void;
		onCancel?: () => void;
		smartRoute?: SmartRoute | null;
		onRetry?: (route: SmartRoute) => void;
	} = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onCancel();
	}

	let displayFallback = $derived(PROVIDER_LABELS[fallbackRoute] || fallbackRoute);
</script>

{#if show}
	<dialog class="modal modal-open" onkeydown={handleKeydown}>
		<div
			class="modal-box max-w-sm"
			onclick={(e: Event) => e.stopPropagation()}
			onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
			role="alertdialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="alert alert-warning mb-4">
				<IconAlertCircle class="h-5 w-5 shrink-0" />
				<div>
					<h3 class="font-bold">{$t('wallet.swap.fallback.route_unavailable')}</h3>
					<p class="text-sm">
						{$t('wallet.swap.fallback.route_unavailable_desc')}<br />
						<span class="font-medium">{displayFallback}</span>
					</p>
				</div>
			</div>
			<div class="flex justify-end gap-2">
				<button
					class="btn btn-ghost min-h-[44px] focus-visible:ring-2 focus-visible:ring-offset-2"
					onclick={onCancel}
					aria-label={$t('common.cancel')}
				>
					{$t('common.cancel')}
				</button>
				<button
					class="btn btn-primary min-h-[44px] focus-visible:ring-2 focus-visible:ring-offset-2"
					onclick={onConfirm}
					aria-label={$t('wallet.swap.fallback.use_this_route')}
				>
					{$t('wallet.swap.fallback.use_this_route')}
				</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button aria-label={$t('common.close')}>{$t('common.close')}</button>
		</form>
	</dialog>
{:else if smartRoute && onRetry}
	<!-- Support for SwapForm smartRoute + onRetry usage -->
	<div class="flex flex-col gap-2">
		<div class="alert alert-warning py-2 text-xs sm:text-sm">
			<IconAlertCircle class="h-5 w-5 shrink-0" />
			<span>{$t('wallet.swap.fallback.fallback_routes_available')}</span>
		</div>
		{#each smartRoute.fallbackRoutes || [] as route (route.provider)}
			<button
				class="btn btn-outline btn-sm min-h-[44px] touch-manipulation active:scale-95"
				onclick={() => onRetry(route)}
			>
				{$t('wallet.swap.fallback.use_fallback', {
					values: { provider: route.provider || 'fallback' }
				})}
			</button>
		{/each}
	</div>
{/if}
