import type { Task, TaskBody } from '$lib/types/task.d';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { page } from '$app/state';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { TaskTypeEnum, BudgetTypeEnum, TaskStepEnum } from '$lib/utils/enums/task.enum';
import { StorageKeys } from '$lib/utils/constants/storage';
import { RecurringFrequencyEnum } from '$lib/utils/enums/task.enum';
import { SimplePool } from 'nostr-tools';

const STORAGE_KEY = StorageKeys.DRAFT_TASK;

export const STEPS = writable([TaskStepEnum.BASICS, TaskStepEnum.LOCATION, TaskStepEnum.BUDGET, TaskStepEnum.REVIEW]);

const getInitialState = () => ({
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
			start: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(),
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
	uniqueId: '',
	isRemovals: false,
	currentStep: TaskStepEnum.BASICS,
	isEditing: false
});

const getInitialRecurringTask = () => ({
	isRecurring: false,
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
});

const initialState = getInitialState();
const recurringTask = getInitialRecurringTask();

function createTaskStore() {
	const recurring = page.url.searchParams.get('recurring');
	recurringTask.isRecurring = recurring == 'true';

	const store = writable({ ...initialState, recurringTask });

	// Load draft from preferences
	const loadDraft = async () => {
		const stored = await Preferences.get({ key: STORAGE_KEY });
		if (stored.value) {
			const parsedData = JSON.parse(stored.value);
			store.update((state) => ({
				...state,
				id: parsedData.id,
				uniqueId: parsedData.uniqueId,
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
					id: storeData.id,
					uniqueId: storeData.uniqueId,
					currentStep: storeData.currentStep,
					task: storeData.task,
					recurringTask: storeData.recurringTask
				})
			});
		}
	};

	const saveEditTaskDraft = async (id: string, uniqueId: string, task: TaskBody) => {
		if (id && task) {
			await Preferences.set({
				key: STORAGE_KEY,
				value: JSON.stringify({
					currentStep: TaskStepEnum.BASICS,
					id,
					uniqueId,
					task,
					recurringTask: recurringTask
				})
			});
		}
	};

	// Clear draft from preferences
	const clearDraft = async () => {
		await Preferences.remove({ key: STORAGE_KEY });
		const freshInitialState = getInitialState();
		const freshRecurringTask = getInitialRecurringTask();
		store.set({ ...freshInitialState, recurringTask: freshRecurringTask });
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

// Create task store
export const taskStore = createTaskStore();

// Find tasks store
export const tasksStore = (() => {
	const { subscribe, set, update } = writable<{
		pool: SimplePool,
		items: Task[],
		loading: boolean,
		error: string | null,
		currentPage: number,
		hasMore: boolean
	}>({
		pool: new SimplePool(),
		items: [],
		loading: false,
		currentPage: 1,
		hasMore: true,
		error: null
	});

	return {
		pool: new SimplePool(),
		subscribe,
		set,
		update
	}
})()

// My tasks store
export const myTasksStore = writable<{
	items: Task[],
	loading: boolean,
	error: string | null
}>({
	items: [],
	loading: false,
	error: null
})