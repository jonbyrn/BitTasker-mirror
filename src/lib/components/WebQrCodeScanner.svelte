<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { Html5Qrcode } from 'html5-qrcode';

	/**
	 * WebQrCodeScanner
	 *
	 * mode="inline"      — camera fills its parent container (caller sizes the parent).
	 * mode="fullscreen"  — fixed overlay covering the full viewport, with header & close btn.
	 * mode="modal"       — centered dialog card over a blurred backdrop.
	 * mode="auto"        — fullscreen on mobile web (<768 px), modal on desktop (≥768 px). [default]
	 *
	 * scanBtn snippet — when provided, renders a trigger button; scanner starts on click.
	 *                   When omitted the scanner starts automatically on mount.
	 */
	let {
		onScan = () => {},
		onClose = () => {},
		onError = () => {},
		scanBtn,
		mode = 'auto',
		qrboxSize = undefined,
		sources = false
	}: {
		onScan?: (result: string) => void;
		onClose?: () => void;
		onError?: (error: string) => void;
		scanBtn?: import('svelte').Snippet<[{ onStartScan: () => void }]>;
		mode?: 'inline' | 'fullscreen' | 'modal' | 'auto';
		qrboxSize?: number;
		sources?: boolean;
	} = $props();

	let fileInput = $state<HTMLInputElement | null>(null);

	let html5QrCode: Html5Qrcode | null = $state(null);
	let isScanning = $state(false);
	let errorMessage = $state<string | null>(null);
	let scanCompleted = $state(false);
	let activeMode = $state<'inline' | 'fullscreen' | 'modal'>('inline');
	let destroyed = false;

	const isDesktop = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

	function resolvedMode(): 'inline' | 'fullscreen' | 'modal' {
		if (mode !== 'auto') return mode;
		return isDesktop() ? 'modal' : 'fullscreen';
	}

	// Use stable, mode-specific IDs so CSS :global() selectors work reliably.
	// The library injects video/canvas into these elements by ID — scoped CSS
	// (.scanner-el :global(video)) never matches injected children in Svelte.
	function readerId(): string {
		if (activeMode === 'inline') return 'qr-reader-inline';
		if (activeMode === 'fullscreen') return 'qr-reader-fullscreen';
		return 'qr-reader-modal';
	}

	/**
	 * Compute a static qrbox object from the container element's real dimensions.
	 * We pass this as a plain { width, height } — NOT as a callback function —
	 * because the library calls a qrbox function inside an async "playing" event
	 * that fires after start() resolves, meaning any error thrown there becomes an
	 * unhandled rejection that bypasses our try/catch. A plain object is always safe.
	 *
	 * For inline mode we measure the actual container element so we respect whatever
	 * space the parent gives us, rather than relying on viewport dimensions.
	 */
	function computeQrbox(el: HTMLElement): { width: number; height: number } {
		if (qrboxSize !== undefined) return { width: qrboxSize, height: qrboxSize };
		if (activeMode === 'modal') return { width: 260, height: 260 };

		// For inline mode the wrapper is a 1:1 square, so clientWidth == clientHeight.
		// For fullscreen the wrapper fills the viewport.
		// Use clientWidth as the reference; fall back to innerWidth if layout not ready.
		const ref = el.clientWidth || el.offsetWidth || window.innerWidth;
		const size = Math.min(Math.max(Math.floor(ref * 0.7), 100), 350);
		return { width: size, height: size };
	}

	onMount(async () => {
		if (!scanBtn) {
			await startScan();
		}
	});

	onDestroy(() => {
		destroyed = true;
		stopAllCameraStreams();
		void stopScan();
		// NOTE: Don't call onClose() here - it should only be called when the user
		// explicitly closes the scanner (via close button), not when the component
		// is destroyed due to parent state changes (like error conditions)
	});

	function stopAllCameraStreams() {
		const selectors = [
			'#qr-reader-inline video',
			'#qr-reader-fullscreen video',
			'#qr-reader-modal video'
		];
		for (const selector of selectors) {
			const video = document.querySelector<HTMLVideoElement>(selector);
			if (video?.srcObject instanceof MediaStream) {
				video.srcObject.getTracks().forEach((track) => track.stop());
				video.srcObject = null;
			}
		}
	}

	async function startScan() {
		if (isScanning || destroyed) return;

		activeMode = resolvedMode();
		isScanning = true;
		errorMessage = null;

		// Give Svelte one tick to render the container div before we look it up.
		await new Promise((resolve) => setTimeout(resolve, 300));

		if (destroyed) {
			isScanning = false;
			return;
		}

		try {
			const elementId = readerId();
			const el = document.getElementById(elementId);
			if (!el) throw new Error('QR reader element not found');

			html5QrCode = new Html5Qrcode(elementId, { verbose: false });
			if (scanCompleted || destroyed) {
				html5QrCode.clear();
				html5QrCode = null;
				isScanning = false;
				return;
			}

			await html5QrCode.start(
				{ facingMode: 'environment' },
				{
					fps: 10,
					qrbox: computeQrbox(el),
					disableFlip: false
				},
				async (qrCodeMessage: string /* result: Html5QrcodeResult */) => {
					scanCompleted = true;
					await stopScan();
					onScan(qrCodeMessage);
				},
				() => {}
			);

			if (destroyed) {
				await stopScan();
			}
		} catch (error) {
			console.error('Failed to start scanning:', error);
			const errorMsg = error instanceof Error ? error.message : String(error);

			if (errorMsg.includes('Permission denied') || errorMsg.includes('NotAllowedError')) {
				errorMessage = $t('common.components.qr_scanner.camera_permission_denied');
			} else if (errorMsg.includes('NotFoundError') || errorMsg.includes('no camera')) {
				errorMessage = $t('common.components.qr_scanner.no_camera_found');
			} else {
				errorMessage = errorMsg;
			}

			onError(errorMessage);
			isScanning = false;
		}
	}

	async function stopScan() {
		stopAllCameraStreams();
		if (!html5QrCode) {
			isScanning = false;
			return;
		}
		try {
			try {
				await html5QrCode.stop();
			} catch (stopError) {
				if (stopError instanceof Error) {
					const msg = stopError.message.toLowerCase();
					if (!msg.includes('already stopped') && !msg.includes('not started')) {
						console.warn('Error stopping scanner:', stopError);
					}
				}
			}
			try {
				await html5QrCode.clear();
			} catch {
				// harmless
			}
		} catch (error) {
			console.error('Unexpected error stopping scanner:', error);
		} finally {
			html5QrCode = null;
			isScanning = false;
		}
	}

	async function handleClose() {
		scanCompleted = false;
		await stopScan();
		onClose();
	}

	async function deliverScan(text: string): Promise<void> {
		const value = text.trim();
		if (!value) {
			errorMessage = $t('wallet.simple.scan_clipboard_empty');
			return;
		}
		scanCompleted = true;
		await stopScan();
		onScan(value);
	}

	async function scanImage(file: File): Promise<void> {
		const hostId = 'qr-file-reader';
		let host = document.getElementById(hostId);
		if (!host) {
			host = document.createElement('div');
			host.id = hostId;
			host.hidden = true;
			document.body.appendChild(host);
		}
		const reader = new Html5Qrcode(hostId, { verbose: false });
		try {
			const text = await reader.scanFile(file, false);
			await deliverScan(text);
		} catch (error: unknown) {
			console.error('[qr] gallery scan failed', error);
			errorMessage = $t('wallet.simple.scan_no_code');
			onError(errorMessage);
		} finally {
			await reader.clear().catch(() => undefined);
		}
	}

	async function onGallery(event: Event): Promise<void> {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) return;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		await scanImage(file);
	}

	async function fromClipboard(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			if (text.trim()) {
				await deliverScan(text);
				return;
			}
		} catch (error: unknown) {
			console.warn('[qr] clipboard text failed', error);
		}
		try {
			if (typeof navigator.clipboard.read !== 'function') {
				errorMessage = $t('wallet.simple.scan_clipboard_empty');
				return;
			}
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const type = item.types.find((entry) => entry.startsWith('image/'));
				if (!type) continue;
				const blob = await item.getType(type);
				await scanImage(new File([blob], 'clipboard', { type }));
				return;
			}
		} catch (error: unknown) {
			console.warn('[qr] clipboard image failed', error);
		}
		errorMessage = $t('wallet.simple.scan_clipboard_empty');
	}

	async function handleRetry() {
		errorMessage = null;
		scanCompleted = false;
		await startScan();
	}
