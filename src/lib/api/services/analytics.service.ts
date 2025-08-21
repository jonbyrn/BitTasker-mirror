/**
 * Analytics Service
 * 
 * Handles Firebase Analytics and Google Analytics 4 integration.
 * Respects user cookie consent and provides unified event tracking.
 * Works on both web and native platforms via Capacitor.
 */

import { Capacitor } from '@capacitor/core';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { analyticsStore, isAnalyticsEnabled } from '$lib/stores/analytics.store';
import { getFirebaseWebConfig } from '$lib/utils/helpers/fcm';

// Types for Analytics Events
export interface AnalyticsEvent {
	name: string;
	parameters?: Record<string, any>;
}

export interface UserProperties {
	user_id?: string;
	custom_user_id?: string;
	[key: string]: any;
}

// Platform-specific Analytics instances
let firebaseAnalytics: any = null;
let gtag: any = null;

class AnalyticsService {
	private isInitialized = false;
	private pendingEvents: AnalyticsEvent[] = [];
	private userProperties: UserProperties = {};

	constructor() {
		// Listen for consent changes
		analyticsStore.subscribe((state) => {
			if (state.consentGiven && state.preferences.analytics && !this.isInitialized) {
				this.init().catch(console.error);
			} else if (!state.preferences.analytics && this.isInitialized) {
				this.disable();
			}
		});
	}

	/**
	 * Initialize Analytics based on platform and user consent
	 */
	public async init(): Promise<void> {
		if (!browser) return;
		
		// Check consent first
		if (!get(isAnalyticsEnabled)) {
			console.log('Analytics init skipped - no consent');
			return;
		}

		if (this.isInitialized) {
			console.log('Analytics already initialized');
			return;
		}

		try {
			if (Capacitor.isNativePlatform()) {
				await this.initNativeAnalytics();
			} else {
				await this.initWebAnalytics();
			}

			this.isInitialized = true;
			
			// Process any pending events
			this.processPendingEvents();
			
			console.log('Analytics initialized successfully');
		} catch (error) {
			console.error('Failed to initialize Analytics:', error);
		}
	}

	/**
	 * Initialize Firebase Analytics for native platforms
	 */
	private async initNativeAnalytics(): Promise<void> {
		try {
			// For Capacitor, Firebase Analytics is typically configured in native code
			// We'll use the web SDK to maintain consistency
			await this.initWebAnalytics();
		} catch (error) {
			console.error('Native Analytics initialization failed:', error);
			throw error;
		}
	}

