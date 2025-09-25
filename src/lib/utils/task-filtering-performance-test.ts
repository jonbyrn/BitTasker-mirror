import type { Task, SearchTasksParams } from '$lib/types/task.d';
import { indexTaskData, filterIndexedTasks } from './task-indexing';

/**
 * Performance test results interface
 */
interface PerformanceTestResult {
	method: 'legacy' | 'optimized';
	taskCount: number;
	filterTime: number;
	memoryUsed: number;
	throughput: number; // tasks per millisecond
}

/**
 * Legacy filtering implementation for comparison
 * This mirrors the original nested loop approach
 */
function legacyFilterTasks(tasks: Task[], params: SearchTasksParams): { tasks: Task[]; filterTime: number } {
	const startTime = performance.now();
	
	let filteredTasks = tasks;
	
	// Apply skills filter using nested loops (O(n*m*k))
	if (params.skills && params.skills.length > 0) {
		filteredTasks = filteredTasks.filter(task => {
			const taskSkills = task.skills || [];
			return params.skills!.some(skill => 
				taskSkills.some((taskSkill: string) => 
					taskSkill.toLowerCase().includes(skill.toLowerCase()) ||
					skill.toLowerCase().includes(taskSkill.toLowerCase())
				)
			);
		});
	}
	
	// Apply categories filter using nested loops (O(n*m))
	if (params.categories && params.categories.length > 0) {
		filteredTasks = filteredTasks.filter(task => {
			const taskCategories = task.categories || [];
			return params.categories!.some(category => 
				taskCategories.includes(category)
			);
		});
	}
	
	// Apply text search filter
	if (params.search && params.search.length > 0) {
		const searchTerm = params.search.toLowerCase().trim();
		filteredTasks = filteredTasks.filter(task => {
			const title = task.title?.toLowerCase() || '';
			const description = task.description?.toLowerCase() || '';
			const skillsText = (task.skills || []).join(' ').toLowerCase();
			const categoriesText = (task.categories || []).join(' ').toLowerCase();
			
			return title.includes(searchTerm) || 
				   description.includes(searchTerm) ||
				   skillsText.includes(searchTerm) ||
				   categoriesText.includes(searchTerm);
		});
	}
	
	const filterTime = performance.now() - startTime;
	
	return { tasks: filteredTasks, filterTime };
}

/**
 * Generate mock task data for performance testing
 */
function generateMockTasks(count: number): Task[] {
	const mockSkills = [
		'JavaScript', 'TypeScript', 'React', 'Svelte', 'Node.js', 'Python', 'Java', 'C++',
		'Design', 'UI/UX', 'Graphics', 'Photography', 'Writing', 'Marketing', 'SEO',
		'Data Analysis', 'Machine Learning', 'DevOps', 'Cloud', 'AWS', 'Docker'
	];
	
	const mockCategories = [
		'Development', 'Design', 'Marketing', 'Writing', 'Data', 'Photography',
		'Video', 'Audio', 'Translation', 'Business', 'Consulting', 'Research'
	];
	
	const tasks: Task[] = [];
	
	for (let i = 0; i < count; i++) {
		// Randomly select 2-5 skills and 1-3 categories
		const skillCount = Math.floor(Math.random() * 4) + 2;
		const categoryCount = Math.floor(Math.random() * 3) + 1;
		
		const selectedSkills = Array.from({ length: skillCount }, () => 
			mockSkills[Math.floor(Math.random() * mockSkills.length)]
		);
		
		const selectedCategories = Array.from({ length: categoryCount }, () => 
			mockCategories[Math.floor(Math.random() * mockCategories.length)]
		);
		
		tasks.push({
			id: `task-${i}`,
			npub: `npub-${i}`,
			title: `Task ${i} - ${selectedSkills[0]} Project`,
			description: `This is a detailed description for task ${i} involving ${selectedSkills.join(', ')}`,
			skills: [...new Set(selectedSkills)], // Remove duplicates
			categories: [...new Set(selectedCategories)], // Remove duplicates
			status: 'OPEN' as any,
			taskType: 'REMOTE' as any,
			budget: {
				amount: Math.floor(Math.random() * 5000) + 100,
				currency: 'USD',
				type: 'FIXED' as any
			},
			deadline: null,
			dateRange: null,
			pickupLocation: null,
			dropOffLocation: null,
			isRemovals: false,
			isBoosted: false,
			boostPercentage: null,
			createdAt: Date.now() - Math.floor(Math.random() * 86400000), // Random time in last 24h
			updatedAt: new Date().toISOString(),
			completedAt: null,
			cancelledAt: null,
			deletedAt: null,
			isDeleted: false,
			requiredSkills: selectedSkills.slice(0, 2),
			estimatedHours: Math.floor(Math.random() * 40) + 1
		});
	}
	
	return tasks;
}

