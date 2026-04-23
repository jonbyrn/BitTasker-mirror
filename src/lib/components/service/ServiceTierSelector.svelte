<script lang="ts">
	import type { ServiceTier } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';

	let {
		tiers = [],
		selectedTierId = $bindable(null as string | null),
		onSelectionChange = (_tierId: string | null) => {}
	} = $props<{
		tiers: ServiceTier[];
		selectedTierId?: string | null;
		onSelectionChange?: (tierId: string | null) => void;
	}>();

	function selectTier(tier: ServiceTier) {
		const next = selectedTierId === tier.id ? null : tier.id;
		selectedTierId = next;
		onSelectionChange(next);
	}
</script>

{#if tiers.length > 0}
	<div class="space-y-3">
		<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.select_tier')}</h4>
		<div class="space-y-2">
			{#each tiers as tier (tier.id)}
				<button
					type="button"
					class="w-full rounded-lg border-2 p-3 text-left transition-colors {selectedTierId === tier.id
						? 'border-primary bg-primary/10'
						: 'border-base-300 bg-base-200 hover:border-base-content/20'}"
					onclick={() => selectTier(tier)}
				>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0 flex-1">
							<span class="font-medium">{tier.name}</span>
							{#if tier.isPopular}
								<span class="badge badge-primary badge-sm ml-1">{$t('dashboard.services.create.tiers.popular')}</span>
							{/if}
						</div>
						<span class="font-bold shrink-0">${formatNumberWithTwoDecimals(tier.price ?? 0)}</span>
					</div>
					{#if tier.description}
						<p class="text-base-content/70 mt-1.5 line-clamp-2 text-xs">{tier.description}</p>
					{/if}
					{#if tier.deliveryTime?.display}
						<p class="text-base-content/60 mt-1 text-xs">
							{$t('dashboard.services.create.tiers.delivery_time_label')}: {tier.deliveryTime.display}
						</p>
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}
