<script lang="ts">
	import { t } from 'svelte-i18n';
	import { linear } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	let {
		npub,
		nsec,
		authMethod
	}: {
		npub: string;
		nsec: string;
		authMethod: string;
	} = $props();

	let showNsec = $state(false);
	let copySuccess = $state('');
	let qrCodeDataUrl = $state('');
	let isGeneratingQr = $state(false);
	let showQrModal = $state(false);

	async function generateQrCode() {
		if (qrCodeDataUrl && !showQrModal) {
			// QR code already generated, just show modal
			showQrModal = true;
			return;
		}
		if (nsec && authMethod !== 'alby') {
			isGeneratingQr = true;
			try {
				qrCodeDataUrl = await generateQrCodeUrl(nsec);
				showQrModal = true;
			} catch (err) {
				console.error('Failed to generate QR code:', err);
			} finally {
				isGeneratingQr = false;
			}
		}
	}

	function closeQrModal() {
		showQrModal = false;
	}

	async function _copyToClipboard(text: string, type: 'npub' | 'nsec' | 'recovery' | 'confirm') {
		try {
			copyToClipboard(text);
			copySuccess = type;
			setTimeout(() => {
				copySuccess = '';
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}
</script>

<!-- Nostr Identity Section -->
<div class="card bg-base-100 mb-6 shadow-xl">
	<div class="card-body">
		<div class="mb-1 flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h4 class="card-title">{$t('settings.nostr.title')}</h4>
		</div>
		<p class="text-base-content/70 mb-6">
			{$t('settings.nostr.description')}
		</p>

		<!-- Desktop Layout: Side by side, Mobile: Stacked -->
		<div class="flex flex-col lg:flex-row lg:gap-8">
			<!-- Left Column: Keys -->
			<div class="flex-1 lg:min-w-0">
				<!-- Public Key (NPub) -->
				<div class="mb-6">
					<label class="label" for="npub">
						<span class="label-text font-semibold">{$t('settings.nostr.publicKey-label')}</span>
					</label>
					<div class="flex gap-2">
						<input
							type="text"
							readonly
							value={npub}
							class="input input-bordered bg-base-200 flex-1 font-mono text-sm"
							placeholder={$t('settings.loading')}
						/>
						<button
							class="btn btn-square btn-outline"
							onclick={() => _copyToClipboard(npub, 'npub')}
							disabled={!npub}
						>
							{#if copySuccess === 'npub'}
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
					<div class="label">
						<span class="label-text-alt text-base-content/60 whitespace-normal">
							{$t('settings.nostr.publicKey.description')}
						</span>
					</div>
				</div>

				<!-- Private Key (NSec) -->
				<div class="mb-4">
					<label class="label" for="nsec">
						<span class="label-text font-semibold">{$t('settings.nostr.privateKey-label')}</span>
					</label>
					<div class="flex gap-2">
						<div class="relative flex-1">
							<input
								type={showNsec ? 'text' : 'password'}
								readonly
								value={nsec}
								class="input input-bordered bg-base-200 w-full pr-12 font-mono text-sm"
								placeholder={$t('settings.loading')}
							/>
							{#if authMethod !== 'alby'}
								<button
									class="absolute inset-y-0 right-2 flex items-center"
									onclick={() => (showNsec = !showNsec)}
									disabled={!nsec}
								>
									{#if showNsec}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-base-content/60 hover:text-base-content h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
											/>
										</svg>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-base-content/60 hover:text-base-content h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
											/>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
											/>
										</svg>
									{/if}
								</button>
							{/if}
						</div>
						{#if authMethod !== 'alby'}
							<button
								class="btn btn-square btn-outline"
								onclick={() => _copyToClipboard(nsec, 'nsec')}
								disabled={!nsec}
							>
								{#if copySuccess === 'nsec'}
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
						{/if}
					</div>
					<div class="label">
						{#if authMethod === 'alby'}
							<span class="label-text-alt text-info font-semibold whitespace-normal">
								{$t('settings.nostr.privateKey.alby')}
							</span>
						{:else}
							<span class="label-text-alt text-warning font-semibold whitespace-normal">
								{$t('settings.nostr.privateKey.warning')}
							</span>
						{/if}
					</div>
				</div>

				<!-- QR Code Toggle Button -->
				{#if authMethod !== 'alby'}
					<div class="flex justify-center lg:justify-end">
						<button
							class="btn btn-outline btn-sm flex gap-2"
							onclick={generateQrCode}
							disabled={!nsec || isGeneratingQr}
						>
							{#if isGeneratingQr}
								<span class="loading loading-spinner loading-xs"></span>
								{$t('settings.nostr.qrCode.generating')}
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
										d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
									/>
								</svg>
								{$t('settings.nostr.qrCode.show')}
							{/if}
						</button>
					</div>
				{/if}
			</div>

		</div>

		<!-- Security Notice -->
		<div class="alert alert-warning alert-outline mt-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.083 15.5c-.77.833.192 2.5 1.732 2.5z"
				/>
			</svg>
			<div class="text-sm">
				<p class="font-semibold">{$t('settings.security.title')}</p>
				<p>
					{$t('settings.security.description')}
				</p>
			</div>
		</div>
	</div>

	<!-- QR Code Modal -->
	{#if showQrModal && qrCodeDataUrl && authMethod !== 'alby'}
		<div class="modal modal-open">
			<div class="modal-box max-w-md max-h-[85vh] p-0 bg-base-100 flex flex-col overflow-hidden">
				<div class="flex flex-col flex-1 min-h-0">
					<!-- Header -->
					<div class="flex items-center justify-between bg-base-300 px-3 py-2 rounded-t-lg sm:px-4 sm:py-3 shrink-0">
						<div class="flex items-center gap-2 sm:gap-3">
							<h4 class="text-base font-bold text-base-content sm:text-lg">{$t('settings.nostr.title')} - {$t('settings.nostr.qrCode.show')}</h4>
						</div>
						<button
							class="btn btn-sm btn-circle btn-ghost hover:bg-white/20"
							onclick={closeQrModal}
							aria-label={$t('common.close')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 sm:h-5 sm:w-5"
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
						<div class="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl">
							<img
								src={qrCodeDataUrl}
								alt="Private Key QR Code"
								class="w-full aspect-square"
							/>
						</div>
						<!-- Close Button -->
						<button
							class="btn btn-primary w-full mt-6"
							onclick={closeQrModal}
						>
							{$t('common.close')}
						</button>
					</div>

					<!-- Footer with Security Warning -->
					<div class="p-4 border-t border-base-300 shrink-0">
						<div class="alert alert-warning alert-outline">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.083 15.5c-.77.833.192 2.5 1.732 2.5z"
								/>
							</svg>
							<span class="text-xs">{$t('settings.security.description')}</span>
						</div>
					</div>
				</div>
			</div>
			<!-- Modal backdrop -->
			<form method="dialog" class="modal-backdrop">
				<button onclick={closeQrModal}>close</button>
			</form>
		</div>
	{/if}
</div>
