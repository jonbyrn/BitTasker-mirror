<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import RecurrencePattern from '$lib/components/task/RecurrencePattern.svelte';

	let { errors, direction } = $props();
</script>

<div
	class="space-y-4"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label for="name" class="label">
			<span class="label-text">Recurring Task Name</span>
		</label>
		<input
			type="text"
			id="name"
			value={$store.recurringTask.name}
			onchange={(e) => store.updateRecurringDetails({ name: (e.target as HTMLInputElement).value })}
			class="input input-bordered w-full {errors.name ? 'input-error' : ''}"
			placeholder="e.g. Weekly Sofa Pickup"
		/>
		{#if errors.name}
			<span class="label-text-alt text-error">{errors.name}</span>
		{/if}
	</div>

	<div class="w-full">
		<label for="description">
			<span class="label-text">Recurring Task Details</span>
		</label>
		<textarea
			id="description"
			value={$store.recurringTask.description}
			onchange={(e) =>
				store.updateRecurringDetails({
					description: (e.target as HTMLTextAreaElement).value
				})}
			class="textarea textarea-bordered h-32 w-full {errors.description ? 'textarea-error' : ''}"
			placeholder="Describe your recurring task in detail"
		></textarea>
		{#if errors.description}
			<span class="label-text-alt text-error">{errors.description}</span>
		{/if}
	</div>

	<div class="divider mt-6 mb-4">Recurring Task Schedule</div>

	<!-- Recurrence Pattern Selector -->
	<div class="mb-6">
		<h4 class="mb-2 text-lg font-medium">How often should this task repeat?</h4>
		<RecurrencePattern pattern={$store.recurringTask.recurrencePattern} />
	</div>
</div>
