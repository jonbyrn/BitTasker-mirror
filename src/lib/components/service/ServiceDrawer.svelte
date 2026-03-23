<script lang="ts">
	import type { Service } from '$lib/types/service';
	import { t, locale } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import Drawer from '$lib/components/Drawer.svelte';
	import ServiceTab from './ServiceTab.svelte';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		service: Service | null;
		isOpen: boolean;
		onClose: () => void;
		onRequestEditConfirm?: () => void;
		onRequestDeleteConfirm?: () => void;
		isDeleting?: boolean;
		onQuotes?: () => void;
	}>();

	let isOwner = $state(false);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	// Get translated title for drawer
	const drawerTitle = $derived.by(() => {
		if (!props.service) {
			return tr('dashboard.services.detail.title', 'Service Details');
		}

		return (
			getServiceDisplayTitle(props.service, $locale || 'en') ||
			tr('dashboard.services.detail.title', 'Service Details')
		);
	});

	// Handle drawer state changes
	$effect(() => {
		if (props.isOpen && props.service) {
			// Check if current user is the service owner
			getNpub().then((npub) => {
				isOwner = props.service?.npub === npub;
			});
		}
	});

	const handleClose = () => props.onClose();
</script>

<Drawer
	isOpen={props.isOpen}
	title={drawerTitle}
	onClose={handleClose}
	position="right"
	isScrollable={true}
>
	{#if props.service}
		<!-- Service Details Tab -->
		<div class="p-4">
			<ServiceTab
				service={props.service}
				{isOwner}
				onRequestEditConfirm={props.onRequestEditConfirm}
				onRequestDeleteConfirm={props.onRequestDeleteConfirm}
				isDeleting={props.isDeleting}
				onQuotes={props.onQuotes}
			/>
		</div>

		<!-- Service not found state -->
	{:else}
		<div class="p-4 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto h-12 w-12"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-lg font-semibold">
				{tr('dashboard.services.detail.not_found', 'Service not found')}
			</h3>
			<p class="text-base-content/60 mt-1">
				{tr(
					'dashboard.services.detail.not_found_message',
					'The requested service could not be found.'
				)}
			</p>
		</div>
	{/if}
</Drawer>
