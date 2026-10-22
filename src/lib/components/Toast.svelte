<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import { fly, fade } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import IconClose from '~icons/mdi/close';

	function handleDismiss(toast: { id: number; dismissKey?: string }) {
		appStore.dismissBanner(toast.id, toast.dismissKey);
	}
</script>

<div
	class="toast-container pointer-events-none fixed inset-x-0 bottom-0 z-70 flex flex-col items-center gap-3"
	style="z-index: 300; padding-bottom: calc(var(--app-footer-height, 0px) + 1.25rem);"
	aria-live="polite"
	aria-relevant="additions"
>
	{#each $appStore.toasts as toast (toast.id)}
		{@const isBanner = toast.type === 'banner'}
		<div
			class="pointer-events-auto w-[calc(100%-1rem)] max-w-lg"
			in:fly={{ y: 40, duration: 300, easing: (t: number) => 1 - Math.pow(1 - t, 4) }}
			out:fade={{ duration: 200 }}
		>
			{#if isBanner}
				<div
					class="bg-base-100 border-primary/50 shadow-primary/40 relative rounded-xl border p-4 shadow-lg ring-1 ring-black/5"
				>
					<!-- Close button — top right -->
					{#if toast.dismissible !== false}
						<button
							class="btn btn-ghost btn-xs btn-circle absolute top-2 right-2"
							onclick={() => handleDismiss(toast)}
							aria-label="Close"
						>
							<IconClose class="h-4 w-4" />
						</button>
					{/if}

					<!-- Content: flex row (text left, actions right), wraps on mobile -->
					<div
						class="flex flex-col gap-3 sm:flex-row sm:items-center {toast.dismissible !== false
							? 'pr-8'
							: ''}"
					>
						<p class="text-base-content flex-1 text-sm leading-relaxed">
							{typeof toast.message === 'string'
								? toast.message
								: $t(toast.message.key, {
										values: toast.message.values as Record<
											string,
											string | number | boolean | null | undefined
										>
									})}
						</p>
						{#if toast.actions && toast.actions.length > 0}
							<div class="flex shrink-0 flex-wrap justify-end gap-2">
								{#each toast.actions as action (action.label)}
									<button
										class="btn {action.variant === 'ghost'
											? 'btn-ghost btn-outline'
											: action.variant === 'secondary'
												? 'btn-outline'
												: 'btn-primary'} btn-sm"
										onclick={action.onClick}
									>
										{$t(action.label)}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div
					class="alert {toast.type === 'success'
						? 'alert-success'
						: toast.type === 'error'
							? 'alert-error'
							: 'alert-info'} shadow-lg"
					role={toast.type === 'error' ? 'alert' : 'status'}
					in:fade={{ duration: 150 }}
					out:fade={{ duration: 150 }}
				>
					<span>{toast.message}</span>
				</div>
			{/if}
		</div>
	{/each}
</div>
