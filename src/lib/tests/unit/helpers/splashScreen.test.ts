import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	initializeSplashScreen,
	hideSplashScreen,
	showSplashScreen,
	isSplashScreenHidden,
	hideSplashScreenWhenReady
} from '$lib/utils/helpers/splashScreen';

const mocks = vi.hoisted(() => ({
	mockHide: vi.fn().mockResolvedValue(undefined),
	mockShow: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn(() => false) }
}));
vi.mock('@capacitor/splash-screen', () => ({
	SplashScreen: {
		hide: (opts: unknown) => mocks.mockHide(opts),
		show: (opts: unknown) => mocks.mockShow(opts)
	}
}));

describe('splashScreen', () => {
	beforeEach(() => {
		mocks.mockHide.mockResolvedValue(undefined);
		mocks.mockShow.mockResolvedValue(undefined);
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('initializeSplashScreen', () => {
		it('should resolve without throwing when browser is true', async () => {
			await expect(initializeSplashScreen()).resolves.toBeUndefined();
		});
	});

	describe('hideSplashScreen', () => {
		it('should not call native SplashScreen.hide when not native platform', async () => {
			await hideSplashScreen();
			expect(mocks.mockHide).not.toHaveBeenCalled();
		});

		it('should pass fadeOutDuration to native hide when provided', async () => {
			const { Capacitor } = await import('@capacitor/core');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

			await hideSplashScreen({ fadeOutDuration: 500 });
			expect(mocks.mockHide).toHaveBeenCalledWith({ fadeOutDuration: 500 });
		});

		it('should use default fadeOutDuration when options omitted', async () => {
			const { Capacitor } = await import('@capacitor/core');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
			await showSplashScreen(); // reset so hide is not no-op (already hidden)

			await hideSplashScreen();
			expect(mocks.mockHide).toHaveBeenCalledWith({ fadeOutDuration: 200 });
		});

		it('should not call native hide again when already hidden unless force is true', async () => {
			const { Capacitor } = await import('@capacitor/core');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
			await showSplashScreen(); // reset so first hide runs

			await hideSplashScreen();
			expect(mocks.mockHide).toHaveBeenCalledTimes(1);
			await hideSplashScreen(); // no force
			expect(mocks.mockHide).toHaveBeenCalledTimes(1);
			await hideSplashScreen({ force: true });
			expect(mocks.mockHide).toHaveBeenCalledTimes(2);
		});
	});

	describe('showSplashScreen', () => {
		it('should call native show with options when native platform', async () => {
			const { Capacitor } = await import('@capacitor/core');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

			await showSplashScreen({ showDuration: 100, fadeInDuration: 150, autoHide: true });
			expect(mocks.mockShow).toHaveBeenCalledWith({
				showDuration: 100,
				fadeInDuration: 150,
				autoHide: true
			});
		});
	});

	describe('isSplashScreenHidden', () => {
		it('should return boolean reflecting whether hide has been called (native)', async () => {
			const { Capacitor } = await import('@capacitor/core');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

			await showSplashScreen(); // reset to visible
			expect(isSplashScreenHidden()).toBe(false);
			await hideSplashScreen();
			expect(isSplashScreenHidden()).toBe(true);
		});
	});

	describe('hideSplashScreenWhenReady', () => {
		it('should wait for delay then call hideSplashScreen when document already loaded', async () => {
			const { Capacitor } = await import('@capacitor/core');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
			await showSplashScreen(); // reset so hide inside hideSplashScreenWhenReady runs
			Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });

			const promise = hideSplashScreenWhenReady(50);
			await vi.advanceTimersByTimeAsync(50);
			await promise;

			expect(mocks.mockHide).toHaveBeenCalled();
		});
	});
});