/**
 * Run performance comparison test
 */
export async function runPerformanceTest(taskCounts: number[] = [100, 500, 1000, 2000]): Promise<PerformanceTestResult[]> {
	const results: PerformanceTestResult[] = [];
	
	console.group('🚀 Task Filtering Performance Test');
	
	for (const taskCount of taskCounts) {
		console.group(`Testing with ${taskCount} tasks`);
		
		// Generate test data
		const mockTasks = generateMockTasks(taskCount);
		
		// Test parameters that will trigger filtering
		const testParams: SearchTasksParams = {
			skills: ['JavaScript', 'React'],
			categories: ['Development'],
			search: 'project'
		};
		
		// Test legacy approach
		const legacyMemoryBefore = (performance as any).memory?.usedJSHeapSize || 0;
		const legacyResult = legacyFilterTasks(mockTasks, testParams);
		const legacyMemoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
		
		results.push({
			method: 'legacy',
			taskCount,
			filterTime: legacyResult.filterTime,
			memoryUsed: legacyMemoryAfter - legacyMemoryBefore,
			throughput: taskCount / legacyResult.filterTime
		});
		
		// Clear memory
		await new Promise(resolve => setTimeout(resolve, 100));
		
		// Test optimized approach
		const optimizedMemoryBefore = (performance as any).memory?.usedJSHeapSize || 0;
		const indexedTasks = indexTaskData(mockTasks);
		const { tasks: optimizedTasks, metrics } = filterIndexedTasks(indexedTasks, testParams);
		const optimizedMemoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
		
		results.push({
			method: 'optimized',
			taskCount,
			filterTime: metrics.filterTime,
			memoryUsed: optimizedMemoryAfter - optimizedMemoryBefore,
			throughput: taskCount / metrics.filterTime
		});
		
		// Log results for this task count
		const legacyTime = legacyResult.filterTime;
		const optimizedTime = metrics.filterTime;
		const speedup = legacyTime / optimizedTime;
		const filteredCount = optimizedTasks.length;
		
		console.log(`✅ Results for ${taskCount} tasks:`);
		console.log(`   Legacy:    ${legacyTime.toFixed(2)}ms`);
		console.log(`   Optimized: ${optimizedTime.toFixed(2)}ms`);
		console.log(`   Speedup:   ${speedup.toFixed(2)}x faster`);
		console.log(`   Filtered:  ${filteredCount} tasks matched`);
		
		console.groupEnd();
	}
	
	// Summary
	console.group('📊 Performance Summary');
	
	const legacyResults = results.filter(r => r.method === 'legacy');
	const optimizedResults = results.filter(r => r.method === 'optimized');
	
	const avgLegacyTime = legacyResults.reduce((sum, r) => sum + r.filterTime, 0) / legacyResults.length;
	const avgOptimizedTime = optimizedResults.reduce((sum, r) => sum + r.filterTime, 0) / optimizedResults.length;
	const avgSpeedup = avgLegacyTime / avgOptimizedTime;
	
	console.log(`Average Legacy Time:    ${avgLegacyTime.toFixed(2)}ms`);
	console.log(`Average Optimized Time: ${avgOptimizedTime.toFixed(2)}ms`);
	console.log(`Average Speedup:        ${avgSpeedup.toFixed(2)}x faster`);
	console.log(`Performance Improvement: ${((avgSpeedup - 1) * 100).toFixed(1)}%`);
	
	console.groupEnd();
	console.groupEnd();
	
	return results;
}

