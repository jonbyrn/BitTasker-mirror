<script lang="ts">
	import type { SavedSearch } from '$lib/types/task';
	import {
		getSavedSearches,
		deleteSavedSearch,
		markNotificationsAsRead
	} from '$lib/nostr/savedSearch';
	import SaveSearchForm from '$lib/components/task/SaveSearchForm.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import IconMagnify from '~icons/mdi/magnify';
	import IconTagOutline from '~icons/mdi/tag-outline';
	import IconWrenchOutline from '~icons/mdi/wrench-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconCash from '~icons/mdi/cash';
	import IconBellOutline from '~icons/mdi/bell-outline';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconDeleteOutline from '~icons/mdi/delete-outline';

	let savedSearches = $state<SavedSearch[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let editingSearch = $state<SavedSearch | null>(null);
	let isEditFormOpen = $state(false);
	let confirmDeleteId = $state<string | null>(null);

	async function loadSavedSearches() {
		try {
			isLoading = true;
			error = null;
			savedSearches = await getSavedSearches();
		} catch (err) {
			console.error('Error loading saved searches:', err);
			error = 'profile_task.errors.load_saved_searches';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadSavedSearches();
	});

	function formatFrequency(frequency: string | undefined): string {
		if (!frequency) return '';
		const key = `profile_task.notification_frequency.${frequency.toLowerCase()}`;
		const translated = $t(key);
		if (translated && translated !== key) return translated;
		return frequency.charAt(0).toUpperCase() + frequency.slice(1).toLowerCase();
	}

	function openEditForm(search: SavedSearch) {
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
			await deleteSavedSearch(id);
			savedSearches = savedSearches.filter((search) => search.id !== id);
			confirmDeleteId = null;
		} catch (err) {
			console.error('Error deleting saved search:', err);
			error = 'profile_task.errors.delete_saved_search';
		}
	}

	function getCategoryName(categoryId: string): string {
		const category = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
		if (!category) return categoryId;
		try {
			const translatedName = $t(`categories.${category.slug}.name`);
			return translatedName.startsWith('categories.') ? category.name : translatedName;
		} catch {
			return category.name;
		}
	}

	function toProperCase(text: string): string {
		return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
	}

	function getTaskTypeName(taskType: string | undefined): string {
		if (!taskType) return '';
		if (taskType === 'REMOTE') return $t('find_tasks.remote');
		if (taskType === 'IN_PERSON') return $t('find_tasks.in_person');
		return toProperCase(taskType);
	}

	function getBudgetTierName(tier: string | undefined): string {
		if (!tier) return '';
		try {
			const translatedTier = $t(`profile_task.budget_tiers.${tier}`);
			return translatedTier.startsWith('profile_task.budget_tiers.')
				? toProperCase(tier)
				: translatedTier;
		} catch {
			return toProperCase(tier);
		}
	}

	async function markNotificationsAsReadForSearch(searchId: string) {
		try {
			await markNotificationsAsRead(searchId);
			savedSearches = savedSearches.map((search) =>
				search.id === searchId ? { ...search, unreadNotifications: 0 } : search
			);
		} catch (err) {
			console.error('Error marking notifications as read:', err);
			error = 'profile_task.errors.mark_notifications_read';
		}
	}

	function applySavedSearch(search: SavedSearch) {
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('savedSearchParams', JSON.stringify(search.params));
		}
		goto('/tasks');
	}

	function handleKeydown(event: KeyboardEvent, search: SavedSearch) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			applySavedSearch(search);
		}
	}
</script>

