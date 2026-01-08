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

vi.mock('@capacitor/haptics', () => ({
	Haptics: {
		impact: vi.fn().mockResolvedValue(undefined)
	},
	ImpactStyle: {
		Light: 'light',
		Medium: 'medium',
		Heavy: 'heavy'
	}
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: vi.fn(() => false),
		getPlatform: vi.fn(() => 'web')
	}
}));

// Mock Web Animations API (not available in jsdom)
if (typeof window !== 'undefined' && !window.Element.prototype.animate) {
	window.Element.prototype.animate = vi.fn(() => ({
		finished: Promise.resolve(),
		cancel: vi.fn(),
		pause: vi.fn(),
		play: vi.fn(),
		reverse: vi.fn(),
		updatePlaybackRate: vi.fn()
	}));
}

// Mock MediaStreamTrack (required for QR scanner tests)
if (typeof global !== 'undefined') {
	global.MediaStreamTrack = class MediaStreamTrack {
		stop() {}
		kind = 'video';
		id = 'mock-track-id';
		label = 'Mock Camera Track';
		enabled = true;
		readyState = 'live' as MediaStreamTrackState;
	} as any;

	// Mock crypto.getRandomValues if not already available
	if (!global.crypto || !global.crypto.getRandomValues) {
		Object.defineProperty(global, 'crypto', {
			value: {
				getRandomValues: vi.fn((arr: Uint8Array) => {
					for (let i = 0; i < arr.length; i++) {
						arr[i] = Math.floor(Math.random() * 256);
					}
					return arr;
				})
			},
			writable: true,
			configurable: true,
			enumerable: true
		});
	}
}

// Mock localStorage (required for some tests)
if (typeof window !== 'undefined') {
	const localStorageMock = {
		getItem: vi.fn((key: string) => {
			return null;
		}),
		setItem: vi.fn((key: string, value: string) => {}),
		removeItem: vi.fn((key: string) => {}),
		clear: vi.fn(),
		length: 0,
		key: vi.fn((index: number) => null)
	};
	
	Object.defineProperty(window, 'localStorage', {
		value: localStorageMock,
		writable: true
	});
}

// Mock icon components globally to avoid hoisting issues
// Use vi.hoisted to create the mock component function
const createMockIcon = vi.hoisted(() => () => 'svg');

// Common icons used across components
vi.mock('~icons/mdi/close', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/send', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/check', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/content-copy', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/download', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/upload', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/cash-multiple', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/swap-horizontal', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/format-list-bulleted', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/help-circle', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/refresh', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/eye', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/eye-off', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/chevron-right', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/chevron-down', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/chevron-up', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/arrow-up-bold', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/arrow-down-bold', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/file-document-outline', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/check-circle', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/clock-outline', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/close-circle', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/check-all', () => ({ default: createMockIcon }));
