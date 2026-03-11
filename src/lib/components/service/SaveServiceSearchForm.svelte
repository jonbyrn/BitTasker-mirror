<script lang="ts">
	import type { SearchServicesParams, SavedServiceSearch } from '$lib/types/service.d';
	import { saveServiceSearch, updateSavedServiceSearch } from '$lib/nostr/savedServiceSearch';
	import { t } from 'svelte-i18n';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import Modal from '$lib/components/Modal.svelte';

	let {
		isOpen = false,
		searchParams,
		existingSavedSearch = null,
		onClose,
		onSaved
	} = $props<{
		isOpen: boolean;
		searchParams: Partial<SearchServicesParams>;
		existingSavedSearch?: SavedServiceSearch | null;
		onClose: () => void;
		onSaved?: () => void;
	}>();

	function getCategoryName(categoryId: string): string {
		const category = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
		if (!category) return categoryId;
		const translatedName = $t(`categories.${category.slug}.name`);
		return translatedName.startsWith('categories.') ? category.name : translatedName;
	}

	function getPricingTypeName(pricingType: ServicePricingTypeEnum | undefined): string {
		if (!pricingType) return '';
		const slug =
			pricingType === ServicePricingTypeEnum.INQUIRY_REQUIRED ? 'inquiry_required' : pricingType.toLowerCase();
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

	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let searchName = $state('');
	let notifyOnMatch = $state(true);
	let isActive = $state(true);
	let notificationFrequency = $state<string>('WEEKLY');

	let isUpdateMode = $derived(!!existingSavedSearch);
	let modalTitle = $derived(
		isUpdateMode ? $t('profile_task.form.title_update') : $t('profile_task.form.title_create')
	);
	let submitButtonText = $derived(
		isUpdateMode ? $t('profile_task.form.submit_update') : $t('profile_task.form.submit_create')
	);

	$effect(() => {
		if (isOpen) {
			error = null;
			if (existingSavedSearch) {
				searchName = existingSavedSearch.name;
				notifyOnMatch = existingSavedSearch.notifyOnMatch ?? true;
				isActive = existingSavedSearch.isActive ?? true;
				notificationFrequency = existingSavedSearch.notificationFrequency ?? 'WEEKLY';
			} else {
				searchName = searchParams.search ?? '';
				notifyOnMatch = true;
				isActive = true;
				notificationFrequency = 'WEEKLY';
			}
		}
	});

	function closeModal() {
		onClose();
	}

	function cleanSearchParams(params: Partial<SearchServicesParams>): SearchServicesParams {
		const cleaned: SearchServicesParams = {};
		if (params.search) cleaned.search = params.search;
		if (params.categories && params.categories.length > 0) cleaned.categories = params.categories;
		if (params.skills && params.skills.length > 0) cleaned.skills = params.skills;
		if (params.serviceLocationTypes && params.serviceLocationTypes.length > 0) {
			cleaned.serviceLocationTypes = params.serviceLocationTypes;
		}
		if (params.pricingType) cleaned.pricingType = params.pricingType;
		if (params.minPrice !== undefined) cleaned.minPrice = params.minPrice;
		if (params.maxPrice !== undefined) cleaned.maxPrice = params.maxPrice;
		if (params.deliveryTime !== undefined) cleaned.deliveryTime = params.deliveryTime;
		if (params.location) cleaned.location = params.location;
		if (params.radius !== undefined) cleaned.radius = params.radius;
		if (params.status && params.status.length > 0) cleaned.status = params.status;
		return cleaned;
	}

	async function handleSubmit() {
		if (!searchName.trim()) {
			error = 'profile_task.form.errors.name_required';
			return;
		}
		try {
			isSaving = true;
			error = null;
			const paramsToSave =
				isUpdateMode && existingSavedSearch
					? { ...existingSavedSearch.params, ...searchParams }
					: searchParams;
			const cleanParams = cleanSearchParams(paramsToSave);
			if (searchName.trim()) cleanParams.search = searchName.trim();

			if (isUpdateMode && existingSavedSearch) {
				await updateSavedServiceSearch(existingSavedSearch.id, {
					name: searchName,
					params: cleanParams,
					notifyOnMatch,
					isActive,
					notificationFrequency
				});
			} else {
				await saveServiceSearch(searchName, cleanParams, {
					notifyOnMatch,
					isActive,
					notificationFrequency
				});
			}
			closeModal();
			onSaved?.();
		} catch (err) {
			console.error('Error saving service search:', err);
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

		{#if isUpdateMode}
			<div class="mb-4">
				<div class="flex flex-wrap gap-2">
					{#if searchParams.categories && searchParams.categories.length > 0}
						{#each searchParams.categories as category}
							{@const categoryId = typeof category === 'string' ? category : (category as { id: string }).id}
							<div class="badge badge-primary badge-sm">{getCategoryName(categoryId)}</div>
						{/each}
					{/if}
					{#if searchParams.skills && searchParams.skills.length > 0}
						{#each searchParams.skills as skill}
							<div class="badge badge-secondary badge-sm">{skill}</div>
						{/each}
					{/if}
					{#if searchParams.serviceLocationTypes && searchParams.serviceLocationTypes.length > 0}
						{#each searchParams.serviceLocationTypes as loc}
							<div class="badge badge-accent badge-sm">{getLocationTypeName(loc)}</div>
						{/each}
					{/if}
					{#if searchParams.pricingType}
						<div class="badge badge-info badge-sm">{getPricingTypeName(searchParams.pricingType)}</div>
					{/if}
					{#if searchParams.minPrice !== undefined || searchParams.maxPrice !== undefined}
						<div class="badge badge-success badge-sm">
							{$t('dashboard.services.browse.filters.price_range')}:
							{#if searchParams.minPrice !== undefined}{'$' + searchParams.minPrice}{/if}
							{#if searchParams.minPrice !== undefined && searchParams.maxPrice !== undefined} - {/if}
							{#if searchParams.maxPrice !== undefined}{'$' + searchParams.maxPrice}{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<div class="form-control mb-4">
			<label class="label" for="searchName">
				<span class="label-text">{$t('profile_task.form.search_name_label')}</span>
			</label>
			<input
				type="text"
				id="searchName"
				class="input input-bordered w-full"
				placeholder={$t('profile_task.form.search_name_placeholder')}
				bind:value={searchName}
				disabled={isSaving}
			/>
		</div>

		<div class="form-control mb-4">
			<label class="label flex cursor-pointer justify-start gap-2 whitespace-normal" for="notifyOnMatch">
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
					<option value="INSTANT">{$t('profile_task.notification_frequency.immediate')}</option>
					<option value="DAILY">{$t('profile_task.notification_frequency.daily')}</option>
					<option value="WEEKLY">{$t('profile_task.notification_frequency.weekly')}</option>
				</select>
			</div>
		{/if}

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
				<span class="label-text-alt text-xs">{$t('profile_task.form.inactive_hint')}</span>
			</label>
		</div>

		<div class="alert alert-outline alert-info rounded-2xl">
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
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9  0 0118 0z"
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
