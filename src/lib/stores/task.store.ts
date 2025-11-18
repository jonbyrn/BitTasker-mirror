import type { Task, TaskBody } from '$lib/types/task.d';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { page } from '$app/state';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { TaskTypeEnum, BudgetTypeEnum, TaskStepEnum } from '$lib/utils/enums/task.enum';
import { StorageKeys } from '$lib/utils/constants/storage';
import { RecurringFrequencyEnum } from '$lib/utils/enums/task.enum';
import { SimplePool } from 'nostr-tools';
import { appStore } from './app.store';

const CREATE_STORAGE_KEY = StorageKeys.DRAFT_TASK;
const EDIT_STORAGE_KEY = StorageKeys.DRAFT_TASK_EDIT;

export const STEPS = writable([TaskStepEnum.BASICS, TaskStepEnum.LOCATION, TaskStepEnum.BUDGET, TaskStepEnum.REVIEW]);

const getInitialState = () => ({
	task: {
		title: '',
		description: '',
		taskType: TaskTypeEnum.IN_PERSON,
		budget: {
			amount: 0,
			currency: 'USD', // Cambiado de 'SATS' a 'USD'
			type: BudgetTypeEnum.FIXED,
			estimatedHours: 0
		},
		deadline: '',
		dateRange: undefined,
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
	isEditing: false,
	pendingFiles: [] as File[] // Store pending files for deferred upload
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

	// Debounce timer for auto-save
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	const AUTO_SAVE_DELAY = 1000; // 1 second debounce

	// Get the appropriate storage key based on editing mode
	const getStorageKey = (isEditing: boolean = false): string => {
		return isEditing ? EDIT_STORAGE_KEY : CREATE_STORAGE_KEY;
	};

	// Load draft from preferences
	const loadDraft = async (isEditing: boolean = false) => {
		const storageKey = getStorageKey(isEditing);
		const stored = await Preferences.get({ key: storageKey });
		if (stored.value) {
			const parsedData = JSON.parse(stored.value);
			store.update((state) => ({
				...state,
				id: parsedData.id,
				uniqueId: parsedData.uniqueId,
				task: { ...parsedData.task },
				currentStep: parsedData.currentStep || TaskStepEnum.BASICS,
				isEditing: parsedData.isEditing || isEditing,
				recurringTask: { ...parsedData.recurringTask }
			}));
			if (parsedData.recurringTask?.isRecurring) {
				STEPS.update((steps) => [...steps, TaskStepEnum.RECURRING]);
			}
		}
	};

	// Save draft to preferences with debounce
	const saveDraft = async (isEditing: boolean | null = null, immediate: boolean = false) => {
		if (autoSaveTimer && !immediate) {
			clearTimeout(autoSaveTimer);
		}

		const save = async () => {
			const storeData = get(store);
			if (storeData) {
				const editingMode = isEditing !== null ? isEditing : storeData.isEditing;
				const storageKey = getStorageKey(editingMode);
				
				await Preferences.set({
					key: storageKey,
					value: JSON.stringify({
						id: storeData.id,
						uniqueId: storeData.uniqueId,
						currentStep: storeData.currentStep,
						task: storeData.task,
						isEditing: editingMode,
						recurringTask: storeData.recurringTask
					})
				});
			}
		};

		if (immediate) {
			await save();
		} else {
			autoSaveTimer = setTimeout(save, AUTO_SAVE_DELAY);
		}
	};

	const saveEditTaskDraft = async (id: string, uniqueId: string, task: TaskBody) => {
		if (id && task) {
			await Preferences.set({
				key: EDIT_STORAGE_KEY,
				value: JSON.stringify({
					currentStep: TaskStepEnum.BASICS,
					id,
					uniqueId,
					task,
					isEditing: true,
					recurringTask: recurringTask
				})
			});
			// Update store to mark as editing
			store.update((state) => ({
				...state,
				id,
				uniqueId,
				task,
				isEditing: true
			}));
		}
	};

	// Clear draft from preferences
	const clearDraft = async (isEditing: boolean = false) => {
		const storageKey = getStorageKey(isEditing);
		await Preferences.remove({ key: storageKey });
		const freshInitialState = getInitialState();
		const freshRecurringTask = getInitialRecurringTask();
		store.set({ ...freshInitialState, recurringTask: freshRecurringTask, isEditing: false });
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
		const storeData = get(store);
		saveDraft(storeData.isEditing, true); // Immediate save on step change
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

	// Update task data (with auto-save)
	const updateTask = (updates: Partial<TaskBody>, immediate: boolean = false) => {
		store.update((state) => ({
			...state,
			task: { ...state.task, ...updates }
		}));
		const storeData = get(store);
		saveDraft(storeData.isEditing, immediate);
	};

	// Update store data (for non-task fields like pendingFiles)
	const updateStore = (updates: Partial<typeof initialState>, immediate: boolean = false) => {
		store.update((state) => ({
			...state,
			...updates
		}));
		const storeData = get(store);
		saveDraft(storeData.isEditing, immediate);
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
		const storeData = get(store);
		saveDraft(storeData.isEditing, true); // Immediate save on recurring setup
	};

	// Update recurring task data
	const updateRecurringDetails = (updates: Partial<typeof recurringTask>) => {
		store.update((state) => ({
			...state,
			recurringTask: { ...state.recurringTask, ...updates }
		}));
		const storeData = get(store);
		saveDraft(storeData.isEditing);
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
		updateStore,
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
	const pool = get(appStore).pool;

	const { subscribe, set, update } = writable<{
		pool: SimplePool,
		items: Task[],
		loading: boolean,
		error: string | null,
		currentPage: number,
		hasMore: boolean
	}>({
		pool,
		items: [],
		loading: false,
		currentPage: 1,
		hasMore: true,
		error: null
	});

	return {
		pool,
		subscribe,
		set,
		update
	}
})()

// My tasks store
export const myTasksStore = writable<{
	items: Task[],
	loading: boolean,
	error: string | null,
	currentPage: number,
	hasMore: boolean
}>({
	items: [],
	loading: false,
	error: null,
	currentPage: 1,
	hasMore: true
})