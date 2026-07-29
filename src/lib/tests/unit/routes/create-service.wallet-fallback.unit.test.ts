import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';

const hoisted = vi.hoisted(() => {
	let value = {
		service: {
			uniqueId: 'service-123',
			createdAt: 1_700_000_000,
			creator: {
				username: 'Provider',
				avatar: ''
			},
			title: 'Logo Sprint',
			description: 'Brand identity package',
			serviceLocationTypes: [],
			pricing: {
				type: 'FIXED',
				currency: 'USDt',
				amount: 125
			},
			skills: ['Branding'],
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			instantBuyLeadHours: 24,
			instantBuyDeliveryHours: 48,
			providerWalletAddress: '0x1111111111111111111111111111111111111111'
		},
		id: 'event-old',
		uniqueId: 'service-123',
		currentStep: 'review',
		isEditing: true,
		isDuplicating: false
	};
	const subscribers = new Set<(nextValue: typeof value) => void>();
	const serviceState = {
		subscribe(run: (nextValue: typeof value) => void) {
			run(value);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		set(nextValue: typeof value) {
			value = nextValue;
			subscribers.forEach((run) => run(value));
		},
		update(updater: (currentValue: typeof value) => typeof value) {
			serviceState.set(updater(value));
		}
	};

	return {
		serviceState,
		updateService: vi.fn().mockResolvedValue('event-new'),
		createService: vi.fn(),
		getRSKAddress: vi.fn().mockResolvedValue('0x2222222222222222222222222222222222222222'),
		findServiceByUniqueId: vi.fn().mockResolvedValue({
			id: 'event-old',
			uniqueId: 'service-123',
			title: 'Logo Sprint',
			description: 'Brand identity package',
			pricing: { type: 'FIXED', amount: 125, currency: 'USDt' },
			instantBuyLeadHours: 24,
			instantBuyDeliveryHours: 48,
			providerWalletAddress: '0x1111111111111111111111111111111111111111',
			creator: { username: 'Provider', avatar: '' },
			status: 'active'
		}),
		goto: vi.fn(),
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn(),
		loadDraft: vi.fn().mockResolvedValue(undefined),
		saveDraft: vi.fn().mockResolvedValue(undefined),
		clearDraft: vi.fn().mockResolvedValue(undefined),
		setStep: vi.fn(),
		loadServiceForEdit: vi.fn().mockResolvedValue(undefined),
		loadPageTranslations: vi.fn().mockResolvedValue(undefined),
		findMyServices: vi.fn().mockResolvedValue({ services: [], hasMore: false }),
		rskAddress: null as string | null
	};
});

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/create-service?edit=true&serviceId=service-123')
	})
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.goto>) => hoisted.goto(...args)
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: hoisted.showErrorToast,
		showSuccessToast: hoisted.showSuccessToast
	}
}));

vi.mock('$lib/stores/user.store', () => ({
	user: readable({
		name: 'Provider'
	})
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: (run: (val: unknown) => void) => {
			run({ rsk: { address: hoisted.rskAddress } });
			return () => {};
		}
	},
	getRSKAddress: (...args: Parameters<typeof hoisted.getRSKAddress>) =>
		hoisted.getRSKAddress(...args)
}));

vi.mock('$lib/i18n/routeTranslations', () => ({
	loadPageTranslations: (...args: Parameters<typeof hoisted.loadPageTranslations>) =>
		hoisted.loadPageTranslations(...args)
}));

vi.mock('$lib/nostr/service', () => ({
	createService: (...args: Parameters<typeof hoisted.createService>) =>
		hoisted.createService(...args),
	updateService: (...args: Parameters<typeof hoisted.updateService>) =>
		hoisted.updateService(...args),
	findServiceByUniqueId: (...args: Parameters<typeof hoisted.findServiceByUniqueId>) =>
		hoisted.findServiceByUniqueId(...args)
}));

vi.mock('$lib/nostr/findServices', () => ({
	findMyServices: (...args: Parameters<typeof hoisted.findMyServices>) =>
		hoisted.findMyServices(...args)
}));

