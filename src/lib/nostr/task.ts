import type { TaskBody } from '$lib/types/task';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { calculatePOW } from '$lib/nostr';
import { SimplePool } from 'nostr-tools/pool';
import { getSignedEvent } from '$lib/utils/nostr';
import { user } from '$lib/stores/user.store';
import { get } from 'svelte/store';
import { getNpub } from '$lib/utils/nostrKeys';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { getDateRangeTags } from '$lib/utils/helpers/dateTier';
import { getBudgetBucket } from '$lib/utils/helpers/budgetTier';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';

// Define relay URLs with fallbacks
const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean); // Remove any undefined values

// Initialize a pool for relay connections
const pool = new SimplePool();

/**
 * Generate tags for a task event
 */
async function generateTaskTags(taskData: TaskBody, pow: [string, string], uniqueId: string): Promise<string[][]> {
    // Normalize and validate skills
    const normalizedSkills = taskData.skills
        .map(skill => skill.trim().toLowerCase())
        .filter(skill => skill.length >= 2 && skill.length <= 30)
        .filter(skill => /^[a-z0-9\s-]+$/.test(skill))
        .slice(0, 10); // Limit to 10 skills 

    const tags: [string, ...any][] = [
        ['c', ...taskData?.categories?.map(id => id.toString())],
        ['s', ...normalizedSkills],
        ['p', await getNpub()],
        ['pow', ...pow],
        ['d', `task-${uniqueId}`], // Use uniqueId as the d tag to ensure uniqueness
        ['S', TaskStatusEnum.OPEN], // Default status - OPEN
    ];

    if (taskData.deadline) {
        const dateRangeTags = getDateRangeTags(taskData.deadline);
        tags.push(['M', ...dateRangeTags.months]); // M for months
        tags.push(['D', ...dateRangeTags.days]); // D for days
    }

    if (taskData.dateRange) {
        const dateRangeTags = getDateRangeTags(taskData.dateRange.end, taskData.dateRange.start);
        tags.push(['M', ...dateRangeTags.months]); // M for months
        tags.push(['D', ...dateRangeTags.days]); // D for days
    }

    if (taskData.budget) {
        const budgetTier = getBudgetBucket(taskData.budget.amount, taskData.budget.currency);
        tags.push(['b', budgetTier]);
        tags.push(['P', taskData.budget.currency]);
        tags.push(['t', taskData.budget.type]);
    }

    if (taskData.pickupLocation?.locationLoaded) {
        tags.push(['T', 'onsite']); // T for task type
        tags.push(['L', taskData.pickupLocation.displayName || '']); // L for location
    } else {
        tags.push(['T', 'remote']); // T for task type
    }

    return tags;
}

/**
 * Create a new task
 */
export async function createTask(taskData: TaskBody): Promise<string> {
    // Generate a unique identifier for this task
    const uniqueId = crypto.randomUUID();

    const userData = get(user);
    const creator = {
        username: userData?.name,
        avatar: userData?.avatar
    };

    // Add creation timestamp and unique identifier to task data
    const taskDataWithMeta = {
        ...taskData,
        creator,
        createdAt: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
        uniqueId
    };

    // Calculate POW based on task value and uniqueId
    const pow = await calculatePOW(taskData.budget.amount, uniqueId);

    // Create event with millisecond precision timestamp to avoid collisions
    const now = performance.now();
    const timestamp = Math.floor(Date.now() / 1000);
    const fraction = now % 1000 / 1000; // Get the fractional part of the current time
    const preciseTimestamp = timestamp + fraction;

    // Create event
    const event = {
        kind: KINDS.TASK_CREATION,
        created_at: Math.floor(preciseTimestamp), // Use precise timestamp
        content: JSON.stringify(taskDataWithMeta),
        tags: await generateTaskTags(taskData, pow, uniqueId)
    };

    // Sign and publish
    const signedEvent = await getSignedEvent(event);
    console.log(signedEvent);

    try {
        await nostrEventsService.publishEvent(signedEvent);
    } catch (error) {
        console.error('Failed to create task:', error);
        throw error;
    }

    return signedEvent.id;
}

/**
 * Create a recurring task
 */
export async function createRecurringTask(taskData: TaskBody, schedule: {
    isRecurring: boolean;
    name: string;
    description: string;
    recurrencePattern: RecurrencePattern;
}): Promise<string> {
    const uniqueId = crypto.randomUUID();
    const pow = await calculatePOW(taskData.budget.amount, uniqueId);

    const event = {
        kind: KINDS.RECURRING_TASK,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify({
            template: taskData,
            schedule,
            uniqueId
        }),
        tags: [
            ...(await generateTaskTags(taskData, pow, uniqueId)),
            ['t', 'recurring'],
            ['f', schedule.recurrencePattern.frequency],
            ['i', schedule.recurrencePattern.interval.toString()]
        ]
    };

    const signedEvent = await getSignedEvent(event);
    await publishToRelays(signedEvent);
    return signedEvent.id;
}

