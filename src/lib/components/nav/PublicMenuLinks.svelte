<script lang="ts">
	import { t } from 'svelte-i18n';
	import { resolve } from '$app/paths';
	import {
		LOGGED_OUT_MENU_SECTIONS,
		visibleMenuSections
	} from '$lib/utils/constants/menu.constants';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const sections = $derived(visibleMenuSections(LOGGED_OUT_MENU_SECTIONS).slice(1));

	function sectionTestId(id: string): string {
		if (id === 'for-taskers') return 'sheet-need-help';
		if (id === 'for-taskees') return 'sheet-want-work';
		return `sheet-section-${id}`;
	}
</script>

<a class="sheet-row" href={resolve('/')} onclick={onnavigate} data-testid="sheet-home">
	<span>{$t('navbar.home')}</span>
</a>
<a class="sheet-row" href={resolve('/about')} onclick={onnavigate} data-testid="sheet-about">
	<span>{$t('navbar.about')}</span>
</a>
<a
	class="sheet-row"
	href={resolve('/how-it-works')}
	onclick={onnavigate}
	data-testid="sheet-how-it-works"
>
	<span>{$t('footer.how_it_works')}</span>
</a>

{#each sections as section (section.id)}
	<p class="sheet-heading" data-testid={sectionTestId(section.id)}>{$t(section.label)}</p>
	{#each section.items as item (item.label)}
		<a class="sheet-row" href={item.href || resolve('/')} onclick={onnavigate}>
			<item.icon class="sheet-icon text-primary" />
			<span>{$t(item.label)}</span>
		</a>
	{/each}
{/each}

<a class="sheet-row" href={resolve('/how-it-works')} onclick={onnavigate} data-testid="sheet-help">
	<span>{$t('navbar.help')}</span>
</a>
<a class="sheet-row" href={resolve('/auth/signup')} onclick={onnavigate} data-testid="sheet-signup">
	<span>{$t('navbar.signup')}</span>
</a>

<style>
	.sheet-heading {
		margin: 0.25rem 0 0;
		padding: 0.85rem 1.25rem 0.15rem;
		font-size: 0.95rem;
		font-weight: 700;
		color: color-mix(in srgb, var(--color-base-content), transparent 25%);
	}
</style>
