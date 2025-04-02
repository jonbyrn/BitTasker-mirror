<script lang="ts">
	import type { LocationProps } from '$lib/types/props';
	import type { GooglePlaceFields } from '$lib/types/placeFields';

	// Props
	let {
		label = 'Location',
		placeholder = 'Enter address',
		location = {
			displayName: '',
			longitude: -122.4194,
			latitude: 37.7749,
			zipCode: '',
			locationLoaded: false
		},
		onLocationSelect
	}: LocationProps = $props();

	// State
	let searchInput: HTMLInputElement;
	let predictions = $state<(google.maps.places.PlacePrediction | null)[]>([]);
	let isLoading = $state(false);
	let hasError = $state(false);
	let showOptions = $state(false);

	async function getPredictions() {
		try {
			if (!searchInput.value) return;
			isLoading = true;
			const { AutocompleteSessionToken, AutocompleteSuggestion } = (await google.maps.importLibrary(
				'places'
			)) as google.maps.PlacesLibrary;

			const token = new AutocompleteSessionToken();

			const request = {
				input: searchInput.value,
				language: 'en-US',
				sessionToken: token
			};

			const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
			predictions = suggestions.map((suggestion) => suggestion.placePrediction);
			showOptions = true;
			isLoading = false;
		} catch (error) {
			hasError = true;
			console.error('Failed to get predictions:', error);
		} finally {
			isLoading = false;
		}
	}

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
		let place = prediction.toPlace();
		await place.fetchFields({
			fields: ['displayName', 'formattedAddress', 'location'] as GooglePlaceFields[]
		});

		const displayName = place.displayName;
		const lat = place.location?.lat();
		const lng = place.location?.lng();

		if (!displayName || !lat || !lng) return;

		location.displayName = prediction.text.text.toString();
		location.latitude = lat;
		location.longitude = lng;
		location.locationLoaded = true;

		if (onLocationSelect) {
			onLocationSelect(location);
		}

		showOptions = false;
	}
</script>

<div class="form-control relative w-full">
	<label class="label" for="location-search">
		<span class="label-text">{label}</span>
	</label>
	<div class="relative">
		<input
			bind:this={searchInput}
			id="location-search"
			type="text"
			{placeholder}
			class="input input-bordered w-full {hasError ? 'input-error' : ''}"
			value={location.displayName}
			oninput={debounce(() => getPredictions(), 300)}
		/>
		{#if isLoading}
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<span class="loading loading-spinner loading-sm"></span>
			</div>
		{/if}
	</div>

	{#if hasError}
		<label class="label" for="location-search">
			<span class="label-text-alt text-error">
				Failed to get address suggestions. Please try again.
			</span>
		</label>
	{/if}

	{#if showOptions}
		<div
			class="predictions-dropdown bg-base-100 absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg shadow-lg"
		>
			{#if predictions.length > 0}
				{#each predictions as prediction}
					<button
						class="hover:bg-base-200 w-full cursor-pointer px-4 py-2 text-left"
						onclick={() => selectPrediction(prediction!)}
					>
						{prediction?.text}
					</button>
				{/each}
			{:else}
				<label class="label" for="location-search">
					<span class="label-text-alt text-error">No places found..</span>
				</label>
			{/if}
		</div>
	{/if}
</div>
