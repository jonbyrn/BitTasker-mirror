<script lang="ts">
	import type { SearchTasksParams, SavedSearch, Category } from '$lib/types/task';
	import { NotificationFrequency } from '$lib/utils/enums/task.enum';
	import { saveSearch, updateSavedSearch } from '$lib/nostr/savedSearch';
	import { t } from 'svelte-i18n';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import Modal from '$lib/components/Modal.svelte';

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

	// Helper function to get translation key for notification frequency
	function getFrequencyTranslationKey(frequency: NotificationFrequency): string {
		// INSTANT maps to "immediate" in translations
		if (frequency === NotificationFrequency.INSTANT) {
			return 'immediate';
		}
		// DAILY and WEEKLY map directly
		return frequency.toLowerCase();
	}

	// State
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let searchName = $state('');
	let notifyOnMatch = $state(true);
	let isActive = $state(true);
	let notificationFrequency = $state<NotificationFrequency>(NotificationFrequency.WEEKLY);

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
				isActive = existingSavedSearch.isActive ?? true;
				// Use saved frequency or default to WEEKLY
				const savedFrequency = existingSavedSearch.notificationFrequency;
				if (savedFrequency && Object.values(NotificationFrequency).includes(savedFrequency as NotificationFrequency)) {
					notificationFrequency = savedFrequency as NotificationFrequency;
				} else {
					notificationFrequency = NotificationFrequency.WEEKLY;
				}
			} else {
				// Create mode - use search query or empty
				searchName = searchParams.search || '';
				notifyOnMatch = true;
				isActive = true;
				notificationFrequency = NotificationFrequency.WEEKLY;
			}
		}
	});

	// Close modal
	function closeModal() {
		onClose();
	}

	// Helper function to clean and filter search parameters
	function cleanSearchParams(params: Partial<SearchTasksParams>): SearchTasksParams {
		const cleaned: SearchTasksParams = {};
		if (params.search) cleaned.search = params.search;
		if (params.taskType) cleaned.taskType = params.taskType;
		if (params.location) cleaned.location = params.location;
		if (params.status && params.status.length > 0) cleaned.status = params.status;
		if (params.categories && params.categories.length > 0) cleaned.categories = params.categories;
		if (params.skills && params.skills.length > 0) cleaned.skills = params.skills;
		// Save budget if it has any values
		if (params.budget && (
			params.budget.tier || 
			params.budget.currency || 
			params.budget.type
		)) {
			cleaned.budget = params.budget;
		}
		if (params.deadline) cleaned.deadline = params.deadline;
		if (params.dateRange) cleaned.dateRange = params.dateRange;
		if (params.radius) cleaned.radius = params.radius;
		if (params.locationCoords) cleaned.locationCoords = params.locationCoords;
		return cleaned;
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

			// Prepare search params - merge with existing if in update mode
			const paramsToSave = isUpdateMode && existingSavedSearch
				? { ...existingSavedSearch.params, ...searchParams }
				: searchParams;

			// Clean up undefined values - save ALL filter parameters
			const cleanParams = cleanSearchParams(paramsToSave);
			if (searchName.trim()) {
				cleanParams.search = searchName.trim();
			}

			if (isUpdateMode && existingSavedSearch) {
				await updateSavedSearch(existingSavedSearch.id, {
					name: searchName,
					params: cleanParams,
					notifyOnMatch,
					isActive,
					notificationFrequency
				});
			} else {
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
			error = 'profile_task.form.errors.save_failed';
		} finally {
			isSaving = false;
		}
	}
</script>

<Modal isOpen={isOpen} title={modalTitle} onClose={closeModal} size="md" isScrollable={true}>
	{#snippet children()}
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
			{#if isUpdateMode}
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

			<!-- Notification Frequency Select -->
			{#if notifyOnMatch}
				<div class="form-control mb-4">
					<label class="label" for="notificationFrequency">
						<span class="label-text">{$t('profile_task.form.notification_frequency_label')}</span>
					</label>
					<select
						id="notificationFrequency"
						class="select select-bordered w-full"
						bind:value={notificationFrequency}
						disabled={isSaving}
					>
						<option value={NotificationFrequency.INSTANT}>
							{$t(`profile_task.notification_frequency.${getFrequencyTranslationKey(NotificationFrequency.INSTANT)}`)}
						</option>
						<option value={NotificationFrequency.DAILY}>
							{$t(`profile_task.notification_frequency.${getFrequencyTranslationKey(NotificationFrequency.DAILY)}`)}
						</option>
					<option value={NotificationFrequency.WEEKLY}>
						{$t(`profile_task.notification_frequency.${getFrequencyTranslationKey(NotificationFrequency.WEEKLY)}`)}
					</option>
				</select>
				</div>
			{/if}

			<!-- Active Search Toggle -->
			<div class="form-control mb-4">
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
			</div>

			<!-- Info alert about filters -->
			<div class="alert alert-outline alert-info rounded-2xl ">
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
				<span>{$t('profile_task.form.filters_info')}</span>
			</div>

	{/snippet}

	{#snippet footer()}
		<button class="btn" onclick={closeModal} disabled={isSaving}>{$t('profile_task.form.cancel')}</button>
		<button class="btn btn-primary" onclick={handleSubmit} disabled={isSaving || !searchName.trim()}>
			{#if isSaving}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('profile_task.form.saving')}
			{:else}
				{submitButtonText}
			{/if}
		</button>
	{/snippet}
</Modal>
