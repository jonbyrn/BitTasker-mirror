<script lang="ts">
	import { onMount } from 'svelte';
	import EnhancedTaskExample from '$lib/components/examples/EnhancedTaskExample.svelte';
	import { serviceWorkerService } from '$lib/utils/serviceWorker';
	import { enhancedApiService } from '$lib/api/services/enhanced-api.service';

	let swStatus = $state<any>(null);
	let apiStatus = $state<any>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function checkStatus() {
		loading = true;
		error = null;
		try {
			console.log('Checking service worker status...');
			
			// Get service worker status
			const isReady = await serviceWorkerService.isReady();
			console.log('Service worker ready:', isReady);
			
			const isOnline = serviceWorkerService.network.isCurrentlyOnline();
			console.log('Network online:', isOnline);
			
			const syncQueueCount = enhancedApiService.getOfflineQueueStatus().count;
			console.log('Sync queue count:', syncQueueCount);
			
			const cacheStats = await serviceWorkerService.cache.getCacheStats();
			console.log('Cache stats:', cacheStats);
			
			swStatus = {
				isReady,
				isOnline,
				syncQueueCount,
				cacheStats
			};
			apiStatus = enhancedApiService.getOfflineQueueStatus();
			
			console.log('Status check complete:', swStatus);
		} catch (err) {
			console.error('Error checking status:', err);
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Auto-check status when page loads
	onMount(() => {
		checkStatus();
	});

	async function clearCache() {
		try {
			await serviceWorkerService.clearCache();
			await checkStatus();
		} catch (error) {
			console.error('Error clearing cache:', error);
		}
	}

	async function clearQueue() {
		try {
			await enhancedApiService.clearOfflineQueue();
			await checkStatus();
		} catch (error) {
			console.error('Error clearing queue:', error);
		}
	}
</script>

<svelte:head>
	<title>Service Worker Test - BitTasker</title>
	<meta name="description" content="Test page for service worker functionality" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<div class="container mx-auto py-8">
		<h1 class="text-3xl font-bold text-center mb-8">Service Worker Test Page</h1>
		
		{#if error}
			<div class="mb-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
				<strong>Error:</strong> {error}
			</div>
		{/if}
		
		<!-- Status Section -->
		<div class="mb-8 p-6 bg-white rounded-lg shadow">
			<h2 class="text-xl font-semibold mb-4">Service Worker Status</h2>
			
			<div class="flex gap-4 mb-4">
				<button 
					onclick={checkStatus}
					disabled={loading}
					class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
				>
					{loading ? 'Checking...' : 'Check Status'}
				</button>
				
				<button 
					onclick={clearCache}
					class="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
				>
					Clear Cache
				</button>
				
				<button 
					onclick={clearQueue}
					class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
				>
					Clear Queue
				</button>
			</div>

			{#if swStatus}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<h3 class="font-semibold mb-2">Service Worker</h3>
						<div class="space-y-2 text-sm">
							<div class="flex justify-between">
								<span>Ready:</span>
								<span class={swStatus.isReady ? 'text-green-600' : 'text-red-600'}>
									{swStatus.isReady ? 'Yes' : 'No'}
								</span>
							</div>
							<div class="flex justify-between">
								<span>Online:</span>
								<span class={swStatus.isOnline ? 'text-green-600' : 'text-red-600'}>
									{swStatus.isOnline ? 'Yes' : 'No'}
								</span>
							</div>
							<div class="flex justify-between">
								<span>Sync Queue:</span>
								<span class={swStatus.syncQueueCount > 0 ? 'text-orange-600' : 'text-green-600'}>
									{swStatus.syncQueueCount} items
								</span>
							</div>
						</div>
					</div>

					<div>
						<h3 class="font-semibold mb-2">Cache Statistics</h3>
						{#if swStatus.cacheStats}
							<div class="space-y-2 text-sm">
								<div class="flex justify-between">
									<span>Total Caches:</span>
									<span>{swStatus.cacheStats.totalCaches}</span>
								</div>
								<div class="flex justify-between">
									<span>Total Entries:</span>
									<span>{swStatus.cacheStats.totalEntries}</span>
								</div>
							</div>
						{:else}
							<p class="text-gray-500 text-sm">No cache statistics available</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Enhanced Task Example -->
		<div class="bg-white rounded-lg shadow">
			<EnhancedTaskExample />
		</div>

		<!-- Instructions -->
		<div class="mt-8 p-6 bg-blue-50 rounded-lg">
			<h2 class="text-xl font-semibold mb-4">Testing Instructions</h2>
			
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div>
					<h3 class="font-semibold mb-2">Offline Testing</h3>
					<ol class="list-decimal list-inside space-y-1 text-sm">
						<li>Open browser developer tools</li>
						<li>Go to Network tab</li>
						<li>Check "Offline" checkbox</li>
						<li>Try using the app features</li>
						<li>Notice offline indicators</li>
						<li>Uncheck "Offline" to restore</li>
						<li>Watch automatic sync</li>
					</ol>
				</div>

				<div>
					<h3 class="font-semibold mb-2">Cache Testing</h3>
					<ol class="list-decimal list-inside space-y-1 text-sm">
						<li>Load some data (tasks, etc.)</li>
						<li>Go offline</li>
						<li>Try to access the same data</li>
						<li>Notice it loads from cache</li>
						<li>Check cache statistics above</li>
						<li>Use "Clear Cache" to test</li>
					</ol>
				</div>
			</div>
		</div>

		<!-- Features Overview -->
		<div class="mt-8 p-6 bg-green-50 rounded-lg">
			<h2 class="text-xl font-semibold mb-4">Service Worker Features</h2>
			
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="p-4 bg-white rounded border">
					<h3 class="font-semibold mb-2">🔄 Offline Sync</h3>
					<p class="text-sm text-gray-600">
						Actions performed offline are automatically queued and synced when connection is restored.
					</p>
				</div>

				<div class="p-4 bg-white rounded border">
					<h3 class="font-semibold mb-2">📦 Intelligent Caching</h3>
					<p class="text-sm text-gray-600">
						Static assets, API responses, and navigation pages are cached for offline access.
					</p>
				</div>

				<div class="p-4 bg-white rounded border">
					<h3 class="font-semibold mb-2">📱 Background Processing</h3>
					<p class="text-sm text-gray-600">
						Service worker runs in the background to handle sync, caching, and notifications.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
