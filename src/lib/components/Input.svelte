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
		onChange
	}: InputProps = $props();

	let isOpen = $state(false);
	let inputValue = $state(value);
	let selectedIndex = $state(-1);
	let filteredOptions = $state<{ label: string; value: string }[]>(options);

	function filterOptions(searchTerm: string): { label: string; value: string }[] {
		if (!searchTerm) return options;

		return options.filter((option) =>
			option.label.toLowerCase().includes(searchTerm.toLowerCase())
		);
	}

	$effect(() => {
		filteredOptions = filterOptions(inputValue);
	});

	function selectOption(option: { label: string; value: string }) {
		inputValue = option.label;
		isOpen = false;
		onChange?.(option);
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		inputValue = target.value;
		isOpen = true;
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
		isOpen = true;
		selectedIndex = -1;
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

		<input
			{id}
			{placeholder}
			value={inputValue}
			type="text"
			class="input input-bordered w-full {error ? 'input-error' : ''}"
			oninput={handleInput}
			onclick={handleClick}
			onkeydown={handleKeyDown}
		/>

		{#if isOpen && filteredOptions.length > 0}
			<ul
				class="bg-base-200 absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg shadow-lg"
				role="listbox"
				aria-label="Location suggestions"
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