	/**
	 * Initialize Firebase Analytics and GA4 for web
	 */
	private async initWebAnalytics(): Promise<void> {
		try {
			const firebaseConfig = getFirebaseWebConfig();

			if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
				throw new Error('Firebase configuration incomplete');
			}

			// Initialize Firebase App (reuse if already initialized)
			const { initializeApp, getApps } = await import('firebase/app');
			const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

			// Initialize Analytics
			const { getAnalytics, isSupported } = await import('firebase/analytics');
			
			const supported = await isSupported();
			if (!supported) {
				console.warn('Firebase Analytics not supported in this environment');
				return;
			}

			firebaseAnalytics = getAnalytics(app);

			// Initialize gtag for GA4 (Firebase Analytics uses gtag under the hood)
			await this.initGtag(firebaseConfig);

			console.log('Web Analytics (Firebase + GA4) initialized');
		} catch (error) {
			console.error('Web Analytics initialization failed:', error);
			throw error;
		}
	}

	/**
	 * Initialize gtag for enhanced GA4 features
	 */
	private async initGtag(config: any): Promise<void> {
		if (typeof window === 'undefined') return;

		// Load gtag script if not already present
		if (!window.gtag) {
			const script = document.createElement('script');
			script.async = true;
			script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId || config.appId}`;
			document.head.appendChild(script);

			// Initialize gtag
			window.dataLayer = window.dataLayer || [];
			window.gtag = function() {
				window.dataLayer.push(arguments);
			};
			
			window.gtag('js', new Date());
			window.gtag('config', config.measurementId || config.appId, {
				app_name: 'BitTasker',
				app_version: __APP_VERSION__,
				custom_map: {
					'custom_user_id': 'user_id'
				}
			});

			gtag = window.gtag;
		}
	}

	/**
	 * Track custom event
	 */
	public trackEvent(eventName: string, parameters: Record<string, any> = {}): void {
		const event: AnalyticsEvent = {
			name: eventName,
			parameters: {
				...parameters,
				timestamp: Date.now(),
				platform: Capacitor.getPlatform(),
				app_version: __APP_VERSION__
			}
		};

		if (!get(isAnalyticsEnabled)) {
			console.log('Event queued (no consent):', event);
			this.pendingEvents.push(event);
			return;
		}

		if (!this.isInitialized) {
			console.log('Event queued (not initialized):', event);
			this.pendingEvents.push(event);
			return;
		}

		this.sendEvent(event);
	}

	/**
	 * Send event to Analytics platforms
	 */
	private sendEvent(event: AnalyticsEvent): void {
		try {
			// Firebase Analytics
			if (firebaseAnalytics) {
				import('firebase/analytics').then(({ logEvent }) => {
					logEvent(firebaseAnalytics, event.name, event.parameters);
				});
			}

			// GA4 via gtag (if available)
			if (gtag) {
				gtag('event', event.name, event.parameters);
			}

			console.log('Event tracked:', event.name, event.parameters);
		} catch (error) {
			console.error('Failed to send event:', error);
		}
	}

	/**
	 * Set user properties
	 */
	public setUserProperties(properties: UserProperties): void {
		this.userProperties = { ...this.userProperties, ...properties };

		if (!get(isAnalyticsEnabled) || !this.isInitialized) {
			return;
		}

		try {
			// Firebase Analytics
			if (firebaseAnalytics) {
				import('firebase/analytics').then(({ setUserProperties }) => {
					setUserProperties(firebaseAnalytics, properties);
				});
			}

			// GA4 via gtag
			if (gtag) {
				gtag('config', getFirebaseWebConfig().measurementId || getFirebaseWebConfig().appId, {
					custom_map: properties
				});
			}

			console.log('User properties set:', properties);
		} catch (error) {
			console.error('Failed to set user properties:', error);
		}
	}

	/**
	 * Set user ID for tracking across sessions
	 */
	public setUserId(userId: string): void {
		this.setUserProperties({ user_id: userId, custom_user_id: userId });
	}

	/**
	 * Track page view
	 */
	public trackPageView(page: string, title?: string): void {
		this.trackEvent('page_view', {
			page_location: window.location.href,
			page_path: page,
			page_title: title || document.title
		});
	}

	/**
	 * Process pending events when Analytics becomes available
	 */
	private processPendingEvents(): void {
		if (this.pendingEvents.length > 0) {
			console.log(`Processing ${this.pendingEvents.length} pending events`);
			
			this.pendingEvents.forEach(event => {
				this.sendEvent(event);
			});

			this.pendingEvents = [];
		}

		// Set pending user properties
		if (Object.keys(this.userProperties).length > 0) {
			this.setUserProperties(this.userProperties);
		}
	}

	/**
	 * Disable Analytics (when consent is revoked)
	 */
	public disable(): void {
		try {
			// Disable Firebase Analytics
			if (firebaseAnalytics && typeof window !== 'undefined') {
				// Firebase Analytics doesn't have a direct disable method
				// but we can stop sending events
				firebaseAnalytics = null;
			}

			// Disable gtag
			if (gtag && typeof window !== 'undefined') {
				gtag('config', getFirebaseWebConfig().measurementId || getFirebaseWebConfig().appId, {
					send_page_view: false
				});
				gtag = null;
			}

			this.isInitialized = false;
			this.pendingEvents = [];

			console.log('Analytics disabled');
		} catch (error) {
			console.error('Failed to disable Analytics:', error);
		}
	}

	/**
	 * Get Analytics status for debugging
	 */
	public getStatus() {
		return {
			initialized: this.isInitialized,
			consentGiven: get(isAnalyticsEnabled),
			platform: Capacitor.getPlatform(),
			pendingEvents: this.pendingEvents.length,
			userProperties: Object.keys(this.userProperties).length,
			firebaseReady: !!firebaseAnalytics,
			gtagReady: !!gtag
		};
	}

	// Convenience methods for common events
	public trackUserSignup(method?: string): void {
		this.trackEvent('sign_up', { method: method || 'email' });
	}

	public trackUserLogin(method?: string): void {
		this.trackEvent('login', { method: method || 'email' });
	}

	public trackTaskCreated(category?: string, budget?: number): void {
		this.trackEvent('task_created', {
			category: category || 'unknown',
			value: budget,
			currency: 'USD'
		});
	}

	public trackBidPlaced(taskId?: string, amount?: number): void {
		this.trackEvent('bid_placed', {
			item_id: taskId,
			value: amount,
			currency: 'USD'
		});
	}

	public trackPaymentCompleted(amount: number, method?: string): void {
		this.trackEvent('purchase', {
			value: amount,
			currency: 'USD',
			payment_method: method || 'bitcoin'
		});
	}

	public trackSearch(searchTerm: string, results?: number): void {
		this.trackEvent('search', {
			search_term: searchTerm,
			results_count: results
		});
	}
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Make available for debugging in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
	(window as any).analyticsService = analyticsService;
}

// Export types
export type { AnalyticsEvent, UserProperties };