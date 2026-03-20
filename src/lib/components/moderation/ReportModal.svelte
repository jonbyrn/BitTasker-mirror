<script lang="ts">
	import { t } from 'svelte-i18n';
	import Modal from '$lib/components/Modal.svelte';
	import { publishReport, type ReportType } from '$lib/nostr/report';
	import { mutePubkey } from '$lib/nostr/muteList';
	import { appStore } from '$lib/stores/app.store';

	type ContentType = 'task' | 'bid' | 'message' | 'user';

	let {
		isOpen,
		onClose,
		contentType,
		reportedPubkey,
		reportedEventId,
		username
	}: {
		isOpen: boolean;
		onClose: () => void;
		contentType: ContentType;
		reportedPubkey: string;
		reportedEventId?: string;
		username?: string;
	} = $props();

	const REPORT_TYPES: ReportType[] = [
		'spam',
		'illegal',
		'profanity',
		'nudity',
		'impersonation',
		'other'
	];

	// Form state
	let selectedType = $state<ReportType | null>(null);
	let description = $state('');
	let isSubmitting = $state(false);
	let validationError = $state('');

	// Post-submit state: show "also mute?" follow-up
	let reportSubmitted = $state(false);
	let alsoMute = $state(true);
	let isMuting = $state(false);

	const modalTitle = $derived.by(() => {
		if (reportSubmitted) return $t('moderation.report_modal.submitted_title');
		switch (contentType) {
			case 'task':
				return $t('moderation.report_modal.title_task');
			case 'bid':
				return $t('moderation.report_modal.title_bid');
			case 'message':
				return $t('moderation.report_modal.title_message');
			case 'user':
				return $t('moderation.report_modal.title_user');
		}
	});

	function reset() {
		selectedType = null;
		description = '';
		isSubmitting = false;
		validationError = '';
		reportSubmitted = false;
		alsoMute = true;
		isMuting = false;
	}

	function handleClose() {
		reset();
		onClose();
	}

	async function handleSubmit() {
		if (!selectedType) {
			validationError = $t('moderation.report_modal.select_type');
			return;
		}

		validationError = '';
		isSubmitting = true;

		try {
			await publishReport({
				reportedPubkey,
				reportType: selectedType,
				reportedEventId,
				description: description.trim() || undefined
			});

			// Show the follow-up "also mute?" step instead of closing immediately
			reportSubmitted = true;
		} catch {
			appStore.showErrorToast($t('moderation.report_modal.error_toast'));
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDone() {
		if (alsoMute) {
			isMuting = true;
			try {
				await mutePubkey(reportedPubkey);
				const muteMsg = username
					? $t('moderation.menu.muted_toast', { values: { username } })
					: $t('moderation.menu.muted_toast_generic');
				appStore.showSuccessToast($t('moderation.report_modal.success_toast') + ' ' + muteMsg);
			} catch {
				// Mute failure is non-critical — report was already submitted
				appStore.showSuccessToast($t('moderation.report_modal.success_toast'));
			} finally {
				isMuting = false;
			}
		} else {
			appStore.showSuccessToast($t('moderation.report_modal.success_toast'));
		}
		handleClose();
	}
</script>

<Modal {isOpen} title={modalTitle} onClose={handleClose} size="sm">
	{#if !reportSubmitted}
		<!-- Step 1: Report form -->
		<div class="space-y-4">
			<p class="text-base-content/70 text-sm">
				{$t('moderation.report_modal.description')}
			</p>

			<!-- Report type selection -->
			<fieldset class="space-y-2">
				<legend class="text-sm font-medium">{$t('moderation.report_modal.type_label')}</legend>
				{#each REPORT_TYPES as type (type)}
					<label class="hover:bg-base-200 flex cursor-pointer items-center gap-3 rounded-lg p-2">
						<input
							type="radio"
							name="report-type"
							class="radio radio-primary radio-sm"
							value={type}
							bind:group={selectedType}
						/>
						<span class="text-sm">{$t(`moderation.report_modal.types.${type}`)}</span>
					</label>
				{/each}
			</fieldset>

			{#if validationError}
				<p class="text-error text-xs">{validationError}</p>
			{/if}

			<!-- Optional description -->
			<div class="form-control">
				<label class="label" for="report-description">
					<span class="label-text text-sm">
						{selectedType === 'other'
							? $t('moderation.report_modal.details_label').replace(' (optional)', '')
							: $t('moderation.report_modal.details_label')}
					</span>
				</label>
				<textarea
					id="report-description"
					class="textarea textarea-bordered resize-none text-sm"
					rows="3"
					placeholder={selectedType === 'other'
						? $t('moderation.report_modal.details_required_placeholder')
						: $t('moderation.report_modal.details_placeholder')}
					bind:value={description}
				></textarea>
			</div>
		</div>
	{:else}
		<!-- Step 2: Post-submit follow-up -->
		<div class="space-y-4">
			<div class="flex items-start gap-3">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-success mt-0.5 h-5 w-5 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
				<p class="text-sm">{$t('moderation.report_modal.submitted_description')}</p>
			</div>

			<label
				class="border-base-300 hover:bg-base-200 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
			>
				<input
					type="checkbox"
					class="checkbox checkbox-primary checkbox-sm"
					bind:checked={alsoMute}
				/>
				<div>
					<p class="text-sm font-medium">{$t('moderation.report_modal.also_mute_label')}</p>
					<p class="text-base-content/60 text-xs">
						{$t('moderation.report_modal.also_mute_description')}
					</p>
				</div>
			</label>
		</div>
	{/if}

	{#snippet footer()}
		{#if !reportSubmitted}
			<div class="flex justify-end gap-2">
				<button class="btn btn-ghost btn-sm" onclick={handleClose} disabled={isSubmitting}>
					{$t('moderation.report_modal.cancel')}
				</button>
				<button
					class="btn btn-error btn-sm"
					onclick={handleSubmit}
					disabled={isSubmitting ||
						!selectedType ||
						(selectedType === 'other' && !description.trim())}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-xs"></span>
						{$t('moderation.report_modal.submitting')}
					{:else}
						{$t('moderation.report_modal.submit')}
					{/if}
				</button>
			</div>
		{:else}
			<div class="flex justify-end">
				<button class="btn btn-primary btn-sm" onclick={handleDone} disabled={isMuting}>
					{#if isMuting}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{$t('moderation.report_modal.done')}
				</button>
			</div>
		{/if}
	{/snippet}
</Modal>
