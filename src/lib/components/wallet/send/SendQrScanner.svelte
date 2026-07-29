<script lang="ts">
	import { t } from 'svelte-i18n';
	import { Capacitor } from '@capacitor/core';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import WebQrCodeScanner from '$lib/components/WebQrCodeScanner.svelte';
	import IconContentCopy from '~icons/mdi/content-copy';

	let {
		onScan,
		onClose,
		error = null,
		scannedValue = null,
		onRetry
	}: {
		onScan: (value: string) => void;
		onClose: () => void;
		error?: string | null;
		scannedValue?: string | null;
		onRetry?: () => void;
	} = $props();

	const isWeb = Capacitor.getPlatform() === 'web';

	async function copyScannedQrCode() {
		if (!scannedValue) return;

		const success = await copyToClipboard(scannedValue);
		if (success) {
			appStore.showSuccessToast($t('wallet.send.text_copied'));
			triggerHaptic(ImpactStyle.Light);
		} else {
			appStore.showErrorToast($t('wallet.send.copy_failed'));
		}
	}

	function handleScannerClose() {
		// Don't close parent if there's a QR scan error (stay on scan tab to show error)
		if (!error) {
			onClose();
		}
	}
</script>

<div class="flex min-h-full flex-col items-center justify-center gap-3 px-3 sm:gap-4 sm:px-4">
	<p class="text-base-content/70 text-xs sm:text-sm">
		{$t('wallet.send.scan_qr_code_description')}
	</p>

	{#if error}
		<!-- Error state with decoded QR code -->
		<div class="w-full space-y-3 sm:space-y-4">
			<!-- Scanned address input (shown first) -->
			<div class="form-control">
				<label for="scanned-qr-code" class="label">
					<span class="label-text">{$t('wallet.send.scanned_qr_code')}</span>
				</label>
				<div class="relative">
					<textarea
						id="scanned-qr-code"
						class="textarea textarea-bordered textarea-error w-full pr-12 {scannedValue
							? 'cursor-pointer'
							: ''}"
						readonly
						rows="4"
						onclick={copyScannedQrCode}>{scannedValue || ''}</textarea
					>
					<button
						class="btn btn-ghost btn-sm btn-square absolute top-1/2 right-2 -translate-y-1/2"
						onclick={(e) => {
							e.stopPropagation();
							copyScannedQrCode();
						}}
						aria-label={$t('wallet.copy_address')}
					>
						<IconContentCopy class="h-5 w-5" />
					</button>
				</div>
			</div>

			<!-- Error message (below address input) -->
			<div class="alert alert-outline alert-error py-2 sm:py-4" role="status" aria-live="polite">
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
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span class="text-sm">{error}</span>
			</div>

			{#if onRetry}
				<button class="btn btn-primary w-full" onclick={onRetry}>
					{$t('common.buttons.retry')}
				</button>
			{/if}
		</div>
	{:else if isWeb}
		<WebQrCodeScanner mode="inline" {onScan} onClose={handleScannerClose} />
	{:else}
		<QrCodeScanner
			onScan={(barcode) => onScan(barcode.rawValue ?? '')}
			onClose={handleScannerClose}
		/>
	{/if}
</div>
