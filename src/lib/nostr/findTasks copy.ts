import { SimplePool } from 'nostr-tools/pool';
import type { Event, Filter } from 'nostr-tools';
import { TaskStatusEnum, TaskTypeEnum, SortByEnum, SortOrderEnum } from '$lib/utils/enums/task.enum';
import type { SearchTasksParams, TaskData } from '$lib/types/task';
import { browser } from '$app/environment';
import { writable, type Writable } from 'svelte/store';
import { getSignedEvent } from '$lib/utils/nostr';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';

// Constants
const BATCH_SIZE = 20;
const TASK_KIND = 31000;

// Types
interface TaskFilter extends SearchTasksParams {
  page?: number;
  limit?: number;
  sortBy?: SortByEnum;
  sortOrder?: SortOrderEnum;
}

interface TaskMetadata {
  currentPage: number;
  totalItems: number;
  hasNextPage: boolean;
}

// Store for tasks and metadata
export const tasksStore: Writable<{
  items: TaskData[];
  meta: TaskMetadata | null;
  loading: boolean;
  error: string | null;
}> = writable({
  items: [],
  meta: null,
  loading: false,
  error: null
});

// Pool instance for Nostr connections
const pool = new SimplePool();

// Cache implementation
const taskCache = new Map<string, TaskData>();
const filterCache = new Map<string, { tasks: TaskData[]; timestamp: number }>();

// Helper function to generate cache key from filter
function generateFilterCacheKey(filter: TaskFilter): string {
  return JSON.stringify({
    searchTerm: filter.searchTerm,
    taskType: filter.taskType,
    status: filter.status,
    minBudget: filter.minBudget,
    maxBudget: filter.maxBudget,
    budgetType: filter.budgetType,
    categoryIds: filter.categoryIds,
    skillIds: filter.skillIds,
    page: filter.page,
    sortBy: filter.sortBy,
    sortOrder: filter.sortOrder
  });
}

// Convert Nostr event to TaskData
function parseTaskEvent(event: Event): TaskData {
  try {
    const content = JSON.parse(event.content);
    const taskData: TaskData = {
      id: event.id,
      title: content.title,
      description: content.description,
      budget: content.budget.amount,
      budgetType: content.budget.type,
      status: content.status,
      taskType: content.taskType,
      skills: content.skills,
      category: content.category,
      deadlineDate: content.deadlineDate,
      dateRange: content.dateRange,
      userProfile: {
        user: {
          id: event.pubkey,
          username: event.tags.find(t => t[0] === 'p')?.[1] || event.pubkey
        }
      },
      bids: [], // Bids will be handled separately
      pickupLocation: content.pickupLocation,
      dropOffLocation: content.dropOffLocation,
      createdAt: new Date(event.created_at * 1000).toISOString()
    };

    // Cache the task
    taskCache.set(event.id, taskData);
    return taskData;
  } catch (error) {
    console.error('Error parsing task event:', error);
    throw error;
  }
}

// Build Nostr filter from TaskFilter
function buildNostrFilter(filter: TaskFilter): Filter {
  const nostrFilter: Filter = {
    kinds: [TASK_KIND],
    '#d': ['task'],
    limit: filter.limit || BATCH_SIZE
  };

  // Add timestamp-based pagination
  if (filter.page && filter.page > 1) {
    const timestamp = Math.floor(Date.now() / 1000) - (filter.page * BATCH_SIZE * 60); // Approximate time windowing
    nostrFilter.until = timestamp;
  }

  // Add search term filter
  if (filter.searchTerm) {
    nostrFilter['#t'] = [filter.searchTerm];
  }

  // Add task type filter
  if (filter.taskType) {
    nostrFilter['#t'] = [...(nostrFilter['#t'] || []), filter.taskType];
  }

  // Add status filter
  if (filter.status) {
    nostrFilter['#t'] = [...(nostrFilter['#t'] || []), filter.status];
  }

  // Add category filter
  if (filter.categoryIds?.length) {
    nostrFilter['#c'] = filter.categoryIds.map(String);
  }

  // Add skills filter
  if (filter.skillIds?.length) {
    nostrFilter['#s'] = filter.skillIds;
  }

  return nostrFilter;
}

