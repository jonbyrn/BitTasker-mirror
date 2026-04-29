import { Preferences } from '@capacitor/preferences';
import { get, writable, type Writable } from 'svelte/store';

type DraftReaderContext<State> = {
	isEditing: boolean;
	state: State;
};

type StepNavigationContext<State, Step> = {
	steps: Step[];
	state: State;
	currentStep: Step;
	currentIndex: number;
};

export interface DraftWizardFactoryOptions<State, Step, DraftPayload> {
	initialState: State;
	stepsStore: Writable<Step[]>;
	getStorageKey: (isEditing?: boolean) => string;
	getCurrentStep: (state: State) => Step;
	setCurrentStep: (state: State, step: Step) => State;
	getIsEditing: (state: State) => boolean;
	readDraft: (payload: DraftPayload, context: DraftReaderContext<State>) => State;
	writeDraft: (state: State, isEditing: boolean) => DraftPayload;
	resetState: () => State;
	resolvePreviousStep?: (context: StepNavigationContext<State, Step>) => Step | null;
	autoSaveDelayMs?: number;
}

export interface DraftWizardController<State, Step> {
	subscribe: ReturnType<typeof writable<State>>['subscribe'];
	set: ReturnType<typeof writable<State>>['set'];
	update: ReturnType<typeof writable<State>>['update'];
	loadDraft: (isEditing?: boolean) => Promise<void>;
	saveDraft: (isEditing?: boolean | null, immediate?: boolean) => Promise<void>;
	clearDraft: (isEditing?: boolean) => Promise<void>;
	nextStep: () => void;
	previousStep: () => void;
	setStep: (step: Step) => void;
}

export function createDraftWizardStore<State, Step, DraftPayload>(
	options: DraftWizardFactoryOptions<State, Step, DraftPayload>
): DraftWizardController<State, Step> {
	const {
		initialState,
		stepsStore,
		getStorageKey,
		getCurrentStep,
		setCurrentStep,
		getIsEditing,
		readDraft,
		writeDraft,
		resetState,
		resolvePreviousStep,
		autoSaveDelayMs = 1000
	} = options;

	const store = writable(initialState);
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	async function loadDraft(isEditing = false): Promise<void> {
		const storageKey = getStorageKey(isEditing);
		const stored = await Preferences.get({ key: storageKey });
		if (!stored.value) {
			return;
		}

		const parsedData = JSON.parse(stored.value) as DraftPayload;
		store.update((state) => readDraft(parsedData, { isEditing, state }));
	}

	async function saveDraft(isEditing: boolean | null = null, immediate = false): Promise<void> {
		if (autoSaveTimer && !immediate) {
			clearTimeout(autoSaveTimer);
		}

		const persist = async () => {
			const state = get(store);
			const editingMode = isEditing !== null ? isEditing : getIsEditing(state);
			await Preferences.set({
				key: getStorageKey(editingMode),
				value: JSON.stringify(writeDraft(state, editingMode))
			});
		};

		if (immediate) {
			await persist();
			return;
		}

		autoSaveTimer = setTimeout(() => {
			void persist();
		}, autoSaveDelayMs);
	}

	async function clearDraft(isEditing = false): Promise<void> {
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
			autoSaveTimer = null;
		}
		await Preferences.remove({ key: getStorageKey(isEditing) });
		store.set(resetState());
	}

	function nextStep(): void {
		store.update((state) => {
			const steps = get(stepsStore);
			const currentStep = getCurrentStep(state);
			const currentIndex = steps.indexOf(currentStep);

			if (currentIndex < 0 || currentIndex >= steps.length - 1) {
				return state;
			}

			return setCurrentStep(state, steps[currentIndex + 1]);
		});

		void saveDraft(getIsEditing(get(store)), true);
	}

	function previousStep(): void {
		store.update((state) => {
			const steps = get(stepsStore);
			const currentStep = getCurrentStep(state);
			const currentIndex = steps.indexOf(currentStep);

			if (resolvePreviousStep) {
				const resolvedStep = resolvePreviousStep({
					steps,
					state,
					currentStep,
					currentIndex
				});
				if (resolvedStep != null) {
					return setCurrentStep(state, resolvedStep);
				}
			}

			if (currentIndex <= 0) {
				return state;
			}

			return setCurrentStep(state, steps[currentIndex - 1]);
		});
	}

	function setStep(step: Step): void {
		store.update((state) => setCurrentStep(state, step));
	}

	return {
		subscribe: store.subscribe,
		set: store.set,
		update: store.update,
		loadDraft,
		saveDraft,
		clearDraft,
		nextStep,
		previousStep,
		setStep
	};
}
