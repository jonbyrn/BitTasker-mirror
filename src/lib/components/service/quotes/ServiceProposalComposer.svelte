<script lang="ts">
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import { t } from 'svelte-i18n';
	import { hasRequiredTrimmedText } from '$lib/components/forms/FormValidationCore';
	import SchedulePeriodPicker from '$lib/components/date/SchedulePeriodPicker.svelte';
	import { toUnixSeconds } from '$lib/utils/helpers/dateFormatter';

	export interface ServiceProposalComposerSubmitPayload {
		description: string;
		amountUsdt: string;
		estimatedDuration: string;
		estimatedStartTime: number;
		estimatedEndTime: number;
		expirationDays: number;
		expirationHours: number;
		coverLetter?: string;
	}

	let {
		blockedReason = null,
		disabled = false,
		onSubmit
	}: {
		blockedReason?: string | null;
		disabled?: boolean;
		onSubmit: (
			payload: ServiceProposalComposerSubmitPayload
		) =>
			| Promise<{ success: boolean; error?: string } | void>
			| { success: boolean; error?: string }
			| void;
	} = $props();

	let description = $state('');
	let amountUsdt = $state('');
	let startDateTime = $state<Date | null>(null);
	let endDateTime = $state<Date | null>(null);
	let expirationDays = $state(3);
	let expirationHours = $state(0);
	let coverLetter = $state('');
	let errorMessage = $state<string | null>(null);
	let submitting = $state(false);
	const isPasskeyError = $derived.by(
		() => Boolean(errorMessage) && detectErrorType(errorMessage ?? '') === 'biometric'
	);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function resetForm() {
		description = '';
		amountUsdt = '';
		startDateTime = null;
		endDateTime = null;
		expirationDays = 3;
		expirationHours = 0;
		coverLetter = '';
		errorMessage = null;
	}

	function formatEstimatedDuration(startTime: number, endTime: number): string {
		const diffMs = endTime * 1000 - startTime * 1000;
		if (diffMs <= 0) return '';

		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
		const parts: string[] = [];

		if (diffDays > 0) {
			parts.push(`${diffDays} ${diffDays === 1 ? 'day' : 'days'}`);
		}
		if (diffHours > 0) {
			parts.push(`${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}`);
		}
		if (diffMinutes > 0) {
			parts.push(`${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'}`);
		}
		if (parts.length === 0) {
			return '1 hour';
		}
		if (parts.length === 1) {
			return parts[0];
		}

		const lastPart = parts.pop();
		return `${parts.join(', ')} and ${lastPart}`;
	}

	async function handleSubmit() {
		if (disabled) {
			errorMessage = blockedReason;
			return;
		}

		if (!hasRequiredTrimmedText(description) || !hasRequiredTrimmedText(amountUsdt)) {
			errorMessage = tr(
				'dashboard.services.my_services.quote_inbox.composer.errors.required_description_amount',
				'Description and amount are required.'
			);
			return;
		}

		if (!startDateTime || !endDateTime) {
			errorMessage = tr(
				'dashboard.services.my_services.quote_inbox.composer.errors.missing_schedule',
				'Start and end time are required.'
			);
			return;
		}

		const startSeconds = toUnixSeconds(startDateTime);
		const endSeconds = toUnixSeconds(endDateTime);

		if (!startSeconds || !endSeconds) {
			errorMessage = tr(
				'dashboard.services.my_services.quote_inbox.composer.errors.invalid_schedule',
				'Provide valid start and end times.'
			);
			return;
		}

		if (endSeconds <= startSeconds) {
			errorMessage = tr(
				'dashboard.services.my_services.quote_inbox.composer.errors.end_before_start',
				'End time must be after start time.'
			);
			return;
		}

		submitting = true;
		errorMessage = null;

		try {
			const result = await onSubmit({
				description: description.trim(),
				amountUsdt: amountUsdt.trim(),
				estimatedDuration: formatEstimatedDuration(startSeconds, endSeconds),
				estimatedStartTime: startSeconds,
				estimatedEndTime: endSeconds,
				expirationDays,
				expirationHours,
				coverLetter: coverLetter.trim() || undefined
			});

			if (result && typeof result === 'object' && result.success === false) {
				errorMessage =
					result.error ||
					tr(
						'dashboard.services.my_services.quote_inbox.composer.errors.submit_failed',
						'Unable to send the proposal right now.'
					);
				return;
			}

			resetForm();
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: tr(
							'dashboard.services.my_services.quote_inbox.composer.errors.submit_failed',
							'Unable to send the proposal right now.'
						);
		} finally {
			submitting = false;
		}
	}
