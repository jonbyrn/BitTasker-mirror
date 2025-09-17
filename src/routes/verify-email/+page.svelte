<script lang="ts">
	import { page } from '$app/state';
	import { AuthService } from '$lib/api/services/auth.service';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';

	let error: string | null = $state(null);
	let isVerifying = $state(true);

	onMount(async () => {
		const token = page.url.searchParams.get('token');

		if (!token) {
			error = $t('auth.verify_email.errors.invalid_token') || 'Invalid verification link. No token provided.';
			isVerifying = false;
			return;
		}

		try {
			const authService = new AuthService();
			await authService.verifyEmail(token);
			// After successful verification, redirect to login page
			goto('/auth/login');
		} catch (err) {
			error = $t('auth.verify_email.errors.verification_failed') || 'Failed to verify email. The link might be expired or invalid.';
			isVerifying = false;
		}
	});
</script>

<div class="flex-grow flex items-center justify-center mx-2">
	<div class="bg-base-100 w-full max-w-md rounded-lg p-8 shadow-lg">
		{#if isVerifying}
			<div class="text-center">
				<h2 class="mb-4 text-2xl font-semibold">{$t('auth.verify_email.verifying_title') || 'Verifying your email...'}</h2>
				<div class="flex justify-center">
					<div
						class="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
					></div>
				</div>
			</div>
		{:else if error}
			<div class="text-center">
				<h2 class="mb-4 text-2xl font-semibold text-red-600">{$t('auth.verify_email.verification_failed_title') || 'Verification Failed'}</h2>
				<p class="text-white">{error}</p>
				<a href="/auth/login" class="text-primary btn btn-ghost btn-outline mt-4 hover:underline">
					{$t('auth.verify_email.return_to_login') || 'Return to Login'}
				</a>
			</div>
		{/if}
	</div>
</div>
