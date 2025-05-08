<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { Geolocation } from '@capacitor/geolocation';

	// User location data
	let address = $state('');
	let city = $state('');
	let state = $state('');
	let country = $state('');
	let postalCode = $state('');
	let latitude = $state(0);
	let longitude = $state(0);
	let serviceRadius = $state(10); // Default to 10 km

	// Status indicators
	let isLoading = $state(false);
	let isLoadingMap = $state(true);
	let isGettingLocation = $state(false);
	let error = $state('');
	let addressError = $state('');

	// Map elements
	let mapElement: HTMLElement;
	let map: google.maps.Map;
	let marker: google.maps.Marker;
	let circle: google.maps.Circle;
	let searchBox: google.maps.places.SearchBox;

	onMount(async () => {
		try {
			// Load Google Maps API script dynamically
			if (!window.google || !window.google.maps) {
				isLoadingMap = true;
				// In a real implementation, you would load the Google Maps API here
				// For now, we'll assume it's already loaded
				console.warn('Google Maps API would be loaded here in a real implementation');
			}

			// Initialize map with default location
			initMap();
			
			// Try to get user's current location
			getUserLocation();

			// Load onboarding data from previous steps
			const onboardingDataResult = await Preferences.get({ key: 'bittasker_onboarding_data' });
			if (onboardingDataResult.value) {
				console.log('Previous onboarding data loaded');
				// In a real implementation, you might pre-fill some fields from previous steps
			}
		} catch (err) {
			console.error('Error initializing location setup:', err);
			error = 'Failed to initialize map. Please try refreshing the page.';
		}
	});

	function initMap() {
		// Simulate map initialization (in a real implementation, this would use Google Maps API)
		console.log('Map initialized at element:', mapElement);
		isLoadingMap = false;

		// In a real implementation, this would create the map, marker, circle, and search functionality
		// map = new google.maps.Map(mapElement, { ... });
		// marker = new google.maps.Marker({ ... });
		// circle = new google.maps.Circle({ ... });
		// searchBox = new google.maps.places.SearchBox(...);
	}

	async function getUserLocation() {
		try {
			isGettingLocation = true;
			// Get current position using Capacitor's Geolocation API
			const position = await Geolocation.getCurrentPosition();
			
			latitude = position.coords.latitude;
			longitude = position.coords.longitude;

			// In a real implementation, this would update the map and perform reverse geocoding
			// to get the address information
			console.log(`Got user location: ${latitude}, ${longitude}`);
			
			// Simulate getting address from coordinates (reverse geocoding)
			// In a real implementation, you would use a geocoding service
			setTimeout(() => {
				address = '123 Main St';
				city = 'Example City';
				state = 'Example State';
				country = 'United States';
				postalCode = '12345';
				isGettingLocation = false;
			}, 1000);
		} catch (err) {
			console.error('Error getting location:', err);
			isGettingLocation = false;
		}
	}

	function updateServiceRadius(event: Event) {
		const input = event.target as HTMLInputElement;
		serviceRadius = parseInt(input.value);
		
		// In a real implementation, this would update the circle on the map
		console.log(`Service radius updated to ${serviceRadius} km`);
	}

	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';
			addressError = '';

			// Validate address
			if (!address || !city) {
				addressError = 'Please provide your address';
				isLoading = false;
				return;
			}

			// Get existing onboarding data
			const onboardingDataResult = await Preferences.get({ key: 'bittasker_onboarding_data' });
			if (!onboardingDataResult.value) {
				error = 'Missing account setup data. Please go back to the previous steps.';
				isLoading = false;
				return;
			}

			const onboardingData = JSON.parse(onboardingDataResult.value);

			// Update onboarding data with location information
			const updatedData = {
				...onboardingData,
				location: {
					address,
					city,
					state,
					country,
					postalCode,
					coordinates: {
						latitude,
						longitude
					},
					serviceRadius
				}
			};

			// Store updated onboarding data
			await Preferences.set({
				key: 'bittasker_onboarding_data',
				value: JSON.stringify(updatedData)
			});

			// Go to completion page
			goto('/auth/onboarding/complete');
		} catch (err: unknown) {
			console.error('Location setup failed:', err);
			error = err instanceof Error ? err.message : 'Location setup failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex min-h-[85vh] w-full flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-8 flex flex-col items-center justify-center">
			<img src="/logo.svg" alt="BitTasker" class="h-16 w-auto" />
			<h1 class="mt-4 text-center text-2xl font-bold">Location Setup</h1>
			<div class="mt-2 flex w-full justify-between">
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 1</div>
					<span class="mt-1 text-xs">Account</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 2</div>
					<span class="mt-1 text-xs">Profile</span>
				</div>
				<div class="flex flex-col items-center">
					<div class="badge badge-primary">Step 3</div>
					<span class="mt-1 text-xs">Location</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 4</div>
					<span class="mt-1 text-xs">Complete</span>
				</div>
			</div>
		</div>

		<div class="card bg-base-100 w-full shadow-xl">
			<div class="card-body">
				<form onsubmit={handleSubmit} class="space-y-4">
					<!-- Map Section -->
					<div class="form-control">
						<label class="label">
							<span class="label-text">Set Your Location</span>
						</label>
						<div 
							class="h-64 w-full rounded-md bg-base-200 relative"
							bind:this={mapElement}
						>
							{#if isLoadingMap}
								<div class="absolute inset-0 flex items-center justify-center">
									<span class="loading loading-spinner loading-lg"></span>
								</div>
							{:else}
								<!-- Map Placeholder (in a real implementation, this would be a Google Map) -->
								<div class="h-full w-full bg-base-200 flex items-center justify-center flex-col">
									<div class="text-center mb-4">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										<p>Map Interface</p>
										<p class="text-xs text-base-content/70">In a real implementation, a Google Maps interface would be shown here</p>
									</div>
									<button 
										type="button" 
										class="btn btn-sm btn-outline" 
										onclick={getUserLocation}
										disabled={isGettingLocation}
									>
										{isGettingLocation ? 'Getting location...' : 'Get My Location'}
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Search Address -->
					<div class="form-control">
						<label class="label" for="address">
							<span class="label-text">Search Address</span>
						</label>
						<input
							type="text"
							id="address"
							bind:value={address}
							class="input input-bordered w-full {addressError ? 'input-error' : ''}"
							placeholder="Enter your address"
						/>
						{#if addressError}
							<label class="label">
								<span class="label-text-alt text-error">{addressError}</span>
							</label>
						{/if}
					</div>

					<!-- Service Radius -->
					<div class="form-control">
						<label class="label" for="radius">
							<span class="label-text">Service Radius: {serviceRadius} km</span>
						</label>
						<input
							type="range"
							id="radius"
							min="1"
							max="50"
							bind:value={serviceRadius}
							onchange={updateServiceRadius}
							class="range range-primary"
						/>
						<div class="flex justify-between text-xs px-2">
							<span>1 km</span>
							<span>25 km</span>
							<span>50 km</span>
						</div>
					</div>

					<!-- Location Details -->
					<div class="grid grid-cols-2 gap-3">
						<div class="form-control">
							<label class="label" for="city">
								<span class="label-text">City</span>
							</label>
							<input
								type="text"
								id="city"
								bind:value={city}
								class="input input-bordered w-full"
								placeholder="City"
								required
							/>
						</div>
						<div class="form-control">
							<label class="label" for="state">
								<span class="label-text">State/Province</span>
							</label>
							<input
								type="text"
								id="state"
								bind:value={state}
								class="input input-bordered w-full"
								placeholder="State"
							/>
						</div>
						<div class="form-control">
							<label class="label" for="postalCode">
								<span class="label-text">Postal Code</span>
							</label>
							<input
								type="text"
								id="postalCode"
								bind:value={postalCode}
								class="input input-bordered w-full"
								placeholder="Postal Code"
							/>
						</div>
						<div class="form-control">
							<label class="label" for="country">
								<span class="label-text">Country</span>
							</label>
							<select id="country" bind:value={country} class="select select-bordered w-full" required>
								<option value="">Select country</option>
								<option value="United States">United States</option>
								<option value="Canada">Canada</option>
								<option value="United Kingdom">United Kingdom</option>
								<option value="Australia">Australia</option>
								<option value="Germany">Germany</option>
								<option value="France">France</option>
								<option value="Japan">Japan</option>
								<option value="China">China</option>
								<option value="India">India</option>
								<option value="Brazil">Brazil</option>
							</select>
						</div>
					</div>

					{#if error}
						<div class="alert alert-error">
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
									d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{error}</span>
						</div>
					{/if}

					<!-- Form Actions -->
					<div class="mt-6 flex justify-between">
						<button 
							type="button" 
							class="btn btn-outline" 
							onclick={() => goto('/auth/onboarding/profile-info')}
						>
							Back
						</button>
						<button type="submit" class="btn btn-primary" disabled={isLoading}>
							{#if isLoading}
								<span class="loading loading-spinner"></span>
							{/if}
							Next
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div> 