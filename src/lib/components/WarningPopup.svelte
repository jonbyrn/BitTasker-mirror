<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { t } from 'svelte-i18n';
	import { Preferences } from '@capacitor/preferences';
	import { Capacitor } from '@capacitor/core';

	interface Props {
		onClose?: () => void;
	}

	let { onClose }: Props = $props();

	let isVisible = $state(false);

	onMount(async () => {
		// Only show on web platform
		if (Capacitor.getPlatform() !== 'web') return;

		const hasAcknowledged = await Preferences.get({
			key: StorageKeys.WARNING_ACKNOWLEDGED
		});
		if (!hasAcknowledged.value) {
			isVisible = true;
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
</script>

<!-- Modal -->
<input
	type="checkbox"
	class="modal-toggle"
	checked={isVisible}
	style="display:none"
	readonly
	aria-label={$t('common.components.app_notification.title')}
/>
{#if isVisible}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<!-- Modal Header -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-primary h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-lg font-bold">{$t('common.components.app_notification.title')}</h4>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="space-y-6">
				<p class="text-base-content/80 text-sm">
					{$t('common.components.app_notification.message')}
				</p>

				<div class="flex flex-row items-center justify-center gap-4">
					<!-- Google Play -->
					<a
						href="https://play.google.com/store/apps/details?id=com.bittasker.app"
						target="_blank"
						rel="noopener noreferrer"
						class="flex transform transition-transform active:scale-95"
						aria-label={$t('common.components.app_notification.google_play_aria')}
					>
						<img src="/google-play-badge.svg" alt="Get it on Google Play" class="h-10 w-auto" />
					</a>

					<!-- Zapstore -->
					<a
						href="https://zapstore.dev/apps/naddr1qvzqqqr7pvpzpdxcukch9yuvrpytr66vwlqfe0j2e4nuhdch79r52zmqh9s6tuxcqqgkxmmd9e3xjar5v9ekketj9eshquqj9fac3"
						target="_blank"
						rel="noopener noreferrer"
						class="flex transform transition-transform active:scale-95"
						aria-label={$t('common.components.app_notification.zapstore_aria')}
					>
						<img src="/zapstore-badge.svg" alt="Get it on Zapstore" class="h-10 w-auto" />
					</a>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="border-base-300 flex gap-3 pt-8">
				<button type="button" class="btn btn-primary flex-1" onclick={handleAcknowledge}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					{$t('common.components.app_notification.dismiss')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={handleAcknowledge}
			aria-label={$t('common.components.app_notification.title')}
		></button>
	</div>
{/if}
