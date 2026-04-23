import { runPerformanceTest, testMemoryEfficiency, benchmarkRealWorldScenarios } from './task-filtering-performance-test';
import { getFilterPerformanceReport } from '$lib/nostr/findTasks';
import { browser } from '$app/environment';

/**
 * Development helper for performance testing and monitoring
 * Available in browser console as window.BitTaskerPerformance
 */
class PerformanceTestHelper {
	/**
	 * Run comprehensive performance test
	 */
	async runFullTest(): Promise<void> {
		console.log('🚀 Starting BitTasker Frontend Filtering Performance Analysis...\n');
		
		// Run performance comparison
		await runPerformanceTest([100, 500, 1000, 2000, 5000]);
		
		// Test memory efficiency  
		testMemoryEfficiency(2000);
		
		// Benchmark real-world scenarios
		await benchmarkRealWorldScenarios();
		
		// Show current session metrics
		this.showSessionMetrics();
		
		console.log('\n✅ Performance analysis complete!');
	}
	
	/**
	 * Quick performance test with smaller dataset
	 */
	async quickTest(): Promise<void> {
		console.log('⚡ Running quick performance test...\n');
		await runPerformanceTest([100, 500]);
		this.showSessionMetrics();
	}
	
	/**
	 * Show current session filtering metrics
	 */
	showSessionMetrics(): void {
		const metrics = getFilterPerformanceReport();
		
		console.group('📈 Current Session Metrics');
		console.log(`Total filter operations: ${metrics.totalOperations}`);
		console.log(`Average filter time: ${metrics.averageFilterTime.toFixed(2)}ms`);
		console.log(`Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
		console.log(`Filter efficiency: ${(metrics.filterEfficiency * 100).toFixed(1)}%`);
		console.groupEnd();
	}
	
	/**
	 * Test memory usage patterns
	 */
	testMemory(): void {
		console.log('💾 Testing memory efficiency...\n');
		testMemoryEfficiency(1000);
	}
	
	/**
	 * Benchmark real-world filter scenarios
	 */
	async testScenarios(): Promise<void> {
		console.log('🎯 Testing real-world scenarios...\n');
		await benchmarkRealWorldScenarios();
	}
	
	/**
	 * Monitor performance continuously
	 */
	startMonitoring(): void {
		console.log('👁️ Starting performance monitoring...');
		
		// Log metrics every 30 seconds
		const interval = setInterval(() => {
			const metrics = getFilterPerformanceReport();
			if (metrics.totalOperations > 0) {
				console.log(`[Monitor] Ops: ${metrics.totalOperations}, Avg: ${metrics.averageFilterTime.toFixed(2)}ms, Cache: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
			}
		}, 30000);
		
		// Store interval for cleanup
		(this as any)._monitoringInterval = interval;
		
		console.log('Monitoring started. Use stopMonitoring() to stop.');
	}
	
	/**
	 * Stop performance monitoring
	 */
	stopMonitoring(): void {
		if ((this as any)._monitoringInterval) {
			clearInterval((this as any)._monitoringInterval);
			(this as any)._monitoringInterval = null;
			console.log('✋ Performance monitoring stopped.');
		}
	}
	
	/**
	 * Show help information
	 */
	help(): void {
		console.group('🛠️ BitTasker Performance Testing Helper');
		console.log('Available commands:');
		console.log('');
		console.log('runFullTest()     - Run comprehensive performance analysis');
		console.log('quickTest()       - Run quick performance test');
		console.log('showSessionMetrics() - Show current session metrics');
		console.log('testMemory()      - Test memory efficiency');
		console.log('testScenarios()   - Test real-world filter scenarios');
		console.log('startMonitoring() - Start continuous performance monitoring');
		console.log('stopMonitoring()  - Stop performance monitoring');
		console.log('help()            - Show this help message');
		console.log('');
		console.log('Example usage:');
		console.log('BitTaskerPerformance.runFullTest()');
		console.log('BitTaskerPerformance.showSessionMetrics()');
		console.groupEnd();
	}
}

// Export for use in components if needed
export const performanceTestHelper = new PerformanceTestHelper();

// Make available in browser console for development
if (browser && typeof window !== 'undefined') {
	(window as any).BitTaskerPerformance = performanceTestHelper;
	
	// Show availability message in development
	if (process.env.NODE_ENV === 'development') {
		console.log('🛠️ BitTasker Performance Testing available in console: BitTaskerPerformance.help()');
	}
}
