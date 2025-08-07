<script lang="ts">
	import { _, locale } from 'svelte-i18n';
	import { switchLanguage, isI18nLoading, type SupportedLanguage } from '$lib/i18n/i18n';
	import { preloadPageTranslations } from '$lib/i18n/routeTranslations';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import IconCheck from '~icons/mdi/check';

	export const LANGUAGES = [
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' }
	];

	let {
		showTooltip = true,
		showLanguageCode = true,
		showLocaleCode = false,
		showCheckmark = true,
		className = '',
		tooltip = '',
		onLanguageChange = null as ((code: SupportedLanguage) => void) | null
	} = $props();

	const FLAG_IMAGES: Record<SupportedLanguage, string> = {
		en: '/images/flags/us.webp',
		es: '/images/flags/sv.webp'
	};

	const handleLanguageChange = async (code: SupportedLanguage) => {
		try {
			// Don't switch if already selected
			if (code === $locale) {
				closeDropdown();
				return;
			}

			// Preload translations for current page in the new language
			if (browser && page.url?.pathname) {
				preloadPageTranslations(page.url.pathname, code);
			}

			// Use optimized language switching
			await switchLanguage(code);

			// Call custom callback if provided
			if (onLanguageChange) onLanguageChange(code);

			closeDropdown();
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	function closeDropdown() {
		const dropdown = document.querySelector('details.dropdown[open]');
		if (dropdown) dropdown.removeAttribute('open');
	}

	function handleDropdownClick(event: MouseEvent) {
		const summary = event.currentTarget as HTMLElement;
		const dropdown = summary.closest('details') as HTMLDetailsElement;
		if (dropdown && !dropdown.hasAttribute('open')) closeOtherDropdowns(dropdown);
	}

	function closeOtherDropdowns(currentDropdown: HTMLDetailsElement) {
		document.querySelectorAll('details[open]').forEach((dropdown) => {
			if (dropdown !== currentDropdown) dropdown.removeAttribute('open');
		});
	}

	let isDropdownOpen = $state(false);
	let dropdownElement: HTMLDetailsElement;

	function updateDropdownState() {
		if (dropdownElement) isDropdownOpen = dropdownElement.hasAttribute('open');
	}

	$effect(() => {
		if (dropdownElement) updateDropdownState();
	});

	function handleDropdownClickWithState(event: MouseEvent) {
		handleDropdownClick(event);
		setTimeout(updateDropdownState, 0);
	}

	const LOCALE_TO_LANGUAGE_KEY = { en: 'english', es: 'spanish' };

	// Svelte 5 derived state for current language name
	const currentLanguageName = $derived(() => {
		const currentLocale = $locale as SupportedLanguage;
		const key = LOCALE_TO_LANGUAGE_KEY[currentLocale] || currentLocale;
		return $_('navbar.language.' + key) || '';
	});

	// Show loading state for language switching
	const isLanguageLoading = $derived($isI18nLoading);
</script>

<details class="dropdown dropdown-end language-dropdown {className}" bind:this={dropdownElement}>
	<summary
		class="btn btn-ghost flex items-center gap-2"
		class:loading={isLanguageLoading}
		class:btn-disabled={isLanguageLoading}
		onclick={handleDropdownClickWithState}
		class:tooltip={showTooltip}
		class:tooltip-bottom={showTooltip}
		data-tip={!isLanguageLoading ? ` ${currentLanguageName()}` : ''}
	>
		<img
			src={FLAG_IMAGES[$locale as SupportedLanguage]}
			alt={`${currentLanguageName()} flag`}
			class="h-4.5 w-6 rounded-sm object-cover"
			width="24"
			height="18"
		/>
		{#if showLanguageCode}
			{#if showLocaleCode}
				<span class="font-medium uppercase">{$locale}</span>
			{/if}
		{/if}
		<svg
			class="ml-1 h-3 w-3 transition-transform duration-200"
			class:rotate-180={isDropdownOpen}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M19 9l-7 7-7-7"
			></path>
		</svg>
	</summary>
	<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
		{#each LANGUAGES as { code, name }}
			<li>
				<button
					class="flex w-full items-center gap-2 text-left"
					class:loading={isLanguageLoading}
					disabled={isLanguageLoading}
					onclick={() => handleLanguageChange(code as SupportedLanguage)}
					class:bg-base-200={code === $locale}
				>
					<img
						src={FLAG_IMAGES[code as SupportedLanguage]}
						alt={`${name} flag`}
						class="h-4.5 w-6 rounded-sm object-cover"
						width="24"
						height="18"
					/>
					<span>{name}</span>
					{#if showCheckmark && code === $locale}
						<IconCheck class="text-primary ml-auto" width="16" />
					{/if}
					{#if isLanguageLoading && code !== $locale}
						<div class="loading loading-spinner loading-xs ml-auto"></div>
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
