import type { TaskBody } from '$lib/types/task';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { calculatePOW } from '$lib/nostr';
import { SimplePool } from 'nostr-tools/pool';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { getSignedEvent } from '$lib/utils/nostr';
import { SEARCH_RELAYS } from '$lib/utils/constants/relays';
import { PUBLIC_NOSTR_RELAY_NESTJS } from '$env/static/public';

// Initialize a pool for relay connections
const pool = new SimplePool();

export const TASK_KINDS = {
    TASK_CREATION: 31000,
    RECURRING_TASK: 31006
};

/**
 * Generate tags for a task event
 */
function generateTaskTags(taskData: TaskBody, pow: [string, string], uniqueId: string): string[][] {
    // Normalize and validate skills
    const normalizedSkills = taskData.skills
        .map(skill => skill.trim().toLowerCase())
        .filter(skill => skill.length >= 2 && skill.length <= 30)
        .filter(skill => /^[a-z0-9\s-]+$/.test(skill))
        .slice(0, 10); // Limit to 10 skills

    const tags: string[][] = [
        ['c', ...taskData?.categories?.map(id => id.toString())],
        ['s', ...normalizedSkills],
        ['pow', ...pow],
        ['d', `task-${uniqueId}`] // Use uniqueId as the d tag to ensure uniqueness
    ];

    if (taskData.deadline) {
        tags.push(['deadline', taskData.deadline]); // Use a different tag for deadline
    }

    if (taskData.dateRange) {
        tags.push(['dateRange', taskData.dateRange.start, taskData.dateRange.end]);
    }

    if (taskData.budget) {
        tags.push(['b', `${taskData.budget.amount}${taskData.budget.currency}`]);
    }

    if (taskData.pickupLocation?.locationLoaded) {
        tags.push(['l', 'onsite', taskData.pickupLocation.displayName || '']);
    } else {
        tags.push(['l', 'remote']);
    }

    return tags;
}

/**
 * Create a new task
 */
export async function createTask(taskData: TaskBody): Promise<string> {
    // Generate a unique identifier for this task
    const uniqueId = crypto.randomUUID();

    // Add creation timestamp and unique identifier to task data
    const taskDataWithMeta = {
        ...taskData,
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
        kind: TASK_KINDS.TASK_CREATION,
        created_at: Math.floor(preciseTimestamp), // Use precise timestamp
        content: JSON.stringify(taskDataWithMeta),
        tags: generateTaskTags(taskData, pow, uniqueId)
    };

    // Sign and publish
    const signedEvent = await getSignedEvent(event);

    // 30aade3f948fa82b4dbd0407757e245cfc5b2c5b4d607cc28c71f7d77e3c4b12
    fetch(PUBLIC_NOSTR_RELAY_NESTJS + '/api/v1/events', {
        method: 'POST',
        body: JSON.stringify(signedEvent),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    return console.log('signedEvent', signedEvent);
    await publishToRelays(signedEvent);

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
        kind: TASK_KINDS.RECURRING_TASK,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify({
            template: taskData,
            schedule,
            uniqueId
        }),
        tags: [
            ...generateTaskTags(taskData, pow, uniqueId),
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
        const originalTask = await getTaskById(taskId);
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
            kind: TASK_KINDS.TASK_CREATION, // Use same kind as creation
            // created_at: Math.floor(originalTask.created_at + 0.000001), // Add a microsecond to original timestamp for update
            content: JSON.stringify(updatedTaskData),
            tags: [
                ['e', taskId], // Reference to original task
                ['p', originalTask.pubkey], // Original task creator
                ['d', `task-${uniqueId}`], // Use same d tag format as creation
                ['status', 'update'],
                ['pow', ...pow],
                // Add all tags to maintain consistency
                ['c', ...updatedTaskData.categories?.map((category: string) => category.toString()) || []],
                ['s', ...(updatedTaskData.skills || [])],
                ['b', `${updatedTaskData.budget?.amount || 0}${updatedTaskData.budget?.currency || 'BTC'}`],
                ...(updatedTaskData.deadline ? [['deadline', updatedTaskData.deadline]] : []),
                ...(updatedTaskData.dateRange ? [['dateRange', updatedTaskData.dateRange.start, updatedTaskData.dateRange.end]] : []),
                ...(updatedTaskData.pickupLocation?.locationLoaded
                    ? [['l', 'onsite', updatedTaskData.pickupLocation.displayName || '']]
                    : [['l', 'remote']])
            ]
        };

        // Sign and publish
        const signedEvent = await getSignedEvent(event);
        await publishToRelays(signedEvent);

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
                ['k', '1'] // Kind of event being deleted
            ]
        };

        // Sign and publish
        const signedEvent = await getSignedEvent(event);
        await publishToRelays(signedEvent);
        return signedEvent.id;
    } catch (error) {
        console.error('Failed to delete task:', error);
        throw error;
    }
}

/**
 * Publish an event to relays
 */
export async function publishToRelays(event: NostrEvent, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<void> {
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
    relays = [PUBLIC_NOSTR_RELAY_URL]
): () => void {
    const sub = pool.subscribe(relays, {
        kinds: filter.kinds || [TASK_KINDS.TASK_CREATION, TASK_KINDS.RECURRING_TASK],
        authors: filter.authors,
        ...filter
    }, {
        onevent: callback
    });

    return () => sub.close();
}

/**
 * Query tasks
 */
export async function queryTasks(
    callback: (event: NostrEvent) => void,
    filter: { kinds?: number[], authors?: string[], tags?: string[][], limit?: number } = {},
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<NostrEvent[]> {
    const query = await pool.querySync(relays, {
        kinds: filter.kinds || [TASK_KINDS.TASK_CREATION], // Only look for creation events
        authors: filter.authors,
        // limit: filter.limit || 100, // Set a reasonable default limit
        // since: 0, // Get all historical tasks
        // until: Math.floor(Date.now() / 1000), // Up to current time
        ...filter
    });

    // console.log('Query results:', query.length, 'events');

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
export async function getTaskById(taskId: string, author?: string, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<NostrEvent | null> {
    try {
        const filter: Filter = {
            kinds: [TASK_KINDS.TASK_CREATION], // Only look for creation events
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
    pool.close([PUBLIC_NOSTR_RELAY_URL]);
}