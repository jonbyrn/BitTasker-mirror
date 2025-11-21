#!/usr/bin/env node
/**
 * Script to count unexpired tasks from BitTasker Nostr relays
 * 
 * This script connects to the BitTasker Nostr relays and counts:
 * - Total tasks found
 * - Unexpired tasks (deadline is today or in the future)
 * - Expired tasks (deadline is in the past)
 * - Tasks without deadlines
 * 
 * Usage:
 *   npm run count-tasks
 *   or
 *   npx tsx scripts/count-unexpired-tasks.ts
 * 
 * Relays queried:
 *   - wss://relay2.bittasker.com
 *   - wss://relay1.bittasker.com
 */

import { SimplePool, type Event, type Filter } from 'nostr-tools';
import type { Task } from '../src/lib/types/task.d';

// Relay URLs
const RELAYS = [
	'wss://relay2.bittasker.com',
	'wss://relay1.bittasker.com'
];

// Task kind constant
const TASK_CREATION_KIND = 31000;

// Timeout for relay queries (30 seconds)
const QUERY_TIMEOUT = 30000;

/**
 * Check if a task is expired based on its deadline
 * A task is expired if the deadline date is in the past (comparing dates only, not times)
 */
function isTaskExpired(task: Task): boolean {
	// If no deadline is set, the task is not expired
	if (!task.deadline) {
		return false;
	}

	const now = new Date();
	const deadlineDate = new Date(task.deadline);
	
	// Check if the date is valid
	if (isNaN(deadlineDate.getTime())) {
		return false; // Treat invalid dates as not expired
	}
	
	// Compare dates using date strings to avoid timezone issues
	// Extract date components (YYYY-MM-DD) from deadline and current date
	const deadlineYear = deadlineDate.getFullYear();
	const deadlineMonth = deadlineDate.getMonth();
	const deadlineDay = deadlineDate.getDate();
	const deadlineDateStr = `${deadlineYear}-${String(deadlineMonth + 1).padStart(2, '0')}-${String(deadlineDay).padStart(2, '0')}`;
	
	const nowYear = now.getFullYear();
	const nowMonth = now.getMonth();
	const nowDay = now.getDate();
	const nowDateStr = `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}-${String(nowDay).padStart(2, '0')}`;
	
	// Task is expired if deadline date is in the past
	return deadlineDateStr < nowDateStr;
}

/**
 * Convert a Nostr event to a Task
 */
function convertEventToTask(event: Event): Task | null {
	try {
		const taskData = JSON.parse(event.content);
		return {
			...taskData,
			id: event.id,
			npub: event.pubkey,
			createdAt: event.created_at
		} as Task;
	} catch (error) {
		console.error(`Failed to parse task from event ${event.id}:`, error);
		return null;
	}
}

/**
 * Query tasks from a single relay
 */
async function queryTasksFromRelay(pool: SimplePool, relay: string): Promise<Task[]> {
	console.log(`\n📡 Querying tasks from ${relay}...`);
	
	const tasks: Task[] = [];
	const events: Event[] = [];
	
	try {
		const filter: Filter = {
			kinds: [TASK_CREATION_KIND],
			limit: 10000 // Large limit to get all tasks
		};
		
		// Create a promise that resolves when we get all events or timeout
		const queryPromise = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Query timeout after ${QUERY_TIMEOUT}ms`));
			}, QUERY_TIMEOUT);
			
			const sub = pool.subscribe([relay], filter, {
				onevent: (event: Event) => {
					events.push(event);
				},
				oneose: () => {
					clearTimeout(timeout);
					resolve();
				}
			});
			
			// Cleanup subscription after timeout
			setTimeout(() => {
				sub.close();
			}, QUERY_TIMEOUT);
		});
		
		await queryPromise;
		
		// Convert events to tasks
		for (const event of events) {
			const task = convertEventToTask(event);
			if (task) {
				tasks.push(task);
			}
		}
		
		console.log(`✅ Found ${tasks.length} tasks from ${relay}`);
		return tasks;
		
	} catch (error) {
		console.error(`❌ Error querying ${relay}:`, error instanceof Error ? error.message : error);
		return [];
	}
}

/**
 * Main function
 */
async function main() {
	console.log('🚀 Starting task count script...\n');
	console.log(`📅 Current date: ${new Date().toISOString()}\n`);
	
	const pool = new SimplePool();
	
	try {
		// Query tasks from all relays
		const allTasks: Task[] = [];
		const taskIds = new Set<string>(); // To deduplicate tasks across relays
		
		for (const relay of RELAYS) {
			const tasks = await queryTasksFromRelay(pool, relay);
			
			// Deduplicate tasks by ID (same task might be on multiple relays)
			for (const task of tasks) {
				if (!taskIds.has(task.id)) {
					taskIds.add(task.id);
					allTasks.push(task);
				}
			}
		}
		
		// Analyze tasks
		const totalTasks = allTasks.length;
		const expiredTasks = allTasks.filter(task => isTaskExpired(task));
		const unexpiredTasks = allTasks.filter(task => !isTaskExpired(task));
		const tasksWithoutDeadline = allTasks.filter(task => !task.deadline);
		
		// Print results
		console.log('\n' + '='.repeat(60));
		console.log('📊 RESULTS');
		console.log('='.repeat(60));
		console.log(`Total tasks found: ${totalTasks}`);
		console.log(`Unexpired tasks: ${unexpiredTasks.length} ✅`);
		console.log(`Expired tasks: ${expiredTasks.length} ❌`);
		console.log(`Tasks without deadline: ${tasksWithoutDeadline.length} ⏰`);
		console.log('='.repeat(60));
		
		// Show some statistics
		if (expiredTasks.length > 0) {
			console.log('\n📉 Expired tasks breakdown:');
			const expiredByDate = new Map<string, number>();
			expiredTasks.forEach(task => {
				if (task.deadline) {
					const date = new Date(task.deadline).toISOString().split('T')[0];
					expiredByDate.set(date, (expiredByDate.get(date) || 0) + 1);
				}
			});
			const sortedDates = Array.from(expiredByDate.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10);
			sortedDates.forEach(([date, count]) => {
				console.log(`  ${date}: ${count} tasks`);
			});
		}
		
		if (unexpiredTasks.length > 0) {
			console.log('\n📈 Unexpired tasks breakdown:');
			const unexpiredByDate = new Map<string, number>();
			unexpiredTasks.forEach(task => {
				if (task.deadline) {
					const date = new Date(task.deadline).toISOString().split('T')[0];
					unexpiredByDate.set(date, (unexpiredByDate.get(date) || 0) + 1);
				}
			});
			const sortedDates = Array.from(unexpiredByDate.entries())
				.sort((a, b) => a[0].localeCompare(b[0]))
				.slice(0, 10);
			sortedDates.forEach(([date, count]) => {
				console.log(`  ${date}: ${count} tasks`);
			});
		}
		
		console.log('\n✅ Script completed successfully!\n');
		
		// Exit with success
		process.exit(0);
		
	} catch (error) {
		console.error('\n❌ Fatal error:', error instanceof Error ? error.message : error);
		process.exit(1);
	} finally {
		// Close all relay connections
		await pool.close(RELAYS);
	}
}

// Run the script
main().catch(error => {
	console.error('Unhandled error:', error);
	process.exit(1);
});

