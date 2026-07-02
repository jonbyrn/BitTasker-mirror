<script lang="ts">
	import type { SavedServiceSearch } from '$lib/types/service.d';
	import { onMount } from 'svelte';
	import { getSavedServiceSearches, deleteSavedServiceSearch } from '$lib/nostr/savedServiceSearch';
	import SaveServiceSearchForm from '$lib/components/service/SaveServiceSearchForm.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import IconMagnify from '~icons/mdi/magnify';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';

	let savedSearches = $state<SavedServiceSearch[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let editingSearch = $state<SavedServiceSearch | null>(null);
	let isEditFormOpen = $state(false);
	let confirmDeleteId = $state<string | null>(null);

	async function loadSavedSearches() {
		try {
			isLoading = true;
			error = null;
			savedSearches = await getSavedServiceSearches();
		} catch (err) {
			console.error('Error loading saved service searches:', err);
			error = 'profile_task.errors.load_saved_searches';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadSavedSearches();
	});

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		return date.toLocaleDateString($locale || 'en', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function openEditForm(search: SavedServiceSearch) {
		editingSearch = { ...search };
		isEditFormOpen = true;
	}

	function closeEditForm() {
		editingSearch = null;
		isEditFormOpen = false;
	}

	function handleSearchUpdated() {
		closeEditForm();
		loadSavedSearches();
	}

	async function deleteSearch(id: string) {
		try {
			await deleteSavedServiceSearch(id);
			savedSearches = savedSearches.filter((s) => s.id !== id);
			confirmDeleteId = null;
		} catch (err) {
			console.error('Error deleting saved service search:', err);
			error = 'profile_task.errors.delete_saved_search';
		}
	}

	function getCategoryName(categoryId: string): string {
		const category = TASK_CATEGORIES.find((c) => c.id === categoryId);
		if (!category) return categoryId;
		const translated = $t(`categories.${category.slug}.name`);
		return translated.startsWith('categories.') ? category.name : translated;
	}

	function getPricingTypeName(pricingType: ServicePricingTypeEnum | undefined): string {
		if (!pricingType) return '';
		const slug =
			pricingType === ServicePricingTypeEnum.INQUIRY_REQUIRED
				? 'inquiry_required'
				: pricingType.toLowerCase();
		const key = `dashboard.services.browse.pricing.${slug}`;
		const translated = $t(key);
		return translated.startsWith('dashboard.') ? pricingType : translated;
	}

	function getLocationTypeName(loc: ServiceLocationTypeEnum): string {
		const key = `dashboard.services.create.location.${
			loc === ServiceLocationTypeEnum.REMOTE
				? 'remote_title'
				: loc === ServiceLocationTypeEnum.TASKER_LOCATION
					? 'tasker_title'
					: 'taskee_title'
		}`;
		const translated = $t(key);
		return translated.startsWith('dashboard.') ? loc : translated;
	}

	function applySavedSearch(search: SavedServiceSearch) {
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('savedServiceSearchParams', JSON.stringify(search.params));
		}
		goto('/services');
	}

	function handleKeydown(event: KeyboardEvent, search: SavedServiceSearch) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			applySavedSearch(search);
		}
	}
</script>

