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
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import IconMagnify from '~icons/mdi/magnify';

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

	function getTaskTypeName(taskType: string | undefined): string {
		if (!taskType) return '';
		if (taskType === 'REMOTE') return $t('find_tasks.remote');
		if (taskType === 'IN_PERSON') return $t('find_tasks.in_person');
		return taskType;
	}

	function getBudgetTierName(tier: string | undefined): string {
		if (!tier) return '';
		try {
			const translatedTier = $t(`profile_task.budget_tiers.${tier}`);
			return translatedTier.startsWith('profile_task.budget_tiers.') ? tier : translatedTier;
		} catch {
			return tier;
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

<div class="card bg-base-100 mb-6 rounded-xl p-4">
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
					class="card bg-base-200 border-base-content/10 hover:border-primary cursor-pointer rounded-xl border shadow-sm transition-all hover:shadow-md"
					onclick={() => applySavedSearch(search)}
					onkeydown={(e) => handleKeydown(e, search)}
					role="button"
					tabindex="0"
					aria-label="Apply search: {search.name}"
				>
					<div class="card-body p-3">
						<div class="flex items-start justify-between gap-2">
							<span class="line-clamp-1 text-sm">{search.name}</span>
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
						<div class="mt-1">
							<div class="flex flex-wrap gap-1">
								{#if search.params.categories && search.params.categories.length > 0}
									{#each search.params.categories as category (typeof category === 'string' ? category : category.id)}
										{@const categoryId =
											typeof category === 'string' ? category : (category as { id: string }).id}
										{@const categoryName = getCategoryName(categoryId)}
										<div
											class="badge badge-primary badge-sm max-w-[120px] truncate"
											title={categoryName}
										>
											{categoryName}
										</div>
									{/each}
								{/if}
								{#if search.params.skills && search.params.skills.length > 0}
									{#each search.params.skills as skill (skill)}
										<div
											class="badge badge-secondary badge-sm max-w-[120px] truncate"
											title={skill}
										>
											{skill}
										</div>
									{/each}
								{/if}
								{#if search.params.taskType}
									<div class="badge badge-accent badge-sm">
										{getTaskTypeName(search.params.taskType)}
									</div>
								{/if}
								{#if search.params.location}
									<div
										class="badge badge-info badge-sm max-w-[120px] truncate"
										title={search.params.location}
									>
										{search.params.location}
									</div>
								{/if}
								{#if search.params.budget?.tier}
									<div class="badge badge-success badge-sm">
										{$t('profile_task.budget_tier_label')}: {getBudgetTierName(
											search.params.budget.tier
										)}
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
