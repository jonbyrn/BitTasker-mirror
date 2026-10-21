<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { user } from '$lib/stores/user.store';
	import {
		publishMergedProfile,
		sectionFailed,
		sectionSaved,
		type SectionSaveResult
	} from './section-save';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {},
		showSave = true
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
		showSave?: boolean;
	} = $props();

	const dayKeys = [
		'monday',
		'tuesday',
		'wednesday',
		'thursday',
		'friday',
		'saturday',
		'sunday'
	] as const;

	let availableDays = new SvelteSet<string>();
	let isSaving = $state(false);
	let errorMessage = $state('');
	let daysDirty = $state(false);

	function toggleDay(day: string): void {
		daysDirty = true;
		if (availableDays.has(day)) availableDays.delete(day);
		else availableDays.add(day);
		onComplete(availableDays.size > 0, false);
	}

	export async function save(): Promise<SectionSaveResult> {
		if (!daysDirty) return sectionSaved();
		isSaving = true;
		errorMessage = '';
		try {
			const npub = $user?.npub;
			if (!npub) throw new Error('No public key found');
			// Keep the existing kind-0 fields. An empty record here used to erase the display name.
			await publishMergedProfile(npub, { availability: [...availableDays] } as never);
			daysDirty = false;
			appStore.showSuccessToast($t('profile.page.sections.availability'));
			onComplete(availableDays.size > 0, true);
			return sectionSaved();
		} catch (error) {
			const failed = sectionFailed(error, 'Failed to save availability');
			errorMessage = failed.error;
			appStore.showErrorToast(errorMessage);
			return failed;
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="availability-form"
	onsubmit={(e) => {
		e.preventDefault();
		void save();
	}}
>
	<div class="space-y-3">
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="availability-days">
			{#each dayKeys as day (day)}
				<label class="label cursor-pointer justify-start gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={availableDays.has(day)}
						onchange={() => toggleDay(day)}
						data-testid={`day-${day}`}
					/>
					<span class="label-text capitalize">{$t(`common.days.${day}`, { default: day })}</span>
				</label>
			{/each}
		</div>

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
		{/if}

		{#if showSave}
			<button
				type="submit"
				class="btn btn-primary"
				disabled={isSaving}
				data-testid="save-availability"
			>
				{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$t('common.save', { default: 'Save' })}
			</button>
		{/if}
	</div>
</form>
