<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label for="extendedDescription" class="label">
			<span class="label-text-alt">{$t('dashboard.services.create.details.extended_description_hint')}</span>
		</label>
		<textarea
			id="extendedDescription"
			value={$store.service.description || ''}
			onchange={(e) => store.updateService({ description: (e.target as HTMLTextAreaElement).value })}
			class="textarea textarea-bordered w-full rounded-lg {errors.description ? 'textarea-error' : ''}"
			placeholder={$t('dashboard.services.create.details.extended_description_placeholder')}
			rows="8"
			maxlength="10000"
		></textarea>
		<div class="label">
			<span class="label-text-alt">
				{($store.service.description || '').length}/10000
			</span>
		</div>
		{#if errors.description}
			<span class="label-text-alt text-error">{errors.description}</span>
		{/if}
	</div>
</div>