vi.mock('$lib/stores/service.store', () => ({
	serviceStore: {
		subscribe: hoisted.serviceState.subscribe,
		set: hoisted.serviceState.set,
		update: hoisted.serviceState.update,
		loadDraft: hoisted.loadDraft,
		saveDraft: hoisted.saveDraft,
		clearDraft: hoisted.clearDraft,
		setStep: hoisted.setStep,
		loadServiceForEdit: hoisted.loadServiceForEdit
	},
	STEPS: readable(['review']),
	myServicesStore: {
		update: vi.fn()
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

// Mock step components to avoid deep rendering
vi.mock('$lib/components/service/steps/ServiceBasics.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/steps/ServiceLocation.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/steps/ServicePricing.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/steps/ServiceTiers.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/steps/ServiceAddOns.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/steps/ServiceFAQs.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/steps/InquiryFormBuilder.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/service/steps/ServicePortfolio.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/service/steps/ServiceReview.svelte', () => ({ default: () => null }));

describe('create-service wallet fallback and removal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.rskAddress = null;
		hoisted.serviceState.set({
			service: {
				uniqueId: 'service-123',
				createdAt: 1_700_000_000,
				creator: {
					username: 'Provider',
					avatar: ''
				},
				title: 'Logo Sprint',
				description: 'Brand identity package',
				serviceLocationTypes: [],
				pricing: {
					type: 'FIXED',
					currency: 'USDt',
					amount: 125
				},
				skills: ['Branding'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				instantBuyLeadHours: 24,
				instantBuyDeliveryHours: 48,
				providerWalletAddress: '0x1111111111111111111111111111111111111111'
			},
			id: 'event-old',
			uniqueId: 'service-123',
			currentStep: 'review',
			isEditing: true,
			isDuplicating: false
		});
	});

	it('skips getRSKAddress and reuses the stored wallet address if already present', async () => {
		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-service/+page.svelte')).default
		);

		await fireEvent.click(await findByText('dashboard.services.create.update'));

		await waitFor(() => {
			expect(hoisted.updateService).toHaveBeenCalledWith(
				'service-123',
				expect.objectContaining({
					providerWalletAddress: '0x1111111111111111111111111111111111111111'
				}),
				{ expectedServiceEventId: 'event-old' }
			);
		});
		// Should NOT call getRSKAddress because we already have one in the store
		expect(hoisted.getRSKAddress).not.toHaveBeenCalled();
	});

	it('calls getRSKAddress if no wallet is connected AND no address is stored', async () => {
		// Clear stored address
		hoisted.serviceState.update((state) => ({
			...state,
			service: {
				...state.service,
				providerWalletAddress: undefined as unknown as string
			}
		}));

		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-service/+page.svelte')).default
		);

		await fireEvent.click(await findByText('dashboard.services.create.update'));

		await waitFor(() => {
			expect(hoisted.updateService).toHaveBeenCalledWith(
				'service-123',
				expect.objectContaining({
					providerWalletAddress: '0x2222222222222222222222222222222222222222'
				}),
				{ expectedServiceEventId: 'event-old' }
			);
		});
		expect(hoisted.getRSKAddress).toHaveBeenCalledTimes(1);
	});

	it('removes providerWalletAddress when instantBuyLeadHours is cleared', async () => {
		// Disable Book Now by clearing lead hours
		hoisted.serviceState.update((state) => ({
			...state,
			service: {
				...state.service,
				instantBuyLeadHours: undefined as unknown as number,
				instantBuyDeliveryHours: undefined as unknown as number
			}
		}));

		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-service/+page.svelte')).default
		);

		await fireEvent.click(await findByText('dashboard.services.create.update'));

		await waitFor(() => {
			expect(hoisted.updateService).toHaveBeenCalledWith(
				'service-123',
				expect.objectContaining({
					providerWalletAddress: undefined
				}),
				{ expectedServiceEventId: 'event-old' }
			);
		});
		expect(hoisted.getRSKAddress).not.toHaveBeenCalled();
	});

	it('prefers the connected wallet over the stored address', async () => {
		hoisted.rskAddress = '0x9999999999999999999999999999999999999999';

		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-service/+page.svelte')).default
		);

		await fireEvent.click(await findByText('dashboard.services.create.update'));

		await waitFor(() => {
			expect(hoisted.updateService).toHaveBeenCalledWith(
				'service-123',
				expect.objectContaining({
					providerWalletAddress: '0x9999999999999999999999999999999999999999'
				}),
				{ expectedServiceEventId: 'event-old' }
			);
		});
	});
});
