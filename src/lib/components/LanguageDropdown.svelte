<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { switchLanguage, isI18nLoading, type SupportedLanguage } from '$lib/i18n/i18n';
	import { preloadPageTranslations } from '$lib/i18n/routeTranslations';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import IconCheck from '~icons/mdi/check';
	import { clickOutside } from '$lib/utils/clickOutside';

	function popoverTransition(
		node: Element,
		{ duration = 200, y = -8, start = 0.98 }: { duration?: number; y?: number; start?: number } = {}
	): TransitionConfig {
		return {
			duration,
			easing: cubicOut,
			css: (t) => {
				const ty = (1 - t) * y;
				const s = start + (1 - start) * t;
				return `transform: translate3d(0, ${ty}px, 0) scale(${s}); opacity: ${t};`;
			}
		};
	}

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
		onLanguageChange = null as ((code: SupportedLanguage) => void) | null
	} = $props();

	const FLAG_IMAGES: Record<SupportedLanguage, string> = {
		en: '/images/flags/us.webp',
		es: '/images/flags/sv.webp'
	};

	let isDropdownOpen = $state(false);

	function toggleDropdown() {
		isDropdownOpen = !isDropdownOpen;
	}

	function closeDropdown() {
		isDropdownOpen = false;
	}

	const handleLanguageChange = async (code: SupportedLanguage) => {
		try {
			closeDropdown();

			// Don't switch if already selected
			if (code === $locale) return;

			// Preload translations for current page in the new language
			if (browser && page.url?.pathname) {
				preloadPageTranslations(page.url.pathname, code);
			}

			// Use optimized language switching
			await switchLanguage(code);

			// Call custom callback if provided
			if (onLanguageChange) onLanguageChange(code);
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	const LOCALE_TO_LANGUAGE_KEY = { en: 'english', es: 'spanish' };

	// Svelte 5 derived state for current language name
	const currentLanguageName = $derived(() => {
		const currentLocale = $locale as SupportedLanguage;
		const key = LOCALE_TO_LANGUAGE_KEY[currentLocale] || currentLocale;
		return $t('navbar.language.' + key) || '';
	});

	// Show loading state for language switching
	const isLanguageLoading = $derived($isI18nLoading);
</script>

<div
	class="dropdown dropdown-end language-dropdown {className}"
	use:clickOutside={{ callback: () => closeDropdown() }}
>
	<button
		type="button"
		class="btn btn-ghost flex items-center gap-2"
		class:loading={isLanguageLoading}
		class:btn-disabled={isLanguageLoading}
		onclick={toggleDropdown}
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
	</button>
	{#if isDropdownOpen}
		<ul
			class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
			transition:popoverTransition={{ duration: 200, y: -8, start: 0.98 }}
			onclick={(e) => e.stopPropagation()}
		>
			{#each LANGUAGES as { code, name } (code)}
				<li>
					<button
						class="flex w-full items-center gap-2 text-left"
						disabled={isLanguageLoading}
						onclick={(e) => {
							e.stopPropagation();
							handleLanguageChange(code as SupportedLanguage);
						}}
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
	{/if}
</div>

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

	/* Prevent focus flash on mobile */
	.language-dropdown button {
		-webkit-tap-highlight-color: transparent;
	}

	.language-dropdown button:focus {
		outline: none;
	}

	/* Only show focus ring for keyboard navigation */
	.language-dropdown button:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}
</style>
