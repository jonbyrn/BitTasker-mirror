<script lang="ts">
	import type { SearchTasksParams, SavedSearch, Category } from '$lib/types/task';
	import { NotificationFrequency } from '$lib/utils/enums/task.enum';
	import { saveSearch, updateSavedSearch } from '$lib/nostr/savedSearch';
	import { t } from 'svelte-i18n';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';

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

	// Helper function to get translated category name by ID
	function getCategoryName(categoryId: string): string {
		const category = TASK_CATEGORIES.find(cat => cat.id === categoryId);
		if (!category) return categoryId;
		
		// Use translation with slug, fallback to name if translation not available
		const translatedName = $t(`categories.${category.slug}.name`);
		return translatedName.startsWith('categories.') ? category.name : translatedName;
	}
	
	// Helper function to get translated task type
	function getTaskTypeName(taskType: string | undefined): string {
		if (!taskType) return '';
		
		if (taskType === 'REMOTE') {
			return $t('find_tasks.remote');
		} else if (taskType === 'IN_PERSON') {
			return $t('find_tasks.in_person');
		}
		return taskType;
	}
	
	// Helper function to get translated budget tier
	function getBudgetTierName(tier: string | undefined): string {
		if (!tier) return '';
		
		const translatedTier = $t(`profile_task.budget_tiers.${tier}`);
		// If translation key is returned (translation not found), return original tier
		return translatedTier.startsWith('profile_task.budget_tiers.') ? tier : translatedTier;
	}

	// State
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let searchName = $state('');
	let notifyOnMatch = $state(true);
	// let isActive = $state(true); // Commented out - may be needed later
	let notificationFrequency = $state<NotificationFrequency>(NotificationFrequency.INSTANT);

	// Computed
	let isUpdateMode = $derived(!!existingSavedSearch);
	let modalTitle = $derived(
		isUpdateMode ? $t('profile_task.form.title_update') : $t('profile_task.form.title_create')
	);
	let submitButtonText = $derived(
		isUpdateMode ? $t('profile_task.form.submit_update') : $t('profile_task.form.submit_create')
	);

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

	// Initialize form when modal opens
	$effect(() => {
		if (isOpen) {
			error = null;

			if (existingSavedSearch) {
				// Update mode - populate with existing data
				searchName = existingSavedSearch.name;
				notifyOnMatch = existingSavedSearch.notifyOnMatch ?? true;
				notificationFrequency = NotificationFrequency.INSTANT;
			} else {
				// Create mode - use search query or empty
				searchName = searchParams.search || '';
				notifyOnMatch = true;
				notificationFrequency = NotificationFrequency.INSTANT;
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
			error = 'profile_task.form.errors.name_required';
			return;
		}

		try {
			isSaving = true;
			error = null;

			// Prepare search params with search name
			const cleanParams: SearchTasksParams = { ...searchParams };
			if (searchName.trim()) {
				cleanParams.search = searchName.trim();
			}

			if (isUpdateMode && existingSavedSearch) {
				// Update existing search - merge params
				const updatedParams: SearchTasksParams = {
					...existingSavedSearch.params,
					...cleanParams
				};
				
				// Clean up undefined values - save ALL filter parameters
				const finalParams: SearchTasksParams = {};
				if (updatedParams.search) finalParams.search = updatedParams.search;
				if (updatedParams.taskType) finalParams.taskType = updatedParams.taskType;
				if (updatedParams.location) finalParams.location = updatedParams.location;
				if (updatedParams.status && updatedParams.status.length > 0) finalParams.status = updatedParams.status;
				if (updatedParams.categories && updatedParams.categories.length > 0) finalParams.categories = updatedParams.categories;
				if (updatedParams.skills && updatedParams.skills.length > 0) finalParams.skills = updatedParams.skills;
				// Save budget if it has any values
				if (updatedParams.budget && (
					updatedParams.budget.tier || 
					updatedParams.budget.currency || 
					updatedParams.budget.type
				)) {
					finalParams.budget = updatedParams.budget;
				}
				if (updatedParams.deadline) finalParams.deadline = updatedParams.deadline;
				if (updatedParams.dateRange) finalParams.dateRange = updatedParams.dateRange;
				if (updatedParams.radius) finalParams.radius = updatedParams.radius;
				if (updatedParams.locationCoords) finalParams.locationCoords = updatedParams.locationCoords;
				
				await updateSavedSearch(existingSavedSearch.id, {
					name: searchName,
					params: finalParams,
					notifyOnMatch,
					isActive: true,
					notificationFrequency
				});
			} else {
				// Create new search - save ALL filter parameters
				const finalParams: SearchTasksParams = {};
				if (cleanParams.search) finalParams.search = cleanParams.search;
				if (cleanParams.taskType) finalParams.taskType = cleanParams.taskType;
				if (cleanParams.location) finalParams.location = cleanParams.location;
				if (cleanParams.status && cleanParams.status.length > 0) finalParams.status = cleanParams.status;
				if (cleanParams.categories && cleanParams.categories.length > 0) finalParams.categories = cleanParams.categories;
				if (cleanParams.skills && cleanParams.skills.length > 0) finalParams.skills = cleanParams.skills;
				// Save budget if it has any values
				if (cleanParams.budget && (
					cleanParams.budget.tier || 
					cleanParams.budget.currency || 
					cleanParams.budget.type
				)) {
					finalParams.budget = cleanParams.budget;
				}
				if (cleanParams.deadline) finalParams.deadline = cleanParams.deadline;
				if (cleanParams.dateRange) finalParams.dateRange = cleanParams.dateRange;
				if (cleanParams.radius) finalParams.radius = cleanParams.radius;
				if (cleanParams.locationCoords) finalParams.locationCoords = cleanParams.locationCoords;

				await saveSearch(searchName, finalParams, {
					notifyOnMatch,
					isActive: true,
					notificationFrequency
				});
			}

			closeModal();
			onSaved?.();
		} catch (err) {
			console.error('Error saving search:', err);
			error = 'profile_task.form.errors.save_failed';
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
				</div>
			{/if}

			<!-- Search Parameters Summary (show categories and skills as badges) -->
			{#if (searchParams.categories && searchParams.categories.length > 0) || (searchParams.skills && searchParams.skills.length > 0) || searchParams.taskType || searchParams.location || searchParams.budget?.tier}
				<div class="mb-4">
					<div class="flex flex-wrap gap-2">
						{#if searchParams.categories && searchParams.categories.length > 0}
							{#each searchParams.categories as category}
								{@const categoryId = typeof category === 'string' ? category : (category as any).id}
								{@const categoryName = getCategoryName(categoryId)}
								<div class="badge badge-primary badge-sm">{categoryName}</div>
							{/each}
						{/if}

						{#if searchParams.skills && searchParams.skills.length > 0}
							{#each searchParams.skills as skill}
								<div class="badge badge-secondary badge-sm">{skill}</div>
							{/each}
						{/if}

						{#if searchParams.taskType}
							<div class="badge badge-accent badge-sm">{getTaskTypeName(searchParams.taskType)}</div>
						{/if}

						{#if searchParams.location}
							<div class="badge badge-info badge-sm">{searchParams.location}</div>
						{/if}

						{#if searchParams.budget?.tier}
							<div class="badge badge-success badge-sm">
								{$t('profile_task.budget_tier_label')}: {getBudgetTierName(searchParams.budget.tier)}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Save Search Form -->
			<div class="form-control mb-4">
				<label class="label" for="searchName">
					<span class="label-text">{$t('profile_task.form.search_name_label')}</span>
				</label>
				<input
					type="text"
					class="input input-bordered w-full"
					placeholder={$t('profile_task.form.search_name_placeholder')}
					bind:value={searchName}
					disabled={isSaving}
				/>
			</div>

			<!-- Notification Settings -->
			<div class="form-control mb-4">
				<label
					class="label flex cursor-pointer justify-start gap-2 whitespace-normal"
					for="notifyOnMatch"
				>
					<input
						id="notifyOnMatch"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={notifyOnMatch}
						disabled={isSaving}
					/>
					<span>{$t('profile_task.form.notify_on_match')}</span>
				</label>
			</div>

			<!-- Búsqueda activa - comentado por si lo necesitamos más adelante -->
			<!-- <div class="form-control mb-4">
				<label class="label flex cursor-pointer justify-start gap-2" for="isActive">
					<input
						id="isActive"
						type="checkbox"
						class="checkbox checkbox-primary"
						bind:checked={isActive}
						disabled={isSaving}
					/>
					<span>{$t('profile_task.form.active_label')}</span>
				</label>
				<label class="label" for="isActive">
					<span class="label-text-alt text-xs">
						{$t('profile_task.form.inactive_hint')}
					</span>
				</label>
			</div> -->

			<!-- Info alert about filters -->
			<div class="alert alert-outline alert-info mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					class="h-6 w-6 shrink-0 stroke-current"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path>
				</svg>
				<span>{$t('profile_task.form.filters_info') || 'Si quieres agregar más parámetros de búsqueda, puedes buscarlos en la opción de filtros.'}</span>
			</div>

			<!-- Action Buttons -->
			<div class="modal-action">
				<button class="btn" onclick={closeModal} disabled={isSaving}
					>{$t('profile_task.form.cancel')}</button
				>
				<button
					class="btn btn-primary"
					onclick={handleSubmit}
					disabled={isSaving || !searchName.trim()}
				>
					{#if isSaving}
						<span class="loading loading-spinner loading-sm"></span>
						{$t('profile_task.form.saving')}
					{:else}
						{submitButtonText}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
