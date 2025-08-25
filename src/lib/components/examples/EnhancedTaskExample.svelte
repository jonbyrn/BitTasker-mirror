<script lang="ts">
	import { onMount } from 'svelte';
	import enhancedTaskService from '$lib/api/services/enhanced-task.service';
	import type { Task } from '$lib/types/task.d';
	import type { EnhancedApiResponse } from '$lib/api/enhancedBaseApiService';

	// State
	let tasks = $state<Task[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let offlineStatus = $state<string>('online');
	let cacheStatus = $state<string>('');

	// Example task data
	const exampleTask = {
		title: 'Example Task',
		description: 'This is an example task created with offline support',
		budget: 100,
		currency: 'USD',
		category: 'general',
		location: 'Remote'
	};

	onMount(async () => {
		await loadTasks();
	});

	async function loadTasks() {
		try {
			loading = true;
			error = null;

			const response: EnhancedApiResponse<Task[]> = await enhancedTaskService.getMyTasks();
			
			tasks = response.data;
			
			// Update status based on response
			if (response.offline) {
				offlineStatus = 'offline';
			} else {
				offlineStatus = 'online';
			}

			if (response.cached) {
				cacheStatus = 'served from cache';
			} else {
				cacheStatus = 'fresh from server';
			}

			console.log('Tasks loaded:', {
				offline: response.offline,
				cached: response.cached,
				timestamp: new Date(response.timestamp).toLocaleString()
			});

		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load tasks';
			console.error('Error loading tasks:', err);
		} finally {
			loading = false;
		}
	}

	async function createTask() {
		try {
			loading = true;
			error = null;

			const response: EnhancedApiResponse<Task> = await enhancedTaskService.createTask(exampleTask);
			
			if (response.offline) {
				offlineStatus = 'offline - task queued for sync';
				console.log('Task creation queued for offline sync');
			} else {
				offlineStatus = 'online - task created';
				console.log('Task created successfully');
			}

			// Reload tasks to show the new task
			await loadTasks();

		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create task';
			console.error('Error creating task:', err);
		} finally {
			loading = false;
		}
	}

	async function updateTask(taskId: string) {
		try {
			loading = true;
			error = null;

			const updates = {
				title: 'Updated Task Title',
				description: 'This task has been updated with offline support'
			};

			const response: EnhancedApiResponse<Task> = await enhancedTaskService.updateTask(taskId, updates);
			
			if (response.offline) {
				offlineStatus = 'offline - update queued for sync';
				console.log('Task update queued for offline sync');
			} else {
				offlineStatus = 'online - task updated';
				console.log('Task updated successfully');
			}

			// Reload tasks to show the updated task
			await loadTasks();

		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update task';
			console.error('Error updating task:', err);
		} finally {
			loading = false;
		}
	}

	async function deleteTask(taskId: string) {
		try {
			loading = true;
			error = null;

			const response: EnhancedApiResponse<void> = await enhancedTaskService.deleteTask(taskId);
			
			if (response.offline) {
				offlineStatus = 'offline - deletion queued for sync';
				console.log('Task deletion queued for offline sync');
			} else {
				offlineStatus = 'online - task deleted';
				console.log('Task deleted successfully');
			}

			// Reload tasks to show the updated list
			await loadTasks();

		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete task';
			console.error('Error deleting task:', err);
		} finally {
			loading = false;
		}
	}

	function getStatusColor(status: string): string {
		if (status.includes('offline')) return 'text-orange-500';
		if (status.includes('online')) return 'text-green-500';
		return 'text-gray-500';
	}

	function getCacheColor(status: string): string {
		if (status.includes('cache')) return 'text-blue-500';
		return 'text-gray-500';
	}
</script>

<div class="p-6 max-w-4xl mx-auto">
	<h2 class="text-2xl font-bold mb-6">Enhanced Task Service Example</h2>
	
	<!-- Status Display -->
	<div class="mb-6 p-4 bg-gray-100 rounded-lg">
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<span class="font-semibold">Status:</span>
				<span class={getStatusColor(offlineStatus)}>{offlineStatus}</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="font-semibold">Cache:</span>
				<span class={getCacheColor(cacheStatus)}>{cacheStatus}</span>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<div class="mb-6 flex gap-4">
		<button 
			onclick={loadTasks}
			disabled={loading}
			class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
		>
			{loading ? 'Loading...' : 'Load Tasks'}
		</button>
		
		<button 
			onclick={createTask}
			disabled={loading}
			class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
		>
			{loading ? 'Creating...' : 'Create Example Task'}
		</button>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
			<strong>Error:</strong> {error}
		</div>
	{/if}

	<!-- Tasks List -->
	<div class="space-y-4">
		<h3 class="text-xl font-semibold">Tasks ({tasks.length})</h3>
		
		{#if tasks.length === 0 && !loading}
			<div class="text-gray-500 text-center py-8">
				No tasks found. Create one to get started!
			</div>
		{/if}
		
		{#each tasks as task (task.id)}
			<div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
				<div class="flex justify-between items-start">
					<div class="flex-1">
						<h4 class="font-semibold text-lg">{task.title}</h4>
						<p class="text-gray-600 mt-1">{task.description}</p>
						<div class="flex gap-4 mt-2 text-sm text-gray-500">
							<span>Budget: ${task.budget}</span>
							<span>Category: {task.category}</span>
							<span>Location: {task.location}</span>
						</div>
					</div>
					
					<div class="flex gap-2">
						<button 
							onclick={() => updateTask(task.id)}
							disabled={loading}
							class="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 disabled:opacity-50"
						>
							Update
						</button>
						<button 
							onclick={() => deleteTask(task.id)}
							disabled={loading}
							class="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50"
						>
							Delete
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Instructions -->
	<div class="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
		<h4 class="font-semibold text-blue-800 mb-2">How to Test Offline Functionality:</h4>
		<ol class="list-decimal list-inside space-y-1 text-blue-700 text-sm">
			<li>Open your browser's developer tools</li>
			<li>Go to the Network tab</li>
			<li>Check "Offline" to simulate being offline</li>
			<li>Try creating, updating, or deleting tasks</li>
			<li>Notice how operations are queued for offline sync</li>
			<li>Uncheck "Offline" to restore connection</li>
			<li>Watch as queued operations are automatically synced</li>
		</ol>
	</div>
</div>
