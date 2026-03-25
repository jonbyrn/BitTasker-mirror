import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/keyboard', () => ({
	Keyboard: {
		addListener: vi.fn()
	}
}));

vi.mock('@capacitor/device', () => ({
	Device: {
		getInfo: vi.fn().mockResolvedValue({ platform: 'web' })
	}
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		getPlatform: vi.fn(() => 'web')
	}
}));

import { scrollInputIntoView } from '$lib/utils/helpers/keyboard';

describe('scrollInputIntoView', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	it('does not scroll when the focused control is already visible', () => {
		const scrollIntoView = vi.fn();
		const input = {
			getBoundingClientRect: () => ({
				top: 40,
				bottom: 120
			}),
			scrollIntoView
		} as unknown as HTMLElement;

		Object.defineProperty(window, 'visualViewport', {
			configurable: true,
			value: { height: 800 }
		});

		scrollInputIntoView(input);
		vi.runAllTimers();

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it('keeps scroll alignment nearest when the focused control is outside the viewport', () => {
		const scrollIntoView = vi.fn();
		const input = {
			getBoundingClientRect: () => ({
				top: 780,
				bottom: 860
			}),
			scrollIntoView
		} as unknown as HTMLElement;

		Object.defineProperty(window, 'visualViewport', {
			configurable: true,
			value: { height: 800 }
		});

		scrollInputIntoView(input);
		vi.runAllTimers();

		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'nearest'
		});
	});
});
