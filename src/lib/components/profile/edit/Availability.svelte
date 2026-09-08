<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { publishProfileMetadata } from '$lib/nostr/profile';
	import { appStore } from '$lib/stores/app.store';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {}
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
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

	function toggleDay(day: string): void {
		if (availableDays.has(day)) availableDays.delete(day);
		else availableDays.add(day);
		onComplete(availableDays.size > 0, false);
	}

	async function handleSubmit(): Promise<void> {
		isSaving = true;
		errorMessage = '';
		try {
			// Persist availability as profile metadata — an array of available day keys.
			await publishProfileMetadata({ availability: [...availableDays] } as never, {});
			appStore.showSuccessToast($t('profile.page.sections.availability'));
			onComplete(availableDays.size > 0, true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to save availability';
			appStore.showErrorToast(errorMessage);
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="availability-form"
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
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

		<button
			type="submit"
			class="btn btn-primary"
			disabled={isSaving}
			data-testid="save-availability"
		>
			{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$t('common.save', { default: 'Save' })}
		</button>
	</div>
</form>
