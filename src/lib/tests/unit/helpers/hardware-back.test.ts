import { describe, expect, it } from 'vitest';
import { bindHardwareBack } from '$lib/utils/helpers/hardware-back';

describe('hardware back', () => {
	it('closes the screen when the browser pops the history entry', () => {
		const seen: string[] = [];
		const binding = bindHardwareBack(() => seen.push('back'));
		expect(history.state).toEqual({ buyWithCard: true });
		window.dispatchEvent(new PopStateEvent('popstate'));
		expect(seen).toEqual(['back']);
		binding.stop();
	});

	it('uses the same close for the on-screen Back button', () => {
		const seen: string[] = [];
		const binding = bindHardwareBack(() => seen.push('back'));
		binding.back();
		expect(seen).toEqual(['back']);
		binding.back();
		expect(seen).toEqual(['back']);
		binding.stop();
	});
});
