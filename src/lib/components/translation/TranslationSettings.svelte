<script lang="ts">
	import { TranslationStore, translationSettings, translationState } from '$lib/stores/translation.store';
	import { translationService } from '$lib/services/translation.service';
	import { t } from 'svelte-i18n';
	import { loadPageTranslations } from '$lib/i18n/routeTranslations';

	// State
	let isOpen = $state(false);

	function toggleTranslation() {
		TranslationStore.toggleTranslation();
	}


	function closeModal() {
		isOpen = false;
	}

</script>

<!-- Translation Settings Button -->
<button
	class="btn btn-ghost btn-sm hover:bg-base-200 transition-colors"
	onclick={async () => {
		// Ensure translations are loaded before opening modal
		await loadPageTranslations('/dashboard/messages');
		isOpen = true;
	}}
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
				<h3 class="text-lg font-semibold">{$t('messages.translation.settings_title')}</h3>
				<button class="btn btn-sm btn-circle btn-ghost" onclick={closeModal} aria-label={$t('messages.close_modal')}>
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
							<span class="label-text">{$t('messages.translation.enable_translation')}</span>
							<input
								type="checkbox"
								class="toggle toggle-primary"
								checked={$translationSettings.enabled}
								onchange={toggleTranslation}
							/>
						</label>
					</div>

					<!-- Info message -->
					<div class="alert alert-info alert-outline">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-sm">{$t('messages.translation.info_message')}</span>
					</div>

					{#if $translationState.error}
						<div class="alert alert-error">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<div>
								<h4 class="font-bold">{$t('messages.translation.translation_error')}</h4>
								<p class="text-sm">{$translationState.error}</p>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<div class="modal-action">
				<button class="btn btn-primary" onclick={closeModal}>{$t('messages.translation.done')}</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="button" tabindex="0"></div>
	</div>
{/if}
