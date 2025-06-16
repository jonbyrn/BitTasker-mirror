<script lang="ts">
	import type { Tag } from '$lib/types/props.d';
	import { clickOutside } from '$lib/utils/clickOutside';

	let {
		id = '',
		label = '',
		placeholder = 'Add tags...',
		error = '',
		className = '',
		tags = $bindable<Tag[]>([])
	} = $props<{
		id?: string;
		label?: string;
		placeholder?: string;
		error?: string;
		className?: string;
		tags?: Tag[];
	}>();

	let inputValue = $state('');
	let isInputFocused = $state(false);

	function addTag(value: string) {
		const trimmedValue = value.trim();
		if (!trimmedValue) return;

		// Check if tag already exists
		if (tags.some((tag: Tag) => tag.value === trimmedValue)) return;

		const newTag: Tag = {
			id: '',
			value: trimmedValue
		};

		tags = [...tags, newTag];
		inputValue = '';
	}

	function removeTag(tagId: string) {
		tags = tags.filter((tag: Tag) => tag.id !== tagId);
	}

	function handleKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLInputElement;

		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(target.value);
		} else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
			// Remove last tag when backspace is pressed on empty input
			removeTag(tags[tags.length - 1].id);
		}
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const pastedText = e.clipboardData?.getData('text');
		if (!pastedText) return;

		// Split pasted text by commas and add each as a tag
		const values = pastedText.split(',');
		values.forEach((value) => addTag(value));
	}

	function handleClickOutside() {
		isInputFocused = false;
		if (inputValue) {
			addTag(inputValue);
		}
	}
</script>

<div class="relative w-full">
	<div use:clickOutside={{ callback: handleClickOutside }}>
		{#if label}
			<label for={id} class="label">
				<span class="label-text">{label}</span>
			</label>
		{/if}

		<div
			class="input input-bordered flex min-h-[2.5rem] w-full flex-wrap gap-2 p-1 {error
				? 'input-error'
				: ''} {isInputFocused ? 'input-focused' : ''} {className}"
		>
			{#each tags as tag (tag.id)}
				<span class="badge badge-primary py-3" role="listitem" aria-label="tag">
                    <span class="text-base font-normal mb-[4px]">
                        {tag.value}
                    </span>
					<button
						type="button"
						class="btn btn-ghost btn-xs p-0 focus:bg-none bg-none"
						onclick={() => removeTag(tag.id)}
						aria-label="Remove tag"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</span>
			{/each}

			<input
				type="text"
				{id}
				{placeholder}
				bind:value={inputValue}
				class="flex-1 border-none bg-transparent p-1 outline-none"
				onkeydown={handleKeyDown}
				onpaste={handlePaste}
				onfocus={() => (isInputFocused = true)}
			/>
		</div>

		{#if error}
			<span class="label-text-alt text-error">{error}</span>
		{/if}
	</div>
</div>
