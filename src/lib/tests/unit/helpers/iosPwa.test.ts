import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isIOSStandalone, applyIOSPwaSafeAreaFix } from '$lib/utils/helpers/iosPwa';

describe('isIOSStandalone', () => {
	it('returns true when navigator.standalone is true', () => {
		vi.stubGlobal('navigator', { standalone: true });
		expect(isIOSStandalone()).toBe(true);
	});

	it('returns false when navigator.standalone is false', () => {
		vi.stubGlobal('navigator', { standalone: false });
		expect(isIOSStandalone()).toBe(false);
	});

	it('returns false when navigator.standalone does not exist (Android / desktop)', () => {
		vi.stubGlobal('navigator', {});
		expect(isIOSStandalone()).toBe(false);
	});

	it('returns false when navigator is undefined (SSR safety)', () => {
		vi.stubGlobal('navigator', undefined);
		expect(isIOSStandalone()).toBe(false);
	});

	it('returns false when standalone is a truthy non-boolean (paranoid)', () => {
		vi.stubGlobal('navigator', { standalone: 1 });
		expect(isIOSStandalone()).toBe(true);
	});
});

describe('applyIOSPwaSafeAreaFix', () => {
	beforeEach(() => {
		// Minimal document stub
		const el = {
			style: {
				setProperty: vi.fn()
			}
		};
		vi.stubGlobal('document', { documentElement: el });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sets --safe-area-inset-* to 0px when iOS standalone', () => {
		vi.stubGlobal('navigator', { standalone: true });
		applyIOSPwaSafeAreaFix();

		const setProp = (
			document.documentElement as unknown as { style: { setProperty: ReturnType<typeof vi.fn> } }
		).style.setProperty;
		expect(setProp).toHaveBeenCalledWith('--safe-area-inset-top', '0px');
		expect(setProp).toHaveBeenCalledWith('--safe-area-inset-bottom', '0px');
		expect(setProp).toHaveBeenCalledWith('--safe-area-inset-left', '0px');
		expect(setProp).toHaveBeenCalledWith('--safe-area-inset-right', '0px');
	});

	it('does NOT set CSS vars when NOT standalone', () => {
		vi.stubGlobal('navigator', { standalone: false });
		applyIOSPwaSafeAreaFix();

		const setProp = (
			document.documentElement as unknown as { style: { setProperty: ReturnType<typeof vi.fn> } }
		).style.setProperty;
		expect(setProp).not.toHaveBeenCalled();
	});

	it('is safe when document is undefined (SSR)', () => {
		vi.stubGlobal('document', undefined);
		vi.stubGlobal('navigator', { standalone: true });

		expect(() => applyIOSPwaSafeAreaFix()).not.toThrow();
	});
});
