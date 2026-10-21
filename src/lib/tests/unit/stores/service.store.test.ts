import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { serviceStore } from '$lib/stores/service.store';
import { ServicePricingTypeEnum, ServiceStepEnum } from '$lib/utils/enums/service.enum';

vi.mock('$app/state', () => ({
	page: { url: { searchParams: new URLSearchParams() } }
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

describe('service.store', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await serviceStore.clearDraft(false);
		await serviceStore.clearDraft(true);
	});

	it('loads a persisted draft while preserving default service shape', async () => {
		vi.mocked(Preferences.get).mockResolvedValue({
			value: JSON.stringify({
				id: 'service-1',
				uniqueId: 'service-1',
				currentStep: ServiceStepEnum.PRICING,
				service: {
					title: 'Draft Service',
					description: 'Persisted description'
				},
				isEditing: false,
				isDuplicating: true,
				originalServiceId: 'original-service'
			})
		});

		await serviceStore.loadDraft(false);
		const state = get(serviceStore);

		expect(Preferences.get).toHaveBeenCalledWith({ key: 'bittasker_service_draft' });
		expect(state.id).toBe('service-1');
		expect(state.uniqueId).toBe('service-1');
		expect(state.currentStep).toBe(ServiceStepEnum.PRICING);
		expect(state.isDuplicating).toBe(true);
		expect(state.originalServiceId).toBe('original-service');
		expect(state.service.title).toBe('Draft Service');
		expect(state.service.description).toBe('Persisted description');
		expect(state.service.pricing).toEqual({
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USDt',
			amount: 0
		});
	});

	it('persists the updated step immediately on nextStep', async () => {
		serviceStore.set({
			...get(serviceStore),
			isEditing: true,
			currentStep: ServiceStepEnum.BASICS,
			service: {
				...get(serviceStore).service,
				title: 'Immediate save'
			}
		});

		serviceStore.nextStep();

		expect(get(serviceStore).currentStep).toBe(ServiceStepEnum.LOCATION);
		expect(Preferences.set).toHaveBeenCalledTimes(1);
		const persistedDraft = vi.mocked(Preferences.set).mock.calls[0]?.[0];
		expect(persistedDraft?.key).toBe('bittasker_service_edit_draft');
		expect(JSON.parse(persistedDraft?.value ?? '{}')).toEqual(
			expect.objectContaining({
				currentStep: ServiceStepEnum.LOCATION,
				isEditing: true
			})
		);
	});

	it('clears the draft and resets editing-specific flags', async () => {
		serviceStore.set({
			...get(serviceStore),
			id: 'service-2',
			uniqueId: 'service-2',
			isEditing: true,
			isDuplicating: true,
			originalServiceId: 'origin',
			service: {
				...get(serviceStore).service,
				title: 'Reset me'
			}
		});

		await serviceStore.clearDraft(true);
		const state = get(serviceStore);

		expect(Preferences.remove).toHaveBeenCalledWith({ key: 'bittasker_service_edit_draft' });
		expect(state.id).toBe('');
		expect(state.uniqueId).toBe('');
		expect(state.isEditing).toBe(false);
		expect(state.isDuplicating).toBe(false);
		expect(state.originalServiceId).toBe(null);
		expect(state.service.title).toBe('');
	});
});
