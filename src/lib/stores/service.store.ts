import type { Service, ServiceBody } from '$lib/types/service.d';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { ServiceStepEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { StorageKeys } from '$lib/utils/constants/storage';
import { SimplePool } from 'nostr-tools';
import { appStore } from './app.store';
import { createDraftWizardStore } from './factories/createDraftWizardStore';

const CREATE_STORAGE_KEY = StorageKeys.DRAFT_SERVICE;
const EDIT_STORAGE_KEY = StorageKeys.DRAFT_SERVICE_EDIT;

export const SERVICES_PER_PAGE = 10;

export const STEPS = writable([
	ServiceStepEnum.BASICS,
	ServiceStepEnum.LOCATION,
	ServiceStepEnum.PRICING,
	ServiceStepEnum.TIERS,
	ServiceStepEnum.ADD_ONS,
	ServiceStepEnum.FAQS,
	ServiceStepEnum.INQUIRY_FORM,
	ServiceStepEnum.PORTFOLIO,
	ServiceStepEnum.REVIEW
]);

const getInitialState = () => ({
	service: {
		title: '',
		description: '',
		serviceLocationTypes: [],
		locationDetails: undefined,
		pricing: {
			type: ServicePricingTypeEnum.TIERED,
			currency: 'USDt',
			amount: 0
		},
		instantBuyLeadHours: undefined,
		instantBuyDeliveryHours: undefined,
		skills: [],
		categories: [],
		portfolio: [],
		faqs: [],
		status: 'inactive' as const, // Draft status
		uniqueId: '',
		createdAt: 0,
		creator: {
			username: '',
			avatar: ''
		}
	} as Partial<ServiceBody>,
	id: '',
	uniqueId: '',
	isLoading: false,
	error: null as string | null,
	currentStep: ServiceStepEnum.BASICS,
	isEditing: false,
	isDuplicating: false,
	originalServiceId: null as string | null,
	pendingFiles: [] as File[] // Store pending files for deferred upload
});

const initialState = getInitialState();

function createServiceStore() {
	let isEditMode = false;
	let isDuplicateMode = false;
	let serviceIdParam: string | null = null;

	// Detect mode from URL query parameters
	if (browser) {
		const editParam = page.url.searchParams.get('edit');
		const duplicateParam = page.url.searchParams.get('duplicate');
		serviceIdParam = page.url.searchParams.get('serviceId');
		isEditMode = editParam === 'true' && Boolean(serviceIdParam);
		isDuplicateMode = duplicateParam === 'true' && Boolean(serviceIdParam);
	}

	type StoreState = typeof initialState & {
		isEditing: boolean;
		isDuplicating: boolean;
		originalServiceId: string | null;
	};
	type ServiceDraftPayload = {
		id: string;
		uniqueId: string;
		currentStep: ServiceStepEnum;
		service: Partial<ServiceBody>;
		isEditing: boolean;
		isDuplicating: boolean;
		originalServiceId: string | null;
	};

	const store = createDraftWizardStore<StoreState, ServiceStepEnum, ServiceDraftPayload>({
		initialState: {
			...initialState,
			isEditing: isEditMode,
			isDuplicating: isDuplicateMode,
			originalServiceId: serviceIdParam || null
		},
		stepsStore: STEPS,
		getStorageKey: (isEditing = false) => (isEditing ? EDIT_STORAGE_KEY : CREATE_STORAGE_KEY),
		getCurrentStep: (state) => state.currentStep,
		setCurrentStep: (state, step) => ({ ...state, currentStep: step }),
		getIsEditing: (state) => Boolean(state.isEditing),
		readDraft: (parsedData, { isEditing, state }) => {
			const initialService = getInitialState().service;
			return {
				...state,
				id: parsedData.id || '',
				uniqueId: parsedData.uniqueId || '',
				service: { ...initialService, ...parsedData.service } as Partial<ServiceBody>,
				currentStep: parsedData.currentStep || ServiceStepEnum.BASICS,
				isEditing: Boolean(parsedData.isEditing ?? isEditing),
				isDuplicating: Boolean(parsedData.isDuplicating ?? false),
				originalServiceId: parsedData.originalServiceId || null
			};
		},
		writeDraft: (state, isEditing) => ({
			id: state.id,
			uniqueId: state.uniqueId,
			currentStep: state.currentStep,
			service: state.service,
			isEditing,
			isDuplicating: state.isDuplicating,
			originalServiceId: state.originalServiceId
		}),
		resetState: () => ({
			...getInitialState(),
			isEditing: false,
			isDuplicating: false,
			originalServiceId: null
		})
	});
	const saveDraft = store.saveDraft;

	// Save edit service draft
	const saveEditServiceDraft = async (
		id: string,
		uniqueId: string,
		service: Partial<ServiceBody>
	) => {
		if (id && service) {
			await Preferences.set({
				key: EDIT_STORAGE_KEY,
				value: JSON.stringify({
					currentStep: ServiceStepEnum.BASICS,
					id,
					uniqueId,
					service,
					isEditing: true,
					isDuplicating: false,
					originalServiceId: id
				})
			});
			// Update store to mark as editing
			store.update((state) => ({
				...state,
				id,
				uniqueId,
				service,
				isEditing: true as boolean,
				isDuplicating: false as boolean,
				originalServiceId: id
			}));
		}
	};

	// Update service data (with auto-save)
	const updateService = (updates: Partial<ServiceBody>, immediate: boolean = false) => {
		store.update((state) => ({
			...state,
			service: { ...state.service, ...updates } as Partial<ServiceBody>
		}));
		saveDraft(Boolean(get(store).isEditing), immediate);
	};

	// Update store data (for non-service fields like pendingFiles, isLoading, error)
	const updateStore = (updates: Partial<typeof initialState>, immediate: boolean = false) => {
		store.update((state) => ({
			...state,
			...updates
		}));
		saveDraft(Boolean(get(store).isEditing), immediate);
	};

	// Load service for edit mode
	const loadServiceForEdit = async (serviceId: string, service: Service) => {
		// Remove event metadata fields that shouldn't be in form data

		const { id: _id, npub: _npub, updatedAt: _updatedAt, ...serviceData } = service;

		// Keep portfolio files (they're part of the service data)
		store.update((state) => ({
			...state,
			id: service.id,
			uniqueId: service.uniqueId,
			service: {
				...serviceData,
				// Ensure status is preserved
				status: service.status
			} as Partial<ServiceBody>,
			isEditing: true as boolean,
			isDuplicating: false as boolean,
			originalServiceId: service.id
		}));

		// Save to edit draft
		await saveDraft(true, true);
	};

	// Load service for duplicate mode
	const loadServiceForDuplicate = async (serviceId: string, service: Service) => {
		// Remove fields that shouldn't be duplicated: id, uniqueId, createdAt, updatedAt, npub, status, translations
		// Keep portfolio files (they're part of the service data and should be duplicated)

		const {
			id: _id,
			uniqueId: _uniqueId,
			createdAt: _createdAt,
			updatedAt: _updatedAt,
			npub: _npub,
			status: _status,
			translations: _translations,
			...serviceData
		} = service;

		store.update((state) => ({
			...state,
			id: '',
			uniqueId: '',
			service: {
				...serviceData,
				// Set to inactive draft status
				status: 'inactive' as const,
				// Remove translations (will be regenerated on publish)
				translations: undefined
			} as Partial<ServiceBody>,
			isEditing: false as boolean,
			isDuplicating: true as boolean,
			originalServiceId: service.id
		}));

		// Save to create draft (duplicate mode uses CREATE_STORAGE_KEY)
		await saveDraft(false, true);
	};

	return {
		set: store.set,
		subscribe: store.subscribe,
		update: store.update,
		STEPS,
		loadDraft: store.loadDraft,
		saveDraft: store.saveDraft,
		clearDraft: store.clearDraft,
		nextStep: store.nextStep,
		previousStep: store.previousStep,
		setStep: store.setStep,
		updateService,
		updateStore,
		saveEditServiceDraft,
		loadServiceForEdit,
		loadServiceForDuplicate
	};
}

// Create service store
export const serviceStore = createServiceStore();

// Find services store
export const servicesStore = (() => {
	let pool = get(appStore).pool;

	const unsubscribe = appStore.subscribe((state) => {
		if (state.pool !== pool) {
			pool = state.pool;
		}
	});

	const { subscribe, set, update } = writable<{
		pool: SimplePool;
		items: Service[];
		loading: boolean;
		error: string | null;
		currentPage: number;
		hasMore: boolean;
		searchParamsKey: string;
		lastRelayTimestamp: number | undefined;
	}>({
		pool,
		items: [],
		loading: false,
		currentPage: 1,
		hasMore: true,
		error: null,
		searchParamsKey: '',
		lastRelayTimestamp: undefined
	});

	return {
		pool,
		subscribe,
		set,
		update,
		destroy: () => unsubscribe()
	};
})();

// My services store
export const myServicesStore = writable<{
	items: Service[];
	loading: boolean;
	error: string | null;
	currentPage: number;
	hasMore: boolean;
}>({
	items: [],
	loading: false,
	error: null,
	currentPage: 1,
	hasMore: true
});
