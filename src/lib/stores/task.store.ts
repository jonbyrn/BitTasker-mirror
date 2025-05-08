import type { CreateTaskParams } from '$lib/types/task.d';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { TaskStepEnum } from '$lib/utils/enums/task.enum';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { get, writable } from 'svelte/store';
import { RECURRINGFREQUENCYENUM } from '$lib/utils/enums/recurringTask.enums';
import { page } from '$app/state';

const STORAGE_KEY = StorageKeys.DRAFT_TASK;

export const STEPS = writable([TaskStepEnum.BASICS, TaskStepEnum.LOCATION, TaskStepEnum.BUDGET]);

function createTaskStore() {
	const initialState = {
		task: {
			title: '',
			description: '',
			budget: 0,
			budgetType: 'FIXED',
			taskType: 'IN_PERSON',
			deadlineDate: '',
			estimatedHours: 0,
			categoryIds: [],
			skillIds: [],
			pickupLocation: {
				displayName: '',
				longitude: null,
				latitude: null,
				zipCode: '',
				locationLoaded: false
			},
			dropOffLocation: {
				displayName: '',
				longitude: null,
				latitude: null,
				zipCode: '',
				locationLoaded: false
			},
			dateRange: {
				start: new Date().toISOString(),
				end: 'null'
			},
			attachments: []
		} as CreateTaskParams,
		id: '',
		isRemovals: false,
		currentStep: TaskStepEnum.BASICS,
		isEditing: false
	};

	const recurring = page.url.searchParams.get('recurring');

	const recurringTask = {
		isRecurring: recurring == 'true',
		name: '',
		description: '',
		recurrencePattern: {
			frequency: RECURRINGFREQUENCYENUM.WEEKLY,
			interval: 1,
			daysOfWeek: [1], // Monday by default
			dayOfMonth: 1,
			endDate: '',
			maxOccurrences: 12
		}
	};

	const store = writable({ ...initialState, recurringTask });

	// Load draft from preferences
	const loadDraft = async () => {
		const stored = await Preferences.get({ key: STORAGE_KEY });
		if (stored.value) {
			const parsedData = JSON.parse(stored.value);
			store.update((state) => ({
				...state,
				task: { ...parsedData.task },
				currentStep: parsedData.currentStep || TaskStepEnum.BASICS,
				recurringTask: { ...parsedData.recurringTask }
			}));
			if (parsedData.recurringTask.isRecurring) {
				STEPS.update((steps) => [...steps, TaskStepEnum.RECURRING]);
			}
		}
	};

	// Save draft to preferences
	const saveDraft = async () => {
		const storeData = get(store);
		if (storeData) {
			await Preferences.set({
				key: STORAGE_KEY,
				value: JSON.stringify({
					currentStep: storeData.currentStep,
					task: storeData.task,
					recurringTask: storeData.recurringTask
				})
			});
		}
	};

	// Clear draft from preferences
	const clearDraft = async () => {
		await Preferences.remove({ key: STORAGE_KEY });
		store.set({ ...initialState, recurringTask });
	};

	// Navigation between steps
	const nextStep = () => {
		store.update((state) => {
			const steps = get(STEPS);
			const currentIndex = steps.indexOf(state.currentStep);
			if (currentIndex < steps.length - 1) {
				return { ...state, currentStep: steps[currentIndex + 1] };
			}
			return state;
		});
		saveDraft();
	};

	const previousStep = () => {
		store.update((state) => {
			const steps = get(STEPS);
			const currentIndex = steps.indexOf(state.currentStep);
			if (currentIndex === -1 && state.currentStep === TaskStepEnum.RECURRING) {
				return { ...state, currentStep: TaskStepEnum.BUDGET };
			}
			if (currentIndex > 0) {
				return { ...state, currentStep: steps[currentIndex - 1] };
			}
			return state;
		});
	};

	const setStep = (step: TaskStepEnum) => {
		store.update((state) => ({ ...state, currentStep: step }));
	};

	// Update task data
	const updateTask = (updates: Partial<CreateTaskParams>) => {
		store.update((state) => ({
			...state,
			task: { ...state.task, ...updates }
		}));
		saveDraft();
	};

	// Setup recurring task
	const setupRecurringTask = (isRecurring: boolean) => {
		store.update((state) => ({
			...state,
			recurringTask: { ...state.recurringTask, isRecurring }
		}));
		if (isRecurring) {
			STEPS.update((steps) => [...steps, TaskStepEnum.RECURRING]);
		} else {
			STEPS.update((steps) => steps.filter((step) => step !== TaskStepEnum.RECURRING));
		}
		saveDraft();
	};

	// Update recurring task data
	const updateRecurringDetails = (updates: Partial<typeof recurringTask>) => {
		store.update((state) => ({
			...state,
			recurringTask: { ...state.recurringTask, ...updates }
		}));
		saveDraft();
	};

	const updateRecurrencePattern = (updates: Partial<RecurrencePattern>) => {
		updateRecurringDetails({
			recurrencePattern: { ...recurringTask.recurrencePattern, ...updates }
		});
	};

	return {
		set: store.set,
		subscribe: store.subscribe,
		update: store.update,
		STEPS,
		loadDraft,
		saveDraft,
		clearDraft,
		nextStep,
		previousStep,
		setStep,
		updateTask,
		setupRecurringTask,
		updateRecurringDetails,
		updateRecurrencePattern
	};
}

export const taskStore = createTaskStore();
