<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isCaptchaVerified } from '$lib/stores/auth.store';
	import { t } from 'svelte-i18n';
	import authService from '$lib/api/services/auth.service';

	let error = $state('');
	let isLoading = $state(false);
	let turnstileWidget = $state<HTMLElement | null>(null);
	let turnstileWidgetId: string | undefined;
	let captchaFailed = $state(false);
	let tosAccepted = $state(false);

	onMount(async () => {
		try {
			// E2E bypass: when running Playwright (or with VITE_E2E_TURNSTILE_BYPASS=true), skip Turnstile and enable Continue
			if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true') {
				isCaptchaVerified.set(true);
				// Diagnostic: visible in Playwright page console and CI attachments
				console.log('[E2E] Turnstile bypass active on signup');
				return;
			}
			// Setup callback for Turnstile
			window.onloadTurnstileCallback = renderTurnstile;
		} catch (err) {
			console.error('Error checking authentication methods:', err);
		}
	});

	// Render Turnstile widget
	function renderTurnstile() {
		if (!turnstileWidget || !window.turnstile) return;

		turnstileWidgetId = window.turnstile.render(turnstileWidget, {
			sitekey: import.meta.env.VITE_CLOUDFLARE_SITEKEY,
			theme: 'auto', // Automatically use light/dark based on user preference
			size: 'flexible', // Can be 'normal', 'compact', or 'flexible'
			retry: 'never', // Prevent automatic retry on failure
			'retry-interval': 10000, // If retry is enabled, wait 10 seconds between attempts
			callback: function (token: string) {
				// This function is called when the user successfully completes the challenge
				verifyCaptcha(token);
			},
			'expired-callback': function () {
				// This function is called when the token expires after 300 seconds
				isCaptchaVerified.set(false);
				captchaFailed = true;
				error = $t('signup.error.captcha_expired');
			},
			'error-callback': function (errorCode: string) {
				// This function is called when there's an error with the widget
				// Ignore PAT-related 401 errors as they're expected
				if (errorCode === '401') {
					console.log('Ignoring PAT 401 error - this is normal and can be ignored');
					return true; // Return true to indicate we've handled this error
				}

				captchaFailed = true;
				error = $t('signup.error.verification_error');
			}
		});
	}

	function resetTurnstile() {
		if (window.turnstile && turnstileWidgetId) {
			window.turnstile.reset(turnstileWidgetId);
			captchaFailed = false;
			error = '';
		}
	}

	async function verifyCaptcha(token: string) {
		try {
			const result = await authService.verifyTurnstile(token, 'signup');

			if (!result) {
				console.error('No data returned from captcha verification');
				throw new Error($t('signup.error.captcha_failed'));
			}

			const success = result.success;

			isCaptchaVerified.set(success);

			if (success) {
				error = ''; // Clear any previous errors
				captchaFailed = false;
			} else {
				error = result.message || $t('signup.error.captcha_failed');
				captchaFailed = true;
			}
		} catch (err) {
			console.error('Error verifying captcha:', err);
			error = err instanceof Error ? err.message : $t('signup.error.captcha_failed');
			isCaptchaVerified.set(false);
			captchaFailed = true;
		}
	}
</script>

<!-- Cloudflare Turnstile Script -->
<svelte:head>
	<script
		src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback"
		async
		defer
	></script>
</svelte:head>

<div
	class="mx-auto flex w-full max-w-2xl grow flex-col items-center justify-center px-2 pt-2 sm:pt-6 sm:pb-8"
>
	<div class="card bg-base-100 w-full p-4 shadow-xl">
		<div class="flex flex-col items-center justify-center">
			<Logo
				class="mx-auto mt-0 mb-4 block w-full max-w-xs sm:mt-6 sm:mb-6 sm:max-w-sm md:max-w-md"
			/>
			<h3 class="mt-2 text-center font-bold sm:mt-4">{$t('signup.title')}</h3>
			<br />
			<p class="mx-auto space-y-2 text-center">
				<span class="text-base-content text-md block text-center">
					{$t('signup.subtitle')}
				</span>
			</p>
		</div>

		<div class="flex flex-col">
			<!-- Cloudflare Turnstile Captcha -->
			<div class="card-body mx-auto w-fit pb-2 sm:pb-4">
				<div bind:this={turnstileWidget} class="flex justify-center"></div>
				{#if captchaFailed && !$isCaptchaVerified}
					<div class="flex justify-center">
						<button onclick={resetTurnstile} class="btn btn-xs btn-outline">
							{$t('signup.retry_verification')}
						</button>
					</div>
				{/if}
				{#if $isCaptchaVerified}
					<div class="alert alert-success alert-outline p-2 text-xs sm:p-4 sm:text-sm">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{$t('signup.verification_success')}</span>
					</div>
				{/if}
			</div>

			<!-- Terms of Service consent — required by Google Play UGC policy -->
			<div class="form-control sm:px-4">
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						bind:checked={tosAccepted}
						class="checkbox checkbox-primary checkbox-sm"
						data-testid="signup-tos-checkbox"
					/>
					<span class="label-text text-xs leading-relaxed whitespace-pre-line sm:text-sm">
						{$t('signup.tos_consent_prefix')}<a
							href="/terms"
							target="_blank"
							class="text-primary hover:underline">{$t('signup.tos_consent_terms')}</a
						>{$t('signup.tos_consent_and')}<a
							href="/privacy"
							target="_blank"
							class="text-primary hover:underline">{$t('signup.tos_consent_privacy')}</a
						>{$t('signup.tos_consent_suffix')}
					</span>
				</label>
			</div>

			<button
				class="btn btn-primary mt-4"
				data-testid="signup-continue"
				onclick={() => goto('/auth/onboarding')}
				disabled={isLoading || !$isCaptchaVerified || !tosAccepted}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
					<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5">
						<path d="M20 12a8 8 0 0 0-8-8m0 16a7.99 7.99 0 0 0 6.245-3" /><path
							stroke-linejoin="round"
							d="M4 12h10m0 0l-3-3m3 3l-3 3"
						/>
					</g>
				</svg>
				{isLoading ? $t('common.processing') : $t('signup.button')}
			</button>

			{#if error}
				<div class="alert alert-error alert-outline mt-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<div class="divider my-1">{$t('common.or')}</div>

			<div class="text-center">
				<a href="/auth/login" class="btn btn-outline w-full">{$t('login.button')}</a>
			</div>
		</div>
	</div>
</div>
