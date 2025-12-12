/**
 * Device Settings Helper
 * Opens device settings with deep links to specific sections
 */

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { browser } from '$app/environment';
import type { DeviceOS } from './deviceCompatibility';
import type { ErrorType } from '$lib/components/ErrorTroubleshootingModal.svelte';

export type SettingsSection = 
	| 'biometric' 
	| 'passcode' 
	| 'security' 
	| 'privacy' 
	| 'general'
	| 'touchid'
	| 'faceid'
	| 'screenlock'
	| 'windowshello';

export interface SettingsAction {
	label: string;
	action: () => Promise<void>;
	available: boolean;
}

/**
 * Open device settings for native apps (iOS/Android)
 */
async function openNativeSettings(section?: SettingsSection): Promise<void> {
	const platform = Capacitor.getPlatform();
	
	try {
		if (platform === 'ios') {
			// iOS: Use app-settings: URL scheme to open Settings app
			// iOS supports app-settings: URL scheme to open Settings app
			// For specific sections, we can use deep links (iOS 8+)
			const url = 'app-settings:';
			
			// Note: iOS doesn't support direct deep links to Touch ID/Face ID settings
			// But we can open Settings app and user navigates manually
			// Alternative: Use prefs:root=TOUCHID_PASSCODE for Touch ID settings (may require URL scheme whitelist)
			
			await Browser.open({ url });
		} else if (platform === 'android') {
			// Android: Use intent URLs to open specific settings
			let intentAction: string;
			
			switch (section) {
				case 'biometric':
				case 'screenlock':
					// Open Security settings (where biometrics are configured)
					intentAction = 'android.settings.SECURITY_SETTINGS';
					break;
				case 'passcode':
					// Open Screen lock settings
					intentAction = 'android.settings.SECURITY_SETTINGS';
					break;
				case 'privacy':
					intentAction = 'android.settings.PRIVACY_SETTINGS';
					break;
				default:
					intentAction = 'android.settings.SETTINGS';
			}
			
			// Use Browser.open with Android intent
			// Format: intent://[path]#Intent;scheme=[scheme];action=[action];end
			// Alternative: Use direct intent action
			const intentUrl = `intent://settings#Intent;action=${intentAction};end`;
			
			try {
				await Browser.open({ url: intentUrl });
			} catch (intentError) {
				// Fallback: Try opening general settings
				await Browser.open({ url: 'android.settings.SETTINGS' });
			}
		}
	} catch (error) {
		console.error('Failed to open native settings:', error);
		// Fallback: try opening general settings
		try {
			if (platform === 'ios') {
				await Browser.open({ url: 'app-settings:' });
			} else if (platform === 'android') {
				await Browser.open({ url: 'android.settings.SETTINGS' });
			}
		} catch (fallbackError) {
			console.error('Failed to open settings even with fallback:', fallbackError);
			throw error;
		}
	}
}

/**
 * Get platform-specific settings URL for web
 */
function getWebSettingsUrl(os: DeviceOS, section?: SettingsSection): string | null {
	// Web browsers cannot directly open device settings
	// Return null to indicate we need to show instructions instead
	return null;
}

/**
 * Open device settings based on platform and error type
 */
export async function openDeviceSettings(
	os: DeviceOS,
	platform: 'ios' | 'android' | 'web',
	errorType?: ErrorType
): Promise<void> {
	const isNative = platform !== 'web';
	
	if (isNative) {
		// Determine which settings section to open based on error type
		let section: SettingsSection | undefined;
		
		if (errorType === 'biometric') {
			section = platform === 'ios' ? 'touchid' : 'biometric';
		} else if (errorType === 'permission') {
			section = 'privacy';
		} else if (errorType === 'hardware') {
			section = 'security';
		}
		
		await openNativeSettings(section);
	} else {
		// For web, we can't open device settings directly
		// This will be handled by showing instructions in the modal
		throw new Error('Cannot open device settings from web browser');
	}
}

/**
 * Get settings action button configuration
 */
export function getSettingsAction(
	os: DeviceOS,
	platform: 'ios' | 'android' | 'web',
	errorType?: ErrorType
): SettingsAction | null {
	const isNative = platform !== 'web';
	
	if (!isNative) {
		// Web: Return null - we'll show instructions instead
		return null;
	}
	
	// Determine label and section based on error type
	let label = '';
	let section: SettingsSection | undefined;
	
	if (errorType === 'biometric') {
		if (platform === 'ios') {
			label = 'Open Touch ID & Passcode Settings';
			section = 'touchid';
		} else {
			label = 'Open Biometric Settings';
			section = 'biometric';
		}
	} else if (errorType === 'permission') {
		label = 'Open Privacy Settings';
		section = 'privacy';
	} else if (errorType === 'hardware') {
		label = 'Open Security Settings';
		section = 'security';
	} else {
		label = 'Open Settings';
		section = 'general';
	}
	
	return {
		label,
		action: async () => {
			await openDeviceSettings(os, platform, errorType);
		},
		available: true
	};
}

/**
 * Get platform-specific instructions for opening settings manually
 * Returns translation keys that should be translated in the component
 */
export function getSettingsInstructions(
	os: DeviceOS,
	platform: 'ios' | 'android' | 'web',
	errorType?: ErrorType
): string[] {
	const instructions: string[] = [];
	
	if (platform === 'ios') {
		if (errorType === 'biometric') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_biometric_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_biometric_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_biometric_3');
		} else if (errorType === 'permission' || errorType === 'hardware') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_passcode_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_passcode_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_passcode_3');
		} else {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_other_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.ios_native_other_2');
		}
	} else if (platform === 'android') {
		if (errorType === 'biometric' || errorType === 'hardware') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_biometric_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_biometric_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_biometric_3');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_biometric_4');
		} else if (errorType === 'permission') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_permission_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_permission_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_permission_3');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_permission_4');
		} else {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_other_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.android_native_other_2');
		}
	} else {
		// Web platform
		if (os === 'ios') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_ios_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_ios_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_ios_3');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_ios_4');
		} else if (os === 'android') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_android_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_android_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_android_3');
		} else if (os === 'windows') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_windows_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_windows_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_windows_3');
		} else if (os === 'macos') {
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_macos_1');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_macos_2');
			instructions.push('common.components.error_troubleshooting_modal.settings_instructions.web_macos_3');
		}
	}
	
	return instructions;
}

