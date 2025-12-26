import { Capacitor } from '@capacitor/core';

/**
 * Impact styles for haptic feedback
 */
export enum ImpactStyle {
	Light = 'Light',
	Medium = 'Medium',
	Heavy = 'Heavy'
}

/**
 * Triggers haptic feedback on mobile devices
 * @param style - The intensity of the haptic feedback (Light, Medium, Heavy)
 * @returns Promise that resolves when haptic feedback is triggered
 */
export async function triggerHaptic(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
	try {
		// Only trigger haptics on native platforms (iOS, Android)
		if (Capacitor.getPlatform() === 'web') {
			return;
		}

		// Dynamic import to avoid bundling issues
		const hapticsModule = await import('@capacitor/haptics').catch(() => null);

		if (hapticsModule?.Haptics) {
			const impactStyleMap: Record<ImpactStyle, string> = {
				[ImpactStyle.Light]: 'LIGHT',
				[ImpactStyle.Medium]: 'MEDIUM',
				[ImpactStyle.Heavy]: 'HEAVY'
			};

			await hapticsModule.Haptics.impact({
				style: impactStyleMap[style] 
			});
		}
	} catch (error) {
		// Haptics not available, fail silently
		console.debug('Haptic feedback not available:', error);
	}
}