<div class="card bg-base-100 mb-4 rounded-xl p-4">
	{#if error}
		<div class="alert alert-outline alert-error mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{$t(error)}</span>
			<button class="btn btn-sm" onclick={loadSavedSearches}>{$t('profile_task.retry')}</button>
		</div>
	{/if}

	{#if isLoading}
		<div class="mt-4 grid animate-pulse grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
			{#each Array.from({ length: 3 }, (_, index) => index) as index (index)}
				<div class="card bg-base-200 border-base-content/10 rounded-xl border shadow-sm">
					<div class="card-body p-3">
						<div class="bg-base-300 h-5 w-32 flex-1 rounded"></div>
						<div class="mt-1 flex flex-wrap gap-1">
							<div class="bg-base-300 h-4 w-16 rounded-full"></div>
							<div class="bg-base-300 h-4 w-20 rounded-full"></div>
						</div>
						<div class="bg-base-300 mt-1 h-3 w-24 rounded"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if savedSearches.length === 0}
		<DashboardEmptyState
			icon={IconMagnify}
			title={$t('dashboard.services.browse.saved_service_searches.no_saved_searches')}
			description={$t('dashboard.services.browse.saved_service_searches.saved_searches_info')}
			actionLabel={$t('dashboard.services.browse.saved_service_searches.start_new_search')}
			onAction={() => goto('/services')}
			testId="saved-service-searches-empty-state"
		/>
	{:else}
		<div class="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
			{#each savedSearches as search (search.id)}
				<div
					class="card bg-base-200 border-base-content/10 hover:border-primary cursor-pointer rounded-xl border shadow-sm transition-all hover:shadow-md"
					onclick={() => applySavedSearch(search)}
					onkeydown={(e) => handleKeydown(e, search)}
					role="button"
					tabindex="0"
					aria-label={$t('dashboard.saved_searches.apply_search', {
						values: { name: search.name }
					})}
				>
					<div class="card-body p-3">
						<div class="flex items-start justify-between gap-2">
							<span class="line-clamp-1 text-sm">{search.name}</span>
						</div>
						<div class="mt-1">
							<div class="flex flex-wrap gap-1">
								{#if search.params.categories?.length}
									{#each search.params.categories as category, categoryIndex (categoryIndex)}
										{@const id =
											typeof category === 'string' ? category : (category as { id: string }).id}
										<div
											class="badge badge-primary badge-sm max-w-[120px] truncate"
											title={getCategoryName(id)}
										>
											{getCategoryName(id)}
										</div>
									{/each}
								{/if}
								{#if search.params.skills?.length}
									{#each search.params.skills as skill, skillIndex (`${skill}-${skillIndex}`)}
										<div
											class="badge badge-secondary badge-sm max-w-[120px] truncate"
											title={skill}
										>
											{skill}
										</div>
									{/each}
								{/if}
								{#if search.params.serviceLocationTypes?.length}
									{#each search.params.serviceLocationTypes as loc, locationIndex (`${loc}-${locationIndex}`)}
										<div class="badge badge-accent badge-sm">{getLocationTypeName(loc)}</div>
									{/each}
								{/if}
								{#if search.params.pricingType}
									<div class="badge badge-info badge-sm">
										{getPricingTypeName(search.params.pricingType)}
									</div>
								{/if}
								{#if search.params.minPrice !== undefined || search.params.maxPrice !== undefined}
									<div class="badge badge-success badge-sm">
										{#if search.params.minPrice !== undefined}{search.params.minPrice}{/if}
										{#if search.params.minPrice !== undefined && search.params.maxPrice !== undefined}
											-
										{/if}
										{#if search.params.maxPrice !== undefined}{search.params.maxPrice}{/if}
									</div>
								{/if}
							</div>
						</div>
						<div class="mt-2 flex items-center justify-between gap-2">
							<div class="text-base-content/70 min-w-0 flex-1 text-xs">
								{$t('profile_task.created_label')}: {formatDate(search.createdAt)}
							</div>
							<div class="flex shrink-0 gap-1">
								<button
									aria-label={$t('profile_task.actions.edit_saved_search')}
									class="btn btn-xs btn-ghost btn-square"
									onclick={(e) => {
										e.stopPropagation();
										openEditForm(search);
									}}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3.5 w-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
										/>
									</svg>
								</button>
								<button
									aria-label={$t('profile_task.actions.delete_saved_search')}
									class="btn btn-xs btn-ghost btn-square text-error"
									onclick={(e) => {
										e.stopPropagation();
										confirmDeleteId = search.id;
									}}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3.5 w-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<SaveServiceSearchForm
	isOpen={isEditFormOpen}
	searchParams={editingSearch?.params ?? {}}
	existingSavedSearch={editingSearch}
	onClose={closeEditForm}
	onSaved={handleSearchUpdated}
/>

<Modal
	isOpen={!!confirmDeleteId}
	title={$t('profile_task.confirm_delete.title')}
	onClose={() => (confirmDeleteId = null)}
	size="sm"
	isScrollable={false}
>
	<p>{$t('profile_task.confirm_delete.message')}</p>

	{#snippet footer()}
		<button class="btn" onclick={() => (confirmDeleteId = null)}>
			{$t('profile_task.confirm_delete.cancel')}
		</button>
		<button class="btn btn-error" onclick={() => confirmDeleteId && deleteSearch(confirmDeleteId)}>
			{$t('profile_task.confirm_delete.delete')}
		</button>
	{/snippet}
</Modal>
