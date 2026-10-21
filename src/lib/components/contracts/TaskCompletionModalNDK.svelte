<!-- @deprecated Use TaskCompletionDrawerNDK instead -->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Attachment } from '$lib/types/task';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import uploadService, { type UploadResult } from '$lib/api/services/upload.service';
	import { appStore } from '$lib/stores/app.store';
	import { presentCompleteTaskFailure } from '$lib/utils/contract/completeTaskFailure';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { createDebug } from '$lib/utils/debug';

	const d = createDebug('contracts:taskCompletionModalNDK');

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
		onComplete: (attachments: Attachment[]) => Promise<void>;
		btcPrice?: number;
	}>();

	let completionAttachments = $state<Attachment[]>([]);
	let isUploading = $state(false);
	let isCompleting = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });
	let mediaHasPendingUploads = $state(false);

	$effect(() => {
		if (!isOpen) {
			completionAttachments = [];
			isUploading = false;
			isCompleting = false;
			uploadProgress = { completed: 0, total: 0, currentFile: '' };
		}
	});

	function handleFileUpload(results: UploadResult[]) {
		// MediaUploader passes cumulative `uploadResults` each time — replace, do not append.
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
		appStore.showErrorToast(message);
	}

	/** Keep `completionAttachments` in sync when user removes a thumb in MediaUploader (same index order as upload results). */
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

	async function handleCompleteTask() {
		if (isCompleting) return;

		try {
			isCompleting = true;
			d.log('submitting task complete', {
				attachmentCount: completionAttachments.length,
				paymentId: contractRune.contract.paymentId
			});
			await onComplete(completionAttachments);
			d.log('task complete flow finished OK');
			onClose();
		} catch (error) {
			d.error('task complete flow failed', error);
			const key =
				error instanceof Error && error.message.startsWith('dashboard.')
					? error.message
					: 'dashboard.contracts.timeline.completion.error_generic';
			presentCompleteTaskFailure({
				showErrorToast: (message, timeout, options) =>
					appStore.showErrorToast(message, timeout, options),
				message: $t(key),
				retry: () => {
					void handleCompleteTask();
				}
			});
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
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box max-h-[85vh] max-w-2xl overflow-y-auto">
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-lg font-semibold">
					{$t('dashboard.contracts.timeline.completion.title')}
				</h3>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					onclick={handleClose}
					disabled={isCompleting}
					aria-label="Close modal"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						></path>
					</svg>
				</button>
			</div>

			<div class="card bg-base-200 mb-6">
				<div class="card-body p-4">
					<h4 class="mb-2 font-semibold">
						{$t('dashboard.contracts.timeline.completion.task_info')}
					</h4>
					<p class="text-base-content/80 mb-2 text-sm">
						<strong>{$t('dashboard.contracts.task_description')}:</strong>
						{contractRune.taskTitle}
					</p>
					<p class="text-base-content/80 text-sm">
						<strong>{$t('dashboard.contracts.amount')}:</strong>
						{amountLabel}
					</p>
				</div>
			</div>

			<div class="alert alert-outline alert-info mb-6">
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

			<div class="mb-6">
				<MediaUploader
					id="ndk-completion-uploader"
					maxFiles={5}
					maxFileSize={10}
					allowedTypes={['image/*', 'video/*']}
					maxDuration={300}
					uploadFolder="task-completion"
					enableImageCompression={true}
					useCloudflare={true}
					generateVariants={true}
					bind:hasPendingUploads={mediaHasPendingUploads}
					onChange={handleFileUpload}
					onUploadProgress={handleUploadProgress}
					onError={handleUploaderError}
					onRemove={handleUploaderRemove}
					className="border-base-300 hover:border-primary flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed transition-colors"
					label={$t('dashboard.contracts.timeline.completion.upload_evidence')}
				/>

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

			<div class="modal-action">
				<button type="button" class="btn btn-outline" onclick={handleClose} disabled={isCompleting}>
					{$t('common.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={handleCompleteTask}
					disabled={isCompleting || mediaHasPendingUploads}
				>
					{#if isCompleting}
						<span class="loading loading-spinner loading-sm"></span>
						{$t('dashboard.contracts.timeline.completion.completing')}
					{:else}
						{$t('dashboard.contracts.timeline.completion.mark_complete')}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
