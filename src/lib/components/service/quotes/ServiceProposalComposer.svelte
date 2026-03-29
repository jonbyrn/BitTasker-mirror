<script lang="ts">
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import {
		hasRequiredTrimmedText,
		validateDateTimeRange
	} from '$lib/components/forms/FormValidationCore';

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
	let startDateTime = $state('');
	let endDateTime = $state('');
	let expirationDays = $state(3);
	let expirationHours = $state(0);
	let coverLetter = $state('');
	let errorMessage = $state<string | null>(null);
	let submitting = $state(false);
	const isPasskeyError = $derived.by(
		() => Boolean(errorMessage) && detectErrorType(errorMessage ?? '') === 'biometric'
	);

	function resetForm() {
		description = '';
		amountUsdt = '';
		startDateTime = '';
		endDateTime = '';
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
			errorMessage = 'Description and amount are required.';
			return;
		}
		const timeWindow = validateDateTimeRange(startDateTime, endDateTime);
		if (!timeWindow.ok) {
			if (timeWindow.errorCode === 'missing') {
				errorMessage = 'Start and end time are required.';
			} else if (timeWindow.errorCode === 'invalid') {
				errorMessage = 'Provide valid start and end times.';
			} else {
				errorMessage = 'End time must be after start time.';
			}
			return;
		}

		submitting = true;
		errorMessage = null;

		try {
			const result = await onSubmit({
				description: description.trim(),
				amountUsdt: amountUsdt.trim(),
				estimatedDuration: formatEstimatedDuration(timeWindow.startTime, timeWindow.endTime),
				estimatedStartTime: timeWindow.startTime,
				estimatedEndTime: timeWindow.endTime,
				expirationDays,
				expirationHours,
				coverLetter: coverLetter.trim() || undefined
			});

			if (result && typeof result === 'object' && result.success === false) {
				errorMessage = result.error || 'Unable to send the proposal right now.';
				return;
			}

			resetForm();
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Unable to send the proposal right now.';
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
				<span class="label-text mb-1 text-sm font-medium">Scope of work</span>
			</div>
			<textarea
				class="textarea textarea-bordered min-h-24 w-full"
				bind:value={description}
				aria-label="Scope of work"
				placeholder="Describe what you will deliver."
			></textarea>
		</div>

		<label class="form-control md:col-span-2 md:max-w-sm">
			<span class="label-text mb-1 text-sm font-medium">Amount (USD)</span>
			<input
				class="input input-bordered w-full"
				type="text"
				inputmode="decimal"
				pattern="^[0-9]+(?:\\.[0-9]{(1, 2)})?$"
				bind:value={amountUsdt}
				placeholder="125"
			/>
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Estimated Start</span>
			<input class="input input-bordered w-full" type="datetime-local" bind:value={startDateTime} />
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Estimated End</span>
			<input class="input input-bordered w-full" type="datetime-local" bind:value={endDateTime} />
		</label>

		<div class="col-span-full grid grid-cols-2 gap-4">
			<label class="form-control">
				<span class="label-text mb-1 text-sm font-medium">Expiration Days</span>
				<input
					class="input input-bordered w-full"
					type="number"
					min="0"
					max="30"
					bind:value={expirationDays}
				/>
			</label>

			<label class="form-control">
				<span class="label-text mb-1 text-sm font-medium">Expiration Hours</span>
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
				<span class="label-text mb-1 text-sm font-medium">Cover Letter</span>
			</div>
			<textarea
				class="textarea textarea-bordered min-h-20 w-full"
				bind:value={coverLetter}
				aria-label="Cover Letter"
				placeholder="Optional message to the buyer."
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
			Send Proposal
		</button>
	</div>
</section>
