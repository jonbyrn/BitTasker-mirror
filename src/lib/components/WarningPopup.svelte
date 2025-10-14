<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { t } from 'svelte-i18n';
	import HelpModal from './wallet/HelpModal.svelte';
	import { Preferences } from '@capacitor/preferences';

	interface Props {
		onClose?: () => void;
	}

	let { onClose }: Props = $props();

	let isVisible = $state(false);
	let showHelpModal = $state(false);

	onMount(async () => {
		const hasAcknowledged = await Preferences.get({
			key: StorageKeys.WARNING_ACKNOWLEDGED
		});
		if (!hasAcknowledged.value) {
			isVisible = true;
			return;
		}
	});

	async function handleAcknowledge() {
		await Preferences.set({
			key: StorageKeys.WARNING_ACKNOWLEDGED,
			value: 'true'
		}).then(() => {
			isVisible = false;
			if (onClose) {
				onClose();
			}
		});
	}

	function handleFeedbackClick() {
		// Navigate to feedback page using SvelteKit router
		goto('/feedback');
	}

	function handleLearnMoreClick() {
		showHelpModal = true;
	}

	function handleHelpModalClose() {
		showHelpModal = false;
	}
</script>

<!-- Modal -->
<input
	type="checkbox"
	class="modal-toggle"
	checked={isVisible}
	style="display:none"
	readonly
	aria-label={$t('common.components.warning_popup.title')}
/>
{#if isVisible}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<!-- Modal Header -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-warning/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-warning h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">{$t('common.components.warning_popup.title')}</h4>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="space-y-4">
				<!-- Warning Message -->
				<div class="bg-warning/10 rounded-lg p-4">
					<p class="font-mono text-sm">
						{$t('common.components.warning_popup.message')}
						<button
							class="text-primary hover:text-primary-focus cursor-pointer underline"
							onclick={handleLearnMoreClick}
						>
							{$t('common.components.warning_popup.learn_more')}
						</button>
					</p>
				</div>

				<!-- Feedback Information -->
				<div class="flex items-start gap-2">
					<div class="flex h-5 w-5 items-center justify-center rounded-full">
						<svg class="text-info h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="text-base-content/70 text-sm">
						<p>
							{$t('common.components.warning_popup.feedback_text')}
							<button
								class="text-primary hover:text-primary-focus cursor-pointer"
								onclick={handleFeedbackClick}
							>
								{$t('common.components.warning_popup.feedback_link')}
							</button>
							{$t('common.components.warning_popup.feedback_suffix')}
						</p>
					</div>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="border-base-300 flex gap-3 pt-6">
				<!-- <button
					type="button"
					class="btn btn-ghost flex-1"
					onclick={handleAcknowledge}
				>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
					{$t('common.cancel')}
				</button> -->
				<button type="button" class="btn btn-primary flex-1" onclick={handleAcknowledge}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					{$t('common.components.warning_popup.acknowledge_button')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={handleAcknowledge}
			aria-label={$t('common.components.warning_popup.title')}
		></button>
	</div>
{/if}

<!-- Help Modal -->
{#if showHelpModal}
	<HelpModal onClose={handleHelpModalClose} showButton={false} />
{/if}
