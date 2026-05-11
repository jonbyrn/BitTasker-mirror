<script lang="ts">
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { goto } from '$app/navigation';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import DeleteAccountModal from '$lib/components/settings/DeleteAccountModal.svelte';

	let showLogoutModal = $state(false);
	let showDeleteAccountModal = $state(false);
	let actionsExpanded = $state(false);

	async function confirmedLogout() {
		showLogoutModal = false;
		await authState.logout();
		await goto('/', { replaceState: true });
	}
</script>

<!-- Account Actions Section -->
<div
	class="collapse-arrow bg-base-100 collapse rounded-lg shadow-xl"
	class:collapse-open={actionsExpanded}
>
	<button
		type="button"
		class="collapse-title border-base-300 flex items-center gap-2 border-b text-left"
		onclick={() => (actionsExpanded = !actionsExpanded)}
	>
		<h4 class="text-lg font-semibold">{$t('settings.actions.title')}</h4>
	</button>
	<div class="collapse-content">
		<p class="text-base-content/70 mb-3">{$t('settings.actions.description')}</p>

		<div class="flex flex-col gap-4">
			<!-- Logout -->
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

			<!-- Divider -->
			<div class="divider my-0"></div>

			<!-- Delete Account -->
			<button class="btn btn-error btn-outline" onclick={() => (showDeleteAccountModal = true)}>
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

<!-- Logout Confirmation Modal -->
<ConfirmModal
	isOpen={showLogoutModal}
	title={$t('common.components.confirm_modal.logout.title')}
	message={$t('common.components.confirm_modal.logout.message')}
	confirmText={$t('common.components.confirm_modal.confirm')}
	confirmButtonClass="btn-primary"
	onConfirm={confirmedLogout}
	onCancel={() => (showLogoutModal = false)}
/>

<!-- Delete Account Modal -->
<DeleteAccountModal
	isOpen={showDeleteAccountModal}
	onClose={() => (showDeleteAccountModal = false)}
/>
