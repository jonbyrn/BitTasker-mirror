import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import {
	createServiceEditConflictError,
	SERVICE_EDIT_CONFLICT_CODE
} from '$lib/utils/service-edit-conflict';

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
			categories: [{ id: 'design', name: 'Design', slug: 'design' }]
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
		updateService: vi.fn(),
		createService: vi.fn(),
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
			address: '0x2222222222222222222222222222222222222222'
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

describe('create-service edit conflict handling', () => {
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
				title: 'Logo Sprint',
				description: 'Brand identity package',
				serviceLocationTypes: [],
				pricing: {
					type: 'FIXED',
					currency: 'USDt',
					amount: 125
				},
				skills: ['Branding'],
				categories: [{ id: 'design', name: 'Design', slug: 'design' }]
			},
			id: 'event-old',
			uniqueId: 'service-123',
			currentStep: 'review',
			isEditing: true,
			isDuplicating: false
		});
	});

	it('keeps the editor open and surfaces a deterministic conflict message', async () => {
		hoisted.updateService.mockRejectedValueOnce(
			createServiceEditConflictError({
				dTag: 'service-123',
				expectedServiceEventId: 'event-old',
				latestServiceEventId: 'event-new'
			})
		);

		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-service/+page.svelte')).default
		);

		await fireEvent.click(await findByText('dashboard.services.create.publish'));

		await waitFor(() => {
			expect(hoisted.updateService).toHaveBeenCalledWith(
				'service-123',
				expect.objectContaining({
					title: 'Logo Sprint'
				}),
				{
					expectedServiceEventId: 'event-old'
				}
			);
		});
		expect(hoisted.updateService.mock.calls[0]?.[1]).toHaveProperty('providerWalletAddress', undefined);

		await expect(findByText(new RegExp(SERVICE_EDIT_CONFLICT_CODE))).resolves.toBeTruthy();
		expect(hoisted.showErrorToast).toHaveBeenCalledWith(
			expect.stringContaining(SERVICE_EDIT_CONFLICT_CODE)
		);
		expect(hoisted.getRSKAddress).not.toHaveBeenCalled();
		expect(hoisted.goto).not.toHaveBeenCalled();
		expect(hoisted.clearDraft).not.toHaveBeenCalled();
	});
});
