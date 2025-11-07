/**
 * Staleness handling utilities for availability data and requests
 */

import type { AvailabilityResponse, AvailabilityUpdate } from '$lib/types/scheduling';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';

export interface StalenessConfig {
	maxAgeMinutes: number; // Maximum age before data is considered stale (default: 30 minutes)
	warningAgeMinutes: number; // Age at which to show warning (default: 15 minutes)
	autoRefreshAgeMinutes?: number; // Age at which to auto-refresh (optional)
}

export interface StalenessResult {
	isStale: boolean;
	isWarning: boolean;
	ageMinutes: number;
	ageMs: number;
	shouldRefresh: boolean;
	message?: string;
}

const DEFAULT_CONFIG: Required<StalenessConfig> = {
	maxAgeMinutes: 30,
	warningAgeMinutes: 15,
	autoRefreshAgeMinutes: 25
};

/**
 * Check if availability data is stale
 */
export function checkAvailabilityStaleness(
	availability: AvailabilityResponse | AvailabilityUpdate,
	config: Partial<StalenessConfig> = {},
	currentTime: number = Date.now()
): StalenessResult {
	const opts = { ...DEFAULT_CONFIG, ...config };
	const ageMs = currentTime - availability.timestamp;
	const ageMinutes = ageMs / (60 * 1000);

	const isStale = ageMinutes > opts.maxAgeMinutes;
	const isWarning = ageMinutes > opts.warningAgeMinutes && !isStale;
	const shouldRefresh = opts.autoRefreshAgeMinutes
		? ageMinutes > opts.autoRefreshAgeMinutes
		: isStale;

	let message: string | undefined;
	if (isStale) {
		message = `Availability data is stale (${Math.round(ageMinutes)} minutes old). Please request fresh data.`;
	} else if (isWarning) {
		message = `Availability data is ${Math.round(ageMinutes)} minutes old. Consider refreshing.`;
	}

	return {
		isStale,
		isWarning,
		ageMinutes,
		ageMs,
		shouldRefresh,
		message
	};
}

/**
 * Check if a request's availability data is stale
 */
export function checkRequestAvailabilityStaleness(
	request: RequestQueueItem,
	config: Partial<StalenessConfig> = {}
): StalenessResult | null {
	// Check if request has associated availability data
	// For now, we'll check the request timestamp as a proxy
	// In a full implementation, availability data would be stored with the request

	const requestAgeMs = Date.now() - request.createdAt;
	const requestAgeMinutes = requestAgeMs / (60 * 1000);

	// If request is very old, availability might be stale
	if (requestAgeMinutes > (config.maxAgeMinutes || DEFAULT_CONFIG.maxAgeMinutes)) {
		return {
			isStale: true,
			isWarning: false,
			ageMinutes: requestAgeMinutes,
			ageMs: requestAgeMs,
			shouldRefresh: true,
			message: `Request is ${Math.round(requestAgeMinutes)} minutes old. Availability may be stale.`
		};
	}

	return null;
}

/**
 * Validate availability timestamp for staleness
 */
export function validateAvailabilityTimestamp(
	timestamp: number,
	config: Partial<StalenessConfig> = {},
	currentTime: number = Date.now()
): { isValid: boolean; isStale: boolean; ageMinutes: number; error?: string } {
	const opts = { ...DEFAULT_CONFIG, ...config };
	const ageMs = currentTime - timestamp;
	const ageMinutes = ageMs / (60 * 1000);

	if (timestamp <= 0) {
		return {
			isValid: false,
			isStale: true,
			ageMinutes: 0,
			error: 'Invalid timestamp'
		};
	}

	if (timestamp > currentTime) {
		return {
			isValid: false,
			isStale: false,
			ageMinutes: 0,
			error: 'Timestamp is in the future'
		};
	}

	const isStale = ageMinutes > opts.maxAgeMinutes;

	return {
		isValid: !isStale,
		isStale,
		ageMinutes,
		error: isStale ? `Availability data is stale (${Math.round(ageMinutes)} minutes old)` : undefined
	};
}

/**
 * Get staleness badge info for UI display
 */
export function getStalenessBadge(
	result: StalenessResult
): { label: string; color: string; icon: string } | null {
	if (result.isStale) {
		return {
			label: 'Stale',
			color: 'error',
			icon: '⚠️'
		};
	} else if (result.isWarning) {
		return {
			label: 'Aging',
			color: 'warning',
			icon: '⏰'
		};
	}

	return null;
}

/**
 * Check if availability data should be refreshed based on staleness
 */
export function shouldRefreshAvailability(
	availability: AvailabilityResponse | AvailabilityUpdate,
	config: Partial<StalenessConfig> = {}
): boolean {
	const staleness = checkAvailabilityStaleness(availability, config);
	return staleness.shouldRefresh;
}

/**
 * Filter out stale availability data
 */
export function filterStaleAvailability(
	availabilityList: Array<AvailabilityResponse | AvailabilityUpdate>,
	config: Partial<StalenessConfig> = {}
): Array<AvailabilityResponse | AvailabilityUpdate> {
	return availabilityList.filter((avail) => {
		const staleness = checkAvailabilityStaleness(avail, config);
		return !staleness.isStale;
	});
}

/**
 * Sort availability data by staleness (freshest first)
 */
export function sortByStaleness<T extends { timestamp: number }>(
	data: T[],
	ascending: boolean = true
): T[] {
	return [...data].sort((a, b) => {
		const ageA = Date.now() - a.timestamp;
		const ageB = Date.now() - b.timestamp;
		return ascending ? ageA - ageB : ageB - ageA;
	});
}

/**
 * Get the freshest availability data from a list
 */
export function getFreshestAvailability(
	availabilityList: Array<AvailabilityResponse | AvailabilityUpdate>
): AvailabilityResponse | AvailabilityUpdate | null {
	if (availabilityList.length === 0) return null;

	return availabilityList.reduce((freshest, current) => {
		return current.timestamp > freshest.timestamp ? current : freshest;
	});
}

