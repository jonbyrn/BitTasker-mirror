<script lang="ts">
	import { t } from 'svelte-i18n';
	import ErrorTroubleshootingModal, { type ErrorType } from './ErrorTroubleshootingModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import IconInformation from '~icons/mdi/information';

	interface Props {
		error: string;
		errorType?: ErrorType;
		isPasskeyError?: boolean; // Indicates if this is a passkey/biometric error
		autoOpenModal?: boolean; // Automatically open modal when error appears (default: true for passkey errors)
		showHelpButton?: boolean; // Show "Get Help" button in alert (default: true)
		onRetry?: () => void | Promise<void>; // Optional retry callback - will be passed to ErrorTroubleshootingModal
		class?: string; // Additional CSS classes for the alert container
	}

	let {
		error,
		errorType: providedErrorType,
		isPasskeyError = false,
		autoOpenModal = undefined, // Will default to isPasskeyError if not provided
		showHelpButton = true,
		onRetry,
		class: additionalClasses = ''
	}: Props = $props();

	// Auto-detect error type if not provided
	const errorType = $derived(providedErrorType || detectErrorType(error));

	let showErrorModal = $state(false);

	// errorMessage is derived from error prop - use $derived for reactive values
	const errorMessage = $derived(error || '');

	// Auto-open modal when error appears (for passkey/biometric errors)
	// $effect automatically tracks all reactive dependencies accessed inside it
	// Access props directly (error, isPasskeyError, autoOpenModal) to ensure they're tracked
	$effect(() => {
		// Close modal if error is cleared
		if (!error) {
			showErrorModal = false;
			return;
		}

		// Determine if we should auto-open - access props directly for reactivity
		const shouldOpen = autoOpenModal !== undefined ? autoOpenModal : isPasskeyError;

		// Auto-open if error exists and shouldOpen is true
		if (error && shouldOpen) {
			// Defer to next frame so DOM is ready after error appears (avoids setTimeout inside $effect)
			const rafId = requestAnimationFrame(() => {
				showErrorModal = true;
			});

			return () => cancelAnimationFrame(rafId);
		}
	});

	function openModal() {
		showErrorModal = true;
	}

	function closeModal() {
		showErrorModal = false;
	}

	// Wrapper function for retry that also closes the modal
	async function handleRetry() {
		// Close the modal first
		showErrorModal = false;
		// Then call the retry callback if provided
		if (onRetry) {
			await onRetry();
		}
	}
</script>

{#if error}
	<div class="alert alert-outline alert-error {additionalClasses}">
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
		<span class="overflow-wrap-anywhere break-all whitespace-normal flex-1">{error}</span>
		{#if showHelpButton}
			<div class="flex items-start shrink-0 ml-2">
				<button
					class="btn btn-sm btn-primary gap-1.5 sm:gap-2 shadow-sm hover:shadow-md active:scale-95 transition-all cursor-pointer"
					onclick={openModal}
					title={$t('common.components.error_troubleshooting_modal.button_title')}
					type="button"
				>
					<IconInformation class="h-4 w-4 shrink-0" />
					<span class="text-xs sm:text-sm font-medium">
						{$t('common.components.error_troubleshooting_modal.help')}
					</span>
				</button>
			</div>
		{/if}
	</div>

	<!-- Error Troubleshooting Modal -->
	{#if showErrorModal && errorMessage}
		<ErrorTroubleshootingModal
			{errorMessage}
			{errorType}
			showButton={false}
			open={showErrorModal}
			onClose={closeModal}
			onRetry={onRetry ? handleRetry : undefined}
		/>
	{/if}
{/if}
