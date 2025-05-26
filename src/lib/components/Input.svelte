<script lang="ts">
	import type { InputProps } from '$lib/types/props';
	import { clickOutside } from '$lib/utils/clickOutside';

	let {
		id = '',
		label = '',
		value = '',
		placeholder = '',
		error = '',
		options = [],
		autoComplete = 'off',
		required = false,
		type = 'text',
		min = undefined,
		max = undefined,
		step = undefined,
		onChange
	}: InputProps = $props();

	let isOpen = $state(false);
	let selectedIndex = $state(-1);
	let filteredOptions = $state<{ label: string; value: string }[]>(options);

	function filterOptions(searchTerm: string): { label: string; value: string }[] {
		if (!options.length || autoComplete === 'off') return options;
		if (!searchTerm) return options;

		// show filtered options on top of the options
		const filteredOptions = options.filter((option) =>
			option.label.toLowerCase().includes(searchTerm.toLowerCase())
		);

		// show the options that are not in the filtered options
		const remainingOptions = options.filter((option) => !filteredOptions.includes(option));

		return [...filteredOptions, ...remainingOptions];
	}

	$effect(() => {
		filteredOptions = filterOptions(value);
	});

	function selectOption(option: { label: string; value: string }) {
		value = option.label;
		isOpen = false;
		onChange?.(option);
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;

		if (options.length && autoComplete === 'off') {
			// Handle as select - don't update on input
			return;
		}

		isOpen = autoComplete === 'on';
		selectedIndex = -1;
		onChange?.({ label: target.value, value: target.value });
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isOpen = false;
			return;
		}

		if (!isOpen || filteredOptions.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
		} else if (e.key === 'Enter' && selectedIndex >= 0) {
			e.preventDefault();
			const selectedOption = filteredOptions[selectedIndex];
			if (selectedOption) {
				selectOption(selectedOption);
			}
		}
	}

	function handleClick() {
		if (options.length) {
			isOpen = !isOpen;
			selectedIndex = -1;
		}
	}

	function handleClickOutside() {
		isOpen = false;
		selectedIndex = -1;
	}
</script>

<div class="relative w-full">
	<div use:clickOutside={{ callback: handleClickOutside }}>
		{#if label}
			<label for={id} class="label">
				<span class="label-text">{label}</span>
			</label>
		{/if}

		<div class="relative">
			<input
				{id}
				{placeholder}
				{type}
				{required}
				{min}
				{max}
				{step}
				{value}
				autocomplete={autoComplete === 'on' ? 'on' : 'off'}
				class="input input-bordered w-full {error ? 'input-error' : ''}"
				oninput={handleInput}
				onclick={handleClick}
				onkeydown={handleKeyDown}
				readonly={options.length > 0 && autoComplete === 'off'}
			/>

			{#if options.length > 0}
				<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
					<svg class="h-4 w-4 fill-current" viewBox="0 0 20 20">
						<path
							d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
						/>
					</svg>
				</div>
			{/if}
		</div>

		{#if isOpen && filteredOptions.length > 0}
			<ul
				class="bg-base-200 absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border shadow-lg"
				role="listbox"
				aria-label="options"
			>
				{#each filteredOptions as option (option.value)}
					<li
						class="hover:bg-base-300 flex cursor-pointer flex-col gap-1 px-4 py-2 {filteredOptions.indexOf(
							option
						) === selectedIndex
							? 'bg-base-300'
							: ''}"
						onclick={() => selectOption(option)}
						onkeydown={(e) => e.key === 'Enter' && selectOption(option)}
						role="option"
						aria-selected={filteredOptions.indexOf(option) === selectedIndex}
						tabindex="0"
					>
						<span class="font-medium">{option.label}</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if error}
			<span class="label-text-alt text-error">{error}</span>
		{/if}
	</div>
</div>
