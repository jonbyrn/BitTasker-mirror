<script lang="ts">
	import type { Task, Location } from '$lib/types/task';
	import type { Service, ServiceTier } from '$lib/types/service.d';
	import { smallCountries, mediumCountries, largeCountries } from '$lib/utils/constants/countries';
	import { onMount, onDestroy, tick } from 'svelte';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import { locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription
	} from '$lib/utils/serviceDisplayTranslation';
	import { goto } from '$app/navigation';

	let {
		tasks = [],
		services = [],
		height = '60vh',
		selectedTask = null,
		selectedService = null,
		showFullscreen = true,
		btcPrice = 0,
		formatDateTimeReactive,
		formatDateRangeReactive,
		onSelectTask,
		onViewTask,
		onServiceSelected,
		onViewService,
		drawersLoaded = false,
		loadDrawerComponents,
		zoomOffset = 0,
		showMyLocationButton = true
	} = $props<{
		tasks?: Task[];
		services?: Service[];
		height?: string;
		selectedTask?: Task | null;
		selectedService?: Service | null;
		showFullscreen?: boolean;
		btcPrice?: number;
		formatDateTimeReactive?: (dateString: string) => string;
		formatDateRangeReactive?: (start: string, end: string) => string;
		onSelectTask?: (task: Task) => Promise<void>;
		onViewTask?: (task: Task) => Promise<void>;
		onServiceSelected?: (event: { service: Service }) => void;
		onViewService?: (service: Service) => void;
		zoomOffset?: number;
		showMyLocationButton?: boolean;
		drawersLoaded?: boolean;
		loadDrawerComponents?: () => Promise<void>;
	}>();

	const mapsDisabled =
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true' ||
		!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

	const isServicesMode = $derived(services?.length > 0);

	function translateMapText(primaryKey: string, secondaryKey: string, fallback: string): string {
		try {
			const primary = $t(primaryKey);
			if (primary !== primaryKey) {
				return primary;
			}

			const secondary = $t(secondaryKey);
			return secondary !== secondaryKey ? secondary : fallback;
		} catch {
			return fallback;
		}
	}

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement | null = null;
	let markers: google.maps.marker.AdvancedMarkerElement[] = $state([]);
	let circles: google.maps.Circle[] = $state([]);
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let errorMsg = $state('');
	let googleMapsReady = $state(false);
	let lastTaskIds = $state('');
	let lastSelectedTaskId = $state<string | null>(null);
	let lastSelectedServiceId = $state<string | null>(null);
	let serviceMarkerByPosition = new SvelteMap<string, google.maps.marker.AdvancedMarkerElement>();
	let serviceRadius = $state(5); // Default to 5 km
	let isLoading = $state(true);
	let userLocation: Location | null = $state(null);
	let markerLibrary: google.maps.MarkerLibrary | null = $state(null);

	// Fullscreen state
	let isFullscreen = $state(false);
	let mapContainerDiv: HTMLElement | null = $state(null);
	let fullscreenResizeHandler: ((this: Window, ev: UIEvent) => void) | null = null;
	let escKeyHandler: ((this: Window, ev: KeyboardEvent) => void) | null = null;
	let containerResizeObserver: ResizeObserver | null = null;

	// Location button state
	let isLocating = $state(false);

	// InfoWindow state
	let infoWindow: google.maps.InfoWindow | null = $state(null);

	/**
	 * Generate HTML content for InfoWindow matching TaskCard styling
	 */
	function generateInfoWindowContent(task: Task): string {
		const statusBadge = getStatusBadge(task.status);
		const isOpen = task.status === TaskStatusEnum.OPEN;
		const taskId = task.id;

		// Get translated task title and description (same logic as TranslatableTask)
		// Use get() to access stores synchronously in function context
		const userLang = get(currentUserLanguage) || get(locale) || 'en';
		let displayTitle = task.title;
		let displayDescription = task.description;

		if (task.translations && task.translations.sourceLanguage !== userLang) {
			const translation = task.translations.translations[userLang];
			if (translation) {
				displayTitle = translation.title || task.title;
				displayDescription = translation.description || task.description;
			}
		}

		// Get translations for UI text - use try/catch since $t() might fail if translations aren't loaded
		let statusText = statusBadge.text;
		let bidText = 'Bid';
		let viewText = 'View';

		try {
			// Try to get translations - $t() is available in Svelte component context
			const statusTranslated = $t(`common.status.${task.status.toLowerCase()}`);
			if (statusTranslated) statusText = statusTranslated;

			const bidTranslated = $t('dashboard.find_tasks.sign_up_to_bid');
			if (bidTranslated) bidText = bidTranslated;

			const viewTranslated = $t('find_tasks.view_task');
			if (viewTranslated) viewText = viewTranslated;
		} catch (error) {
			// Fallback to defaults if translations fail
			console.warn('Translation error in InfoWindow:', error);
		}

		// Format price
		const budgetAmount = task.budget?.amount ?? 0;
		const priceFormatted = formatNumberWithTwoDecimals(budgetAmount);
		const satsFormatted = btcPrice > 0 ? satsFromUsd(budgetAmount, btcPrice) : '';

		// Format deadline
		let deadlineText = '';
		if (task.deadline) {
			deadlineText = formatDateTimeReactive?.(task.deadline) || task.deadline;
		} else if (task.dateRange?.start && task.dateRange?.end) {
			deadlineText =
				formatDateRangeReactive?.(task.dateRange.start, task.dateRange.end) ||
				`${task.dateRange.start} - ${task.dateRange.end}`;
		}

		// Format location
		const locationText =
			task.pickupLocation?.displayName ||
			task.dropOffLocation?.displayName ||
			'Location not specified';

		// Get username (always present, not optional)
		const username = task.creator?.username ?? '';
		const rating = task.creator?.rating || 0;

		// Generate stars HTML - match TaskCard styling (text-yellow-400 for filled, text-base-content/30 for empty)
		const starsHtml = Array(5)
			.fill(0)
			.map(
				(_, i) =>
					`<svg class="h-3 w-3 ${i < rating ? 'text-yellow-400' : 'text-base-content/30'}" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
			</svg>`
			)
			.join('');

		// Avatar HTML
		let avatarHtml = '';
		if (task.creator?.avatar) {
			avatarHtml = `<img src="${task.creator.avatar}" alt="Avatar" class="h-8 w-8 rounded-full object-cover" />`;
		} else if (task.creator?.username) {
			const initial = task.creator.username.charAt(0).toUpperCase();
			avatarHtml = `<div class="bg-primary text-primary-content flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold">${initial}</div>`;
		} else {
			avatarHtml = `<div class="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full">
				<svg class="h-6 w-6 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
				</svg>
			</div>`;
		}

		// Helper function to escape HTML
		const escapeHtml = (text: string): string => {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		};

		// Helper function to escape for use in HTML attributes (like onclick)
		const escapeAttr = (text: string): string => {
			return text
				.replace(/&/g, '&amp;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		};

		// Truncate and escape description (use translated description)
		const description = (displayDescription || '').substring(0, 150);
		const descriptionTruncated =
			description.length < (displayDescription?.length || 0) ? description + '...' : description;
		const escapedDescription = escapeHtml(descriptionTruncated);
		const escapedTitle = escapeHtml(displayTitle || 'Untitled Task');
		const escapedLocation = escapeHtml(locationText);
		const escapedUsername = escapeHtml(username);
		const escapedDeadline = deadlineText ? escapeHtml(deadlineText) : '';
		const escapedTaskId = escapeAttr(taskId);

		return `
			<div class="task-info-window task-info-window-task" style="font-family: system-ui, -apple-system, sans-serif;">
				<div class="card bg-base-100 rounded-xl shadow-md" style="border: none;">
					<div class="card-body rounded-xl p-4">
						<!-- Top Row: Title + Status Badge + Price (matches TaskCard: mb-3, gap-2) -->
						<div style="margin-bottom: 12px; display: flex; flex-direction: row; align-items: stretch; justify-content: space-between; gap: 8px;">
							<!-- Left: Title (flexible, matches TaskCard: flex-1 min-w-0 pr-2 md:pr-4) -->
							<div style="flex: 1; min-width: 0; padding-right: 8px;">
								<h3 class="card-title" style="font-size: 18px; font-weight: 600; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
									${escapedTitle}
								</h3>
								<p style="font-size: 14px; color: hsl(var(--bc) / 0.8); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line;">
									${escapedDescription}
								</p>
							</div>
							<!-- Right: Status Badge + Price (matches TaskCard: shrink-0, items-end, gap-4, w-[min(30%,120px)]) -->
							<div style="flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 16px; width: min(30%, 120px);">
								<span class="badge ${statusBadge.color} badge-sm">
									${statusText}
								</span>
								<div style="text-align: right; font-size: 20px; font-weight: bold; margin-top: 8px;">
									$${priceFormatted}
									${satsFormatted ? `<div class="text-base-content/60 text-sm">${satsFormatted}</div>` : ''}
								</div>
							</div>
						</div>
						
						<!-- Second Row: Deadline + Location (matches TaskCard: mb-3, gap-3) -->
						<div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 12px;">
							${
								deadlineText
									? `
								<div style="display: flex; align-items: center; gap: 8px;">
									<svg class="text-primary" style="width: 32px; height: 32px; flex-shrink: 0;" viewBox="0 0 24 24" fill="currentColor">
										<path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
									</svg>
									<span style="font-size: 14px; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapedDeadline}</span>
								</div>
							`
									: ''
							}
							<div style="display: flex; align-items: center; gap: 8px;">
								<svg class="text-primary" style="width: 32px; height: 32px; flex-shrink: 0;" viewBox="0 0 24 24" fill="currentColor">
									<path d="M12,2C8.13,2 5,5.13 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9C19,5.13 15.87,2 12,2M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5Z"/>
								</svg>
								<span style="font-size: 14px; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapedLocation}</span>
							</div>
						</div>
						
						<!-- Bottom Row: Avatar + Username + Rating (matches TaskCard: gap-3) -->
						<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
							<div class="avatar" style="flex-shrink: 0;">
								${avatarHtml}
							</div>
							<div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
								<span style="font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
									${escapedUsername}
								</span>
								<div style="display: flex; align-items: center; gap: 4px;">
									${starsHtml}
									<span style="font-size: 12px; color: hsl(var(--bc) / 0.6); margin-left: 4px;">${rating}</span>
								</div>
							</div>
						</div>
						
						<!-- Action Buttons (stacked on mobile/tablet, equal width on desktop) -->
						<div class="task-info-window-buttons flex flex-col gap-2 lg:flex-row" style="width: 100%;">
							${
								onSelectTask
									? `
								<button 
									class="btn btn-primary btn-sm task-info-window-btn ${!isOpen ? 'btn-disabled' : ''}" 
									style="width: 100%; min-height: 44px;"
									data-task-id="${escapedTaskId}"
									data-action="bid"
									${!isOpen ? 'disabled' : ''}
									onclick="window.handleMapInfoWindowAction(event, 'bid', '${escapedTaskId}')"
								>
									<svg style="width: 16px; height: 16px; margin-right: 4px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
									</svg>
									${bidText}
								</button>
							`
									: ''
							}
							${
								onViewTask
									? `
								<button 
									class="btn btn-secondary btn-sm task-info-window-btn" 
									style="width: 100%; min-height: 44px;"
									data-task-id="${escapedTaskId}"
									data-action="view"
									onclick="window.handleMapInfoWindowAction(event, 'view', '${escapedTaskId}')"
								>
									<svg style="width: 16px; height: 16px; margin-right: 4px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
									</svg>
									${viewText}
								</button>
							`
									: ''
							}
						</div>
					</div>
				</div>
			</div>
		`;
	}

	/**
	 * Show InfoWindow for a task
	 */
	function showInfoWindow(task: Task, marker: google.maps.marker.AdvancedMarkerElement) {
		if (!map) {
			console.warn('Cannot show InfoWindow: map is not initialized');
			return;
		}

		if (!task) {
			console.warn('Cannot show InfoWindow: task is not provided');
			return;
		}

		// Close existing InfoWindow if open
		if (infoWindow) {
			infoWindow.close();
		}

		try {
			// Create new InfoWindow - on mobile use narrower max so popup fits without being cut off
			const content = generateInfoWindowContent(task);
			const maxWidth =
				typeof window !== 'undefined'
					? window.innerWidth <= 768
						? Math.min(280, window.innerWidth - 48)
						: Math.min(320, Math.max(260, window.innerWidth - 32))
					: 320;
			infoWindow = new google.maps.InfoWindow({
				content,
				maxWidth
			});

			// Open InfoWindow at marker position
			infoWindow.open({
				anchor: marker,
				map
			});
		} catch (error) {
			console.error('Error showing InfoWindow:', error);
		}

		// Set up global handler for button clicks (since InfoWindow content is HTML string)
		// Capture tasks array in closure for the handler
		const currentTasks: Task[] = tasks;
		(window as unknown as Record<string, unknown>).handleMapInfoWindowAction = async (
			event: Event,
			action: string,
			taskId: string
		) => {
			event.preventDefault();
			event.stopPropagation();

			let task: Task | undefined;
			for (const t of currentTasks) {
				if (t.id === taskId) {
					task = t;
					break;
				}
			}
			if (!task) return;

			if (action === 'bid' && onSelectTask) {
				await onSelectTask(task);
				// Don't close InfoWindow - keep it open
			} else if (action === 'view' && onViewTask) {
				if (!drawersLoaded && loadDrawerComponents) {
					await loadDrawerComponents();
				}
				await onViewTask(task);
				// Don't close InfoWindow - keep it open
			}
		};
	}

	/**
	 * Close InfoWindow if open
	 */
	function closeInfoWindow() {
		if (infoWindow) {
			infoWindow.close();
			infoWindow = null;
		}
	}

	// Function to get user's location
	async function getUserLocation(): Promise<Location | null> {
		return new Promise((resolve) => {
			if (!navigator.geolocation) {
				resolve(null);
				return;
			}

			try {
				navigator.geolocation.getCurrentPosition(
					(position) => {
						try {
							const userLoc: Location = {
								displayName: $t('dashboard.bids.components.maps.task_location_map.your_location'),
								latitude: position.coords.latitude,
								longitude: position.coords.longitude,
								zipCode: '',
								locationLoaded: true
							};
							resolve(userLoc);
						} catch (error) {
							console.warn('Error processing geolocation result:', error);
							resolve(null);
						}
					},
					(error) => {
						// Handle geolocation errors
						// Error codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
						const errorCode = error.code;

						if (errorCode === 1) {
							// Permission denied - user blocked location access
							// Don't log this as it's user-initiated
							resolve(null);
							return;
						}

						if (errorCode === 3) {
							// Timeout - retry with lower accuracy and longer timeout
							navigator.geolocation.getCurrentPosition(
								(position) => {
									try {
										const userLoc: Location = {
											displayName: $t(
												'dashboard.bids.components.maps.task_location_map.your_location'
											),
											latitude: position.coords.latitude,
											longitude: position.coords.longitude,
											zipCode: '',
											locationLoaded: true
										};
										resolve(userLoc);
									} catch (err) {
										console.warn('Error processing geolocation result:', err);
										resolve(null);
									}
								},
								() => {
									// Retry also failed - resolve null silently
									resolve(null);
								},
								{
									timeout: 20000, // Longer timeout for retry (20 seconds)
									enableHighAccuracy: false, // Lower accuracy for faster response
									maximumAge: 300000 // 5 minutes
								}
							);
							return;
						}

						// Other errors (POSITION_UNAVAILABLE, etc.)
						// Only log if it's not a common/expected error
						if (errorCode !== 2) {
							// Don't log POSITION_UNAVAILABLE as it's common
							console.warn('Geolocation error:', error.message || 'Unknown error');
						}
						resolve(null);
					},
					{
						timeout: 15000, // Increased initial timeout to 15 seconds
						enableHighAccuracy: true,
						maximumAge: 300000 // 5 minutes
					}
				);
			} catch (error) {
				console.warn('Error accessing geolocation:', error);
				resolve(null);
			}
		});
	}

	// Function to get country from coordinates using reverse geocoding
	async function getCountryFromCoordinates(lat: number, lng: number): Promise<string | null> {
		if (!window.google?.maps) return null;

		try {
			const geocoder = new google.maps.Geocoder();
			const latlng = { lat, lng };

			return new Promise((resolve) => {
				geocoder.geocode({ location: latlng }, (results, status) => {
					if (status === 'OK' && results && results.length > 0) {
						// Look for country in the address components
						for (const result of results) {
							for (const component of result.address_components) {
								if (component.types.includes('country')) {
									resolve(component.long_name);
									return;
								}
							}
						}
					}
					resolve(null);
				});
			});
		} catch (error) {
			console.error('Error getting country:', error);
			return null;
		}
	}

	// Function to determine appropriate zoom level based on country
	function getZoomLevelForCountry(
		country: string | null,
		latitude: number,
		longitude: number
	): number {
		// If we have country info, use specific zoom levels
		if (country) {
			if (smallCountries.includes(country)) {
				return 8;
			}

			if (mediumCountries.includes(country)) {
				return 6;
			}

			if (largeCountries.includes(country)) {
				return 4;
			}
		}

		// Fallback: determine zoom based on latitude/longitude ranges
		// North America
		if (latitude >= 15 && latitude <= 72 && longitude >= -180 && longitude <= -50) {
			return 4;
		}

		// South America
		if (latitude >= -60 && latitude <= 15 && longitude >= -90 && longitude <= -30) {
			return 4;
		}

		// Europe
		if (latitude >= 35 && latitude <= 72 && longitude >= -25 && longitude <= 45) {
			return 5;
		}

		// Africa
		if (latitude >= -35 && latitude <= 38 && longitude >= -20 && longitude <= 55) {
			return 4;
		}

		// Asia
		if (latitude >= -10 && latitude <= 55 && longitude >= 45 && longitude <= 180) {
			return 4;
		}

		// Australia/Oceania
		if (latitude >= -50 && latitude <= -10 && longitude >= 110 && longitude <= 180) {
			return 4;
		}

		// Default zoom for unknown locations
		return 3;
	}

	// Function to dynamically load Google Maps script
	async function loadGoogleMapsScript() {
		return new Promise<void>((resolve, reject) => {
			try {
				// Check if script is already loaded and API is available
				if (window.google?.maps?.Map) {
					googleMapsReady = true;
					resolve();
					return;
				}

				// Check if script is already being loaded
				const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
				if (existingScript) {
					// Wait for existing script to load
					existingScript.addEventListener('load', () => {
						// Check immediately first (API might already be ready)
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
							return;
						}

						// Google Maps API needs time to initialize after script loads
						// Poll for API readiness instead of fixed timeout for better reliability
						let attempts = 0;
						const maxAttempts = 50; // 5 seconds max (50 * 100ms)
						const checkReady = () => {
							if (window.google?.maps?.Map) {
								googleMapsReady = true;
								resolve();
							} else if (attempts < maxAttempts) {
								attempts++;
								setTimeout(checkReady, 100);
							} else {
								reject(new Error('Google Maps API not initialized after timeout'));
							}
						};
						// Start checking immediately (no initial delay)
						checkReady();
					});
					return;
				}

				const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
				const script = document.createElement('script');
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&loading=async&libraries=marker,geometry`;
				script.async = true;
				script.defer = true;

				script.onload = () => {
					// Check immediately first (API might already be ready)
					if (window.google?.maps?.Map) {
						googleMapsReady = true;
						resolve();
						return;
					}

					// Google Maps API needs time to initialize after script loads
					// Poll for API readiness instead of fixed timeout for better reliability
					let attempts = 0;
					const maxAttempts = 50; // 5 seconds max (50 * 100ms)
					const checkReady = () => {
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else if (attempts < maxAttempts) {
							attempts++;
							setTimeout(checkReady, 100);
						} else {
							reject(new Error('Google Maps API not initialized after timeout'));
						}
					};
					// Start checking immediately (no initial delay)
					checkReady();
					return;
				};

				script.onerror = () => {
					reject(new Error('Failed to load Google Maps script'));
				};

				document.head.appendChild(script);
			} catch (error) {
				reject(error);
			}
		});
	}

	// Function to load marker library
	async function loadMarkerLibrary() {
		if (markerLibrary) return markerLibrary;

		try {
			markerLibrary = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;
			return markerLibrary;
		} catch (error) {
			console.error('Error loading marker library:', error);
			throw error;
		}
	}

	// Fullscreen functionality
	async function toggleFullscreen() {
		if (isFullscreen) {
			await exitFullscreen();
		} else {
			await enterFullscreen();
		}
	}

	async function enterFullscreen() {
		isFullscreen = true;

		// Disconnect ResizeObserver to prevent it from interfering with fullscreen
		if (containerResizeObserver) {
			containerResizeObserver.disconnect();
			containerResizeObserver = null;
		}

		try {
			// Try to use Capacitor's native fullscreen if available
			await ScreenOrientation.lock({ orientation: 'portrait' });
		} catch {
			console.log('Using fallback fullscreen method - Capacitor ScreenOrientation not available');
		}

		// Calculate navigation bar heights
		const headerEl = document.querySelector('.app-shell__header') as HTMLElement;
		const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;

		// Get footer height from CSS variable (set dynamically by layout)
		const footerHeightStr =
			getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') || '0px';
		const footerHeight = parseFloat(footerHeightStr.replace('px', '')) || 0;

		// Calculate available height (viewport minus navigation bars)
		const viewportHeight = window.innerHeight;
		const availableHeight = viewportHeight - headerHeight - footerHeight;

		// Store original dimensions for restoring later
		if (mapContainerDiv) {
			// Apply fullscreen styles - position below header, above footer
			// Remove all height-related classes that might interfere
			mapContainerDiv.className = 'task-location-map';
			mapContainerDiv.style.position = 'fixed';
			mapContainerDiv.style.top = `${headerHeight}px`;
			mapContainerDiv.style.bottom = `${footerHeight}px`;
			mapContainerDiv.style.left = '0';
			mapContainerDiv.style.right = '0';
			mapContainerDiv.style.width = '100vw';
			mapContainerDiv.style.height = `${availableHeight}px`;
			mapContainerDiv.style.maxHeight = `${availableHeight}px`;
			mapContainerDiv.style.minHeight = `${availableHeight}px`;
			mapContainerDiv.style.zIndex = '1000'; // High z-index to be above content but below modals
			mapContainerDiv.style.backgroundColor = 'white';
			mapContainerDiv.style.overflow = 'hidden';
			mapContainerDiv.style.margin = '0';
			mapContainerDiv.style.padding = '0';
		}

		// Ensure inner map element fills the fullscreen container
		// Remove height-related classes
		if (mapElement) {
			mapElement.className = 'w-full overflow-hidden';
			mapElement.style.width = '100%';
			mapElement.style.height = '100%';
			mapElement.style.minHeight = '100%';
			mapElement.style.maxHeight = '100%';
			mapElement.style.borderRadius = '0';
			mapElement.style.margin = '0';
			mapElement.style.padding = '0';
		}

		// Await DOM flush, then trigger Google Maps resize and re-center
		await tick();
		if (map) {
			google.maps.event.trigger(map, 'resize');
			// Center on the current map center instead of a specific marker
			const center = map.getCenter();
			if (center) {
				map.setCenter(center);
			}
			// Force a redraw by toggling zoom
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') {
				map.setZoom(currentZoom);
			}
		}

		// Keep size in sync when device UI chrome changes (mobile) or orientation changes
		fullscreenResizeHandler = () => {
			// Only handle resize if still in fullscreen
			if (!isFullscreen) return;

			// Recalculate navigation bar heights on resize
			const headerEl = document.querySelector('.app-shell__header') as HTMLElement;
			const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;

			const footerHeightStr =
				getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') || '0px';
			const footerHeight = parseFloat(footerHeightStr.replace('px', '')) || 0;

			const viewportHeight = window.innerHeight;
			const availableHeight = viewportHeight - headerHeight - footerHeight;

			if (mapContainerDiv) {
				mapContainerDiv.style.top = `${headerHeight}px`;
				mapContainerDiv.style.bottom = `${footerHeight}px`;
				mapContainerDiv.style.height = `${availableHeight}px`;
				mapContainerDiv.style.maxHeight = `${availableHeight}px`;
				mapContainerDiv.style.minHeight = `${availableHeight}px`;
			}

			if (mapElement) {
				mapElement.style.height = '100%';
				mapElement.style.minHeight = '100%';
				mapElement.style.maxHeight = '100%';
			}
			if (map) {
				google.maps.event.trigger(map, 'resize');
			}
		};
		window.addEventListener('resize', fullscreenResizeHandler);

		// Enable ESC to exit fullscreen
		escKeyHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				exitFullscreen();
			}
		};
		window.addEventListener('keydown', escKeyHandler);
	}

	async function exitFullscreen() {
		isFullscreen = false;

		try {
			// Release orientation lock if we used Capacitor
			await ScreenOrientation.unlock();
		} catch {
			console.log('Capacitor ScreenOrientation not available');
		}

		// Restore original CSS styles
		if (mapContainerDiv) {
			// Restore original classes
			mapContainerDiv.className = 'task-location-map relative w-full h-full';
			mapContainerDiv.style.position = 'relative';
			mapContainerDiv.style.top = 'auto';
			mapContainerDiv.style.bottom = 'auto';
			mapContainerDiv.style.left = 'auto';
			mapContainerDiv.style.right = 'auto';
			mapContainerDiv.style.width = '100%';
			mapContainerDiv.style.maxHeight = '';
			mapContainerDiv.style.minHeight = '';
			// Restore height based on prop - use '100%' if that's what was passed, otherwise use the prop value
			if (height === '100%') {
				mapContainerDiv.style.height = '';
			} else {
				mapContainerDiv.style.height = height;
			}
			mapContainerDiv.style.zIndex = 'auto';
			mapContainerDiv.style.backgroundColor = 'transparent';
			mapContainerDiv.style.overflow = 'visible';
			mapContainerDiv.style.margin = '';
			mapContainerDiv.style.padding = '';
		}

		// Restore map element size
		if (mapElement) {
			// Restore original classes
			mapElement.className = 'w-full h-full overflow-hidden rounded-lg';
			mapElement.style.width = '100%';
			mapElement.style.height = '';
			mapElement.style.minHeight = '';
			mapElement.style.maxHeight = '';
			mapElement.style.borderRadius = '0.5rem'; // rounded-lg
			mapElement.style.margin = '';
			mapElement.style.padding = '';
		}

		// Reconnect ResizeObserver after exiting fullscreen
		await tick();
		if (mapElement && mapContainerDiv && typeof ResizeObserver !== 'undefined') {
			if (containerResizeObserver) {
				containerResizeObserver.disconnect();
			}

			containerResizeObserver = new ResizeObserver(() => {
				if (!isFullscreen) {
					updateMapElementHeight();
				}
			});

			containerResizeObserver.observe(mapContainerDiv);
			if (mapContainerDiv.parentElement) {
				containerResizeObserver.observe(mapContainerDiv.parentElement);
			}
		}

		// Remove resize listener if present
		if (fullscreenResizeHandler) {
			window.removeEventListener('resize', fullscreenResizeHandler);
			fullscreenResizeHandler = null;
		}

		if (escKeyHandler) {
			window.removeEventListener('keydown', escKeyHandler);
			escKeyHandler = null;
		}

		// Trigger resize to update map
		await tick();
		if (map) {
			google.maps.event.trigger(map, 'resize');
			// Center on the current map center instead of a specific marker
			const center = map.getCenter();
			if (center) {
				map.setCenter(center);
			}
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') {
				map.setZoom(currentZoom);
			}
		}
	}

	// Function to center map on user's current location
	async function centerOnUserLocation() {
		if (!map || !isMapLoaded) return;

		isLocating = true;
		try {
			const location = await getUserLocation();

			if (location && location.latitude && location.longitude) {
				const position = {
					lat: location.latitude,
					lng: location.longitude
				};

				// Center map on user location
				map.setCenter(position);

				// Set appropriate zoom level (city level for privacy)
				map.setZoom(14);

				// Pan smoothly to location
				map.panTo(position);
			} else {
				// Only show warning if it's not a permission denial (user might have blocked it)
				// The getUserLocation function already logs specific errors
				// Don't show generic warning here to avoid noise
			}
		} catch (error) {
			console.error('Error centering on user location:', error);
		} finally {
			isLocating = false;
		}
	}

	async function initMap() {
		try {
			// Check if mapElement exists before proceeding
			if (!mapElement) {
				throw new Error('Map element not found');
			}

			// Determine map center: first task/service location > user location > default (same logic for tasks and services)
			let centerLocation: Location;

			if (isServicesMode && services.length > 0) {
				const firstServiceLoc = getServiceLocation(services[0]);
				if (firstServiceLoc?.latitude != null && firstServiceLoc?.longitude != null) {
					centerLocation = {
						displayName: firstServiceLoc.displayName || 'Service Location',
						latitude: firstServiceLoc.latitude,
						longitude: firstServiceLoc.longitude,
						zipCode: firstServiceLoc.zipCode || '',
						locationLoaded: true
					};
				} else {
					centerLocation = userLocation || {
						displayName: 'Centroamérica',
						latitude: 13.6929,
						longitude: -89.2182,
						zipCode: '',
						locationLoaded: false
					};
				}
			} else if (tasks.length > 0) {
				// Use first task's pickup location if available
				const firstTask = tasks[0];
				if (firstTask.pickupLocation?.latitude && firstTask.pickupLocation.longitude) {
					centerLocation = {
						displayName: firstTask.pickupLocation.displayName || 'Task Location',
						latitude: firstTask.pickupLocation.latitude,
						longitude: firstTask.pickupLocation.longitude,
						zipCode: firstTask.pickupLocation.zipCode || '',
						locationLoaded: true
					};
				} else {
					centerLocation = userLocation || {
						displayName: 'Centroamérica',
						latitude: 13.6929,
						longitude: -89.2182,
						zipCode: '',
						locationLoaded: false
					};
				}
			} else {
				centerLocation = userLocation || {
					displayName: 'Centroamérica',
					latitude: 13.6929,
					longitude: -89.2182,
					zipCode: '',
					locationLoaded: false
				};
			}

			// Try to get country with a short timeout for better zoom level
			// If it completes quickly, use country-specific zoom; otherwise use fallback
			const GEOCODING_TIMEOUT_MS = 1500; // 1.5 seconds max wait

			// Ensure we always have a Promise for Promise.race
			const countryPromise = window.google?.maps
				? getCountryFromCoordinates(centerLocation.latitude!, centerLocation.longitude!)
				: Promise.resolve(null);

			// Race between geocoding and timeout
			const countryResult = await Promise.race([
				countryPromise,
				new Promise<string | null>((resolve) =>
					setTimeout(() => resolve(null), GEOCODING_TIMEOUT_MS)
				)
			]).catch(() => null);

			// Determine zoom level - use country if available, otherwise fallback
			const zoomLevel = getZoomLevelForCountry(
				countryResult,
				centerLocation.latitude!,
				centerLocation.longitude!
			);

			// Initialize Google Maps with zoom restrictions for privacy
			map = new google.maps.Map(mapElement, {
				center: { lat: centerLocation.latitude!, lng: centerLocation.longitude! },
				zoom: Math.min(zoomLevel + zoomOffset, 14),
				maxZoom: 14, // Máximo zoom de ciudad - no mostrar direcciones exactas
				minZoom: 2, // Permitir zoom out para ver áreas más amplias
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: true,
				streetViewControl: false, // Deshabilitar Street View para privacidad
				fullscreenControl: false,
				mapTypeControlOptions: {
					style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
					position: google.maps.ControlPosition.TOP_LEFT
				},
				zoomControlOptions: {
					position: google.maps.ControlPosition.RIGHT_CENTER
				},
				mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID'
			});

			// Close InfoWindow when clicking on the map
			map.addListener('click', () => {
				closeInfoWindow();
			});

			// Load marker library
			await loadMarkerLibrary();

			// Create markers after map is initialized
			// Use requestAnimationFrame for better performance
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (isServicesMode) createServiceMarkers();
					else createTaskMarkers();
				});
			});
		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
	}

	async function tryInitMap() {
		try {
			// Only proceed if Google Maps is ready and mapElement exists
			if (!googleMapsReady) {
				throw new Error('Google Maps not ready');
			}

			if (!mapElement) {
				throw new Error('Map element not found');
			}

			// Ensure map element has explicit height before initialization
			// Skip if in fullscreen (fullscreen handles its own sizing)
			if (mapElement && !isFullscreen) {
				// Force height calculation from parent
				const parentHeight = mapElement.parentElement?.offsetHeight;
				if (parentHeight && parentHeight > 0) {
					mapElement.style.height = `${parentHeight}px`;
				} else {
					// Fallback: use computed height or set minimum
					const computedHeight = window.getComputedStyle(mapElement).height;
					if (!computedHeight || computedHeight === '0px' || computedHeight === 'auto') {
						mapElement.style.height = height === '100%' ? '100%' : height;
					}
				}
			}

			await initMap();
			isMapLoaded = true;

			// Ensure map element has explicit height after initialization
			// Skip if in fullscreen (fullscreen handles its own sizing)
			await tick();
			if (mapElement && !isFullscreen) {
				const parentHeight = mapElement.parentElement?.offsetHeight;
				if (parentHeight && parentHeight > 0) {
					mapElement.style.height = `${parentHeight}px`;
					mapElement.style.minHeight = `${parentHeight}px`;
				} else {
					// Fallback: ensure minimum height
					const computedHeight = window.getComputedStyle(
						mapElement.parentElement || mapElement
					).height;
					if (computedHeight && computedHeight !== '0px' && computedHeight !== 'auto') {
						mapElement.style.height = computedHeight;
						mapElement.style.minHeight = computedHeight;
					} else {
						// Last resort: set a minimum height
						mapElement.style.minHeight = '400px';
					}
				}
			}

			// Trigger resize after map is initialized to ensure proper rendering
			if (map) {
				google.maps.event.trigger(map, 'resize');
			}

			// Hide loading after everything is ready
			// Use requestAnimationFrame for better performance
			requestAnimationFrame(() => {
				isLoading = false;
				// Ensure height is maintained after loading completes
				// Skip if in fullscreen (fullscreen handles its own sizing)
				if (mapElement && map && !isFullscreen) {
					// Batch DOM operations to avoid forced reflow
					requestAnimationFrame(() => {
						if (!mapElement || !map) return;
						// Re-check and set height after loading state changes
						const parentHeight = mapElement.parentElement?.offsetHeight;
						if (parentHeight && parentHeight > 0) {
							const heightStr = `${parentHeight}px`;
							mapElement.style.height = heightStr;
							mapElement.style.minHeight = heightStr;
						}
						google.maps.event.trigger(map, 'resize');
					});
				} else if (map && isFullscreen) {
					// Just trigger resize if in fullscreen
					requestAnimationFrame(() => {
						if (map) {
							google.maps.event.trigger(map, 'resize');
						}
					});
				}
			});
		} catch (err) {
			console.error('Error initializing map:', err);
			errorMsg = err instanceof Error ? err.message : 'Error initializing map';
			hasError = true;
			isLoading = false;
		}
	}

	// ---------- Services mode helpers (same logic as ServiceLocationMap / ServiceCard) ----------
	function getServiceLocation(service: Service): Location | null {
		if (service.locationDetails?.taskerLocation?.serviceLocation) {
			return service.locationDetails.taskerLocation.serviceLocation;
		}
		if (service.locationDetails?.taskeeLocation?.serviceLocation) {
			return service.locationDetails.taskeeLocation.serviceLocation;
		}
		return null;
	}

	function groupServicesByLocation(svc: Service[]) {
		const groups: Array<{ latitude: number; longitude: number; services: Service[] }> = [];
		const processed = new SvelteSet<string>();
		for (const service of svc) {
			const loc = getServiceLocation(service);
			if (!loc?.latitude || loc.longitude == null) continue;
			const key = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`;
			if (processed.has(key)) continue;
			processed.add(key);
			const nearby = svc.filter((s) => {
				const l = getServiceLocation(s);
				return (
					l?.latitude != null &&
					l?.longitude != null &&
					Math.abs(l.latitude - loc.latitude!) < 0.001 &&
					Math.abs(l.longitude - loc.longitude!) < 0.001
				);
			});
			groups.push({
				latitude: loc.latitude,
				longitude: loc.longitude,
				services: nearby
			});
		}
		return groups;
	}

	function getServicePricingDisplay(service: Service): string {
		if (!service.pricing)
			return $t('dashboard.services.browse.pricing.inquiry_required') || 'Request Quote';
		switch (service.pricing.type) {
			case ServicePricingTypeEnum.FIXED:
				return service.pricing.amount != null
					? `$${formatNumberWithTwoDecimals(service.pricing.amount)}`
					: $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
			case ServicePricingTypeEnum.HOURLY:
				return service.pricing.hourlyRate != null
					? `$${formatNumberWithTwoDecimals(service.pricing.hourlyRate)}/hr`
					: $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
			case ServicePricingTypeEnum.TIERED:
				if (service.pricing.tiers?.length) {
					const prices = service.pricing.tiers
						.map((tier: ServiceTier) => tier.price)
						.filter((p: number | undefined): p is number => typeof p === 'number' && p > 0);
					if (prices.length) return `From $${formatNumberWithTwoDecimals(Math.min(...prices))}`;
				}
				return $t('dashboard.services.browse.pricing.from_price') || 'From $X';
			case ServicePricingTypeEnum.INQUIRY_REQUIRED:
				return $t('dashboard.services.browse.pricing.request_quote') || 'Request Quote';
			default:
				return $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
		}
	}

	function getServiceLocationDisplay(service: Service): string {
		const locLabels: Record<ServiceLocationTypeEnum, string> = {
			[ServiceLocationTypeEnum.REMOTE]:
				$t('dashboard.services.create.location.remote_title') || 'Remote',
			[ServiceLocationTypeEnum.TASKER_LOCATION]:
				$t('dashboard.services.create.location.tasker_title') || 'At Tasker Location',
			[ServiceLocationTypeEnum.TASKEE_LOCATION]:
				$t('dashboard.services.create.location.taskee_title') || 'At My Location'
		};
		const base =
			service.locationDetails?.taskerLocation?.serviceLocation?.displayName ||
			service.locationDetails?.taskerLocation?.serviceLocation?.formattedAddress;
		if (service.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKER_LOCATION) && base) {
			return base.length > 50 ? base.slice(0, 50).trim() + '…' : base;
		}
		if (service.serviceLocationTypes?.length) {
			return service.serviceLocationTypes.map((t) => locLabels[t] || t).join(', ');
		}
		return 'Remote';
	}

	/**
	 * Generate HTML content for Service InfoWindow (matches Task info window design)
	 */
	function generateServiceInfoWindowContent(service: Service): string {
		const escapeHtml = (text: string): string => {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		};
		const escapeAttr = (text: string): string =>
			text
				.replace(/&/g, '&amp;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');

		const currentLocale = get(locale) || 'en';
		const displayTitle = getServiceDisplayTitle(service, currentLocale) || 'Service';
		const displayDescription = getServiceDisplayDescription(service, currentLocale) || '';
		const desc = (displayDescription || '').substring(0, 150);
		const escapedDesc = escapeHtml(
			desc + (displayDescription && displayDescription.length > 150 ? '...' : '')
		);
		const escapedTitle = escapeHtml(displayTitle);
		const price = getServicePricingDisplay(service);
		const locationText = escapeHtml(getServiceLocationDisplay(service));
		const username = escapeHtml(service.creator?.username || 'Provider');
		const rating = service.creator?.rating || 0;
		const viewText = $t('dashboard.services.browse.view_service') || 'View Service';
		const serviceId = escapeAttr(service.uniqueId || service.id);

		const starsHtml = Array(5)
			.fill(0)
			.map(
				(_, i) =>
					`<svg style="width:6px;height:6px" class="${i < rating ? 'text-yellow-400' : 'text-base-content/30'}" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
			</svg>`
			)
			.join('');

		let avatarHtml = '';
		if (service.creator?.avatar) {
			avatarHtml = `<img src="${escapeAttr(service.creator.avatar)}" alt="Avatar" class="h-5 w-5 rounded-full object-cover" />`;
		} else if (service.creator?.username) {
			const initial = service.creator.username.charAt(0).toUpperCase();
			avatarHtml = `<div class="bg-primary text-primary-content flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold">${initial}</div>`;
		} else {
			avatarHtml = `<div class="bg-base-300 flex h-5 w-5 items-center justify-center rounded-full">
				<svg class="h-3 w-3 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
				</svg>
			</div>`;
		}

		return `
			<div class="task-info-window task-info-window-compact task-info-window-service" style="font-family: system-ui, -apple-system, sans-serif; padding: 0; margin: 0;">
				<div class="card bg-base-100 rounded-xl shadow-md" style="border: none; margin: 0;">
					<div class="card-body rounded-xl" style="padding: 6px 12px 6px 12px;">
						<!-- Top Row: Title + Price -->
						<div style="margin-bottom: 3px; display: flex; flex-direction: row; align-items: stretch; justify-content: space-between; gap: 6px;">
							<div style="flex: 1; min-width: 0; padding-right: 6px;">
								<h3 class="card-title" style="font-size: 13px; font-weight: 600; line-height: 1.3; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
									${escapedTitle}
								</h3>
								<p style="font-size: 11px; color: hsl(var(--bc) / 0.8); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line;">
									${escapedDesc}
								</p>
							</div>
							<div style="flex-shrink: 0; text-align: right; font-size: 13px; font-weight: bold;">
								${price}
							</div>
						</div>
						<!-- Location -->
						<div style="margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
							<svg class="text-primary" style="width: 18px; height: 18px; flex-shrink: 0;" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12,2C8.13,2 5,5.13 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9C19,5.13 15.87,2 12,2M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5Z"/>
							</svg>
							<span style="font-size: 12px; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;">${locationText}</span>
						</div>
						<!-- Provider Info + Stars (compact single row) -->
						<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
							<div class="avatar" style="flex-shrink: 0; width: 20px; height: 20px; min-width: 20px; overflow: hidden;">${avatarHtml}</div>
							<span style="font-size: 11px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">${username}</span>
							<div style="display: flex; align-items: center; gap: 1px; flex-shrink: 0;">
								${starsHtml}
								<span style="font-size: 10px; color: hsl(var(--bc) / 0.6); margin-left: 1px;">${rating}</span>
							</div>
						</div>
						<!-- Ver Button -->
						<div class="task-info-window-buttons flex flex-col gap-2 lg:flex-row" style="width: 100%; margin-top: 0; padding-top: 0;">
							<button class="btn btn-secondary btn-sm task-info-window-btn" style="width: 100%; min-height: 24px !important; padding: 2px 8px !important; font-size: 11px;" data-service-id="${serviceId}" data-action="view" onclick="window.handleMapServiceInfoWindowAction(event, '${serviceId.replace(/'/g, "\\'")}')">
								<svg style="width: 12px; height: 12px; margin-right: 3px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
								</svg>
								${viewText}
							</button>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	function showServiceInfoWindow(
		service: Service,
		marker: google.maps.marker.AdvancedMarkerElement
	) {
		if (!map) return;
		if (!service) return;
		closeInfoWindow();
		try {
			const maxWidth =
				typeof window !== 'undefined'
					? window.innerWidth <= 768
						? Math.min(280, window.innerWidth - 48)
						: Math.min(320, Math.max(260, window.innerWidth - 32))
					: 320;
			infoWindow = new google.maps.InfoWindow({
				content: generateServiceInfoWindowContent(service),
				maxWidth
			});
			infoWindow.open({ anchor: marker, map });

			const currentServices: Service[] = services;
			(window as unknown as Record<string, unknown>).handleMapServiceInfoWindowAction = (
				event: Event,
				serviceId: string
			) => {
				event.preventDefault();
				event.stopPropagation();
				const svc = currentServices.find((s) => (s.uniqueId || s.id) === serviceId);
				if (svc) {
					onServiceSelected?.({ service: svc });
					if (onViewService) {
						onViewService(svc);
					} else {
						goto(`/services/${serviceId}`);
					}
				}
			};
		} catch (e) {
			console.error('Error showing service InfoWindow:', e);
		}
	}

	async function createServiceMarker(
		lat: number,
		lng: number,
		service: Service
	): Promise<google.maps.marker.AdvancedMarkerElement | null> {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return null;
		try {
			const { AdvancedMarkerElement } = markerLibrary;
			const markerContainer = document.createElement('div');
			markerContainer.style.position = 'relative';
			markerContainer.style.cursor = 'pointer';
			const img = document.createElement('img');
			img.src = '/map-pin.png';
			img.style.width = '3.5rem';
			img.style.height = '3.5rem';
			img.style.display = 'block';
			img.style.borderRadius = '50%';
			markerContainer.appendChild(img);
			const marker = new AdvancedMarkerElement({
				position: { lat, lng },
				map,
				content: markerContainer,
				gmpDraggable: false
			});

			const posKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
			serviceMarkerByPosition.set(posKey, marker);

			marker.addListener('click', () => {
				hideAllCircles();
				showCircleForMarker(lat, lng);

				const position = { lat, lng };
				const circle = circles.find(
					(c) => c.getCenter()?.lat() === lat && c.getCenter()?.lng() === lng
				);
				if (circle) {
					const bounds = circle.getBounds();
					if (bounds && map) map.fitBounds(bounds);
					const currentZoom = map?.getZoom() || 0;
					if (currentZoom > 14 && map) map.setZoom(14);
					if (map) map.panTo(position);
				}

				onServiceSelected?.({ service });
				showServiceInfoWindow(service, marker);
			});
			return marker;
		} catch (error) {
			console.error('Error creating service marker:', error);
			return null;
		}
	}

	async function createServiceMarkers() {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return;
		try {
			const groups = groupServicesByLocation(services);
			for (const group of groups) {
				const marker = await createServiceMarker(
					group.latitude,
					group.longitude,
					group.services[0]
				);
				if (marker) markers.push(marker);
			}
		} catch (error) {
			console.error('Error creating service markers:', error);
		}
	}

	// Función para agrupar tareas por ubicación de recogida cercana
	function groupTasksByLocation(tasks: Task[]) {
		const groups: Array<{
			latitude: number;
			longitude: number;
			tasks: Task[];
		}> = [];

		const processedLocations = new SvelteSet<string>();

		for (const task of tasks) {
			// Solo procesar pickup location
			if (task.pickupLocation?.latitude && task.pickupLocation.longitude) {
				const locationKey = `${task.pickupLocation.latitude.toFixed(4)},${task.pickupLocation.longitude.toFixed(4)}`;

				if (!processedLocations.has(locationKey)) {
					processedLocations.add(locationKey);

					// Buscar tareas cercanas en la misma ubicación de recogida
					const nearbyTasks = tasks.filter(
						(t) =>
							t.pickupLocation?.latitude &&
							t.pickupLocation.longitude &&
							Math.abs(t.pickupLocation.latitude - (task.pickupLocation?.latitude || 0)) < 0.001 &&
							Math.abs(t.pickupLocation.longitude - (task.pickupLocation?.longitude || 0)) < 0.001
					);

					groups.push({
						latitude: task.pickupLocation.latitude,
						longitude: task.pickupLocation.longitude,
						tasks: nearbyTasks
					});
				}
			}
		}

		return groups;
	}

	async function createTaskMarkers() {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return;

		try {
			// Agrupar tareas por ubicación para evitar superposiciones
			const groupedTasks = groupTasksByLocation(tasks);

			// Create markers for grouped tasks
			for (const group of groupedTasks) {
				const marker = await createTaskMarker(group.latitude, group.longitude, group.tasks);
				if (marker) markers.push(marker);
			}
		} catch (error) {
			console.error('Error creating task markers:', error);
		}
	}

	async function createTaskMarker(
		lat: number,
		lng: number,
		tasks: Task[]
	): Promise<google.maps.marker.AdvancedMarkerElement | null> {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return null;

		try {
			const { AdvancedMarkerElement } = markerLibrary;

			// Crear un contenedor personalizado para el marcador
			const markerContainer = document.createElement('div');
			markerContainer.style.position = 'relative';
			markerContainer.style.cursor = 'pointer';

			// Usamos tu imagen personalizada original
			const img = document.createElement('img');
			img.src = '/map-pin.png';
			img.style.width = '3.5rem'; // Tamaño optimizado
			img.style.height = '3.5rem';
			img.style.display = 'block';
			img.style.borderRadius = '50%'; // Hacer la imagen redonda

			// Agregar indicador de cantidad de tareas si hay más de una
			if (tasks.length > 1) {
				const taskCount = document.createElement('div');
				taskCount.style.cssText = `
					position: absolute;
					top: -8px;
					right: -8px;
					background: linear-gradient(135deg, #EF4444, #DC2626);
					color: white;
					border-radius: 50%;
					width: 20px;
					height: 20px;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 11px;
					font-weight: bold;
					border: 2px solid white;
				`;
				taskCount.textContent = tasks.length.toString();
				markerContainer.appendChild(taskCount);
			}

			markerContainer.appendChild(img);

			const marker = new AdvancedMarkerElement({
				position: { lat, lng },
				map,
				content: markerContainer,
				gmpDraggable: false
			});

			// 🖱️ Evento click en el marcador → mostrar InfoWindow y ajustar zoom
			marker.addListener('click', () => {
				// Ocultar todos los círculos primero
				hideAllCircles();

				// Crear y mostrar el círculo para este marcador
				showCircleForMarker(lat, lng);

				// Hacer zoom al círculo pero con restricción de zoom máximo
				const position = { lat, lng };
				const circle = circles.find(
					(c) => c.getCenter()?.lat() === lat && c.getCenter()?.lng() === lng
				);

				if (circle) {
					// Ajustar el zoom pero respetar el máximo de 14
					const bounds = circle.getBounds();
					if (bounds && map) {
						map.fitBounds(bounds);
					}

					if (map) {
						// Asegurar que el zoom no exceda 14
						const currentZoom = map.getZoom() || 0;
						if (currentZoom > 14) {
							map.setZoom(14);
						}

						// Pan inicial
						map.panTo(position);
					}
				}

				// Show InfoWindow with task details
				// Si hay múltiples tareas, mostrar la primera
				const selectedTask = tasks[0];
				showInfoWindow(selectedTask, marker);
			});

			return marker;
		} catch (error) {
			console.error('Error creating task marker:', error);
			return null;
		}
	}

	function showCircleForMarker(lat: number, lng: number) {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		const position = { lat, lng };

		// Crear círculo de radio
		const circle = new google.maps.Circle({
			strokeColor: '#F59E0B',
			strokeOpacity: 0.8,
			strokeWeight: 2,
			fillColor: '#F59E0B',
			fillOpacity: 0.1,
			map,
			center: position,
			radius: serviceRadius * 100 // Convertir km a metros
		});

		circles.push(circle);
	}

	function hideAllCircles() {
		circles.forEach((circle) => {
			if (circle) circle.setMap(null);
		});
		circles = [];
	}

	function clearMarkers() {
		// Close InfoWindow before clearing markers
		closeInfoWindow();

		markers.forEach((marker) => {
			if (marker) marker.map = null;
		});
		markers = [];
		serviceMarkerByPosition.clear();
	}

	function clearCircles() {
		circles.forEach((circle) => {
			if (circle) circle.setMap(null);
		});
		circles = [];
	}

	// Función para actualizar markers cuando cambien las tasks o los servicios
	async function updateMarkers() {
		if (map && isMapLoaded) {
			clearMarkers();
			if (isServicesMode) await createServiceMarkers();
			else await createTaskMarkers();
		}
	}

	// Función para mostrar el círculo de una task específica con restricciones de zoom
	function highlightTaskOnMap(task: Task) {
		if (!map || !isMapLoaded) return;

		// Ocultar todos los círculos primero
		hideAllCircles();

		// Solo mostrar pickup location
		if (task.pickupLocation?.latitude && task.pickupLocation.longitude) {
			showCircleForMarker(task.pickupLocation.latitude, task.pickupLocation.longitude);

			// Hacer zoom al círculo con restricciones
			const position = {
				lat: task.pickupLocation.latitude,
				lng: task.pickupLocation.longitude
			};
			const circle = circles.find(
				(c) =>
					c.getCenter()?.lat() === task.pickupLocation?.latitude &&
					c.getCenter()?.lng() === task.pickupLocation?.longitude
			);

			if (circle) {
				const bounds = circle.getBounds();
				if (bounds) {
					map.fitBounds(bounds);
				}

				// Asegurar que el zoom no exceda 14
				const currentZoom = map.getZoom() || 0;
				if (currentZoom > 14) {
					map.setZoom(14);
				}

				map.panTo(position);
			}
		}
	}

	function highlightServiceOnMap(service: Service) {
		if (!map || !isMapLoaded) return;
		const loc = getServiceLocation(service);
		if (!loc?.latitude || loc.longitude == null) return;

		hideAllCircles();
		showCircleForMarker(loc.latitude, loc.longitude);

		const position = { lat: loc.latitude, lng: loc.longitude };
		const circle = circles.find(
			(c) => c.getCenter()?.lat() === loc.latitude && c.getCenter()?.lng() === loc.longitude
		);
		if (circle) {
			const bounds = circle.getBounds();
			if (bounds) map.fitBounds(bounds);
			const currentZoom = map.getZoom() || 0;
			if (currentZoom > 14) map.setZoom(14);
			map.panTo(position);
		}

		const posKey = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`;
		const marker = serviceMarkerByPosition.get(posKey);
		if (marker) showServiceInfoWindow(service, marker);
	}

	// Function to update map element height
	function updateMapElementHeight() {
		if (!mapElement || !mapContainerDiv) return;

		// First, check if height prop is a fixed pixel value - respect it
		const fixedHeight = parseFixedHeight(height);
		if (fixedHeight !== null) {
			applyMapHeight(fixedHeight);
			return;
		}

		// If height is 100%, try to use parent height
		if (height === '100%') {
			// Walk up the parent chain to find a parent with actual height
			let parent = mapContainerDiv.parentElement;
			let foundHeight = 0;

			// Check up to 5 levels of parents
			for (let i = 0; i < 5 && parent; i++) {
				const parentHeight = parent.offsetHeight;
				const computedHeight = window.getComputedStyle(parent).height;
				const heightValue = parseFloat(computedHeight);

				if (parentHeight > 100) {
					foundHeight = parentHeight;
					break;
				} else if (!isNaN(heightValue) && heightValue > 100) {
					foundHeight = heightValue;
					break;
				}

				parent = parent.parentElement;
			}

			// If we found a height, use it
			if (foundHeight > 100) {
				applyMapHeight(foundHeight);
				return;
			}
		}

		// Fallback: use viewport-based calculation (for vh units or when no parent height found)
		const calculatedHeight = calculateMapHeight();
		applyMapHeight(calculatedHeight);
	}

	/**
	 * Check if height prop is a fixed pixel value (e.g., "300px")
	 * Returns the pixel value if it's a fixed value, null otherwise
	 */
	function parseFixedHeight(heightValue: string): number | null {
		if (heightValue.endsWith('px')) {
			const pixelValue = parseFloat(heightValue.replace('px', ''));
			if (!isNaN(pixelValue) && pixelValue > 0) {
				return pixelValue;
			}
		}
		return null;
	}

	/**
	 * Calculate map height using viewport and CSS variables
	 * Extracted to single function to avoid duplication
	 * Only used when height prop is viewport-based (vh, %, etc.)
	 */
	function calculateMapHeight(): number {
		const viewportHeight = window.innerHeight;
		const dockHeightStr =
			getComputedStyle(document.documentElement).getPropertyValue('--app-dock-height') ||
			getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') ||
			'64px';
		const dockHeight = parseFloat(dockHeightStr.replace('px', '')) || 64;

		const headerHeightStr =
			getComputedStyle(document.documentElement).getPropertyValue('--header-controls-height') ||
			'10rem';
		const headerHeightRem = parseFloat(headerHeightStr.replace('rem', '')) || 10;
		const headerHeightPx = headerHeightRem * 16; // Convert rem to px (assuming 16px base)

		return Math.max(400, viewportHeight - dockHeight - headerHeightPx);
	}

	/**
	 * Apply calculated height to map container and element
	 * Batches DOM operations to avoid forced reflows
	 */
	function applyMapHeight(calculatedHeight: number | string): void {
		if (!mapContainerDiv || !mapElement) return;

		// Batch all DOM writes together to avoid forced reflows
		requestAnimationFrame(() => {
			if (!mapContainerDiv || !mapElement) return;

			// Read all computed styles first (if needed)
			const heightStr =
				typeof calculatedHeight === 'number' ? `${calculatedHeight}px` : calculatedHeight;

			// Batch all style writes
			mapContainerDiv.style.height = heightStr;
			mapContainerDiv.style.maxHeight = heightStr; // Prevent expansion beyond set height
			mapContainerDiv.style.minHeight = heightStr;
			mapContainerDiv.style.overflow = 'hidden'; // Prevent content from overflowing
			mapElement.style.height = heightStr;
			mapElement.style.minHeight = heightStr;
			mapElement.style.maxHeight = heightStr; // Prevent expansion beyond set height

			// Trigger resize if map is loaded (in next frame to avoid blocking)
			if (map && isMapLoaded && window.google?.maps) {
				requestAnimationFrame(() => {
					if (map) {
						google.maps.event.trigger(map, 'resize');
					}
				});
			}
		});
	}

	// Watch for container and map element changes to ensure proper height
	// Skip height calculations when in fullscreen mode
	$effect(() => {
		if (mapElement && mapContainerDiv && !isFullscreen) {
			// Check if height prop is a fixed pixel value
			const fixedHeight = parseFixedHeight(height);

			if (fixedHeight !== null) {
				// Use the fixed height from prop
				applyMapHeight(fixedHeight);
			} else if (height === '100%') {
				// For 100%, use parent height or fallback to calculated
				updateMapElementHeight();
			} else {
				// For viewport-based heights (vh, etc.), calculate from viewport
				const calculatedHeight = calculateMapHeight();
				applyMapHeight(calculatedHeight);
			}

			// Set up ResizeObserver to watch for container size changes
			// Only set up ResizeObserver if height is not a fixed pixel value
			// Fixed heights should remain constant (reuse fixedHeight from above)
			if (typeof ResizeObserver !== 'undefined' && fixedHeight === null) {
				if (containerResizeObserver) {
					containerResizeObserver.disconnect();
				}

				containerResizeObserver = new ResizeObserver(() => {
					// Don't update height if in fullscreen or if we have a fixed height
					if (!isFullscreen && parseFixedHeight(height) === null) {
						updateMapElementHeight();
					}
				});

				containerResizeObserver.observe(mapContainerDiv);

				// Also observe parent to catch when it gets height (only for non-fixed heights)
				if (mapContainerDiv.parentElement) {
					containerResizeObserver.observe(mapContainerDiv.parentElement);
				}

				return () => {
					if (containerResizeObserver) {
						containerResizeObserver.disconnect();
						containerResizeObserver = null;
					}
				};
			}
		}
	});

	// Watch for tasks or services changes - usando $effect.pre para evitar bucles infinitos
	$effect.pre(() => {
		const hasItems = isServicesMode ? services.length > 0 : tasks.length > 0;
		if (hasItems && map && isMapLoaded) {
			const currentIds = isServicesMode
				? services.map((s: Service) => s.uniqueId || s.id).join(',')
				: tasks.map((t: Task) => t.id).join(',');
			if (currentIds !== lastTaskIds) {
				lastTaskIds = currentIds;
				requestAnimationFrame(() => {
					updateMarkers();
				});
			}
		}
	});

	// Watch for selectedTask changes - usando $effect.pre para evitar bucles infinitos
	$effect.pre(() => {
		if (selectedTask && map && isMapLoaded) {
			// Solo actualizar si realmente cambió la task seleccionada
			const currentSelectedTaskId = selectedTask.id;
			if (currentSelectedTaskId !== lastSelectedTaskId) {
				lastSelectedTaskId = currentSelectedTaskId;
				// Usar requestAnimationFrame para mejor rendimiento
				requestAnimationFrame(() => {
					highlightTaskOnMap(selectedTask);
				});
			}
		}
	});

	// Watch for selectedService changes - same as tasks
	$effect.pre(() => {
		if (selectedService && map && isMapLoaded && isServicesMode) {
			const currentId = selectedService.uniqueId || selectedService.id;
			if (currentId !== lastSelectedServiceId) {
				lastSelectedServiceId = currentId;
				requestAnimationFrame(() => {
					highlightServiceOnMap(selectedService);
				});
			}
		}
	});

	onMount(async () => {
		if (mapsDisabled) {
			isLoading = false;
			return;
		}

		try {
			// Load Google Maps script (don't auto-request user location — let them
			// tap "My location" button instead, per Google Play policy compliance)
			await loadGoogleMapsScript();

			// Wait for DOM to be ready
			await tick();

			// Wait for layout to stabilize - multiple frames to ensure parent heights are calculated
			await new Promise((resolve) => requestAnimationFrame(resolve));
			await new Promise((resolve) => requestAnimationFrame(resolve));
			await new Promise((resolve) => requestAnimationFrame(resolve));

			// Force height calculation before initialization - respect height prop
			if (mapContainerDiv && mapElement) {
				const fixedHeight = parseFixedHeight(height);
				if (fixedHeight !== null) {
					// Use fixed height from prop
					applyMapHeight(fixedHeight);
				} else if (height === '100%') {
					// For 100%, try to get parent height
					updateMapElementHeight();
				} else {
					// For viewport-based heights, calculate from viewport
					const calculatedHeight = calculateMapHeight();
					applyMapHeight(calculatedHeight);
				}
			}

			// Initialize map if all conditions are met
			if (mapElement && googleMapsReady && !isMapLoaded && !hasError) {
				await tryInitMap();
			}
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			errorMsg = err instanceof Error ? err.message : 'Error loading Google Maps';
			isLoading = false;
		}
	});

	onDestroy(() => {
		// Cleanup
		closeInfoWindow();
		clearMarkers();
		clearCircles();
		if (containerResizeObserver) {
			containerResizeObserver.disconnect();
			containerResizeObserver = null;
		}
		if (map) {
			google.maps.event.clearInstanceListeners(map);
		}
		// Clean up global handlers
		if ((window as unknown as Record<string, unknown>).handleMapInfoWindowAction) {
			delete (window as unknown as Record<string, unknown>).handleMapInfoWindowAction;
		}
		if ((window as unknown as Record<string, unknown>).handleMapServiceInfoWindowAction) {
			delete (window as unknown as Record<string, unknown>).handleMapServiceInfoWindowAction;
		}
	});
</script>

<div bind:this={mapContainerDiv} class="task-location-map relative w-full">
	<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg">
		{#if mapsDisabled}
			<div
				class="bg-base-200 text-base-content/60 flex h-full w-full items-center justify-center px-4 text-center text-sm"
			>
				{translateMapText(
					'dashboard.bids.components.maps.task_location_map.map_unavailable',
					'common.task.location_viewer.map_unavailable',
					'Map unavailable'
				)}
			</div>
		{:else if isLoading}
			<div class="bg-base-200 flex h-full w-full items-center justify-center">
				<div class="text-center">
					<span class="loading loading-spinner loading-lg mb-2"></span>
					<p class="text-base-content/70 text-sm">
						{translateMapText(
							'dashboard.bids.components.maps.task_location_map.loading_map',
							'common.task.location_viewer.loading_map',
							'Loading map...'
						)}
					</p>
				</div>
			</div>
		{:else if hasError}
			<div class="bg-base-200 flex h-full w-full items-center justify-center">
				<div class="text-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-error mx-auto mb-2 h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<p class="text-error text-sm">
						{translateMapText(
							'dashboard.bids.components.maps.task_location_map.error_loading_map',
							'common.task.location_viewer.error',
							'Error loading map'
						)}
					</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Map Control Buttons -->
	<div class="absolute top-4 right-4 z-20 flex gap-2" class:z-1000={isFullscreen}>
		{#if showMyLocationButton}
			<!-- My Location Button -->
			<button
				onclick={centerOnUserLocation}
				disabled={isLocating || !isMapLoaded}
				class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 shadow-md disabled:opacity-50"
				aria-label={$t('common.task.location_picker.my_location') || 'Center on my location'}
				title={$t('common.task.location_picker.my_location') || 'Center on my location'}
			>
				{#if isLocating}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<!-- Map pin icon (matches task cards) -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				{/if}
			</button>
		{/if}

		<!-- Fullscreen Button -->
		{#if showFullscreen}
			<button
				onclick={toggleFullscreen}
				class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 shadow-md"
				aria-label={isFullscreen
					? $t('common.task.location_picker.exit_fullscreen')
					: $t('common.task.location_picker.enter_fullscreen')}
				title={isFullscreen
					? $t('common.task.location_picker.exit_fullscreen')
					: $t('common.task.location_picker.enter_fullscreen')}
			>
				{#if isFullscreen}
					<!-- Exit fullscreen icon -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content h-5 w-5"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path
							d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
						/>
					</svg>
				{:else}
					<!-- Enter fullscreen icon -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content h-5 w-5"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path
							d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
						/>
					</svg>
				{/if}
			</button>
		{/if}
	</div>
</div>

<!-- Error Message -->
{#if errorMsg}
	<div class="alert alert-error alert-outline mt-3">
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
				d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
		<span class="text-sm">{errorMsg}</span>
	</div>
{/if}

<style>
	:global(.pac-container) {
		z-index: 9999;
	}

	/* Style InfoWindow - solid dark, no white margin/border */
	:global(.gm-style .gm-style-iw) {
		padding: 0 !important;
		background-color: hsl(var(--b1)) !important;
		border: none !important;
		outline: none !important;
	}

	:global(.gm-style .gm-style-iw-c) {
		padding: 0 !important;
		border-radius: 0.75rem !important;
		background-color: hsl(var(--b1)) !important;
		border: none !important;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3) !important;
	}

	:global(.gm-style .gm-style-iw-d) {
		overflow: auto !important; /* allow scroll on mobile if needed */
		background-color: hsl(var(--b1)) !important;
		padding: 0 !important;
		border: none !important;
		max-height: 70vh !important; /* prevent popup from exceeding viewport height on mobile */
	}

	:global(.gm-style .gm-style-iw-tc) {
		background-color: hsl(var(--b1)) !important;
		border: none !important;
	}

	:global(.gm-style .gm-style-iw-tc::after) {
		background: hsl(var(--b1)) !important;
	}

	:global(.gm-style .gm-style-iw-chr) {
		top: 4px !important;
		right: 4px !important;
	}

	:global(.gm-style .gm-style-iw-t) {
		padding: 0 !important;
		background-color: hsl(var(--b1)) !important;
		border: none !important;
	}

	/* Remove default light border/shadow that creates white margin effect */
	:global(.gm-style .gm-style-iw),
	:global(.gm-style .gm-style-iw-t) {
		box-shadow: none !important;
	}

	:global(.service-info-window) {
		background-color: hsl(var(--b1));
	}

	:global(.task-info-window) {
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	/* Desktop: fixed width range for task/service popups */
	:global(.task-info-window-task) {
		min-width: 280px;
		max-width: 320px;
	}

	:global(.task-info-window-service) {
		min-width: 260px;
		max-width: 300px;
	}

	/* Mobile: narrower popup so it never gets cut off */
	@media (max-width: 768px) {
		:global(.gm-style .gm-style-iw),
		:global(.gm-style .gm-style-iw-c),
		:global(.gm-style .gm-style-iw-d) {
			max-width: min(280px, calc(100vw - 48px)) !important;
		}

		:global(.task-info-window-task),
		:global(.task-info-window-service) {
			min-width: 0 !important;
			max-width: min(280px, calc(100vw - 48px)) !important;
			width: 100% !important;
			box-sizing: border-box !important;
		}
	}

	:global(.task-info-window .btn) {
		cursor: pointer;
		border: none;
		transition: all 0.2s;
		/* Ensure buttons are visible and touch-friendly on mobile */
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.task-info-window-compact .task-info-window-btn) {
		min-height: 24px !important;
	}

	:global(.task-info-window .btn:hover) {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	:global(.task-info-window .btn:active) {
		transform: translateY(0);
	}

	/* Mobile/Tablet: stacked, full width, touch-friendly */
	@media (max-width: 1023px) {
		:global(.task-info-window .task-info-window-buttons) {
			flex-direction: column !important;
		}

		:global(.task-info-window .task-info-window-btn) {
			width: 100% !important;
			min-height: 44px !important;
			flex: none !important;
		}

		:global(.task-info-window-compact .task-info-window-btn) {
			min-height: 24px !important;
		}
	}

	/* Desktop: horizontal row, equal width buttons filling the row */
	@media (min-width: 1024px) {
		:global(.task-info-window .task-info-window-buttons) {
			flex-direction: row !important;
			width: 100% !important;
		}

		:global(.task-info-window .task-info-window-btn) {
			width: auto !important;
			min-height: auto !important;
			flex: 1 1 0% !important; /* Equal width, filling the row */
		}
	}
</style>
