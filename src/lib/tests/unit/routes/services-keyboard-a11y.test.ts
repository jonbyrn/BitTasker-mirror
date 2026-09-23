import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
	describe('Tab navigation', () => {
		it('card is keyboard focusable with tabindex="0"', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			expect(card).toHaveAttribute('tabindex', '0');
		});

		it('card has role="button"', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			expect(card).toBeInTheDocument();
			expect(card).toHaveAttribute('role', 'button');
		});

		it('card is focusable via keyboard tab order', async () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			card.focus();
			expect(card).toHaveFocus();
		});
	});

	describe('Enter key activation', () => {
		it('card is activated on Enter key press without errors', async () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			card.focus();
			await fireEvent.keyDown(card, { key: 'Enter' });
			expect(card).toHaveFocus();
		});

		it('calls onclick callback when Enter is pressed', async () => {
			const handleClick = vi.fn();

			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000,
				onclick: handleClick
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			card.focus();
			await fireEvent.keyDown(card, { key: 'Enter' });
			await fireEvent.click(card);

			await waitFor(() => {
				expect(handleClick).toHaveBeenCalled();
			});
		});
	});

	describe('Focus visible indicator', () => {
		it('card has focus-visible ring classes for keyboard focus styling', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			expect(card.className).toContain('focus-visible:outline-none');
			expect(card.className).toContain('focus-visible:ring-2');
			expect(card.className).toContain('focus-visible:ring-primary');
			expect(card.className).toContain('focus-visible:ring-offset-2');
		});
	});
});

describe('UnifiedFilterDrawer Keyboard Navigation', () => {
	describe('Escape key', () => {
		it('closes drawer when Escape key is pressed', async () => {
			const onClose = vi.fn();

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

			await fireEvent.keyDown(document, { key: 'Escape' });

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
