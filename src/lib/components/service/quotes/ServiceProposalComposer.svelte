<script lang="ts">
	import {
		hasRequiredTrimmedText,
		validateDateTimeRange
	} from '$lib/components/forms/FormValidationCore';
	import { t } from 'svelte-i18n';

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
		walletReady = true,
		feeTierReady = true,
		blockedReason = null,
		disabled = false,
		onSubmit
	}: {
		walletReady?: boolean;
		feeTierReady?: boolean;
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
	let estimatedDuration = $state('');
	let startDateTime = $state('');
	let endDateTime = $state('');
	let expirationDays = $state(3);
	let expirationHours = $state(0);
	let coverLetter = $state('');
	let errorMessage = $state<string | null>(null);
	let submitting = $state(false);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	const submitBlockedReason = $derived.by(() => {
		if (blockedReason) return blockedReason;
		return null;
	});

	const walletWarningMessage = $derived.by(() => {
		if (!walletReady) {
			return tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.warnings.wallet_not_connected',
				'Connect your wallet before sending a proposal.'
			);
		}
		if (!feeTierReady) {
			return tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.warnings.fee_tier_missing',
				'Choose a freelancer fee tier before sending a proposal.'
			);
		}
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

	function validateForm(): string | null {
		if (
			!hasRequiredTrimmedText(description) ||
			!hasRequiredTrimmedText(amountUsdt) ||
			!hasRequiredTrimmedText(estimatedDuration)
		) {
			return tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.errors.required_fields',
				'Scope, amount, and estimated duration are required.'
			);
		}

		const amount = Number.parseFloat(amountUsdt);
		if (Number.isNaN(amount) || amount <= 0) {
			return tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.errors.amount_invalid',
				'Enter a valid amount greater than 0.'
			);
		}

		if (expirationDays < 0 || expirationDays > 30) {
			return tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.errors.expiration_days_invalid',
				'Expiration days must be between 0 and 30.'
			);
		}

		if (expirationHours < 0 || expirationHours > 23) {
			return tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.errors.expiration_hours_invalid',
				'Expiration hours must be between 0 and 23.'
			);
		}

		const timeWindow = validateDateTimeRange(startDateTime, endDateTime);
		if (!timeWindow.ok) {
			if (timeWindow.errorCode === 'missing') {
				return tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.errors.time_required',
					'Start and end time are required.'
				);
			}
			if (timeWindow.errorCode === 'invalid') {
				return tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.errors.time_invalid',
					'Provide valid start and end times.'
				);
			}
			return tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.errors.time_order_invalid',
				'End time must be after start time.'
			);
		}

		return null;
	}

	async function handleSubmit() {
		if (disabled || submitBlockedReason) {
			errorMessage = submitBlockedReason;
			return;
		}

		const validationError = validateForm();
		if (validationError) {
			errorMessage = validationError;
			return;
		}

		const timeWindow = validateDateTimeRange(startDateTime, endDateTime);
		if (!timeWindow.ok) {
			errorMessage = tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.errors.time_invalid',
				'Provide valid start and end times.'
			);
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
				errorMessage =
					result.error ||
					tr(
						'dashboard.services.my_services.quote_inbox.proposal_composer.errors.submit_failed',
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
							'dashboard.services.my_services.quote_inbox.proposal_composer.errors.submit_failed',
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
	<div class="mb-4">
		<h4 class="text-sm font-semibold">
			{tr('dashboard.services.my_services.quote_inbox.proposal_composer.title', 'Send Proposal')}
		</h4>
	</div>

	{#if walletWarningMessage}
		<div class="alert alert-outline alert-warning mb-4 text-sm">
			<span>{walletWarningMessage}</span>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<label class="block w-full space-y-1 lg:col-span-2">
			<span class="label-text text-sm font-medium">
				{tr('dashboard.services.my_services.quote_inbox.proposal_composer.fields.scope', 'Scope')}
			</span>
			<textarea
				class="textarea textarea-bordered min-h-24 w-full"
				bind:value={description}
				placeholder={tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.placeholders.scope',
					'Describe what you will deliver.'
				)}
			></textarea>
		</label>

		<label class="block w-full space-y-1">
			<span class="label-text text-sm font-medium">
				{tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.fields.amount_usdt',
					'Amount (USDT)'
				)}
			</span>
			<input class="input input-bordered w-full" bind:value={amountUsdt} placeholder="125.00" />
		</label>

		<label class="block w-full space-y-1">
			<span class="label-text text-sm font-medium">
				{tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.fields.estimated_duration',
					'Estimated Duration'
				)}
			</span>
			<input
				class="input input-bordered w-full"
				bind:value={estimatedDuration}
				placeholder={tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.placeholders.estimated_duration',
					'3 business days'
				)}
			/>
		</label>

		<label class="block w-full space-y-1">
			<span class="label-text text-sm font-medium">
				{tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.fields.estimated_start',
					'Estimated Start'
				)}
			</span>
			<input class="input input-bordered w-full" type="datetime-local" bind:value={startDateTime} />
		</label>

		<label class="block w-full space-y-1">
			<span class="label-text text-sm font-medium">
				{tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.fields.estimated_end',
					'Estimated End'
				)}
			</span>
			<input class="input input-bordered w-full" type="datetime-local" bind:value={endDateTime} />
		</label>

		<label class="block w-full space-y-1">
			<span class="label-text text-sm font-medium">
				{tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.fields.expiration_days',
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

		<label class="block w-full space-y-1">
			<span class="label-text text-sm font-medium">
				{tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.fields.expiration_hours',
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

		<label class="block w-full space-y-1 lg:col-span-2">
			<span class="label-text text-sm font-medium">
				{tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.fields.cover_letter',
					'Cover Letter'
				)}
			</span>
			<textarea
				class="textarea textarea-bordered min-h-20 w-full"
				bind:value={coverLetter}
				placeholder={tr(
					'dashboard.services.my_services.quote_inbox.proposal_composer.placeholders.cover_letter',
					'Optional message to the buyer.'
				)}
			></textarea>
		</label>
	</div>

	{#if errorMessage}
		<div
			class="alert alert-outline alert-error mt-4 text-sm"
			data-testid="service-proposal-composer-error"
		>
			<span>{errorMessage}</span>
		</div>
	{/if}

	<div class="mt-4 flex justify-end">
		<button class="btn btn-primary" disabled={disabled || submitting} onclick={handleSubmit}>
			{#if submitting}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{tr(
				'dashboard.services.my_services.quote_inbox.proposal_composer.actions.send',
				'Send Proposal'
			)}
		</button>
	</div>
</section>
