<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Attachment } from '$lib/types/task';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import VideoUploader from '$lib/components/VideoUploader.svelte';
	import uploadService, { type UploadResult } from '$lib/api/services/upload.service';
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
	let isUploading = $state(false);
	let isCompleting = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });

	$effect(() => {
		if (!isOpen) {
			completionText = '';
			completionAttachments = [];
			isUploading = false;
			isCompleting = false;
			uploadProgress = { completed: 0, total: 0, currentFile: '' };
		}
	});

	function handleFileUpload(results: UploadResult[]) {
		completionAttachments = results.map((result) => ({
			key: result.key,
			url: result.url,
			type: result.type as string,
			alt: 'Completion evidence',
			size: result.size
		}));
		isUploading = false;
		d.log('completion evidence ready', {
			count: completionAttachments.length,
			keys: completionAttachments.map((a) => a.key)
		});
	}

	function handleUploadProgress(completed: number, total: number, currentFile: string) {
		uploadProgress = { completed, total, currentFile };
		isUploading = total > 0 && completed < total;
	}

	function handleUploaderError(message: string) {
		isUploading = false;
		uploadProgress = { completed: 0, total: 0, currentFile: '' };
		d.warn('media uploader error', { message });
	}

	function handleUploaderRemove(index: number) {
		const att = completionAttachments[index];
		if (att) {
			uploadService.deleteFile(att.key).catch((err) => {
				d.error('deleteFile after uploader remove failed', { key: att.key, err });
			});
		}
		completionAttachments = completionAttachments.filter((_, i) => i !== index);
		d.log('evidence removed in uploader', { index, remaining: completionAttachments.length });
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

	const canSubmit = $derived(
		!isCompleting && completionText.trim().length > 0 && completionAttachments.length > 0
	);

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
				{#if contractRune.contract.estimatedCompletionTime}
					<TaskDeadlineDisplay
						deadline={contractRune.contract.estimatedCompletionTime}
						dateRangeStart={contractRune.contract.estimatedStartTime}
						dateRangeEnd={contractRune.contract.estimatedCompletionTime}
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

		<!-- Media Uploader Section -->
		<div>
			<MediaUploader
				id="ndk-completion-drawer-uploader"
				maxFiles={5}
				maxFileSize={10}
				allowedTypes={['image/*']}
				maxDuration={300}
				uploadFolder="task-completion"
				enableImageCompression={true}
				useCloudflare={true}
				generateVariants={true}
				onChange={handleFileUpload}
				onUploadProgress={handleUploadProgress}
				onError={handleUploaderError}
				onRemove={handleUploaderRemove}
				className="border-base-300 hover:border-primary flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed transition-colors"
				label={$t('dashboard.contracts.timeline.completion.upload_evidence')}
			/>

			<div class="mt-4">
				<p class="mb-2 text-sm font-medium">{$t('common.components.media_uploader.video_evidence')}</p>
				<VideoUploader
					maxFileSize={10 * 1024 * 1024}
					maxDuration={300}
					private={true}
					onReady={(result) => {
						completionAttachments = [...completionAttachments, {
							key: result.uid,
							url: result.hlsUrl,
							type: 'video',
							cloudflareId: result.uid,
							alt: 'Completion evidence',
							size: result.size
						}];
					}}
					onError={(msg) => {
						appStore.showErrorToast(msg);
					}}
				/>
			</div>

			{#if isUploading && uploadProgress.total > 0}
				<div class="mt-3">
					<div class="mb-1 flex justify-between text-sm">
						<span>{$t('common.uploading')}</span>
						<span>{uploadProgress.completed}/{uploadProgress.total}</span>
					</div>
					<progress
						class="progress progress-primary w-full"
						value={uploadProgress.completed}
						max={uploadProgress.total}
					></progress>
					{#if uploadProgress.currentFile}
						<p class="text-base-content/60 mt-1 text-xs">
							{$t('common.uploading_file')}: {uploadProgress.currentFile}
						</p>
					{/if}
				</div>
			{/if}
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
