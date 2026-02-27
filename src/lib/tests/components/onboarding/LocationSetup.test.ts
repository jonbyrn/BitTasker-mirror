/**
 * Tests for LocationSetup onMount behavior:
 * - getLatestLocation is called on mount
 * - When getLatestLocation returns null, default location (San Salvador) is shown
 * - When getLatestLocation returns a saved location, that location is shown
 * - When getLatestLocation rejects, default location is shown
 * - On unmount, first onMount cleanup runs (clearTimeout, removeEventListener)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import LocationSetup from '$lib/components/onboarding/LocationSetup.svelte';
import type { Location } from '$lib/types/task';

const DEFAULT_DISPLAY_NAME = 'San Salvador, El Salvador';

const savedLocation: Location = {
	displayName: 'Berlin, Germany',
	latitude: 52.52,
	longitude: 13.405,
	zipCode: '',
	locationLoaded: true
};

vi.mock('$lib/nostr/location', () => ({
	getLatestLocation: vi.fn(),
	publishLocation: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => false }
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/components/LocationAutoComplete.svelte', async () => {
	const { default: Mock } = await import('./__mocks__/LocationAutoCompleteMock.svelte');
	return { default: Mock };
});

const { getLatestLocation } = await import('$lib/nostr/location');

describe('LocationSetup onMount', () => {
	const noop = () => {};
	const defaultProps = {
		nextStep: noop,
		prevStep: noop,
		currentStep: 1,
		totalSteps: 6
	};

	let matchMediaListeners: Array<() => void> = [];
	let matchMediaMock: {
		addEventListener: typeof vi.fn;
		removeEventListener: typeof vi.fn;
		matches: boolean;
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(getLatestLocation).mockReset();
		matchMediaListeners = [];
		matchMediaMock = {
			matches: false,
			addEventListener: vi.fn((_event: string, listener: () => void) => {
				matchMediaListeners.push(listener);
			}),
			removeEventListener: vi.fn((_event: string, listener: () => void) => {
				const i = matchMediaListeners.indexOf(listener);
				if (i >= 0) matchMediaListeners.splice(i, 1);
			})
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => matchMediaMock)
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		cleanup();
	});

	it('calls getLatestLocation on mount', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);

		render(LocationSetup, { props: defaultProps });
		await tick();

		expect(getLatestLocation).toHaveBeenCalledTimes(1);
	});

	it('shows default location when getLatestLocation returns null', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);

		const { getByTestId } = render(LocationSetup, { props: defaultProps });
		await tick();
		// Allow async onMount to complete
		await tick();

		const locationDisplay = getByTestId('location-display');
		expect(locationDisplay).toBeTruthy();
		expect(locationDisplay.textContent).toBe(DEFAULT_DISPLAY_NAME);
	});

	it('shows saved location when getLatestLocation returns a location', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(savedLocation);

		const { getByTestId } = render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();

		const locationDisplay = getByTestId('location-display');
		expect(locationDisplay).toBeTruthy();
		expect(locationDisplay.textContent).toBe(savedLocation.displayName);
	});

	it('shows default location when getLatestLocation rejects', async () => {
		vi.mocked(getLatestLocation).mockRejectedValue(new Error('Network error'));

		const { getByTestId } = render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();

		const locationDisplay = getByTestId('location-display');
		expect(locationDisplay).toBeTruthy();
		expect(locationDisplay.textContent).toBe(DEFAULT_DISPLAY_NAME);
	});

	it('runs first onMount cleanup on unmount (clearTimeout and removeEventListener)', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);

		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		const { unmount } = render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();

		const removeListenerCallsBefore = vi.mocked(matchMediaMock.removeEventListener).mock.calls
			.length;
		unmount();
		const removeListenerCallsAfter = vi.mocked(matchMediaMock.removeEventListener).mock.calls
			.length;

		expect(clearTimeoutSpy).toHaveBeenCalled();
		expect(removeListenerCallsAfter).toBeGreaterThan(removeListenerCallsBefore);

		clearTimeoutSpy.mockRestore();
	});

	it('renders step container and navigation buttons', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);

		const { getByTestId: getByTestIdInDocument } = render(LocationSetup, { props: defaultProps });
		await tick();

		expect(getByTestIdInDocument('onboarding-step-location')).toBeTruthy();
		expect(getByTestIdInDocument('onboarding-location-back')).toBeTruthy();
		expect(getByTestIdInDocument('onboarding-location-next')).toBeTruthy();
	});
});

/** Auto-detect location: runs once after delay when no saved location and permission not denied */
const AUTO_DETECT_DELAY_MS = 400;

