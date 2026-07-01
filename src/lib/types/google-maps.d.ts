/**
 * Minimal Google Maps JavaScript API type declarations.
 *
 * Covers only the APIs actually used by the map components in this project.
 * The Google Maps script is loaded at runtime via a `<script>` tag, so no
 * npm package is needed — these ambient declarations satisfy `tsc` / `svelte-check`.
 *
 * @see src/lib/components/maps/TaskLocationMap.svelte
 * @see src/lib/components/task/TaskLocationViewer.svelte
 * @see src/lib/components/LocationPicker.svelte
 * @see src/lib/components/maps/LocationPickerMap.svelte
 */

declare namespace google {
	namespace maps {
		// ─── Core ──────────────────────────────────────────────────────────

		interface LatLngLiteral {
			lat: number;
			lng: number;
		}

		interface LatLng {
			lat(): number;
			lng(): number;
		}

		class LatLngBounds {
			constructor(sw?: LatLng | LatLngLiteral, ne?: LatLng | LatLngLiteral);
			extend(point: LatLng | LatLngLiteral): this;
			isEmpty(): boolean;
		}

		interface MapOptions {
			center?: LatLng | LatLngLiteral;
			zoom?: number;
			minZoom?: number;
			maxZoom?: number;
			mapTypeId?: MapTypeId;
			mapTypeControl?: boolean;
			streetViewControl?: boolean;
			fullscreenControl?: boolean;
			zoomControl?: boolean;
			disableDoubleClickZoom?: boolean;
			mapTypeControlOptions?: MapTypeControlOptions;
			zoomControlOptions?: ZoomControlOptions;
			streetViewControlOptions?: StreetViewControlOptions;
			mapId?: string;
		}

		interface MapTypeControlOptions {
			style?: MapTypeControlStyle;
			position?: ControlPosition;
		}

		interface ZoomControlOptions {
			position?: ControlPosition;
		}

		interface StreetViewControlOptions {
			position?: ControlPosition;
		}

		class Map {
			constructor(mapDiv: HTMLElement, opts?: MapOptions);
			addListener(eventName: string, handler: (...args: unknown[]) => void): MapsEventListener;
			setCenter(latLng: LatLng | LatLngLiteral): void;
			getCenter(): LatLng;
			setZoom(zoom: number): void;
			getZoom(): number | undefined;
			panTo(latLng: LatLng | LatLngLiteral): void;
			fitBounds(bounds: LatLngBounds, padding?: number | Padding): void;
		}

		interface Padding {
			top: number;
			right: number;
			bottom: number;
			left: number;
		}

		interface MapsEventListener {
			remove(): void;
		}

		// ─── Map constants ─────────────────────────────────────────────────

		enum MapTypeId {
			ROADMAP = 'roadmap',
			SATELLITE = 'satellite',
			HYBRID = 'hybrid',
			TERRAIN = 'terrain'
		}

		enum MapTypeControlStyle {
			DEFAULT = 0,
			HORIZONTAL_BAR = 1,
			DROPDOWN_MENU = 2,
			DEFAULT_AND_HORIZONTAL_BAR = 3
		}

		enum ControlPosition {
			TOP_LEFT = 1,
			TOP_CENTER = 2,
			TOP_RIGHT = 3,
			LEFT_TOP = 4,
			LEFT_CENTER = 5,
			LEFT_BOTTOM = 6,
			RIGHT_TOP = 7,
			RIGHT_CENTER = 8,
			RIGHT_BOTTOM = 9,
			BOTTOM_LEFT = 10,
			BOTTOM_CENTER = 11,
			BOTTOM_RIGHT = 12
		}

		// ─── Event system ──────────────────────────────────────────────────

		interface MapMouseEvent {
			latLng: LatLng | null;
			domEvent: MouseEvent;
			stop(): void;
		}

		namespace event {
			function trigger(object: MapsEventTarget, eventName: string, ...args: unknown[]): void;
			function clearInstanceListeners(instance: MapsEventTarget): void;
		}

		type MapsEventTarget = Map;

		// ─── Markers ───────────────────────────────────────────────────────

		interface AdvancedMarkerElementOptions {
			position: LatLng | LatLngLiteral;
			map?: Map | null;
			content?: Element | null;
			title?: string;
			gmpDraggable?: boolean;
		}

		class AdvancedMarkerElement {
			constructor(opts: AdvancedMarkerElementOptions);
			position: LatLng | LatLngLiteral | null;
			map: Map | null;
			addListener(eventName: string, handler: (...args: unknown[]) => void): MapsEventListener;
		}

		interface MarkerOptions {
			position: LatLng | LatLngLiteral;
			map?: Map | null;
			title?: string;
			icon?: string | Icon;
			label?: string | MarkerLabel;
		}

