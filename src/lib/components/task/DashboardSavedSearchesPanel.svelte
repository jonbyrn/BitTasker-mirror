<script lang="ts">
	import type { SavedSearch } from '$lib/types/task';
	import {
		getSavedSearches,
		deleteSavedSearch,
		updateNotificationPreferences,
		markNotificationsAsRead
	} from '$lib/nostr/savedSearch';
	import SaveSearchForm from '$lib/components/task/SaveSearchForm.svelte';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	// State
	let savedSearches = $state<SavedSearch[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let editingSearch = $state<SavedSearch | null>(null);
	let isEditFormOpen = $state(false);
	let confirmDeleteId = $state<string | null>(null);

	// Load saved searches on component mount
	loadSavedSearches();

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

	// Format date for display (convert from unix timestamp)
	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Open edit form
	function openEditForm(search: SavedSearch) {
		editingSearch = { ...search };
		isEditFormOpen = true;
	}

	// Close edit form
	function closeEditForm() {
		editingSearch = null;
		isEditFormOpen = false;
	}

	// Handle successful search update
	function handleSearchUpdated() {
		// Reload saved searches to get the updated data
		closeEditForm();
		loadSavedSearches();
	}

	// Delete saved search
	async function deleteSearch(id: string) {
		try {
			await deleteSavedSearch(id);

			// Update local state
			savedSearches = savedSearches.filter((search) => search.id !== id);
			confirmDeleteId = null;
		} catch (err) {
			console.error('Error deleting saved search:', err);
			error = 'profile_task.errors.delete_saved_search';
		}
	}

	// Toggle notifications
	async function toggleNotifications(search: SavedSearch) {
		try {
			await updateNotificationPreferences(
				search.id,
				!search.notifyOnMatch,
				search.notificationFrequency || 'DAILY'
			);

			// Update local state
			savedSearches = savedSearches.map((s) =>
				s.id === search.id ? { ...s, notifyOnMatch: !s.notifyOnMatch } : s
			);
		} catch (err) {
			console.error('Error toggling notifications:', err);
			error = 'profile_task.errors.update_notification_settings';
		}
	}

	// Mark all notifications as read
	async function markNotificationsAsReadForSearch(searchId: string) {
		try {
			await markNotificationsAsRead(searchId);

			// Update local state
			savedSearches = savedSearches.map((search) =>
				search.id === searchId ? { ...search, unreadNotifications: 0 } : search
			);
		} catch (err) {
			console.error('Error marking notifications as read:', err);
			error = 'profile_task.errors.mark_notifications_read';
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
		<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 animate-pulse">
			{#each Array(1) as _}
				<div class="card border-base-content/10 rounded-xl border shadow-sm">
					<div class="card-body p-4">
						<!-- Header with name and notification indicator skeleton -->
						<div class="flex items-start justify-between">
							<!-- Search name skeleton -->
							<div class="bg-base-300 h-6 w-32 rounded"></div>
							
							<!-- Notification badge skeleton (optional) -->
							<div class="bg-base-300 h-5 w-8 rounded-full"></div>
						</div>

						<!-- Search criteria summary skeleton -->
						<div class="mt-1">
							<!-- Badges skeleton -->
							<div class="flex flex-wrap gap-1">
								<div class="bg-base-300 h-5 w-16 rounded-full"></div>
								<div class="bg-base-300 h-5 w-20 rounded-full"></div>
								<div class="bg-base-300 h-5 w-24 rounded-full"></div>
							</div>
							
							<!-- Budget tier skeleton -->
							<div class="mt-1">
								<div class="bg-base-300 h-4 w-28 rounded"></div>
							</div>
						</div>

						<!-- Created date skeleton -->
						<div class="mt-2">
							<div class="bg-base-300 h-3 w-24 rounded"></div>
						</div>

						<!-- Action buttons skeleton -->
						<div class="card-actions mt-3 justify-between">
							<!-- Notification toggle skeleton -->
							<div class="flex items-center">
								<div class="bg-base-300 h-6 w-20 rounded"></div>
							</div>

							<!-- Edit and delete buttons skeleton -->
							<div class="flex gap-2">
								<div class="bg-base-300 h-8 w-8 rounded"></div>
								<div class="bg-base-300 h-8 w-8 rounded"></div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if savedSearches.length === 0}
		<div class="py-8 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-primary mx-auto mb-3 h-12 w-12"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<p class="text-lg font-medium">{$t('profile_task.no_saved_searches')}</p>
			<p class="mb-4 text-base-content/60">
				{$t('profile_task.saved_searches_info')}
			</p>
			<button
				class="btn btn-primary gap-2"
				onclick={() => goto('/dashboard/find-tasks')}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				{$t('profile_task.start_new_search')}
			</button>
		</div>
	{:else}
		<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each savedSearches as search}
				<div class="card border-base-content/10 rounded-xl border shadow-sm">
					<div class="card-body p-4">
						<!-- Header with name and notification indicator -->
						<div class="flex items-start justify-between">
							<h3 class="card-title text-md">{search.name}</h3>

							{#if (search.unreadNotifications ?? 0) > 0}
								<button
									class="badge badge-primary tooltip"
									data-tip={$t('profile_task.new_matching_tasks')}
									onclick={() => markNotificationsAsReadForSearch(search.id)}
								>
									{search.unreadNotifications}
									{$t('profile_task.unread_new_label')}
								</button>
							{/if}
						</div>

						<!-- Search criteria summary -->
						<div class="mt-1 text-sm">
							<div class="flex flex-wrap gap-1">
								{#if search.params.search}
									<div class="badge badge-outline badge-sm">{search.params.search}</div>
								{/if}

								{#if search.params.taskType}
									<div class="badge badge-outline badge-sm">{search.params.taskType}</div>
								{/if}

								{#if search.params.location}
									<div class="badge badge-outline badge-sm">{search.params.location}</div>
								{/if}
							</div>

							{#if search.params.budget?.tier}
								<div class="mt-1">
									{$t('profile_task.budget_tier_label')}: {search.params.budget.tier}
								</div>
							{/if}
						</div>

						<div class="mt-2 text-xs text-white/90">
							{$t('profile_task.created_label')}: {formatDate(search.createdAt)}
						</div>

						<!-- Action buttons -->
						<div class="card-actions mt-3 justify-between">
							<div class="flex items-center">
								<label class="swap swap-flip">
									<input
										type="checkbox"
										checked={search.notifyOnMatch ?? false}
										onclick={() => toggleNotifications(search)}
									/>

									<!-- Notifications OFF icon -->
									<div class="swap-off flex items-center text-gray-500">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mr-1 h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
										<span class="text-xs">{$t('profile_task.notifications_off')}</span>
									</div>

									<!-- Notifications ON icon -->
									<div class="swap-on text-primary flex items-center">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mr-1 h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
											/>
										</svg>
										<span class="text-xs">{$t('profile_task.notifications_on')}</span>
									</div>
								</label>
							</div>

							<div class="flex gap-2">
								<button
									aria-label={$t('profile_task.actions.edit_saved_search')}
									class="btn btn-sm btn-ghost btn-square"
									onclick={() => openEditForm(search)}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
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
									class="btn btn-sm btn-ghost btn-square text-error"
									onclick={() => (confirmDeleteId = search.id)}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
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

<!-- Edit Form -->
<SaveSearchForm
	isOpen={isEditFormOpen}
	searchParams={editingSearch?.params ?? {}}
	existingSavedSearch={editingSearch}
	onClose={closeEditForm}
	onSaved={handleSearchUpdated}
/>

<!-- Delete Confirmation -->
{#if confirmDeleteId}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
		<div class="bg-base-100 w-[90%] max-w-sm rounded-lg p-6">
			<h3 class="mb-2 text-lg font-bold">{$t('profile_task.confirm_delete.title')}</h3>
			<p>{$t('profile_task.confirm_delete.message')}</p>

			<div class="modal-action">
				<button class="btn" onclick={() => (confirmDeleteId = null)}
					>{$t('profile_task.confirm_delete.cancel')}</button
				>
				<button class="btn btn-error" onclick={() => deleteSearch(confirmDeleteId!)}
					>{$t('profile_task.confirm_delete.delete')}</button
				>
			</div>
		</div>
	</div>
{/if}
