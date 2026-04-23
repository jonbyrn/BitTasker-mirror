<script lang="ts">
	import type { AddOn } from '$lib/types/service.d';
	import type { ServiceTier } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';

	function formatDeliveryTime(dt?: ServiceTier['deliveryTime'] | null): string {
		if (!dt || dt.value == null || !dt.unit) return '—';
		const unitKey = `common.time_units.${dt.unit}${dt.value !== 1 ? 's' : ''}`;
		return `${dt.value} ${$t(unitKey)}`;
	}

	let {
		addOns = [],
		basePrice = 0,
		selectedAddOnIds = $bindable([] as string[]),
		onSelectionChange = (_ids: string[]) => {},
		disabled = false,
		rushDelivery = null,
		requestRushDelivery = $bindable(false)
	} = $props<{
		addOns: AddOn[];
		basePrice: number;
		selectedAddOnIds?: string[];
		onSelectionChange?: (selectedIds: string[]) => void;
		disabled?: boolean;
		rushDelivery?: ServiceTier['rushDelivery'] | null;
		requestRushDelivery?: boolean;
	}>();

	const totalAddOnsPrice = $derived(
		addOns
			.filter((a: AddOn) => selectedAddOnIds.includes(a.id))
			.reduce((sum: number, a: AddOn) => sum + (a.price ?? 0), 0)
	);

	function toggleAddOn(id: string) {
		if (disabled) return;
		const next = selectedAddOnIds.includes(id)
			? selectedAddOnIds.filter((x: string) => x !== id)
			: [...selectedAddOnIds, id];
		selectedAddOnIds = next;
		onSelectionChange(next);
	}
</script>

{#if addOns.length > 0 || rushDelivery}
	<div class="space-y-3">
		{#if rushDelivery}
			<label
				class="border-base-300 bg-base-200/50 hover:bg-base-200 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors {disabled
					? 'cursor-not-allowed opacity-60'
					: ''}"
			>
				<input
					type="checkbox"
					class="checkbox checkbox-primary checkbox-sm"
					bind:checked={requestRushDelivery}
					{disabled}
					aria-label={$t('dashboard.services.detail.rush_delivery_tag')}
				/>
				<div class="min-w-0 flex-1">
					<span class="text-sm font-medium"
						>{$t('dashboard.services.detail.rush_delivery_tag')}</span
					>
					<p class="text-base-content/70 text-xs">
						{$t('dashboard.services.detail.rush_delivery_prefix')}
						{formatDeliveryTime(rushDelivery.deliveryTime)}
					</p>
				</div>
				<span class="text-sm font-semibold"
					>+${formatNumberWithTwoDecimals(rushDelivery.price)}</span
				>
			</label>
		{/if}
		{#if addOns.length > 0}
			<div class="border-base-200 border-t pt-3">
				<span class="text-base-content/70 text-sm font-semibold"
					>{$t('dashboard.services.detail.addons_title')}</span
				>
			</div>
			<div class="mt-3 space-y-2">
				{#each addOns as addOn (addOn.id)}
					<label
						class="border-base-300 bg-base-200/50 hover:bg-base-200 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors {disabled
							? 'cursor-not-allowed opacity-60'
							: ''}"
					>
						<input
							type="checkbox"
							class="checkbox checkbox-primary checkbox-sm"
							checked={selectedAddOnIds.includes(addOn.id)}
							onchange={() => toggleAddOn(addOn.id)}
							{disabled}
							aria-label={addOn.name}
						/>
						<div class="min-w-0 flex-1">
							<span class="font-medium">{addOn.name}</span>
							{#if addOn.description}
								<p class="text-base-content/70 mt-0.5 text-xs">{addOn.description}</p>
							{/if}
						</div>
						<span class="shrink-0 text-sm font-semibold"
							>+${formatNumberWithTwoDecimals(addOn.price ?? 0)}</span
						>
					</label>
				{/each}
			</div>
		{/if}
		<div class="border-base-300 mt-4 border-t pt-3">
			{#if basePrice > 0}
				<p class="text-base-content/70 flex justify-between text-sm">
					<span>{$t('dashboard.services.detail.base_price')}</span>
					<span>${formatNumberWithTwoDecimals(basePrice)}</span>
				</p>
			{/if}
			{#if selectedAddOnIds.length > 0}
				<p class="text-base-content/70 flex justify-between text-sm">
					<span>{$t('dashboard.services.detail.addons_total')}</span>
					<span>+${formatNumberWithTwoDecimals(totalAddOnsPrice)}</span>
				</p>
			{/if}
			{#if requestRushDelivery && rushDelivery}
				<p class="text-base-content/70 flex justify-between text-sm">
					<span>{$t('dashboard.services.detail.rush_delivery')}</span>
					<span>+${formatNumberWithTwoDecimals(rushDelivery.price)}</span>
				</p>
			{/if}
		</div>
	</div>
{/if}