/**
 * Update an existing task
 */
export async function updateTask(taskId: string, updates: Partial<TaskBody>): Promise<string> {
    try {
        // Get the original task
        const { data: originalTask } = await nostrEventsService.findEventById(taskId);
        if (!originalTask) {
            throw new Error('Task not found');
        }

        // Parse original task data
        const originalTaskData = JSON.parse(originalTask.content);

        // Get the original uniqueId
        const uniqueId = originalTaskData.uniqueId;
        if (!uniqueId) {
            throw new Error('Original task has no uniqueId');
        }

        // Merge updates with original task data
        const updatedTaskData = {
            ...originalTaskData,
            ...updates,
            uniqueId, // Keep the same uniqueId
            updatedAt: Math.floor(Date.now() / 1000)
        };

        // Calculate POW based on updated task value
        const pow = await calculatePOW(updatedTaskData.budget?.amount || 0, uniqueId);
        // Create update event using the same kind as creation for proper replacement
        const event = {
            kind: KINDS.TASK_CREATION, // Use same kind as creation
            // created_at: Math.floor(originalTask.created_at + 0.000001), // Add a microsecond to original timestamp for update
            content: JSON.stringify(updatedTaskData),
            tags: await generateTaskTags(updatedTaskData, pow, uniqueId)
        };

        // Sign and publish
        const signedEvent = await getSignedEvent(event);
        await nostrEventsService.publishEvent(signedEvent);
        // await publishToRelays(signedEvent);

        return signedEvent.id;
    } catch (error) {
        console.error('Failed to update task:', error);
        throw error;
    }
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<string> {
    try {
        // Create deletion event (kind 5)
        const event = {
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            content: "Task deleted",
            tags: [
                ['e', taskId], // Reference to event being deleted
            ]
        };

        // Sign and publish
        const signedEvent = await getSignedEvent(event);
        const response = await nostrEventsService.deleteEvent(signedEvent);
        if (response.deleteCount === 0) {
            throw new Error('Failed to delete task');
        }
        return response.message;
    } catch (error) {
        console.error('Failed to delete task:', error);
        throw error;
    }
}

/**
 * Publish an event to relays
 */
export async function publishToRelays(event: NostrEvent, relays = RELAYS): Promise<void> {
    try {
        const pub = pool.publish(relays, event as any); // Type cast to any to bypass type check
        await Promise.race([
            Promise.all(pub),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 5000))
        ]);
    } catch (error) {
        console.error('Failed to publish to relays:', error);
        throw error;
    }
}

/**
 * Subscribe to task events
 */
export function subscribeToTasks(
    callback: (event: NostrEvent) => void,
    filter: { kinds?: number[], authors?: string[], tags?: string[][] } = {},
    relays = RELAYS
): () => void {
    const sub = pool.subscribe(relays, {
        kinds: filter.kinds || [KINDS.TASK_CREATION, KINDS.RECURRING_TASK],
        authors: filter.authors,
        ...filter
    }, {
        onevent: callback
    });

    return () => sub.close();
}

// TODO: This is not used anywhere, to be removed
/**
 * Query tasks
 */
export async function queryTasks(
    callback: (event: NostrEvent) => void,
    filter: { kinds?: number[], authors?: string[], tags?: string[][], limit?: number } = {},
    relays = RELAYS
): Promise<NostrEvent[]> {
    const query = await pool.querySync(relays, {
        ...filter,
        kinds: filter.kinds || [KINDS.TASK_CREATION], // Only look for creation events
        authors: filter.authors
    });

    // Sort events by creation time to ensure consistent ordering
    const sortedEvents = query.sort((a, b) => b.created_at - a.created_at);

    // Process events in chronological order for proper state reconstruction
    sortedEvents.forEach(event => {
        callback(event);
    });

    return sortedEvents;
}

/**
 * Get a task by its ID
 */
export async function getTaskById(taskId: string, author?: string, relays = RELAYS): Promise<NostrEvent | null> {
    try {
        const filter: Filter = {
            kinds: [KINDS.TASK_CREATION], // Only look for creation events
            ids: [taskId]
        };

        // If author is provided, add it to the filter
        if (author) {
            filter.authors = [author];
        }

        // Query events
        const events = await pool.querySync(relays, filter);

        if (!events || events.length === 0) {
            return null;
        }

        // Get the most recent version of the task
        return events.sort((a, b) => b.created_at - a.created_at)[0];
    } catch (error) {
        console.error('Failed to get task by ID:', error);
        throw error;
    }
}

/**
 * Close all relay connections
 */
export function closePool(): void {
    pool.close(RELAYS);
}