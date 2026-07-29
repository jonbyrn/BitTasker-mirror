import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { readable } from 'svelte/store';
import { addMessages, init } from 'svelte-i18n';

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

// Mock auth store — avoids pulling in NDK, session, deep-link, and other heavy dependencies.
// Tests that need specific auth state can override with their own vi.mock.
vi.mock('$lib/stores/auth.store', () => {
	const { writable } = require('svelte/store');
	const store = writable({ isAuthenticated: true, isLoading: false, error: null });
	return {
		authState: {
			subscribe: store.subscribe,
			set: store.set,
			login: vi.fn(async () => {
				store.update((s: Record<string, unknown>) => ({ ...s, isAuthenticated: true }));
			}),
			logout: vi.fn(async () => {
				store.set({ isAuthenticated: false, isLoading: false, error: null });
			}),
			setLoading: vi.fn(),
			setError: vi.fn(),
			setupAuthData: vi.fn()
		},
		isCaptchaVerified: writable(false)
	};
});

// @bittasker/reviews-contracts dist uses extensionless ESM re-exports that fail in Vitest's resolver
vi.mock('@bittasker/reviews-contracts', () => {
	const ONCHAIN_STATE_MAP: Record<number, string> = {
		0: 'funded',
		1: 'in_dispute',
		2: 'dispute_resolved',
		3: 'dispute_unresolved',
		4: 'completed',
		5: 'cancelled',
		6: 'refunded',
		7: 'funds_released',
		8: 'funds_claimed',
		9: 'no_show',
		10: 'work_in_progress',
		11: 'in_dispute_wip'
	};

	function deriveContractOutcomeFromBlockchainState(state: string) {
		switch (state) {
			case 'funds_released':
			case 'funds_claimed':
			case 'completed':
				return 'completed';
			case 'dispute_resolved':
				return 'disputed_resolved_payout';
			case 'dispute_unresolved':
			case 'refunded':
				return 'refunded';
			default:
				return 'completed';
		}
	}

	return {
		deriveContractOutcomeFromOnchainState: (onchainState: number) => {
			const mapped = ONCHAIN_STATE_MAP[onchainState];
			if (!mapped) return null;
			return deriveContractOutcomeFromBlockchainState(mapped);
		},
		computeReviewDraftHash: vi.fn(async () => 'mock-draft-hash'),
		reviewEventPayloadSchema: { parse: vi.fn((payload: unknown) => payload) }
	};
});

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
	WalletManager: vi.fn(),
	ARB_TOKEN_ADDRESSES: {
		USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
	}
}));

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

if (typeof process !== 'undefined') {
	process.env.VITEST = 'true';
}

// Ensure we're importing from the browser bundle, not server bundle
// This is handled by vite's resolve configuration, but we can verify here

// Mock Capacitor plugins that might be used in tests
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn().mockResolvedValue(undefined),
		keys: vi.fn().mockResolvedValue({ keys: [] })
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

// Mock other Capacitor plugins
vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: vi.fn(() => false),
		getPlatform: vi.fn(() => 'web')
	}
}));

addMessages('en', {
	common: {
		cancel: 'Cancel'
	},
	reviews: {
		form: {
			title: 'Write a Review',
			overall_rating: 'Overall Rating',
			work_quality: 'Work Quality',
			experience: 'Experience',
			delivery_speed: 'Delivery Speed',
			communication: 'Communication',
			clarity: 'Clarity',
			payment_timeliness: 'Payment Timeliness',
			quality: 'Quality',
			professionalism: 'Professionalism',
			timeliness: 'Timeliness',
			comment: 'Comment (Optional)',
			comment_placeholder: 'Share your experience...',
			submit: 'Submit Review',
			submitting: 'Submitting...',
			success: 'Review submitted successfully!',
			already_reviewed:
				'You have already reviewed this escrow. You can update your review by submitting a new one.',
			role_unknown: 'Unable to determine role. Please ensure contract information is available.',
			errors: {
				overall_rating_required: 'Please provide an overall rating',
				work_quality_required: 'Please rate the work quality',
				experience_required: 'Please rate the experience',
				delivery_speed_required: 'Please rate the delivery speed',
				communication_required: 'Please rate the communication',
				clarity_required: 'Please rate the clarity',
				payment_timeliness_required: 'Please rate the payment timeliness',
				category_rating_required: 'Please rate all categories',
				comment_too_long: 'Comment cannot exceed 1000 characters',
				submit_failed: 'Unable to submit review. Please try again.'
			}
		},
		verified: 'Verified',
		unverified: 'Unverified',
		reply: 'Reply'
	}
});

