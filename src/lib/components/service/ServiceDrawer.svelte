<script lang="ts">
	import type { Service } from '$lib/types/service';
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import Drawer from '$lib/components/Drawer.svelte';
	import ServiceDetailsView from '$lib/components/service/ServiceDetailsView.svelte';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconDeleteOutline from '~icons/mdi/delete-outline';

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

	// Generic drawer title (service name is shown inside the card — avoids repeating in the chrome)
	const drawerTitle = $derived.by(() => {
		if (!props.service) {
			return tr('dashboard.services.detail.title', 'Service Details');
		}
		return tr('dashboard.services.detail.drawer_heading', 'Service details');
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
		<div>
			<ServiceDetailsView
				service={props.service}
				serviceId={props.service.id || ''}
				isPreview={true}
			/>

			<!-- Action Buttons -->
			<div class="pt-2 pb-4">
				<div class="flex flex-row justify-end gap-2">
					<!-- Delete Button -->
					{#if isOwner && props.onRequestDeleteConfirm}
						<button
							class="btn btn-error btn-sm min-h-[40px] flex-1 sm:flex-none"
							onclick={() => props.onRequestDeleteConfirm?.()}
							disabled={props.isDeleting ?? false}
						>
							{#if props.isDeleting ?? false}
								<span class="loading loading-spinner loading-sm"></span>
							{:else}
								<IconDeleteOutline class="h-4 w-4 shrink-0" />
							{/if}
							{tr('dashboard.services.detail.delete_service', 'Delete')}
						</button>
					{/if}

					<!-- Edit Button -->
					{#if isOwner && props.onRequestEditConfirm}
						<button
							class="btn btn-outline btn-sm min-h-[40px] flex-1 sm:flex-none"
							onclick={() => props.onRequestEditConfirm?.()}
						>
							<IconPencilOutline class="h-4 w-4 shrink-0" />
							{tr('dashboard.services.detail.edit_service', 'Edit')}
						</button>
					{/if}

					<!-- Inquiries Button -->
					{#if props.onQuotes}
						<button
							class="btn btn-primary btn-sm min-h-[40px] flex-1 gap-2 sm:flex-none"
							onclick={(e) => {
								e.stopPropagation();
								props.onQuotes?.();
							}}
						>
							<IconEyeOutline class="h-4 w-4 shrink-0" />
							<span>{tr('dashboard.services.detail.inquiries', 'Inquiries')}</span>
						</button>
					{/if}
				</div>
			</div>
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
