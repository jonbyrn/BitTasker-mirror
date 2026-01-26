import { Capacitor } from '@capacitor/core';
import type { ImpactStyle as CapacitorImpactStyle } from '@capacitor/haptics';

/**
 * Impact styles for haptic feedback (re-exported for convenience)
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

		if (hapticsModule?.Haptics && hapticsModule?.ImpactStyle) {
			// Map our ImpactStyle to Capacitor's ImpactStyle
			const styleMap: Record<ImpactStyle, CapacitorImpactStyle> = {
				[ImpactStyle.Light]: hapticsModule.ImpactStyle.Light,
				[ImpactStyle.Medium]: hapticsModule.ImpactStyle.Medium,
				[ImpactStyle.Heavy]: hapticsModule.ImpactStyle.Heavy
			};

			await hapticsModule.Haptics.impact({
				style: styleMap[style]
			});
		}
	} catch (error) {
		// Haptics not available, fail silently
		console.debug('Haptic feedback not available:', error);
	}
}

