<script lang="ts">
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
		requestTitle = 'Selected request',
		walletReady = true,
		feeTierReady = true,
		blockedReason = null,
		disabled = false,
		onSubmit
	}: {
		requestTitle?: string;
		walletReady?: boolean;
		feeTierReady?: boolean;
		blockedReason?: string | null;
		disabled?: boolean;
		onSubmit: (
			payload: ServiceProposalComposerSubmitPayload
		) => Promise<{ success: boolean; error?: string } | void> | { success: boolean; error?: string } | void;
	} = $props();

	let description = $state('');
	let amountUsdt = $state('');
	let estimatedDuration = $state('');
	let startDateTime = $state('');
	let endDateTime = $state('');
	let expirationDays = $state(3);
	let expirationHours = $state(0);
	let coverLetter = $state('');
	let errorMessage = $state<string | null>(null);
	let submitting = $state(false);

	const effectiveBlockedReason = $derived.by(() => {
		if (blockedReason) return blockedReason;
		if (!walletReady) return 'Connect your wallet before sending a proposal.';
		if (!feeTierReady) return 'Choose a freelancer fee tier before sending a proposal.';
		return null;
	});

	function resetForm() {
		description = '';
		amountUsdt = '';
		estimatedDuration = '';
		startDateTime = '';
		endDateTime = '';
		expirationDays = 3;
		expirationHours = 0;
		coverLetter = '';
		errorMessage = null;
	}

	async function handleSubmit() {
		if (disabled || effectiveBlockedReason) {
			errorMessage = effectiveBlockedReason;
			return;
		}
		if (
			!hasRequiredTrimmedText(description) ||
			!hasRequiredTrimmedText(amountUsdt) ||
			!hasRequiredTrimmedText(estimatedDuration)
		) {
			errorMessage = 'Description, amount, and duration are required.';
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
				estimatedDuration: estimatedDuration.trim(),
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
			errorMessage = error instanceof Error ? error.message : 'Unable to send the proposal right now.';
		} finally {
			submitting = false;
		}
	}
</script>

<section class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm" data-testid="service-proposal-composer">
	<div class="mb-4">
		<h4 class="text-sm font-semibold">Send Proposal</h4>
		<p class="mt-1 text-sm text-base-content/70">{requestTitle}</p>
	</div>

	{#if effectiveBlockedReason}
		<div class="alert alert-warning mb-4 text-sm">
			<span>{effectiveBlockedReason}</span>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<label class="form-control md:col-span-2">
			<span class="label-text mb-1 text-sm font-medium">Scope</span>
			<textarea
				class="textarea textarea-bordered min-h-24"
				bind:value={description}
				placeholder="Describe what you will deliver."
			></textarea>
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Amount (USDT)</span>
			<input class="input input-bordered" bind:value={amountUsdt} placeholder="125.00" />
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Estimated Duration</span>
			<input
				class="input input-bordered"
				bind:value={estimatedDuration}
				placeholder="3 business days"
			/>
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Estimated Start</span>
			<input class="input input-bordered" type="datetime-local" bind:value={startDateTime} />
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Estimated End</span>
			<input class="input input-bordered" type="datetime-local" bind:value={endDateTime} />
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Expiration Days</span>
			<input
				class="input input-bordered"
				type="number"
				min="0"
				max="30"
				bind:value={expirationDays}
			/>
		</label>

		<label class="form-control">
			<span class="label-text mb-1 text-sm font-medium">Expiration Hours</span>
			<input
				class="input input-bordered"
				type="number"
				min="0"
				max="23"
				bind:value={expirationHours}
			/>
		</label>

		<label class="form-control md:col-span-2">
			<span class="label-text mb-1 text-sm font-medium">Cover Letter</span>
			<textarea
				class="textarea textarea-bordered min-h-20"
				bind:value={coverLetter}
				placeholder="Optional message to the buyer."
			></textarea>
		</label>
	</div>

	{#if errorMessage}
		<div class="alert alert-error mt-4 text-sm" data-testid="service-proposal-composer-error">
			<span>{errorMessage}</span>
		</div>
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
