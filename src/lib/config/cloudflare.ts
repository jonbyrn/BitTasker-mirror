/**
 * Cloudflare Media Configuration
 * Initializes Cloudflare services with environment variables
 */

import cloudflareMediaService from '$lib/api/services/cloudflare-media.service';
import { browser } from '$app/environment';

// Configuration interface
export interface CloudflareConfig {
	accountId: string;
	apiToken: string;
	imageDeliveryHash: string;
	imagesEnabled: boolean;
	streamEnabled: boolean;
}

// Default configuration
const defaultConfig: Partial<CloudflareConfig> = {
	imagesEnabled: true,
	streamEnabled: true
};

/**
 * Get Cloudflare configuration from environment variables
 * Note: In SvelteKit, only variables prefixed with VITE_ are available on the client side
 * For server-side operations, we can access all environment variables
 */
export function getCloudflareConfig(): CloudflareConfig | null {
	let config: Partial<CloudflareConfig> = { ...defaultConfig };

	if (browser) {
		// Client-side: Only VITE_ prefixed variables are available
		// These would need to be set as VITE_ prefixed for client access
		config.accountId = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID || '';
		config.apiToken = import.meta.env.VITE_CLOUDFLARE_API_TOKEN || '';
		config.imageDeliveryHash = import.meta.env.VITE_CLOUDFLARE_IMAGE_DELIVERY_HASH || '';
		config.imagesEnabled = import.meta.env.VITE_CLOUDFLARE_IMAGES_ENABLED !== 'false';
		config.streamEnabled = import.meta.env.VITE_CLOUDFLARE_STREAM_ENABLED !== 'false';
	} else {
		// Server-side: Access environment variables directly
		config.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
		config.apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
		config.imageDeliveryHash = process.env.CLOUDFLARE_IMAGE_DELIVERY_HASH || '';
		config.imagesEnabled = process.env.CLOUDFLARE_IMAGES_ENABLED !== 'false';
		config.streamEnabled = process.env.CLOUDFLARE_STREAM_ENABLED !== 'false';
	}

	// Validate required fields
	if (!config.accountId || !config.apiToken) {
		console.warn('Cloudflare credentials not configured. Media uploads will fall back to default storage.');
		return null;
	}

	if (!config.imageDeliveryHash && config.imagesEnabled) {
		console.warn('Cloudflare Image delivery hash not configured. Image optimization will be limited.');
	}

	return config as CloudflareConfig;
}

/**
 * Initialize Cloudflare media service with configuration
 */
export function initializeCloudflareServices(): boolean {
	const config = getCloudflareConfig();
	
	if (!config) {
		return false;
	}

	try {
		cloudflareMediaService.configure({
			accountId: config.accountId,
			apiToken: config.apiToken,
			imageDeliveryHash: config.imageDeliveryHash
		});

		console.log('Cloudflare media services initialized successfully');
		return true;
	} catch (error) {
		console.error('Failed to initialize Cloudflare media services:', error);
		return false;
	}
}

/**
 * Check if Cloudflare services are available and configured
 */
export function isCloudflareAvailable(): boolean {
	return cloudflareMediaService.isConfigured();
}

/**
 * Get image processing settings from environment
 */
export function getImageProcessingSettings() {
	const quality = browser 
		? parseInt(import.meta.env.VITE_DEFAULT_IMAGE_QUALITY || '80')
		: parseInt(process.env.DEFAULT_IMAGE_QUALITY || '80');
		
	const maxDimension = browser
		? parseInt(import.meta.env.VITE_MAX_IMAGE_DIMENSION || '3840')
		: parseInt(process.env.MAX_IMAGE_DIMENSION || '3840');
		
	const maxSizeMB = browser
		? parseInt(import.meta.env.VITE_MAX_IMAGE_SIZE_MB || '2')
		: parseInt(process.env.MAX_IMAGE_SIZE_MB || '2');
		
	const maxVideoSizeMB = browser
		? parseInt(import.meta.env.VITE_MAX_VIDEO_SIZE_MB || '200')
		: parseInt(process.env.MAX_VIDEO_SIZE_MB || '200');

	return {
		quality: Math.min(Math.max(quality, 10), 100), // Clamp between 10-100
		maxDimension: Math.max(maxDimension, 512), // Minimum 512px
		maxSizeMB: Math.max(maxSizeMB, 0.5), // Minimum 0.5MB
		maxVideoSizeMB: Math.max(maxVideoSizeMB, 10) // Minimum 10MB
	};
}

// Initialize services when this module is imported
if (typeof window !== 'undefined') {
	// Client-side initialization
	setTimeout(() => {
		initializeCloudflareServices();
	}, 0);
} else {
	// Server-side initialization
	initializeCloudflareServices();
}