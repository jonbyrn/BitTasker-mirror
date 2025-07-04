<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import DatePicker from '$lib/components/date/DatePicker.svelte';
	import TagsInput from '$lib/components/TagsInput.svelte';

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
		<label for="title" class="label">
			<span class="label-text">What do you need done?</span>
		</label>
		<input
			type="text"
			id="title"
			value={$store.task.title}
			onchange={(e) => store.updateTask({ title: (e.target as HTMLInputElement).value })}
			class="input input-bordered w-full rounded-lg {errors.title ? 'input-error' : ''}"
			placeholder="e.g. Help move my sofa"
		/>
		{#if errors.title}
			<span class="label-text-alt text-error">{errors.title}</span>
		{/if}
	</div>

	<div class="space-y-4">
		<h3 class="text-lg font-semibold">When do you need this done?</h3>

		<div class="flex gap-4">
			<button
				class="btn {$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
				onclick={() =>
					store.updateTask({
						deadline: new Date().toISOString(),
						dateRange: undefined
					})}
			>
				I'm flexible
			</button>
			<button
				class="btn {!$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
				onclick={() =>
					store.updateTask({
						deadline: undefined,
						dateRange: {
							start: new Date().toISOString(),
							end: new Date().toISOString()
						}
					})}
			>
				On a specific date
			</button>
		</div>

		{#if $store.task.dateRange}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<DatePicker
					label="Start Date"
					value={$store.task.dateRange.start}
					minDate={new Date().toISOString()}
					onChange={(value: string) => {
						const start = value;
						const end = $store.task.dateRange?.end ?? new Date().toISOString();
						store.updateTask({
							dateRange: {
								start,
								end
							}
						});
					}}
				/>
				<DatePicker
					label="End Date"
					value={$store.task.dateRange.end}
					minDate={new Date().toISOString()}
					onChange={(value: string) => {
						const end = value;
						const start = $store.task.dateRange?.start ?? new Date().toISOString();
						store.updateTask({
							dateRange: {
								start,
								end
							}
						});
					}}
				/>
				{#if errors.deadline}
					<span class="label-text-alt text-error -mt-2">{errors.deadline}</span>
				{/if}
			</div>
		{:else}
			<div>
				<DatePicker
					label="Deadline"
					minDate={new Date().toISOString()}
					value={$store.task.deadline}
					onChange={(value: string) => store.updateTask({ deadline: value })}
				/>
				{#if errors.deadline}
					<span class="label-text-alt text-error -mt-4">{errors.deadline}</span>
				{/if}
			</div>
		{/if}
	</div>

	<div class="w-full">
		<label for="category" class="label">Category (3 max)</label>
		<TagsInput
			options={TASK_CATEGORIES.map((cat) => cat.id)}
			bind:tags={$store.task.categories}
			autoComplete="on"
			maxTags={3}
			className="w-full h-full rounded-xl"
		/>

		{#if errors.category}
			<span class="label-text-alt text-error">{errors.category}</span>
		{/if}
	</div>

	<div class="form-control w-full">
		<label class="label" for="skills">
			<span class="label-text">Required Skills (10 max)</span>
			<span class="label-text-alt">{$store.task?.skills?.length}/10</span>
		</label>
		<TagsInput bind:tags={$store.task.skills} maxTags={10} className="w-full h-full rounded-xl" />
		{#if errors.skill}
			<span class="label-text-alt text-error">{errors.skill}</span>
		{/if}
	</div>
</div>
