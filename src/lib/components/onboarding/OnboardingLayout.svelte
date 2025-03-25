<script lang="ts">
	let { title = '', subtitle = '', step = 1, totalSteps = 5, children } = $props();
</script>

<div class="bg-base-100 pt-10 md:pt-20 flex min-h-screen flex-col">
	<main class="container mx-auto max-w-2xl flex-grow px-4 py-8">
		<div class="card bg-base-200 shadow-xl overflow-hidden">
			<div class="card-body">
				<div class="mb-6">
					<div class="mb-2 flex items-center justify-between">
						<h2 class="text-xl font-bold">{title}</h2>
						<span class="w-28  badge badge-primary text-xs">Step {step} of {totalSteps}</span
						>
					</div>
					{#if subtitle}
						<p class="text-base-content/70">{subtitle}</p>
					{/if}

					<div class="bg-base-300 mt-4 h-2 w-full rounded-full">
						<div
							class="bg-primary h-2 rounded-full"
							style="width: {(step / totalSteps) * 100}%"
							data-view-transition="progress-bar"
						></div>
					</div>
				</div>

				<div class="space-y-6" data-view-transition="onboarding-content">
					{@render children()}
				</div>
			</div>
		</div>
	</main>
</div>

<style>
	/* Add view transition styles */
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes fade-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}

	@keyframes slide-from-right {
		from {
			transform: translateX(300px);
		}
		to {
			transform: translateX(0);
		}
	}

	@keyframes slide-to-left {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-30px);
		}
	}

	/* Fallback styles for browsers that don't support view transitions */
	@supports not (view-transition-name: none) {
		[data-view-transition='onboarding-content'] {
			animation:
				210ms cubic-bezier(0, 0, 0.2, 1) 90ms both fade-in,
				150ms cubic-bezier(0.4, 0, 0.2, 1) both slide-from-right;
		}
	}
</style>
