import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
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
			title: 'Rush Logo Package',
			description: 'Fixed-price logo package with instant checkout enabled.',
			serviceLocationTypes: [],
			pricing: {
				type: 'FIXED',
				currency: 'USDt',
				amount: 125
			},
			skills: ['Branding'],
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			instantBuyLeadHours: 24,
			instantBuyDeliveryHours: 48
		},
		id: null,
		uniqueId: 'service-123',
		currentStep: 'review',
		isEditing: false,
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
		updateService: vi.fn(),
		createService: vi.fn().mockResolvedValue('event-new'),
		getRSKAddress: vi.fn().mockResolvedValue('0x2222222222222222222222222222222222222222'),
		findServiceByUniqueId: vi.fn(),
		goto: vi.fn(),
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn(),
		loadDraft: vi.fn().mockResolvedValue(undefined),
		saveDraft: vi.fn().mockResolvedValue(undefined),
		clearDraft: vi.fn().mockResolvedValue(undefined),
		setStep: vi.fn(),
		loadServiceForEdit: vi.fn().mockResolvedValue(undefined),
		loadPageTranslations: vi.fn().mockResolvedValue(undefined),
		findMyServices: vi.fn().mockResolvedValue({ services: [], hasMore: false })
	};
});

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/create-service')
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
	walletStore: readable({
		rsk: {
			address: null
		}
	}),
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

describe('create-service instant-buy submit payload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.serviceState.set({
			service: {
				uniqueId: 'service-123',
				createdAt: 1_700_000_000,
				creator: {
					username: 'Provider',
					avatar: ''
				},
				title: 'Rush Logo Package',
				description: 'Fixed-price logo package with instant checkout enabled.',
				serviceLocationTypes: [],
				pricing: {
					type: 'FIXED',
					currency: 'USDt',
					amount: 125
				},
				skills: ['Branding'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }],
				instantBuyLeadHours: 24,
				instantBuyDeliveryHours: 48
			},
			id: null,
			uniqueId: 'service-123',
			currentStep: 'review',
			isEditing: false,
			isDuplicating: false
		});
	});

	it('persists instantBuyDeliveryHours when publishing an instant-buy service', async () => {
		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-service/+page.svelte')).default
		);

		await fireEvent.click(await findByText('dashboard.services.create.publish'));

		await waitFor(() => {
			expect(hoisted.createService).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Rush Logo Package',
					instantBuyLeadHours: 24,
					instantBuyDeliveryHours: 48,
					providerWalletAddress: '0x2222222222222222222222222222222222222222'
				})
			);
		});
		expect(hoisted.getRSKAddress).toHaveBeenCalledTimes(1);

		await waitFor(() => {
			expect(hoisted.goto).toHaveBeenCalledWith(
				expect.stringMatching(/\/earning\?tab=my-services$/)
			);
		});
	}, 10_000);

	it('omits providerWalletAddress for non-instant-buy services even when the store has one', async () => {
		hoisted.serviceState.set({
			service: {
				uniqueId: 'service-123',
				createdAt: 1_700_000_000,
				creator: {
					username: 'Provider',
					avatar: ''
				},
				title: 'Hourly Design Help',
				description: 'Book design time by the hour.',
				serviceLocationTypes: [],
				pricing: {
					type: 'HOURLY',
					currency: 'USDt',
					amount: 0
				},
				skills: ['Branding'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }]
			},
			id: null,
			uniqueId: 'service-123',
			currentStep: 'review',
			isEditing: false,
			isDuplicating: false
		} as unknown as Parameters<typeof hoisted.serviceState.set>[0]);

		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-service/+page.svelte')).default
		);

		await fireEvent.click(await findByText('dashboard.services.create.publish'));

		await waitFor(() => {
			expect(hoisted.createService).toHaveBeenCalledWith(
				expect.not.objectContaining({
					providerWalletAddress: expect.anything()
				})
			);
		});
		expect(hoisted.getRSKAddress).not.toHaveBeenCalled();
	});
});
