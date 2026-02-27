<script lang="ts">
	/* global google */
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { Geolocation } from '@capacitor/geolocation';
	import { publishLocation, getLatestLocation } from '$lib/nostr/location';
	import { t } from 'svelte-i18n';
	import { Capacitor } from '@capacitor/core';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import IconMyLocation from '~icons/mdi/my-location';

	/** Display name when user's location cannot be determined (coordinates: San Salvador, El Salvador) */
	const DEFAULT_LOCATION_DISPLAY_NAME = 'San Salvador, El Salvador';

	let { nextStep, prevStep, currentStep: _currentStep, totalSteps: _totalSteps } = $props();
	void _currentStep;
	void _totalSteps;

	// State
	let mapHeight = $state('400px'); // Responsive: set in onMount from viewport
	let serviceRadius = $state(10); // Default to 10 km
	let location = $state<Location>({
		displayName: DEFAULT_LOCATION_DISPLAY_NAME,
		latitude: 13.6929,
		longitude: -89.2182,
		zipCode: '',
		locationLoaded: false
	});
	let isLoading = $state(false);
	let isGettingLocation = $state(false);
	let radiusPanelCollapsed = $state(false); // Para mobile, colapsar por defecto
	let locationError = $state<string | null>(null);

	let autoDetectTimeoutId: ReturnType<typeof setTimeout> | null = null;

	/** 1 km in miles; used for service radius display */
	const KM_TO_MILES = 0.621371;
	let serviceRadiusMiles = $derived((Math.round(serviceRadius * KM_TO_MILES * 10) / 10).toFixed(1));

	const AUTO_DETECT_DELAY_MS = 400;

	/** Returns true if we may trigger geolocation (permission not denied). Used for auto-detect only. */
	async function mayRequestLocation(): Promise<boolean> {
		if (Capacitor.isNativePlatform()) {
			const status = await Geolocation.checkPermissions();
			return status.location !== 'denied';
		}
		if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
			return false;
		}
		try {
			const result = await navigator.permissions.query({ name: 'geolocation' });
			return result.state !== 'denied';
		} catch {
			return false;
		}
	}

	onMount(() => {
		// 1. Map height and media query
		const mq = window.matchMedia('(max-width: 767px)');
		const setHeight = () => {
			mapHeight = mq.matches ? '240px' : '400px';
		};
		setHeight();
		mq.addEventListener('change', setHeight);

		// 2. Preload Geocoding library so reverse geocode is ready when user clicks "Use my location"
		const preloadGeocoding = () => {
			if (typeof window !== 'undefined' && window.google?.maps) {
				window.google.maps.importLibrary('geocoding').catch(() => {});
			}
		};
		const preloadId = setTimeout(preloadGeocoding, 500);

		// 3. Load saved location or use default, then optionally try auto-detect
		(async () => {
			try {
				const saved = await getLatestLocation();
				if (saved) {
					location = saved;
				} else {
					location = {
						displayName: DEFAULT_LOCATION_DISPLAY_NAME,
						latitude: 13.6929,
						longitude: -89.2182,
						zipCode: '',
						locationLoaded: true
					};
					tryAutoDetectWithDelay();
				}
			} catch (error) {
				console.warn('Error loading saved location:', error);
				location = {
					displayName: DEFAULT_LOCATION_DISPLAY_NAME,
					latitude: 13.6929,
					longitude: -89.2182,
					zipCode: '',
					locationLoaded: true
				};
				tryAutoDetectWithDelay();
			}
		})();

		return () => {
			clearTimeout(preloadId);
			if (autoDetectTimeoutId != null) clearTimeout(autoDetectTimeoutId);
			mq.removeEventListener('change', setHeight);
		};
	});

	function tryAutoDetectWithDelay(): void {
		autoDetectTimeoutId = setTimeout(() => {
			autoDetectTimeoutId = null;
			(async () => {
				const allowed = await mayRequestLocation();
				if (allowed) {
					await getUserLocation({ fromAutoDetect: true });
				}
			})();
		}, AUTO_DETECT_DELAY_MS);
	}
	// Uses relaxed accuracy for faster fix; shows coordinates immediately, then reverse geocodes in background.
	async function getUserLocation(options?: { fromAutoDetect?: boolean }): Promise<void> {
		if (isGettingLocation) return;

		try {
			isGettingLocation = true;
			locationError = null;
			const isNative = Capacitor.isNativePlatform();

			let lat: number | null = null;
			let lng: number | null = null;

			if (isNative) {
				try {
					const requestResult = await Geolocation.requestPermissions();
					if (requestResult.location !== 'granted') {
						throw new Error('Location permission denied');
					}

					const position = await Geolocation.getCurrentPosition({
						enableHighAccuracy: false,
						timeout: 15000
					});
					lat = position.coords.latitude;
					lng = position.coords.longitude;
				} catch (error) {
					console.warn('Error getting native location:', error);
					throw error;
				}
			} else if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
				const position = await new Promise<GeolocationPosition>((resolve, reject) => {
					navigator.geolocation.getCurrentPosition(
						resolve,
						(error) => {
							if (error.code === error.PERMISSION_DENIED) {
								reject(
									new Error(
										'Location permission denied. Please enable location access in your browser settings and try again.'
									)
								);
							} else {
								reject(error);
							}
						},
						{
							enableHighAccuracy: false,
							timeout: 15000,
							maximumAge: 60000
						}
					);
				});
				lat = position.coords.latitude;
				lng = position.coords.longitude;
			} else {
				throw new Error('Geolocation is not supported in this environment');
			}

			if (lat === null || lng === null) {
				throw new Error('Failed to read geolocation coordinates');
			}

			// Show coordinates immediately so UI updates without waiting for reverse geocode
			const coordsDisplayName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
			const initialLocation: Location = {
				displayName: coordsDisplayName,
				latitude: lat,
				longitude: lng,
				zipCode: '',
				locationLoaded: true
			};
			location = initialLocation;
			handleLocationSelect(initialLocation);

			// Reverse geocode in background and update display name when ready
			const updateWithAddress = async () => {
				try {
					if (typeof window === 'undefined' || !window.google?.maps) return;

					const { Geocoder } = (await window.google.maps.importLibrary(
						'geocoding'
					)) as google.maps.GeocodingLibrary;
					const geocoder = new Geocoder();
					const result = await geocoder.geocode({ location: { lat, lng } });

					if (result.results && result.results.length > 0) {
						const displayName = result.results[0].formatted_address;
						const resolvedLocation: Location = {
							displayName,
							latitude: lat,
							longitude: lng,
							zipCode: '',
							locationLoaded: true
						};
						location = resolvedLocation;
						handleLocationSelect(resolvedLocation);
					}
				} catch (geocodeError) {
					console.warn('Error in reverse geocoding, using coordinates:', geocodeError);
				}
			};
			updateWithAddress();
		} catch (error) {
			console.warn('Error getting user location:', error);
			const isPermissionDenied = error instanceof Error && error.message.includes('permission');
			if (isPermissionDenied && options?.fromAutoDetect) {
				locationError = null;
			} else if (isPermissionDenied) {
				locationError =
					$t('onboarding_auth.form.location_setup.errors.permission_denied') ||
					'Location permission denied. Please enable location access in your browser settings and try again.';
			} else {
				locationError = null;
			}
		} finally {
			isGettingLocation = false;
		}
	}

	// Manejar selección de ubicación desde LocationAutoComplete
	function handleLocationSelect(selectedLocation: Location) {
		location = {
			...selectedLocation,
			locationLoaded: true
		};
		// Limpiar error si había uno
		locationError = null;
	}

	async function handleSubmit() {
		try {
			isLoading = true;

			// Asegurar que tenemos coordenadas válidas
			if (!location.latitude || !location.longitude) {
				location = {
					displayName: DEFAULT_LOCATION_DISPLAY_NAME,
					latitude: 13.6929,
					longitude: -89.2182,
					zipCode: '',
					locationLoaded: true
				};
			}

			// Marcar como cargado si no lo está
			if (!location.locationLoaded) {
				location.locationLoaded = true;
			}

			// Intentar publicar ubicación a Nostr
			try {
				await publishLocation(location);
			} catch (publishError) {
				// Si falla la publicación, continuar de todas formas
				console.warn('Could not publish location, but continuing:', publishError);
			}

			// Continuar al siguiente paso
			nextStep();
		} catch (err: unknown) {
			console.error('Error saving location:', err);
			// Incluso con error, permitir continuar con ubicación por defecto
			if (location.latitude && location.longitude) {
				location.locationLoaded = true;
				nextStep();
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-location">
	<div class="card-body space-y-2">
		<!-- Educational Header -->
		<div class="education-header text-center">
			<h4 class="step-title">{$t('onboarding_auth.form.location_setup.title')}</h4>
			<p class="text-primary text-base md:text-lg">
				{$t('onboarding_auth.form.location_setup.find_tasks')}
			</p>
			<p class="text-base-content/90 text-center text-sm md:text-base">
				{$t('onboarding_auth.form.location_setup.auto_detect_hint')}
			</p>
		</div>

		<!-- Location Search and Map -->
		<div class="mx-auto w-full max-w-xl">
			<!-- Location AutoComplete + Use my location in one row -->
			<div class="space-y-2">
				{#snippet myLocationButton()}
					<button
						aria-label={$t('onboarding_auth.form.use_my_location')}
						onclick={() => getUserLocation()}
						class="btn btn-primary btn-square shrink-0"
						disabled={isGettingLocation}
						title={$t('onboarding_auth.form.use_my_location')}
					>
						{#if isGettingLocation}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<IconMyLocation class="h-5 w-5" />
						{/if}
					</button>
				{/snippet}
				<LocationAutoComplete
					placeholder={$t('onboarding_auth.form.search_location')}
					{location}
					onLocationSelect={handleLocationSelect}
					showMap={true}
					{mapHeight}
					searchRadius={serviceRadius}
					trailingAction={myLocationButton}
				/>
				{#if locationError}
					<div class="alert alert-warning alert-outline max-w-md">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span class="text-sm">{locationError}</span>
					</div>
				{/if}
			</div>

			<!-- Service Radius Panel - Colapsable en mobile -->
			<div class="space-y-2">
				<!-- Desktop: siempre visible -->
				<div class="hidden md:block">
					<div class="bg-base-100/95 border-base-300 space-y-2 rounded-lg border p-4 shadow-lg">
						<div class="text-base-content text-sm font-medium">
							{$t('onboarding_auth.form.location_setup.service_radius')}: {serviceRadius}
							{$t('onboarding_auth.form.location_setup.km')} ({serviceRadiusMiles} miles)
						</div>
						<input
							type="range"
							min="1"
							max="50"
							bind:value={serviceRadius}
							class="range range-sm range-primary"
						/>
						<div class="text-base-content/70 flex justify-between text-xs">
							<span>1 {$t('onboarding_auth.form.location_setup.km')}</span>
							<span>50 {$t('onboarding_auth.form.location_setup.km')}</span>
						</div>
					</div>
				</div>

				<!-- Mobile: colapsable -->
				<div class="md:hidden">
					<div
						class="collapse-arrow bg-base-100/95 border-base-300 collapse rounded-lg border shadow-lg"
					>
						<input
							type="checkbox"
							bind:checked={radiusPanelCollapsed}
							class="peer"
							aria-label={$t('onboarding_auth.form.location_setup.toggle_radius')}
						/>
						<div class="collapse-title text-base-content font-medium">
							{$t('onboarding_auth.form.location_setup.service_radius')}: {serviceRadius}
							{$t('onboarding_auth.form.location_setup.km')} ({serviceRadiusMiles} miles)
						</div>
						<div class="collapse-content">
							<input
								type="range"
								min="1"
								max="50"
								bind:value={serviceRadius}
								class="range range-sm range-primary"
							/>
							<div class="text-base-content/70 flex justify-between text-xs">
								<span>1 {$t('onboarding_auth.form.location_setup.km')}</span>
								<span>50 {$t('onboarding_auth.form.location_setup.km')}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				data-testid="onboarding-location-back"
				onclick={prevStep}
			>
				{$t('onboarding_auth.form.back')}
			</button>
			<button
				type="button"
				class="btn btn-primary"
				data-testid="onboarding-location-next"
				onclick={handleSubmit}
				disabled={isLoading}
			>
				{#if isLoading}
					<span class="loading loading-spinner"></span>
				{/if}
				{$t('onboarding_auth.form.next')}
			</button>
		</div>
	</div>
</div>
