# Tasker Location Collection for TASKER_LOCATION Services

## Overview

This document outlines the implementation plan for collecting the Tasker's (client's) location when booking or inquiring about services designated as `TASKER_LOCATION` ("At Tasker's Location"). The Tasker's location must be validated against the Taskee's service radius, and displayed to the Taskee with links to external map applications.

---

## Problem Statement

When a Taskee creates a service with location type `TASKER_LOCATION`, the service indicates that the Taskee will travel to the Tasker's (client's) location to perform the service. However:

1. **The Tasker's location is unknown at listing time** - needs to be collected during booking/inquiry
2. **Radius enforcement** - The Taskee sets a service radius; the Tasker's location must fall within this radius
3. **Display to Taskee** - The Taskee needs to see the location and navigate to it via external map apps
4. **Both flows need support** - Book Now AND Inquiries must collect the Tasker's location

---

## Business Rules

### Location Type Model (Single Selection)

Users choose **ONE** location type when creating a service - there is no "remote + in-person" combination:

| Location Type     | Description                                     | Location Collection at Booking                    |
| ----------------- | ----------------------------------------------- | ------------------------------------------------- |
| `REMOTE`          | Online/virtual service                          | No location needed                                |
| `TASKEE_LOCATION` | Service at Taskee's (provider's) fixed location | No location needed (Taskee's location is pre-set) |
| `TASKER_LOCATION` | Taskee travels to Tasker's (client's) location  | **Tasker must provide location**                  |

### Radius Validation for TASKER_LOCATION

For `TASKER_LOCATION` services:

1. The **Taskee** sets their base location (`locationDetails.taskerLocation.serviceLocation`) and **service radius** (`locationDetails.taskerLocation.serviceRadius`) during service creation
2. The **Tasker** provides their desired service location during booking/inquiry
3. The Tasker's location **must be within** the Taskee's service radius
4. If outside radius → show error, prevent booking/inquiry submission

---

## Current Architecture Analysis

### Data Structures

#### Service Location Configuration (set by Taskee during service creation)

```typescript
// src/lib/types/service.d.ts
export interface ServiceLocationDetails {
	// For TASKER_LOCATION mode - Taskee's travel configuration
	taskerLocation?: {
		serviceLocation: Location; // Taskee's BASE location (for distance calculation)
		serviceRadius?: number; // Maximum travel radius in km
		perDistanceCharge?: {
			amount: number;
			currency: string; // 'BTC' | 'USDt'
			unit: 'km' | 'mile';
		};
	};
	// For TASKEE_LOCATION mode - Taskee's fixed service location
	taskeeLocation?: {
		serviceLocation?: Location;
		locationDisplayName?: string;
		serviceRadius?: number;
	};
}
```

#### Contract Location Snapshot (stored with contract)

```typescript
// src/lib/types/contract.d.ts
export interface ServiceContractLocationSnapshot {
	mode: 'tasker_location' | 'taskee_location';
	label: string;
	location?: Location; // This is where Tasker's location will be stored
}

export interface ServiceContractAgreementSnapshot {
	serviceLocation?: ServiceContractLocationSnapshot;
	// ... other fields
}
```

#### Quote Request Payload (for Inquiries)

```typescript
// src/lib/types/service.d.ts
export interface QuoteRequestPayload {
	title: string;
	description: string;
	customFormResponses?: Record<string, string | number | boolean | string[]>;
	attachments?: Attachment[];
	// TODO: Add serviceLocation field for TASKER_LOCATION services
}
```

### Key Files and Their Roles

