<script lang="ts">
	let {
		content,
		contentType = 'description', // 'description', 'proposedApproach', 'coverLetter'
		contentClass = 'text-base-content/80 text-sm leading-relaxed',
		fallbackClass = 'text-base-content/80 line-clamp-2'
	} = $props<{
		content: string;
		contentType?: 'description' | 'proposedApproach' | 'coverLetter';
		showToggle?: boolean;
		contentClass?: string;
		fallbackClass?: string;
	}>();

	// Determine which class to use based on content type
	const displayClass = contentType === 'description' ? fallbackClass : contentClass;
</script>

<div class="translatable-bid-content">
	<p class={displayClass}>{content}</p>
</div>
