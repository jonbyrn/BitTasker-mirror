<script lang="ts">
	import { page } from '$app/stores';
	import { AuthService } from '$lib/api/services/auth.service';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let error: string | null = $state(null);
	let isVerifying = $state(true);

	onMount(async () => {
		const token = $page.url.searchParams.get('token');

		if (!token) {
			error = 'Invalid verification link. No token provided.';
			isVerifying = false;
			return;
		}

		try {
			const authService = new AuthService();
			await authService.verifyEmail(token);
			// After successful verification, redirect to login page
			goto('/auth');
		} catch (err) {
			error = 'Failed to verify email. The link might be expired or invalid.';
			isVerifying = false;
		}
	});
</script>

<div class="flex min-h-[100dvh] items-center justify-center">
	<div class="bg-base-100 w-full max-w-md rounded-lg p-8 shadow-lg">
		{#if isVerifying}
			<div class="text-center">
				<h2 class="mb-4 text-2xl font-semibold">Verifying your email...</h2>
				<div class="flex justify-center">
					<div
						class="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
					></div>
				</div>
			</div>
		{:else if error}
			<div class="text-center">
				<h2 class="mb-4 text-2xl font-semibold text-red-600">Verification Failed</h2>
				<p class="text-white">{error}</p>
				<a href="/auth" class="text-primary btn btn-ghost btn-outline mt-4 hover:underline">
					Return to Login
				</a>
			</div>
		{/if}
	</div>
</div>
