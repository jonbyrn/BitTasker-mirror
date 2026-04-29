import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { createDraftWizardStore } from '$lib/stores/factories/createDraftWizardStore';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

type WizardState = {
	id: string;
	currentStep: 'basics' | 'details' | 'review';
	isEditing: boolean;
	value: string;
};

function createWizard() {
	const stepsStore = writable<WizardState['currentStep'][]>(['basics', 'details', 'review']);

	return createDraftWizardStore<WizardState, WizardState['currentStep'], WizardState>({
		initialState: {
			id: '',
			currentStep: 'basics',
			isEditing: false,
			value: ''
		},
		stepsStore,
		getStorageKey: (isEditing = false) => (isEditing ? 'draft:edit' : 'draft:create'),
		getCurrentStep: (state) => state.currentStep,
		setCurrentStep: (state, step) => ({ ...state, currentStep: step }),
		getIsEditing: (state) => state.isEditing,
		readDraft: (payload, { isEditing, state }) => ({
			...state,
			...payload,
			isEditing: payload.isEditing || isEditing
		}),
		writeDraft: (state, isEditing) => ({
			...state,
			isEditing
		}),
		resetState: () => ({
			id: '',
			currentStep: 'basics',
			isEditing: false,
			value: ''
		}),
		resolvePreviousStep: ({ state, currentStep }) => {
			if (state.value === 'jump-to-start' && currentStep === 'review') {
				return 'basics';
			}
			return null;
		},
		autoSaveDelayMs: 25
	});
}

describe('createDraftWizardStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it('loads a persisted draft and merges it through the reader contract', async () => {
		vi.mocked(Preferences.get).mockResolvedValue({
			value: JSON.stringify({
				id: 'draft-1',
				currentStep: 'details',
				isEditing: false,
				value: 'persisted'
			})
		});

		const wizard = createWizard();
		await wizard.loadDraft(true);

		expect(Preferences.get).toHaveBeenCalledWith({ key: 'draft:edit' });
		expect(get(wizard)).toEqual({
			id: 'draft-1',
			currentStep: 'details',
			isEditing: true,
			value: 'persisted'
		});
	});

	it('does nothing when no persisted draft exists', async () => {
		vi.mocked(Preferences.get).mockResolvedValue({ value: null });

		const wizard = createWizard();
		await wizard.loadDraft(false);

		expect(get(wizard)).toEqual({
			id: '',
			currentStep: 'basics',
			isEditing: false,
			value: ''
		});
	});

	it('persists immediately with the resolved storage key', async () => {
		const wizard = createWizard();
		wizard.update((state) => ({
			...state,
			id: 'draft-2',
			value: 'ready',
			isEditing: true
		}));

		await wizard.saveDraft(null, true);

		expect(Preferences.set).toHaveBeenCalledWith({
			key: 'draft:edit',
			value: JSON.stringify({
				id: 'draft-2',
				currentStep: 'basics',
				isEditing: true,
				value: 'ready'
			})
		});
	});

	it('debounces non-immediate saves', async () => {
		vi.useFakeTimers();
		const wizard = createWizard();
		wizard.update((state) => ({ ...state, value: 'debounced' }));

		const pendingSave = wizard.saveDraft(false, false);
		expect(Preferences.set).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(25);
		await pendingSave;

		expect(Preferences.set).toHaveBeenCalledTimes(1);
		expect(Preferences.set).toHaveBeenCalledWith({
			key: 'draft:create',
			value: JSON.stringify({
				id: '',
				currentStep: 'basics',
				isEditing: false,
				value: 'debounced'
			})
		});
	});

	it('derives the editing storage key from state when saveDraft receives null', async () => {
		vi.useFakeTimers();
		const wizard = createWizard();
		wizard.update((state) => ({
			...state,
			id: 'draft-9',
			isEditing: true,
			value: 'state-editing'
		}));

		await wizard.saveDraft(null, false);
		await vi.advanceTimersByTimeAsync(25);

		expect(Preferences.set).toHaveBeenCalledWith({
			key: 'draft:edit',
			value: JSON.stringify({
				id: 'draft-9',
				currentStep: 'basics',
				isEditing: true,
				value: 'state-editing'
			})
		});
	});

	it('advances steps and persists on nextStep', async () => {
		const wizard = createWizard();

		wizard.nextStep();

		expect(get(wizard).currentStep).toBe('details');
		expect(Preferences.set).toHaveBeenCalledWith({
			key: 'draft:create',
			value: JSON.stringify({
				id: '',
				currentStep: 'details',
				isEditing: false,
				value: ''
			})
		});
	});

	it('does not advance past the last step', async () => {
		const wizard = createWizard();
		wizard.set({
			id: '',
			currentStep: 'review',
			isEditing: false,
			value: ''
		});

		wizard.nextStep();

		expect(get(wizard).currentStep).toBe('review');
		expect(Preferences.set).toHaveBeenCalledTimes(1);
		expect(JSON.parse(vi.mocked(Preferences.set).mock.calls[0]?.[0]?.value ?? '{}')).toEqual(
			expect.objectContaining({
				currentStep: 'review'
			})
		);
	});

	it('uses the custom previous-step resolver when provided', () => {
		const wizard = createWizard();
		wizard.set({
			id: 'draft-4',
			currentStep: 'review',
			isEditing: false,
			value: 'jump-to-start'
		});

		wizard.previousStep();

		expect(get(wizard).currentStep).toBe('basics');
	});

	it('falls back to the previous configured step when no custom resolution exists', () => {
		const wizard = createWizard();
		wizard.set({
			id: 'draft-5',
			currentStep: 'review',
			isEditing: false,
			value: 'normal-back'
		});

		wizard.previousStep();

		expect(get(wizard).currentStep).toBe('details');
	});

	it('leaves the current step unchanged when already at the beginning', () => {
		const wizard = createWizard();

		wizard.previousStep();

		expect(get(wizard).currentStep).toBe('basics');
	});

	it('updates the current step explicitly through setStep', () => {
		const wizard = createWizard();

		wizard.setStep('review');

		expect(get(wizard).currentStep).toBe('review');
	});

	it('clears the persisted draft and resets state', async () => {
		const wizard = createWizard();
		wizard.update((state) => ({
			...state,
			id: 'draft-3',
			currentStep: 'review',
			value: 'clear me'
		}));

		await wizard.clearDraft(true);

		expect(Preferences.remove).toHaveBeenCalledWith({ key: 'draft:edit' });
		expect(get(wizard)).toEqual({
			id: '',
			currentStep: 'basics',
			isEditing: false,
			value: ''
		});
	});

	it('cancels a pending debounce save when clearing the draft', async () => {
		vi.useFakeTimers();
		const wizard = createWizard();
		wizard.update((state) => ({ ...state, value: 'pending' }));

		await wizard.saveDraft(false, false);
		await wizard.clearDraft(false);
		await vi.advanceTimersByTimeAsync(30);

		expect(Preferences.set).not.toHaveBeenCalled();
		expect(Preferences.remove).toHaveBeenCalledWith({ key: 'draft:create' });
	});
});
