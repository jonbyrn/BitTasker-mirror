<script lang="ts">
	import type { AddOn } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';

	let {
		addOns = [],
		basePrice = 0,
		selectedAddOnIds = $bindable([] as string[]),
		onSelectionChange = (_ids: string[]) => {},
		disabled = false
	} = $props<{
		addOns: AddOn[];
		basePrice: number;
		selectedAddOnIds?: string[];
		onSelectionChange?: (selectedIds: string[]) => void;
		disabled?: boolean;
	}>();

	const totalAddOnsPrice = $derived(
		addOns
			.filter((a: AddOn) => selectedAddOnIds.includes(a.id))
			.reduce((sum: number, a: AddOn) => sum + (a.price ?? 0), 0)
	);
	const totalPrice = $derived(basePrice + totalAddOnsPrice);

	function toggleAddOn(id: string) {
		if (disabled) return;
		const next = selectedAddOnIds.includes(id)
			? selectedAddOnIds.filter((x: string) => x !== id)
			: [...selectedAddOnIds, id];
		selectedAddOnIds = next;
		onSelectionChange(next);
	}
</script>

{#if addOns.length > 0}
	<div class="space-y-3">
		<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.addons_title')}</h4>
		<div class="space-y-2">
			{#each addOns as addOn (addOn.id)}
				<label
					class="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 bg-base-200/50 p-3 transition-colors hover:bg-base-200 {disabled ? 'cursor-not-allowed opacity-60' : ''}"
				>
					<input
						type="checkbox"
						class="checkbox checkbox-primary checkbox-sm mt-0.5 shrink-0"
						checked={selectedAddOnIds.includes(addOn.id)}
						onchange={() => toggleAddOn(addOn.id)}
						disabled={disabled}
						aria-label={addOn.name}
					/>
					<div class="min-w-0 flex-1">
						<span class="font-medium">{addOn.name}</span>
						<span class="ml-2 font-semibold">+${formatNumberWithTwoDecimals(addOn.price ?? 0)}</span>
						{#if addOn.description}
							<p class="text-base-content/70 mt-0.5 text-xs">{addOn.description}</p>
						{/if}
					</div>
				</label>
			{/each}
		</div>
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
			<p class="mt-2 flex justify-between font-semibold">
				<span>{$t('dashboard.services.detail.total_price')}</span>
				<span>${formatNumberWithTwoDecimals(totalPrice)}</span>
			</p>
		</div>
	</div>
{/if}
