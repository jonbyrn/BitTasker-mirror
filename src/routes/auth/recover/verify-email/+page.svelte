<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import authService from '$lib/api/services/auth.service';

	let token = $state<string>('');
	let isLoading = $state(true);
	let error = $state<string>('');
	let success = $state(false);
	let recoveryData = $state<{ email: string; publicKey: string; message: string } | null>(null);

	onMount(async () => {
		token = page.url.searchParams.get('token') || '';

		if (!token) {
			error = $t('recovery_verify.errors.invalid_token');
			isLoading = false;
			return;
		}

		try {
			// Verify the recovery email token
			recoveryData = await authService.verifyRecoveryEmail(token);
			success = true;
		} catch (err: any) {
			console.error('Failed to verify recovery email:', err);
			error = err.message || $t('recovery_verify.errors.verification_failed');
		} finally {
			isLoading = false;
		}
	});

	function continueToRecovery() {
		if (recoveryData?.publicKey) {
			// Redirect to the recovery page with the verified public key and verified flag
			goto(`/auth/recover/${recoveryData.publicKey}?verified=true`);
		} else {
			// No public key available, show error message
			error = $t('recovery_verify.errors.no_account_found');
			success = false;
		}
	}

	function goToLogin() {
		goto('/auth/login');
	}
</script>

<div class="bg-base-200 flex flex-grow flex-col items-center justify-center gap-4 px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			{#if isLoading}
				<div class="text-center">
					<h3 class="card-title mb-6 text-center font-semibold text-xl sm:text-2xl leading-tight">
						{$t('recovery_verify.loading_title')}
					</h3>
					<div class="flex justify-center">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
					<p class="text-base-content/70 mt-4">{$t('recovery_verify.loading_message')}</p>
				</div>
			{:else if error}
				<div class="text-center">
					<h3 class="card-title mb-6 text-center font-semibold text-xl sm:text-2xl leading-tight text-error">
						{$t('recovery_verify.error_title')}
					</h3>
					<div class="alert alert-error alert-outline mb-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							></path>
						</svg>
						<p class="text-sm">{error}</p>
					</div>
					<button class="btn btn-primary w-full" onclick={goToLogin}>
						{$t('recovery_verify.return_to_login')}
					</button>
				</div>
			{:else if success && recoveryData}
				<div class="text-center">
					<h3 class="card-title mb-6 text-center font-semibold text-xl sm:text-2xl leading-tight text-success">
						{$t('recovery_verify.success_title')}
					</h3>
					<div class="alert alert-success alert-outline mb-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							></path>
						</svg>
						<div>
							<h3 class="font-bold">{$t('recovery_verify.success_alert_title')}</h3>
							<p class="text-sm">
								{@html $t('recovery_verify.success_message', { values: { email: recoveryData.email } })}
							</p>
						</div>
					</div>
					<p class="text-base-content/70 mb-6">
						{$t('recovery_verify.continue_message')}
					</p>
					<div class="space-y-3">
						{#if recoveryData.publicKey}
							<button class="btn btn-primary w-full" onclick={continueToRecovery}>
								{$t('recovery_verify.continue_button')}
							</button>
						{:else}
							<div class="alert alert-warning alert-outline mb-4">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="h-6 w-6 shrink-0 stroke-current">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
								</svg>
								<div>
									<h3 class="font-bold">{$t('recovery_verify.no_account_title')}</h3>
									<p class="text-sm">{$t('recovery_verify.no_account_message')}</p>
								</div>
							</div>
						{/if}
						<button class="btn btn-ghost w-full" onclick={goToLogin}>
							{$t('recovery_verify.return_to_login')}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
