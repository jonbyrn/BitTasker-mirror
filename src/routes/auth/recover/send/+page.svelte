<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
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
				error = $t('recovery_send.errors.email_required');
				return;
			}

			if (!validateEmail(email).isValid) {
				error = $t('recovery_send.errors.invalid_email');
				return;
			}

			await authService.initiateNostrRecovery(email);
			success = true;
		} catch (err: any) {
			error = err.message || $t('recovery_send.errors.failed_initiate');
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex grow  flex-col items-center justify-center gap-4 px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h3 class="card-title mb-6 text-center font-semibold text-xl sm:text-2xl leading-tight">
				{$t('recovery_send.title')}
			</h3>

			<form onsubmit={initiateRecovery} class="space-y-4">
				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">{$t('recovery_send.email_label')}</span>
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder={$t('recovery_send.email_placeholder')}
						class="input input-bordered w-full"
						required
					/>
				</div>

				<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{:else}
						{$t('recovery_send.send_button')}
					{/if}
				</button>
			</form>

			{#if success}
				<div class="alert alert-success alert-outline mb-4">
					<div class="space-y-4">
						<div class="flex justify-start items-center gap-2">
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
							<h4 class="text-center font-semibold text-xl sm:text-2xl leading-tight">
								{$t('recovery_send.success_title')}
							</h4>
						</div>
						<p class="text-sm">
							{@html $t('recovery_send.success_message', { values: { email } })}
						</p>
						<div class="text-base-content/70 mt-3 text-xs">
							<p>{$t('recovery_send.success_tips.check_spam')}</p>
							<p>{$t('recovery_send.success_tips.expires')}</p>
							<p>{$t('recovery_send.success_tips.redirect')}</p>
						</div>
					</div>
				</div>
			{/if}

			{#if error}
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
				{$t('recovery_send.back_to_login')}
			</button>
		</div>
	</div>
</div>
