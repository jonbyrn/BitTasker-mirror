<script lang="ts">
	import Multiselect from 'svelte-multiselect';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import { t } from 'svelte-i18n';

	// Dev-only logging helper following project conventions
	const log = {
		info: (...args: unknown[]) => {
			if (import.meta.env.DEV) {
				console.info('[CategoryMultiselect]', ...args);
			}
		},
		error: (...args: unknown[]) => {
			if (import.meta.env.DEV) {
				console.error('[CategoryMultiselect]', ...args);
			}
		},
		warn: (...args: unknown[]) => {
			if (import.meta.env.DEV) {
				console.warn('[CategoryMultiselect]', ...args);
			}
		}
	};

	let {
		selectedCategories = [] as Array<{ value: string; label: string } | string>,
		maxSelections = 3,
		placeholder = 'Add tags...',
		className = '',
		controlId = undefined as string | undefined,
		onChange = () => {},
		externalCategoryIds = $bindable([])
	} = $props();

	// Local reactive state for Multiselect binding — avoids $bindable→bind:selected crash
	let msSelected = $state<Array<{ value: string; label: string } | string>>([]);

	// Clear any "1" entries on component mount only (Cleaning & Maintenance)
	let hasCleaned = false;
	$effect(() => {
		try {
			if (
				!hasCleaned &&
				msSelected.some(
					(cat) =>
						(typeof cat === 'string' && cat === '1') ||
						(cat && typeof cat === 'object' && cat.value === '1')
				)
			) {
				log.warn('Cleaning default category "1" from selection');
				msSelected = msSelected.filter((cat) => {
					if (typeof cat === 'string') {
						return cat !== '1';
					} else if (cat && typeof cat === 'object' && cat.value) {
						return cat.value !== '1';
					}
					return true;
				});
				hasCleaned = true;
			}
		} catch (error) {
			log.error('Error cleaning default categories:', error);
		}
	});

	// Use $derived to compute categoryOptions reactively based on actual dependencies
	// This prevents infinite loops by only recomputing when TASK_CATEGORIES or language changes
	let categoryOptions = $derived<{ value: string; label: string }[]>(
		TASK_CATEGORIES.map((category) => {
			const translatedName = $t(`categories.${category.slug}.name`);
			// Fallback to category.name if translation key is returned (translation not loaded)
			const displayName = translatedName.startsWith('categories.') ? category.name : translatedName;
			return {
				value: category.id,
				label: displayName
			};
		}).sort((a, b) => a.label.localeCompare(b.label))
	);

	// Sync selectedCategories prop → msSelected on mount and when prop changes
	let lastPropSync = $state<string>('');
	$effect(() => {
		try {
			const propStr = JSON.stringify(selectedCategories);
			if (propStr !== lastPropSync) {
				lastPropSync = propStr;
				if (JSON.stringify(selectedCategories) !== JSON.stringify(msSelected)) {
					log.info('Prop → msSelected sync:', selectedCategories);
					msSelected = [...selectedCategories];
				}
			}
		} catch (error) {
			log.error('Error syncing prop to msSelected:', error);
		}
	});

	// Sync externalCategoryIds → msSelected (convert IDs to full objects for display)
	let lastExternalIds = $state<string[]>([]);
	$effect(() => {
		try {
			if (categoryOptions.length === 0) return;

			if (JSON.stringify(externalCategoryIds) !== JSON.stringify(lastExternalIds)) {
				log.info('External IDs changed:', { external: externalCategoryIds, last: lastExternalIds });
				lastExternalIds = [...externalCategoryIds];

				const fullObjects = externalCategoryIds.map((id: string) => {
					const option = categoryOptions.find((opt) => opt.value === id);
					if (!option) {
						log.warn('Option not found for ID:', id);
					}
					return option || { value: id, label: id };
				});

				log.info('Setting msSelected from external:', fullObjects);
				msSelected = fullObjects;
			}
		} catch (error) {
			log.error('Error syncing external category IDs:', error);
		}
	});

	// Call onChange when msSelected changes — with guard to prevent infinite loops
	let lastOnChangeTrigger = $state<string>('');
	$effect(() => {
		try {
			const msStr = JSON.stringify(msSelected);
			if (msStr !== lastOnChangeTrigger) {
				lastOnChangeTrigger = msStr;

				// Extract only the values (IDs) from the selected items
				const categoryIds = msSelected.map((item) => {
					if (typeof item === 'string') {
						return item;
					} else if (item && typeof item === 'object' && item.value) {
						return item.value;
					}
					return String(item);
				});

				log.info('Calling onChange with IDs:', categoryIds);
				onChange(categoryIds);
			}
		} catch (error) {
			log.error('Error handling category change:', error);
		}
	});
</script>

<div class="category-multiselect {className}">
	{#if categoryOptions.length > 0}
		<Multiselect
			id={controlId}
			options={categoryOptions}
			bind:selected={msSelected}
			{placeholder}
			maxSelect={maxSelections}
			outerDivClass="multiselect-wrapper relative flex flex-wrap items-center gap-2 p-3 min-h-10 text-sm bg-base-100 text-base-content transition-colors z-50 isolate"
			ulSelectedClass="selected-categories flex flex-wrap gap-2 mb-2"
			liSelectedClass="selected-category-item bg-primary text-primary-content px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1"
			ulOptionsClass="category-options absolute top-full left-0 right-0 z-[10001] mt-1 bg-base-100 rounded-lg shadow-lg max-h-48 overflow-y-auto"
			liOptionClass="category-option my-2 cursor-pointer transition-colors"
			liActiveOptionClass="category-option-active bg-primary text-primary-content"
			maxSelectMsgClass="max-select-message text-xs text-neutral ml-auto"
		/>
	{:else}
		<div
			class="multiselect-wrapper bg-base-100 text-base-content flex min-h-10 flex-wrap items-center gap-2 text-sm transition-colors"
		>
			<span class="text-neutral opacity-70">{placeholder}</span>
		</div>
	{/if}
</div>

<style>
	:global(.multiselect-wrapper) {
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

	/* Option styling with custom padding */
	:global(.multiselect-wrapper .category-option) {
		padding: 8px !important;
	}

	/* Custom scrollbar for the options dropdown - matches site theme */
	:global(.multiselect-wrapper .category-options) {
		scrollbar-width: thin;
		scrollbar-color: var(--color-neutral) var(--color-base-200);
	}

	:global(.multiselect-wrapper .category-options::-webkit-scrollbar) {
		width: 8px;
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
