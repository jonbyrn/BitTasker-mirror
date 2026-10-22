<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { t as i18nT } from 'svelte-i18n';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import { clickOutside } from '$lib/utils/clickOutside';
	import { darkMode, toggleDarkMode } from '$lib/stores/theme.store';
	import IconWeatherSunny from '~icons/mdi/white-balance-sunny';
	import IconWeatherNight from '~icons/mdi/weather-night';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import {
		LOGGED_OUT_MENU_SECTIONS,
		type MenuItem,
		type MenuSection
	} from '$lib/utils/constants/menu.constants';

	let { translations }: { translations?: Record<string, unknown> } = $props();

	let openSectionId = $state<string | null>(null);

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
		openSectionId = null;
	}

	function toggleSection(sectionId: string) {
		openSectionId = openSectionId === sectionId ? null : sectionId;
	}

	function popoverTransition(
		_node: Element,
		{ duration = 200, y = -8, start = 0.98 }: { duration?: number; y?: number; start?: number } = {}
	): TransitionConfig {
		return {
			duration,
			easing: cubicOut,
			css: (progress) => {
				const ty = (1 - progress) * y;
				const scale = start + (1 - start) * progress;
				return `transform: translate3d(0, ${ty}px, 0) scale(${scale}); opacity: ${progress};`;
			}
		};
	}
</script>

{#snippet menuItem(item: MenuItem)}
	<li>
		<a
			href={resolve((item.href ?? '/') as '/how-it-works')}
			onclick={() => closeMenu()}
			class="flex items-center gap-2 whitespace-nowrap"
		>
			<item.icon class="text-primary" />
			<span>{t(item.label)}</span>
		</a>
	</li>
{/snippet}

{#snippet menuSection(section: MenuSection)}
	{@const buttonId = `pub-menu-button-${section.id}`}
	<li class="relative">
		<button
			id={buttonId}
			type="button"
			class="btn btn-ghost flex items-center gap-2 whitespace-nowrap hover:shadow-none"
			onclick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				toggleSection(section.id);
			}}
			aria-expanded={openSectionId === section.id}
			aria-haspopup="true"
		>
			<section.icon class="text-primary" />
			<span>{t(section.label)}</span>
			<IconChevronDown
				class={`transition-all duration-150 ${openSectionId === section.id ? 'rotate-180' : ''}`}
			/>
		</button>
		{#if openSectionId === section.id}
			<div
				class="absolute top-full left-0"
				use:clickOutside={{ callback: closeMenu, exclude: `#${buttonId}` }}
			>
				<div
					class="menu dropdown-content bg-base-100 rounded-box z-100 mt-1 w-auto min-w-48 p-2 whitespace-nowrap shadow-lg"
					style="transform-origin: top left;"
					role="menu"
					tabindex="-1"
					onclick={(event) => event.stopPropagation()}
					onkeydown={(event) => {
						if (event.key === 'Escape') closeMenu();
					}}
					transition:popoverTransition={{ duration: 200, y: -8, start: 0.98 }}
				>
					<ul>
						{#each section.items as item (item.label)}
							{@render menuItem(item)}
						{/each}
					</ul>
				</div>
			</div>
		{/if}
	</li>
{/snippet}

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

	<div class="navbar-center mx-auto hidden lg:flex" data-testid="header-nav">
		<ul class="menu menu-horizontal px-1">
			<li>
				<a href={resolve('/how-it-works')} class="btn btn-ghost whitespace-nowrap">
					<IconHelpCircleOutline class="text-primary" />
					<span>{t('footer.how_it_works')}</span>
				</a>
			</li>
			{#each LOGGED_OUT_MENU_SECTIONS.slice(1) as section (section.id)}
				{@render menuSection(section)}
			{/each}
		</ul>
	</div>

	<div
		class="navbar-end mr-2 flex w-full min-w-0 flex-1 flex-nowrap items-center justify-end gap-1"
	>
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
		height: 65px;
		min-height: 65px;
		max-height: 65px;
		overflow: visible;
	}

	.public-topbar :global(.header-auth-btn),
	.public-topbar :global(.language-dropdown .btn),
	.public-topbar :global(.navbar-center .btn) {
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
		.public-topbar {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr) auto;
			align-items: center;
			overflow: visible;
		}

		.public-topbar :global(.navbar-center) {
			position: static;
			left: auto;
			flex: 1 1 auto;
			justify-content: center;
			min-width: 0;
			width: auto;
			overflow: visible;
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
	.public-topbar :global(.navbar-end) {
		flex-wrap: nowrap;
		width: auto;
		min-width: 0;
		overflow: visible;
	}

	@media (max-width: 1023px) {
		.public-topbar :global(.navbar-center) {
			display: none;
		}
	}

	@media (max-width: 639px) {
		.public-topbar :global(.header-auth-btn) {
			height: 32px;
			min-height: 32px;
			padding: 0 12px;
			font-size: 12px;
			white-space: nowrap;
		}
	}
</style>
