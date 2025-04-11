<!-- 
  SavedSearchList.svelte
  Component that displays and manages saved searches
-->
<script lang="ts">
	import type { SavedSearch } from '$lib/types/saved-search';
	import { NotificationFrequency } from '$lib/utils/enums/task.enum';
	import savedSearchesService from '$lib/api/services/saved-searches.service';
	import Input from '../Input.svelte';

	// State
	let savedSearches = $state<SavedSearch[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let editingSearch = $state<SavedSearch | null>(null);
	let isEditModalOpen = $state(false);
	let confirmDeleteId = $state<string | null>(null);

	// Load saved searches on component mount
	loadSavedSearches();

	async function loadSavedSearches() {
		try {
			isLoading = true;
			error = null;
			savedSearches = await savedSearchesService.getSavedSearches();
		} catch (err) {
			console.error('Error loading saved searches:', err);
			error = 'Failed to load saved searches. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Format date for display
	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Open edit modal
	function openEditModal(search: SavedSearch) {
		editingSearch = { ...search };
		isEditModalOpen = true;
	}

	// Close edit modal
	function closeEditModal() {
		editingSearch = null;
		isEditModalOpen = false;
	}

	// Save edited search
	async function saveEditedSearch() {
		if (!editingSearch) return;

		try {
			await savedSearchesService.updateSavedSearch(editingSearch.id, {
				name: editingSearch.name,
				notifyOnMatch: editingSearch.notifyOnMatch,
				isActive: editingSearch.isActive,
				notificationFrequency: editingSearch.notificationFrequency
			});

			// Update local state
			savedSearches = savedSearches.map((search) =>
				search.id === editingSearch?.id ? editingSearch : search
			);

			closeEditModal();
		} catch (err) {
			console.error('Error updating saved search:', err);
			error = 'Failed to update saved search.';
		}
	}

	// Delete saved search
	async function deleteSearch(id: string) {
		try {
			await savedSearchesService.deleteSavedSearch(id);

			// Update local state
			savedSearches = savedSearches.filter((search) => search.id !== id);
			confirmDeleteId = null;
		} catch (err) {
			console.error('Error deleting saved search:', err);
			error = 'Failed to delete saved search.';
		}
	}

	// Toggle notifications
	async function toggleNotifications(search: SavedSearch) {
		try {
			await savedSearchesService.updateNotificationPreferences(
				search.id,
				!search.notifyOnMatch,
				search.notificationFrequency
			);

			// Update local state
			savedSearches = savedSearches.map((s) =>
				s.id === search.id ? { ...s, notifyOnMatch: !s.notifyOnMatch } : s
			);
		} catch (err) {
			console.error('Error toggling notifications:', err);
			error = 'Failed to update notification settings.';
		}
	}

	// Mark all notifications as read
	async function markNotificationsAsRead(searchId: string) {
		try {
			await savedSearchesService.markNotificationsAsRead(searchId);

			// Update local state
			savedSearches = savedSearches.map((search) =>
				search.id === searchId ? { ...search, unreadNotifications: 0 } : search
			);
		} catch (err) {
			console.error('Error marking notifications as read:', err);
			error = 'Failed to mark notifications as read.';
		}
	}
</script>

<div class="bg-base-200 mb-6 rounded-lg p-4">
	<h2 class="mb-4 text-xl font-bold">Saved Searches</h2>

	{#if error}
		<div class="alert alert-error mb-4">
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
			<span>{error}</span>
			<button class="btn btn-sm" onclick={loadSavedSearches}>Retry</button>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex justify-center p-6">
			<div class="loading loading-spinner loading-lg"></div>
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
			<p class="text-lg font-medium">No saved searches yet</p>
			<p class="mb-4 text-gray-500">
				Save your search criteria to get notified when new matching tasks are posted.
			</p>
		</div>
	{:else}
		<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each savedSearches as search}
				<div class="card bg-base-100 shadow-sm">
					<div class="card-body p-4">
						<!-- Header with name and notification indicator -->
						<div class="flex items-start justify-between">
							<h3 class="card-title text-md">{search.name}</h3>

							{#if search.unreadNotifications > 0}
								<button
									class="badge badge-primary tooltip"
									data-tip="New matching tasks"
									onclick={() => markNotificationsAsRead(search.id)}
								>
									{search.unreadNotifications} new
								</button>
							{/if}
						</div>

						<!-- Search criteria summary -->
						<div class="mt-1 text-sm text-gray-600">
							<div class="flex flex-wrap gap-1">
								{#if search.searchParams.searchTerm}
									<div class="badge badge-outline badge-sm">{search.searchParams.searchTerm}</div>
								{/if}

								{#if search.searchParams.taskType}
									<div class="badge badge-outline badge-sm">{search.searchParams.taskType}</div>
								{/if}

								{#if search.searchParams.location}
									<div class="badge badge-outline badge-sm">{search.searchParams.location}</div>
								{/if}
							</div>

							{#if search.searchParams.minBudget || search.searchParams.maxBudget}
								<div class="mt-1">
									Budget:
									{search.searchParams.minBudget ?? 0} -
									{search.searchParams.maxBudget ?? '∞'}
								</div>
							{/if}
						</div>

						<div class="mt-2 text-xs text-gray-500">
							Created: {formatDate(search.createdAt)}
						</div>

						<!-- Action buttons -->
						<div class="card-actions mt-3 justify-between">
							<div class="flex items-center">
								<label class="swap swap-flip">
									<input
										type="checkbox"
										checked={search.notifyOnMatch}
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
										<span class="text-xs">Notifications off</span>
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
										<span class="text-xs">Notifications on</span>
									</div>
								</label>
							</div>

							<div class="flex gap-2">
								<button
									aria-label="Edit saved search"
									class="btn btn-sm btn-ghost btn-square"
									onclick={() => openEditModal(search)}
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
									aria-label="Delete saved search"
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

<!-- Edit Modal -->
{#if isEditModalOpen && editingSearch}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
		<div class="bg-base-100 w-full max-w-md rounded-lg p-6">
			<h3 class="mb-4 text-lg font-bold">Edit Saved Search</h3>

			<div class="form-control mb-4">
				<label class="label" for="name">Name</label>
				<input type="text" class="input input-bordered" bind:value={editingSearch.name} />
			</div>

			<div class="form-control mb-4">
				<label class="label flex cursor-pointer justify-start gap-2" for="notifyOnMatch">
					<input
						id="notifyOnMatch"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={editingSearch.notifyOnMatch}
					/>
					<span>Notify on matching tasks</span>
				</label>
			</div>

			<div class="form-control mb-4">
				<label class="label flex cursor-pointer justify-start gap-2" for="isActive">
					<input
						id="isActive"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={editingSearch.isActive}
					/>
					<span>Active search</span>
				</label>
				<label class="label" for="isActive">
					<span class="label-text-alt whitespace-normal"
						>Inactive searches won't appear in your dashboard</span
					>
				</label>
			</div>

			{#if editingSearch.notifyOnMatch}
				<div class="form-control mb-4">
					<label class="label" for="notificationFrequency">Notification Frequency</label>
					<Input
						type="select"
						value={editingSearch.notificationFrequency}
						placeholder="Select frequency"
						options={[
							{ label: 'Immediate', value: NotificationFrequency.INSTANT },
							{ label: 'Daily Digest', value: NotificationFrequency.DAILY },
							{ label: 'Weekly Digest', value: NotificationFrequency.WEEKLY }
						]}
						onChange={({ value }) => editingSearch && (editingSearch.notificationFrequency = value)}
					/>
				</div>
			{/if}

			<div class="modal-action">
				<button class="btn" onclick={closeEditModal}>Cancel</button>
				<button class="btn btn-primary" onclick={saveEditedSearch}>Save Changes</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation -->
{#if confirmDeleteId}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
		<div class="bg-base-100 w-full max-w-sm rounded-lg p-6">
			<h3 class="mb-2 text-lg font-bold">Confirm Delete</h3>
			<p>Are you sure you want to delete this saved search? This cannot be undone.</p>

			<div class="modal-action">
				<button class="btn" onclick={() => (confirmDeleteId = null)}>Cancel</button>
				<button class="btn btn-error" onclick={() => deleteSearch(confirmDeleteId!)}>Delete</button>
			</div>
		</div>
	</div>
{/if}
