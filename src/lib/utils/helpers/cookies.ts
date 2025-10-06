/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cookie utility functions for client-side cookie management
 * Uses document.cookie for web and Capacitor Preferences for mobile
 */

import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';

/**
 * Set a cookie with the given name, value, and options
 * @param name Cookie name
 * @param value Cookie value
 * @param options Cookie options
 */
export async function setCookie(
	name: string,
	value: string,
	options: {
		expires?: Date;
		maxAge?: number;
		path?: string;
		domain?: string;
		secure?: boolean;
		sameSite?: 'strict' | 'lax' | 'none';
		httpOnly?: boolean;
	} = {}
): Promise<void> {
	if (!browser) return;

	const {
		expires,
		maxAge,
		path = '/',
		domain,
		secure = true,
		sameSite = 'lax',
		httpOnly = false
	} = options;

	// For mobile apps, use Capacitor Preferences
	if ((window as any).Capacitor?.isNativePlatform()) {
		await Preferences.set({
			key: `cookie_${name}`,
			value: JSON.stringify({ value, options })
		});
		return;
	}

	// For web, use document.cookie
	let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

	if (expires) {
		cookieString += `; expires=${expires.toUTCString()}`;
	}

	if (maxAge !== undefined) {
		cookieString += `; max-age=${maxAge}`;
	}

	if (path) {
		cookieString += `; path=${path}`;
	}

	if (domain) {
		cookieString += `; domain=${domain}`;
	}

	if (secure) {
		cookieString += `; secure`;
	}

	if (sameSite) {
		cookieString += `; samesite=${sameSite}`;
	}

	if (httpOnly) {
		cookieString += `; httponly`;
	}

	document.cookie = cookieString;
}

/**
 * Get a cookie value by name
 * @param name Cookie name
 * @returns Cookie value or null if not found
 */
export async function getCookie(name: string): Promise<string | null> {
	if (!browser) return null;

	// For mobile apps, use Capacitor Preferences
	if ((window as any).Capacitor?.isNativePlatform()) {
		try {
			const { value } = await Preferences.get({ key: `cookie_${name}` });
			if (value) {
				const parsed = JSON.parse(value);
				return parsed.value;
			}
		} catch (error) {
			console.error('Error getting cookie from Preferences:', error);
		}
		return null;
	}

	// For web, use document.cookie
	const nameEQ = `${encodeURIComponent(name)}=`;
	const cookies = document.cookie.split(';');

	for (let cookie of cookies) {
		cookie = cookie.trim();
		if (cookie.indexOf(nameEQ) === 0) {
			return decodeURIComponent(cookie.substring(nameEQ.length));
		}
	}

	return null;
}

/**
 * Delete a cookie by name
 * @param name Cookie name
 * @param path Cookie path (must match the path used when setting)
 */
export async function deleteCookie(name: string, path: string = '/'): Promise<void> {
	if (!browser) return;

	// For mobile apps, use Capacitor Preferences
	if ((window as any).Capacitor?.isNativePlatform()) {
		await Preferences.remove({ key: `cookie_${name}` });
		return;
	}

	// For web, set expiration date in the past
	document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
}

/**
 * Check if a cookie exists
 * @param name Cookie name
 * @returns True if cookie exists, false otherwise
 */
export async function hasCookie(name: string): Promise<boolean> {
	const value = await getCookie(name);
	return value !== null;
}
