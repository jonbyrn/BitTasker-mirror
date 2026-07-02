<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import type { DelegationState } from '$lib/types/wallet';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconRefresh from '~icons/mdi/refresh';
	import IconClose from '~icons/mdi/close';

	// -----------------------------------------------------------------------
	// Types
	// -----------------------------------------------------------------------

	/**
	 * Recovery state passed into the modal.
	 */
	interface RecoveryState {
		/** Current delegation state from the state machine */
		delegState: DelegationState;
		/** Human-readable status message */
		message: string;
		/** Current retry attempt (0-based) */
		retryCount: number;
		/** Maximum retry attempts before giving up */
		maxRetries: number;
	}

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------

	let {
		isOpen = false,
		recoveryState = {
			delegState: 'RECOVERY_NEEDED' as DelegationState,
			message: '',
			retryCount: 0,
			maxRetries: 3
		},
		onRetry = () => {},
		onDismiss = () => {}
	}: {
		isOpen: boolean;
		recoveryState: RecoveryState;
		onRetry: () => void;
		onDismiss: () => void;
	} = $props();

	// -----------------------------------------------------------------------
	// Local state
	// -----------------------------------------------------------------------

	let modalElement = $state<HTMLElement | null>(null);
	let previousActiveElement: HTMLElement | null = null;

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------

	/** Whether retry is still viable */
	const canRetry = $derived(recoveryState.retryCount < recoveryState.maxRetries);

	/** Human-readable label for the current delegation state */
	const stateLabel = $derived.by(() => {
		const key = recoveryState.delegState.toLowerCase();
		// Map delegation states to i18n keys
		const labels: Record<string, string> = {
			idle: $t('wallet.delegation_recovery.status_idle'),
			auth_signing: $t('wallet.delegation_recovery.status_auth_signing'),
			auth_signed: $t('wallet.delegation_recovery.status_auth_signed'),
			tx1_submitted: $t('wallet.delegation_recovery.status_tx1_submitted'),
			tx1_mined: $t('wallet.delegation_recovery.status_tx1_mined'),
			cleanup_needed: $t('wallet.delegation_recovery.status_cleanup_needed'),
			tx2_submitted: $t('wallet.delegation_recovery.status_tx2_submitted'),
			tx2_mined: $t('wallet.delegation_recovery.status_tx2_mined'),
			recovery_needed: $t('wallet.delegation_recovery.status_recovery_needed')
		};
		return labels[key] ?? recoveryState.delegState;
	});

	// -----------------------------------------------------------------------
	// Lifecycle: focus trap, body scroll, escape key
	// -----------------------------------------------------------------------

	$effect(() => {
		if (isOpen) {
			previousActiveElement = (document.activeElement as HTMLElement) || null;
			document.body.style.overflow = 'hidden';

			const raf = requestAnimationFrame(() => {
				modalElement?.focus();
			});

			return () => {
				cancelAnimationFrame(raf);
				document.body.style.overflow = '';
				previousActiveElement?.focus();
			};
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			onDismiss();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onDismiss();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-99 bg-black/60 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="presentation"
		transition:fade={{ duration: 200 }}
	></div>

	<!-- Modal -->
	<div
		class="fixed inset-0 z-100 flex items-end justify-center sm:items-center sm:p-4"
		role="presentation"
	>
		<div
			bind:this={modalElement}
			class="bg-base-100 flex w-full flex-col rounded-t-2xl shadow-2xl outline-none sm:max-w-md sm:rounded-2xl"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="delegation-recovery-title"
			tabindex="-1"
			transition:fly={{ y: 40, duration: 300 }}
		>
			<!-- Header -->
			<div class="border-base-300 flex items-center justify-between border-b px-4 py-3">
				<div class="flex items-center gap-2">
					<IconAlertCircle class="text-warning h-5 w-5 shrink-0" />
					<h2 id="delegation-recovery-title" class="text-base font-bold">
						{$t('wallet.delegation_recovery.title')}
					</h2>
				</div>
				<button
					class="btn btn-ghost btn-sm btn-circle"
					onclick={onDismiss}
					aria-label={$t('common.close')}
				>
					<IconClose class="h-4 w-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="space-y-4 px-4 py-5">
				<!-- Description -->
				<p class="text-base-content/80 text-sm">
					{recoveryState.message || $t('wallet.delegation_recovery.description')}
				</p>

				<!-- Status card -->
				<div class="bg-base-200 rounded-box space-y-2 p-3">
					<div class="flex items-center justify-between text-sm">
						<span class="text-base-content/70">{$t('wallet.transaction.status')}</span>
						<span class="badge badge-warning badge-sm font-medium">{stateLabel}</span>
					</div>

					{#if recoveryState.retryCount > 0}
						<div class="flex items-center justify-between text-sm">
							<span class="text-base-content/70">{$t('wallet.send.status.retry')}</span>
							<span class="text-xs">
								{$t('wallet.delegation_recovery.retry_attempt', {
									values: {
										current: recoveryState.retryCount + 1,
										max: recoveryState.maxRetries
									}
								})}
							</span>
						</div>

						<!-- Retry progress bar -->
						<div class="bg-base-300 h-1.5 w-full overflow-hidden rounded-full">
							<div
								class="bg-warning h-full rounded-full transition-all duration-500"
								style="width: {((recoveryState.retryCount + 1) / recoveryState.maxRetries) * 100}%"
							></div>
						</div>
					{/if}
				</div>

				<!-- Cleanup pending message -->
				<div class="alert alert-warning bg-warning/10 border-warning/20 border">
					<IconRefresh class="h-5 w-5 shrink-0 animate-spin" />
					<span class="text-sm">{$t('wallet.delegation_recovery.cleanup_pending')}</span>
				</div>
			</div>

			<!-- Footer actions -->
			<div class="border-base-300 flex gap-2 border-t px-4 py-3">
				<button class="btn btn-ghost min-h-[44px] flex-1 text-sm" onclick={onDismiss}>
					{$t('wallet.delegation_recovery.dismiss_button')}
				</button>

				<button
					class="btn btn-warning min-h-[44px] flex-1 text-sm"
					class:btn-disabled={!canRetry}
					onclick={onRetry}
				>
					<IconRefresh class="h-4 w-4" />
					{$t('wallet.delegation_recovery.retry_button')}
				</button>
			</div>
		</div>
	</div>
{/if}
