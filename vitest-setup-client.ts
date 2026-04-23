import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { readable } from 'svelte/store';

declare module 'vitest' {
	interface Expect<T> {
		toBeInTheDocument(): T;
		toHaveAttribute(attr: string, value?: string): T;
		toHaveTextContent(text: string | RegExp): T;
		toHaveValue(value: string | number): T;
		toBeDisabled(): T;
		toHaveClass(...classes: string[]): T;
		toBeVisible(): T;
		toBeHidden(): T;
		toBeEmptyDOMElement(): T;
		toBeInTheDOM(): T;
		toHaveFormValues(expectedValues: Record<string, string | number | boolean>): T;
		toHaveStyle(css: string | Record<string, string>): T;
		toHaveFocus(): T;
		toHaveAccessibleDescription(description: string | RegExp): T;
		toHaveAccessibleName(name: string | RegExp): T;
		toHaveAttribute(attr: string, value?: string | RegExp): T;
		toContainHTML(html: string): T;
		toThrowErrorMatchingInlineSnapshot(snapshot?: string): T;
	}
}

// Mock $app/stores with a default page store
vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/'),
		params: {},
		data: {},
		form: undefined,
		state: {},
		formError: undefined
	})
}));

// Mock $app/navigation
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	preloadData: vi.fn(),
	preloadRoute: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn(),
	disableScrollHandling: vi.fn()
}));

// Mock @bittasker/wallet-core to avoid EventBus import failure in test env
// (wallet-core dist/index.js imports ./core/EventBus which may not resolve)
// Individual tests can override with their own vi.mock if needed
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr ?? ''),
	FEE_TIERS: { 1: { percentage: 250 }, 2: { percentage: 200 }, 3: { percentage: 150 } },
	RSK_NETWORKS: {},
	getRSKConfig: vi.fn(),
	getBSCConfig: vi.fn(),
	ERC20_ABI: [],
	getUSDTToken: vi.fn(),
	getSwapAddress: vi.fn(),
	weiToSatoshi: vi.fn((wei: bigint) => wei / BigInt(1e10)),
	EventBus: { on: vi.fn(), emit: vi.fn(), off: vi.fn() },
	WalletManager: vi.fn()
}));

// required for svelte5 + jsdom as jsdom does not support matchMedia
if (typeof window !== 'undefined') {
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
}

// Mock Capacitor plugins that might be used in tests
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn().mockResolvedValue(undefined)
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
	})) as unknown as typeof window.Element.prototype.animate;
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
	} as unknown as typeof MediaStreamTrack;

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
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn(),
		clear: vi.fn(),
		length: 0,
		key: vi.fn(() => null)
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
