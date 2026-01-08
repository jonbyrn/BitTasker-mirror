<script lang="ts">
	import { t } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { appStore } from '$lib/stores/app.store';
	import IconClose from '~icons/mdi/close';

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
	let shareSuccess = $state(false);
	let profileUrl = $state('');
	let lastProfileUrl = $state('');

	// Load npub when modal opens
	$effect(() => {
		if (isOpen && !npub && !isLoadingNpub) {
			loadNpub();
		}
	});

	// Generate profile URL and QR code when modal opens and npub is loaded
	$effect(() => {
		if (isOpen && npub) {
			// Build profile URL with UTM parameters
			if (typeof window !== 'undefined') {
				const baseUrl = `${window.location.origin}/npub/${npub}`;
				const utmParams = new URLSearchParams({
					utm_source: 'bittasker.com',
					utm_medium: 'qrcode',
					utm_campaign: 'profile_qrcode'
				});
				const newProfileUrl = `${baseUrl}?${utmParams.toString()}`;
				
				if (newProfileUrl !== lastProfileUrl || !qrCodeDataUrl) {
					profileUrl = newProfileUrl;
					lastProfileUrl = newProfileUrl;
					generateQrCode();
				}
			}
		}
	});

	// Reset state when modal closes
	$effect(() => {
		if (!isOpen) {
			// Reset state when modal closes to ensure fresh data on next open
			npub = '';
			qrCodeDataUrl = '';
			profileUrl = '';
			lastProfileUrl = '';
			shareSuccess = false;
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
		if (!profileUrl) return;
		
		// Only regenerate if profile URL changed or QR code doesn't exist
		if (qrCodeDataUrl && profileUrl === lastProfileUrl) {
			return;
		}
		
		isGeneratingQr = true;
		try {
			qrCodeDataUrl = await generateQrCodeUrl(profileUrl);
		} catch (err) {
			console.error('Failed to generate profile QR code:', err);
		} finally {
			isGeneratingQr = false;
		}
	}

	// Handle share functionality (similar to task details page)
	const handleShare = async () => {
		if (!profileUrl) return;

		if (navigator.share) {
			try {
				const shareData: ShareData = {
					title: 'My BitTasker Profile',
					text: 'Check out my profile on BitTasker',
					url: profileUrl
				};

				await navigator.share(shareData);
				shareSuccess = true;
				appStore.showSuccessToast($t('dashboard.task_details_by_task.share_success') || 'Profile shared successfully!');
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} catch (error) {
				// User cancelled sharing or error occurred
				if ((error as Error).name !== 'AbortError') {
					console.log('Share cancelled or failed:', error);
					// Fallback to copy link if share fails
					const success = await copyToClipboard(profileUrl);
					if (success) {
						shareSuccess = true;
						appStore.showSuccessToast($t('dashboard.task_details_by_task.link_copied'));
						setTimeout(() => {
							shareSuccess = false;
						}, 2000);
					}
				}
			}
		} else {
			// Fallback: copy to clipboard
			const success = await copyToClipboard(profileUrl);
			if (success) {
				shareSuccess = true;
				appStore.showSuccessToast($t('dashboard.task_details_by_task.link_copied'));
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} else {
				appStore.showErrorToast($t('dashboard.task_details_by_task.link_copy_failed'));
			}
		}
	};
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
					<h3 class="text-lg font-bold">{$t('common.components.topbar.npub_qr.share_profile_title')}</h3>
					<button
						class="btn btn-sm btn-circle btn-ghost"
						onclick={onClose}
						aria-label={$t('common.close')}
					>
						<IconClose class="h-5 w-5" />
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
					{:else if npub && profileUrl}
						<div class="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
							<img
								src={qrCodeDataUrl}
								alt="Profile QR Code"
								class="w-full aspect-square"
							/>
						</div>

						<!-- Action Buttons -->
						<div class="flex flex-col gap-2 w-full max-w-md mt-8 sm:flex-row-reverse">
							<!-- Share Button -->
							<button
								class="btn btn-primary btn-sm min-h-[40px] flex-1 transition-all duration-200 {shareSuccess
									? 'btn-success'
									: ''}"
								onclick={handleShare}
								title={$t('dashboard.task_details_by_task.share_task')}
							>
								{#if shareSuccess}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="mr-1 h-4 w-4 shrink-0"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="mr-1 h-4 w-4 shrink-0"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
										/>
									</svg>
								{/if}
								{$t('dashboard.task_details_by_task.share')}
							</button>

							<!-- Close Button -->
							<button
								class="btn btn-error btn-sm min-h-[40px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex-none"
								style="-webkit-tap-highlight-color: transparent;"
								onclick={onClose}
							>
								<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
								<span class="text-sm sm:text-base">{$t('common.close')}</span>
							</button>
						</div>
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
