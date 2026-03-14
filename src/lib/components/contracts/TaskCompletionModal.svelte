<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import { type UploadResult } from '$lib/api/services/upload.service';
	import { appStore } from '$lib/stores/app.store';
	import { formatUSDWithSatsSync } from '$lib/utils/helpers/currencyFormatter';
	import { contractStore } from '$lib/stores/contract.store';

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

	// State
	let completionAttachments = $state<Attachment[]>([]);
	let isUploading = $state(false);
	let isCompleting = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });

	// Reset state when modal opens/closes
	$effect(() => {
		if (!isOpen) {
			completionAttachments = [];
			isUploading = false;
			isCompleting = false;
		}
	});

	// Handle file upload
	async function handleFileUpload(results: UploadResult[]) {
		const newAttachments: Attachment[] = results.map((result) => ({
			key: result.key,
			url: result.url,
			type: result.type as string,
			alt: 'Completion evidence',
			size: result.size
		}));

		completionAttachments = [...completionAttachments, ...newAttachments];
	}

	// Handle upload progress
	function handleUploadProgress(completed: number, total: number, currentFile: string) {
		uploadProgress = { completed, total, currentFile };
	}

	// Complete task with attachments
	async function handleCompleteTask() {
		if (isCompleting) return;

		try {
			isCompleting = true;
			await onComplete(completionAttachments);
			onClose();
		} catch (error) {
			console.error('Error completing task:', error);
			appStore.showErrorToast($t('dashboard.contracts.actions.task_completed_error'));
		} finally {
			isCompleting = false;
		}
	}

	// Handle modal close
	function handleClose() {
		if (isCompleting) return;
		onClose();
	}
</script>

{#if isOpen && contract}
	<div class="modal modal-open">
		<div class="modal-box max-h-[85vh] max-w-2xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-lg font-semibold">
					{$t('dashboard.contracts.timeline.completion.title')}
				</h3>
				<button
					class="btn btn-sm btn-circle btn-ghost"
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

			<!-- Task Info -->
			<div class="card bg-base-200 mb-6">
				<div class="card-body p-4">
					<h4 class="mb-2 font-semibold">
						{$t('dashboard.contracts.timeline.completion.task_info')}
					</h4>
					<p class="text-base-content/80 mb-2 text-sm">
						<strong>{$t('dashboard.contracts.task_description')}:</strong>
						{contractStore.getContractKey(contract, 'taskTitle')}
					</p>
					<p class="text-base-content/80 text-sm">
						<strong>{$t('dashboard.contracts.amount')}:</strong>
						{btcPrice > 0
							? formatUSDWithSatsSync(
									contractStore.getContractKey(contract, 'amount') as string,
									btcPrice
								)
							: `${contractStore.getContractKey(contract, 'amount') as string} RBTC`}
					</p>
				</div>
			</div>

			<!-- Instructions -->
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
					<span class="font-semibold"
						>{$t('dashboard.contracts.timeline.completion.instructions_title')}</span
					>
					<p class="text-sm">{$t('dashboard.contracts.timeline.completion.instructions_text')}</p>
				</div>
			</div>

			<!-- File Upload Section -->
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
					onUploadProgress={handleUploadProgress}
					className="w-full h-32 border-2 border-dashed border-base-300 rounded-lg flex items-center justify-center hover:border-primary transition-colors"
					label="Upload completion evidence"
				/>

				<!-- Upload Progress -->
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

			<!-- Actions -->
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
						{$t('dashboard.contracts.timeline.completion.completing')}
					{:else}
						{$t('dashboard.contracts.timeline.completion.mark_complete')}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
