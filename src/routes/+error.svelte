<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import Logo from '$lib/components/Logo.svelte';
	import { notFoundCopy } from '$lib/i18n/not-found-copy';

	let { error } = $props();

	const copy = $derived(notFoundCopy(String($locale || 'en')));

	const getErrorInfo = () => {
		const errObj = error ?? page.error;
		const pathname = page.url.pathname;

		// handleError rewrites the message, so a missing route must follow the status.
		if (page.status === 404) {
			return { status: 404, message: `The page "${pathname}" was not found.` };
		}

		if (errObj) {
			const e = errObj as Record<string, unknown>;
			const status =
				(typeof e.status === 'number' ? e.status : undefined) ??
				(typeof e.code === 'number' ? e.code : undefined);
			const message =
				(typeof e.message === 'string' ? e.message : undefined) ??
				(typeof (e.body as Record<string, unknown>)?.message === 'string'
					? ((e.body as Record<string, unknown>).message as string)
					: undefined);

			const isNotFound =
				status === 404 ||
				message === 'Not Found' ||
				(typeof message === 'string' && message.toLowerCase().includes('not found'));

			if (isNotFound) {
				return { status: 404, message: `The page "${pathname}" was not found.` };
			}

			if (status) {
				return { status, message: message ?? 'An unexpected error occurred' };
			}

			// No numeric status survived (e.g. a client mounting exception) — don't guess it's a 404.
			return { status: 500, message: message ?? 'An error occurred' };
		}

		if (pathname && pathname !== '/') {
			return { status: 404, message: `The page "${pathname}" was not found.` };
		}

		return { status: 500, message: 'An unexpected error occurred' };
	};

	const errorInfo = $derived(getErrorInfo());
	const errorContent = $derived.by(() => {
		const status = errorInfo.status;
		if (status === 404) {
			return {
				title: copy.notFoundTitle,
				description: copy.notFoundDescription,
				icon: '🔍'
			};
		}
		if (status >= 500) {
			return {
				title: copy.serverTitle,
				description: copy.serverDescription,
				icon: '⚠️'
			};
		}
		if (status >= 400) {
			return {
				title: copy.badRequestTitle,
				description: copy.badRequestDescription,
				icon: '❌'
			};
		}
		return {
			title: copy.genericTitle,
			description: copy.genericDescription,
			icon: '💥'
		};
	});

	// Navigation functions
	const goHome = () => {
		goto('/');
	};

	const goBack = () => {
		history.back();
	};
</script>

<svelte:head>
	<title>{errorInfo.status} - {errorContent.title} | BitTasker</title>
	<meta name="description" content={errorContent.description} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="bg-base-200 my-8 flex items-center justify-center p-4">
	<div class="w-full max-w-2xl">
		<!-- Error Card -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-8 text-center">
				<!-- BitTasker Logo -->
				<Logo />

				<!-- Error Title -->
				<h1 class="text-base-content mb-4 text-3xl font-bold">
					{errorContent.title}
				</h1>

				<!-- Error Description -->
				<p class="text-base-content/70 mb-8 text-lg leading-relaxed">
					{errorContent.description}
				</p>

				<!-- Error Details (Development only) -->
				{#if import.meta.env.DEV}
					<div class="alert alert-outline alert-warning mb-6">
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
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<div>
							<div class="font-bold">Development Error Details:</div>
							<div class="text-sm">Status: {errorInfo.status}</div>
							<div class="text-sm">Message: {errorInfo.message}</div>
							<div class="text-sm">Props Error: {JSON.stringify(error, null, 2)}</div>
							<div class="text-sm">Page Error: {JSON.stringify(page.error, null, 2)}</div>
							<div class="text-sm">URL: {page.url.pathname}</div>
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex flex-col justify-center gap-4 sm:flex-row">
					<button class="btn btn-primary btn-lg" onclick={goHome}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
							/>
						</svg>
						{copy.goHome}
					</button>

					<button class="btn btn-outline btn-lg" onclick={goBack}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-5 w-5"
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
						{copy.goBack}
					</button>
				</div>

				<!-- Help Section -->
				<div class="divider"></div>

				<div class="text-center">
					<p class="text-base-content/60 mb-4 text-sm">{copy.help}</p>
					<a href="/contact" class="link link-primary">{copy.contact}</a>
				</div>
			</div>
		</div>
	</div>
</div>
