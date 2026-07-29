<script lang="ts">
	import type { SearchTasksParams, SavedSearch } from '$lib/types/task';
	import { NotificationFrequency } from '$lib/utils/enums/task.enum';
	import { saveSearch, updateSavedSearch } from '$lib/nostr/savedSearch';
	import { t } from 'svelte-i18n';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import Drawer from '$lib/components/Drawer.svelte';
	import IconTagOutline from '~icons/mdi/tag-outline';
	import IconWrenchOutline from '~icons/mdi/wrench-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconCash from '~icons/mdi/cash';

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
		const category = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
		if (!category) return categoryId;

		// Use translation with slug, fallback to name if translation not available
		const translatedName = $t(`categories.${category.slug}.name`);
		return translatedName.startsWith('categories.') ? category.name : translatedName;
	}

	function toProperCase(text: string): string {
		return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
	}

	// Helper function to get translated task type
	function getTaskTypeName(taskType: string | undefined): string {
		if (!taskType) return '';

		if (taskType === 'REMOTE') {
			return $t('find_tasks.remote');
		} else if (taskType === 'IN_PERSON') {
			return $t('find_tasks.in_person');
		}
		return toProperCase(taskType);
	}

	// Helper function to get translated budget tier
	function getBudgetTierName(tier: string | undefined): string {
		if (!tier) return '';

		const translatedTier = $t(`profile_task.budget_tiers.${tier}`);
		return translatedTier.startsWith('profile_task.budget_tiers.')
			? toProperCase(tier)
			: translatedTier;
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
	let notificationFrequency = $state<NotificationFrequency>(NotificationFrequency.INSTANT);

	// Computed
	let isUpdateMode = $derived(!!existingSavedSearch);
	let modalTitle = $derived(
		isUpdateMode ? $t('profile_task.form.title_update') : $t('profile_task.form.title_create')
	);
	let submitButtonText = $derived(
		isUpdateMode ? $t('profile_task.form.submit_update') : $t('profile_task.form.submit_create')
	);

	// Has visible filter parameters (ones shown with icons)
	let hasVisibleFilters = $derived(
		(searchParams.categories && searchParams.categories.length > 0) ||
			(searchParams.skills && searchParams.skills.length > 0) ||
			!!searchParams.taskType ||
			!!searchParams.location ||
			!!searchParams.budget?.tier
	);

	// Initialize form when modal opens
	$effect(() => {
		if (isOpen) {
			error = null;

			if (existingSavedSearch) {
				// Update mode - populate with existing data
				searchName = existingSavedSearch.name;
				notifyOnMatch = existingSavedSearch.notifyOnMatch ?? true;
				// Use saved frequency or default to instant
				const savedFrequency = existingSavedSearch.notificationFrequency;
				if (
					savedFrequency &&
					Object.values(NotificationFrequency).includes(savedFrequency as NotificationFrequency)
				) {
					notificationFrequency = savedFrequency as NotificationFrequency;
				} else {
					notificationFrequency = NotificationFrequency.INSTANT;
				}
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
		if (params.budget && (params.budget.tier || params.budget.currency || params.budget.type)) {
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
			const paramsToSave =
				isUpdateMode && existingSavedSearch
					? { ...existingSavedSearch.params, ...searchParams }
					: searchParams;

			// Clean up undefined values - save ALL filter parameters
			const cleanParams = cleanSearchParams(paramsToSave);

			if (isUpdateMode && existingSavedSearch) {
				await updateSavedSearch(existingSavedSearch.id, {
					name: searchName,
					params: cleanParams,
					notifyOnMatch,
					isActive: true,
					notificationFrequency
				});
			} else {
				await saveSearch(searchName, cleanParams, {
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

<Drawer {isOpen} title={modalTitle} onClose={closeModal} position="right" isScrollable={true}>
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

	<!-- Search Parameters Summary -->
	{#if hasVisibleFilters}
		<div class="mb-4 flex flex-col gap-1.5">
			{#if searchParams.categories && searchParams.categories.length > 0}
				<div class="flex items-center gap-2">
					<IconTagOutline class="text-primary h-8 w-8 shrink-0" />
					<span class="line-clamp-1 text-sm">
						{searchParams.categories
							.map((c: string | { id: string }) =>
								getCategoryName(typeof c === 'string' ? c : c.id)
							)
							.join(', ')}
					</span>
				</div>
			{/if}
			{#if searchParams.skills && searchParams.skills.length > 0}
				<div class="flex items-center gap-2">
					<IconWrenchOutline class="text-primary h-8 w-8 shrink-0" />
					<span class="line-clamp-1 text-sm capitalize">{searchParams.skills.join(', ')}</span>
				</div>
			{/if}
			{#if searchParams.taskType}
				<div class="flex items-center gap-2">
					<IconBriefcaseOutline class="text-primary h-8 w-8 shrink-0" />
					<span class="text-sm">{getTaskTypeName(searchParams.taskType)}</span>
				</div>
			{/if}
			{#if searchParams.location}
				<div class="flex items-center gap-2">
					<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
					<span class="line-clamp-1 text-sm capitalize">{searchParams.location}</span>
				</div>
			{/if}
			{#if searchParams.budget?.tier}
				<div class="flex items-center gap-2">
					<IconCash class="text-primary h-8 w-8 shrink-0" />
					<span class="text-sm"
						>{$t('profile_task.budget_tier_label')}: {getBudgetTierName(
							searchParams.budget.tier
						)}</span
					>
				</div>
			{/if}
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
					{$t(
						`profile_task.notification_frequency.${getFrequencyTranslationKey(NotificationFrequency.INSTANT)}`
					)}
				</option>
				<option value={NotificationFrequency.DAILY}>
					{$t(
						`profile_task.notification_frequency.${getFrequencyTranslationKey(NotificationFrequency.DAILY)}`
					)}
				</option>
				<option value={NotificationFrequency.WEEKLY}>
					{$t(
						`profile_task.notification_frequency.${getFrequencyTranslationKey(NotificationFrequency.WEEKLY)}`
					)}
				</option>
			</select>
		</div>
	{/if}

	{#snippet footer()}
		<div class="flex justify-end gap-2">
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
	{/snippet}
</Drawer>
