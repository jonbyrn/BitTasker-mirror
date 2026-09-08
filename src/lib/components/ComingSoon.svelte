<script lang="ts">
	/**
	 * Coming Soon Component for BitTasker
	 *
	 * A reusable component to display coming soon pages with optional custom content
	 * Includes glow effects and matches the application's theme
	 */
	import { t } from 'svelte-i18n';

	// Props
	const props = $props<{
		title?: string;
		subtitle?: string;
		description?: string;
		showIcon?: boolean;
		showGlow?: boolean;
		size?: 'sm' | 'md' | 'lg';
		children?: import('svelte').Snippet;
	}>();

	// Default values using translations
	const title = $derived(props.title ?? $t('common.coming_soon.title'));
	const subtitle = $derived(props.subtitle ?? $t('common.coming_soon.subtitle'));
	const description = $derived(props.description ?? $t('common.coming_soon.description'));
	const showIcon = $derived(props.showIcon ?? true);
	const showGlow = $derived(props.showGlow ?? true);
	const size = $derived((props.size ?? 'md') as 'sm' | 'md' | 'lg');

	// Size classes
	const sizeClasses = {
		sm: 'max-w-sm',
		md: 'max-w-2xl',
		lg: 'max-w-4xl'
	};

	const iconSizeClasses = {
		sm: 'h-16 w-16',
		md: 'h-24 w-24',
		lg: 'h-32 w-32'
	};

	const titleSizeClasses = {
		sm: 'text-2xl',
		md: 'text-4xl',
		lg: 'text-6xl'
	};

	const subtitleSizeClasses = {
		sm: 'text-lg',
		md: 'text-xl',
		lg: 'text-2xl'
	};

	const descriptionSizeClasses = {
		sm: 'text-sm',
		md: 'text-base',
		lg: 'text-lg'
	};
</script>

<div class="flex items-center justify-center p-4">
	<div class="w-full {sizeClasses[size]} {showGlow ? 'glow-effect' : ''}">
		{#if showGlow}
			<div class="glow-container">
				<div
					class="glow-blur glow-primary"
					style="top: 20%; left: 20%; width: 200px; height: 200px;"
				></div>
				<div
					class="glow-blur glow-accent"
					style="top: 60%; right: 20%; width: 150px; height: 150px; animation-delay: 2s;"
				></div>
			</div>
		{/if}

		<div class="card bg-base-100 shadow-xl">
			<div class="card-body text-center">
				{#if showIcon}
					<div class="mx-auto mb-6 flex items-center justify-center">
						<div class="bg-primary/20 animate-pulse rounded-full p-6">
							<svg
								class="{iconSizeClasses[size]} text-primary"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
					</div>
				{/if}

				<h1 class="card-title {titleSizeClasses[size]} text-primary mb-4 justify-center font-bold">
					{title}
				</h1>

				<h2 class="{subtitleSizeClasses[size]} text-base-content/80 mb-4 font-semibold">
					{subtitle}
				</h2>

				<p class="{descriptionSizeClasses[size]} text-base-content/70 mb-6">
					{description}
				</p>

				{#if props.children}
					<div class="mt-6">
						{@render props.children?.()}
					</div>
				{/if}

				<div class="mt-8 flex justify-center">
					<div class="flex space-x-2">
						<div class="bg-primary h-2 w-2 animate-pulse rounded-full"></div>
						<div
							class="bg-primary h-2 w-2 animate-pulse rounded-full"
							style="animation-delay: 0.5s;"
						></div>
						<div
							class="bg-primary h-2 w-2 animate-pulse rounded-full"
							style="animation-delay: 1s;"
						></div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