</script>

{@render scanBtn?.({ onStartScan: startScan })}

{#if sources}
	<div class="flex gap-2">
		<button
			type="button"
			class="btn btn-outline min-h-12 flex-1"
			data-testid="scan-gallery"
			onclick={() => fileInput?.click()}
		>
			{$t('wallet.simple.from_gallery')}
		</button>
		<button
			type="button"
			class="btn btn-outline min-h-12 flex-1"
			data-testid="scan-clipboard"
			onclick={() => void fromClipboard()}
		>
			{$t('wallet.simple.from_clipboard')}
		</button>
	</div>
	<input
		bind:this={fileInput}
		class="hidden"
		type="file"
		accept="image/*"
		onchange={(event) => void onGallery(event)}
	/>
	{#if errorMessage && !isScanning}
		<p class="text-error text-sm" data-testid="scan-source-error">{errorMessage}</p>
	{/if}
{/if}

{#if isScanning}
	{#if activeMode === 'inline'}
		<!-- ── INLINE ─────────────────────────────────────────────────────── -->
		<div
			class="web-scanner-inline relative mx-auto w-full max-w-lg overflow-hidden bg-black"
			style="aspect-ratio: 1 / 1;"
		>
			<div id="qr-reader-inline"></div>
			{#if errorMessage}
				<div class="absolute bottom-4 left-1/2 z-10 w-11/12 -translate-x-1/2">
					<div class="alert alert-error alert-outline">
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
						<span class="text-sm">{errorMessage}</span>
						<button class="btn btn-primary btn-sm" onclick={handleRetry}
							>{$t('common.buttons.retry')}</button
						>
					</div>
				</div>
			{/if}
		</div>
	{:else if activeMode === 'fullscreen'}
		<!-- ── FULLSCREEN ─────────────────────────────────────────────────── -->
		<div class="web-scanner-overlay fixed inset-0 z-9999 flex flex-col">
			<header class="relative z-10 flex shrink-0 items-center justify-between bg-black/70 p-4">
				<span class="text-lg font-semibold text-white">
					{$t('common.components.qr_scanner.scan_qr_code')}
				</span>
				<button
					aria-label={$t('common.components.qr_scanner.close')}
					class="btn btn-circle rounded-full p-2 text-white"
					onclick={handleClose}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</header>

			<div class="fullscreen-scanner-area relative flex-1 overflow-hidden">
				<div id="qr-reader-fullscreen"></div>
				{#if errorMessage}
					<div class="absolute bottom-6 left-1/2 z-10 w-11/12 -translate-x-1/2">
						<div class="alert alert-error alert-outline">
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
							<span class="text-sm">{errorMessage}</span>
							<button class="btn btn-primary btn-sm" onclick={handleRetry}
								>{$t('common.buttons.retry')}</button
							>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- ── MODAL ──────────────────────────────────────────────────────── -->
		<div
			class="fixed inset-0 z-9999 flex items-center justify-center"
			role="dialog"
			aria-modal="true"
			aria-label={$t('common.components.qr_scanner.scan_qr_code')}
		>
			<!-- Backdrop -->
			<div
				class="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onclick={handleClose}
				aria-hidden="true"
			></div>

			<!-- Card -->
			<div
				class="bg-base-100 relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl"
			>
				<!-- Header -->
				<div class="border-base-300 flex items-center justify-between border-b px-5 py-4">
					<div class="flex items-center gap-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.8"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
						<span class="font-semibold">{$t('common.components.qr_scanner.scan_qr_code')}</span>
					</div>
					<button
						aria-label={$t('common.components.qr_scanner.close')}
						class="btn btn-circle btn-ghost btn-sm"
						onclick={handleClose}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>

				<!-- Camera viewport — 1:1 square so the modal stays compact -->
				<div class="modal-scanner-area relative w-full" style="aspect-ratio: 1 / 1;">
					<div id="qr-reader-modal"></div>
				</div>

				<!-- Footer hint -->
				<div class="border-base-300 border-t px-5 py-3 text-center">
					<p class="text-base-content/60 text-xs">
						{$t('common.components.qr_scanner.point_camera_at_qr')}
					</p>
				</div>

				{#if errorMessage}
					<div class="px-4 pb-4">
						<div class="alert alert-error alert-outline">
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
							<span class="text-sm">{errorMessage}</span>
							<button class="btn btn-primary btn-sm" onclick={handleRetry}
								>{$t('common.buttons.retry')}</button
							>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	/* ── Shared: hide library chrome we don't need ── */
	:global(#qr-reader-inline__dashboard),
	:global(#qr-reader-fullscreen__dashboard),
	:global(#qr-reader-modal__dashboard),
	:global(#qr-reader-inline__scan_region img),
	:global(#qr-reader-fullscreen__scan_region img),
	:global(#qr-reader-modal__scan_region img) {
		display: none !important;
	}

	/* ── INLINE layout ── */
	:global(#qr-reader-inline) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		background: #000 !important;
		border: none !important;
	}

	:global(#qr-reader-inline > div) {
		width: 100% !important;
		height: 100% !important;
	}

	:global(#qr-reader-inline video) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		object-fit: cover !important;
		display: block !important;
	}

	:global(#qr-shaded-region) {
		position: absolute !important;
		inset: 0 !important;
		box-sizing: border-box !important;
	}

	:global(#qr-shaded-region > div) {
		background-color: #fff !important;
	}

	/* ── FULLSCREEN layout ── */
	:global(#qr-reader-fullscreen) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		background: #000 !important;
		border: none !important;
	}

	:global(#qr-reader-fullscreen > div) {
		width: 100% !important;
		height: 100% !important;
	}

	:global(#qr-reader-fullscreen video) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		object-fit: cover !important;
		display: block !important;
	}

	/* ── MODAL layout ── */
	:global(#qr-reader-modal) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		background: #000 !important;
		border: none !important;
	}

	:global(#qr-reader-modal > div) {
		width: 100% !important;
		height: 100% !important;
	}

	:global(#qr-reader-modal video) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		object-fit: cover !important;
		display: block !important;
	}
</style>
