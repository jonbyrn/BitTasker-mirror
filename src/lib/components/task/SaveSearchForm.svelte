<script lang="ts">
	import type { SearchTasksParams, SavedSearch } from '$lib/types/task';
	import { NotificationFrequency } from '$lib/utils/enums/task.enum';
	import { saveSearch, updateSavedSearch } from '$lib/nostr/savedSearch';
	import Input from '$lib/components/Input.svelte';

	// Props
	let { 
		isOpen = false,
		searchParams,
		existingSavedSearch = null,
		onClose,
		onSaved
	} = $props<{
		isOpen: boolean;
		searchParams: Partial<SearchTasksParams>;
		existingSavedSearch?: SavedSearch | null;
		onClose: () => void;
		onSaved?: () => void;
	}>();

	const notificationFrequencyOptions = [
		{ label: 'Immediate', value: NotificationFrequency.INSTANT },
		{ label: 'Daily Digest', value: NotificationFrequency.DAILY },
		{ label: 'Weekly Digest', value: NotificationFrequency.WEEKLY }
	];

	// State
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let searchName = $state('');
	let notifyOnMatch = $state(true);
	let isActive = $state(true);
	let notificationFrequency = $state<NotificationFrequency>(NotificationFrequency.DAILY);

	// Computed
	let isUpdateMode = $derived(!!existingSavedSearch);
	let modalTitle = $derived(isUpdateMode ? 'Update Saved Search' : 'Save Search');
	let submitButtonText = $derived(isUpdateMode ? 'Update Search' : 'Save Search');

	// Has active search parameters
	let hasActiveParams = $state(false);
	$effect(() => {
		// Check if there are any meaningful search parameters set
		hasActiveParams =
			!!searchParams.search ||
			!!searchParams.taskType ||
			!!searchParams.location ||
			(searchParams.status && searchParams.status.length > 0) ||
			(searchParams.categories && searchParams.categories.length > 0) ||
			(searchParams.skills && searchParams.skills.length > 0) ||
			!!searchParams.budget?.tier ||
			!!searchParams.budget?.currency ||
			!!searchParams.budget?.type;
	});

	// Initialize form with existing data when in update mode or generate default name
	$effect(() => {
		if (isOpen) {
			error = null;
			
			if (existingSavedSearch) {
				// Update mode - populate with existing data
				searchName = existingSavedSearch.name;
				notifyOnMatch = existingSavedSearch.notifyOnMatch ?? true;
				isActive = existingSavedSearch.isActive ?? true;
				notificationFrequency = existingSavedSearch.notificationFrequency as NotificationFrequency || NotificationFrequency.DAILY;
			} else {
				// Create mode - generate default name and reset form
				let defaultName = '';
				if (searchParams.search) {
					defaultName = `${searchParams.search}`;
				} else if (searchParams.taskType) {
					defaultName = `${searchParams.taskType} tasks`;
				} else if (searchParams.location) {
					defaultName = `Tasks near ${searchParams.location}`;
				} else if (searchParams.categories && searchParams.categories.length > 0) {
					defaultName = `${searchParams.categories[0]} tasks`;
				} else {
					defaultName = 'My Search';
				}

				searchName = defaultName;
				notifyOnMatch = true;
				isActive = true;
				notificationFrequency = NotificationFrequency.DAILY;
			}
		}
	});

	// Close modal
	function closeModal() {
		onClose();
	}

	// Save or update search
	async function handleSubmit() {
		if (!searchName.trim()) {
			error = 'Please enter a name for your search.';
			return;
		}

		try {
			isSaving = true;
			error = null;

			if (isUpdateMode && existingSavedSearch) {
				// Update existing search
				await updateSavedSearch(existingSavedSearch.id, {
					name: searchName,
					notifyOnMatch,
					isActive,
					notificationFrequency
				});
			} else {
				// Create new search
				// Clean up the search params - remove undefined values
				const cleanParams: SearchTasksParams = {};

				// Copy defined properties
				if (searchParams.search) cleanParams.search = searchParams.search;
				if (searchParams.taskType) cleanParams.taskType = searchParams.taskType;
				if (searchParams.location) cleanParams.location = searchParams.location;
				if (searchParams.status) cleanParams.status = searchParams.status;
				if (searchParams.categories) cleanParams.categories = searchParams.categories;
				if (searchParams.skills) cleanParams.skills = searchParams.skills;
				if (searchParams.budget) cleanParams.budget = searchParams.budget;
				if (searchParams.deadline) cleanParams.deadline = searchParams.deadline;
				if (searchParams.dateRange) cleanParams.dateRange = searchParams.dateRange;
				if (searchParams.radius) cleanParams.radius = searchParams.radius;
				if (searchParams.page) cleanParams.page = searchParams.page;
				if (searchParams.limit) cleanParams.limit = searchParams.limit;

				// Save new search
				await saveSearch(searchName, cleanParams, {
					notifyOnMatch,
					isActive,
					notificationFrequency
				});
			}

			closeModal();
			onSaved?.();
		} catch (err) {
			console.error('Error saving search:', err);
			error = 'Failed to save search. Please try again.';
		} finally {
			isSaving = false;
		}
	}
