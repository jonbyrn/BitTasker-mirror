<script lang="ts">
	import { t } from 'svelte-i18n';
	import QRCode from 'qrcode';
	import IconClose from '~icons/mdi/close';

	interface Props {
		isOpen: boolean;
		qrUri: string | null;
		onCancel: () => void;
	}

	const props: Props = $props();

	const TIMEOUT_SECONDS = 120;

	let qrDataUrl = $state<string>('');
	let isLoadingQR = $state(false);
	let error = $state<string | null>(null);
	let timeLeft = $state(TIMEOUT_SECONDS);
	let timerInterval: ReturnType<typeof setInterval> | undefined = $state(undefined);

	// Reset state when modal opens with a new URI
	$effect(() => {
		if (!props.isOpen) {
			// Modal closed: clean up
			if (timerInterval) {
				clearInterval(timerInterval);
				timerInterval = undefined;
			}
			timeLeft = TIMEOUT_SECONDS;
			error = null;
			qrDataUrl = '';
			isLoadingQR = false;
			return;
		}

		// Modal opened: reset and start fresh
		timeLeft = TIMEOUT_SECONDS;
		error = null;
		qrDataUrl = '';
		isLoadingQR = true;

		// Start countdown
		timerInterval = setInterval(() => {
			timeLeft = Math.max(0, timeLeft - 1);
		}, 1000);

		return () => {
			if (timerInterval) {
				clearInterval(timerInterval);
				timerInterval = undefined;
			}
		};
	});

	// Generate QR when URI changes
	$effect(() => {
		const uri = props.qrUri;
		if (!props.isOpen || !uri) return;

		isLoadingQR = true;
		error = null;

		QRCode.toDataURL(uri, {
			width: 280,
			margin: 2,
			color: {
				dark: '#000000',
				light: '#FFFFFF'
			},
			errorCorrectionLevel: 'M'
		})
			.then((dataUrl: string) => {
				qrDataUrl = dataUrl;
				isLoadingQR = false;
			})
			.catch((err: unknown) => {
				console.error('[WalletConnectQRModal] Failed to generate QR code:', err);
				error = err instanceof Error ? err.message : $t('wallet.connected.qr.error');
				isLoadingQR = false;
			});
	});

	function handleCancel(): void {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = undefined;
		}
		timeLeft = TIMEOUT_SECONDS;
		props.onCancel();
	}

	function handleBackdropClick(): void {
		// Only allow closing via the cancel button to prevent accidental dismiss
	}

	const hasUri = $derived(!!props.qrUri);
	const isTimedOut = $derived(timeLeft <= 0);
	const isError = $derived(error !== null || isTimedOut);
</script>

{#if props.isOpen}
	<!-- Backdrop -->
	<div
		class="bg-base-content/50 fixed inset-0 z-100 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="presentation"
		aria-hidden="true"
	></div>

	<!-- Modal -->
	<div
		class="bg-base-100 fixed inset-0 z-101 flex flex-col items-center justify-center px-4 py-8"
		role="dialog"
		aria-modal="true"
		aria-label={$t('wallet.connected.walletconnect_name')}
		aria-describedby="qr-modal-desc"
		tabindex="-1"
		onkeydown={(e: KeyboardEvent) => {
			if (e.key === 'Escape') handleCancel();
		}}
	>
		<span id="qr-modal-desc" class="sr-only">{$t('wallet.connected.qr.sr_description')}</span>
		<div class="w-full max-w-sm space-y-6">
			<!-- Header -->
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-bold">{$t('wallet.connected.walletconnect_name')}</h2>
				<button
					class="btn btn-ghost btn-sm btn-square"
					onclick={handleCancel}
					aria-label={$t('common.cancel')}
				>
					<IconClose class="h-5 w-5" />
				</button>
			</div>

			<!-- QR Code Area -->
			<div class="flex flex-col items-center gap-4">
				{#if isLoadingQR}
					<!-- Loading State -->
					<div class="bg-base-200 flex h-[280px] w-[280px] items-center justify-center rounded-xl">
						<div class="flex flex-col items-center gap-3">
							<span class="loading loading-spinner loading-lg text-primary"></span>
							<span class="text-base-content/60 text-sm">{$t('wallet.connected.qr.preparing')}</span
							>
						</div>
					</div>
				{:else if isError}
					<!-- Error State -->
					<div class="bg-base-200 flex h-[280px] w-[280px] items-center justify-center rounded-xl">
						<div class="flex flex-col items-center gap-3 px-4 text-center">
							<div class="text-error text-4xl">&#x26A0;</div>
							<p class="text-base-content/70 text-sm">
								{isTimedOut
									? $t('wallet.connected.qr.expired_message')
									: error || $t('wallet.connected.qr.error')}
							</p>
						</div>
					</div>
				{:else if hasUri && qrDataUrl}
					<!-- QR Display -->
					<div class="rounded-xl bg-white p-3 shadow-lg">
						<img
							src={qrDataUrl}
							alt={$t('wallet.connected.walletconnect_name')}
							class="h-[280px] w-[280px]"
							width="280"
							height="280"
						/>
					</div>
				{:else}
					<!-- Waiting for URI -->
					<div class="bg-base-200 flex h-[280px] w-[280px] items-center justify-center rounded-xl">
						<div class="flex flex-col items-center gap-3">
							<span class="loading loading-spinner loading-lg text-primary"></span>
							<span class="text-base-content/60 text-sm"
								>{$t('wallet.connected.qr.initializing')}</span
							>
						</div>
					</div>
				{/if}

				<!-- Instruction Text -->
				<p class="text-base-content/80 text-center text-sm">
					{$t('wallet.connected.qr.scan_instruction')}
				</p>

				<!-- Countdown Timer -->
				<div class="flex items-center gap-2">
					{#if isTimedOut}
						<span class="text-error text-sm font-medium">{$t('wallet.connected.qr.expired')}</span>
					{:else}
						<span
							class="countdown text-base-content/70 font-mono text-xl"
							class:text-error={timeLeft <= 30}
						>
							<span style="--value: {Math.floor(timeLeft / 60)};"></span>:<span
								style="--value: {timeLeft % 60};"
							></span>
						</span>
					{/if}
				</div>
			</div>

			<!-- Cancel Button -->
			<button
				class="btn btn-outline btn-block min-h-[44px] touch-manipulation transition-transform duration-100 select-none active:scale-95"
				onclick={handleCancel}
			>
				{$t('common.cancel')}
			</button>
		</div>
	</div>
{/if}
