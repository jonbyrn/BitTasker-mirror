<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		passkeyMigration,
		skipCountdown,
		retryMigration,
		continueAfterMigration
	} from '$lib/utils/helpers/migratePasskey';
	import Modal from '$lib/components/Modal.svelte';

	async function handleRetry() {
		try {
			await retryMigration();
		} catch (error) {
			console.error('Retry failed:', error);
			// Error state is already updated in retryMigration
		}
	}

	const title = {
		info: $t('passkey_migration.info.title'),
		processing: $t('passkey_migration.processing.title'),
		success: $t('passkey_migration.success.title'),
		migrated: $t('passkey_migration.migrated.title'),
		error: $t('passkey_migration.error.title')
	};
</script>

<Modal
	isOpen={$passkeyMigration.isOpen}
	title={title[$passkeyMigration.state]}
	onClose={() => {}}
	showCloseButton={false}
>
	{#if $passkeyMigration.state === 'info'}
		<!-- Information Screen -->
		<div class="space-y-6">
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-8 w-8 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
				</div>
				<p class="text-base-content text-lg">
					{$t('passkey_migration.info.description')}
				</p>
			</div>

			<!-- Key Points -->
			<div class="alert alert-outline alert-info">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex flex-col gap-2">
					<p class="font-semibold">{$t('passkey_migration.info.what_happens')}</p>
					<ul class="list-disc list-inside space-y-1 text-sm">
						<li>{$t('passkey_migration.info.point_1')}</li>
						<li>{$t('passkey_migration.info.point_2')}</li>
						<li>{$t('passkey_migration.info.point_3')}</li>
					</ul>
				</div>
			</div>

			<!-- Device Warning -->
			<div class="alert alert-outline alert-warning">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.964-1.333-2.732 0L3.268 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<div>
					<p class="font-semibold">{$t('passkey_migration.info.device_warning_title')}</p>
					<p class="text-sm">{$t('passkey_migration.info.device_warning_message')}</p>
				</div>
			</div>

			<!-- Countdown and Continue Button -->
			<div class="flex flex-col gap-3">
				<button class="btn btn-primary btn-block" onclick={skipCountdown}>
					{#if $passkeyMigration.countdown > 0}
						{$t('passkey_migration.info.continue_in').replace(
							'{seconds}',
							String($passkeyMigration.countdown)
						)}
					{:else}
						{$t('passkey_migration.info.continue')}
					{/if}
				</button>

				{#if $passkeyMigration.countdown > 0}
					<p class="text-center text-sm text-base-content/70">
						{$t('passkey_migration.info.auto_continue')}
					</p>
				{/if}
			</div>
		</div>
	{:else if $passkeyMigration.state === 'processing'}
		<!-- Processing Screen -->
		<div class="flex flex-col items-center gap-6 py-8">
			<div class="loading loading-spinner loading-lg text-primary"></div>
			<div class="text-center">
				<h4 class="mb-2">{$t('passkey_migration.processing.title')}</h4>
				<p class="text-base-content/70">
					{$t('passkey_migration.processing.description')}
				</p>
			</div>
		</div>
	{:else if $passkeyMigration.state === 'success'}
		<!-- Success Screen -->
		<div class="flex flex-col items-center gap-6 py-8">
			<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-12 w-12 text-success"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
			</div>
			<div class="text-center">
				<h4 class="mb-2">{$t('passkey_migration.success.message')}</h4>
				<p class="text-base-content/70">
					{$t('passkey_migration.success.redirect')}
				</p>
			</div>
		</div>
	{:else if $passkeyMigration.state === 'migrated'}
		<!-- Already Migrated Screen -->
		<div class="space-y-6">
			<div class="flex flex-col items-center gap-4 py-4">
				<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-12 w-12 text-success"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
						/>
					</svg>
				</div>
				<div class="text-center">
					<p class="text-base-content text-lg mb-2">
						{$t('passkey_migration.migrated.message')}
					</p>
					<p class="text-base-content/70 text-sm">
						{$t('passkey_migration.migrated.details')}
					</p>
				</div>
			</div>

			<!-- Important Notice -->
			<div class="alert alert-outline alert-warning">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.964-1.333-2.732 0L3.268 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<div>
					<p class="font-semibold">{$t('passkey_migration.migrated.important_title')}</p>
					<p class="text-sm">{$t('passkey_migration.migrated.important_message')}</p>
				</div>
			</div>

			<!-- Next Steps -->
			<div class="alert alert-outline alert-info">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex flex-col gap-2">
					<p class="font-semibold">{$t('passkey_migration.migrated.next_steps_title')}</p>
					<ul class="list-disc list-inside space-y-1 text-sm">
						<li>{$t('passkey_migration.migrated.next_steps.point_1')}</li>
						<li>{$t('passkey_migration.migrated.next_steps.point_2')}</li>
						<li>{$t('passkey_migration.migrated.next_steps.point_3')}</li>
					</ul>
				</div>
			</div>

			<!-- Continue Button -->
			<div class="flex flex-col gap-3">
				<button class="btn btn-primary btn-block" onclick={continueAfterMigration}>
					{$t('passkey_migration.migrated.continue')}
				</button>
			</div>
		</div>
	{:else if $passkeyMigration.state === 'error'}
		<!-- Error Screen -->
		<div class="space-y-6">
			<div class="alert alert-outline alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div>
					<p class="font-semibold">{$t('passkey_migration.error.message')}</p>
					<p class="text-sm">
						{$passkeyMigration.error || $t('passkey_migration.error.default')}
					</p>
				</div>
			</div>

			<div class="flex flex-col gap-3">
				<button class="btn btn-primary btn-block" onclick={handleRetry}>
					{$t('passkey_migration.error.retry')}
				</button>
			</div>

			<div class="text-center">
				<p class="text-sm text-base-content/70">
					{$t('passkey_migration.error.skip_info')}
				</p>
			</div>
		</div>
	{/if}
</Modal>