</script>

<!-- Save Search Modal -->
{#if isOpen}
	<div class="bg-opacity-50 fixed inset-0 z-40 flex items-center justify-center bg-black/50">
		<div class="bg-base-100 w-[95%] max-w-md rounded-lg p-6">
			<h3 class="mb-4 text-lg font-bold">{modalTitle}</h3>

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

			<!-- Search Parameters Summary (only show in create mode) -->
			{#if !isUpdateMode}
				<div class="bg-base-200 mb-4 rounded-md p-3">
					<h4 class="mb-2 font-medium">Search Criteria:</h4>
					<div class="mb-2 flex flex-wrap gap-1">
						{#if searchParams.search}
							<div class="badge badge-sm">{searchParams.search}</div>
						{/if}

						{#if searchParams.taskType}
							<div class="badge badge-sm">{searchParams.taskType}</div>
						{/if}

						{#if searchParams.location}
							<div class="badge badge-sm">{searchParams.location}</div>
						{/if}

						{#if searchParams.categories && searchParams.categories.length > 0}
							<div class="badge badge-sm">{searchParams.categories.join(', ')}</div>
						{/if}

						{#if searchParams.skills && searchParams.skills.length > 0}
							<div class="badge badge-sm">{searchParams.skills.join(', ')}</div>
						{/if}

						{#if searchParams.budget?.tier}
							<div class="badge badge-sm">
								Budget tier: {searchParams.budget.tier}
							</div>
						{/if}
					</div>
				</div>
			{/if}

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
					disabled={isSaving}
				/>
			</div>

			<!-- Notification Settings -->
			<div class="form-control mb-4">
				<label class="label flex cursor-pointer justify-start gap-2 whitespace-normal" for="notifyOnMatch">
					<input
						id="notifyOnMatch"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={notifyOnMatch}
						disabled={isSaving}
					/>
					<span>Notify me when new matching tasks are posted</span>
				</label>
			</div>

			<div class="form-control mb-4">
				<label class="label flex cursor-pointer justify-start gap-2" for="isActive">
					<input
						id="isActive"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={isActive}
						disabled={isSaving}
					/>
					<span>Active search</span>
				</label>
				<label class="label" for="isActive">
					<span class="label-text-alt text-xs">
						Inactive searches won't appear in your dashboard
					</span>
				</label>
			</div>

			{#if notifyOnMatch}
				<div class="form-control mb-4">
					<label class="label" for="notificationFrequency">
						<span class="label-text">Notification Frequency</span>
					</label>
					<Input
						type="select"
						value={notificationFrequencyOptions.find(
							(option) => option.value === notificationFrequency
						)?.label ?? ''}
						placeholder="Select frequency"
						options={notificationFrequencyOptions}
						onChange={({ value }) => (notificationFrequency = value as NotificationFrequency)}
					/>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="modal-action">
				<button class="btn" onclick={closeModal} disabled={isSaving}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={handleSubmit}
					disabled={isSaving || !searchName.trim()}
				>
					{#if isSaving}
						<span class="loading loading-spinner loading-sm"></span>
						Saving...
					{:else}
						{submitButtonText}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
