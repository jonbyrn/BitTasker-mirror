# Location-based Services

This document outlines the requirements for implementing location-based services in BitTasker.

## Description

Location-based services provide geospatial functionality to the platform, enabling users to find tasks and workers based on proximity, display content on maps, and track location for in-person tasks.

## 1. Screens

### Map View Screens

- **Task Map Screen**:
  - Interactive map showing available tasks
  - Task markers with brief info on tap
  - Current location indicator
  - Map controls (zoom, center)
  - Filter options specifically for map view
  - Toggle between map and list views
- **Worker Map Screen** (optional):
  - Map showing available workers in area
  - Worker markers with brief profile info
  - Availability status indicators
  - Privacy controls for worker locations

### Location Input Components

- **Address Input**:
  - Auto-complete address search
  - Recent locations list
  - Save location as favorite
  - Current location button
  - Map selection option
- **Location Radius Selector**:
  - Radius input (slider or numeric)
  - Visual radius representation on map
  - Preset radius options (5km, 10km, etc.)

### Task Location Components

- **Task Location Details**:
  - Map preview with task location
  - Written directions
  - Distance from current location
  - Travel time estimates
  - Share location option

## 2. Schema

### Location Type

```typescript
interface Location {
	type: 'point' | 'area' | 'route';
	coordinates: {
		latitude: number;
		longitude: number;
	};
	address: {
		formatted: string;
		components: {
			street?: string;
			city?: string;
			state?: string;
			postalCode?: string;
			country?: string;
		};
	};
	placeId?: string; // Reference to mapping service place ID
	radius?: number; // For area type, in meters
}
```

### SavedLocation Type

```typescript
interface SavedLocation {
	id: string;
	userId: string;
	name: string;
	location: Location;
	type: 'home' | 'work' | 'favorite' | 'custom';
	icon?: string;
	createdAt: Date;
	updatedAt: Date;
	lastUsed?: Date;
}
```

### User Location Extension

```typescript
// Add to existing User interface
interface User {
	// existing fields
	currentLocation?: {
		coordinates: {
			latitude: number;
			longitude: number;
		};
		timestamp: Date;
		accuracy: number;
	};
	locationVisibility: 'public' | 'tasks_only' | 'private';
	savedLocations: string[]; // Array of SavedLocation IDs
}
```

### Task Location Extension

```typescript
// Add to existing Task interface
interface Task {
	// existing fields
	location: Location;
	locationPrivacy: 'public' | 'general_area' | 'accepted_only';
	requiresCheckIn?: boolean;
}
```

## 3. APIs

### Location Management

- `GET /api/locations/geocode` - Convert address to coordinates

  - Query params: `address`
  - Returns: Location object

- `GET /api/locations/reverse-geocode` - Convert coordinates to address

  - Query params: `latitude`, `longitude`
  - Returns: Location object

- `GET /api/locations/saved` - Get user's saved locations

  - Returns: Array of SavedLocation objects

- `POST /api/locations/saved` - Create a saved location

  - Body: SavedLocation details
  - Returns: Created SavedLocation object

- `DELETE /api/locations/saved/{locationId}` - Delete saved location
  - Returns: Success message

### Map Data

- `GET /api/map/tasks` - Get tasks for map display

  - Query params: `bounds` (map viewport), filters
  - Returns: Array of simplified task objects with locations

- `GET /api/map/workers` - Get workers for map display
  - Query params: `bounds` (map viewport), filters
  - Returns: Array of simplified worker objects with locations

### Location Tracking

- `POST /api/users/location` - Update user's current location

  - Body: Coordinates and accuracy
  - Returns: Updated status

- `POST /api/tasks/{taskId}/check-in` - Check in at task location
  - Body: Current coordinates
  - Returns: Check-in status

## 4. Dependencies

- Mapping library (e.g., Google Maps, Mapbox, Leaflet)
- Geocoding service
- Geolocation browser API
- Distance calculation library

## 5. Services

### Frontend Services

- `MapService`:
  - Methods for rendering maps
  - Handling markers and info windows
  - User location tracking
- `GeocodeService`:
  - Address lookup and autocompletion
  - Coordinate to address conversion
  - Location validation

### Backend Services

- `LocationManagementService`:
  - Store and retrieve location data
  - Handle saved locations
  - Validate location data
- `GeoQueryService`:
  - Perform location-based queries
  - Optimize geospatial database operations
  - Calculate distances between points
- `CheckInService`:
  - Verify user presence at task location
  - Track task start/end times based on location
  - Handle location verification requirements

## 6. Edge Cases

- **Location Accuracy**: Handle varying degrees of GPS accuracy and signal loss
- **Privacy Concerns**: Implement proper controls for location data sharing

- **Remote Tasks**: Support tasks that can be done remotely (no specific location)

- **Cross-Border Tasks**: Handle tasks that may appear in different countries/jurisdictions

- **Location Spoofing**: Implement measures to detect and prevent location spoofing

- **Rural Areas**: Account for less precise geocoding in rural or less-mapped areas

- **Moving Targets**: Support tasks that may involve moving locations (e.g., delivery routes)

- **International Support**: Handle different address formats and coordinate systems globally

- **Data Usage**: Optimize map data to minimize mobile data usage

- **Offline Functionality**: Provide basic location features when users are offline
