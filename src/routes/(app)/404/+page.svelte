<script lang="ts">
	import { goto } from '$app/navigation';

	// Navigation functions
	const goHome = () => {
		goto('/');
	};

	const goBack = () => {
		history.back();
	};
</script>

<svelte:head>
	<title>404 - Page Not Found | BitTasker</title>
	<meta name="description" content="The page you're looking for doesn't exist. Find tasks, post jobs, and connect with skilled professionals on BitTasker." />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
	<div class="max-w-2xl w-full">
		<!-- 404 Card -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body text-center p-8">
				<!-- 404 Icon -->
				<div class="text-8xl mb-6">
					🔍
				</div>

				<!-- 404 Badge -->
				<div class="badge badge-primary badge-lg mb-4">
					404
				</div>

				<!-- 404 Title -->
				<h1 class="text-3xl font-bold text-base-content mb-4">
					Page Not Found
				</h1>

				<!-- 404 Description -->
				<p class="text-base-content/70 mb-8 text-lg leading-relaxed">
					The page you're looking for doesn't exist or has been moved. Let's get you back on track!
				</p>

				<!-- Popular Links -->
				<div class="mb-8">
					<h3 class="text-lg font-semibold text-base-content mb-4">
						Popular Pages
					</h3>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<a href="/" class="btn btn-outline btn-sm">
							🏠 Home
						</a>
					<a href="/hiring" class="btn btn-outline btn-sm">
						📊 Dashboard
					</a>
					<a href="/tasks" class="btn btn-outline btn-sm">
						📋 Browse Tasks
					</a>
					<a href="/create-task" class="btn btn-outline btn-sm">
							➕ Create Task
						</a>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<button class="btn btn-primary btn-lg" onclick={goHome}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
						</svg>
						Go Home
					</button>

					<button class="btn btn-outline btn-lg" onclick={goBack}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
						</svg>
						Go Back
					</button>
				</div>

				<!-- Help Section -->
				<div class="divider"></div>
				
				<div class="text-center">
					<p class="text-sm text-base-content/60 mb-4">
						Need help?
					</p>
					<div class="flex flex-col sm:flex-row gap-2 justify-center text-sm">
						<a href="/contact" class="link link-primary">
							Contact Support
						</a>
						<span class="hidden sm:inline">•</span>
						<a href="/help" class="link link-primary">
							Help Center
						</a>
						<span class="hidden sm:inline">•</span>
						<a href="/status" class="link link-primary">
							Status Page
						</a>
					</div>
				</div>
			</div>
		</div>

		<!-- BitTasker Logo -->
		<div class="text-center mt-8">
			<div class="text-2xl font-bold text-base-content/60">BitTasker</div>
		</div>
	</div>
</div>
