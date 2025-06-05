import type { TaskBody } from '$lib/types/task';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { RecurrencePattern } from '$lib/types/recurring-tasks';
import { calculatePOW } from '$lib/nostr';
import { SimplePool } from 'nostr-tools/pool';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { getSignedEvent } from '$lib/utils/nostr';

// Initialize a pool for relay connections
const pool = new SimplePool();

export const TASK_KINDS = {
    TASK_CREATION: 31000,
    TASK_UPDATE: 31005,
    RECURRING_TASK: 31006
};

/**
 * Generate tags for a task event
 */
function generateTaskTags(taskData: TaskBody, pow: [string, string]): string[][] {
    console.log(taskData);
    // Normalize and validate skills
    const normalizedSkills = taskData.skills
        .map(skill => skill.trim().toLowerCase())
        .filter(skill => skill.length >= 2 && skill.length <= 30)
        .filter(skill => /^[a-z0-9\s-]+$/.test(skill))
        .slice(0, 10); // Limit to 10 skills

    const tags: string[][] = [
        ['c', ...taskData?.categories?.map(id => id.toString())],
        ['s', ...normalizedSkills],
        ['pow', ...pow]
    ];

    if (taskData.deadline) {
        tags.push(['d', taskData.deadline]);
    }

    if (taskData.dateRange) {
        tags.push(['d', taskData.dateRange.start, taskData.dateRange.end]);
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
    // Calculate POW based on task value
    const pow = await calculatePOW(taskData.budget.amount);

    // Create event
    const event = {
        kind: TASK_KINDS.TASK_CREATION,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify(taskData),
        tags: generateTaskTags(taskData, pow)
    };

    // Sign and publish
    const signedEvent = await getSignedEvent(event);
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
    const pow = await calculatePOW(taskData.budget.amount);

    const event = {
        kind: TASK_KINDS.RECURRING_TASK,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify({
            template: taskData,
            schedule
        }),
        tags: [
            ...generateTaskTags(taskData, pow),
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
    filter: { kinds?: number[], authors?: string[], tags?: string[][] } = {},
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<NostrEvent[]> {
    const query = await pool.querySync(relays, {
        kinds: filter.kinds || [TASK_KINDS.TASK_CREATION, TASK_KINDS.RECURRING_TASK],
        authors: filter.authors,
        ...filter
    });

    query.forEach(event => {
        callback(event);
    });

    return query;
}

/**
 * Close all relay connections
 */
export function closePool(): void {
    pool.close([PUBLIC_NOSTR_RELAY_URL]);
}

/**
 * Get a task by its ID
 */
export async function getTaskById(taskId: string, author?: string, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<NostrEvent | null> {
    try {
        const filter: Filter = {
            kinds: [TASK_KINDS.TASK_CREATION, TASK_KINDS.TASK_UPDATE],
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
 * Update an existing task
 */
export async function updateTask(taskId: string, updates: Partial<TaskBody>): Promise<string> {
    try {
        // Get the original task
        const originalTask = await getTaskById(taskId);
        if (!originalTask) {
            throw new Error('Task not found');
        }

        // Calculate POW based on task value
        const pow = await calculatePOW(updates.budget?.amount || 0);

        // Create update event
        const event = {
            kind: TASK_KINDS.TASK_UPDATE,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify(updates),
            tags: [
                ['e', taskId], // Reference to original task
                ['p', originalTask.pubkey], // Original task creator
                ['status', 'update'],
                ['pow', ...pow],
                // Add relevant tags based on what was updated
                ...(updates.categories ? [['c', ...updates.categories.map(id => id.toString())]] : []),
                ...(updates.skills ? [['s', ...updates.skills]] : []),
                ...(updates.deadline ? [['d', updates.deadline]] : []),
                ...(updates.dateRange ? [['d', updates.dateRange.start, updates.dateRange.end]] : []),
                ...(updates.budget ? [['b', `${updates.budget.amount}${updates.budget.currency}`]] : []),
                ...(updates.pickupLocation?.locationLoaded ? [['l', 'onsite', updates.pickupLocation.displayName || '']] : [])
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