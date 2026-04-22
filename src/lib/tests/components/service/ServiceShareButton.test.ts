import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceShareButton from '$lib/components/service/ServiceShareButton.svelte';

const {
	isNativePlatform,
	copyToClipboard,
	showSuccessToast,
	showErrorToast,
	getServiceDisplayTitle
} = vi.hoisted(() => ({
	isNativePlatform: vi.fn(() => false),
	copyToClipboard: vi.fn().mockResolvedValue(true),
	showSuccessToast: vi.fn(),
	showErrorToast: vi.fn(),
	getServiceDisplayTitle: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform
	}
}));

vi.mock('$lib/utils/helpers/clipboard', () => ({
	copyToClipboard
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast,
		showErrorToast
	}
}));

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle,
	getServiceDisplayDescription: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.services.browse.share_service': 'Share service',
		'dashboard.services.browse.view_service': 'View service',
		'common.share.check_out_task': 'Check out this task',
		'common.toast.link_copied': 'Link copied',
		'common.toast.link_copy_failed': 'Copy failed'
	};

	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en')
	};
});

describe('ServiceShareButton', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(navigator, 'share', {
			value: vi.fn().mockResolvedValue(undefined),
			configurable: true
		});
		getServiceDisplayTitle.mockReturnValue('Localized service title');
	});

	it('shares the current service payload through the shared entity button', async () => {
		render(ServiceShareButton, {
			service: {
				id: 'service-event-1',
				uniqueId: 'service-123',
				title: 'Original service title'
			} as any,
			variant: 'circle'
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Share service' }));

		await waitFor(() => {
			expect(navigator.share).toHaveBeenCalledWith({
				title: 'Localized service title',
				text: 'Check out this task',
				url: 'http://localhost:3000/services/service-123'
			});
		});

		await waitFor(() => {
			expect(showSuccessToast).toHaveBeenCalledWith('Link copied');
		});
		expect(copyToClipboard).not.toHaveBeenCalled();
		expect(screen.queryByText('Share service')).toBeNull();
	});
});