		interface Icon {
			url: string;
			scaledSize?: Size;
			origin?: Point;
			anchor?: Point;
		}

		interface MarkerLabel {
			text: string;
			color?: string;
			fontSize?: string;
			fontWeight?: string;
			fontFamily?: string;
		}

		class Size {
			constructor(width: number, height: number, widthUnit?: string, heightUnit?: string);
		}

		class Point {
			constructor(x: number, y: number);
		}

		class Marker {
			constructor(opts?: MarkerOptions);
			setMap(map: Map | null): void;
		}

		// ─── Marker library (dynamic import) ───────────────────────────────

		interface MarkerLibrary {
			AdvancedMarkerElement: typeof AdvancedMarkerElement;
		}

		// ─── marker namespace (Advanced Marker API) ──────────────────────

		namespace marker {
			interface AdvancedMarkerElementOptions {
				position: LatLng | LatLngLiteral;
				map?: Map | null;
				content?: Element | null;
				title?: string;
				gmpDraggable?: boolean;
			}

			class AdvancedMarkerElement {
				constructor(opts: AdvancedMarkerElementOptions);
				position: LatLng | LatLngLiteral | null;
				map: Map | null;
				addListener(eventName: string, handler: (...args: unknown[]) => void): MapsEventListener;
			}
		}

		// ─── Shapes ────────────────────────────────────────────────────────

		interface CircleOptions {
			strokeColor?: string;
			strokeOpacity?: number;
			strokeWeight?: number;
			fillColor?: string;
			fillOpacity?: number;
			map?: Map | null;
			center?: LatLng | LatLngLiteral;
			radius?: number;
			clickable?: boolean;
		}

		class Circle {
			constructor(opts?: CircleOptions);
			setMap(map: Map | null): void;
			setCenter(center: LatLng | LatLngLiteral): void;
			setRadius(radius: number): void;
			getCenter(): LatLng;
			getRadius(): number;
			getBounds(): LatLngBounds | null;
		}

		interface PolylineOptions {
			path?: LatLng[] | LatLngLiteral[];
			geodesic?: boolean;
			strokeColor?: string;
			strokeOpacity?: number;
			strokeWeight?: number;
			map?: Map;
		}

		class Polyline {
			constructor(opts?: PolylineOptions);
			setMap(map: Map | null): void;
		}

		// ─── InfoWindow ────────────────────────────────────────────────────

		interface InfoWindowOptions {
			content?: string | Element;
			maxWidth?: number;
		}

		interface InfoWindowOpenOptions {
			anchor?: AdvancedMarkerElement;
			map?: Map;
		}

		class InfoWindow {
			constructor(opts?: InfoWindowOptions);
			/** New-style open: pass an options object with anchor and/or map */
			open(options?: InfoWindowOpenOptions): void;
			/** Legacy open: pass map and optional anchor (used by older code paths) */
			open(map?: Map, anchor?: Marker | AdvancedMarkerElement): void;
			close(): void;
		}

		// ─── Geocoding ─────────────────────────────────────────────────────

		interface GeocoderAddressComponent {
			long_name: string;
			short_name: string;
			types: string[];
		}

		interface GeocoderResult {
			formatted_address: string;
			address_components: GeocoderAddressComponent[];
			place_id: string;
			geometry: GeocoderGeometry;
			types: string[];
		}

		interface GeocoderGeometry {
			location: LatLng;
		}

		interface GeocoderResponse {
			results: GeocoderResult[];
			status: GeocoderStatus;
		}

		enum GeocoderStatus {
			OK = 'OK',
			ZERO_RESULTS = 'ZERO_RESULTS',
			OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
			REQUEST_DENIED = 'REQUEST_DENIED',
			INVALID_REQUEST = 'INVALID_REQUEST',
			UNKNOWN_ERROR = 'UNKNOWN_ERROR'
		}

		class Geocoder {
			geocode(
				request: GeocoderRequest,
				callback: (results: GeocoderResult[] | null, status: GeocoderStatus) => void
			): void;
			geocode(request: GeocoderRequest): Promise<GeocoderResponse>;
		}

		interface GeocoderRequest {
			location?: LatLng | LatLngLiteral;
			address?: string;
			language?: string;
			region?: string;
		}

		// ─── Geocoding library (dynamic import) ────────────────────────────

		interface GeocodingLibrary {
			Geocoder: typeof Geocoder;
		}

		// ─── Directions ────────────────────────────────────────────────────

		enum TravelMode {
			DRIVING = 'DRIVING',
			WALKING = 'WALKING',
			BICYCLING = 'BICYCLING',
			TRANSIT = 'TRANSIT'
		}

