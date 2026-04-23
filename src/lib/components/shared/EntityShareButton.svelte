<script lang="ts">
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { shareEntity, type EntitySharePayload } from './entity-share';

	type ShareButtonVariant = 'default' | 'circle' | 'icon-only';
	type ShareButtonPresentation = 'task' | 'service';

	let {
		getSharePayload,
		title,
		ariaLabel = title,
		variant = 'circle',
		presentation = 'service',
		buttonText = null,
		successToast,
		errorToast,
		class: className = ''
	} = $props<{
		getSharePayload: () => EntitySharePayload | null;
		title: string;
		ariaLabel?: string;
		variant?: ShareButtonVariant;
		presentation?: ShareButtonPresentation;
		buttonText?: string | null;
		successToast: string;
		errorToast: string;
		class?: string;
	}>();

	let shareSuccess = $state(false);

	async function handleClick(event: MouseEvent) {
		event.stopPropagation();

		const result = await shareEntity(getSharePayload(), {
			isNativePlatform: Capacitor.isNativePlatform(),
			nativeShare: async (payload) => {
				const { Share } = await import('@capacitor/share');
				await Share.share(payload);
			},
			webShare:
				typeof navigator !== 'undefined' && typeof navigator.share === 'function'
					? (payload) => navigator.share(payload)
					: null,
			copyToClipboard
		});

		if (result === 'shared' || result === 'copied') {
			shareSuccess = true;
			appStore.showSuccessToast(successToast);
			setTimeout(() => {
				shareSuccess = false;
			}, 2000);
			return;
		}

		if (result === 'copy_failed') {
			appStore.showErrorToast(errorToast);
		}
	}

	const buttonClasses = $derived.by(() => {
		if (presentation === 'task') {
			const baseClasses = 'btn transition-all duration-200';
			const successClass = shareSuccess ? 'btn-success' : '';

			if (variant === 'circle') {
				return `${baseClasses} btn-ghost btn-sm btn-circle shrink-0 ${successClass} ${className}`;
			}

			if (variant === 'icon-only') {
				return `${baseClasses} btn-ghost btn-sm ${successClass} ${className}`;
			}

			return `${baseClasses} btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none gap-2 ${successClass} ${className}`;
		}

		return `btn btn-ghost btn-sm shrink-0 transition-all duration-200 ${shareSuccess ? 'btn-success' : ''} ${variant === 'circle' ? 'btn-circle' : ''} ${className}`;
	});

	const taskIconClass = $derived(
		`h-5 w-5 ${variant === 'default' ? '' : variant === 'circle' ? '' : 'mr-1 h-4 w-4 shrink-0'}`
	);
</script>

<button
	class={buttonClasses}
	onclick={handleClick}
	{title}
	aria-label={ariaLabel}
>
	{#if shareSuccess}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class={presentation === 'task' ? taskIconClass : 'h-4 w-4'}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class={presentation === 'task' ? taskIconClass : 'h-4 w-4'}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			{#if presentation === 'task' && variant === 'default'}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
				/>
			{:else}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z"
				/>
			{/if}
		</svg>
	{/if}
	{#if buttonText}
		<span>{buttonText}</span>
	{/if}
</button>