</script>

<section
	class="border-base-300 bg-base-100 rounded-2xl border p-4 shadow-sm"
	data-testid="service-proposal-composer"
>
	<div class="grid gap-4 md:grid-cols-2">
		<div class="md:col-span-2">
			<div class="label px-0 pb-1">
				<span class="label-text mb-1 text-sm font-medium">
					{tr('dashboard.services.my_services.quote_inbox.composer.scope_of_work', 'Scope of work')}
				</span>
			</div>
			<textarea
				class="textarea textarea-bordered min-h-24 w-full"
				bind:value={description}
				aria-label={tr(
					'dashboard.services.my_services.quote_inbox.composer.scope_of_work',
					'Scope of work'
				)}
				placeholder={tr(
					'dashboard.services.my_services.quote_inbox.composer.scope_placeholder',
					'Describe what you will deliver.'
				)}
			></textarea>
		</div>

		<label class="form-control md:col-span-2 md:max-w-sm">
			<span class="label-text mb-1 text-sm font-medium">
				{tr('dashboard.services.my_services.quote_inbox.composer.amount_label', 'Amount (USD)')}
			</span>
			<input
				class="input input-bordered w-full"
				type="text"
				inputmode="decimal"
				pattern={'^[0-9]+(?:\\.[0-9]{1,2})?$'}
				bind:value={amountUsdt}
				placeholder="125"
			/>
		</label>

		<div class="col-span-full">
			<SchedulePeriodPicker
				bind:startValue={startDateTime}
				bind:endValue={endDateTime}
				minStartDate={new Date()}
				minEndDate={startDateTime || new Date()}
				onStartChange={(date: Date | null) => {
					startDateTime = date;
				}}
				onEndChange={(date: Date | null) => {
					endDateTime = date;
				}}
			/>
		</div>

		<div class="col-span-full grid grid-cols-2 gap-4">
			<label class="form-control">
				<span class="label-text mb-1 text-sm font-medium">
					{tr(
						'dashboard.services.my_services.quote_inbox.composer.expiration_days',
						'Expiration Days'
					)}
				</span>
				<input
					class="input input-bordered w-full"
					type="number"
					min="0"
					max="30"
					bind:value={expirationDays}
				/>
			</label>

			<label class="form-control">
				<span class="label-text mb-1 text-sm font-medium">
					{tr(
						'dashboard.services.my_services.quote_inbox.composer.expiration_hours',
						'Expiration Hours'
					)}
				</span>
				<input
					class="input input-bordered w-full"
					type="number"
					min="0"
					max="23"
					bind:value={expirationHours}
				/>
			</label>
		</div>

		<div class="md:col-span-2">
			<div class="label px-0 pb-1">
				<span class="label-text mb-1 text-sm font-medium">
					{tr('dashboard.services.my_services.quote_inbox.composer.cover_letter', 'Cover Letter')}
				</span>
			</div>
			<textarea
				class="textarea textarea-bordered min-h-20 w-full"
				bind:value={coverLetter}
				aria-label={tr(
					'dashboard.services.my_services.quote_inbox.composer.cover_letter',
					'Cover Letter'
				)}
				placeholder={tr(
					'dashboard.services.my_services.quote_inbox.composer.cover_letter_placeholder',
					'Optional message to the buyer.'
				)}
			></textarea>
		</div>
	</div>

	{#if errorMessage}
		{#if isPasskeyError}
			<div data-testid="service-proposal-composer-error" class="mt-4">
				<ErrorAlertWithModal
					error={errorMessage}
					isPasskeyError
					autoOpenModal={false}
					class="text-sm"
				/>
			</div>
		{:else}
			<div class="alert alert-error mt-4 text-sm" data-testid="service-proposal-composer-error">
				<span>{errorMessage}</span>
			</div>
		{/if}
	{/if}

	<div class="mt-4 flex justify-end">
		<button class="btn btn-primary" disabled={disabled || submitting} onclick={handleSubmit}>
			{#if submitting}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{tr('dashboard.services.my_services.quote_inbox.send_proposal', 'Send Proposal')}
		</button>
	</div>
</section>
