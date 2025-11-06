import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Set up browser environment
Object.defineProperty(globalThis, 'window', {
	value: globalThis,
	writable: true
});

// Ensure we're in browser mode, not SSR mode
if (typeof process !== 'undefined') {
	process.env.BROWSER = 'true';
}

// Mock browser APIs that jsdom might not fully support
if (typeof window !== 'undefined') {
	// required for svelte5 + jsdom as jsdom does not support matchMedia
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		enumerable: true,
		value: vi.fn().mockImplementation((query) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn()
		}))
	});

	// Ensure document is available
	if (typeof document === 'undefined') {
		// This shouldn't happen with jsdom, but just in case
		globalThis.document = window.document;
	}
}

// Mock SvelteKit's $app/environment to indicate browser mode
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false,
	version: '0.0.1'
}));

// Force Svelte to use client-side compiler
// This prevents SSR mode in tests
if (typeof process !== 'undefined') {
	process.env.VITEST = 'true';
}

// Ensure we're importing from the browser bundle, not server bundle
// This is handled by vite's resolve configuration, but we can verify here

// Mock Capacitor plugins that might be used in tests
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn(),
		clear: vi.fn()
	}
}));

// Mock other Capacitor plugins
vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: vi.fn(() => false),
		getPlatform: vi.fn(() => 'web')
	}
}));
