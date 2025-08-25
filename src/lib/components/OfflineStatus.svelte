<script lang="ts">
	import { onMount } from 'svelte';
	import { serviceWorkerService, isOnline, clearCache as clearServiceWorkerCache } from '$lib/utils/serviceWorker';
	import { enhancedApiService } from '$lib/api/services/enhanced-api.service';

	let isOffline = $state(!isOnline());
	let syncQueueCount = $state(0);
	let cacheStats = $state<any>(null);
	let showDetails = $state(false);
	let isInitialized = $state(false);

	// Network status listener
	let unsubscribe: (() => void) | null = null;

	onMount(() => {
		(async () => {
			// Initialize service worker
			await serviceWorkerService.initialize();
			await enhancedApiService.initialize();
			
			// Setup network status listener
			unsubscribe = serviceWorkerService.network.addListener((online) => {
				isOffline = !online;
				if (online) {
					updateSyncQueueStatus();
					updateCacheStats();
				}
			});

			// Initial status update
			updateSyncQueueStatus();
			updateCacheStats();
			isInitialized = true;
		})();

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	});

	async function updateSyncQueueStatus() {
		const status = enhancedApiService.getOfflineQueueStatus();
		syncQueueCount = status.count;
	}

	async function updateCacheStats() {
		try {
			cacheStats = await serviceWorkerService.cache.getCacheStats();
		} catch (error) {
			console.error('Failed to get cache stats:', error);
		}
	}

	async function retrySync() {
		try {
			await enhancedApiService.waitForConnectionAndRetry();
			await updateSyncQueueStatus();
		} catch (error) {
			console.error('Failed to retry sync:', error);
		}
	}

	async function clearCache() {
		try {
			await clearServiceWorkerCache();
			await updateCacheStats();
		} catch (error) {
			console.error('Failed to clear cache:', error);
		}
	}

	async function clearSyncQueue() {
		try {
			await enhancedApiService.clearOfflineQueue();
			await updateSyncQueueStatus();
		} catch (error) {
			console.error('Failed to clear sync queue:', error);
		}
	}

	function toggleDetails() {
		showDetails = !showDetails;
	}
</script>

{#if isInitialized}
	<div class="offline-status" class:offline={isOffline} class:has-queue={syncQueueCount > 0}>
		<div class="status-bar">
			<div class="status-indicator">
				{#if isOffline}
					<span class="icon">📱</span>
					<span class="text">Offline</span>
				{:else}
					<span class="icon">🌐</span>
					<span class="text">Online</span>
				{/if}
			</div>

			{#if syncQueueCount > 0}
				<div class="sync-badge">
					<span class="count">{syncQueueCount}</span>
					<span class="label">pending</span>
				</div>
			{/if}

			<button class="details-toggle" class:expanded={showDetails} onclick={toggleDetails} type="button" aria-expanded={showDetails} aria-label="Toggle offline status details">
				▼
			</button>
		</div>

		{#if showDetails}
			<div class="details-panel">
				<div class="section">
					<h4>Network Status</h4>
					<div class="status-item">
						<span class="label">Connection:</span>
						<span class="value" class:online={!isOffline} class:offline={isOffline}>
							{isOffline ? 'Offline' : 'Online'}
						</span>
					</div>
				</div>

				<div class="section">
					<h4>Sync Queue</h4>
					<div class="status-item">
						<span class="label">Pending items:</span>
						<span class="value">{syncQueueCount}</span>
					</div>
					
					{#if syncQueueCount > 0}
						<div class="actions">
							<button class="action-btn primary" onclick={retrySync}>
								🔄 Retry Sync
							</button>
							<button class="action-btn secondary" onclick={clearSyncQueue}>
								🗑️ Clear Queue
							</button>
						</div>
					{/if}
				</div>

				{#if cacheStats}
					<div class="section">
						<h4>Cache Statistics</h4>
						<div class="status-item">
							<span class="label">Total caches:</span>
							<span class="value">{cacheStats.totalCaches}</span>
						</div>
						<div class="status-item">
							<span class="label">Total entries:</span>
							<span class="value">{cacheStats.totalEntries}</span>
						</div>
						
						<div class="actions">
							<button class="action-btn secondary" onclick={clearCache}>
								🗑️ Clear Cache
							</button>
						</div>
					</div>
				{/if}

				<div class="section">
					<h4>Service Worker</h4>
					<div class="status-item">
						<span class="label">Status:</span>
						<span class="value online">Active</span>
					</div>
					<div class="status-item">
						<span class="label">Version:</span>
						<span class="value">v1.0.0</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.offline-status {
		position: fixed;
		bottom: 20px;
		right: 20px;
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		border: 2px solid #e9ecef;
		transition: all 0.3s ease;
		z-index: 1000;
		min-width: 200px;
		max-width: 300px;
	}

	.offline-status.offline {
		border-color: #dc3545;
		background: #fff5f5;
	}

	.offline-status.has-queue {
		border-color: #ffc107;
		background: #fffbf0;
	}

	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		cursor: pointer;
		user-select: none;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
	}

	.status-indicator .icon {
		font-size: 16px;
	}

	.status-indicator .text {
		font-size: 14px;
	}

	.sync-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #ffc107;
		color: #000;
		padding: 4px 8px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 600;
	}

	.sync-badge .count {
		background: #000;
		color: #fff;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
	}

	.details-toggle {
		background: none;
		border: none;
		font-size: 12px;
		cursor: pointer;
		transition: transform 0.2s ease;
		padding: 4px;
		border-radius: 4px;
	}

	.details-toggle:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.details-toggle.expanded {
		transform: rotate(180deg);
	}

	.details-panel {
		border-top: 1px solid #e9ecef;
		padding: 16px;
		background: #f8f9fa;
		border-radius: 0 0 12px 12px;
	}

	.section {
		margin-bottom: 16px;
	}

	.section:last-child {
		margin-bottom: 0;
	}

	.section h4 {
		margin: 0 0 8px 0;
		font-size: 14px;
		font-weight: 600;
		color: #495057;
	}

	.status-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
		font-size: 13px;
	}

	.status-item:last-child {
		margin-bottom: 0;
	}

	.status-item .label {
		color: #6c757d;
	}

	.status-item .value {
		font-weight: 500;
	}

	.status-item .value.online {
		color: #28a745;
	}

	.status-item .value.offline {
		color: #dc3545;
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	.action-btn {
		padding: 6px 12px;
		border: none;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		flex: 1;
	}

	.action-btn.primary {
		background: #007bff;
		color: white;
	}

	.action-btn.primary:hover {
		background: #0056b3;
	}

	.action-btn.secondary {
		background: #6c757d;
		color: white;
	}

	.action-btn.secondary:hover {
		background: #545b62;
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.offline-status {
			bottom: 10px;
			right: 10px;
			left: 10px;
			max-width: none;
		}

		.actions {
			flex-direction: column;
		}
	}

	/* Animation for offline status */
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.offline-status.offline .status-indicator {
		animation: pulse 2s infinite;
	}
</style>
