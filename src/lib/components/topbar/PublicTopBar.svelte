<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { t as i18nT } from 'svelte-i18n';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import { darkMode, toggleDarkMode } from '$lib/stores/theme.store';
	import IconWeatherSunny from '~icons/mdi/white-balance-sunny';
	import IconWeatherNight from '~icons/mdi/weather-night';
	import BrowseLinks from '$lib/components/browse/BrowseLinks.svelte';

	let { translations }: { translations?: Record<string, unknown> } = $props();

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
</script>

<div
	class="navbar public-topbar bg-base-100/80 border-base-300 sticky top-0 z-50 w-full border-b backdrop-blur-sm"
>
	<div class="navbar-start ml-2 min-w-0 flex-nowrap items-center sm:flex">
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
			<LanguageDropdown showTooltip={false} />
		{/if}
	</div>

	<div class="navbar-center header-primary mx-auto hidden min-w-0 lg:flex" data-testid="header-nav">
		<ul class="menu menu-horizontal flex-nowrap px-1">
			<BrowseLinks />
		</ul>
	</div>

	<div class="navbar-end mr-2 flex w-auto min-w-0 flex-nowrap items-center justify-end gap-1">
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
			class="btn btn-sm sm:btn-md btn-secondary header-auth-btn shrink-0 whitespace-nowrap"
			data-testid="login-link"
		>
			{t('navbar.login')}
		</a>
		<a
			href={resolve('/auth/signup')}
			class="btn btn-sm sm:btn-md btn-primary header-auth-btn shrink-0 whitespace-nowrap"
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
		height: 64px;
		min-height: 64px;
	}

	.public-topbar :global(.header-auth-btn) {
		box-sizing: border-box;
		height: 44px;
		min-height: 44px;
		padding: 0 16px;
	}

	.public-topbar :global(.language-dropdown .btn),
	.public-topbar :global(.navbar-center .btn),
	.public-topbar :global(.header-primary-link) {
		box-sizing: border-box;
		height: 40px;
		min-height: 40px;
		padding: 0 16px;
	}

	.public-topbar :global(.language-dropdown .btn) {
		width: auto;
		min-width: 2.75rem;
	}

	/* DaisyUI absolutely centers navbar-center, which covers the logo and language control at 1280. */
	@media (min-width: 1024px) {
		.public-topbar :global(.navbar-center) {
			position: static;
			top: auto;
			left: auto;
			flex: 1 1 auto;
			width: auto;
			min-width: 0;
			justify-content: center;
			transform: none;
		}

		.public-topbar :global(.navbar-start),
		.public-topbar :global(.navbar-end) {
			position: relative;
			z-index: 2;
			flex: 0 0 auto;
			width: auto;
		}
	}

	.public-topbar :global(.navbar-start),
	.public-topbar :global(.navbar-end),
	.public-topbar :global(.navbar-center .menu) {
		flex-wrap: nowrap;
		min-width: 0;
	}

	@media (max-width: 1023px) {
		.public-topbar :global(.navbar-center) {
			display: none;
		}
	}
</style>
