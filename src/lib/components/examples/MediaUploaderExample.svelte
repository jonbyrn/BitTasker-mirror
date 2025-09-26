<script lang="ts">
	import MediaUploader from '../MediaUploader.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';

	let mediaUploaderRef: MediaUploader;
	let selectedFiles: File[] = [];
	let uploadResults: UploadResult[] = [];
	let isUploading = false;

	function handleFileSelect(files: File[]) {
		selectedFiles = files;
		console.log('Files selected:', files.map(f => f.name));
	}

	function handleUploadResults(results: UploadResult[]) {
		uploadResults = results;
		console.log('Upload completed:', results);
	}

	async function handleNextClick() {
		if (selectedFiles.length === 0) {
			alert('Please select at least one file');
			return;
		}

		try {
			isUploading = true;
			await mediaUploaderRef.uploadFiles();
			console.log('Upload successful!');
		} catch (error) {
			console.error('Upload failed:', error);
			alert('Upload failed. Please try again.');
		} finally {
			isUploading = false;
		}
	}
</script>

<div class="space-y-4">
	<h3 class="text-lg font-semibold">Media Uploader Example</h3>
	
	<MediaUploader
		bind:this={mediaUploaderRef}
		id="example-uploader"
		label="Select Images or Drag & Drop"
		allowedTypes={['image/*']}
		maxFiles={3}
		maxFileSize={5}
		enableImageCompression={true}
		compressionQuality={0.8}
		maxImageDimension={1920}
		showCompressionInfo={true}
		useCloudflare={true}
		generateVariants={true}
		uploadFolder="examples"
		autoUpload={false}
		onFileSelect={handleFileSelect}
		onChange={handleUploadResults}
	/>

	<div class="flex items-center gap-4">
		<button
			class="btn btn-primary"
			onclick={handleNextClick}
			disabled={selectedFiles.length === 0 || isUploading}
		>
			{isUploading ? 'Uploading...' : 'Next'}
		</button>
		
		{#if selectedFiles.length > 0}
			<span class="text-sm text-gray-600">
				{selectedFiles.length} file(s) selected
			</span>
		{/if}
	</div>

	{#if uploadResults.length > 0}
		<div class="mt-4">
			<h4 class="font-medium">Upload Results:</h4>
			<ul class="list-disc list-inside text-sm">
				{#each uploadResults as result}
					<li>
						{result.type}: {result.url}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
