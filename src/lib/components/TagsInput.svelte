<script lang="ts">
	import { clickOutside } from '$lib/utils/clickOutside';

	let {
		id = '',
		label = '',
		placeholder = 'Add tags...',
		error = '',
		className = '',
		options = [],
		maxTags = 10,
		autoComplete = 'off',
		tags = $bindable<string[]>([])
	} = $props<{
		id?: string;
		label?: string;
		placeholder?: string;
		error?: string;
		className?: string;
		tags?: string[];
		options?: string[];
		maxTags?: number;
		autoComplete?: 'on' | 'off';
	}>();

	let isOpen = $state(false);
	let inputValue = $state('');
	let isInputFocused = $state(false);
	let filteredOptions = $state<string[]>(options);

	function filterOptions(searchTerm: string): string[] {
		if (!options.length || autoComplete === 'off') return options;
		if (!searchTerm) return options;

		// show filtered options on top of the options
		const filteredOptions = options.filter((option: string) =>
			option.toLowerCase().includes(searchTerm.toLowerCase())
		);

		// show the options that are not in the filtered options
		const remainingOptions = options.filter((option: string) => !filteredOptions.includes(option));

		return [...filteredOptions, ...remainingOptions];
	}

	$effect(() => {
		filteredOptions = filterOptions(inputValue);
	});

	function addTag(value: string) {
		if (tags.length >= maxTags) return;
		if (tags.includes(value)) return;

		if (options.length && autoComplete === 'on') {
			// pick the first option that matches the input value
			let option = options.find((option: string) => option.toLowerCase() === value.toLowerCase());
			if (!option) option = filteredOptions[0];
			tags = [...tags, option];
			inputValue = '';
			return;
		} else {
			const trimmedValue = value.trim();
			if (!trimmedValue) return;

			// Check if tag already exists
			if (tags.some((tag: string) => tag === trimmedValue)) return;

			tags = [...tags, trimmedValue];
			inputValue = '';
		}
	}

	function removeTag(tag: string) {
		tags = tags.filter((t: string) => t !== tag);
	}

	function handleKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLInputElement;
		isOpen = autoComplete === 'on';

		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(target.value);
		} else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
			// Remove last tag when backspace is pressed on empty input
			removeTag(tags[tags.length - 1]);
		}
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const pastedText = e.clipboardData?.getData('text');
		if (!pastedText) return;

		isOpen = autoComplete === 'on';

		// Split pasted text by commas and add each as a tag
		const values = pastedText.split(',');
		values.forEach((value) => addTag(value));
	}

	function handleClickOutside() {
		isInputFocused = false;
		isOpen = false;
		if (inputValue) {
			addTag(inputValue);
		}
	}

	function handleClick() {
		if (options.length && autoComplete === 'on') {
			isOpen = !isOpen;
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
			{#each tags as tag}
				<span class="badge badge-primary py-3" role="listitem" aria-label="tag">
					<span class="mb-[4px] text-base font-normal">
						{tag}
					</span>
					<button
						type="button"
						class="btn btn-ghost btn-xs bg-none p-0 focus:bg-none"
						onclick={() => removeTag(tag)}
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
				placeholder={tags.length < maxTags ? placeholder : ''}
				bind:value={inputValue}
				class="flex-1 border-none bg-transparent p-1 outline-none"
				onkeydown={handleKeyDown}
				onclick={handleClick}
				onpaste={handlePaste}
				onfocus={() => (isInputFocused = true)}
			/>
		</div>

		{#if isOpen && filteredOptions.length > 0}
			<ul
				class="bg-base-200 absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border shadow-lg"
				role="listbox"
				aria-label="options"
			>
				{#each filteredOptions as option, index}
					<li
						class="hover:bg-base-300 flex cursor-pointer flex-col gap-1 px-4 py-2 {filteredOptions[
							index
						] === inputValue
							? 'bg-base-300'
							: ''}"
						onclick={() => addTag(option)}
						onkeydown={(e) => e.key === 'Enter' && addTag(option)}
						role="option"
						aria-selected={filteredOptions[index] === inputValue}
						tabindex="0"
					>
						<span class="font-medium">{option}</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if error}
			<span class="label-text-alt text-error">{error}</span>
		{/if}
	</div>
</div>