/**
 * Test memory efficiency
 */
export function testMemoryEfficiency(taskCount: number = 1000): {
	legacyMemory: number;
	optimizedMemory: number;
	memoryReduction: number;
} {
	const mockTasks = generateMockTasks(taskCount);
	
	// Measure legacy approach memory
	const legacyBefore = (performance as any).memory?.usedJSHeapSize || 0;
	const legacyFiltered = legacyFilterTasks(mockTasks, { skills: ['JavaScript'] });
	const legacyAfter = (performance as any).memory?.usedJSHeapSize || 0;
	const legacyMemory = legacyAfter - legacyBefore;
	
	// Measure optimized approach memory
	const optimizedBefore = (performance as any).memory?.usedJSHeapSize || 0;
	const indexedTasks = indexTaskData(mockTasks);
	const optimizedFiltered = filterIndexedTasks(indexedTasks, { skills: ['JavaScript'] });
	const optimizedAfter = (performance as any).memory?.usedJSHeapSize || 0;
	const optimizedMemory = optimizedAfter - optimizedBefore;
	
	const memoryReduction = ((legacyMemory - optimizedMemory) / legacyMemory) * 100;
	
	console.group('💾 Memory Efficiency Test');
	console.log(`Tasks tested: ${taskCount}`);
	console.log(`Legacy memory usage:    ${(legacyMemory / 1024).toFixed(2)} KB`);
	console.log(`Optimized memory usage: ${(optimizedMemory / 1024).toFixed(2)} KB`);
	console.log(`Memory reduction:       ${memoryReduction.toFixed(1)}%`);
	console.groupEnd();
	
	return {
		legacyMemory,
		optimizedMemory,
		memoryReduction
	};
}

/**
 * Benchmark with real-world filter combinations
 */
export async function benchmarkRealWorldScenarios(): Promise<void> {
	const mockTasks = generateMockTasks(1000);
	
	const scenarios = [
		{ name: 'No filters', params: {} },
		{ name: 'Single skill', params: { skills: ['JavaScript'] } },
		{ name: 'Multiple skills', params: { skills: ['JavaScript', 'React', 'Node.js'] } },
		{ name: 'Single category', params: { categories: ['Development'] } },
		{ name: 'Multiple categories', params: { categories: ['Development', 'Design'] } },
		{ name: 'Text search only', params: { search: 'project' } },
		{ name: 'Combined filters', params: { skills: ['JavaScript'], categories: ['Development'], search: 'web' } },
		{ name: 'Complex query', params: { skills: ['JavaScript', 'React', 'TypeScript'], categories: ['Development', 'Design'], search: 'frontend project' } }
	];
	
	console.group('🎯 Real-World Scenarios Benchmark');
	
	for (const scenario of scenarios) {
		const legacyResult = legacyFilterTasks(mockTasks, scenario.params);
		
		const indexedTasks = indexTaskData(mockTasks);
		const { metrics } = filterIndexedTasks(indexedTasks, scenario.params);
		
		const speedup = legacyResult.filterTime / metrics.filterTime;
		
		console.log(`${scenario.name.padEnd(20)} | Legacy: ${legacyResult.filterTime.toFixed(2)}ms | Optimized: ${metrics.filterTime.toFixed(2)}ms | Speedup: ${speedup.toFixed(2)}x`);
	}
	
	console.groupEnd();
}

// Export for use in development/debugging
if (typeof window !== 'undefined') {
	(window as any).taskFilteringPerformanceTest = {
		runPerformanceTest,
		testMemoryEfficiency,
		benchmarkRealWorldScenarios
	};
}