| File                                    | Current State                           | Changes Needed                                                |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `ServiceDetailsView.svelte`             | Orchestrates Book Now and Inquiry flows | Add location state, pass to modals, update agreement snapshot |
| `ServiceInstantBuyModal.svelte`         | Book Now drawer UI (display only)       | Add LocationPicker when `TASKER_LOCATION`                     |
| `RequestQuoteModal.svelte`              | Inquiry modal UI                        | Add LocationPicker when `TASKER_LOCATION`                     |
| `LocationPicker.svelte`                 | Full-featured location input with map   | **REUSE** - already supports radius display                   |
| `location.ts`                           | Location snapshot utilities             | Add radius validation function                                |
| `maps.ts`                               | Map link generation                     | Add universal map link generator                              |
| `ContractDrawer.svelte` (v1 deprecated) | Shows location with map link            | Already works (update v2 drawer)                              |
| `ContractDrawerNDK.svelte` (v2 current) | Missing location display                | Add location section with map links                           |

### Existing Distance Calculation

```typescript
// src/lib/utils/service-indexing.ts (can be extracted and reused)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}
```

---

## Implementation Plan

### Phase 1: Core Utilities

#### 1.1 Create Distance Validation Utility

**File:** `src/lib/utils/location/distance.ts` (new file)

```typescript
import type { Location } from '$lib/types/task';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns distance in kilometers
 */
export function calculateDistanceKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function toRad(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

export interface RadiusValidationResult {
	valid: boolean;
	distanceKm: number;
	maxRadiusKm: number;
	errorCode?: 'OUTSIDE_RADIUS' | 'MISSING_COORDINATES';
}

/**
 * Validate that a location is within the service provider's radius
 */
export function validateLocationWithinRadius(
	taskerLocation: Location,
	taskeeBaseLocation: Location,
	serviceRadiusKm: number
): RadiusValidationResult {
	if (
		!taskerLocation.latitude ||
		!taskerLocation.longitude ||
		!taskeeBaseLocation.latitude ||
		!taskeeBaseLocation.longitude
	) {
		return {
			valid: false,
			distanceKm: 0,
			maxRadiusKm: serviceRadiusKm,
			errorCode: 'MISSING_COORDINATES'
		};
	}

	const distance = calculateDistanceKm(
		taskerLocation.latitude,
		taskerLocation.longitude,
		taskeeBaseLocation.latitude,
		taskeeBaseLocation.longitude
	);

	return {
		valid: distance <= serviceRadiusKm,
		distanceKm: Math.round(distance * 10) / 10, // Round to 1 decimal
		maxRadiusKm: serviceRadiusKm,
		errorCode: distance > serviceRadiusKm ? 'OUTSIDE_RADIUS' : undefined
	};
}
```

#### 1.2 Create Universal Map Link Generator

**File:** `src/lib/utils/location/maps.ts` (update existing file)

Add these functions to the existing file:

```typescript
import type { Location } from '$lib/types/task';

export interface MapLinkOptions {
	label?: string;
	navigateMode?: boolean;
}

/**
 * Generate universal map link that works across platforms
 * Uses maps.rbt.no for automatic platform detection and native app opening
 */
export function generateUniversalMapLink(location: Location, options?: MapLinkOptions): string {
	if (location.latitude && location.longitude) {
		// Coordinate-based link (most accurate)
		return `https://maps.rbt.no/?q=${location.latitude},${location.longitude}`;
	}

	// Fallback to address search
	const query = location.formattedAddress || location.displayName || '';
	return `https://maps.rbt.no/?q=${encodeURIComponent(query)}`;
}

/**
 * Generate Google Maps link (works cross-platform)
 */
