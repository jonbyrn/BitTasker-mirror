<script lang="ts">
	import Multiselect from 'svelte-multiselect';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';

	let {
		selectedCategories = $bindable([]),
		maxSelections = 3,
		placeholder = 'Add tags...',
		className = ''
	} = $props();

	// Clear any "Cleaning & Maintenance" entries on component mount only
	let hasCleaned = false;
	$effect(() => {
		if (!hasCleaned && selectedCategories.includes('Cleaning & Maintenance')) {
			selectedCategories = selectedCategories.filter(cat => cat !== 'Cleaning & Maintenance');
			hasCleaned = true;
		}
	});

	// Convert categories to the format expected by svelte-multiselect and sort alphabetically
	const categoryOptions = TASK_CATEGORIES
		.map(category => ({
			value: category.name,
			label: category.name
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	// No need for handleChange since we're using bind:selected
</script>

<div class="category-multiselect {className}">
	<Multiselect
		options={categoryOptions}
		bind:selected={selectedCategories}
		placeholder={placeholder}
		maxSelect={maxSelections}
		outerDivClass="multiselect-wrapper flex flex-wrap items-center gap-2 p-3 min-h-10 text-sm bg-base-100 text-base-content transition-colors"
		ulSelectedClass="selected-categories flex flex-wrap gap-2 mb-2"
		liSelectedClass="selected-category-item bg-primary text-primary-content px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1"
		ulOptionsClass="category-options absolute top-full left-0 right-0 z-50 mt-1 bg-base-100 border-2 border-base-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
		liOptionClass="category-option p-3 cursor-pointer transition-colors border-b border-gray-700 last:border-b-0"
		liActiveOptionClass="category-option-active bg-primary text-white"
		maxSelectMsgClass="max-select-message text-xs text-neutral ml-auto"
	/>
</div>

<style>
	:global(.multiselect-wrapper) {
		--sms-bg: var(--color-base-100);
		--sms-text-color: var(--color-base-content);
		--sms-border: var(--color-base-200);
		--sms-border-radius: 0.5rem; /* rounded-lg */
		--sms-padding: 0.75rem;
		--sms-font-size: 0.875rem;
		--sms-active-color: var(--color-primary);
		--sms-focus-border: 1px solid var(--color-primary);
		--sms-selected-bg: var(--color-primary);
		--sms-selected-text-color: var(--color-primary-content);
		--sms-options-bg: var(--color-base-100);
		--sms-options-max-height: 12rem;
		--sms-options-border: 1px solid var(--color-base-200);
		--sms-options-border-radius: 0.5rem; /* rounded-lg */
		--sms-options-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
		--sms-li-active-bg: var(--color-primary);
		--sms-li-selected-bg: var(--color-primary);
		--sms-li-selected-color: var(--color-primary-content);
		--sms-placeholder-color: var(--color-neutral);
		--sms-placeholder-opacity: 0.7;
		--sms-remove-btn-hover-color: var(--color-primary-content);
		--sms-remove-btn-hover-bg: rgba(0, 0, 0, 0.2);
	}

	:global(.category-multiselect) {
		border: 2px solid oklab(0.999994 0.0000455678 0.0000200868 / 0.2);
		border-radius: 0.5rem !important;
		transition: border-color 0.2s ease;
	}

	/* Light mode border color */
	:global(:root[data-theme='light'] .category-multiselect) {
		border: 2px solid oklab(0.182191 0.0000082776 0.00000365078 / 0.2);
	}

	/* Active/focus state - primary color for both modes */
	:global(.category-multiselect:focus-within) {
		border: 2px solid var(--color-primary) !important;
	}
	
	:global(.multiselect-wrapper) {
		/* Custom properties for theme variables */
		--sms-bg: var(--color-base-100);
		--sms-text-color: var(--color-base-content);
		--sms-border: var(--color-base-200);
		--sms-border-radius: 0.5rem;
		--sms-padding: 0.75rem;
		--sms-font-size: 0.875rem;
		--sms-active-color: var(--color-primary);
		--sms-focus-border: 1px solid var(--color-primary);
		--sms-selected-bg: var(--color-primary);
		--sms-selected-text-color: var(--color-primary-content);
		--sms-options-bg: var(--color-base-100);
		--sms-options-max-height: 12rem;
		--sms-options-border: 1px solid var(--color-base-200);
		--sms-options-border-radius: 0.5rem;
		--sms-options-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
		--sms-li-active-bg: var(--color-primary);
		--sms-li-selected-bg: var(--color-primary);
		--sms-li-selected-color: var(--color-primary-content);
		--sms-placeholder-color: var(--color-neutral);
		--sms-placeholder-opacity: 0.7;
		--sms-remove-btn-hover-color: var(--color-primary-content);
		--sms-remove-btn-hover-bg: rgba(0, 0, 0, 0.2);
		padding: 8px !important;
	}

	:global(.multiselect-wrapper:focus-within) {
		border: var(--sms-focus-border);
		outline: none;
	}

	/* Button styling with CSS properties */
	:global(.multiselect-wrapper .selected-category-item button) {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		margin-left: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
		border-radius: 0.125rem;
		transition: background-color 0.2s ease;
		color: var(--sms-remove-btn-hover-color);
	}

	:global(.multiselect-wrapper .selected-category-item button:hover) {
		background: rgba(0, 0, 0, 0.2);
	}

	/* Input styling with CSS properties */
	:global(.multiselect-wrapper input) {
		background: transparent;
		border: none;
		outline: none;
		color: var(--sms-text-color);
		font-size: 0.875rem;
		width: 100%;
		padding: 0.25rem 0;
	}

	:global(.multiselect-wrapper input::placeholder) {
		color: var(--color-neutral);
		opacity: 0.7;
	}

	:global(.multiselect-wrapper .category-options) {
		/* Custom border colors that can't be replicated with Tailwind */
		border: 2px solid oklab(0.999994 0.0000455678 0.0000200868 / 0.2);
		transition: border-color 0.2s ease;
	}

	/* Light mode dropdown border color */
	:global(:root[data-theme='light'] .multiselect-wrapper .category-options) {
		border: 2px solid oklab(0.182191 0.0000082776 0.00000365078 / 0.2);
	}

	/* Option styling is now handled by Tailwind classes */

	/* Custom scrollbar for the options dropdown - matches site theme */
	:global(.multiselect-wrapper .category-options) {
		scrollbar-width: thin;
		scrollbar-color: var(--color-neutral) var(--color-base-200);
	}

	:global(.multiselect-wrapper .category-options::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.multiselect-wrapper .category-options::-webkit-scrollbar-track) {
		background: var(--color-base-200);
		border-radius: 3px;
	}

	:global(.multiselect-wrapper .category-options::-webkit-scrollbar-thumb) {
		background: var(--color-neutral);
		border-radius: 3px;
	}

	:global(.multiselect-wrapper .category-options::-webkit-scrollbar-thumb:hover) {
		background: var(--color-primary);
	}
</style>
