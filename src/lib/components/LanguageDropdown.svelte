<script lang="ts">
	import type { Locales } from '$lib/stores/i18n.store';
	import { t, locale, setLocale, LANGUAGES, getCurrentLanguageFlag } from '$lib/stores/i18n.store';
	import IconCheck from '~icons/mdi/check';

	// Props
	let { 
		showTooltip = true, 
		showLanguageCode = true,
		showLocaleCode = false,
		showCheckmark = true,
		className = '',
		tooltip = '',
		onLanguageChange = null as ((code: Locales) => void) | null
	} = $props();

	// Flag image mapping
	const FLAG_IMAGES: Record<Locales, string> = {
		en: '/images/flags/us.webp',
		es: '/images/flags/sv.webp'
	};

	// Language switcher handler
	const handleLanguageChange = async (code: Locales) => {
		try {
			await setLocale(code);
			
			// Call custom handler if provided
			if (onLanguageChange) {
				onLanguageChange(code);
			}
			
			// Close dropdown after language change
			closeDropdown();
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	// Function to close dropdown
	function closeDropdown() {
		const dropdown = document.querySelector('details.dropdown[open]');
		if (dropdown) {
			dropdown.removeAttribute('open');
		}
	}

	// Handle dropdown summary clicks
	function handleDropdownClick(event: MouseEvent) {
		const summary = event.currentTarget as HTMLElement;
		const dropdown = summary.closest('details') as HTMLDetailsElement;

		// Close other dropdowns when this one is about to open
		if (dropdown && !dropdown.hasAttribute('open')) {
			closeOtherDropdowns(dropdown);
		}
	}

	// Function to close other dropdown menus except the current one
	function closeOtherDropdowns(currentDropdown: HTMLDetailsElement) {
		const dropdowns = document.querySelectorAll('details[open]');
		dropdowns.forEach((dropdown) => {
			if (dropdown !== currentDropdown) {
				dropdown.removeAttribute('open');
			}
		});
	}

	// Track dropdown state for arrow rotation
	let isDropdownOpen = $state(false);
	let dropdownElement: HTMLDetailsElement;

	// Function to update dropdown state
	function updateDropdownState() {
		if (dropdownElement) {
			isDropdownOpen = dropdownElement.hasAttribute('open');
		}
	}

	// Update state when dropdown element changes
	$effect(() => {
		if (dropdownElement) {
			updateDropdownState();
		}
	});

	// Handle dropdown click to update state immediately
	function handleDropdownClickWithState(event: MouseEvent) {
		handleDropdownClick(event);
		// Update state after a brief delay to allow the DOM to update
		setTimeout(updateDropdownState, 0);
	}

	// Mapping from locale code to language key
	const LOCALE_TO_LANGUAGE_KEY = { en: 'english', es: 'spanish' };

	let currentLanguageName = $derived($t('navbar.language.' + (LOCALE_TO_LANGUAGE_KEY[$locale] || $locale)));

</script>

<details class="dropdown dropdown-end language-dropdown {className}" bind:this={dropdownElement}>
	<summary 
		class="btn btn-ghost flex items-center gap-2" 
		onclick={handleDropdownClickWithState}
		class:tooltip={showTooltip}
		class:tooltip-bottom={showTooltip}
		data-tip={tooltip || `${$t('navbar.language')}: ${currentLanguageName}`}
	>
		<img 
			src={FLAG_IMAGES[$locale]} 
			alt={`${currentLanguageName} flag`}
			class="w-6 h-4.5 object-cover rounded-sm"
			width="24"
			height="18"
		/>
		{#if showLanguageCode}
			{#if showLocaleCode}
				<span class="font-medium uppercase">{$locale}</span>
			{/if}
		{/if}
		<svg 
			class="w-3 h-3 ml-1 transition-transform duration-200" 
			class:rotate-180={isDropdownOpen}
			fill="none" 
			stroke="currentColor" 
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M19 9l-7 7-7-7"></path>
		</svg>
	</summary>
	<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
		{#each LANGUAGES as { code, name }}
			<li>
				<button
					class="flex w-full items-center gap-2 text-left"
					onclick={() => handleLanguageChange(code)}
					class:bg-base-200={code === $locale}
				>
					<img 
						src={FLAG_IMAGES[code]} 
						alt={`${name} flag`}
						class="w-6 h-4.5 object-cover rounded-sm"
						width="24"
						height="18"
					/>
					<span>{name}</span>
					{#if showCheckmark && code === $locale}
						<IconCheck 
							class="text-primary ml-auto" 
							width="16"
						/>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</details>

<style>
	/* Ensure proper positioning */
	.language-dropdown {
		position: relative;
	}

	/* Dropdown content positioning */
	.language-dropdown .dropdown-content {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 1000;
	}
</style> 