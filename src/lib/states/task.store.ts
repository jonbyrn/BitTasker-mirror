import { type Task, type TaskStep } from '$lib/types/task';

const STORAGE_KEY = 'bittasker_draft_task';

function createTaskStore() {
  let task = $state<Task>({
    title: '',
    description: '',
    budget: 0,
    budgetType: 'FIXED',
    taskType: 'IN_PERSON',
    deadline: '',
    categoryIds: [],
    skillIds: [],
  });

  let currentStep = $state<TaskStep>('basics');
  let isEditing = $state(false);

  // Load draft from localStorage
  function loadDraft() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      task = JSON.parse(stored);
    }
  }

  // Save draft to localStorage
  function saveDraft() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(task));
  }

  // Clear draft from localStorage
  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
    task = {
      title: '',
      description: '',
      budget: 0,
      budgetType: 'FIXED',
      taskType: 'IN_PERSON',
      deadline: '',
      categoryIds: [],
      skillIds: [],
    };
    currentStep = 'basics';
  }

  // Navigation between steps
  function nextStep() {
    const steps: TaskStep[] = ['basics', 'timing', 'location', 'details', 'budget'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      currentStep = steps[currentIndex + 1];
      saveDraft();
    }
  }

  function previousStep() {
    const steps: TaskStep[] = ['basics', 'timing', 'location', 'details', 'budget'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      currentStep = steps[currentIndex - 1];
    }
  }

  function setStep(step: TaskStep) {
    currentStep = step;
  }

  // Update task data
  function updateTask(updates: Partial<Task>) {
    task = { ...task, ...updates };
    saveDraft();
  }

  return {
    task,
    currentStep,
    isEditing,
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