export function generateGoogleMapsLink(location: Location, options?: MapLinkOptions): string {
	if (location.latitude && location.longitude) {
		const lat = location.latitude;
		const lng = location.longitude;
		return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
	}

	const address = location.formattedAddress || location.displayName || '';
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Generate Apple Maps link (iOS/macOS native)
 */
export function generateAppleMapsLink(location: Location, options?: MapLinkOptions): string {
	if (location.latitude && location.longitude) {
		return `https://maps.apple.com/?ll=${location.latitude},${location.longitude}`;
	}

	const query = location.formattedAddress || location.displayName || '';
	return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

/**
 * Generate Waze deep link (navigation-focused)
 */
export function generateWazeLink(location: Location, options?: MapLinkOptions): string {
	if (location.latitude && location.longitude) {
		const base = `https://waze.com/ul?ll=${location.latitude},${location.longitude}`;
		return options?.navigateMode ? `${base}&navigate=yes` : base;
	}

	const query = location.formattedAddress || location.displayName || '';
	return `https://waze.com/ul?q=${encodeURIComponent(query)}`;
}

export interface MapLinkSet {
	universal: string;
	google: string;
	apple: string;
	waze: string;
}

/**
 * Generate all map links for a location
 */
export function generateAllMapLinks(location: Location, options?: MapLinkOptions): MapLinkSet {
	return {
		universal: generateUniversalMapLink(location, options),
		google: generateGoogleMapsLink(location, options),
		apple: generateAppleMapsLink(location, options),
		waze: generateWazeLink(location, options)
	};
}
```

### Phase 2: Book Now Flow

#### 2.1 Update ServiceDetailsView.svelte

Add state management for Tasker's location:

```typescript
// Add to script section
import { validateLocationWithinRadius } from '$lib/utils/location/distance';
import type { Location } from '$lib/types/task';

// New state for Tasker's location during booking
let bookNowTaskerLocation = $state<Location | null>(null);
let bookNowLocationError = $state<string | null>(null);

// Derived: Check if location is required for this service
const requiresTaskerLocationForBooking = $derived(
	service?.serviceLocationTypes?.length === 1 &&
		service.serviceLocationTypes[0] === ServiceLocationTypeEnum.TASKER_LOCATION
);

// Derived: Get Taskee's base location and radius for validation
const taskeeServiceConfig = $derived.by(() => {
	if (!service?.locationDetails?.taskerLocation) return null;
	return {
		baseLocation: service.locationDetails.taskerLocation.serviceLocation,
		radiusKm: service.locationDetails.taskerLocation.serviceRadius ?? 50 // Default 50km
	};
});

// Handle location selection with validation
function handleBookNowLocationSelect(location: Location) {
	bookNowLocationError = null;

	if (!taskeeServiceConfig?.baseLocation) {
		bookNowTaskerLocation = location;
		return;
	}

	const validation = validateLocationWithinRadius(
		location,
		taskeeServiceConfig.baseLocation,
		taskeeServiceConfig.radiusKm
	);

	if (!validation.valid) {
		bookNowLocationError =
			`This location is ${validation.distanceKm}km away, ` +
			`but the service provider only travels up to ${validation.maxRadiusKm}km.`;
		bookNowTaskerLocation = null;
	} else {
		bookNowTaskerLocation = location;
	}
}

// Update canConfirm derived to require location
const instantBuyCanConfirm = $derived.by(() => {
	// ... existing checks
	if (requiresTaskerLocationForBooking && !bookNowTaskerLocation?.latitude) {
		return false;
	}
	return true;
});

// Update buildInstantBuyAgreementSnapshot to include Tasker's location
async function buildInstantBuyAgreementSnapshot(
	runtimeService: ServiceRuntimeFields,
	purchaseKey: string
): Promise<ServiceContractAgreementSnapshot> {
	// ... existing code ...

	// Build location snapshot - use Tasker's provided location for TASKER_LOCATION
	let serviceLocation: ServiceContractLocationSnapshot | undefined;

	if (requiresTaskerLocationForBooking && bookNowTaskerLocation?.latitude) {
		serviceLocation = {
			mode: 'tasker_location',
			label:
				bookNowTaskerLocation.formattedAddress ||
				bookNowTaskerLocation.displayName ||
				`${bookNowTaskerLocation.latitude}, ${bookNowTaskerLocation.longitude}`,
			location: bookNowTaskerLocation
		};
	} else {
		serviceLocation = buildServiceContractLocationSnapshot(runtimeService);
	}

	return {
		selectedTierId: selectedTierId ?? undefined,
		selectedTierLabel: selectedTier?.name ?? undefined,
		serviceLocation // Updated to use Tasker's location when applicable
		// ... rest of existing fields
	};
}
```

#### 2.2 Update ServiceInstantBuyModal.svelte

Add location picker section:

```svelte
<script lang="ts">
	// Add to existing props
	let {
		// ... existing props
		requiresTaskerLocation = false,
		taskeeServiceRadius = null,
		taskerLocation = null,
		locationError = null,
		onTaskerLocationSelect = () => {}
	} = $props<{
		// ... existing props
		requiresTaskerLocation?: boolean;
		taskeeServiceRadius?: number | null;
		taskerLocation?: Location | null;
		locationError?: string | null;
		onTaskerLocationSelect?: (location: Location) => void;
	}>();

	const hasValidLocation = $derived(!requiresTaskerLocation || taskerLocation?.latitude != null);
</script>

<!-- Add after provider info section, before pricing card -->
{#if requiresTaskerLocation}
	<div class="bg-base-100 rounded-lg p-4">
		<div class="text-base-content/70 mb-2 text-xs font-medium">
			{$t('dashboard.services.detail.book_now_drawer.your_location')}
		</div>
		<p class="text-base-content/60 mb-3 text-sm">
			{$t('dashboard.services.detail.book_now_drawer.your_location_description')}
			{#if taskeeServiceRadius}
				<span class="font-medium">
					({$t('dashboard.services.detail.book_now_drawer.max_distance', {
						values: { distance: taskeeServiceRadius }
					})})
				</span>
			{/if}
		</p>

		<LocationPicker
			placeholder={$t('dashboard.services.detail.book_now_drawer.your_location_placeholder')}
			location={taskerLocation ?? undefined}
			onLocationSelect={onTaskerLocationSelect}
			mapHeight="180px"
			showFullscreen={false}
			showGeolocation={true}
			showServiceRadius={false}
			showRadiusCircle={false}
		/>

		{#if locationError}
			<div class="alert alert-error alert-outline mt-3 text-sm">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span>{locationError}</span>
			</div>
		{:else if !taskerLocation?.latitude}
			<p class="text-warning mt-2 text-xs">
				{$t('dashboard.services.detail.book_now_drawer.location_required')}
			</p>
		{:else}
			<div class="alert alert-success alert-outline mt-3 text-sm">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
				<span class="truncate">{taskerLocation.displayName || taskerLocation.formattedAddress}</span
				>
			</div>
		{/if}
	</div>
{/if}

<!-- Update confirm button disabled state -->
<button
	type="button"
	class="btn btn-primary"
	disabled={isSubmitting || !canConfirm || !hasValidLocation}
	onclick={handleDrawerConfirmClick}
>
	<!-- ... existing content -->
</button>
```

### Phase 3: Inquiry Flow

#### 3.1 Update QuoteRequestPayload Type

**File:** `src/lib/types/service.d.ts`

```typescript
export interface QuoteRequestPayload {
	title: string;
	description: string;
	tierId?: string;
	selectedAddOns?: string[];
	rushDelivery?: boolean;
	quoteAmountUsdt?: string;
	customFormResponses?: Record<string, string | number | boolean | string[]>;
	attachments?: Attachment[];
	// NEW: Location for TASKER_LOCATION services
	serviceLocation?: {
		mode: 'tasker_location';
		label: string;
		location: Location;
	};
}
```

#### 3.2 Update RequestQuoteModal.svelte

Add similar location picker logic as Book Now modal:

```svelte
<script lang="ts">
	// Add props
	let {
		// ... existing props
		requiresTaskerLocation = false,
		taskeeServiceRadius = null
	} = $props<{
		// ... existing props
		requiresTaskerLocation?: boolean;
		taskeeServiceRadius?: number | null;
	}>();

	// Add state
	let taskerLocation = $state<Location | null>(null);
	let locationError = $state<string | null>(null);

	// Add location validation
	function handleLocationSelect(location: Location) {
		locationError = null;

		if (!taskeeBaseLocation) {
			taskerLocation = location;
			return;
		}

		const validation = validateLocationWithinRadius(
			location,
			taskeeBaseLocation,
			taskeeServiceRadius ?? 50
		);

		if (!validation.valid) {
			locationError = `Location is ${validation.distanceKm}km away, max is ${validation.maxRadiusKm}km`;
			taskerLocation = null;
		} else {
			taskerLocation = location;
		}
	}

	// Update payload builder
	async function handleConfirm() {
		// ... existing validation

		const payload: QuoteRequestPayload = {
			title: title.trim(),
			description: description.trim(),
			attachments: attachments.length > 0 ? attachments : undefined
			// ... other fields
		};

		// Add location for TASKER_LOCATION services
		if (requiresTaskerLocation && taskerLocation?.latitude) {
			payload.serviceLocation = {
				mode: 'tasker_location',
				label: taskerLocation.formattedAddress || taskerLocation.displayName || '',
				location: taskerLocation
			};
		}

		// ... rest of existing logic
	}
</script>

<!-- Add location picker section after description, before custom fields -->
{#if requiresTaskerLocation}
	<div class="form-control">
		<label class="label">
			<span class="label-text">
				{$t('dashboard.services.detail.request_quote_modal.your_location')}
				<span class="text-error">*</span>
			</span>
		</label>
		<p class="text-base-content/60 mb-2 text-sm">
			{$t('dashboard.services.detail.request_quote_modal.your_location_description')}
		</p>

		<LocationPicker
			placeholder={$t('dashboard.services.detail.request_quote_modal.location_placeholder')}
			location={taskerLocation ?? undefined}
			onLocationSelect={handleLocationSelect}
			mapHeight="180px"
			showFullscreen={false}
			showGeolocation={true}
		/>

		{#if locationError}
			<span class="label-text-alt text-error">{locationError}</span>
		{:else if !taskerLocation?.latitude}
			<span class="label-text-alt text-warning">
				{$t('dashboard.services.detail.request_quote_modal.location_required')}
			</span>
		{/if}
	</div>
{/if}
```

### Phase 4: Contract Location Display

#### 4.1 Update ContractDrawerNDK.svelte

Add location display section with map links:

```svelte
<script lang="ts">
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconGoogle from '~icons/mdi/google';
	import IconApple from '~icons/mdi/apple';
	import IconNavigation from '~icons/mdi/navigation';
	import { generateAllMapLinks } from '$lib/utils/location/maps';
	import { getServiceContractLocationPresentationFromAgreementSnapshot } from '$lib/utils/service-contract/location';

	// Derived location data
	const agreementSnapshot = $derived(contract?.agreementSnapshot);
	const serviceLocation = $derived(
		getServiceContractLocationPresentationFromAgreementSnapshot(agreementSnapshot)
	);
	const mapLinks = $derived(
		serviceLocation?.location
			? generateAllMapLinks(serviceLocation.location, { navigateMode: true })
			: null
	);
</script>

<!-- Add after timeline section -->
{#if serviceLocation}
	<div class="mt-3 space-y-2" data-testid="service-contract-location">
		<div class="flex items-start gap-2">
			<IconMapMarker class="text-primary mt-0.5 h-5 w-5 shrink-0" />
			<div class="min-w-0 flex-1">
				<div class="text-base-content/60 text-xs font-medium">
					{serviceLocation.mode === 'tasker_location'
						? $t('dashboard.contracts.service_location_tasker')
						: $t('dashboard.contracts.service_location_taskee')}
				</div>
				<div class="word-break-words text-sm font-medium">
					{serviceLocation.label}
				</div>
			</div>
		</div>

		{#if mapLinks}
			<div class="ml-7 flex flex-wrap gap-2">
				<a
					href={mapLinks.universal}
					target="_blank"
					rel="external noopener noreferrer"
					class="btn btn-xs btn-outline gap-1"
					data-testid="map-link-universal"
				>
					<IconMapMarker class="h-3 w-3" />
					{$t('dashboard.contracts.open_map')}
				</a>
				<a
					href={mapLinks.google}
					target="_blank"
					rel="external noopener noreferrer"
					class="btn btn-xs btn-ghost gap-1"
					data-testid="map-link-google"
				>
					<IconGoogle class="h-3 w-3" />
					Google
				</a>
				<a
					href={mapLinks.apple}
					target="_blank"
					rel="external noopener noreferrer"
					class="btn btn-xs btn-ghost gap-1"
					data-testid="map-link-apple"
				>
					<IconApple class="h-3 w-3" />
					Apple
				</a>
				<a
					href={mapLinks.waze}
					target="_blank"
					rel="external noopener noreferrer"
					class="btn btn-xs btn-ghost gap-1"
					data-testid="map-link-waze"
				>
					<IconNavigation class="h-3 w-3" />
					Waze
				</a>
			</div>
		{/if}
	</div>
{/if}
```

### Phase 5: Translations

#### 5.1 English Translations

**File:** `static/locales/en/dashboard/services/detail.json`

```json
{
	"book_now_drawer": {
		"your_location": "Service Location",
		"your_location_description": "Where should the service be performed?",
		"your_location_placeholder": "Enter your address or use current location",
		"location_required": "Please select your location to continue",
		"max_distance": "Within {distance}km of provider"
	},
	"request_quote_modal": {
		"your_location": "Service Location",
		"your_location_description": "Where would you like the service performed?",
		"location_placeholder": "Enter address or use current location",
		"location_required": "Location is required for this service"
	}
}
```

**File:** `static/locales/en/dashboard/contracts.json` (add keys)

```json
{
	"service_location_tasker": "Service Location (Your Location)",
	"service_location_taskee": "Service Location (Provider's Location)",
	"open_map": "Open Map",
	"location_outside_radius": "This location is outside the service area"
}
```

#### 5.2 Spanish Translations

**File:** `static/locales/es/dashboard/services/detail.json`

```json
{
	"book_now_drawer": {
		"your_location": "Ubicación del Servicio",
		"your_location_description": "¿Dónde se realizará el servicio?",
		"your_location_placeholder": "Ingresa tu dirección o usa ubicación actual",
		"location_required": "Selecciona tu ubicación para continuar",
		"max_distance": "Dentro de {distance}km del proveedor"
	},
	"request_quote_modal": {
		"your_location": "Ubicación del Servicio",
		"your_location_description": "¿Dónde te gustaría que se realice el servicio?",
		"location_placeholder": "Ingresa dirección o usa ubicación actual",
		"location_required": "La ubicación es requerida para este servicio"
	}
}
```

---

## Map Component Recommendation

### Recommendation: Use Existing LocationPicker.svelte

The existing `LocationPicker.svelte` component is **ideal** for this implementation:

**Pros:**

- Already has all required features (search, geolocation, map display)
- Uses Google Maps API with autocomplete
- Supports radius display (can show Taskee's service area)
- Has fullscreen mode for better mobile UX
- Returns complete `Location` object with all fields
- Already styled to match the app's design system

**No changes needed to the component** - it's flexible enough to work in both modals.

### Alternative: Minimal Location Input

If the LocationPicker proves too heavy for the modal context, a simpler alternative would be:

1. Text input with Google Places Autocomplete
2. "Use my location" button
3. No map display (show address text only)

This would require creating a new `SimpleLocationInput.svelte` component (~100 lines).

---

## Universal Map Links Implementation

### Recommended Approach: Platform-Agnostic URL

Based on web research, the best solution for universal map links:

| Service                     | URL Pattern                                                   | Behavior                                |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| **maps.rbt.no** (Universal) | `https://maps.rbt.no/?q={lat},{lng}`                          | Auto-detects platform, opens native app |
| **Google Maps**             | `https://www.google.com/maps/search/?api=1&query={lat},{lng}` | Opens Google Maps app or web            |
| **Apple Maps**              | `https://maps.apple.com/?ll={lat},{lng}`                      | Opens Apple Maps on iOS/macOS           |
| **Waze**                    | `https://waze.com/ul?ll={lat},{lng}&navigate=yes`             | Opens Waze with navigation              |

**Primary link:** Use `maps.rbt.no` for the main "Open Map" button - it automatically opens the user's preferred/native map app.

**Secondary links:** Provide Google, Apple, Waze as explicit options for users who prefer a specific app.

---

## Testing Plan

### Unit Tests

1. `validateLocationWithinRadius` - test boundary cases
2. `generateAllMapLinks` - test with various location formats
3. Snapshot builder with Tasker's location

### Integration Tests

1. Book Now flow shows location picker for `TASKER_LOCATION` services
2. Inquiry flow shows location picker for `TASKER_LOCATION` services
3. Location validation blocks submission when outside radius
4. Contract drawer displays location with working map links

### E2E Tests

1. Complete Book Now with location selection
2. Complete Inquiry with location selection
3. Verify location appears in contract view
4. Test map links open correctly on mobile

---

## Summary

### Files to Create/Modify

| File                                                       | Action     | Complexity |
| ---------------------------------------------------------- | ---------- | ---------- |
| `src/lib/utils/location/distance.ts`                       | **CREATE** | Low        |
| `src/lib/utils/location/maps.ts`                           | **UPDATE** | Low        |
| `src/lib/components/service/ServiceDetailsView.svelte`     | **UPDATE** | Medium     |
| `src/lib/components/service/ServiceInstantBuyModal.svelte` | **UPDATE** | Medium     |
| `src/lib/components/service/RequestQuoteModal.svelte`      | **UPDATE** | Medium     |
| `src/lib/components/contracts/ContractDrawerNDK.svelte`    | **UPDATE** | Low        |
| `src/lib/types/service.d.ts`                               | **UPDATE** | Low        |
| `static/locales/en/dashboard/services/detail.json`         | **UPDATE** | Low        |
| `static/locales/es/dashboard/services/detail.json`         | **UPDATE** | Low        |
| `static/locales/en/dashboard/contracts.json`               | **UPDATE** | Low        |
| `static/locales/es/dashboard/contracts.json`               | **UPDATE** | Low        |

### Implementation Order

1. **Phase 1**: Core utilities (distance validation, map links)
2. **Phase 2**: Book Now flow (ServiceDetailsView + ServiceInstantBuyModal)
3. **Phase 3**: Inquiry flow (RequestQuoteModal)
4. **Phase 4**: Contract display (ContractDrawerNDK)
5. **Phase 5**: Translations (all locale files)

### Risk Assessment

- **Low Risk**: Uses existing components and patterns
- **Medium Effort**: ~8-10 files to modify
- **Dependencies**: Google Maps API (already integrated)

---

## Appendix: Location Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE CREATION (Taskee)                     │
├─────────────────────────────────────────────────────────────────┤
│  Taskee sets:                                                    │
│  - serviceLocationTypes: ['tasker_location']                     │
│  - locationDetails.taskerLocation.serviceLocation (their base)   │
│  - locationDetails.taskerLocation.serviceRadius (max travel km)  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              BOOKING / INQUIRY (Tasker/Client)                   │
├─────────────────────────────────────────────────────────────────┤
│  1. Tasker opens Book Now or Inquiry modal                       │
│  2. LocationPicker shown (required)                              │
│  3. Tasker selects their location                                │
│  4. System validates: distance ≤ serviceRadius                   │
│  5. If valid → location stored in agreementSnapshot              │
│     If invalid → error shown, submission blocked                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTRACT STORAGE                              │
├─────────────────────────────────────────────────────────────────┤
│  agreementSnapshot.serviceLocation = {                           │
│    mode: 'tasker_location',                                      │
│    label: "123 Main St, San Salvador",                           │
│    location: { lat, lng, displayName, ... }                      │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTRACT DISPLAY (Taskee)                     │
├─────────────────────────────────────────────────────────────────┤
│  ContractDrawerNDK shows:                                        │
│  - Service Location label                                        │
│  - "Open Map" button (maps.rbt.no - universal)                   │
│  - Google Maps link                                              │
│  - Apple Maps link                                               │
│  - Waze link (with navigation)                                   │
└─────────────────────────────────────────────────────────────────┘
```
