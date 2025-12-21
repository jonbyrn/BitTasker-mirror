<script lang="ts">
	import { t } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { getNpub } from '$lib/utils/nostrKeys';

	let {
		isOpen,
		onClose
	}: {
		isOpen: boolean;
		onClose: () => void;
	} = $props();

	let npub = $state('');
	let qrCodeDataUrl = $state('');
	let isGeneratingQr = $state(false);
	let isLoadingNpub = $state(false);
	let copySuccess = $state(false);
	let lastNpub = $state('');

	// Load npub when modal opens
	$effect(() => {
		if (isOpen && !npub && !isLoadingNpub) {
			loadNpub();
		}
	});

	// Generate QR code when modal opens and npub is loaded
	$effect(() => {
		if (isOpen && npub) {
			if (npub !== lastNpub || !qrCodeDataUrl) {
				lastNpub = npub;
				generateQrCode();
			}
		}
	});

	// Reset state when modal closes
	$effect(() => {
		if (!isOpen) {
			// Reset state when modal closes to ensure fresh data on next open
			npub = '';
			qrCodeDataUrl = '';
			lastNpub = '';
			copySuccess = false;
			isGeneratingQr = false;
			isLoadingNpub = false;
		}
	});

	async function loadNpub() {
		if (isLoadingNpub) return;
		
		isLoadingNpub = true;
		try {
			const rawNpub = await getNpub();
			
			// Format npub like the settings page does
			if (rawNpub.startsWith('npub')) {
				npub = rawNpub;
			} else if (/^[0-9a-fA-F]{64}$/.test(rawNpub)) {
				// It's a hex string, convert to npub format
				npub = nip19.npubEncode(rawNpub);
			} else {
				npub = rawNpub;
			}
		} catch (err) {
			console.error('Failed to load npub:', err);
		} finally {
			isLoadingNpub = false;
		}
	}

	async function generateQrCode() {
		if (!npub) return;
		
		// Only regenerate if npub changed or QR code doesn't exist
		if (qrCodeDataUrl && npub === lastNpub) {
			return;
		}
		
		isGeneratingQr = true;
		try {
			qrCodeDataUrl = await generateQrCodeUrl(npub);
		} catch (err) {
			console.error('Failed to generate npub QR code:', err);
		} finally {
			isGeneratingQr = false;
		}
	}

	async function copyNpub() {
		if (npub) {
			try {
				await copyToClipboard(npub);
				copySuccess = true;
				setTimeout(() => {
					copySuccess = false;
				}, 2000);
			} catch (err) {
				console.error('Failed to copy npub:', err);
			}
		}
	}
</script>

<!-- NPub QR Code Modal -->
{#if isOpen}
	<div class="modal modal-open">
		<div
			class="modal-box w-full h-full max-w-none p-0 bg-base-100 lg:max-w-2xl lg:h-auto lg:max-h-[90vh] flex flex-col"
		>
			<div class="flex flex-col flex-1 min-h-0">
				<!-- Header -->
				<div class="flex items-center justify-between p-4 border-b border-base-300 shrink-0">
					<h3 class="text-lg font-bold">{$t('common.components.topbar.npub_qr.title')}</h3>
					<button
						class="btn btn-sm btn-circle btn-ghost"
						onclick={onClose}
						aria-label={$t('common.close')}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<!-- QR Code Content -->
				<div class="flex-1 flex flex-col items-center justify-center p-6 min-h-0 overflow-auto">
					{#if isLoadingNpub}
						<div class="flex flex-col items-center gap-4">
							<span class="loading loading-spinner loading-lg"></span>
							<p class="text-base-content/70">{$t('common.loading')}</p>
						</div>
					{:else if isGeneratingQr || !qrCodeDataUrl}
						<div class="flex flex-col items-center gap-4">
							<span class="loading loading-spinner loading-lg"></span>
							<p class="text-base-content/70">{$t('common.components.topbar.npub_qr.generating')}</p>
						</div>
					{:else if npub}
						<div class="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
							<img
								src={qrCodeDataUrl}
								alt="Nostr Public Key QR Code"
								class="w-full aspect-square"
							/>
						</div>

						<!-- NPub Address with Copy Button -->
						<div class="w-full max-w-md mt-6">
							<label class="label" for="npub-display">
								<span class="label-text font-semibold"
									>{$t('common.components.topbar.npub_qr.npub_label')}</span
								>
							</label>
							<div class="flex gap-2">
								<input
									type="text"
									readonly
									value={npub}
									id="npub-display"
									class="input input-bordered bg-base-200 flex-1 font-mono text-sm"
								/>
								<button
									class="btn btn-square btn-outline"
									onclick={copyNpub}
									disabled={!npub}
								>
									{#if copySuccess}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-success h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M5 13l4 4L19 7"
											/>
										</svg>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
											/>
										</svg>
									{/if}
								</button>
							</div>
						</div>

						<!-- Close Button -->
						<button class="btn btn-primary mt-8" onclick={onClose}>
							{$t('common.close')}
						</button>
					{:else}
						<div class="alert alert-error">
							<span>{$t('common.components.topbar.npub_qr.error')}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>
		<!-- Modal backdrop -->
		<form method="dialog" class="modal-backdrop">
			<button onclick={onClose}>close</button>
		</form>
	</div>
{/if}
