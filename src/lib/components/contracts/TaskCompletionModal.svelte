<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import uploadService, { type UploadResult } from '$lib/api/services/upload.service';
	import { appStore } from '$lib/stores/app.store';
	import { formatUSDWithSatsSync } from '$lib/utils/helpers/currencyFormatter';
	import { contractStore } from '$lib/stores/contract.store';
	import ContractContextSummary from './ContractContextSummary.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import {
		buildContractContextPresentation,
		getContractCompletionPresentation
	} from '$lib/utils/service-contract/context-presentation';

	const {
		contract,
		isOpen = false,
		onClose = () => {},
		onComplete = () => {},
		btcPrice = 63000
	} = $props<{
		contract: ContractWithEvents | null;
		isOpen: boolean;
		onClose: () => void;
		onComplete: (attachments: Attachment[]) => Promise<void>;
		btcPrice?: number;
	}>();

	let completionAttachments = $state<Attachment[]>([]);
	let pendingFiles = $state<File[]>([]);
	let isUploading = $state(false);
	let isCompleting = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });

	const presentation = $derived(
		contract ? buildContractContextPresentation(contract, contractStore.getContractKey) : null
	);
	const completionPresentation = $derived(
		getContractCompletionPresentation(presentation?.isServiceContract === true, {
			completionTitle: $t('dashboard.contracts.timeline.completion.title') as string,
			infoLabel: 'Task',
			instructionsTitle: 'Add completion evidence',
			instructionsText: $t('dashboard.contracts.timeline.completion.instructions_text') as string,
			confirmLabel: $t('dashboard.contracts.timeline.completion.mark_complete') as string
		})
	);
	const estimatedStartTime = $derived(
		contract ? (contractStore.getContractKey(contract, 'estimatedStartTime') as number | undefined) : undefined
	);
	const estimatedCompletionTime = $derived(
		contract
			? (contractStore.getContractKey(contract, 'estimatedCompletionTime') as number | undefined)
			: undefined
	);

	$effect(() => {
		if (!isOpen) {
			completionAttachments = [];
			pendingFiles = [];
			isUploading = false;
			isCompleting = false;
		}
	});

	async function handleFileUpload(results: UploadResult[]) {
		const newAttachments: Attachment[] = results.map((result) => ({
			key: result.key,
			url: result.url,
			type: result.type as string,
			alt:
				presentation?.isServiceContract === true
					? 'Service completion evidence'
					: 'Completion evidence',
			size: result.size
		}));

		completionAttachments = [...completionAttachments, ...newAttachments];
		pendingFiles = [];
		isUploading = false;
	}

	function handleFileRemove(index: number) {
		const attachment = completionAttachments[index];
		if (attachment) {
			uploadService.deleteFile(attachment.key).catch(console.error);
			completionAttachments.splice(index, 1);
		}
	}

	function handleUploadProgress(completed: number, total: number, currentFile: string) {
		isUploading = total > 0 && completed < total;
		uploadProgress = { completed, total, currentFile };
	}

	async function handleCompleteTask() {
		if (isCompleting) return;

		try {
			isCompleting = true;
			await onComplete(completionAttachments);
			onClose();
		} catch (error) {
			console.error('Error completing contract:', error);
			appStore.showErrorToast(
				presentation?.isServiceContract === true
					? 'Unable to mark this service as complete.'
					: ($t('dashboard.contracts.actions.task_completed_error') as string)
			);
		} finally {
			isCompleting = false;
		}
	}

	function handleClose() {
		if (isCompleting) return;
		onClose();
	}

	function getFilePreview(attachment: Attachment): string {
		return attachment.url;
	}

	function isVideoFile(attachment: Attachment): boolean {
		return attachment.type.startsWith('video/');
	}
</script>

{#if isOpen && contract}
	<div class="modal modal-open">
		<div class="modal-box max-h-[85vh] max-w-2xl overflow-y-auto">
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-lg font-semibold">{completionPresentation.completionTitle}</h3>
				<button
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
					<h4 class="mb-3 font-semibold">{completionPresentation.infoLabel} details</h4>
					<ContractContextSummary {contract} />
					<p class="text-sm text-base-content/80">
						<strong>{$t('dashboard.contracts.amount')}:</strong>
						{btcPrice > 0
							? formatUSDWithSatsSync(contractStore.getContractKey(contract, 'amount') as string, btcPrice)
							: `${contractStore.getContractKey(contract, 'amount') as string} RBTC`}
					</p>
					{#if estimatedStartTime && estimatedCompletionTime}
						<div class="pt-2">
							<p class="mb-2 text-sm font-medium text-base-content/80">Agreement schedule</p>
							<TaskDeadlineDisplay
								dateRangeStart={estimatedStartTime}
								dateRangeEnd={estimatedCompletionTime}
								showTime={true}
								showDuration={true}
							/>
						</div>
					{/if}
				</div>
			</div>

			<div class="alert alert-info alert-outline mb-6">
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path>
				</svg>
				<div>
					<span class="font-semibold">{completionPresentation.instructionsTitle}</span>
					<p class="text-sm">{completionPresentation.instructionsText}</p>
				</div>
			</div>

			<div class="mb-6">
				<MediaUploader
					id="completion-uploader"
					maxFiles={5}
					maxFileSize={10}
					allowedTypes={['image/*', 'video/*']}
					maxDuration={300}
					uploadFolder="task-completion"
					enableImageCompression={true}
					useCloudflare={true}
					generateVariants={true}
					onChange={handleFileUpload}
					onRemove={handleFileRemove}
					onUploadProgress={handleUploadProgress}
					className="w-full h-32 border-2 border-dashed border-base-300 rounded-lg flex items-center justify-center hover:border-primary transition-colors"
					label={presentation?.isServiceContract === true
						? 'Upload service evidence'
						: 'Upload completion evidence'}
					files={pendingFiles}
					uploadedAttachments={completionAttachments}
					getFilePreview={getFilePreview}
					isVideoFile={isVideoFile}
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
				<button class="btn btn-outline" onclick={handleClose} disabled={isCompleting}>
					{$t('common.cancel')}
				</button>
				<button
					class="btn btn-primary"
					onclick={handleCompleteTask}
					disabled={isCompleting || completionAttachments.length === 0}
				>
					{#if isCompleting}
						<span class="loading loading-spinner loading-sm"></span>
						{presentation?.isServiceContract === true
							? 'Completing service...'
							: $t('dashboard.contracts.timeline.completion.completing')}
					{:else}
						{completionPresentation.confirmLabel}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
