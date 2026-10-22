<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import { headerPrimaryLinks, navItemActive } from '$lib/utils/nav/site-nav';

	const path = $derived(page.url.pathname);
</script>

{#each headerPrimaryLinks as link (link.id)}
	<li>
		<a
			href={resolve(link.href)}
			class="btn btn-ghost header-primary-link whitespace-nowrap"
			class:btn-active={navItemActive(path, link.href)}
			data-testid={link.testId}
		>
			{$t(link.label)}
		</a>
	</li>
{/each}
