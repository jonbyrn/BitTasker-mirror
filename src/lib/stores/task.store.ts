import type { Task, TaskBody } from '$lib/types/task.d';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { TaskTypeEnum, BudgetTypeEnum, TaskStepEnum } from '$lib/utils/enums/task.enum';
import { StorageKeys } from '$lib/utils/constants/storage';
import { RecurringFrequencyEnum } from '$lib/utils/enums/task.enum';
import { SimplePool } from 'nostr-tools';
import { appStore } from './app.store';
import { createDraftWizardStore } from './factories/createDraftWizardStore';
import { clearFlexibleDates } from '$lib/utils/helpers/task-schedule';

const CREATE_STORAGE_KEY = StorageKeys.DRAFT_TASK;
const EDIT_STORAGE_KEY = StorageKeys.DRAFT_TASK_EDIT;

export const TASKS_PER_PAGE = 10;

/** Public /tasks relay page. A limit of 10 then 80 leaves older kind 31000 events off the list. */
export const TASK_LIST_PAGE_SIZE = 200;

export const STEPS = writable([
	TaskStepEnum.BASICS,
	TaskStepEnum.LOCATION,
	TaskStepEnum.BUDGET,
	TaskStepEnum.REVIEW
]);

const getInitialState = () => ({
	task: {
		title: '',
		description: '',
		taskType: TaskTypeEnum.IN_PERSON,
		budget: {
			amount: 0,
			currency: 'USDt',
			type: BudgetTypeEnum.FIXED,
			estimatedHours: 0,
			escrow: true
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

type StoreState = typeof initialState & {
	isEditing: boolean;
	recurringTask: ReturnType<typeof getInitialRecurringTask>;
};

interface TaskDraftPayload {
	id: string;
	uniqueId: string;
	currentStep: TaskStepEnum;
	task: TaskBody;
	isEditing: boolean;
	recurringTask: ReturnType<typeof getInitialRecurringTask>;
}

function createTaskStore() {
	if (browser) {
		const recurring = page.url.searchParams.get('recurring');
		recurringTask.isRecurring = recurring == 'true';
	}

	const store = createDraftWizardStore<StoreState, TaskStepEnum, TaskDraftPayload>({
		initialState: { ...initialState, recurringTask },
		stepsStore: STEPS,
		getStorageKey: (isEditing = false) => (isEditing ? EDIT_STORAGE_KEY : CREATE_STORAGE_KEY),
		getCurrentStep: (state) => state.currentStep,
		setCurrentStep: (state, step) => ({ ...state, currentStep: step }),
		getIsEditing: (state) => state.isEditing,
		readDraft: (parsedData, { isEditing, state }) => {
			if (parsedData.recurringTask?.isRecurring) {
				STEPS.update((steps) =>
					steps.includes(TaskStepEnum.RECURRING) ? steps : [...steps, TaskStepEnum.RECURRING]
				);
			}

			return {
				...state,
				id: parsedData.id ?? state.id,
				uniqueId: parsedData.uniqueId ?? state.uniqueId,
				task: parsedData.task ? clearFlexibleDates({ ...parsedData.task }) : state.task,
				currentStep: parsedData.currentStep ?? TaskStepEnum.BASICS,
				isEditing: parsedData.isEditing ?? isEditing,
				recurringTask: parsedData.recurringTask
					? { ...parsedData.recurringTask }
					: state.recurringTask
			};
		},
		writeDraft: (state, isEditing) => ({
			id: state.id,
			uniqueId: state.uniqueId,
			currentStep: state.currentStep,
			task: state.task,
			isEditing,
			recurringTask: state.recurringTask
		}),
		resetState: () => {
			const freshInitialState = getInitialState();
			const freshRecurringTask = getInitialRecurringTask();
			return { ...freshInitialState, recurringTask: freshRecurringTask, isEditing: false };
		},
		resolvePreviousStep: ({ state, currentIndex }) => {
			if (currentIndex === -1 && state.currentStep === TaskStepEnum.RECURRING) {
				return TaskStepEnum.BUDGET;
			}
			return null;
		}
	});
	const saveDraft = store.saveDraft;

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

	// Update task data (with auto-save)
	const updateTask = (updates: Partial<TaskBody>, immediate: boolean = false) => {
		store.update((state) => ({
			...state,
			task: clearFlexibleDates({ ...state.task, ...updates })
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
		loadDraft: store.loadDraft,
		saveDraft: store.saveDraft,
		clearDraft: store.clearDraft,
		nextStep: store.nextStep,
		previousStep: store.previousStep,
		setStep: store.setStep,
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

// Find tasks store initial state
const tasksStoreInitialState = {
	items: [] as Task[],
	loading: false,
	currentPage: 1,
	hasMore: true,
	error: null as string | null,
	searchParamsKey: '',
	/**
	 * The createdAt timestamp of the oldest relay event received in the last fetch,
	 * recorded BEFORE mute filtering. Used as the pagination cursor so that muting
	 * tasks does not cause pagination drift.
	 */
	lastRelayTimestamp: undefined as number | undefined
};

// Find tasks store
export const tasksStore = (() => {
	const pool = get(appStore)?.pool;
	if (!pool) {
		throw new Error('Pool not found');
	}

	const { subscribe, set, update } = writable<{
		pool: SimplePool;
		items: Task[];
		loading: boolean;
		error: string | null;
		currentPage: number;
		hasMore: boolean;
		searchParamsKey: string;
		lastRelayTimestamp: number | undefined;
	}>({
		pool,
		...tasksStoreInitialState
	});

	return {
		pool,
		subscribe,
		set,
		update,
		/**
		 * Remove all tasks from a muted pubkey and return the count removed.
		 * Called after a mute is confirmed so the canonical list stays mute-free.
		 */
		removePubkeyTasks(pubkey: string): number {
			let removed = 0;
			update((state) => {
				const filtered = state.items.filter((t) => t.npub !== pubkey);
				removed = state.items.length - filtered.length;
				return { ...state, items: filtered };
			});
			return removed;
		},
		/**
		 * Reset tasks store to initial state.
		 * Called on logout to prevent stale data.
		 */
		reset: () => {
			set({
				pool,
				...tasksStoreInitialState
			});
		}
	};
})();

// My tasks store initial state
const myTasksStoreInitialState = {
	items: [] as Task[],
	loading: false,
	error: null as string | null,
	currentPage: 1,
	hasMore: true
};

// My tasks store
function createMyTasksStore() {
	const { subscribe, set, update } = writable<{
		items: Task[];
		loading: boolean;
		error: string | null;
		currentPage: number;
		hasMore: boolean;
	}>(myTasksStoreInitialState);

	return {
		subscribe,
		set,
		update,
		/**
		 * Reset my tasks store to initial state
		 * Called on logout to prevent stale data
		 */
		reset: () => {
			set(myTasksStoreInitialState);
		}
	};
}

export const myTasksStore = createMyTasksStore();
