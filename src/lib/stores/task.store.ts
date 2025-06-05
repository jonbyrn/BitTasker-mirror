import type { Task, TaskBody } from '$lib/types/task.d';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { page } from '$app/state';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { TaskTypeEnum, BudgetTypeEnum, TaskStepEnum } from '$lib/utils/enums/task.enum';
import { StorageKeys } from '$lib/utils/constants/storage';
import { RecurringFrequencyEnum } from '$lib/utils/enums/task.enum';
import { getTaskById } from '$lib/nostr/task';

const STORAGE_KEY = StorageKeys.DRAFT_TASK;

export const STEPS = writable([TaskStepEnum.BASICS, TaskStepEnum.LOCATION, TaskStepEnum.BUDGET, TaskStepEnum.TASKBOOST, TaskStepEnum.REVIEW]);

function createTaskStore() {
	const initialState = {
		task: {
			title: '',
			description: '',
			taskType: TaskTypeEnum.IN_PERSON,
			budget: {
				amount: 0,
				currency: 'BTC',
				type: BudgetTypeEnum.FIXED,
				estimatedHours: 0
			},
			deadlineDate: '',
			dateRange: {
				start: new Date().toISOString(),
				end: 'null'
			},
			categories: [],
			skills: [],
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
			attachments: []
		} as TaskBody,
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
			frequency: RecurringFrequencyEnum.WEEKLY,
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

	const saveEditTaskDraft = async (id: string, task: TaskBody) => {
		if (id && task) {
			await Preferences.set({
				key: STORAGE_KEY,
				value: JSON.stringify({
					currentStep: TaskStepEnum.BASICS,
					task: task,
					recurringTask: recurringTask
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
	const updateTask = (updates: Partial<TaskBody>) => {
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
		updateRecurrencePattern,
		saveEditTaskDraft
	};
}

export const taskStore = createTaskStore();
