<script lang="ts">
	import { sendSoonestAvailableRequest } from '$lib/utils/nostr-scheduling';
	import { t } from 'svelte-i18n';
	import DateInput from '$lib/components/date/DateInput.svelte';

	const props = $props<{
		bidId: string;
		taskId: string;
		taskeePubkey: string;
		taskerPubkey: string;
		onSuccess?: () => void;
		onCancel?: () => void;
		defaultExpiryMinutes?: number;
	}>();

	let preferredTimeRanges = $state<Array<{ start: Date | null; end: Date | null }>>([]);
	let expiryMinutes = $state(props.defaultExpiryMinutes || 15);
	let isSubmitting = $state(false);
	let errors = $state<Record<string, string>>({});

	function addPreferredRange() {
		preferredTimeRanges = [...preferredTimeRanges, { start: null, end: null }];
	}

	function removePreferredRange(index: number) {
		preferredTimeRanges = preferredTimeRanges.filter((_, i) => i !== index);
	}

	function validate(): boolean {
		errors = {};

		// Validate preferred ranges if any
		for (let i = 0; i < preferredTimeRanges.length; i++) {
			const range = preferredTimeRanges[i];
			if (range.start && range.end) {
				if (range.start >= range.end) {
					errors[`range_${i}`] = $t('scheduling.validation.end_after_start');
					return false;
				}
			} else if (range.start || range.end) {
				errors[`range_${i}`] = $t('scheduling.validation.both_times_required');
				return false;
			}
		}

		if (expiryMinutes < 1 || expiryMinutes > 1440) {
			errors.expiryMinutes = $t('scheduling.validation.expiry_range');
			return false;
		}

		return true;
	}

	async function handleSubmit() {
		if (!validate()) return;

		isSubmitting = true;
		try {
			const ranges = preferredTimeRanges
				.filter((r) => r.start && r.end)
				.map((r) => ({
					start: r.start!.getTime(),
					end: r.end!.getTime()
				}));

			await sendSoonestAvailableRequest(
				{
					requestId: crypto.randomUUID(),
					bidId: props.bidId,
					taskId: props.taskId,
					taskerPubkey: props.taskerPubkey,
					taskeePubkey: props.taskeePubkey,
					preferredTimeRanges: ranges.length > 0 ? ranges : undefined
				},
				expiryMinutes
			);

			if (props.onSuccess) {
				props.onSuccess();
			}
		} catch (error) {
			errors.general = error instanceof Error ? error.message : $t('scheduling.error.submit_failed');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<form class="space-y-4" onsubmit|preventDefault={handleSubmit}>
	<div class="alert alert-info alert-outline">
		<span>{$t('scheduling.soonest_available.description')}</span>
	</div>

	<!-- Preferred Time Ranges (optional) -->
	<div class="form-control">
		<label class="label">
			<span class="label-text">{$t('scheduling.preferred_times')}</span>
			<span class="label-text-alt">{$t('common.optional')}</span>
		</label>

		<div class="space-y-3">
			{#each preferredTimeRanges as range, index (index)}
				<div class="card bg-base-200 p-3">
					<div class="flex items-end gap-2">
						<div class="form-control flex-1">
							<label class="label">
								<span class="label-text text-xs">{$t('scheduling.start_time')}</span>
							</label>
							<DateInput bind:value={range.start} />
						</div>
						<div class="form-control flex-1">
							<label class="label">
								<span class="label-text text-xs">{$t('scheduling.end_time')}</span>
							</label>
							<DateInput bind:value={range.end} />
						</div>
						<button
							type="button"
							class="btn btn-error btn-sm"
							onclick={() => removePreferredRange(index)}
						>
							✕
						</button>
					</div>
					{#if errors[`range_${index}`]}
						<div class="label">
							<span class="label-text-alt text-error">{errors[`range_${index}`]}</span>
						</div>
					{/if}
				</div>
			{/each}

			<button type="button" class="btn btn-ghost btn-sm" onclick={addPreferredRange}>
				+ {$t('scheduling.add_preferred_range')}
			</button>
		</div>
	</div>

	<!-- Expiry -->
	<div class="form-control">
		<label class="label">
			<span class="label-text">{$t('scheduling.request_expiry')}</span>
			<span class="label-text-alt">{$t('scheduling.expiry_minutes')}</span>
		</label>
		<input
			type="number"
			class="input input-bordered"
			min="1"
			max="1440"
			bind:value={expiryMinutes}
		/>
		{#if errors.expiryMinutes}
			<div class="label">
				<span class="label-text-alt text-error">{errors.expiryMinutes}</span>
			</div>
		{/if}
	</div>

	<!-- Error message -->
	{#if errors.general}
		<div class="alert alert-error alert-outline">
			<span>{errors.general}</span>
		</div>
	{/if}

	<!-- Actions -->
	<div class="flex gap-2 justify-end">
		{#if props.onCancel}
			<button type="button" class="btn btn-ghost" onclick={props.onCancel} disabled={isSubmitting}>
				{$t('common.buttons.cancel')}
			</button>
		{/if}
		<button type="submit" class="btn btn-primary" disabled={isSubmitting}>
			{#if isSubmitting}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('common.buttons.submitting')}
			{:else}
				{$t('scheduling.request_soonest')}
			{/if}
		</button>
	</div>
</form>

