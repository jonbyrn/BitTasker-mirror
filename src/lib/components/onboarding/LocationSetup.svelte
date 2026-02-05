<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { Geolocation } from '@capacitor/geolocation';
	import { publishLocation, getLatestLocation } from '$lib/nostr/location';
	import { t } from 'svelte-i18n';
	import { Capacitor } from '@capacitor/core';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import IconCheck from '~icons/mdi/check-circle-outline';

	let { nextStep, prevStep, currentStep, totalSteps } = $props();

	// State
	let serviceRadius = $state(10); // Default to 10 km
	let location = $state<Location>({
		displayName: '',
		latitude: 13.6929,
		longitude: -89.2182,
		zipCode: '',
		locationLoaded: false
	});
	let isLoading = $state(false);
	let isGettingLocation = $state(false);
	let radiusPanelCollapsed = $state(false); // Para mobile, colapsar por defecto
	let locationError = $state<string | null>(null);

	// Función mejorada para obtener ubicación del usuario
	// Siempre solicita permisos de nuevo
	async function getUserLocation() {
		try {
			isGettingLocation = true;
			const isNative = Capacitor.isNativePlatform();

			let lat: number | null = null;
			let lng: number | null = null;

			if (isNative) {
				// Native (iOS/Android): siempre solicitar permisos explícitamente
				try {
					// Siempre solicitar permisos de nuevo, incluso si ya están otorgados
					// Esto asegura que el usuario vea el diálogo si los había bloqueado
					const requestResult = await Geolocation.requestPermissions();
					if (requestResult.location !== 'granted') {
						throw new Error('Location permission denied');
					}

					// Obtener posición actual
					const position = await Geolocation.getCurrentPosition({
						enableHighAccuracy: true,
						timeout: 15000
					});
					lat = position.coords.latitude;
					lng = position.coords.longitude;
				} catch (error) {
					console.warn('Error getting native location:', error);
					throw error;
				}
			} else if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
				// Web: llamar directamente a getCurrentPosition
				// El navegador mostrará automáticamente el diálogo de permisos si están en estado "prompt"
				// Si están bloqueados, mostrará un error claro
				const position = await new Promise<GeolocationPosition>((resolve, reject) => {
					navigator.geolocation.getCurrentPosition(
						resolve,
						(error) => {
							// Si el error es de permisos denegados, dar un mensaje más claro
							if (error.code === error.PERMISSION_DENIED) {
								reject(new Error('Location permission denied. Please enable location access in your browser settings and try again.'));
							} else {
								reject(error);
							}
						},
						{
							enableHighAccuracy: true,
							timeout: 15000,
							maximumAge: 0 // No usar caché, siempre obtener nueva ubicación
						}
					);
				});
				lat = position.coords.latitude;
				lng = position.coords.longitude;
			} else {
				throw new Error('Geolocation is not supported in this environment');
			}

			// Si tenemos coordenadas, actualizar la ubicación
			if (lat !== null && lng !== null) {
				// Intentar usar reverse geocoding para obtener el nombre
				let displayName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
				
				try {
					// Si Google Maps está disponible, usar reverse geocoding
					if (window.google?.maps) {
						const { Geocoder } = (await google.maps.importLibrary('geocoding')) as google.maps.GeocodingLibrary;
						const geocoder = new Geocoder();
						const result = await geocoder.geocode({ location: { lat, lng } });
						
						if (result.results && result.results.length > 0) {
							displayName = result.results[0].formatted_address;
						}
					}
				} catch (geocodeError) {
					console.warn('Error in reverse geocoding, using coordinates:', geocodeError);
					// Continuar con coordenadas si falla el geocoding
				}

				// Actualizar ubicación
				const newLocation: Location = {
					displayName,
					latitude: lat,
					longitude: lng,
					zipCode: '',
					locationLoaded: true
				};

				// Actualizar estado y notificar al componente hijo
				location = newLocation;
				locationError = null; // Limpiar error si se obtuvo la ubicación exitosamente
				handleLocationSelect(newLocation);
			} else {
				throw new Error('Failed to read geolocation coordinates');
			}
		} catch (error) {
			console.warn('Error getting user location:', error);
			// Mostrar mensaje de error si es de permisos denegados
			if (error instanceof Error && error.message.includes('permission')) {
				locationError = $t('onboarding_auth.form.location_setup.errors.permission_denied') || 
					'Location permission denied. Please enable location access in your browser settings and try again.';
			} else {
				locationError = null; // No mostrar error para otros tipos de errores
			}
			// El usuario puede seguir usando la búsqueda manual
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

	// Cargar ubicación guardada al montar
	onMount(async () => {
		try {
			// Intentar cargar ubicación guardada
			const savedLocation = await getLatestLocation();
			if (savedLocation) {
				location = savedLocation;
			} else {
				// Si no hay ubicación guardada, usar ubicación por defecto
				location = {
					displayName: $t('onboarding_auth.form.location_setup.default_location'),
					latitude: 13.6929,
					longitude: -89.2182,
					zipCode: '',
					locationLoaded: true // Marcar como cargado para que el usuario pueda continuar
				};
			}
		} catch (error) {
			console.warn('Error loading saved location:', error);
			// Usar ubicación por defecto en caso de error
			location = {
				displayName: $t('onboarding_auth.form.location_setup.default_location'),
				latitude: 13.6929,
				longitude: -89.2182,
				zipCode: '',
				locationLoaded: true
			};
		}
	});

	async function handleSubmit() {
		try {
			isLoading = true;

			// Asegurar que tenemos coordenadas válidas
			if (!location.latitude || !location.longitude) {
				// Fallback a ubicación por defecto
				location = {
					displayName: $t('onboarding_auth.form.location_setup.default_location'),
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

<div class="card bg-base-100 w-full shadow-xl p-6" data-testid="onboarding-step-location">
	<div class="card-body relative">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-primary mb-2 text-end text-sm font-medium">
				{$t('onboarding_auth.form.location_setup.step')} {currentStep + 1} {$t('onboarding_auth.form.location_setup.of')} {totalSteps}
			</div>
			<h3 class="step-title mt-4 mb-3">{$t('onboarding_auth.form.location_setup.title')}</h3>
			<h5 class="mb-3">{$t('onboarding_auth.form.location_setup.subtitle')}</h5>
			<p class="step-description text-base-content mx-auto mb-6 max-w-xl text-lg">
				{$t('onboarding_auth.form.location_setup.description')}
			</p>

			<!-- Features List -->
			<div class="features-list mx-auto mb-6 w-fit space-y-2 text-left">
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.location_setup.features.flexible')}</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.location_setup.features.private')}</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.location_setup.features.adjustable')}</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.location_setup.features.optional')}</span>
				</div>
			</div>
			<p class="text-primary mb-6 text-lg">{$t('onboarding_auth.form.location_setup.find_tasks')}</p>
		</div>
	</div>

	<!-- Location Search and Map -->
	<div class="mx-auto w-full max-w-xl">
		<!-- Location AutoComplete Component -->
		<div class="mb-4">
			<LocationAutoComplete
				placeholder={$t('onboarding_auth.form.search_location')}
				{location}
				onLocationSelect={handleLocationSelect}
				showMap={true}
				mapHeight="400px"
				searchRadius={serviceRadius}
			/>

			<!-- Botón "Mi Ubicación" -->
			<div class="mt-4 flex flex-col items-center gap-2">
				<button
					aria-label={$t('onboarding_auth.form.use_my_location')}
					onclick={getUserLocation}
					class="btn btn-secondary"
					disabled={isGettingLocation}
					title={$t('onboarding_auth.form.use_my_location')}
				>
					{#if isGettingLocation}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<img src="/map-pin.png" alt="Location pin" class="h-5 w-5" />
					{/if}
					<span class="ml-2">{$t('onboarding_auth.form.use_my_location')}</span>
				</button>
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
		</div>

		<!-- Service Radius Panel - Colapsable en mobile -->
		<div class="mb-4">
			<!-- Desktop: siempre visible -->
			<div class="hidden md:block">
				<div class="bg-base-100/95 rounded-lg p-4 shadow-lg border border-base-300">
					<div class="mb-3 text-sm font-medium text-base-content">
						{$t('onboarding_auth.form.location_setup.service_radius')}: {serviceRadius} {$t('onboarding_auth.form.location_setup.km')}
					</div>
					<input
						type="range"
						min="1"
						max="50"
						bind:value={serviceRadius}
						class="range range-sm range-primary mb-2"
					/>
					<div class="flex justify-between text-xs text-base-content/70">
						<span>1 {$t('onboarding_auth.form.location_setup.km')}</span>
						<span>50 {$t('onboarding_auth.form.location_setup.km')}</span>
					</div>
				</div>
			</div>

			<!-- Mobile: colapsable -->
			<div class="md:hidden">
				<div class="collapse collapse-arrow bg-base-100/95 rounded-lg border border-base-300 shadow-lg">
					<input
						type="checkbox"
						bind:checked={radiusPanelCollapsed}
						class="peer"
						aria-label={$t('onboarding_auth.form.location_setup.toggle_radius')}
					/>
					<div class="collapse-title font-medium text-base-content">
						{$t('onboarding_auth.form.location_setup.service_radius')}: {serviceRadius} {$t('onboarding_auth.form.location_setup.km')}
					</div>
					<div class="collapse-content">
						<input
							type="range"
							min="1"
							max="50"
							bind:value={serviceRadius}
							class="range range-sm range-primary mb-2"
						/>
						<div class="flex justify-between text-xs text-base-content/70">
							<span>1 {$t('onboarding_auth.form.location_setup.km')}</span>
							<span>50 {$t('onboarding_auth.form.location_setup.km')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Status Message -->
		{#if location.locationLoaded}
			<div class="alert alert-success alert-outline">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>
					{$t('onboarding_auth.form.location_setup.location_set')}: 
					{location.displayName || $t('onboarding_auth.form.location_setup.default_location')}
				</span>
			</div>
		{/if}
	</div>

	<div class="mt-6 flex justify-between">
		<button type="button" class="btn btn-outline" onclick={prevStep}>
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
