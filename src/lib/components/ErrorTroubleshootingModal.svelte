<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import {
		getDeviceCompatibility,
		getDeviceSpecificTroubleshooting,
		type DeviceInfo
	} from '$lib/utils/helpers/deviceCompatibility';
	import { getSettingsAction, getSettingsInstructions } from '$lib/utils/helpers/deviceSettings';
	// Icon imports for unplugin-icons
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconInformation from '~icons/mdi/information';
	import IconWrench from '~icons/mdi/wrench';
	import IconRefresh from '~icons/mdi/refresh';
	import IconShieldAlert from '~icons/mdi/shield-alert';
	import IconCog from '~icons/mdi/cog';

	export type ErrorType =
		| 'biometric'
		| 'network'
		| 'authentication'
		| 'permission'
		| 'hardware'
		| 'timeout'
		| 'unknown';

	interface Props {
		onClose?: () => void;
		onRetry?: () => void | Promise<void>; // Optional retry callback - if provided, will be called instead of page reload
		errorMessage: string;
		errorType?: ErrorType;
		showButton?: boolean;
		open?: boolean; // Control modal open state programmatically
		/** 'error' = full error styling and help section; 'setup' = neutral styling, no error alert, no "Still need help?", Setup Passkey + Cancel buttons */
		variant?: 'error' | 'setup';
		retryButtonLabel?: string; // When variant is 'setup', label for primary action (default: Setup Passkey)
		cancelButtonLabel?: string; // When variant is 'setup', label for secondary button (default: Cancel)
	}

	let {
		onClose,
		onRetry,
		errorMessage,
		errorType: providedErrorType,
		showButton = false,
		open: controlledOpen,
		variant = 'error',
		retryButtonLabel,
		cancelButtonLabel
	}: Props = $props();

	// Auto-detect error type if not provided
	const errorType = $derived(providedErrorType || detectErrorType(errorMessage));

	let internalOpen = $state(false);
	let openFaqIndex = $state<number>(-1);
	let deviceInfo = $state<DeviceInfo | null>(null);
	let deviceSpecificSteps = $state<string[]>([]);
	let settingsAction = $state<ReturnType<typeof getSettingsAction> | null>(null);
	let settingsInstructions = $state<string[]>([]);

	// Use controlled open state if provided, otherwise use internal state
	const isOpen = $derived(controlledOpen !== undefined ? controlledOpen : internalOpen);

	// Load device compatibility info on mount
	onMount(async () => {
		try {
			const info = await getDeviceCompatibility();
			deviceInfo = info;
		} catch (err) {
			console.error('Failed to get device compatibility:', err);
		}
	});

	// Update device-specific steps and settings when errorType or deviceInfo changes
	$effect(() => {
		if (deviceInfo) {
			// Get device-specific troubleshooting steps
			deviceSpecificSteps = getDeviceSpecificTroubleshooting(deviceInfo, errorType);

			// Get settings action if available
			settingsAction = getSettingsAction(deviceInfo.os, deviceInfo.platform, errorType);
			settingsInstructions = getSettingsInstructions(deviceInfo.os, deviceInfo.platform, errorType);
		}
	});

	// Handle opening device settings
	async function handleOpenSettings() {
		if (!deviceInfo || !settingsAction) return;

		try {
			await settingsAction.action();
		} catch (error) {
			console.error('Failed to open settings:', error);
			// Show instructions as fallback
			// Instructions are already in settingsInstructions
		}
	}

	// Auto-open modal when showButton is false and not controlled
	$effect(() => {
		if (!showButton && controlledOpen === undefined) {
			internalOpen = true;
		}
	});

	function openModal() {
		if (controlledOpen === undefined) {
			internalOpen = true;
		}
		// If controlled, the parent component should handle opening
	}

	function closeModal() {
		if (controlledOpen === undefined) {
			internalOpen = false;
		}
		if (onClose) {
			onClose();
		}
	}

	function toggleFaq(index: number) {
		if (openFaqIndex === index) {
			openFaqIndex = -1; // Close if already open
		} else {
			openFaqIndex = index; // Open the new one
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Help Button (optional) -->
{#if showButton}
	<button
		class="btn btn-ghost btn-sm gap-2 text-xs sm:text-sm"
		onclick={openModal}
		title={$t('common.components.error_troubleshooting_modal.button_title')}
		data-error-troubleshooting-modal
	>
		<IconInformation class="h-4 w-4 shrink-0" />
		<span>{$t('common.components.error_troubleshooting_modal.troubleshoot')}</span>
	</button>
{/if}

<!-- Modal -->
<input
	type="checkbox"
	class="modal-toggle"
	checked={isOpen}
	style="display:none"
	readonly
	aria-label={$t('common.components.error_troubleshooting_modal.title')}
/>
{#if isOpen}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div
			data-testid="error-troubleshooting-modal"
			class="modal-box flex max-h-[85vh] max-w-3xl flex-col p-0"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Modal Header -->
			<div
				class="flex items-center justify-end rounded-t-lg px-3 py-2 sm:px-4 sm:py-3 {variant ===
				'error'
					? 'bg-error/10'
					: 'bg-base-200'}"
			>
				<button
					class="btn btn-sm btn-circle btn-ghost {variant === 'error' ? 'hover:bg-error/20' : ''}"
					onclick={closeModal}
					aria-label={$t('common.components.modal.close')}
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

			<!-- Modal Content -->
			<div class="flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
				<!-- Error Message Section (only in error variant) -->
				{#if variant === 'error' && errorMessage}
					<div class="alert alert-outline alert-error">
						<IconAlertCircle class="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
						<div class="min-w-0">
							<h4 class="text-base-content text-[10px] font-bold whitespace-nowrap sm:text-xs">
								{$t('common.components.error_troubleshooting_modal.error_occurred')}
							</h4>
							<p class="overflow-wrap-anywhere mt-1 text-[10px] sm:text-xs">{errorMessage}</p>
						</div>
					</div>
				{/if}

				<!-- Passkey Overview Section -->
				<div class="card bg-base-200 border-primary/20 border-2">
					<div class="card-body p-4 sm:p-6">
						<div class="mb-3 flex items-center gap-2 sm:mb-4 sm:gap-3">
							<IconShieldAlert class="text-primary h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
							<h4 class="card-title text-sm sm:text-base">
								{$t('common.components.error_troubleshooting_modal.passkey_overview.title')}
							</h4>
						</div>
						<div class="text-base-content/80 space-y-2 text-xs leading-relaxed sm:text-sm">
							<p>
								{$t('common.components.error_troubleshooting_modal.passkey_overview.description')}
							</p>
							<ul class="ml-2 list-inside list-disc space-y-1">
								<li>
									{$t('common.components.error_troubleshooting_modal.passkey_overview.benefit1')}
								</li>
								<li>
									{$t('common.components.error_troubleshooting_modal.passkey_overview.benefit2')}
								</li>
								<li>
									{$t('common.components.error_troubleshooting_modal.passkey_overview.benefit3')}
								</li>
							</ul>
						</div>
					</div>
				</div>

				<!-- Troubleshooting Steps -->
				<div class="card bg-base-200">
					<div class="card-body p-4 sm:p-6">
						<div class="mb-3 flex items-center gap-2 sm:mb-4 sm:gap-3">
							<IconWrench class="text-primary h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
							<h4 class="card-title text-sm sm:text-base">
								{$t('common.components.error_troubleshooting_modal.troubleshooting_steps_title')}
							</h4>
						</div>

						<!-- FAQ Format for Passkey Errors -->
						<div class="join join-vertical w-full">
							<!-- FAQ Item 1: Cancelled unlock request -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openFaqIndex === 0}
							>
								<button
									type="button"
									class="collapse-title min-h-[44px] text-left text-sm font-medium sm:text-base"
									onclick={() => toggleFaq(0)}
								>
									{$t('common.components.error_troubleshooting_modal.passkey_faq.question1')}
								</button>
								<div class="collapse-content">
									<p class="text-base-content/80 pt-2 text-xs leading-relaxed sm:text-sm">
										{$t('common.components.error_troubleshooting_modal.passkey_faq.answer1')}
									</p>
								</div>
							</div>

							<!-- FAQ Item 2: Lock screen -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openFaqIndex === 1}
							>
								<button
									type="button"
									class="collapse-title min-h-[44px] text-left text-sm font-medium sm:text-base"
									onclick={() => toggleFaq(1)}
								>
									{$t('common.components.error_troubleshooting_modal.passkey_faq.question2')}
								</button>
								<div class="collapse-content">
									<p class="text-base-content/80 pt-2 text-xs leading-relaxed sm:text-sm">
										{$t('common.components.error_troubleshooting_modal.passkey_faq.answer2')}
									</p>
								</div>
							</div>

							<!-- FAQ Item 3: Biometric not set up -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openFaqIndex === 2}
							>
								<button
									type="button"
									class="collapse-title min-h-[44px] text-left text-sm font-medium sm:text-base"
									onclick={() => toggleFaq(2)}
								>
									{$t('common.components.error_troubleshooting_modal.passkey_faq.question3')}
								</button>
								<div class="collapse-content">
									<p class="text-base-content/80 pt-2 text-xs leading-relaxed sm:text-sm">
										{$t('common.components.error_troubleshooting_modal.passkey_faq.answer3')}
									</p>
								</div>
							</div>

							<!-- FAQ Item 4: Permissions -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openFaqIndex === 3}
							>
								<button
									type="button"
									class="collapse-title min-h-[44px] text-left text-sm font-medium sm:text-base"
									onclick={() => toggleFaq(3)}
								>
									{$t('common.components.error_troubleshooting_modal.passkey_faq.question4')}
								</button>
								<div class="collapse-content">
									<p class="text-base-content/80 pt-2 text-xs leading-relaxed sm:text-sm">
										{$t('common.components.error_troubleshooting_modal.passkey_faq.answer4')}
									</p>
								</div>
							</div>

							<!-- FAQ Item 5: Browser/App support -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openFaqIndex === 4}
							>
								<button
									type="button"
									class="collapse-title min-h-[44px] text-left text-sm font-medium sm:text-base"
									onclick={() => toggleFaq(4)}
								>
									{$t('common.components.error_troubleshooting_modal.passkey_faq.question5')}
								</button>
								<div class="collapse-content">
									<p class="text-base-content/80 pt-2 text-xs leading-relaxed sm:text-sm">
										{$t('common.components.error_troubleshooting_modal.passkey_faq.answer5')}
									</p>
								</div>
							</div>

							<!-- FAQ Item 6: Timeout -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openFaqIndex === 5}
							>
								<button
									type="button"
									class="collapse-title min-h-[44px] text-left text-sm font-medium sm:text-base"
									onclick={() => toggleFaq(5)}
								>
									{$t('common.components.error_troubleshooting_modal.passkey_faq.question6')}
								</button>
								<div class="collapse-content">
									<p class="text-base-content/80 pt-2 text-xs leading-relaxed sm:text-sm">
										{$t('common.components.error_troubleshooting_modal.passkey_faq.answer6')}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Device-Specific Troubleshooting -->
				{#if deviceInfo && (deviceSpecificSteps.length > 0 || settingsAction || settingsInstructions.length > 0)}
					<div class="card bg-base-200 border-primary/20 border-2">
						<div class="card-body p-4 sm:p-6">
							<!-- Device Info Section - Hidden per user request -->
							{#if deviceSpecificSteps.length > 0}
								<div class="mb-4 space-y-2">
									{#each deviceSpecificSteps as stepKey (stepKey)}
										<div
											class="text-base-content/80 flex items-start gap-2 text-xs leading-relaxed sm:text-sm"
										>
											<IconCheckCircle class="text-primary mt-0.5 h-4 w-4 shrink-0" />
											<span class="min-w-0 flex-1">{$t(stepKey)}</span>
										</div>
									{/each}
								</div>
							{/if}

							<!-- Open Settings Button (for native apps) -->
							{#if settingsAction && settingsAction.available}
								<div class="border-base-content/10 mt-4 border-t pt-4">
									<button
										class="btn btn-primary btn-sm w-full gap-2 sm:w-auto"
										onclick={handleOpenSettings}
									>
										<IconCog class="h-4 w-4 shrink-0" />
										<span class="text-xs sm:text-sm">{settingsAction.label}</span>
									</button>
								</div>
							{/if}

							<!-- Settings Instructions (for web or when button not available) -->
							{#if settingsInstructions.length > 0 && (!settingsAction || !settingsAction.available)}
								<div class="border-base-content/10 mt-4 border-t pt-4">
									<div class="mb-2 flex items-start gap-2">
										<IconCog class="text-primary mt-0.5 h-4 w-4 shrink-0" />
										<h5 class="text-xs font-semibold sm:text-sm">
											{$t(
												'common.components.error_troubleshooting_modal.settings_instructions_title'
											)}
										</h5>
									</div>
									<ol
										class="text-base-content/80 ml-2 list-inside list-decimal space-y-1 text-xs leading-relaxed sm:text-sm"
									>
										{#each settingsInstructions as instructionKey (instructionKey)}
											<li>{$t(instructionKey)}</li>
										{/each}
									</ol>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Additional Help Section -->
				{#if errorType === 'biometric'}
					<div class="card bg-base-200">
						<div class="card-body p-4 sm:p-6">
							<div class="mb-3 flex items-center gap-2 sm:mb-4 sm:gap-3">
								<IconShieldAlert class="text-warning h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
								<h4 class="card-title text-sm sm:text-base">
									{$t('common.components.error_troubleshooting_modal.biometric_help_title')}
								</h4>
							</div>
							<div class="text-base-content/80 space-y-2 text-xs sm:text-sm">
								<p class="leading-relaxed">
									{$t('common.components.error_troubleshooting_modal.biometric_help_description')}
								</p>
								<ul class="ml-2 list-inside list-disc space-y-1 leading-relaxed">
									<li>
										{$t('common.components.error_troubleshooting_modal.biometric_help_point1')}
									</li>
									<li>
										{$t('common.components.error_troubleshooting_modal.biometric_help_point2')}
									</li>
									<li>
										{$t('common.components.error_troubleshooting_modal.biometric_help_point3')}
									</li>
								</ul>
							</div>
						</div>
					</div>
				{/if}

				<!-- Still Need Help Section (only in error variant) -->
				{#if variant === 'error'}
					<div class="alert alert-outline alert-info">
						<IconInformation class="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
						<div class="min-w-0">
							<h4 class="text-base-content text-sm font-bold sm:text-base">
								{$t('common.components.error_troubleshooting_modal.still_need_help_title')}
							</h4>
							<p class="mt-1 text-xs leading-relaxed sm:text-sm">
								{$t('common.components.error_troubleshooting_modal.still_need_help_description')}
							</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- Action Buttons - Fixed at bottom -->
			<div
				class="border-base-300 bg-base-100 flex shrink-0 flex-col gap-3 border-t p-4 sm:flex-row sm:gap-3 sm:p-4"
			>
				<button
					type="button"
					class="btn btn-ghost order-1 h-auto min-h-[44px] flex-1 py-3 sm:order-2 sm:flex-none sm:py-2"
					onclick={closeModal}
				>
					<IconCheckCircle class="mr-2 h-4 w-4 shrink-0 sm:h-4 sm:w-4" />
					<span class="text-sm font-medium sm:text-sm"
						>{variant === 'setup'
							? (cancelButtonLabel ??
								$t('common.components.error_troubleshooting_modal.cancel_button'))
							: $t('common.components.error_troubleshooting_modal.got_it_button')}</span
					>
				</button>
				<button
					data-testid="error-troubleshooting-modal-retry"
					type="button"
					class="btn btn-primary order-2 h-auto min-h-[44px] flex-1 py-3 sm:order-1 sm:py-2"
					onclick={async () => {
						closeModal();
						if (onRetry) {
							await onRetry();
						} else {
							window.location.reload();
						}
					}}
				>
					<IconRefresh class="mr-2 h-4 w-4 shrink-0 sm:h-4 sm:w-4" />
					<span class="text-sm font-medium sm:text-sm"
						>{variant === 'setup'
							? (retryButtonLabel ??
								$t('common.components.error_troubleshooting_modal.setup_passkey_button'))
							: $t('common.components.error_troubleshooting_modal.retry_button')}</span
					>
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={closeModal} aria-label="Close modal"></button>
	</div>
{/if}
