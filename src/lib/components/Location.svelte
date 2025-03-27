<script lang="ts">
	import { Geolocation } from '@capacitor/geolocation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	interface LocationData {
		displayName: string;
		longitude: number;
		latitude: number;
		zipCode: string;
		locationLoaded: boolean;
	}

  let { label, defaultLocation, onLocationSelect } = $props();

	// State
	let map: google.maps.Map;
	let marker: google.maps.Marker;
	let autocomplete: google.maps.places.Autocomplete;
	let searchInput: HTMLInputElement;

	const location = $state<LocationData>({
		displayName: '',
		longitude: -122.4194, // Default: San Francisco
		latitude: 37.7749,
		zipCode: '',
		locationLoaded: false
	});

	// Initialize map
	async function initMap() {
		const mapOptions = {
			center: { lat: location.latitude, lng: location.longitude },
			zoom: 15,
			mapTypeControl: false,
			streetViewControl: false,
			fullscreenControl: false
		};

		map = new google.maps.Map(document.getElementById('map')!, mapOptions);
		marker = new google.maps.Marker({
			map,
			draggable: true,
			position: { lat: location.latitude, lng: location.longitude }
		});

		// Handle marker drag events
		marker.addListener('dragend', () => {
			const pos = marker.getPosition()!;
			updateLocationFromCoords(pos.lat(), pos.lng());
		});

		// Initialize autocomplete
		autocomplete = new google.maps.places.Autocomplete(searchInput, {
			types: ['address']
		});

		autocomplete.addListener('place_changed', () => {
			const place = autocomplete.getPlace();
			if (!place.geometry) return;

			const lat = place.geometry.location!.lat();
			const lng = place.geometry.location!.lng();

			updateLocationFromPlace(place);
			map.setCenter({ lat, lng });
			marker.setPosition({ lat, lng });
		});
	}

	// Update location from coordinates
	async function updateLocationFromCoords(lat: number, lng: number) {
		const geocoder = new google.maps.Geocoder();
		try {
			const response = await geocoder.geocode({ location: { lat, lng } });
			if (response.results[0]) {
				updateLocationFromPlace(response.results[0]);
			}
		} catch (error) {
			console.error('Geocoding failed:', error);
		}
	}

	// Update location from place
	function updateLocationFromPlace(
		place: google.maps.places.PlaceResult | google.maps.GeocoderResult
	) {
		const zipCode =
			place.address_components?.find((component) => component.types.includes('postal_code'))
				?.short_name || '';

		location.displayName = place.formatted_address || '';
		location.latitude = place.geometry!.location!.lat();
		location.longitude = place.geometry!.location!.lng();
		location.zipCode = zipCode;
		location.locationLoaded = true;

		onLocationSelect(location);
	}

	// Get current location
	async function getCurrentLocation() {
		try {
			const { coords } = await Geolocation.getCurrentPosition();
			location.latitude = coords.latitude;
			location.longitude = coords.longitude;

			map.setCenter({ lat: coords.latitude, lng: coords.longitude });
			marker.setPosition({ lat: coords.latitude, lng: coords.longitude });
			await updateLocationFromCoords(coords.latitude, coords.longitude);
		} catch (error) {
			console.error('Error getting location:', error);
			// Use default location if permission denied
			if (defaultLocation) {
				Object.assign(location, defaultLocation);
				map.setCenter({ lat: location.latitude, lng: location.longitude });
				marker.setPosition({ lat: location.latitude, lng: location.longitude });
			}
		}
	}

	// Effects
	$effect(() => {
		if (browser && window.google) {
			initMap();
		}
	});

	onMount(() => {
		if (defaultLocation) {
			Object.assign(location, defaultLocation);
		}
		getCurrentLocation();
	});
</script>

<div class="location-container">
	<div class="form-control w-full">
		<label class="label" for="location-search">
			<span class="label-text">{label}</span>
		</label>
		<input
			bind:this={searchInput}
			id="location-search"
			type="text"
			placeholder="Enter address..."
			class="input input-bordered w-full"
			value={location.displayName}
		/>
	</div>

	<div id="map" class="map-container"></div>
</div>

<style>
	.location-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.map-container {
		width: 100%;
		height: 300px;
		border-radius: 0.5rem;
		overflow: hidden;
	}
</style>