<div class="card bg-base-100 mb-4 rounded-xl px-4 pb-4">
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
				<div class="card bg-base-100 border-base-300 rounded-xl border shadow-md">
					<div class="card-body rounded-xl p-4">
						<div class="bg-base-300 h-5 w-32 flex-1 rounded"></div>
						<div class="mt-1 flex flex-wrap gap-1">
							<div class="bg-base-300 h-4 w-16 rounded-full"></div>
							<div class="bg-base-300 h-4 w-20 rounded-full"></div>
							<div class="bg-base-300 h-4 w-24 rounded-full"></div>
						</div>
						<div class="bg-base-300 mt-1 h-3 w-24 rounded"></div>
						<div class="card-actions mt-2 justify-end">
							<div class="flex gap-1">
								<div class="bg-base-300 h-6 w-6 rounded"></div>
								<div class="bg-base-300 h-6 w-6 rounded"></div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if savedSearches.length === 0}
		<DashboardEmptyState
			icon={IconMagnify}
			title={$t('profile_task.no_saved_searches')}
			description={$t('profile_task.saved_searches_info')}
			actionLabel={$t('profile_task.start_new_search')}
			onAction={() => goto('/tasks')}
			testId="saved-task-searches-empty-state"
		/>
	{:else}
		<div class="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
			{#each savedSearches as search (search.id)}
				<div
					class="card bg-base-100 border-base-300 hover:border-primary cursor-pointer rounded-xl border shadow-md transition-all hover:shadow-lg"
					onclick={() => applySavedSearch(search)}
					onkeydown={(e) => handleKeydown(e, search)}
					role="button"
					tabindex="0"
					aria-label="Apply search: {search.name}"
				>
					<div class="card-body rounded-xl p-4">
						<div class="flex items-start justify-between gap-2">
							<span class="line-clamp-1 text-sm font-semibold">{search.name}</span>
							{#if (search.unreadNotifications ?? 0) > 0}
								<button
									class="badge badge-primary badge-sm tooltip shrink-0"
									data-tip={$t('profile_task.new_matching_tasks')}
									onclick={(e) => {
										e.stopPropagation();
										markNotificationsAsReadForSearch(search.id);
									}}
								>
									{search.unreadNotifications}
									{$t('profile_task.unread_new_label')}
								</button>
							{/if}
						</div>
						<div class="mt-2 flex flex-col gap-1.5">
							{#if search.params.categories && search.params.categories.length > 0}
								<div class="flex items-center gap-2">
									<IconTagOutline class="text-primary h-8 w-8 shrink-0" />
									<span class="line-clamp-1 text-sm">
										{search.params.categories
											.map((c: string | { id: string }) =>
												getCategoryName(typeof c === 'string' ? c : c.id)
											)
											.join(', ')}
									</span>
								</div>
							{/if}
							{#if search.params.skills && search.params.skills.length > 0}
								<div class="flex items-center gap-2">
									<IconWrenchOutline class="text-primary h-8 w-8 shrink-0" />
									<span class="line-clamp-1 text-sm capitalize"
										>{search.params.skills.join(', ')}</span
									>
								</div>
							{/if}
							{#if search.params.taskType}
								<div class="flex items-center gap-2">
									<IconBriefcaseOutline class="text-primary h-8 w-8 shrink-0" />
									<span class="text-sm">{getTaskTypeName(search.params.taskType)}</span>
								</div>
							{/if}
							{#if search.params.location}
								<div class="flex items-center gap-2">
									<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
									<span class="line-clamp-1 text-sm capitalize">{search.params.location}</span>
								</div>
							{/if}
							{#if search.params.budget?.tier}
								<div class="flex items-center gap-2">
									<IconCash class="text-primary h-8 w-8 shrink-0" />
									<span class="text-sm"
										>{$t('profile_task.budget_tier_label')}: {getBudgetTierName(
											search.params.budget.tier
										)}</span
									>
								</div>
							{/if}
						</div>
						{#if search.notificationFrequency}
							<div class="mt-2 flex items-center gap-2">
								<IconBellOutline class="text-primary h-8 w-8 shrink-0" />
								<span class="text-sm">{formatFrequency(search.notificationFrequency)}</span>
							</div>
						{/if}
						<div class="mt-2 flex w-full gap-1">
							<button
								class="btn btn-outline btn-sm flex-1 gap-1"
								onclick={(e) => {
									e.stopPropagation();
									openEditForm(search);
								}}
							>
								<IconPencilOutline class="h-4 w-4" />
								<span class="text-xs">{$t('common.edit')}</span>
							</button>
							<button
								class="btn btn-outline btn-sm text-error flex-1 gap-1"
								onclick={(e) => {
									e.stopPropagation();
									confirmDeleteId = search.id;
								}}
							>
								<IconDeleteOutline class="h-4 w-4" />
								<span class="text-xs">{$t('common.delete') || 'Delete'}</span>
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<SaveSearchForm
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
		<button class="btn" onclick={() => (confirmDeleteId = null)}
			>{$t('profile_task.confirm_delete.cancel')}</button
		>
		<button class="btn btn-error" onclick={() => confirmDeleteId && deleteSearch(confirmDeleteId)}>
			{$t('profile_task.confirm_delete.delete')}
		</button>
	{/snippet}
</Modal>
