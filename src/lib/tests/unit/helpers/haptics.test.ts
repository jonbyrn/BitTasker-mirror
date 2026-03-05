import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';

const mockImpact = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: vi.fn(() => 'web') }
}));

vi.mock('@capacitor/haptics', () => ({
	Haptics: { impact: mockImpact },
	ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }
}));

describe('haptics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
	});

	describe('ImpactStyle', () => {
		it('should export Light, Medium, Heavy enum values', () => {
			expect(ImpactStyle.Light).toBe('Light');
			expect(ImpactStyle.Medium).toBe('Medium');
			expect(ImpactStyle.Heavy).toBe('Heavy');
		});
	});

	describe('triggerHaptic', () => {
		it('should resolve without calling native Haptics when platform is web', async () => {
			await expect(triggerHaptic(ImpactStyle.Medium)).resolves.toBeUndefined();
			expect(mockImpact).not.toHaveBeenCalled();
		});

		it('should default to Light style when no argument given', async () => {
			await triggerHaptic();
			expect(mockImpact).not.toHaveBeenCalled();
		});

		it('should call native Haptics.impact with mapped style when platform is native', async () => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
			await triggerHaptic(ImpactStyle.Heavy);
			expect(mockImpact).toHaveBeenCalledTimes(1);
			expect(mockImpact).toHaveBeenCalledWith({ style: 'HEAVY' });
		});
	});
});
