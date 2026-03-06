<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import { Capacitor } from '@capacitor/core';

	let { service, variant = 'circle', class: className = '' } = $props<{
		service: Service | null;
		variant?: 'default' | 'circle' | 'icon-only';
		class?: string;
	}>();

	let shareSuccess = $state(false);

	function getServiceShareLink(svc: Service | null): string {
		if (typeof window !== 'undefined' && svc) {
			const id = svc.uniqueId || svc.id;
			return `${window.location.origin}/services/${id}`;
		}
		return '';
	}

	async function handleServiceShare(svc: Service | null, event?: MouseEvent): Promise<void> {
		if (event) event.stopPropagation();
		if (!svc) return;
		const link = getServiceShareLink(svc);
		if (!link) return;
		const currentLocale = get(locale) || 'en';
		const shareTitle = getServiceDisplayTitle(svc, currentLocale) || $t('dashboard.services.browse.view_service');
		const shareText = $t('common.share.check_out_task') || 'Check out this service';

		if (Capacitor.isNativePlatform()) {
			try {
				const { Share } = await import('@capacitor/share');
				await Share.share({
					title: shareTitle,
					text: shareText,
					url: link,
					dialogTitle: shareTitle
				});
				shareSuccess = true;
				appStore.showSuccessToast($t('common.toast.link_copied'));
				setTimeout(() => (shareSuccess = false), 2000);
				return;
			} catch (error) {
				if (
					(error as Error).name !== 'AbortError' &&
					!(error as Error).message?.includes('cancel')
				) {
					/* fall through */
				}
			}
		}

		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({
					title: shareTitle,
					text: shareText,
					url: link
				});
				shareSuccess = true;
				appStore.showSuccessToast($t('common.toast.link_copied'));
				setTimeout(() => (shareSuccess = false), 2000);
				return;
			} catch (error) {
				if ((error as Error).name !== 'AbortError') {
					/* fall through */
				}
			}
		}

		const fullText = `${shareText}\n\n${link}`;
		const success = await copyToClipboard(fullText);
		if (success) {
			shareSuccess = true;
			appStore.showSuccessToast($t('common.toast.link_copied'));
			setTimeout(() => (shareSuccess = false), 2000);
		} else {
			appStore.showErrorToast($t('common.toast.link_copy_failed'));
		}
	}

	const handleClick = async (e: MouseEvent) => {
		await handleServiceShare(service, e);
	};

	const buttonClasses = $derived(
		`btn btn-ghost btn-sm shrink-0 transition-all duration-200 ${shareSuccess ? 'btn-success' : ''} ${variant === 'circle' ? 'btn-circle' : ''} ${className}`
	);
</script>

<button
	class={buttonClasses}
	onclick={handleClick}
	title={$t('dashboard.services.browse.share_service') || 'Share service'}
	aria-label={$t('dashboard.services.browse.share_service') || 'Share service'}
>
	{#if shareSuccess}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
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
			class="h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z"
			/>
		</svg>
	{/if}
</button>