// Main function to fetch tasks
export async function findTasks(filter: TaskFilter): Promise<void> {
  if (!browser) return;

  tasksStore.update(state => ({ ...state, loading: true, error: null }));

  try {
    // Check cache first
    const cacheKey = generateFilterCacheKey(filter);
    const cachedResult = filterCache.get(cacheKey);
    
    if (cachedResult && Date.now() - cachedResult.timestamp < 300000) { // 5 minutes cache
      tasksStore.update(state => ({
        ...state,
        items: cachedResult.tasks,
        loading: false,
        meta: {
          currentPage: filter.page || 1,
          totalItems: cachedResult.tasks.length,
          hasNextPage: cachedResult.tasks.length === BATCH_SIZE
        }
      }));
      return;
    }

    // Build Nostr filter
    const nostrFilter = buildNostrFilter(filter);

    // Fetch tasks from relays
    const events = await pool.querySync(
      ['wss://relay.example.com'], // Replace with your relay list
      nostrFilter
    );

    // Parse and sort events
    let tasks = events.map(parseTaskEvent);

    // Apply sorting
    if (filter.sortBy) {
      tasks = sortTasks(tasks, filter.sortBy, filter.sortOrder || SortOrderEnum.DESC);
    }

    // Cache the results
    filterCache.set(cacheKey, {
      tasks,
      timestamp: Date.now()
    });

    // Update store
    tasksStore.update(state => ({
      ...state,
      items: tasks,
      loading: false,
      meta: {
        currentPage: filter.page || 1,
        totalItems: tasks.length,
        hasNextPage: tasks.length === BATCH_SIZE
      }
    }));

  } catch (error) {
    console.error('Error fetching tasks:', error);
    tasksStore.update(state => ({
      ...state,
      loading: false,
      error: 'Failed to fetch tasks. Please try again.'
    }));
  }
}

// Sort tasks based on criteria
function sortTasks(tasks: TaskData[], sortBy: SortByEnum, sortOrder: SortOrderEnum): TaskData[] {
  return [...tasks].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case SortByEnum.CREATED_AT:
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case SortByEnum.BUDGET:
        comparison = (a.budget || 0) - (b.budget || 0);
        break;
      // Add more sorting criteria as needed
    }

    return sortOrder === SortOrderEnum.DESC ? -comparison : comparison;
  });
}

// Function to get recommended tasks
export async function getRecommendedTasks(limit: number = 3): Promise<TaskData[]> {
  if (!browser) return [];

  try {
    // Fetch recent tasks
    const events = await pool.querySync(
      ['wss://relay.example.com'], // Replace with your relay list
      {
        kinds: [TASK_KIND],
        '#d': ['task'],
        limit: limit * 3 // Fetch more to filter
      }
    );

    // Parse and sort by relevance
    const tasks = events.map(parseTaskEvent);
    return calculateRecommendedTasks(tasks, limit);

  } catch (error) {
    console.error('Error fetching recommended tasks:', error);
    return [];
  }

}

// Calculate task recommendations
function calculateRecommendedTasks(tasks: TaskData[], limit: number): TaskData[] {
  // Add your recommendation logic here
  // For now, just return the most recent tasks
  return tasks.slice(0, limit);
}

// Subscribe to new tasks
export function subscribeToNewTasks(): () => void {
  if (!browser) return () => {};

  const sub = pool.subscribe(
    ['wss://relay.example.com'], // Replace with your relay list
    {
      kinds: [TASK_KIND],
      '#d': ['task'],
      since: Math.floor(Date.now() / 1000)
    },
    {
      onevent(event) {
        try {
          const task = parseTaskEvent(event);
          tasksStore.update(state => ({
            ...state,
            items: [task, ...state.items]
          }));
        } catch (error) {
          console.error('Error processing new task:', error);
        }
      }
    }
  );

  // Return cleanup function
  return () => {
    sub.close();
  };
}

// Clean up resources
export function cleanup(): void {
  if (!browser) return;
  
  pool.close();
  taskCache.clear();
  filterCache.clear();
}
