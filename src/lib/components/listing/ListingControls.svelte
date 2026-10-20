<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';

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
		onSearchFocus,
		onSearchBlur,
		onFilterClick,
		onSaveSearch,
		canSaveSearch,
		showSaveButton = true,
		viewMode,
		onToggleViewMode,
		user,
		drawersLoaded,
		loadDrawerComponents,
		translationNamespace = 'find_tasks',
		filterLabelKey = 'filters',
		activeFilterCount = 0,
		filterDisabled = false,
		children
	} = $props<{
		searchQuery: string;
		searchInputClass: string;
		searchPlaceholder: string;
		onSearchInput: (e: Event) => void;
		onSearchFocus?: () => void;
		onSearchBlur?: () => void;
		onFilterClick: () => void;
		onSaveSearch?: () => Promise<void>;
		children?: import('svelte').Snippet;
		canSaveSearch?: boolean;
		showSaveButton?: boolean;
		viewMode: 'list' | 'map';
		onToggleViewMode: () => void;
		user: { npub?: string } | null;
		drawersLoaded: boolean;
		loadDrawerComponents: () => Promise<void>;
		translationNamespace?: string;
		filterLabelKey?: string;
		activeFilterCount?: number;
		filterDisabled?: boolean;
	}>();

	const filtersLabel = $derived(
		$t(`${translationNamespace}.${filterLabelKey}`) || $t('find_tasks.filters')
	);
	const saveLabel = $derived($t(`${translationNamespace}.save`) || $t('find_tasks.save'));
	const mapLabel = $derived($t(`${translationNamespace}.map`) || $t('find_tasks.map'));
	const listLabel = $derived($t(`${translationNamespace}.list`) || $t('find_tasks.list'));
	const viewMapTitle = $derived(
		$t(`${translationNamespace}.view_map`) || $t('find_tasks.view_map')
	);
	const viewListTitle = $derived(
		$t(`${translationNamespace}.view_list`) || $t('find_tasks.view_list')
	);
	const saveTooltipEnabled = $derived(
		$t(`${translationNamespace}.save_search_tooltip_enabled`) ||
			$t('find_tasks.save_search_tooltip_enabled')
	);
	const saveTooltipDisabled = $derived(
		$t(`${translationNamespace}.save_search_tooltip_disabled`) ||
			$t('find_tasks.save_search_tooltip_disabled')
	);
	const searchPlaceholderLabel = $derived(
		$t(`${translationNamespace}.search_placeholder`) || searchPlaceholder
	);
</script>

<section class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-2">
	<div class="relative min-w-0 flex-1">
		<input
			type="text"
			class={searchInputClass}
			placeholder={searchPlaceholder}
			bind:value={searchQuery}
			oninput={onSearchInput}
			onfocus={onSearchFocus}
			onblur={onSearchBlur}
			aria-label={searchPlaceholderLabel}
		/>
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
			<IconMagnify class="h-5 w-5 text-gray-400" />
		</div>
	</div>

	<nav
		class="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end"
		aria-label="Search actions"
	>
		<button
			class="btn btn-sm btn-primary min-w-0 flex-1 whitespace-normal sm:flex-none"
			aria-label={filtersLabel}
			onclick={onFilterClick}
			disabled={filterDisabled}
		>
			<IconFilter class="mr-1 h-4 w-4" />
			<span>{filtersLabel}</span>
			{#if activeFilterCount > 0}
				<div class="badge badge-secondary ml-2">{activeFilterCount}</div>
			{/if}
		</button>

		{#if showSaveButton && onSaveSearch}
			<button
				class="btn btn-sm btn-secondary min-w-0 flex-1 gap-2 whitespace-normal sm:flex-none"
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
				title={canSaveSearch ? saveTooltipEnabled : saveTooltipDisabled}
			>
				<IconBookmarkOutline class="h-4 w-4" />
				<span>{saveLabel}</span>
			</button>
		{/if}

		<button
			class="btn btn-sm btn-secondary min-w-0 flex-1 gap-2 whitespace-normal sm:flex-none lg:hidden"
			onclick={onToggleViewMode}
			title={viewMode === 'list' ? viewMapTitle : viewListTitle}
		>
			{#if viewMode === 'list'}
				<IconMap class="h-4 w-4" />
			{:else}
				<IconFormatListBulleted class="h-4 w-4" />
			{/if}
			<span>
				{#if viewMode === 'list'}
					{mapLabel}
				{:else}
					{listLabel}
				{/if}
			</span>
		</button>
		{#if children}
			{@render children?.()}
		{/if}
	</nav>
</section>
