import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';

type ServiceSeoPayload = Record<string, unknown>;

const hoisted = vi.hoisted(() => ({
	pageState: {
		url: new URL('https://bittasker.com/services/service-123'),
		params: { serviceId: 'service-123' }
	},
	sections: [
		{
			id: 'find-tasks',
			path: '/tasks',
			icon: 'mdi:magnify',
			label: 'nav.find_tasks'
		},
		{
			id: 'find-services',
			path: '/services',
			icon: 'mdi:briefcase-search',
			label: 'nav.find_services'
		}
	],
	translations: {
		'nav.find_tasks': 'Find Tasks',
		'nav.find_services': 'Find Services'
	}
}));

vi.mock('$app/state', () => ({
	page: hoisted.pageState
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: readable({ isAuthenticated: true })
}));

vi.mock('$lib/stores/device.store', () => ({
	devicePlatform: readable('desktop')
}));

vi.mock('$lib/utils/consts', () => ({
	sections: hoisted.sections
}));

vi.mock('$lib/components/service/ServiceDetailsView.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/WarningPopup.svelte', () => ({
	default: () => null
}));

vi.mock('svelte-i18n', () => ({
	t: readable(
		(key: string) => hoisted.translations[key as keyof typeof hoisted.translations] ?? key
	)
}));

describe('services/[serviceId] route shell', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'innerWidth', {
			value: 1400,
			writable: true,
			configurable: true
		});

		hoisted.pageState.url = new URL('https://bittasker.com/services/service-123');
		hoisted.pageState.params = { serviceId: 'service-123' };
	});

	it('renders the service without the account sidebar', async () => {
		const { default: ServicesDetailPage } = await import(
			'../../../../routes/(app)/services/[serviceId]/+page.svelte'
		);

		expect(() =>
			render(ServicesDetailPage, {
				data: {
					service: null,
					serviceId: 'service-123',
					seo: null as unknown as ServiceSeoPayload
				}
			} as unknown as Parameters<typeof render>[1])
		).not.toThrow();

		expect(screen.queryByRole('link', { name: 'Find Tasks' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Find Services' })).toBeNull();
		expect(document.querySelector('.protected-layout')).toBeNull();
	}, 30_000);
});
