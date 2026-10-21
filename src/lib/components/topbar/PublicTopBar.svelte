<script lang="ts">
	import { browser } from '$app/environment';
	import { t as i18nT } from 'svelte-i18n';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import DarkModeToggle from '$lib/components/DarkModeToggle.svelte';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import {
		LOGGED_OUT_MENU_SECTIONS,
		visibleMenuSections,
		type MenuItem,
		type MenuSection
	} from '$lib/utils/constants/menu.constants';
	import { clickOutside } from '$lib/utils/clickOutside';
	import BrowseLinks from '$lib/components/browse/BrowseLinks.svelte';

	let { translations }: { translations?: Record<string, unknown> } = $props();

	let openSectionId = $state<string | null>(null);
	const publicSections = $derived(visibleMenuSections(LOGGED_OUT_MENU_SECTIONS));

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

	function popoverTransition(
		_node: Element,
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

	function closeDropdowns() {
		openSectionId = null;
	}

	function toggleSection(sectionId: string) {
		openSectionId = openSectionId === sectionId ? null : sectionId;
	}

	function handleTopNavTap(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (!target) return;
		const interactive = target.closest('a,button,summary,[role="button"]');
		if (!interactive) return;
	}
</script>

{#snippet menuItem(item: MenuItem)}
	<li>
		<a
			href={item.href || '#'}
			onclick={() => closeDropdowns()}
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
			class="btn btn-ghost flex items-center gap-2 hover:shadow-none"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
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
				use:clickOutside={{
					callback: () => closeDropdowns(),
					exclude: `#${buttonId}`
				}}
			>
				<div
					class="menu dropdown-content bg-base-100 border-base-300 rounded-box z-100 mt-1 w-auto min-w-48 origin-top-left border p-2 whitespace-nowrap shadow-sm"
					role="menu"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => {
						if (e.key === 'Escape') closeDropdowns();
					}}
					transition:popoverTransition={{ duration: 200, y: -8, start: 0.98 }}
				>
					<ul>
						{#each section.items as item (item.label)}
							{@render menuItem?.(item)}
						{/each}
					</ul>
				</div>
			</div>
		{/if}
	</li>
{/snippet}

<div
	class="navbar bg-base-100/80 border-base-300 sticky top-0 z-50 w-full border-b backdrop-blur-sm"
	onclickcapture={handleTopNavTap}
>
	<div class="navbar-start ml-2 min-w-0 flex-1 sm:flex">
		<a href="/" class="block">
			<img
				src="/images/logos/bittasker-logomark.svg"
				alt={t('common.components.topbar.logo_alt')}
				class="mx-auto block aspect-square max-h-10"
				width="40"
				height="40"
			/>
		</a>
		{#if browser}
			<LanguageDropdown onLanguageChange={closeDropdowns} />
		{/if}
	</div>

	<div class="navbar-center mx-auto hidden lg:flex">
		<ul class="menu menu-horizontal px-1">
			<BrowseLinks
				tasks={t('navbar.browse_tasks')}
				services={t('navbar.browse_services')}
				staff={t('navbar.browse_staff')}
			/>
			<li>
				<a href="/how-it-works" class="btn btn-ghost">
					<IconHelpCircleOutline class="text-primary" />
					<span>{t('footer.how_it_works')}</span>
				</a>
			</li>
			{#each publicSections.slice(1) as section (section.id)}
				{@render menuSection?.(section)}
			{/each}
		</ul>
	</div>

	<div class="navbar-end mr-2 flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
		<div class="mr-1 min-w-0 items-center md:flex">
			<DarkModeToggle />
		</div>
		<a href="/auth/login" class="btn btn-sm sm:btn-md btn-secondary" data-testid="login-link">
			{t('navbar.login')}
		</a>
		<a href="/auth/signup" class="btn btn-sm sm:btn-md btn-primary">
			{t('navbar.signup')}
		</a>
	</div>
</div>

<style>
	:global(.navbar-center .menu.menu-horizontal > li.relative) {
		position: relative;
	}
	:global(.navbar-center .dropdown-content) {
		position: absolute;
		top: 100%;
		left: 0;
	}
</style>
