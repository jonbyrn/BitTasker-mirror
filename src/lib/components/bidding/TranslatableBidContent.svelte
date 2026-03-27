<script lang="ts">
	import { bidTranslationService } from '$lib/services/bid-translation.service';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import type { BidTranslations } from '$lib/nostr/bid';

	type BidWithTranslations = {
		translations?: BidTranslations;
		description?: string;
		proposedApproach?: string;
		coverLetter?: string;
	};

	let {
		bid,
		content,
		contentType = 'description', // 'description', 'proposedApproach', 'coverLetter'
		contentClass = 'text-base-content/80 text-sm leading-relaxed',
		fallbackClass = 'text-base-content/80 line-clamp-2',
		showToggle = false
	} = $props<{
		bid?: BidWithTranslations | null; // Objeto bid completo con traducciones
		content: string; // Contenido original (fallback si no hay bid)
		contentType?: 'description' | 'proposedApproach' | 'coverLetter';
		showToggle?: boolean;
		contentClass?: string;
		fallbackClass?: string;
	}>();

	// Obtener el contenido a mostrar (traducido o original)
	const displayContent = $derived.by(() => {
		const userLang = $currentUserLanguage;

		// Si tenemos el objeto bid completo con traducciones, usar el servicio
		if (bid && userLang) {
			return bidTranslationService.getDisplayContent(bid, contentType, userLang, content);
		}

		// Fallback al contenido original
		return content;
	});

	// Verificar si hay traducción disponible
	const hasTranslation = $derived.by(() => {
		const userLang = $currentUserLanguage;
		if (!bid || !userLang || !bid.translations) {
			return false;
		}

		// Si el idioma del usuario coincide con el idioma fuente, no hay traducción
		if (bid.translations.sourceLanguage === userLang) {
			return false;
		}

		// Verificar si existe traducción para este campo
		return bidTranslationService.getStoredTranslation(bid, contentType, userLang) !== null;
	});

	let showOriginal = $state(false);

	function toggleTranslation() {
		showOriginal = !showOriginal;
	}

	// Determine which class to use based on content type
	const displayClass = contentType === 'description' ? fallbackClass : contentClass;
</script>

<div class="translatable-bid-content">
	{#if hasTranslation && !showOriginal}
		<!-- Mostrar contenido traducido -->
		<p class={displayClass}>{displayContent}</p>
		{#if showToggle}
			<button
				class="mt-1 text-xs text-blue-500 transition-colors hover:text-blue-700"
				onclick={toggleTranslation}
			>
				{$currentUserLanguage === 'es' ? 'Ver original' : 'View original'}
			</button>
		{/if}
	{:else}
		<!-- Mostrar contenido original -->
		<p class={displayClass}>{content}</p>
		{#if hasTranslation && showToggle}
			<button
				class="mt-1 text-xs text-blue-500 transition-colors hover:text-blue-700"
				onclick={toggleTranslation}
			>
				{$currentUserLanguage === 'es' ? 'Ver traducido' : 'View translated'}
			</button>
		{/if}
	{/if}
</div>
