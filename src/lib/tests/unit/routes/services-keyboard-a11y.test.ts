import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readable } from 'svelte/store';
import type { Service } from '$lib/types/service.d';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import ServiceCard from '$lib/components/service/ServiceCard.svelte';
import UnifiedFilterDrawer from '$lib/components/listing/UnifiedFilterDrawer.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'dashboard.services.browse.quote') return 'Quote';
			if (key === 'dashboard.services.browse.view') return 'View';
			if (key === 'dashboard.services.browse.pricing.request_quote') return 'Request Quote';
			if (key === 'dashboard.services.browse.pricing.inquiry_required') return 'Request Quote';
			if (key === 'common.location.approximate_short') return 'Approx.';
			if (key === 'common.components.drawer.close') return 'Close';
			return key;
		}),
		locale: readable('en')
	};
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: vi.fn((service: Service) => service.title),
	getServiceDisplayDescription: vi.fn((service: Service) => service.description)
}));

vi.mock('$lib/components/Avatar.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/service/ServiceShareButton.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/stores/scrollContainer.store', () => ({
	appScrollContainer: readable(null)
}));

function createService(overrides: Partial<Service> = {}): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-123',
		npub: 'a'.repeat(64),
		status: 'active',
		title: 'Logo Refresh',
		description: 'Clean up an outdated brand mark.',
		serviceLocationTypes: [],
		pricing: {
			type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			currency: 'USDt'
		},
		skills: [],
		categories: [],
		portfolio: [],
		createdAt: 1_700_000_000,
		creator: {
			username: 'Designer',
			avatar: ''
		},
		...overrides
	} as Service;
}

describe('ServiceCard Keyboard Navigation', () => {
	function titleLink() {
		return screen.getByRole('link', { name: 'Logo Refresh' });
	}

	describe('Tab navigation', () => {
		it('title link is in the tab order without a button role', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const link = titleLink();
			expect(link.tabIndex).toBe(0);
			expect(screen.queryByRole('button', { name: /Logo Refresh/i })).toBeNull();
		});

		it('card is one link to the service', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const link = titleLink();
			expect(link).toHaveAttribute('href', '/services/service-123');
			expect(screen.getAllByRole('link', { name: 'Logo Refresh' })).toHaveLength(1);
		});

		it('Tab key moves focus to the title link', async () => {
			const user = userEvent.setup();
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			await user.tab();

			expect(titleLink()).toHaveFocus();
		});
	});

	describe('Enter key activation', () => {
		it('title link keeps focus when Enter is pressed', async () => {
			const user = userEvent.setup();
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const link = titleLink();
			link.addEventListener('click', (event) => event.preventDefault());
			link.focus();
			await user.keyboard('{Enter}');
			expect(link).toHaveFocus();
		});

		it('calls onclick callback when Enter is pressed on the title link', async () => {
			const user = userEvent.setup();
			const handleClick = vi.fn();

			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000,
				onclick: handleClick
			});

			const link = titleLink();
			link.addEventListener('click', (event) => event.preventDefault());
			link.focus();
			await user.keyboard('{Enter}');

			await waitFor(() => {
				expect(handleClick).toHaveBeenCalled();
			});
		});
	});

	describe('Focus visible indicator', () => {
		it('title link has focus-visible ring classes for keyboard focus styling', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const link = titleLink();
			expect(link.className).toContain('focus-visible:outline-none');
			expect(link.className).toContain('focus-visible:ring-2');
			expect(link.className).toContain('focus-visible:ring-primary');
		});
	});
});

describe('UnifiedFilterDrawer Keyboard Navigation', () => {
	describe('Escape key', () => {
		it('closes drawer when Escape key is pressed', async () => {
			const onClose = vi.fn();
			const user = userEvent.setup();

			render(UnifiedFilterDrawer, {
				isOpen: true,
				title: 'Filters',
				onClose,
				onClear: vi.fn(),
				onApply: vi.fn(),
				clearLabel: 'Clear',
				applyLabel: 'Apply'
			});

			expect(onClose).not.toHaveBeenCalled();

			await user.keyboard('{Escape}');

			await waitFor(() => {
				expect(onClose).toHaveBeenCalledTimes(1);
			});
		});

		it('drawer has role="dialog" and aria-modal="true"', () => {
			render(UnifiedFilterDrawer, {
				isOpen: true,
				title: 'Filters',
				onClose: vi.fn(),
				onClear: vi.fn(),
				onApply: vi.fn(),
				clearLabel: 'Clear',
				applyLabel: 'Apply'
			});

			const drawer = screen.getByRole('dialog');
			expect(drawer).toHaveAttribute('aria-modal', 'true');
		});

		it('drawer has aria-labelledby referencing the title', () => {
			render(UnifiedFilterDrawer, {
				isOpen: true,
				title: 'My Filters',
				onClose: vi.fn(),
				onClear: vi.fn(),
				onApply: vi.fn(),
				clearLabel: 'Clear',
				applyLabel: 'Apply'
			});

			const drawer = screen.getByRole('dialog');
			expect(drawer).toHaveAttribute('aria-labelledby', 'drawer-title');
			expect(screen.getByText('My Filters')).toHaveAttribute('id', 'drawer-title');
		});
	});
});
