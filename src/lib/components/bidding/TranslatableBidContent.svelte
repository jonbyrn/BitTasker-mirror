<script lang="ts">
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import type { TranslationResult, TranslationError } from '$lib/services/translation.service';

	let {
		content,
		contentType = 'description', // 'description', 'proposedApproach', 'coverLetter'
		showToggle = true,
		contentClass = 'text-base-content/80 text-sm leading-relaxed',
		fallbackClass = 'text-base-content/80 line-clamp-2'
	} = $props<{
		content: string;
		contentType?: 'description' | 'proposedApproach' | 'coverLetter';
		showToggle?: boolean;
		contentClass?: string;
		fallbackClass?: string;
	}>();

	let translatedContent = $state<string | null>(null);
	let isTranslating = $state(false);
	let showOriginal = $state(false);

	$effect(() => {
		const userLang = $currentUserLanguage;
		if (userLang && content && userLang !== 'en') {
			isTranslating = true;
			taskTranslationService.translateText(content, userLang).then(result => {
				if (result && 'translatedText' in result) {
					translatedContent = result.translatedText;
				}
				isTranslating = false;
			});
		}
	});

	function toggleTranslation() {
		showOriginal = !showOriginal;
	}

	// Determine which class to use based on content type
	const displayClass = contentType === 'description' ? fallbackClass : contentClass;
</script>

<div class="translatable-bid-content">
	{#if isTranslating}
		<div class="loading-skeleton animate-pulse">
			<div class="h-4 bg-gray-200 rounded w-3/4"></div>
		</div>
	{:else if translatedContent && !showOriginal}
		<p class={contentClass}>{translatedContent}</p>

		{#if showToggle}
			<button
				class="text-xs text-blue-500 hover:text-blue-700 mt-1"
				onclick={toggleTranslation}
			>
				{translatedContent ? 'Ver original' : 'View original'}
			</button>
		{/if}
	{:else}
		<p class={displayClass}>{content}</p>

		{#if translatedContent && showToggle}
			<button
				class="text-xs text-blue-500 hover:text-blue-700 mt-1"
				onclick={toggleTranslation}
			>
				{translatedContent ? 'Traducir' : 'Translate'}
			</button>
		{/if}
	{/if}
</div>
