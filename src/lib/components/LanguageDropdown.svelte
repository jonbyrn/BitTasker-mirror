<script lang="ts">
	import { t, locale, isLoading } from 'svelte-i18n';
	import IconCheck from '~icons/mdi/check';
	import { browser } from '$app/environment';
	import { derived } from 'svelte/store';

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
		onLanguageChange = null as ((code: 'en' | 'es') => void) | null
	} = $props();

	const FLAG_IMAGES: Record<'en' | 'es', string> = {
		en: '/images/flags/us.webp',
		es: '/images/flags/sv.webp'
	};

	const handleLanguageChange = async (code: 'en' | 'es') => {
		try {
			await locale.set(code);
			if (browser) localStorage.setItem('locale', code);
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

	if (browser) {
		const storedLocale = localStorage.getItem('locale') as 'en' | 'es' | null;
		if (storedLocale) locale.set(storedLocale);
		else locale.set('en');
	}

	const currentLanguageName = derived([t, locale, isLoading], ([$t, $locale, $isLoading]) => {
		if ($isLoading) return '';
		return $t('navbar.language.' + (LOCALE_TO_LANGUAGE_KEY[$locale as 'en' | 'es'] || $locale));
	});
</script>

<details class="dropdown dropdown-end language-dropdown {className}" bind:this={dropdownElement}>
	<summary
		class="btn btn-ghost flex items-center gap-2"
		onclick={handleDropdownClickWithState}
		class:tooltip={showTooltip}
		class:tooltip-bottom={showTooltip}
		data-tip={` ${$currentLanguageName}`}
	>
		<img
			src={FLAG_IMAGES[$locale as 'en' | 'es']}
			alt={`${$currentLanguageName} flag`}
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
					onclick={() => handleLanguageChange(code as 'en' | 'es')}
					class:bg-base-200={code === $locale}
				>
					<img
						src={FLAG_IMAGES[code as 'en' | 'es']}
						alt={`${name} flag`}
						class="h-4.5 w-6 rounded-sm object-cover"
						width="24"
						height="18"
					/>
					<span>{name}</span>
					{#if showCheckmark && code === $locale}
						<IconCheck class="text-primary ml-auto" width="16" />
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
