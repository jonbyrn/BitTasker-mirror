<script lang="ts">
	import { TranslationStore, translationSettings, translationState } from '$lib/stores/translation.store';
	import { translationService } from '$lib/services/translation.service';
	import { onMount } from 'svelte';

	// State
	let isOpen = $state(false);

	// Get current settings
	let settings = $state<any>({});
	translationSettings.subscribe((s) => {
		settings = s;
	})();

	// Get translation state
	let translationStateValue = $state<any>({});
	translationState.subscribe((s) => {
		translationStateValue = s;
	})();

	onMount(() => {
		// Only support English and Spanish
		settings = TranslationStore.getSettings();
	});

	function toggleTranslation() {
		TranslationStore.toggleTranslation();
	}

	function toggleAutoTranslate() {
		TranslationStore.toggleAutoTranslate();
	}

	function setTargetLanguage(language: string) {
		TranslationStore.setTargetLanguage(language);
	}

	function clearAllTranslations() {
		TranslationStore.clearAllTranslations();
	}

	function closeModal() {
		isOpen = false;
	}

	// Language display names - only English and Spanish
	const languageNames: Record<string, string> = {
		en: 'English',
		es: 'Spanish',
	};

	function getLanguageName(code: string): string {
		return languageNames[code] || code.toUpperCase();
	}

	// Supported languages - only English and Spanish
	const supportedLanguages = ['en', 'es'];
</script>

<!-- Translation Settings Button -->
<button
	class="btn btn-ghost btn-sm hover:bg-base-200 transition-colors"
	onclick={() => isOpen = true}
	title="Translation Settings"
	aria-label="Translation Settings"
>
	<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
	</svg>
</button>

<!-- Translation Settings Modal -->
{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-semibold">Translation Settings</h3>
				<button class="btn btn-sm btn-circle btn-ghost" onclick={closeModal} aria-label="Close modal">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			{#if !translationService.isAvailable()}
				<div class="alert alert-warning">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
					</svg>
					<div>
						<h4 class="font-bold">Translation Service Unavailable</h4>
						<p class="text-sm">Google Translate API key is not configured. Please contact support.</p>
					</div>
				</div>
			{:else}
				<div class="space-y-4">
					<!-- Enable Translation Toggle -->
					<div class="form-control">
						<label class="label cursor-pointer">
							<span class="label-text">Enable Translation</span>
							<input
								type="checkbox"
								class="toggle toggle-primary"
								checked={settings.enabled}
								onchange={toggleTranslation}
							/>
						</label>
					</div>

					{#if settings.enabled}
						<!-- Auto-translate Toggle -->
						<div class="form-control">
							<label class="label cursor-pointer">
								<span class="label-text">Auto-translate incoming messages</span>
								<input
									type="checkbox"
									class="toggle toggle-primary"
									checked={settings.autoTranslate}
									onchange={toggleAutoTranslate}
								/>
							</label>
						</div>

						<!-- Target Language Selection -->
						<div class="form-control">
							<label class="label" for="target-language-select">
								<span class="label-text">Target Language</span>
							</label>
							<select
								id="target-language-select"
								class="select select-bordered w-full"
								value={settings.targetLanguage}
								onchange={(e) => setTargetLanguage((e.target as HTMLSelectElement).value)}
							>
								{#each supportedLanguages as lang}
									<option value={lang}>{getLanguageName(lang)}</option>
								{/each}
							</select>
						</div>

						<!-- Translation Status -->
						{#if translationStateValue.isTranslating}
							<div class="alert alert-info">
								<div class="loading loading-spinner loading-sm"></div>
								<span>Translating message...</span>
							</div>
						{/if}

						{#if translationStateValue.error}
							<div class="alert alert-error">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<div>
									<h4 class="font-bold">Translation Error</h4>
									<p class="text-sm">{translationStateValue.error}</p>
								</div>
							</div>
						{/if}

						<!-- Clear Translations Button -->
						<div class="form-control">
							<button
								class="btn btn-outline btn-sm"
								onclick={clearAllTranslations}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
								Clear All Translations
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<div class="modal-action">
				<button class="btn btn-primary" onclick={closeModal}>Done</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="button" tabindex="0"></div>
	</div>
{/if}
