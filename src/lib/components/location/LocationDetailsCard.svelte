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

	// Derived classes for styling based on label
	// Check if label matches translated pickup location text
	const pickupLocationText = $derived($t('location.pickup_location'));
	const isPickupLocation = $derived(label === pickupLocationText || label === 'Pickup Location');
	const addressLabelClass = $derived('text-sm mb-1 ');
	const addressTextClass = $derived('font-medium ');
	
	// Card styling classes - using subtle gray tones for both
	const cardClass = $derived(
		isPickupLocation 
			? 'card shadow-md bg-info/30' 
			: 'card shadow-md bg-info/30'
	);

	function openDirections() {
		window.open(directionsLink, '_blank', 'noopener,noreferrer');
	}
</script>

<div class={cardClass}>
	<div class="card-body p-4">
		{#if label}
			<h3 class="card-title text-lg mb-3">{label}</h3>
		{/if}

		{#if showAddress && formattedAddress}
			<div class="mb-3">
				<p class={addressLabelClass}>{$t('location.address')}</p>
				<p class={addressTextClass}>{formattedAddress}</p>
			</div>
		{/if}

		{#if showDirections}
			<div class="flex gap-2 flex-wrap">
				<button 
					class="btn btn-sm btn-primary" 
					onclick={openDirections}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 mr-1"
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
					{$t('location.get_directions')}
				</button>
			</div>
		{/if}
	</div>
</div>

