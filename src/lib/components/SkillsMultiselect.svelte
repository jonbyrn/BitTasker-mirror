<script lang="ts">
	import Multiselect from 'svelte-multiselect';
	import { locale } from 'svelte-i18n';
	import { SERVICE_SKILL_OPTIONS } from '$lib/utils/constants/skills';
	import { canonicalSkill, skillLabel } from '$lib/utils/constants/skill-labels';

	let {
		selectedSkills = $bindable([]),
		maxSelections = 10,
		placeholder = 'Add skills...',
		className = '',
		options = SERVICE_SKILL_OPTIONS,
		onChange = () => {},
		onBlur = () => {}
	} = $props();

	let currentInputValue = $state('');
	let forceRerender = $state(0);
	let displaySelected = $state<string[]>([]);

	const language = $derived(String($locale || 'en'));
	const displayOptions = $derived(
		(options as string[]).map((skill) => skillLabel(String(skill), language))
	);

	function sameList(left: string[], right: string[]): boolean {
		return left.length === right.length && left.every((item, index) => item === right[index]);
	}

	$effect(() => {
		const next = (selectedSkills as unknown[])
			.filter((skill): skill is string => typeof skill === 'string')
			.map((skill) => skillLabel(skill, language));
		if (!sameList(next, displaySelected)) displaySelected = next;
	});

	$effect(() => {
		const next = displaySelected.map((skill) => canonicalSkill(skill));
		const current = (selectedSkills as unknown[]).filter(
			(skill): skill is string => typeof skill === 'string'
		);
		if (!sameList(next, current)) selectedSkills = next;
	});

	// Handle skills change and call onChange callback
	$effect(() => {
		onChange(selectedSkills);
	});

	// Function to save current input as a skill
	function saveCurrentInput() {
		if (currentInputValue.trim()) {
			const newSkill = currentInputValue.trim();
			// Check if skill already exists
			const skillExists = selectedSkills.some(
				(skill) =>
					(typeof skill === 'string' && skill === newSkill) ||
					(skill && typeof skill === 'object' && skill.value === newSkill)
			);

			if (!skillExists && selectedSkills.length < maxSelections) {
				selectedSkills = [...selectedSkills, newSkill];
				currentInputValue = '';

				// Force component re-render to clear input field
				forceRerender++;
			}
		}
	}

	// Handle blur event
	function handleBlur() {
		saveCurrentInput();
		onBlur();
	}

	// Handle input change to track current value
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		currentInputValue = target.value;
	}

	// Expose saveCurrentInput function for external use (e.g., from next button)
	export function saveInputAsSkill() {
		saveCurrentInput();
	}
</script>

<div class="skills-multiselect {className}">
	{#key forceRerender}
		<Multiselect
			allowUserOptions="append"
			bind:selected={displaySelected}
			maxSelect={maxSelections}
			{placeholder}
			noMatchingOptionsMsg="No matching skills found"
			createOptionMsg="Add new skill"
			outerDivClass="skills-multiselect-wrapper flex flex-wrap items-center gap-2 p-2 min-h-8 text-sm bg-base-100 text-base-content transition-colors"
			ulSelectedClass="selected-options flex flex-wrap gap-2 p-0 m-0"
			liSelectedClass="selected-option bg-primary text-primary-content rounded-full px-3 py-1 flex items-center gap-1 text-sm"
			ulOptionsClass="skills-options bg-base-100 rounded-lg shadow-lg max-h-48 overflow-y-auto absolute top-full left-0 right-0 z-50 mt-1 transition-colors"
			liOptionClass="skills-option p-3 cursor-pointer transition-colors text-base-content"
			liActiveOptionClass="skills-option-active bg-primary text-primary-content"
			maxSelectMsgClass="skills-max-select-message text-xs text-neutral ml-auto"
			options={displayOptions}
			onblur={handleBlur}
			oninput={handleInput}
		/>
	{/key}
</div>

<style>
	:global(.skills-multiselect-wrapper) {
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

	:global(.skills-multiselect) {
		border: 2px solid oklab(0.999994 0.0000455678 0.0000200868 / 0.2);
		border-radius: 0.5rem !important;
		transition: border-color 0.2s ease;
	}

	/* Light mode border color */
	:global(:root[data-theme='light'] .skills-multiselect) {
		border: 2px solid oklab(0.182191 0.0000082776 0.00000365078 / 0.2);
	}

	/* Active/focus state - primary color for both modes */
	:global(.skills-multiselect:focus-within) {
		border: 2px solid var(--color-primary) !important;
	}

	/* Wrapper styling now handled by Tailwind classes */
	:global(.skills-multiselect-wrapper:focus-within) {
		border: var(--sms-focus-border);
		outline: none;
	}

	/* Input styling now handled by Tailwind classes */
	:global(.skills-multiselect-wrapper .multiselect-input) {
		background: transparent;
		border: none;
		outline: none;
		color: var(--sms-text-color);
		padding: 0;
		font-size: var(--sms-font-size);
	}

	:global(.skills-multiselect-wrapper .multiselect-input::placeholder) {
		color: var(--sms-placeholder-color);
		opacity: var(--sms-placeholder-opacity);
	}

	/* Selected options styling now handled by Tailwind classes */
	/* Selected option styling now handled by Tailwind classes */
	/* Remove button styling now handled by Tailwind classes */
	/* Max select message styling now handled by Tailwind classes */

	:global(.skills-multiselect-wrapper .skills-options) {
		display: block;
	}

	/* Option items styling now handled by Tailwind classes */
	/* Active option styling now handled by Tailwind classes */
	/* Selected option styling now handled by Tailwind classes */
</style>
