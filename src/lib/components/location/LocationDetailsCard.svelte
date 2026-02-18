<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import {
		generateGoogleMapsDirectionsLink,
		formatLocationAddress
	} from '$lib/utils/location/maps';

	let {
		location,
		label,
		showDirections = true,
		showAddress = true
	} = $props<{
		location: Location;
		label?: string;
		showDirections?: boolean;
		showAddress?: boolean;
	}>();

	const formattedAddress = $derived(formatLocationAddress(location));
	const directionsLink = $derived(
		generateGoogleMapsDirectionsLink(location, { origin: 'current', label })
	);
</script>

<div class="card shadow-lg bg-base-100 border border-base-300">
	<div class="p-4">
		{#if label}
			<h4 class="card-title text-base font-semibold text-base-content mb-3">{label}</h4>
		{/if}

		{#if showAddress && formattedAddress}
			<div class="mb-4">
				<p class="text-sm mb-1 text-base-content/70">{$t('common.location.address')}</p>
				{#if showDirections}
					<a
						href={directionsLink}
						target="_blank"
						rel="external noopener noreferrer"
						class="flex items-center gap-2 font-medium text-base-content hover:opacity-80 transition-opacity"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0 text-primary"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
							/>
						</svg>
						<span class="line-clamp-2">{formattedAddress}</span>
					</a>
				{:else}
					<p class="font-medium text-base-content">{formattedAddress}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
