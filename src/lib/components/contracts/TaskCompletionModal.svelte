<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import uploadService, { type UploadResult } from '$lib/api/services/upload.service';
	import { appStore } from '$lib/stores/app.store';

	const {
		contract,
		isOpen = false,
		onClose = () => {},
		onComplete = () => {}
	} = $props<{
		contract: ContractWithEvents | null;
		isOpen: boolean;
		onClose: () => void;
		onComplete: (attachments: Attachment[]) => Promise<void>;
	}>();

	// State
	let completionAttachments = $state<Attachment[]>([]);
	let pendingFiles = $state<File[]>([]);
	let isUploading = $state(false);
	let isCompleting = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });

	// Reset state when modal opens/closes
	$effect(() => {
		if (!isOpen) {
			completionAttachments = [];
			pendingFiles = [];
			isUploading = false;
			isCompleting = false;
		}
	});

	// Handle file upload
	async function handleFileUpload(results: UploadResult[]) {
		const newAttachments: Attachment[] = results.map(result => ({
			key: result.key,
			url: result.url,
			type: result.type as string,
			alt: 'Completion evidence',
			size: result.size
		}));

		completionAttachments = [...completionAttachments, ...newAttachments];
		pendingFiles = [];
	}

	// Handle file removal
	function handleFileRemove(index: number) {
		const attachment = completionAttachments[index];
		if (attachment) {
			// Delete from server
			uploadService.deleteFile(attachment.key).catch(console.error);
			completionAttachments.splice(index, 1);
		}
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

	// Get file preview URL
	function getFilePreview(attachment: Attachment): string {
		return attachment.url;
	}

	// Check if file is video
	function isVideoFile(attachment: Attachment): boolean {
		return attachment.type.startsWith('video/');
	}
</script>

{#if isOpen && contract}
	<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between mb-6">
		<h3 class="text-lg font-semibold">
			{$t('dashboard.contracts.timeline.completion.title')}
		</h3>
				<button 
					class="btn btn-sm btn-circle btn-ghost" 
					onclick={handleClose}
					disabled={isCompleting}
					aria-label="Close modal"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</button>
			</div>

			<!-- Task Info -->
			<div class="card bg-base-200 mb-6">
				<div class="card-body p-4">
					<h4 class="font-semibold mb-2">{$t('dashboard.contracts.timeline.completion.task_info')}</h4>
					<p class="text-sm text-base-content/80 mb-2">
						<strong>{$t('dashboard.contracts.task_description')}:</strong> {contract.contract.taskTitle}
					</p>
					<p class="text-sm text-base-content/80">
						<strong>{$t('dashboard.contracts.amount')}:</strong> {contract.contract.amount} RBTC
					</p>
				</div>
			</div>

			<!-- Instructions -->
			<div class="alert alert-info alert-outline mb-6">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<span class="font-semibold">{$t('dashboard.contracts.timeline.completion.instructions_title')}</span>
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
						<div class="flex justify-between text-sm mb-1">
							<span>{$t('common.uploading')}</span>
							<span>{uploadProgress.completed}/{uploadProgress.total}</span>
						</div>
						<progress 
							class="progress progress-primary w-full" 
							value={uploadProgress.completed} 
							max={uploadProgress.total}
						></progress>
						{#if uploadProgress.currentFile}
							<p class="text-xs text-base-content/60 mt-1">
								{$t('common.uploading_file')}: {uploadProgress.currentFile}
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<div class="modal-action">
				<button 
					class="btn btn-outline" 
					onclick={handleClose}
					disabled={isCompleting}
				>
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
