<script lang="ts">
	import { getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import DeleteAccountModal from '$lib/components/settings/DeleteAccountModal.svelte';

	const settings = getContext<{
		keysReady: boolean;
		error: string;
	}>('settings');

	let showLogoutModal = $state(false);
	let showDeleteAccountModal = $state(false);

	async function confirmedLogout() {
		showLogoutModal = false;
		await authState.logout();
	}
</script>

<div in:fly={{ x: 300, duration: 250, easing: cubicOut }}>
	<div class="mb-4">
		<a href="/settings" class="btn btn-sm border-base-300 bg-base-200 gap-2 border">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg
			>
			{$t('settings.back')}
		</a>
	</div>

	{#if settings.keysReady && !settings.error}
		<div class="settings-sub-content bg-base-100 rounded-xl p-4 shadow-lg">
			<div class="mb-6">
				<h4 class="border-base-300 mb-4 border-b pb-2 text-lg font-semibold">
					{$t('settings.actions.title')}
				</h4>
				<div>
					<p class="text-base-content/70 mb-3">{$t('settings.actions.description')}</p>
					<p class="text-warning mb-3 text-sm font-medium">{$t('settings.logout.warning')}</p>

					<div class="flex flex-col gap-4">
						<button class="btn btn-error btn-outline" onclick={() => (showLogoutModal = true)}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
								/>
							</svg>
							{$t('settings.actions.logout')}
						</button>

						<div class="divider my-0"></div>

						<button
							class="btn btn-error btn-outline"
							onclick={() => (showDeleteAccountModal = true)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
							{$t('settings.actions.delete_account')}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<ConfirmModal
	isOpen={showLogoutModal}
	title={$t('settings.logout.title')}
	message={$t('settings.logout.warning')}
	confirmText={$t('settings.logout.confirm')}
	confirmButtonClass="btn-primary"
	onConfirm={confirmedLogout}
	onCancel={() => (showLogoutModal = false)}
/>

<DeleteAccountModal
	isOpen={showDeleteAccountModal}
	onClose={() => (showDeleteAccountModal = false)}
/>
