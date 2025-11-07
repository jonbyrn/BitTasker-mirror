import { requestQueueStore } from '$lib/stores/request-queue.store';
import { isRequestExpired, getRemainingTime } from '$lib/utils/scheduling-utils';

/**
 * Request expiry management utilities
 */

let expiryCheckInterval: number | null = null;
const EXPIRY_CHECK_INTERVAL_MS = 60000; // Check every minute

/**
 * Start automatic expiry checking
 */
export function startExpiryChecking(): void {
	if (expiryCheckInterval !== null) {
		return; // Already running
	}

	// Check if we're in a browser environment
	if (typeof window === 'undefined') {
		return;
	}

	expiryCheckInterval = window.setInterval(() => {
		requestQueueStore.updateExpiredStatus();
	}, EXPIRY_CHECK_INTERVAL_MS);
}

/**
 * Stop automatic expiry checking
 */
export function stopExpiryChecking(): void {
	if (expiryCheckInterval !== null) {
		clearInterval(expiryCheckInterval);
		expiryCheckInterval = null;
	}
}

/**
 * Get expiry status for a request
 */
export function getExpiryStatus(expiresAt: number): {
	isExpired: boolean;
	remainingMs: number;
	remainingMinutes: number;
	remainingSeconds: number;
	expiresSoon: boolean; // Less than 5 minutes
} {
	const now = Date.now();
	const isExpired = isRequestExpired(expiresAt, now);
	const remainingMs = getRemainingTime(expiresAt, now);
	const remainingMinutes = Math.floor(remainingMs / (60 * 1000));
	const remainingSeconds = Math.floor((remainingMs % (60 * 1000)) / 1000);
	const expiresSoon = remainingMs < 5 * 60 * 1000 && !isExpired;

	return {
		isExpired,
		remainingMs,
		remainingMinutes,
		remainingSeconds,
		expiresSoon
	};
}

/**
 * Format remaining time as human-readable string
 */
export function formatRemainingTime(expiresAt: number): string {
	const status = getExpiryStatus(expiresAt);

	if (status.isExpired) {
		return 'Expired';
	}

	// Show seconds only if less than 1 minute
	if (status.remainingMinutes < 1) {
		return `${status.remainingSeconds}s`;
	}

	// Show minutes only if less than 1 hour
	if (status.remainingMinutes < 60) {
		return `${status.remainingMinutes}m`;
	}

	// Show hours and minutes
	const hours = Math.floor(status.remainingMinutes / 60);
	const minutes = status.remainingMinutes % 60;
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Check if request should be extended (e.g., when escrow funding starts)
 */
export function shouldExtendExpiry(
	currentExpiresAt: number,
	extensionMinutes: number = 15
): boolean {
	const status = getExpiryStatus(currentExpiresAt);
	// Extend if less than 5 minutes remaining and not expired
	return status.expiresSoon && !status.isExpired;
}

/**
 * Calculate new expiry time with extension
 */
export function extendExpiry(
	currentExpiresAt: number,
	extensionMinutes: number = 15
): number {
	const now = Date.now();
	// If already expired, extend from now
	const baseTime = currentExpiresAt > now ? currentExpiresAt : now;
	return baseTime + extensionMinutes * 60 * 1000;
}

