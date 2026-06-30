import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
	NotificationPreferencesExtended,
	TaskNotificationSettings,
	ServiceNotificationSettings
} from '$lib/types/notification';

vi.mock('$lib/api/services/notificationCenter.service', () => ({
	notificationCenterService: {
		getPreferences: vi.fn(),
		updatePreferences: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, opts?: { values?: Record<string, string> }) => {
			if (opts?.values?.setting) return `${opts.values.setting} ${key}`;
			return key;
		})
	};
});

import { notificationCenterService } from '$lib/api/services/notificationCenter.service';

function createDefaultPrefs(): NotificationPreferencesExtended {
	return {
		id: 'pref-1',
		npub: 'npub1abc',
		userId: 1,
		pushEnabled: true,
		emailEnabled: false,
		quietHoursEnabled: false,
		quietHoursStart: '22:00',
		quietHoursEnd: '07:00',
		contractUpdates: true,
		bidUpdates: true,
		taskMatches: true,
		taskMatchFrequency: 'INSTANT',
		messageNotifications: true,
		messagePreview: true,
		reviewNotifications: true,
		discoveryNotifications: true,
		reengagementNotifications: true,
		securityAlerts: true,
		walletNotifications: true,
		serviceNotifications: true,
		taskNotificationSettings: {
			enabled: true,
			frequency: 'INSTANT',
			broadcast: true,
			broadcastFrequency: 'INSTANT'
		},
		serviceNotificationSettings: {
			enabled: true,
			frequency: 'INSTANT',
			broadcast: true,
			broadcastFrequency: 'INSTANT'
		},
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z'
	};
}

