<script lang="ts">
	import type { TagsProps } from '$lib/types/props';
	import { clickOutside } from '$lib/utils/clickOutside';

	let {
		options = [],
		selectedTags = [],
		placeholder = 'Select tags...',
		error,
		onChange
	}: TagsProps = $props();

	let isOpen = $state(false);
	let listboxId = 'tags-listbox-' + Math.random().toString(36).substr(2, 9);

	const removeTag = (tag: number | string, e: Event) => {
		e.stopPropagation();
		selectedTags = selectedTags?.filter((t) => t !== tag) || [];
		onChange?.(selectedTags);
	};

	const addTag = (tag: number | string) => {
		if (!selectedTags?.includes(tag)) {
			selectedTags = [...(selectedTags || []), tag];
			onChange?.(selectedTags);
		}
	};

	const handleClickOutside = () => {
		isOpen = false;
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			isOpen = true;
		}
	};
</script>

<div class="relative w-full">
	<div
		class="hover:border-primary flex min-h-[40px] w-full cursor-pointer flex-wrap items-center gap-2 rounded-lg border p-2 text-left transition-colors {error
			? 'border-error'
			: 'border-white/20'}"
		onclick={() => (isOpen = true)}
		onkeydown={handleKeyDown}
		role="combobox"
		aria-expanded={isOpen}
		aria-controls={listboxId}
		aria-haspopup="listbox"
		tabindex="0"
	>
		{#if selectedTags?.length}
			{#each selectedTags as tag}
				<div
					class="badge badge-primary flex min-w-16 items-center justify-between rounded-full pr-1 pl-2"
				>
					<span class="w-full text-center">{options.find((opt) => opt.id === tag)?.name}</span>
					<span
						class="border-none bg-transparent text-black shadow-none"
						onclick={(e) => removeTag(tag, e)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && removeTag(tag, e)}
						aria-label="Remove {tag} tag"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M18 6 6 18"></path>
							<path d="m6 6 12 12"></path>
						</svg>
					</span>
				</div>
			{/each}
		{:else}
			<span class="text-base-content/50">{placeholder}</span>
		{/if}
	</div>

	{#if isOpen && options?.length}
		<div
			id={listboxId}
			class="bg-base-100 border-white-300 absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border shadow-lg"
			use:clickOutside={{ callback: handleClickOutside }}
			role="listbox"
			aria-label="Available tags"
		>
			{#each options as tag}
				<div
					class="hover:bg-base-200 text-base-content w-full cursor-pointer px-4 py-2 text-left transition-colors"
					class:text-primary={selectedTags.includes(tag.id)}
					onclick={() => addTag(tag.id)}
					onkeydown={(e) => e.key === 'Enter' && addTag(tag.id)}
					role="option"
					tabindex="0"
					aria-selected={selectedTags?.includes(tag.id)}
				>
					{tag.name}
				</div>
			{/each}
		</div>
	{/if}

	{#if error}
		<div class="text-error mt-1 text-sm" role="alert">{error}</div>
	{/if}
</div>
