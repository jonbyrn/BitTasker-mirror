import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
const mockPreferences = {
	get: vi.fn().mockImplementation(() => Promise.resolve({ value: null })),
	set: vi.fn().mockImplementation(() => Promise.resolve()),
	remove: vi.fn().mockImplementation(() => Promise.resolve()),
	clear: vi.fn().mockImplementation(() => Promise.resolve())
};

(globalThis as unknown as Record<string, unknown>).mockPreferences = mockPreferences;

vi.mock('@capacitor/preferences', () => ({
	Preferences: mockPreferences
}));

// Also ensure Preferences is available on window for some capacitor plugins
if (typeof window !== 'undefined') {
	const win = window as unknown as Record<string, Record<string, Record<string, unknown>>>;
	win.Capacitor = win.Capacitor || {};
	win.Capacitor.Plugins = win.Capacitor.Plugins || {};
	win.Capacitor.Plugins.Preferences = mockPreferences;
}
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

// Mock @reviews-contracts for tests
vi.mock('@reviews-contracts', () => ({
	REVIEWS_SCHEMA_VERSION: 1,
	REVIEW_NOSTR_KINDS: {
		REVIEW: 1985,
		ATTESTATION: 1986,
		REPLY: 1987
	},
	REVIEW_TAG_NAMES: {
		REVIEWEE: 'p',
		REVIEW_DRAFT_HASH: 'h',
		PARENT_REVIEW: 'e'
	},
	attestationEventPayloadSchema: { parse: vi.fn((x) => x) },
	attestationRequestSchema: { parse: vi.fn((x) => x) },
	attestationResponseSchema: { parse: vi.fn((x) => x) },
	issuerRegistryResponseSchema: { parse: vi.fn((x) => x) },
	reviewErrorResponseSchema: { parse: vi.fn((x) => x) },
	reviewEventPayloadSchema: { parse: vi.fn((x) => x) },
	reviewReplyCandidateSchema: { parse: vi.fn((x) => x) },
	reviewReplyEventPayloadSchema: { parse: vi.fn((x) => x) },
	isReplyAuthorAllowed: vi.fn(() => true),
	selectCanonicalReviewReply: vi.fn((replies) => replies[0]),
	computeReviewDraftHashFromPayload: vi.fn(() => 'mock-hash'),
	computeReviewDraftHash: vi.fn(() => 'mock-hash')
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
