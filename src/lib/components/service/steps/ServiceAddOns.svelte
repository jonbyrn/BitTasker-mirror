<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import type { AddOn } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	// Initialize add-ons if not set (run once on mount)
	onMount(() => {
		if (!$store.service.pricing?.addOns) {
			store.updateService({
				pricing: {
					...$store.service.pricing!,
					addOns: []
				}
			});
		}
	});

	// Add new add-on
	function addAddOn() {
		const currentAddOns = $store.service.pricing?.addOns || [];
		const newAddOn: AddOn = {
			id: crypto.randomUUID(),
			name: '',
			description: '',
			price: 0
		};
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				addOns: [...currentAddOns, newAddOn]
			}
		});
	}

	// Remove add-on
	function removeAddOn(addOnId: string) {
		const currentAddOns = $store.service.pricing?.addOns || [];
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				addOns: currentAddOns.filter((a) => a.id !== addOnId)
			}
		});
	}

	// Update add-on
	function updateAddOn(addOnId: string, updates: Partial<AddOn>) {
		const currentAddOns = $store.service.pricing?.addOns || [];
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				addOns: currentAddOns.map((addOn) =>
					addOn.id === addOnId ? { ...addOn, ...updates } : addOn
				)
			}
		});
	}
</script>

<div
	class="min-w-0 space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<p class="text-base-content/70 text-sm">{$t('dashboard.services.create.addons.hint')}</p>
	</div>

	{#if ($store.service.pricing?.addOns || []).length === 0}
		<div class="alert alert-outline alert-info" id="addons-empty-message">
			<span>{$t('dashboard.services.create.addons.empty_message')}</span>
		</div>
	{/if}

	{#each $store.service.pricing?.addOns || [] as addOn (addOn.id)}
		<div class="card bg-base-200 min-w-0 space-y-4 p-4" transition:fly={{ y: 20, duration: 200 }}>
			<div class="flex min-w-0 items-center justify-between gap-3">
				<h4 class="min-w-0 font-semibold break-words">
					{$t('dashboard.services.create.addons.addon')} #{(
						$store.service.pricing?.addOns || []
					).indexOf(addOn) + 1}
				</h4>
				<button
					type="button"
					class="btn btn-circle btn-outline btn-error min-h-[44px] min-w-[44px] text-lg"
					onclick={() => removeAddOn(addOn.id)}
					title={$t('dashboard.services.create.addons.remove')}
				>
					✕
				</button>
			</div>

			<!-- Add-On Name -->
			<div class="w-full">
				<label for="addon-name-{addOn.id}" class="label">
					<span class="label-text break-words"
						>{$t('dashboard.services.create.addons.name_label')}</span
					>
				</label>
				<input
					type="text"
					id="addon-name-{addOn.id}"
					value={addOn.name}
					onchange={(e) => updateAddOn(addOn.id, { name: (e.target as HTMLInputElement).value })}
					class="input input-bordered w-full"
					placeholder={$t('dashboard.services.create.addons.name_placeholder')}
				/>
			</div>

			<!-- Add-On Description -->
			<div class="w-full">
				<label for="addon-description-{addOn.id}" class="label">
					<span class="label-text break-words whitespace-normal"
						>{$t('dashboard.services.create.addons.description_label')}</span
					>
				</label>
				<textarea
					id="addon-description-{addOn.id}"
					value={addOn.description || ''}
					onchange={(e) =>
						updateAddOn(addOn.id, { description: (e.target as HTMLTextAreaElement).value })}
					class="textarea textarea-bordered w-full"
					placeholder={$t('dashboard.services.create.addons.description_placeholder')}
					rows="2"
				></textarea>
			</div>

			<!-- Add-On Price -->
			<div class="w-full">
				<label for="addon-price-{addOn.id}" class="label">
					<span class="label-text break-words whitespace-normal"
						>{$t('dashboard.services.create.addons.price_label')}</span
					>
				</label>
				<div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
					<input
						type="number"
						id="addon-price-{addOn.id}"
						min="0"
						step="0.01"
						value={addOn.price}
						onchange={(e) =>
							updateAddOn(addOn.id, { price: Number((e.target as HTMLInputElement).value) })}
						class="input input-bordered flex-1"
					/>
					<span class="flex items-center px-4 text-sm font-semibold">
						{$store.service.pricing?.currency || 'USD'}
					</span>
				</div>
			</div>
		</div>
	{/each}

	<!-- Add Add-On Button -->
	<button type="button" class="btn btn-outline w-full" onclick={addAddOn}>
		+ {$t('dashboard.services.create.addons.add')}
	</button>

	{#if errors.addOns}
		<span class="label-text-alt text-error block">{errors.addOns}</span>
	{/if}
</div>
