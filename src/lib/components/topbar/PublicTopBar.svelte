<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { t as i18nT } from 'svelte-i18n';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import PublicMenuLinks from '$lib/components/nav/PublicMenuLinks.svelte';
	import { clickOutside } from '$lib/utils/clickOutside';
	import { darkMode, toggleDarkMode } from '$lib/stores/theme.store';
	import IconWeatherSunny from '~icons/mdi/white-balance-sunny';
	import IconWeatherNight from '~icons/mdi/weather-night';

	let { translations }: { translations?: Record<string, unknown> } = $props();

	let menuOpen = $state(false);

	function delve(obj: unknown, fullKey: string): string | undefined {
		if (!obj || typeof obj !== 'object') return undefined;
		const keys = fullKey.split('.');
		let result: unknown = obj;
		for (const key of keys) {
			if (result && typeof result === 'object') {
				result = (result as Record<string, unknown>)[key];
			} else {
				return undefined;
			}
		}
		return typeof result === 'string' ? result : undefined;
	}

	function t(key: string): string {
		if (browser) {
			const i18nValue = $i18nT(key);
			if (i18nValue && i18nValue !== key) return i18nValue;
		}
		if (translations) {
			const value = delve(translations, key);
			if (value) return value;
		}
		return $i18nT(key);
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<div
	class="navbar public-topbar bg-base-100/80 border-base-300 sticky top-0 z-50 w-full border-b backdrop-blur-sm"
>
	<div class="navbar-start ml-2 min-w-0 flex-1 sm:flex">
		<a href={resolve('/')} class="block shrink-0">
			<img
				src="/images/logos/bittasker-logomark.svg"
				alt={t('common.components.topbar.logo_alt')}
				class="mx-auto block aspect-square max-h-10"
				width="40"
				height="40"
			/>
		</a>
		{#if browser}
			<LanguageDropdown showTooltip={false} onLanguageChange={closeMenu} />
		{/if}
	</div>

	<div class="navbar-center relative hidden lg:flex">
		<button
			id="header-menu-button"
			type="button"
			class="btn btn-ghost whitespace-nowrap"
			aria-expanded={menuOpen}
			aria-haspopup="true"
			aria-controls="header-menu-panel"
			data-testid="header-menu"
			onclick={() => (menuOpen = !menuOpen)}
		>
			{t('navbar.menu')}
		</button>
		{#if menuOpen}
			<div
				id="header-menu-panel"
				class="bg-base-100 border-base-300 rounded-box absolute top-full left-0 z-50 mt-1 max-h-[70vh] w-80 overflow-auto border shadow-lg"
				data-testid="header-menu-panel"
				use:clickOutside={{ callback: closeMenu, exclude: '#header-menu-button' }}
			>
				<PublicMenuLinks onnavigate={closeMenu} />
			</div>
		{/if}
	</div>

	<div class="navbar-end mr-2 flex min-w-0 flex-nowrap items-center justify-end gap-1">
		<div class="header-theme items-center">
			<button
				type="button"
				class="btn btn-ghost btn-circle btn-sm header-theme-btn"
				aria-label={t($darkMode ? 'navbar.tooltip.light_mode' : 'navbar.tooltip.dark_mode')}
				onclick={() => toggleDarkMode()}
			>
				{#if $darkMode}
					<IconWeatherSunny class="h-5 w-5" />
				{:else}
					<IconWeatherNight class="h-5 w-5" />
				{/if}
			</button>
		</div>
		<a
			href={resolve('/auth/login')}
			class="btn btn-sm sm:btn-md btn-secondary shrink-0 whitespace-nowrap"
			data-testid="login-link"
		>
			{t('navbar.login')}
		</a>
		<a
			href={resolve('/auth/signup')}
			class="btn btn-sm sm:btn-md btn-primary shrink-0 whitespace-nowrap"
			data-testid="header-signup"
		>
			{t('navbar.signup')}
		</a>
	</div>
</div>

<style>
	.public-topbar {
		flex-wrap: nowrap;
		max-width: 100%;
		min-width: 0;
	}

	.public-topbar :global(.navbar-start),
	.public-topbar :global(.navbar-end) {
		flex-wrap: nowrap;
		min-width: 0;
	}

	.public-topbar :global(.language-dropdown .btn) {
		height: 2.25rem;
		min-height: 2.25rem;
		padding-inline: 0.35rem;
	}

	.header-theme-btn {
		width: 2.25rem;
		height: 2.25rem;
		min-height: 2.25rem;
	}

	@media (max-width: 1023px) {
		.public-topbar :global(.navbar-center) {
			display: none;
		}
	}
</style>
