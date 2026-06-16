<script lang="ts">
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import type { IconComponent } from '$lib/utils/constants/menu.constants';
	import NavGridItem from './NavGridItem.svelte';

	export interface GridItem {
		id: string;
		icon: IconComponent;
		label: string;
		action: 'navigate' | 'group';
		href?: string;
		groupId?: string;
		variant?: 'danger';
	}

	export interface NavGroup {
		id: string;
		icon: IconComponent;
		label: string;
		items: { href: string; icon: IconComponent; label: string }[];
	}

	let {
		items,
		groups,
		onNavigate,
		onLogout
	}: {
		items: GridItem[];
		groups: NavGroup[];
		onNavigate: (href: string) => void;
		onLogout: () => void;
	} = $props();

	let activeGroupId = $state<string | null>(null);
	let flyX = $state(20);

	const activeGroup = $derived(
		activeGroupId ? (groups.find((g) => g.id === activeGroupId) ?? null) : null
	);

	const needsCentering = $derived(items.length > 0 && items.length % 3 !== 0);
	const fullRows = $derived(Math.floor(items.length / 3));
	const centeredStartIndex = $derived(fullRows * 3);

	function handleItemClick(item: GridItem) {
		if (item.action === 'group' && item.groupId) {
			flyX = 20;
			activeGroupId = item.groupId;
		} else if (item.action === 'navigate') {
			if (item.variant === 'danger') {
				onLogout();
			} else if (item.href) {
				onNavigate(item.href);
			}
		}
	}

	function navigateBack() {
		flyX = -20;
		activeGroupId = null;
	}

	export function reset() {
		activeGroupId = null;
	}
</script>

{#if activeGroup}
	<div in:fly={{ x: flyX, y: 0, duration: 200, easing: linear }}>
		<div class="nav-grid-header">
			<button
				class="nav-grid-back"
				onclick={navigateBack}
				type="button"
				aria-label={$t('common.back')}
			>
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="font-semibold">{$t(activeGroup.label)}</span>
			</button>
		</div>

		<div class="nav-grid">
			{#each activeGroup.items as link (link.href)}
				<NavGridItem
					Icon={link.icon}
					label={$t(link.label)}
					onclick={() => onNavigate(link.href)}
				/>
			{/each}
		</div>
	</div>
{:else}
	<div in:fly={{ x: flyX, y: 0, duration: 200, easing: linear }}>
		<div class="nav-grid" class:nav-grid-centered={needsCentering}>
			{#each items as item, i (item.id)}
				{#if needsCentering && i === centeredStartIndex}
					<div class="nav-grid-center-row">
						{#each items.slice(centeredStartIndex) as centeredItem (centeredItem.id)}
							<NavGridItem
								Icon={centeredItem.icon}
								label={$t(centeredItem.label)}
								variant={centeredItem.variant}
								onclick={() => handleItemClick(centeredItem)}
							/>
						{/each}
					</div>
				{:else if !needsCentering || i < centeredStartIndex}
					<NavGridItem
						Icon={item.icon}
						label={$t(item.label)}
						variant={item.variant}
						onclick={() => handleItemClick(item)}
					/>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style>
	.nav-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		padding: 0.25rem;
	}

	.nav-grid-centered {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.nav-grid-centered > :global(.nav-grid-item) {
		flex: 0 0 calc((100% - 1rem) / 3);
	}

	.nav-grid-center-row {
		display: flex;
		gap: 0.5rem;
		width: 100%;
		justify-content: center;
	}

	.nav-grid-center-row > :global(.nav-grid-item) {
		flex: 0 0 calc((100% - 2rem) / 3);
		max-width: calc((100% - 2rem) / 3);
	}

	.nav-grid-header {
		padding: 0 0.25rem 0.375rem;
	}

	.nav-grid-back {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.375rem;
		border-radius: 0.5rem;
		color: hsl(var(--p));
		font-size: 0.8125rem;
		transition: background 150ms ease;
		-webkit-tap-highlight-color: transparent;
	}

	.nav-grid-back:hover {
		background: hsl(var(--p) / 0.08);
	}

	@media (prefers-reduced-motion: reduce) {
		.nav-grid-back {
			transition: none;
		}
	}
</style>
