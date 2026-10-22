<script lang="ts">
	import { locale } from 'svelte-i18n';
	import { switchLanguage, isI18nLoading, type SupportedLanguage } from '$lib/i18n/i18n';
	import { preloadPageTranslations } from '$lib/i18n/routeTranslations';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import IconCheck from '~icons/mdi/check';
	import { clickOutside } from '$lib/utils/clickOutside';

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

	const LOCALE_TO_LANGUAGE_KEY: Record<string, string> = {
		en: 'English',
		es: 'Español'
	};

	// Svelte 5 derived state for current language name (uses $derived.by for reactive re-evaluation)
	const currentLanguageName = $derived.by(() => {
		const currentLocale = $locale as SupportedLanguage;
		return LOCALE_TO_LANGUAGE_KEY[currentLocale] || currentLocale || '';
	});

	// Show loading state for language switching
	const isLanguageLoading = $derived($isI18nLoading);
</script>

<div class="language-dropdown {className}" use:clickOutside={{ callback: () => closeDropdown() }}>
	<button
		type="button"
		class="btn btn-ghost flex items-center gap-2"
		class:loading={isLanguageLoading}
		class:btn-disabled={isLanguageLoading}
		onclick={toggleDropdown}
		class:tooltip={showTooltip}
		class:tooltip-bottom={showTooltip}
		data-tip={!isLanguageLoading ? ` ${currentLanguageName}` : ''}
	>
		{#if String($locale || '').startsWith('es')}
			<span class="text-xl leading-none" aria-hidden="true">🇸🇻</span>
		{:else}
			<span class="text-sm font-medium uppercase">{String($locale || 'en').slice(0, 2)}</span>
		{/if}
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
			role="menu"
			class="menu bg-base-100 rounded-box dropdown-menu z-1 w-52 p-2 shadow-sm"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
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
						{#if code === 'es'}
							<span class="text-xl leading-none" aria-hidden="true">🇸🇻</span>
						{/if}
						<span>{name}</span>
						{#if showCheckmark && code === $locale}
							<IconCheck class="text-primary ml-auto h-4 w-4" />
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
	.language-dropdown {
		position: relative;
		display: inline-block;
	}

	.language-dropdown .dropdown-menu {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 1000;
		transform-origin: top right;
		animation: dropdown-popover 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes dropdown-popover {
		from {
			opacity: 0;
			transform: translate3d(0, -8px, 0) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translate3d(0, 0, 0) scale(1);
		}
	}

	.language-dropdown button {
		-webkit-tap-highlight-color: transparent;
		background-color: transparent !important;
	}

	.language-dropdown button:hover,
	.language-dropdown button:focus,
	.language-dropdown button:active,
	.language-dropdown button:focus-visible {
		background-color: transparent !important;
		box-shadow: none !important;
		outline: none !important;
	}
</style>
