<script lang="ts">
	import { clickOutside } from '$lib/utils/clickOutside';
	import { t } from 'svelte-i18n';

	let {
		id = '',
		label = '',
		placeholder = $t('task.tags_placeholder'),
		error = '',
		className = '',
		options = [],
		maxTags = 10,
		maxCharLength = 25, // Nuevo prop para límite de caracteres
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
		maxCharLength?: number; // Nuevo prop
		autoComplete?: 'on' | 'off';
	}>();

	let isOpen = $state(false);
	let inputValue = $state('');
	let isInputFocused = $state(false);
	let filteredOptions = $derived(filterOptions(inputValue));

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

	function addTag(value: string) {
		if (tags.length >= maxTags) return;
		if (tags.includes(value)) return;

		if (options.length && autoComplete === 'on') {
			// pick the first option that matches the input value
			let option = options.find((option: string) => option.toLowerCase() === value.toLowerCase());
			if (!option) option = filteredOptions[0];

			// Validar longitud para opciones
			if (option.length > maxCharLength) {
				return; // No agregar si excede el límite
			}

			tags = [...tags, option];
			inputValue = '';
			return;
		} else {
			const trimmedValue = value.trim();
			if (!trimmedValue) return;

			// Validar longitud para entrada manual
			if (trimmedValue.length > maxCharLength) {
				return; // No agregar si excede el límite
			}

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

<div class="dropdown dropdown-bottom w-full {isOpen ? 'dropdown-open' : ''}">
	<div use:clickOutside={{ callback: handleClickOutside }}>
		{#if label}
			<label for={id} class="label">
				<span class="label-text">{label}</span>
			</label>
		{/if}

		<div
			tabindex="0"
			role="combobox"
			aria-expanded={isOpen}
			aria-controls="tags-dropdown-{id}"
			class="input input-bordered flex min-h-[2.5rem] w-full flex-wrap gap-2 p-1 {error
				? 'input-error'
				: ''} {isInputFocused ? 'input-focused' : ''} {className}"
		>
			{#each tags as tag (tag)}
				<div class="badge badge-primary max-w-full py-3" role="listitem" aria-label="tag">
					<span
						class="mb-[4px] line-clamp-2 text-base leading-tight font-normal
						       break-words sm:line-clamp-1 sm:truncate sm:text-ellipsis
						       sm:whitespace-nowrap"
					>
						{tag}
					</span>
					<button
						type="button"
						class="btn btn-ghost btn-xs ml-1 flex-shrink-0 bg-none p-0 focus:bg-none"
						onclick={() => removeTag(tag)}
						aria-label={$t('task.tags.remove_tag')}
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
				</div>
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
				maxlength={maxCharLength}
			/>
		</div>

		{#if inputValue}
			<div class="text-base-content/60 mt-1 text-xs">
				{inputValue.length}/{maxCharLength}
				{$t('task.tags.characters')}
			</div>
		{/if}

		{#if filteredOptions.length > 0}
			<ul
				id="tags-dropdown-{id}"
				tabindex="-1"
				class="dropdown-content menu menu-vertical bg-base-300 tags-dropdown-scrollable z-[9999] mt-1 max-h-48 w-full overflow-x-hidden overflow-y-scroll rounded-2xl p-2 shadow"
				role="listbox"
				aria-label={$t('task.tags.options')}
			>
				{#each filteredOptions as option, index (option)}
					<li class="block w-full">
						<button
							type="button"
							tabindex="0"
							onclick={() => addTag(option)}
							onkeydown={(e) => e.key === 'Enter' && addTag(option)}
							role="option"
							aria-selected={filteredOptions[index] === inputValue}
							class="hover:bg-base-200 block min-h-[44px] w-full rounded p-3 text-left"
						>
							<span class="text-sm font-medium">{option}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if error}
			<span class="label-text-alt text-error">{error}</span>
		{/if}
	</div>
</div>

<style>
	:global(.tags-dropdown-scrollable) {
		scrollbar-width: thin;
		scrollbar-color: #6b7280 #374151;
		overflow-y: scroll !important;
		overflow-x: hidden !important;
		height: 12rem; /* 192px - same as max-h-48 */
		max-height: 12rem;
	}

	:global(.tags-dropdown-scrollable::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.tags-dropdown-scrollable::-webkit-scrollbar-track) {
		background: #374151;
		border-radius: 3px;
	}

	:global(.tags-dropdown-scrollable::-webkit-scrollbar-thumb) {
		background: #6b7280;
		border-radius: 3px;
	}

	:global(.tags-dropdown-scrollable::-webkit-scrollbar-thumb:hover) {
		background: #9ca3af;
	}
</style>