init({
	fallbackLocale: 'en',
	initialLocale: 'en'
});

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

// Mock MediaStream + MediaStreamTrack (required for QR scanner teardown in jsdom)
if (typeof global !== 'undefined') {
	global.MediaStream = class MediaStream {
		getTracks() {
			return [];
		}
		addTrack() {}
		removeTrack() {}
	} as unknown as typeof MediaStream;

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

// Suppress console.error and console.warn globally to reduce noise from intentional error-path tests.
// Tests that need to verify console output can override with vi.spyOn(console, 'error') in their own scope.
const _originalError = console.error;
const _originalWarn = console.warn;
console.error = (...args: unknown[]) => {
	const msg = String(args[0] ?? '');
	if (
		msg.includes('[BalanceHistoryService]') ||
		msg.includes('[FindServices]') ||
		msg.includes('[processTransactions]') ||
		msg.includes('[DebugWalletSendForm]') ||
		msg.includes('[UserInfoDisplay]') ||
		msg.includes('[muteList]') ||
		msg.includes('[WALLET-STORE]') ||
		msg.includes('Failed to load') ||
		msg.includes('Failed to fetch') ||
		msg.includes('Failed to decode') ||
		msg.includes('Failed to copy') ||
		msg.includes('Failed to delete') ||
		msg.includes('Failed to update') ||
		msg.includes('Failed to generate') ||
		msg.includes('Failed to decrypt') ||
		msg.includes('Failed to create') ||
		msg.includes('Failed to read') ||
		msg.includes('Failed to send') ||
		msg.includes('Error clearing') ||
		msg.includes('Error detecting') ||
		msg.includes('Error fetching') ||
		msg.includes('Error finding') ||
		msg.includes('Error formatting') ||
		msg.includes('Error generating') ||
		msg.includes('Error parsing') ||
		msg.includes('Error reading') ||
		msg.includes('RSK API returned status') ||
		msg.includes('Translation service not available') ||
		msg.includes('findServices timed out') ||
		msg.includes('Clipboard read not supported') ||
		msg.includes('service_edit_conflict') ||
		msg.includes('SyntaxError') ||
		msg.includes('RangeError') ||
		msg.includes('Invalid invoice') ||
		msg.includes('Storage error') ||
		msg.includes('API/RPC failed') ||
		msg.includes('companion publish failed') ||
		msg.includes('No "translationService" export') ||
		msg.includes('findMyServices')
	) {
		return;
	}
	_originalError(...args);
};
console.warn = (...args: unknown[]) => {
	const msg = String(args[0] ?? '');
	if (
		msg.includes('[FindServices]') ||
		msg.includes('[processTransactions]') ||
		msg.includes('[DebugWalletSendForm]') ||
		msg.includes('Internal transactions API returned non-JSON') ||
		msg.includes('Skipping transaction with missing') ||
		msg.includes('Invalid userAddress') ||
		msg.includes('history.pushState') ||
		msg.includes('history.replaceState') ||
		msg.includes('Clipboard read not supported') ||
		msg.includes('Failed to read from clipboard') ||
		msg.includes('findMyServices') ||
		msg.includes('Translation service not available') ||
		msg.includes('Failed to load') ||
		msg.includes('Failed to fetch') ||
		msg.includes('Failed to send') ||
		msg.includes('[BalanceHistoryService]') ||
		msg.includes('[WALLET-STORE]') ||
		msg.includes('RSK API returned status') ||
		msg.includes('API/RPC failed')
	) {
		return;
	}
	_originalWarn(...args);
};

// Suppress console.log for DEV-guarded component debug logs that fire in vitest's development mode
const _originalLog = console.log;
console.log = (...args: unknown[]) => {
	const msg = String(args[0] ?? '');
	if (msg.includes('[DebugWalletSendForm]')) {
		return;
	}
	_originalLog(...args);
};
