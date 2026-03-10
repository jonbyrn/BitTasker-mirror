<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';

	// Icon imports
	import IconMagnify from '~icons/mdi/magnify';
	import IconFilter from '~icons/mdi/filter';
	import IconBookmarkOutline from '~icons/mdi/bookmark-outline';
	import IconMap from '~icons/mdi/map';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';

	let {
		searchQuery = $bindable(),
		searchInputClass,
		searchPlaceholder,
		onSearchInput,
		onFilterClick,
		onSaveSearch,
		canSaveSearch,
		viewMode,
		onToggleViewMode,
		user,
		drawersLoaded,
		loadDrawerComponents
	} = $props<{
		searchQuery: string;
		searchInputClass: string;
		searchPlaceholder: string;
		onSearchInput: (e: Event) => void;
		onFilterClick: () => void;
		onSaveSearch: () => Promise<void>;
		canSaveSearch: boolean;
		viewMode: 'list' | 'map';
		onToggleViewMode: () => void;
		user: { npub?: string } | null;
		drawersLoaded: boolean;
		loadDrawerComponents: () => Promise<void>;
	}>();
	void isFilterDrawerOpen;
</script>

<section class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-2" data-testid="tasks-controls">
	<!-- Search Input -->
	<div class="relative min-w-0 flex-1">
		<input
			data-testid="tasks-search-input"
			type="text"
			class={searchInputClass}
			placeholder={searchPlaceholder}
			bind:value={searchQuery}
			oninput={onSearchInput}
			aria-label={$t('find_tasks.search_placeholder') || 'Search tasks'}
		/>
		<div
			class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
			data-testid="tasks-search-icon"
		>
			<IconMagnify class="h-5 w-5 text-gray-400" />
		</div>
	</div>

	<!-- Buttons: separate row on mobile, same row on tablet+ -->
	<nav
		class="flex shrink-0 items-center justify-center gap-2 md:justify-end"
		aria-label="Task actions"
		data-testid="tasks-actions-nav"
	>
		<!-- Advanced Filters Button -->
		<button
			data-testid="tasks-filters-button"
			class="btn btn-sm btn-primary"
			aria-label={$t('find_tasks.filters')}
			onclick={onFilterClick}
		>
			<IconFilter class="mr-1 h-4 w-4" />
			<span>{$t('find_tasks.filters')}</span>
		</button>

		<!-- Save Search Button -->
		<button
			data-testid="tasks-save-search-button"
			class="btn btn-sm btn-secondary gap-2"
			aria-label={$t('find_tasks.save')}
			onclick={async () => {
				if (user?.npub) {
					if (!drawersLoaded) {
						await loadDrawerComponents();
					}
					await onSaveSearch();
				} else {
					goto('/auth/signup');
				}
			}}
			title={canSaveSearch
				? $t('find_tasks.save_search_tooltip_enabled')
				: $t('find_tasks.save_search_tooltip_disabled')}
		>
			<IconBookmarkOutline class="h-4 w-4" />
			<span>{$t('find_tasks.save')}</span>
		</button>

		<!-- Map/List Toggle Button (Mobile/Tablet only) -->
		<button
			data-testid="tasks-view-toggle-button"
			class="btn btn-sm btn-secondary gap-2 lg:hidden"
			aria-label={viewMode === 'list' ? $t('find_tasks.view_map') : $t('find_tasks.view_list')}
			onclick={onToggleViewMode}
			title={viewMode === 'list' ? $t('find_tasks.view_map') : $t('find_tasks.view_list')}
		>
			{#if viewMode === 'list'}
				<IconMap class="h-4 w-4" />
			{:else}
				<IconFormatListBulleted class="h-4 w-4" />
			{/if}
			<span>
				{#if viewMode === 'list'}
					{$t('find_tasks.map')}
				{:else}
					{$t('find_tasks.list')}
				{/if}
			</span>
		</button>
	</nav>
</section>
