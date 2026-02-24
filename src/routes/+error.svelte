<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Logo from '$lib/components/Logo.svelte';

	// Simple error handling without complex derived values
	let { error } = $props();

	// Get basic error info - try multiple sources
	const getErrorInfo = () => {
		// Try to get error info from props first
		if (error) {
			return {
				status: error?.status || error?.code || 500,
				message: error?.message || error?.body?.message || 'An unexpected error occurred'
			};
		}
		// If no error in props, try to get from page store
		else if (page.error) {
			// Handle different error types
			const pageError = page.error as any;

			// Check if this is a "Not Found" error (common for 404s)
			if (pageError?.message === 'Not Found' || pageError?.message?.includes('Not found')) {
				return {
					status: 404,
					message: `The page "${page.url.pathname}" was not found.`
				};
			}

			return {
				status: pageError?.status || pageError?.code || 500,
				message: pageError?.message || pageError?.body?.message || 'An unexpected error occurred'
			};
		}
		// If still no error info, try to infer from URL (common for 404s)
		else {
			// Check if this looks like a 404 based on the URL
			const pathname = page.url.pathname;
			if (pathname && pathname !== '/') {
				// This is likely a 404 - no route matched
				return {
					status: 404,
					message: `The page "${pathname}" was not found.`
				};
			}
			return {
				status: 500,
				message: 'An unexpected error occurred'
			};
		}
	};

	// Simple error content based on status
	const getErrorContent = (status: number) => {
		if (status === 404) {
			return {
				title: 'Page Not Found',
				description: "The page you're looking for doesn't exist or has been moved.",
				icon: '🔍'
			};
		} else if (status >= 500) {
			return {
				title: 'Server Error',
				description: "Something went wrong on our end. We're working to fix this issue.",
				icon: '⚠️'
			};
		} else if (status >= 400) {
			return {
				title: 'Bad Request',
				description: 'There was an issue with your request. Please check your input and try again.',
				icon: '❌'
			};
		} else {
			return {
				title: 'Something went wrong',
				description: 'An unexpected error occurred.',
				icon: '💥'
			};
		}
	};

	// Get error info and content
	const errorInfo = getErrorInfo();
	const errorContent = getErrorContent(errorInfo.status);

	// Diagnostic: log once when the error page is shown (onMount is the right hook per Svelte docs)
	onMount(() => {
		const info = getErrorInfo();
		console.error('[BitTasker Error Page]', {
			status: info.status,
			message: info.message,
			pathname: page.url.pathname,
			propsError: error,
			pageError: page.error,
		});
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
						Go Home
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
						Go Back
					</button>
				</div>

				<!-- Help Section -->
				<div class="divider"></div>

				<div class="text-center">
					<p class="text-base-content/60 mb-4 text-sm">Need help?</p>
					<a href="/contact" class="link link-primary"> Contact Support </a>
				</div>
			</div>
		</div>
	</div>
</div>
