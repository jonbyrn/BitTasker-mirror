<script lang="ts">
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { appStore } from '$lib/stores/app.store';
	import { broadcastAccountDeletion } from '$lib/nostr/accountDeletion';
	import Modal from '$lib/components/Modal.svelte';
	import authService from '$lib/api/services/auth.service';

	let { isOpen = false, onClose }: { isOpen?: boolean; onClose: () => void } = $props();

	let isDeleting = $state(false);

	async function handleConfirm() {
		if (isDeleting) return;
		isDeleting = true;

		try {
			// Step 1: Call the backend to mark the account as PENDING_DELETION.
			// This must happen first so the server-side grace period starts immediately.
			await authService.requestAccountDeletion();

			// Step 2: Broadcast Nostr deletion events (kind 5 + kind 62).
			// This MUST happen before clearing local storage because the nsec
			// is needed to sign both events. Failures are logged but do not block
			// the rest of the flow — relay cooperation is best-effort.
			await broadcastAccountDeletion();

			// Step 3: Logout (navigates to / internally)
			await authState.logout();

			// Step 4: Close the modal
			onClose();
		} catch (error) {
			console.error('[DeleteAccountModal] Account deletion failed:', error);
			appStore.showErrorToast($t('settings.delete_account.error'));
			isDeleting = false;
		}
	}

	function handleCancel() {
		if (isDeleting) return;
		onClose();
	}
</script>

<Modal
	{isOpen}
	title={$t('settings.delete_account.modal.title')}
	onClose={handleCancel}
	size="md"
	showCloseButton={!isDeleting}
	respectBottomNav={false}
>
	<div class="flex flex-col gap-4">
		<!-- Warning header -->
		<div class="alert alert-outline alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span class="font-semibold">{$t('settings.delete_account.modal.warning_title')}</span>
		</div>

		<!-- Disclosure list -->
		<ul class="flex flex-col gap-3 text-sm">
			<!-- Wallet loss -->
			<li class="flex items-start gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-error mt-0.5 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
				<span>{$t('settings.delete_account.modal.wallet_loss')}</span>
			</li>

			<!-- Nostr broadcast -->
			<li class="flex items-start gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-warning mt-0.5 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{$t('settings.delete_account.modal.nostr_broadcast')}</span>
			</li>

			<!-- Grace period (positive — can cancel) -->
			<li class="flex items-start gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-success mt-0.5 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
				<span>{$t('settings.delete_account.modal.grace_period')}</span>
			</li>

			<!-- Permanent deletion after 30 days -->
			<li class="flex items-start gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-error mt-0.5 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<span>{$t('settings.delete_account.modal.permanent_deletion')}</span>
			</li>

			<!-- Active tasks warning -->
			<li class="flex items-start gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-warning mt-0.5 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
					/>
				</svg>
				<span>{$t('settings.delete_account.modal.active_tasks_warning')}</span>
			</li>
		</ul>
	</div>

	{#snippet footer()}
		<button class="btn btn-active w-full" onclick={handleCancel} disabled={isDeleting}>
			{$t('settings.delete_account.modal.cancel_button')}
		</button>
		<button class="btn btn-error w-full" onclick={handleConfirm} disabled={isDeleting}>
			{#if isDeleting}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('settings.delete_account.deleting')}
			{:else}
				{$t('settings.delete_account.modal.confirm_button')}
			{/if}
		</button>
	{/snippet}
</Modal>
