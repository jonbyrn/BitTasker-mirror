<script lang="ts">
  import { UpdateUserProfileStore } from '$houdini';
  import { onMount } from 'svelte';

  interface Location {
    displayName: string;
    latitude: number;
    longitude: number;
    zipCode?: string;
    serviceRadius?: number;
  }

  let { user, onComplete } = $props<{
    user: { location?: Location | null } | null | undefined;
    onComplete: (completed: boolean) => void;
  }>();

  const profileStore = new UpdateUserProfileStore();

  // Local state
  let address = $state('');
  let city = $state('');
  let stateRegion = $state('');
  let zipCode = $state('');
  let country = $state('');
  let latitude = $state(user?.location?.latitude || 0);
  let longitude = $state(user?.location?.longitude || 0);
  let serviceRadius = $state(user?.location?.serviceRadius || 25); // Default 25km radius
  let isLoading = $state(false);
  let error = $state('');
  let map: google.maps.Map | undefined;
  let circle: google.maps.Circle | undefined;
  let geocoder: google.maps.Geocoder | undefined;
  let searchBox: google.maps.places.SearchBox | undefined;

  // Track form completion
  $effect(() => {
    const isComplete = address && city && stateRegion && zipCode && country && latitude && longitude;
    onComplete(isComplete);
  });

  onMount(async () => {
    // Load Google Maps JavaScript API
    if (!window.google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      
      script.onload = initializeMap;
    } else {
      initializeMap();
    }
  });

  function initializeMap() {
    const mapElement = document.getElementById('map');
    const searchInput = document.getElementById('location-search');
    
    if (!mapElement || !searchInput) return;

    // Initialize map
    map = new google.maps.Map(mapElement, {
      center: { lat: latitude || 0, lng: longitude || 0 },
      zoom: 12,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    // Initialize geocoder
    geocoder = new google.maps.Geocoder();

    // Initialize search box
    searchBox = new google.maps.places.SearchBox(searchInput as HTMLInputElement);
    
    if (map && searchBox) {
      map.controls[google.maps.ControlPosition.TOP_LEFT].push(searchInput);

      // Initialize service area circle
      circle = new google.maps.Circle({
        strokeColor: "#FF0000",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#FF0000",
        fillOpacity: 0.35,
        map,
        center: { lat: latitude || 0, lng: longitude || 0 },
        radius: serviceRadius * 1000 // Convert km to meters
      });

      // Bias the SearchBox results towards current map's viewport
      map.addListener("bounds_changed", () => {
        if (map && searchBox) {
          searchBox.setBounds(map.getBounds() as google.maps.LatLngBounds);
        }
      });

      // Listen for the event fired when the user selects a prediction
      searchBox.addListener("places_changed", () => {
        const places = searchBox?.getPlaces();
        if (!places || places.length === 0 || !map || !circle) return;

        const place = places[0];
        if (!place.geometry || !place.geometry.location) return;

        // Update map and circle
        map.setCenter(place.geometry.location);
        circle.setCenter(place.geometry.location);

        // Update coordinates
        latitude = place.geometry.location.lat();
        longitude = place.geometry.location.lng();

        // Update address components
        place.address_components?.forEach((component) => {
          const types = component.types;
          if (types.includes('street_number') || types.includes('route')) {
            address = component.long_name;
          } else if (types.includes('locality')) {
            city = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            stateRegion = component.long_name;
          } else if (types.includes('postal_code')) {
            zipCode = component.long_name;
          } else if (types.includes('country')) {
            country = component.long_name;
          }
        });
      });

      // Update circle radius when service radius changes
      $effect(() => {
        if (circle) {
          circle.setRadius(serviceRadius * 1000);
        }
      });
    }
  }

  async function handleSubmit() {
    try {
      isLoading = true;
      error = '';

      // Validate inputs
      if (!address || !city || !stateRegion || !zipCode || !country || !latitude || !longitude) {
        error = 'Please fill in all location fields';
        return;
      }

      // Create location data
      const locationData = {
        displayName: `${address}, ${city}, ${stateRegion} ${zipCode}, ${country}`,
        latitude,
        longitude,
        zipCode,
        serviceRadius
      };

      // Update profile using GraphQL
      const result = await profileStore.mutate({
        input: {
          location: locationData
        }
      });

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Show success message
      const toast = document.getElementById('location-toast-success');
      if (toast) toast.style.display = 'block';
    } catch (err) {
      console.error('Location update failed:', err);
      error = err instanceof Error ? err.message : 'Failed to update location';
    } finally {
      isLoading = false;
    }
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
  <!-- Map Search Input -->
  <div class="form-control">
    <label class="label" for="location-search">
      <span class="label-text font-medium">Search Location</span>
    </label>
    <input
      type="text"
      id="location-search"
      class="input input-bordered w-full"
      placeholder="Search for your location..."
    />
  </div>

  <!-- Map -->
  <div id="map" class="h-[400px] w-full rounded-lg border"></div>

  <!-- Service Radius -->
  <div class="form-control">
    <label class="label" for="serviceRadius">
      <span class="label-text font-medium">Service Area Radius</span>
      <span class="label-text-alt">{serviceRadius}km</span>
    </label>
    <input
      type="range"
      id="serviceRadius"
      bind:value={serviceRadius}
      min="1"
      max="100"
      class="range range-primary"
    />
    <div class="flex w-full justify-between px-2 text-xs">
      <span>1km</span>
      <span>25km</span>
      <span>50km</span>
      <span>75km</span>
      <span>100km</span>
    </div>
  </div>

  <!-- Address Details -->
  <div class="grid gap-4 md:grid-cols-2">
    <!-- Street Address -->
    <div class="form-control">
      <label class="label" for="address">
        <span class="label-text font-medium">Street Address</span>
      </label>
      <input
        type="text"
        id="address"
        bind:value={address}
        class="input input-bordered w-full"
        required
      />
    </div>

    <!-- City -->
    <div class="form-control">
      <label class="label" for="city">
        <span class="label-text font-medium">City</span>
      </label>
      <input
        type="text"
        id="city"
        bind:value={city}
        class="input input-bordered w-full"
        required
      />
    </div>

    <!-- State/Province -->
    <div class="form-control">
      <label class="label" for="stateRegion">
        <span class="label-text font-medium">State/Province</span>
      </label>
      <input
        type="text"
        id="stateRegion"
        bind:value={stateRegion}
        class="input input-bordered w-full"
        required
      />
    </div>

    <!-- ZIP/Postal Code -->
    <div class="form-control">
      <label class="label" for="zipCode">
        <span class="label-text font-medium">ZIP/Postal Code</span>
      </label>
      <input
        type="text"
        id="zipCode"
        bind:value={zipCode}
        class="input input-bordered w-full"
        required
      />
    </div>

    <!-- Country -->
    <div class="form-control">
      <label class="label" for="country">
        <span class="label-text font-medium">Country</span>
      </label>
      <input
        type="text"
        id="country"
        bind:value={country}
        class="input input-bordered w-full"
        required
      />
    </div>
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="alert alert-error alert-outline">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Submit Button -->
  <div class="flex justify-end">
    <button type="submit" class="btn btn-primary" disabled={isLoading}>
      {#if isLoading}
        <span class="loading loading-spinner"></span>
      {/if}
      Save Location & Service Area
    </button>
  </div>
</form>

<!-- Success Toast -->
<div id="location-toast-success" class="toast toast-end" style="display: none;">
  <div class="alert alert-success alert-outline">
    <span>Location updated successfully!</span>
  </div>
</div>

<style>
  /* Hide default Google Maps UI elements */
  :global(.gm-style-cc),
  :global(.gmnoprint),
  :global(.gm-style > div:last-child) {
    display: none !important;
  }
</style> 