import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import SimplePanelStub from './fixtures/EarningSimplePanelStub.svelte';

const page = {
	url: new URL('https://example.test/dashboard')
};

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.hiring.page_title': 'Hiring | BitTasker',
		'dashboard.hiring.page_description':
			'Manage your hiring activity, tasks, and service requests on BitTasker.'
	};

	return {
		t: readable((key: string) => translations[key] ?? key)
	};
});

vi.mock('$lib/stores/device.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		devicePlatform: readable('web')
	};
});

vi.mock('$app/state', () => ({
	page
}));

vi.mock('$lib/utils/consts', () => ({
	sections: []
}));

vi.mock('$lib/components/WarningPopup.svelte', () => ({
	default: SimplePanelStub
}));

vi.mock('$lib/components/notifications/NotificationPermissionBanner.svelte', () => ({
	default: SimplePanelStub
}));

async function renderDashboardLayout() {
	const { default: DashboardLayout } = await import(
		'../../../../routes/(protected)/dashboard/+layout.svelte'
	);

	return render(DashboardLayout, {
		children: () => '<div data-testid="dashboard-layout-child">Dashboard content</div>'
	});
}

describe('dashboard layout', () => {
	beforeEach(() => {
		cleanup();
		document.head.innerHTML = '';
		document.title = '';
	});

	it('uses the hiring workspace translation keys for head metadata', async () => {
		await renderDashboardLayout();

		await waitFor(() => {
			expect(document.title).toBe('Hiring | BitTasker');
		});

		const description = document.head.querySelector('meta[name="description"]');
		expect(description?.getAttribute('content')).toBe(
			'Manage your hiring activity, tasks, and service requests on BitTasker.'
		);
	});
});
