<script lang="ts">
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { goto } from '$app/navigation';

	async function logout() {
		await authState.logout();
		goto('/');
	}
</script>

<!-- Account Actions Section -->
<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<h4 class="card-title text-error">{$t('settings.actions.title')}</h4>
		<p class="text-base-content/70 mb-3">{$t('settings.actions.description')}</p>

		<div class="flex flex-col gap-4">
			<button class="btn btn-error btn-outline" onclick={logout}>
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
						d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
					/>
				</svg>
				{$t('settings.actions.logout')}
			</button>
		</div>
	</div>
</div>
