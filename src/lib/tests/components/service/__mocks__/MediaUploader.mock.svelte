<script lang="ts">
	import type { UploadResult } from '$lib/api/services/upload.service';

	let {
		onChange = (_results: UploadResult[]) => {},
		files = []
	}: {
		onChange?: (results: UploadResult[]) => void;
		files?: string[];
	} = $props();

	function addMockUpload() {
		onChange([
			{
				url: 'https://cdn.example.test/mock-upload.webp',
				key: 'mock-upload',
				type: 'image',
				size: 1024
			}
		]);
	}
</script>

<div data-testid="mock-media-uploader">
	<button type="button" onclick={addMockUpload}>Add Upload</button>
	<span data-testid="mock-media-count">{files.length}</span>
</div>
