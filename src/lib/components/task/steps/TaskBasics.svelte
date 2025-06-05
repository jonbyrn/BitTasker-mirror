<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { appStore } from '$lib/stores/app.store';
	import { taskStore as store } from '$lib/stores/task.store';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import Tags from '$lib/components/Tags.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';

	let { errors, direction } = $props();

	let skillsInput = $state('');

	function handleSkillKeypress(event: KeyboardEvent) {
		event?.preventDefault();
		if (event.key === 'Enter' && skillsInput.trim()) {
			store.updateTask({ skills: [...$store.task.skills, skillsInput] });
			skillsInput = '';
		}
	}

	function addSkill() {
		if (
			skillsInput &&
			skillsInput.trim() &&
			skillsInput.trim().length > 2 &&
			!$store.task?.skills?.some((skill) => skill === skillsInput.trim().toLowerCase()) &&
			$store.task?.skills?.length < 10
		) {
			store.updateTask({ skills: [...$store.task.skills, skillsInput.trim()] });
			skillsInput = '';
		}
	}
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
				<div>
					<DatePicker
						label="Start Date"
						value={$store.task.dateRange.start}
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
				</div>
				<div>
					<DatePicker
						label="End Date"
						value={$store.task.dateRange.end}
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
				</div>
				{#if errors.deadline}
					<span class="label-text-alt text-error col-span-2 -mt-4">{errors.deadline}</span>
				{/if}
			</div>
		{:else}
			<div>
				<DatePicker
					label="Deadline"
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
		<Tags
			options={TASK_CATEGORIES.map((cat) => ({
				name: cat.name,
				id: cat.id
			}))}
			selectedTags={$store.task.categoryIds}
			onChange={(ids) => {
				store.updateTask({ categoryIds: ids as string[] });
			}}
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
		<div class="join w-full">
			<input
				type="text"
				id="skills"
				bind:value={skillsInput}
				class="input input-bordered join-item flex-1 rounded-l-lg"
				placeholder="Add skills (e.g. Carpentry, Coding)"
				onkeydown={handleSkillKeypress}
				disabled={$store.task?.skills?.length >= 20}
			/>
			<button
				type="button"
				class="btn btn-neutral join-item rounded-r-lg"
				onclick={addSkill}
				disabled={!skillsInput || $store.task?.skills?.length >= 10}
			>
				Add
			</button>
		</div>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each $store.task?.skills as skill, index}
				<div class="badge badge-lg gap-1">
					<span class="mb-1">
						{skill}
					</span>
					<button
						aria-label="Remove skill"
						type="button"
						class="btn btn-ghost btn-xs p-0"
						onclick={() =>
							store.updateTask({ skills: $store.task?.skills?.filter((_, i) => i !== index) })}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3 w-3"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				</div>
			{/each}
		</div>
		{#if errors.skill}
			<span class="label-text-alt text-error">{errors.skill}</span>
		{/if}
	</div>
</div>
