<script lang="ts">
	import { sendTimeSlotRequest } from '$lib/utils/nostr-scheduling';
	import { generateNonce } from '$lib/utils/scheduling-utils';
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

	let startDateTime = $state<Date | null>(null);
	let endDateTime = $state<Date | null>(null);
	let expiryMinutes = $state(props.defaultExpiryMinutes || 15);
	let isSubmitting = $state(false);
	let errors = $state<Record<string, string>>({});

	function validate(): boolean {
		errors = {};

		if (!startDateTime) {
			errors.startDateTime = $t('scheduling.validation.start_time_required');
			return false;
		}

		if (!endDateTime) {
			errors.endDateTime = $t('scheduling.validation.end_time_required');
			return false;
		}

		if (startDateTime >= endDateTime) {
			errors.endDateTime = $t('scheduling.validation.end_after_start');
			return false;
		}

		const now = Date.now();
		if (startDateTime.getTime() < now) {
			errors.startDateTime = $t('scheduling.validation.start_in_future');
			return false;
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
			await sendTimeSlotRequest(
				{
					requestId: crypto.randomUUID(),
					bidId: props.bidId,
					taskId: props.taskId,
					taskerPubkey: props.taskerPubkey,
					taskeePubkey: props.taskeePubkey,
					requestedStartTime: startDateTime!.getTime(),
					requestedEndTime: endDateTime!.getTime()
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
	<!-- Start Date/Time -->
	<div class="form-control">
		<label class="label">
			<span class="label-text">{$t('scheduling.start_time')}</span>
		</label>
		<DateInput bind:value={startDateTime} />
		{#if errors.startDateTime}
			<div class="label">
				<span class="label-text-alt text-error">{errors.startDateTime}</span>
			</div>
		{/if}
	</div>

	<!-- End Date/Time -->
	<div class="form-control">
		<label class="label">
			<span class="label-text">{$t('scheduling.end_time')}</span>
		</label>
		<DateInput bind:value={endDateTime} />
		{#if errors.endDateTime}
			<div class="label">
				<span class="label-text-alt text-error">{errors.endDateTime}</span>
			</div>
		{/if}
	</div>

	<!-- Expiry (optional) -->
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
				{$t('scheduling.send_request')}
			{/if}
		</button>
	</div>
</form>

