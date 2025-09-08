<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// Error types with their messages and actions
	const errorTypes = {
		'no-mnemonic': {
			title: 'No Wallet Found',
			message:
				"Your wallet should have been set up automatically during registration. Please try reconnecting.",
			actions: [
				{
					label: 'Try Again',
					onClick: () => {
						// This delay is added to show the loading spinner
						setTimeout(() => {
							goto('/dashboard/wallet');
						}, 700);
					},
					class: 'btn-primary'
				},
				{
					label: 'Setup Wallet',
					onClick: () => goto('/dashboard/wallet/setup'),
					class: 'btn-outline'
				}
			]
		},
		// Add more error types here in the future
		default: {
			title: 'Something Went Wrong',
			message: 'An unexpected error occurred. Please try again or contact support.',
			actions: [
				{
					label: 'Go Back',
					onClick: () => goto('/dashboard/wallet'),
					class: 'btn-primary'
				}
			]
		}
	};

	// Get error type from URL query parameter or use default
	let errorType = $derived(
		page.url.searchParams.get('type') || 'no-mnemonic'
	) as keyof typeof errorTypes;
	let currentError = $derived(errorTypes[errorType] || errorTypes.default);
</script>

<div class="flex min-h-[70vh] flex-col items-center justify-center p-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<div class="flex flex-col items-center gap-4 text-center">

				<h2 class="card-title text-2xl">{currentError.title}</h2>

				<p class="text-base-content/70">{currentError.message}</p>

				<div class="card-actions mt-4 flex w-full flex-col justify-center gap-2 sm:flex-row">
					{#each currentError.actions as action}
						<button
							class="btn {action.class} w-full sm:w-auto"
							onclick={(e) => {
								const button = e.currentTarget;
								// Add loading spinner
								button.innerHTML = `<span class="loading loading-spinner"></span> ${action.label}`;
								// Call the original onClick handler
								action.onClick();
							}}
						>
							{action.label}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
