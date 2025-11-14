import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { browser } from '$app/environment';

/**
 * Development helper for testing Firebase push notifications
 * Available in browser console as window.BitTaskerPushTest
 */
class PushNotificationTestHelper {
	/**
	 * Test Firebase push notification by sending to current device via backend
	 * This tests the complete flow: Frontend → GraphQL → Backend → FCM → Device
	 */
	async testFirebasePush(): Promise<{ readonly success: boolean; readonly message: string; } | undefined> {
		try {
			console.log('🧪 Testing Firebase Push Notification...');
			console.log('📋 Test Flow: Frontend → GraphQL → Backend → FCM → Device');

			const deviceId = pushNotificationService.getCurrentDeviceId();

			if (!deviceId) {
				throw new Error('❌ Device ID not available. Make sure you are logged in and the service is initialized.');
			}

			console.log('📱 Target Device ID:', deviceId);
			console.log('🔍 Debug Info:', pushNotificationService.getDebugInfo());

			const notificationData = {
				title: '🧪 Firebase Push Test',
				body: `Test notification sent at ${new Date().toLocaleTimeString()}. If you see this, Firebase push notifications are working!`,
				deviceId: deviceId
			};

			console.log('📤 Sending notification via GraphQL mutation...');
			console.log('📦 Notification payload:', notificationData);

			const startTime = Date.now();
			const result = await pushNotificationService.sendNotification(notificationData);
			const duration = Date.now() - startTime;

			console.log('✅ Notification sent successfully!');
			console.log('📊 Response:', result);
			console.log(`⏱️  Time taken: ${duration}ms`);
			console.log('');
			console.log('📬 What to expect:');
			console.log('   - If app is in FOREGROUND: Notification should appear in app');
			console.log('   - If app is in BACKGROUND: Notification should appear in system tray');
			console.log('   - Check browser/system notifications in a few seconds');
			console.log('');
			console.log('🔍 To verify:');
			console.log('   1. Check Network tab for "sendNotification" GraphQL mutation');
			console.log('   2. Check backend logs for FCM send attempt');
			console.log('   3. Wait 2-5 seconds for notification to arrive');
			console.log('   4. Check browser/system notification tray');

			return result;
		} catch (error: unknown) {
			console.error('❌ Error testing Firebase push notification:', error);
			const err = error as { message?: string; stack?: string; errors?: unknown[] };
			console.error('📋 Error details:', {
				message: err?.message,
				stack: err?.stack,
				errors: err?.errors
			});
			console.log('');
			console.log('🔧 Troubleshooting:');
			console.log('   1. Verify device ID is registered: Check Network tab for "registerDevice" mutation');
			console.log('   2. Verify backend is running and can access Firebase Admin SDK');
			console.log('   3. Check backend logs for FCM errors');
			console.log('   4. Verify FCM token is valid in backend database');
			throw error;
		}
	}

	/**
	 * Test sending notification to a specific device ID (useful for testing other users)
	 */
	async testToDevice(deviceId: string, title?: string, body?: string): Promise<{ readonly success: boolean; readonly message: string; } | undefined> {
		try {
			console.log('🧪 Testing Firebase Push Notification to specific device...');
			console.log('📱 Target Device ID:', deviceId);

			const notificationData = {
				title: title || '🧪 Firebase Push Test',
				body: body || `Test notification sent at ${new Date().toLocaleTimeString()}`,
				deviceId: deviceId
			};

			console.log('📤 Sending notification...');
			const result = await pushNotificationService.sendNotification(notificationData);

			console.log('✅ Notification sent successfully!');
			console.log('📊 Response:', result);
			console.log('⏱️  Check the target device for the notification in 2-5 seconds');

			return result;
		} catch (error: unknown) {
			console.error('❌ Error sending notification:', error);
			throw error;
		}
	}

	/**
	 * Get current device ID
	 */
	getDeviceId(): string | null {
		return pushNotificationService.getCurrentDeviceId();
	}

	/**
	 * Get debug information about push notification setup
	 */
	getDebugInfo(): object {
		return pushNotificationService.getDebugInfo();
	}

	/**
	 * Show help information
	 */
	help(): void {
		console.log('🛠️ BitTasker Push Notification Test Helper');
		console.log('');
		console.log('Available methods:');
		console.log('  testFirebasePush()           - Test push notification to current device');
		console.log('  testToDevice(deviceId, title, body) - Test push to specific device');
		console.log('  getDeviceId()                - Get current device ID');
		console.log('  getDebugInfo()               - Get debug information');
		console.log('  help()                       - Show this help message');
		console.log('');
		console.log('Example usage:');
		console.log('  await BitTaskerPushTest.testFirebasePush()');
		console.log('  await BitTaskerPushTest.testToDevice("web_abc123", "Test", "Message")');
	}
}

// Export for use in components if needed
export const pushNotificationTestHelper = new PushNotificationTestHelper();

// Make available in browser console for development
if (browser) {
	(window as Window & { BitTaskerPushTest?: PushNotificationTestHelper }).BitTaskerPushTest = pushNotificationTestHelper;

	// Show availability message in development
	if (import.meta.env.DEV) {
		console.log('🛠️ BitTasker Push Notification Testing available in console: BitTaskerPushTest.help()');
	}
}