		enum DirectionsStatus {
			OK = 'OK',
			ZERO_RESULTS = 'ZERO_RESULTS',
			MAX_WAYPOINTS_EXCEEDED = 'MAX_WAYPOINTS_EXCEEDED',
			INVALID_REQUEST = 'INVALID_REQUEST',
			OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
			REQUEST_DENIED = 'REQUEST_DENIED',
			UNKNOWN_ERROR = 'UNKNOWN_ERROR',
			NOT_FOUND = 'NOT_FOUND'
		}

		interface DirectionsRequest {
			origin: LatLng | LatLngLiteral | string;
			destination: LatLng | LatLngLiteral | string;
			travelMode?: TravelMode;
			avoidHighways?: boolean;
			avoidTolls?: boolean;
			waypoints?: DirectionsWaypoint[];
		}

		interface DirectionsWaypoint {
			location: LatLng | LatLngLiteral | string;
			stopover?: boolean;
		}

		interface DirectionsResult {
			routes: DirectionsRoute[];
		}

		interface DirectionsRoute {
			overview_path: LatLng[];
			legs: DirectionsLeg[];
		}

		interface DirectionsLeg {
			distance?: { text: string; value: number };
			duration?: { text: string; value: number };
		}

		interface DirectionsRendererOptions {
			map?: Map;
			suppressMarkers?: boolean;
			polylineOptions?: PolylineOptions;
		}

		class DirectionsService {
			route(
				request: DirectionsRequest,
				callback: (result: DirectionsResult | null, status: DirectionsStatus) => void
			): void;
		}

		class DirectionsRenderer {
			constructor(opts?: DirectionsRendererOptions);
			setDirections(directions: DirectionsResult): void;
			setMap(map: Map | null): void;
		}

		// ─── importLibrary (dynamic loader) ────────────────────────────────

		function importLibrary(library: 'marker'): Promise<MarkerLibrary>;
		function importLibrary(library: 'geocoding'): Promise<GeocodingLibrary>;
		function importLibrary(library: 'places'): Promise<PlacesLibrary>;
		function importLibrary(library: string): Promise<unknown>;

		// ─── Places (New API) ──────────────────────────────────────────────

		interface PlacesLibrary {
			AutocompleteSessionToken: typeof AutocompleteSessionToken;
			AutocompleteSuggestion: typeof AutocompleteSuggestion;
		}

		class AutocompleteSessionToken {}

		interface AutocompleteSuggestionsRequest {
			input: string;
			language?: string;
			sessionToken?: AutocompleteSessionToken;
		}

		interface AutocompleteSuggestionResponse {
			suggestions: AutocompleteSuggestionResult[];
		}

		interface AutocompleteSuggestionResult {
			placePrediction: places.PlacePrediction;
		}

		class AutocompleteSuggestion {
			static fetchAutocompleteSuggestions(
				request: AutocompleteSuggestionsRequest
			): Promise<AutocompleteSuggestionResponse>;
		}

		interface PlaceResult {
			place_id?: string;
			formatted_address?: string;
			geometry?: PlaceGeometry;
			name?: string;
			types?: string[];
		}

		interface PlaceGeometry {
			location?: LatLng;
		}
	}

	namespace maps.places {
		interface PlacePrediction {
			placeId: string;
			text: { text: string };
			toPlace(): Place;
		}

		interface AddressComponent {
			types: string[];
			longText?: string | null;
			shortText?: string | null;
		}

		class Place {
			fetchFields(options: { fields: string[] }): Promise<void>;
			location?: google.maps.LatLng;
			addressComponents?: AddressComponent[];
			formattedAddress?: string;
			id?: string;
			displayName?: string;
		}
	}
}

interface Window {
	google?: {
		maps?: {
			Map: typeof google.maps.Map;
			InfoWindow: typeof google.maps.InfoWindow;
			Circle: typeof google.maps.Circle;
			Marker: typeof google.maps.Marker;
			Polyline: typeof google.maps.Polyline;
			Geocoder: typeof google.maps.Geocoder;
			LatLngBounds: typeof google.maps.LatLngBounds;
			event: typeof google.maps.event;
			importLibrary: typeof google.maps.importLibrary;
			MapTypeId: typeof google.maps.MapTypeId;
			MapTypeControlStyle: typeof google.maps.MapTypeControlStyle;
			ControlPosition: typeof google.maps.ControlPosition;
			TravelMode: typeof google.maps.TravelMode;
			DirectionsService: typeof google.maps.DirectionsService;
			DirectionsRenderer: typeof google.maps.DirectionsRenderer;
			DirectionsStatus: typeof google.maps.DirectionsStatus;
			marker?: {
				AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
			};
			places?: Record<string, unknown>;
		};
	};
}