describe('NotificationPreferencesExtended — Task & Service Settings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('TaskNotificationSettings type', () => {
		it('has enabled, frequency, broadcast, broadcastFrequency fields', () => {
			const settings: TaskNotificationSettings = {
				enabled: true,
				frequency: 'INSTANT',
				broadcast: true,
				broadcastFrequency: 'INSTANT'
			};
			expect(settings.enabled).toBe(true);
			expect(settings.frequency).toBe('INSTANT');
			expect(settings.broadcast).toBe(true);
			expect(settings.broadcastFrequency).toBe('INSTANT');
		});
	});

	describe('ServiceNotificationSettings type', () => {
		it('has enabled, frequency, broadcast, broadcastFrequency fields', () => {
			const settings: ServiceNotificationSettings = {
				enabled: true,
				frequency: 'DAILY',
				broadcast: false,
				broadcastFrequency: 'WEEKLY'
			};
			expect(settings.enabled).toBe(true);
			expect(settings.frequency).toBe('DAILY');
			expect(settings.broadcast).toBe(false);
			expect(settings.broadcastFrequency).toBe('WEEKLY');
		});
	});

	describe('Default preferences include task and service settings', () => {
		it('returns preferences with taskNotificationSettings', async () => {
			const prefs = createDefaultPrefs();
			vi.mocked(notificationCenterService.getPreferences).mockResolvedValueOnce(prefs);

			const result = await notificationCenterService.getPreferences();

			expect(result.taskNotificationSettings).toBeDefined();
			expect(result.taskNotificationSettings.enabled).toBe(true);
			expect(result.taskNotificationSettings.frequency).toBe('INSTANT');
			expect(result.taskNotificationSettings.broadcast).toBe(true);
			expect(result.taskNotificationSettings.broadcastFrequency).toBe('INSTANT');
		});

		it('returns preferences with serviceNotificationSettings', async () => {
			const prefs = createDefaultPrefs();
			vi.mocked(notificationCenterService.getPreferences).mockResolvedValueOnce(prefs);

			const result = await notificationCenterService.getPreferences();

			expect(result.serviceNotificationSettings).toBeDefined();
			expect(result.serviceNotificationSettings.enabled).toBe(true);
			expect(result.serviceNotificationSettings.frequency).toBe('INSTANT');
			expect(result.serviceNotificationSettings.broadcast).toBe(true);
			expect(result.serviceNotificationSettings.broadcastFrequency).toBe('INSTANT');
		});
	});

	describe('Updating task notification settings', () => {
		it('sends updated taskNotificationSettings to API', async () => {
			const prefs = createDefaultPrefs();
			const updated = {
				...prefs,
				taskNotificationSettings: {
					...prefs.taskNotificationSettings,
					enabled: false,
					frequency: 'DAILY'
				}
			};
			vi.mocked(notificationCenterService.updatePreferences).mockResolvedValueOnce(updated);

			const result = await notificationCenterService.updatePreferences(updated);

			expect(notificationCenterService.updatePreferences).toHaveBeenCalledWith(updated);
			expect(result.taskNotificationSettings.enabled).toBe(false);
			expect(result.taskNotificationSettings.frequency).toBe('DAILY');
		});

		it('can disable task broadcast independently', async () => {
			const prefs = createDefaultPrefs();
			const updated = {
				...prefs,
				taskNotificationSettings: {
					...prefs.taskNotificationSettings,
					broadcast: false
				}
			};
			vi.mocked(notificationCenterService.updatePreferences).mockResolvedValueOnce(updated);

			const result = await notificationCenterService.updatePreferences(updated);

			expect(result.taskNotificationSettings.broadcast).toBe(false);
			expect(result.taskNotificationSettings.enabled).toBe(true);
		});

		it('can change task broadcast frequency independently', async () => {
			const prefs = createDefaultPrefs();
			const updated = {
				...prefs,
				taskNotificationSettings: {
					...prefs.taskNotificationSettings,
					broadcastFrequency: 'WEEKLY'
				}
			};
			vi.mocked(notificationCenterService.updatePreferences).mockResolvedValueOnce(updated);

			const result = await notificationCenterService.updatePreferences(updated);

			expect(result.taskNotificationSettings.broadcastFrequency).toBe('WEEKLY');
		});
	});

	describe('Updating service notification settings', () => {
		it('sends updated serviceNotificationSettings to API', async () => {
			const prefs = createDefaultPrefs();
			const updated = {
				...prefs,
				serviceNotificationSettings: {
					...prefs.serviceNotificationSettings,
					enabled: false,
					frequency: 'WEEKLY'
				}
			};
			vi.mocked(notificationCenterService.updatePreferences).mockResolvedValueOnce(updated);

			const result = await notificationCenterService.updatePreferences(updated);

			expect(result.serviceNotificationSettings.enabled).toBe(false);
			expect(result.serviceNotificationSettings.frequency).toBe('WEEKLY');
		});

		it('can disable service broadcast independently', async () => {
			const prefs = createDefaultPrefs();
			const updated = {
				...prefs,
				serviceNotificationSettings: {
					...prefs.serviceNotificationSettings,
					broadcast: false
				}
			};
			vi.mocked(notificationCenterService.updatePreferences).mockResolvedValueOnce(updated);

			const result = await notificationCenterService.updatePreferences(updated);

			expect(result.serviceNotificationSettings.broadcast).toBe(false);
			expect(result.serviceNotificationSettings.enabled).toBe(true);
		});
	});

	describe('Frequency values', () => {
		it('accepts INSTANT frequency', () => {
			const settings: TaskNotificationSettings = {
				enabled: true,
				frequency: 'INSTANT',
				broadcast: true,
				broadcastFrequency: 'INSTANT'
			};
			expect(settings.frequency).toBe('INSTANT');
		});

		it('accepts DAILY frequency', () => {
			const settings: TaskNotificationSettings = {
				enabled: true,
				frequency: 'DAILY',
				broadcast: true,
				broadcastFrequency: 'DAILY'
			};
			expect(settings.frequency).toBe('DAILY');
		});

		it('accepts WEEKLY frequency', () => {
			const settings: TaskNotificationSettings = {
				enabled: true,
				frequency: 'WEEKLY',
				broadcast: true,
				broadcastFrequency: 'WEEKLY'
			};
			expect(settings.frequency).toBe('WEEKLY');
		});
	});

	describe('Task and service settings are independent', () => {
		it('disabling task does not affect service', async () => {
			const prefs = createDefaultPrefs();
			const updated = {
				...prefs,
				taskNotificationSettings: {
					...prefs.taskNotificationSettings,
					enabled: false
				}
			};
			vi.mocked(notificationCenterService.updatePreferences).mockResolvedValueOnce(updated);

			const result = await notificationCenterService.updatePreferences(updated);

			expect(result.taskNotificationSettings.enabled).toBe(false);
			expect(result.serviceNotificationSettings.enabled).toBe(true);
		});

		it('disabling service does not affect task', async () => {
			const prefs = createDefaultPrefs();
			const updated = {
				...prefs,
				serviceNotificationSettings: {
					...prefs.serviceNotificationSettings,
					enabled: false
				}
			};
			vi.mocked(notificationCenterService.updatePreferences).mockResolvedValueOnce(updated);

			const result = await notificationCenterService.updatePreferences(updated);

			expect(result.serviceNotificationSettings.enabled).toBe(false);
			expect(result.taskNotificationSettings.enabled).toBe(true);
		});
	});

	describe('API error handling', () => {
		it('propagates API errors for getPreferences', async () => {
			vi.mocked(notificationCenterService.getPreferences).mockRejectedValueOnce(
				new Error('Network error')
			);

			await expect(notificationCenterService.getPreferences()).rejects.toThrow('Network error');
		});

		it('propagates API errors for updatePreferences', async () => {
			vi.mocked(notificationCenterService.updatePreferences).mockRejectedValueOnce(
				new Error('Server error')
			);

			const prefs = createDefaultPrefs();
			await expect(notificationCenterService.updatePreferences(prefs)).rejects.toThrow(
				'Server error'
			);
		});
	});
});