describe('LocationSetup auto-detect location', () => {
	const noop = () => {};
	const defaultProps = {
		nextStep: noop,
		prevStep: noop,
		currentStep: 1,
		totalSteps: 6
	};

	let matchMediaMock: {
		addEventListener: ReturnType<typeof vi.fn>;
		removeEventListener: ReturnType<typeof vi.fn>;
		matches: boolean;
	};
	let getCurrentPositionMock: ReturnType<typeof vi.fn>;
	let permissionsQueryMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(getLatestLocation).mockReset();
		getCurrentPositionMock = vi.fn();
		permissionsQueryMock = vi.fn();
		matchMediaMock = {
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => matchMediaMock)
		);
		Object.defineProperty(globalThis.navigator, 'permissions', {
			value: { query: permissionsQueryMock },
			configurable: true,
			writable: true
		});
		Object.defineProperty(globalThis.navigator, 'geolocation', {
			value: { getCurrentPosition: getCurrentPositionMock },
			configurable: true,
			writable: true
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		cleanup();
	});

	it('calls getCurrentPosition after delay when no saved location and permission granted', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);
		permissionsQueryMock.mockResolvedValue({ state: 'granted' });
		getCurrentPositionMock.mockImplementation((success: (pos: GeolocationPosition) => void) => {
			success({
				coords: {
					latitude: 10,
					longitude: 20,
					accuracy: 0,
					altitude: null,
					altitudeAccuracy: null,
					heading: null,
					speed: null
				},
				timestamp: Date.now()
			} as GeolocationPosition);
		});

		render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();

		expect(getCurrentPositionMock).not.toHaveBeenCalled();
		vi.advanceTimersByTime(AUTO_DETECT_DELAY_MS);
		await tick();
		await tick();

		expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
	});

	it('does not call getCurrentPosition when permission is denied', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);
		permissionsQueryMock.mockResolvedValue({ state: 'denied' });

		render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();
		vi.advanceTimersByTime(AUTO_DETECT_DELAY_MS);
		await tick();
		await tick();

		expect(getCurrentPositionMock).not.toHaveBeenCalled();
	});

	it('does not call getCurrentPosition when saved location exists', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(savedLocation);
		permissionsQueryMock.mockResolvedValue({ state: 'granted' });

		render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();
		vi.advanceTimersByTime(AUTO_DETECT_DELAY_MS);
		await tick();
		await tick();

		expect(getCurrentPositionMock).not.toHaveBeenCalled();
	});

	it('does not call getCurrentPosition when Permissions API is unavailable', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);
		Object.defineProperty(globalThis.navigator, 'permissions', {
			value: undefined,
			configurable: true,
			writable: true
		});

		render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();
		vi.advanceTimersByTime(AUTO_DETECT_DELAY_MS);
		await tick();
		await tick();

		expect(getCurrentPositionMock).not.toHaveBeenCalled();
	});

	it('does not set sessionStorage for permission or denial', async () => {
		const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
		vi.mocked(getLatestLocation).mockResolvedValue(null);
		permissionsQueryMock.mockResolvedValue({ state: 'granted' });
		getCurrentPositionMock.mockImplementation(
			(_success: () => void, error: (err: GeolocationPositionError) => void) => {
				error({
					code: 1,
					message: 'User denied',
					PERMISSION_DENIED: 1
				} as GeolocationPositionError);
			}
		);

		render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();
		vi.advanceTimersByTime(AUTO_DETECT_DELAY_MS);
		await tick();
		await tick();

		const locationRelatedCalls = setItemSpy.mock.calls.filter(
			(call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('location')
		);
		expect(locationRelatedCalls.length).toBe(0);
		setItemSpy.mockRestore();
	});

	it('does not call getCurrentPosition after unmount when timer had not fired', async () => {
		vi.mocked(getLatestLocation).mockResolvedValue(null);
		permissionsQueryMock.mockResolvedValue({ state: 'granted' });

		const { unmount } = render(LocationSetup, { props: defaultProps });
		await tick();
		await tick();
		unmount();
		vi.advanceTimersByTime(AUTO_DETECT_DELAY_MS);
		await tick();

		expect(getCurrentPositionMock).not.toHaveBeenCalled();
	});
});
