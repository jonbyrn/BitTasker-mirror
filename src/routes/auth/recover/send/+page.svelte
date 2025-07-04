<script lang="ts">
	import { goto } from '$app/navigation';
	import { validateEmail } from '$lib/utils/helpers/validators';
	import authService from '$lib/api/services/auth.service';

	let email = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let success = $state(false);

	async function initiateRecovery(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';

			if (!email) {
				error = 'Email is required';
				return;
			}

			if (!validateEmail(email).isValid) {
				error = 'Invalid email address';
				return;
			}

			await authService.initiateNostrRecovery(email);
			success = true;
		} catch (err: any) {
			error = err.message || 'Failed to initiate recovery';
		} finally {
			isLoading = false;
		}
	}
</script>

<div
	class="bg-base-200 flex flex-grow flex-col items-center justify-center gap-4 px-4"
>
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Account Recovery</h2>

			<form onsubmit={initiateRecovery} class="space-y-4">
				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">Email Address</span>
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder="Enter your email address"
						class="input input-bordered w-full"
						required
					/>
				</div>

				<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{:else}
						Send Recovery Code
					{/if}
				</button>
			</form>

			{#if success}
				<div class="alert alert-success mb-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						class="h-6 w-6 shrink-0 stroke-current"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						></path></svg
					>
					<div>
						<h3 class="font-bold">Recovery Code Sent</h3>
						<p class="text-sm">
							We've sent a recovery code to your email. You'll need it in the next step.
						</p>
					</div>
				</div>
			{/if}

			{#if error}
				<div class="alert alert-error mb-4">
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
						></path></svg
					>
					<p class="text-sm">{error}</p>
				</div>
			{/if}

			<div class="divider"></div>

			<button class="btn btn-soft w-full" onclick={() => goto('/auth/login')}>
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
						d="M10 19l-7-7m0 0l7-7m-7 7h18"
					/>
				</svg>
				Back to Login
			</button>
		</div>
	</div>
</div>
