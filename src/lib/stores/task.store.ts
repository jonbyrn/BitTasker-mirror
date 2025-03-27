import { type Task, type TaskStep } from '$lib/types/task.d';
import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'bittasker_draft_task';
export const STEPS: TaskStep[] = ['basics', 'location', 'budget'];

function createTaskStore() {
  const initialState = {
    task: {
      title: '',
      description: '',
      budget: 0,
      budgetType: 'FIXED',
      taskType: 'IN_PERSON',
      deadline: '',
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
      }
    } as Task,
    isRemovals: false,
    currentStep: 'basics' as TaskStep,
    isEditing: false
  };

  const store = writable(initialState);

  // Load draft from preferences
  const loadDraft = async () => {
    const stored = await Preferences.get({ key: STORAGE_KEY });
    if (stored.value) {
      const parsedTask = JSON.parse(stored.value);
      store.update(state => ({ ...state, task: parsedTask }));
    }
  };

  // Save draft to preferences
  const saveDraft = async () => {
    let currentTask: Task | undefined;
    store.subscribe(state => {
      currentTask = state.task;
    })();
    if (currentTask) {
      await Preferences.set({
        key: STORAGE_KEY,
        value: JSON.stringify(currentTask)
      });
    }
  };

  // Clear draft from preferences
  const clearDraft = async () => {
    await Preferences.remove({ key: STORAGE_KEY });
    store.set(initialState);
  };

  // Navigation between steps
  const nextStep = () => {
    store.update(state => {
      const currentIndex = STEPS.indexOf(state.currentStep);
      if (currentIndex < STEPS.length - 1) {
        return { ...state, currentStep: STEPS[currentIndex + 1] };
      }
      return state;
    });
    saveDraft();
  };

  const previousStep = () => {
    store.update(state => {
      const currentIndex = STEPS.indexOf(state.currentStep);
      if (currentIndex > 0) {
        return { ...state, currentStep: STEPS[currentIndex - 1] };
      }
      return state;
    });
  };

  const setStep = (step: TaskStep) => {
    store.update(state => ({ ...state, currentStep: step }));
  };

  // Update task data
  const updateTask = (updates: Partial<Task>) => {
    store.update(state => ({
      ...state,
      task: { ...state.task, ...updates }
    }));
    saveDraft();
  };

  return {
    set: store.set,
    subscribe: store.subscribe,
    update: store.update,
    loadDraft,
    saveDraft,
    clearDraft,
    nextStep,
    previousStep,
    setStep,
    updateTask
  };
}

export const taskStore = createTaskStore();
