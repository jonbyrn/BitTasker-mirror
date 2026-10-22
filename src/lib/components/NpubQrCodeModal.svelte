<script lang="ts">
	import { t } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { Capacitor } from '@capacitor/core';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { shareEntity, type EntitySharePayload } from '$lib/components/shared/entity-share';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { truncateNpub } from '$lib/utils/nostr';
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
	let qrError = $state(false);
	let isLoadingNpub = $state(false);
	let copied = $state(false);
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
			qrError = false;
			copied = false;
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
		qrError = false;
		try {
			const url = await generateQrCodeUrl(profileUrl);
			qrCodeDataUrl = url;
			qrError = !url;
		} catch (err) {
			qrCodeDataUrl = '';
			qrError = true;
			console.error('Failed to generate profile QR code:', err);
		} finally {
			isGeneratingQr = false;
		}
	}

	const shortenedNpub = $derived(npub ? truncateNpub(npub) : '');

	async function copyNpub() {
		if (!npub) return;
		const ok = await copyToClipboard(npub);
		if (!ok) {
			appStore.showErrorToast($t('common.toast.link_copy_failed'));
			return;
		}
		copied = true;
		appStore.showSuccessToast($t('common.components.topbar.npub_qr.copied'));
		setTimeout(() => {
			copied = false;
		}, 2000);
	}

	// Handle share using the shared entity-share cascade (native → web → clipboard)
	const handleShare = async () => {
		if (!profileUrl) return;

		const payload: EntitySharePayload = {
			title: $t('profile.page.share_title'),
			text: $t('profile.page.share_message_no_desc'),
			url: profileUrl
		};

		const result = await shareEntity(payload, {
			isNativePlatform: Capacitor.isNativePlatform(),
			nativeShare: async (p) => {
				const { Share } = await import('@capacitor/share');
				await Share.share({ title: p.title, text: p.text, url: p.url, dialogTitle: p.dialogTitle });
			},
			webShare: navigator.share ? (p) => navigator.share(p) : null,
			copyToClipboard
		});

		if (result === 'shared' || result === 'copied') {
			shareSuccess = true;
			appStore.showSuccessToast(
				result === 'shared' ? $t('common.toast.share_success') : $t('common.toast.link_copied')
			);
			setTimeout(() => {
				shareSuccess = false;
			}, 2000);
		} else if (result === 'copy_failed') {
			appStore.showErrorToast($t('common.toast.link_copy_failed'));
		}
	};
</script>

{#snippet npubRow()}
	{#if shortenedNpub}
		<div class="mt-4 flex w-full max-w-xs items-center justify-between gap-2">
			<span class="font-mono text-sm" data-testid="share-npub">{shortenedNpub}</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs"
				data-testid="share-npub-copy"
				onclick={() => void copyNpub()}
			>
				{copied
					? $t('common.components.topbar.npub_qr.copied')
					: $t('common.components.topbar.npub_qr.copy')}
			</button>
		</div>
	{/if}
{/snippet}

<!-- NPub QR Code Modal -->
{#if isOpen}
	<div class="modal modal-open npub-share-modal" data-testid="npub-share-modal">
		<div class="modal-box bg-base-100 flex max-h-[85vh] max-w-md flex-col p-0">
			<div class="flex min-h-0 flex-1 flex-col">
				<!-- Header -->
				<div
					class="bg-base-300 flex shrink-0 items-center justify-between rounded-t-lg px-3 py-2 sm:px-4 sm:py-3"
				>
					<div class="flex items-center gap-2 sm:gap-3">
						<h4 class="text-base-content text-base font-bold sm:text-lg">
							{$t('common.components.topbar.npub_qr.share_profile_title')}
						</h4>
					</div>
					<button
						class="btn btn-sm btn-circle btn-ghost hover:bg-white/20"
						onclick={onClose}
						aria-label={$t('common.close')}
					>
						<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
					</button>
				</div>

				<!-- QR Code Content -->
				<div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-6">
					{#if isLoadingNpub}
						<div class="flex flex-col items-center gap-4">
							<span class="loading loading-spinner loading-lg"></span>
							<p class="text-base-content/70">{$t('common.loading')}</p>
						</div>
					{:else if !qrError && (isGeneratingQr || !qrCodeDataUrl)}
						<div class="flex flex-col items-center gap-4">
							<span class="loading loading-spinner loading-lg"></span>
							<p class="text-base-content/70">
								{$t('common.components.topbar.npub_qr.generating')}
							</p>
							{@render npubRow?.()}
						</div>
					{:else if qrError || !qrCodeDataUrl}
						<div class="alert alert-error">
							<span>{$t('common.components.topbar.npub_qr.error')}</span>
						</div>
						{@render npubRow?.()}
						<button class="btn btn-outline btn-sm mt-4" type="button" onclick={generateQrCode}>
							{$t('common.components.topbar.npub_qr.retry')}
						</button>
					{:else if npub && profileUrl}
						<div class="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl">
							<img src={qrCodeDataUrl} alt="Profile QR Code" class="aspect-square w-full" />
						</div>
						{@render npubRow?.()}

						<!-- Action Buttons -->
						<div class="mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row-reverse">
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
			<button type="button" onclick={onClose}>close</button>
		</form>
	</div>
{/if}

<style>
	/* A closed share dialog must not keep a full-screen layer over the avatar. */
	:global(.modal:not(.modal-open)),
	:global(.modal:not(.modal-open) .modal-backdrop) {
		display: none;
		visibility: hidden;
		pointer-events: none;
	}
</style>
