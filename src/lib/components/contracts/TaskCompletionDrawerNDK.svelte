<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Attachment } from '$lib/types/task';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import { appStore } from '$lib/stores/app.store';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { createDebug } from '$lib/utils/debug';
	import Drawer from '$lib/components/Drawer.svelte';
	import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';

	const d = createDebug('contracts:taskCompletionDrawerNDK');

	const MAX_CHARS = 1000;

	const {
		contractRune,
		isOpen = false,
		onClose = () => {},
		onComplete = async () => {},
		btcPrice = 0
	} = $props<{
		contractRune: PaymentContractRune;
		isOpen: boolean;
		onClose: () => void;
		onComplete: (attachments: Attachment[], completionText?: string) => Promise<void>;
		btcPrice?: number;
	}>();

	let completionText = $state('');
	let completionAttachments = $state<Attachment[]>([]);
	let isCompleting = $state(false);
	let mediaHasPendingUploads = $state(false);

	function resetState() {
		completionText = '';
		completionAttachments = [];
		isCompleting = false;
	}

	function handleMediaChange(results: UploadResult[]) {
		completionAttachments = results.map((r) => ({
			key: r.key,
			url: r.url,
			type: r.type === 'image' ? 'image/*' : 'video/mp4',
			cloudflareId: r.cloudflareId,
			alt: 'Completion evidence',
			size: r.size
		}));
	}

	function handleMediaError(msg: string) {
		appStore.showErrorToast(msg);
	}

	function handleTextInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		const value = target.value;

		// Enforce 1000 char limit
		if (value.length > MAX_CHARS) {
			completionText = value.slice(0, MAX_CHARS);
			(target as HTMLTextAreaElement).value = completionText;
		} else {
			completionText = value;
		}
	}

	const canSubmit = $derived(!isCompleting && !mediaHasPendingUploads);

	async function handleCompleteTask() {
		if (!canSubmit || isCompleting) return;

		const trimmedText = completionText.trim() || undefined;

		try {
			isCompleting = true;
			d.log('submitting task complete', {
				attachmentCount: completionAttachments.length,
				textLength: trimmedText?.length ?? 0,
				paymentId: contractRune.contract.paymentId
			});
			await onComplete(completionAttachments, trimmedText);
			d.log('task complete flow finished OK');
			resetState();
			onClose();
		} catch (error) {
			d.error('task complete flow failed', error);
			appStore.showErrorToast($t('dashboard.contracts.actions.task_completed_error'));
		} finally {
			isCompleting = false;
		}
	}

	function handleClose() {
		if (isCompleting) return;
		resetState();
		onClose();
	}

	const amountLabel = $derived.by(() => {
		const amount = contractRune.contract.amount;
		const currency = contractRune.contract.currency;
		if (btcPrice > 0) {
			const usd = formatConvertedAmount(amount, currency, { btcPrice, toCurrency: 'USD' });
			const sats = formatConvertedAmount(amount, currency, { btcPrice, toCurrency: 'SATS' });
			return `${usd} · ${sats}`;
		}
		return `${amount} ${currency}`;
	});

	const charCount = $derived(completionText.length);
</script>

<Drawer
	{isOpen}
	title={$t('dashboard.contracts.timeline.completion.title')}
	position="right"
	isScrollable={true}
	onClose={handleClose}
	isSubmitting={isCompleting}
>
	<div class="min-w-0 flex-1 space-y-4 overflow-x-hidden">
		<!-- Task Info Card -->
		<div class="card bg-base-200">
			<div class="card-body p-4">
				<!-- Row 1: Title + Price (right-aligned, emphasized) -->
				<div class="mb-4 flex flex-row items-start justify-between gap-4">
					<div class="min-w-0 flex-1">
						<p class="text-lg leading-tight font-bold">
							{contractRune.taskTitle}
						</p>
					</div>
					<div class="shrink-0 text-right">
						{#if btcPrice > 0}
							<div class="text-2xl font-bold">{amountLabel.split(' · ')[0]}</div>
							<div class="text-base-content/60 text-base">{amountLabel.split(' · ')[1]}</div>
						{:else}
							<div class="text-2xl font-bold">{amountLabel}</div>
						{/if}
					</div>
				</div>

				<!-- Row 2: Location -->
				<div class="mb-3">
					<TaskLocationDisplay />
				</div>

				<!-- Row 3: Delivery Date/Time -->
				{#if contractRune.effectiveEstimatedCompletionTime}
					<TaskDeadlineDisplay
						deadline={contractRune.effectiveEstimatedCompletionTime}
						dateRangeStart={contractRune.effectiveEstimatedStartTime}
						dateRangeEnd={contractRune.effectiveEstimatedCompletionTime}
						showTime={true}
						showDuration={true}
					/>
				{/if}
			</div>
		</div>

		<!-- Instructions Alert -->
		<div class="alert alert-outline alert-info">
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				></path>
			</svg>
			<div>
				<span class="font-semibold"
					>{$t('dashboard.contracts.timeline.completion.instructions_title')}</span
				>
				<p class="text-sm">{$t('dashboard.contracts.timeline.completion.instructions_text')}</p>
			</div>
		</div>

		<!-- Text Input Section -->
		<div>
			<label for="completion-text" class="mb-2 block text-sm font-medium">
				{$t('dashboard.contracts.timeline.completion.text_label')}
			</label>
			<textarea
				id="completion-text"
				class="textarea textarea-bordered w-full"
				rows="4"
				placeholder={$t('dashboard.contracts.timeline.completion.text_placeholder')}
				value={completionText}
				oninput={handleTextInput}
				disabled={isCompleting}
			></textarea>
			<p class="text-base-content/60 mt-1 text-right text-sm">
				{charCount}/{MAX_CHARS}
			</p>
		</div>

		<!-- Evidence Upload Section -->
		<div>
			<MediaUploader
				id="ndk-completion-drawer-uploader"
				maxFiles={10}
				maxFileSize={100}
				allowedTypes={['image/*', 'video/*']}
				maxDuration={300}
				uploadFolder="task-completion"
				enableImageCompression={true}
				useCloudflare={true}
				generateVariants={true}
				bind:hasPendingUploads={mediaHasPendingUploads}
				onChange={handleMediaChange}
				onError={handleMediaError}
			/>
		</div>
	</div>

	{#snippet footer()}
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-outline" onclick={handleClose} disabled={isCompleting}>
				{$t('common.cancel')}
			</button>
			<button
				type="button"
				class="btn btn-primary"
				onclick={handleCompleteTask}
				disabled={!canSubmit}
			>
				{#if isCompleting}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('dashboard.contracts.timeline.completion.completing')}
				{:else}
					{$t('dashboard.contracts.timeline.completion.mark_complete')}
				{/if}
			</button>
		</div>
	{/snippet}
</Drawer>
