<!-- 
  SaveSearchButton.svelte
  Component that allows users to save their current search criteria
-->
<script lang="ts">
	import { NotificationFrequency } from '$lib/utils/enums/task.enum';
	import type { SearchTasksParams } from '$lib/types/task.d';
	import savedSearchesService from '$lib/api/services/saved-searches.service';

	// Props
	let { searchParams, onSaved } = $props<{
		searchParams: SearchTasksParams;
		onSaved: () => void;
	}>();

	// State
	let isModalOpen = $state(false);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let searchName = $state('');
	let notifyOnMatch = $state(true);
	let isActive = $state(true);
	let notificationFrequency = $state<NotificationFrequency>(NotificationFrequency.DAILY);

	// Has active search parameters
	let hasActiveParams = $state(false);
	$effect(() => {
		// Check if there are any meaningful search parameters set
		hasActiveParams =
			!!searchParams.searchTerm ||
			!!searchParams.taskType ||
			!!searchParams.location ||
			(searchParams.status && searchParams.status.length > 0) ||
			(searchParams.categoryIds && searchParams.categoryIds.length > 0) ||
			(searchParams.skills && searchParams.skills.length > 0) ||
			!!searchParams.minBudget ||
			!!searchParams.maxBudget;
	});

	// Open save search modal
	function openModal() {
		// Generate a default name based on search criteria
		let defaultName = '';

		if (searchParams.searchTerm) {
			defaultName = `"${searchParams.searchTerm}"`;
		} else if (searchParams.taskType) {
			defaultName = `${searchParams.taskType} Tasks`;
		} else if (searchParams.location) {
			defaultName = `Tasks near ${searchParams.location}`;
		} else if (searchParams.categoryIds && searchParams.categoryIds.length > 0) {
			defaultName = 'Category Search';
		} else {
			defaultName = 'My Search';
		}

		searchName = defaultName;
		isModalOpen = true;
	}

	// Close modal
	function closeModal() {
		isModalOpen = false;
		error = null;
	}

	// Save search
	async function saveSearch() {
		if (!searchName.trim()) {
			error = 'Please enter a name for your search.';
			return;
		}

		try {
			isSaving = true;
			error = null;

			// Save search with notification preferences and active status
			await savedSearchesService.createSavedSearch(
				searchName,
				searchParams,
				notifyOnMatch,
				notificationFrequency
			);

			closeModal();
			onSaved();
		} catch (err) {
			console.error('Error saving search:', err);
			error = 'Failed to save search. Please try again.';
		} finally {
			isSaving = false;
		}
	}
</script>

<!-- Save Search Button -->
<button
	class="btn btn-sm btn-primary gap-2"
	onclick={openModal}
	disabled={!hasActiveParams}
	title={!hasActiveParams ? 'Add search filters to save' : 'Save your search criteria'}
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
			d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
		/>
	</svg>
	Save Search
</button>

<!-- Save Search Modal -->
{#if isModalOpen}
	<div class="bg-opacity-50 fixed inset-0 z-40 flex items-center justify-center bg-black/50">
		<div class="bg-base-100 w-full max-w-md rounded-lg p-6">
			<h3 class="mb-4 text-lg font-bold">Save Search</h3>

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
				</div>
			{/if}

			<!-- Search Parameters Summary -->
			<div class="bg-base-200 mb-4 rounded-md p-3">
				<h4 class="mb-2 font-medium">Search Criteria:</h4>
				<div class="mb-2 flex flex-wrap gap-1">
					{#if searchParams.searchTerm}
						<div class="badge badge-sm">{searchParams.searchTerm}</div>
					{/if}

					{#if searchParams.taskType}
						<div class="badge badge-sm">{searchParams.taskType}</div>
					{/if}

					{#if searchParams.location}
						<div class="badge badge-sm">{searchParams.location}</div>
					{/if}

					{#if searchParams.minBudget || searchParams.maxBudget}
						<div class="badge badge-sm">
							Budget: {searchParams.minBudget ?? 0} - {searchParams.maxBudget ?? '∞'}
						</div>
					{/if}
				</div>
			</div>

			<!-- Save Search Form -->
			<div class="form-control mb-4">
				<label class="label" for="searchName">
					<span class="label-text">Search Name</span>
				</label>
				<input
					type="text"
					class="input input-bordered w-full"
					placeholder="Name your search"
					bind:value={searchName}
				/>
			</div>

			<!-- Notification Options -->
			<div class="form-control mb-4">
				<label class="label cursor-pointer justify-start gap-2" for="notifyOnMatch">
					<input
						id="notifyOnMatch"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={notifyOnMatch}
					/>
					<span class="label-text">Notify on matching tasks</span>
				</label>
			</div>

			<div class="form-control mb-4">
				<label class="label cursor-pointer justify-start gap-2" for="isActive">
					<input
						id="isActive"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={isActive}
					/>
					<span class="label-text">Active search</span>
				</label>
				<label class="label" for="isActive">
					<span class="label-text-alt whitespace-normal">Inactive searches won't appear in your dashboard</span>
				</label>
			</div>

			{#if notifyOnMatch}
				<div class="form-control mb-4">
					<label class="label" for="notificationFrequency">
						<span class="label-text">Notification Frequency</span>
					</label>
					<select class="select select-bordered w-full" bind:value={notificationFrequency}>
						<option value="immediate">Immediate</option>
						<option value="daily">Daily Digest</option>
						<option value="weekly">Weekly Digest</option>
					</select>
					<label class="label" for="notificationFrequency">
						<span class="label-text-alt whitespace-normal"
							>How often you'll receive notifications about new matching tasks</span
						>
					</label>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="modal-action">
				<button class="btn" onclick={closeModal}>Cancel</button>
				<button class="btn btn-primary" onclick={saveSearch} disabled={isSaving}>
					{#if isSaving}
						<div class="loading loading-spinner loading-xs"></div>
						Saving...
					{:else}
						Save
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
