import type { Task, SearchTasksParams } from '$lib/types/task.d';

/**
 * Interface for pre-indexed task data to enable O(1) lookups
 */
export interface IndexedTask extends Task {
	// Pre-computed normalized data for fast filtering
	_skillsSet?: Set<string>;
	_categoriesSet?: Set<string>;
	_normalizedTitle?: string;
	_normalizedDescription?: string;
	_searchableText?: string;
}

/**
 * Interface for filter performance metrics
 */
export interface FilterPerformanceMetrics {
	totalTasks: number;
	filteredTasks: number;
	filterTime: number;
	indexTime: number;
	cacheHit: boolean;
}

/**
 * Pre-index task data to enable fast filtering operations
 * This converts arrays to Sets and normalizes text for O(1) lookups
 */
export function indexTaskData(tasks: Task[]): IndexedTask[] {
	const startTime = performance.now();
	
    const normalizeToKey = (value: unknown): string => {
        if (typeof value === 'string') return value.toLowerCase().trim();
        if (value && typeof value === 'object') {
            const v = value as Record<string, unknown>;
            if (typeof v.id === 'string' || typeof v.id === 'number') return String(v.id).toLowerCase().trim();
            if (typeof v.name === 'string') return v.name.toLowerCase().trim();
            if (typeof v.title === 'string') return v.title.toLowerCase().trim();
        }
        return String(value ?? '').toLowerCase().trim();
    };

	const indexedTasks = tasks.map((task): IndexedTask => {
		// Create normalized skill and category sets for O(1) lookups
        const skillsSet = new Set((task.skills || []).map((skill) => normalizeToKey(skill)));
		
        const categoriesSet = new Set((task.categories || []).map((category) => normalizeToKey(category)));
		
		// Pre-normalize text fields for search
		const normalizedTitle = task.title?.toLowerCase().trim() || '';
		const normalizedDescription = task.description?.toLowerCase().trim() || '';
		
		// Create combined searchable text for full-text search
        const searchableText = [
            normalizedTitle,
            normalizedDescription,
            ...Array.from(skillsSet),
            ...Array.from(categoriesSet)
        ].join(' ');
		
		return {
			...task,
			_skillsSet: skillsSet,
			_categoriesSet: categoriesSet,
			_normalizedTitle: normalizedTitle,
			_normalizedDescription: normalizedDescription,
			_searchableText: searchableText
		};
	});
	
	const indexTime = performance.now() - startTime;
	console.debug(`[TaskIndexing] Indexed ${tasks.length} tasks in ${indexTime.toFixed(2)}ms`);
	
	return indexedTasks;
}

/**
 * Optimized task filtering using pre-indexed data
 * Replaces O(n*m*k) nested loops with O(n) filtering after O(m) pre-processing
 */
export function filterIndexedTasks(
	indexedTasks: IndexedTask[], 
	params: SearchTasksParams
): { tasks: IndexedTask[]; metrics: FilterPerformanceMetrics } {
	const startTime = performance.now();
	
	// Early return if no filters applied
	if (!hasActiveFilters(params)) {
		const metrics: FilterPerformanceMetrics = {
			totalTasks: indexedTasks.length,
			filteredTasks: indexedTasks.length,
			filterTime: performance.now() - startTime,
			indexTime: 0,
			cacheHit: false
		};
		return { tasks: indexedTasks, metrics };
	}
	
	// Pre-process filter criteria for O(1) lookups
    const normalizeToKey = (value: unknown): string => {
        if (typeof value === 'string') return value.toLowerCase().trim();
        if (value && typeof value === 'object') {
            const v = value as Record<string, unknown>;
            if (typeof v.id === 'string' || typeof v.id === 'number') return String(v.id).toLowerCase().trim();
            if (typeof v.name === 'string') return v.name.toLowerCase().trim();
            if (typeof v.title === 'string') return v.title.toLowerCase().trim();
        }
        return String(value ?? '').toLowerCase().trim();
    };

    const normalizedSkills = (params.skills || []).map(normalizeToKey);
    const normalizedCategories = (params.categories || []).map(normalizeToKey);
	const searchTerm = params.search?.toLowerCase().trim();
	
	// Convert to Sets for O(1) lookup performance
	const skillsFilter = new Set(normalizedSkills);
	const categoriesFilter = new Set(normalizedCategories);
	
	let filteredTasks = indexedTasks;
	
	// Apply skills filter using Set intersection (O(n) instead of O(n*m*k))
	if (normalizedSkills.length > 0) {
		filteredTasks = filteredTasks.filter(task => {
			// Check if any of the task's skills match any of the filter skills
			if (!task._skillsSet || task._skillsSet.size === 0) return false;
			
			// Use Set operations for O(1) lookups
			for (const filterSkill of skillsFilter) {
				for (const taskSkill of task._skillsSet) {
					// Support partial matching for flexibility
					if (taskSkill.includes(filterSkill) || filterSkill.includes(taskSkill)) {
						return true;
					}
				}
			}
			return false;
		});
	}
	
	// Apply categories filter using Set intersection (O(n) instead of O(n*m))
	if (normalizedCategories.length > 0) {
		filteredTasks = filteredTasks.filter(task => {
			if (!task._categoriesSet || task._categoriesSet.size === 0) return false;
			
			// Check for exact category matches using Set intersection
			for (const filterCategory of categoriesFilter) {
				if (task._categoriesSet.has(filterCategory)) {
					return true;
				}
			}
			return false;
		});
	}
	
	// Apply text search filter using pre-computed searchable text
	if (searchTerm && searchTerm.length > 0) {
		filteredTasks = filteredTasks.filter(task => {
			return task._searchableText?.includes(searchTerm) || false;
		});
	}
	
	// Apply deadline filter - exclude tasks with past deadlines
	// Compare dates by date only (not time) to ensure tasks with today's deadline are included
	// Use local timezone for comparison to avoid timezone-related filtering issues
	filteredTasks = filteredTasks.filter(task => {
		// If task has no deadline, include it
		if (!task.deadline) return true;
		
		// Extract date components (YYYY-MM-DD) from deadline and current date in local timezone
		// This ensures we compare dates only, not times, so tasks with today's deadline are included
		const deadlineDate = new Date(task.deadline);
		
		// Check if the date is valid
		if (isNaN(deadlineDate.getTime())) {
			return true; // Include tasks with invalid dates to avoid breaking the UI
		}
		
		// Get local date components to avoid timezone conversion issues
		const deadlineYear = deadlineDate.getFullYear();
		const deadlineMonth = deadlineDate.getMonth();
		const deadlineDay = deadlineDate.getDate();
		const deadlineDateStr = `${deadlineYear}-${String(deadlineMonth + 1).padStart(2, '0')}-${String(deadlineDay).padStart(2, '0')}`;
		
		const now = new Date();
		const nowYear = now.getFullYear();
		const nowMonth = now.getMonth();
		const nowDay = now.getDate();
		const nowDateStr = `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}-${String(nowDay).padStart(2, '0')}`;
		
		// Include task if deadline date is today or in the future (comparing in local timezone)
		return deadlineDateStr >= nowDateStr;
	});
	
	
	// Apply location filter with radius - ONLY use pickup location
	if (params.location && params.radius) {
		const searchLocation = params.location.toLowerCase().trim();
		const radius = params.radius;
		
		filteredTasks = filteredTasks.filter(task => {
			// Only check pickup location for filtering
			const hasPickupLocation = task.pickupLocation && 
				task.pickupLocation.latitude && 
				task.pickupLocation.longitude;
			
			// Get pickup location name for text matching
			const pickupLocationName = task.pickupLocation?.displayName?.toLowerCase() || '';
			
			// If we have coordinates for the search location, use distance calculation
			if (params.locationCoords) {
				const searchLat = params.locationCoords.latitude;
				const searchLng = params.locationCoords.longitude;
				
				// Check pickup location distance (if coordinates available)
				if (hasPickupLocation) {
					const distance = calculateDistance(
						searchLat, 
						searchLng, 
						task.pickupLocation!.latitude!, 
						task.pickupLocation!.longitude!
					);
					if (distance <= radius) {
						return true;
					}
				}
				
				// If no coordinates available for pickup location, fall back to text matching
				// Extract city name from pickup location for better matching
				const cityMatch = extractCityFromLocation(pickupLocationName, searchLocation);
				return cityMatch;
			} else {
				// Fallback to text-based matching if no search coordinates available
				const cityMatch = extractCityFromLocation(pickupLocationName, searchLocation);
				return cityMatch;
			}
		});
	}
	
	const filterTime = performance.now() - startTime;
	
	const metrics: FilterPerformanceMetrics = {
		totalTasks: indexedTasks.length,
		filteredTasks: filteredTasks.length,
		filterTime,
		indexTime: 0,
		cacheHit: false
	};
	
	console.debug(`[TaskIndexing] Filtered ${indexedTasks.length} → ${filteredTasks.length} tasks in ${filterTime.toFixed(2)}ms`);
	
	return { tasks: filteredTasks, metrics };
}

/**
 * Calculate distance between two geographic points using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a =
		Math.sin(dLat/2) * Math.sin(dLat/2) +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLng/2) * Math.sin(dLng/2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	return R * c;
}

/**
 * Extract city name from location string for better matching
 * Handles cases like "Nuevo Lourdes, Lourdes, El Salvador" -> "nuevo lourdes"
 */
function extractCityFromLocation(locationString: string, searchTerm: string): boolean {
	if (!locationString || !searchTerm) return false;
	
	// Split by comma and get the first part (usually the city/neighborhood)
	const parts = locationString.split(',').map(part => part.trim().toLowerCase());
	
	// Check if any part contains the search term
	return parts.some(part => part.includes(searchTerm));
}

/**
 * Check if any active filters are applied
 */
function hasActiveFilters(params: SearchTasksParams): boolean {
	return !!(
		(params.skills && params.skills.length > 0) ||
		(params.categories && params.categories.length > 0) ||
		(params.search && params.search.trim().length > 0) ||
		(params.location && params.radius) ||
		true // Always apply deadline filtering
	);
}

/**
 * Advanced skills matching with fuzzy search support
 * Uses Levenshtein-like distance for typo tolerance
 */
export function fuzzySkillsMatch(taskSkills: string[], filterSkills: string[], threshold = 0.8): boolean {
	if (!taskSkills || taskSkills.length === 0 || !filterSkills || filterSkills.length === 0) {
		return false;
	}
	
	for (const filterSkill of filterSkills) {
		for (const taskSkill of taskSkills) {
			const similarity = calculateStringSimilarity(
				taskSkill.toLowerCase(),
				filterSkill.toLowerCase()
			);
			if (similarity >= threshold) {
				return true;
			}
		}
	}
	
	return false;
}

/**
 * Calculate string similarity using simple character overlap
 * More sophisticated than exact matching, lighter than Levenshtein
 */
function calculateStringSimilarity(str1: string, str2: string): number {
	if (str1 === str2) return 1.0;
	if (str1.length === 0 || str2.length === 0) return 0.0;
	
	// Use Jaccard similarity (intersection over union of character sets)
	const set1 = new Set(str1.split(''));
	const set2 = new Set(str2.split(''));
	
	const intersection = new Set([...set1].filter(x => set2.has(x)));
	const union = new Set([...set1, ...set2]);
	
	return intersection.size / union.size;
}

/**
 * Clean up indexed data to free memory
 */
export function cleanupIndexedTasks(tasks: IndexedTask[]): Task[] {
	return tasks.map(task => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { _skillsSet, _categoriesSet, _normalizedTitle, _normalizedDescription, _searchableText, ...cleanTask } = task;
		return cleanTask;
	});
}

/**
 * Performance monitoring for filter operations
 */
export class FilterPerformanceMonitor {
	private metrics: FilterPerformanceMetrics[] = [];
	private readonly maxHistorySize = 100;
	
	addMetric(metric: FilterPerformanceMetrics): void {
		this.metrics.push(metric);
		
		// Keep only recent metrics to prevent memory leaks
		if (this.metrics.length > this.maxHistorySize) {
			this.metrics = this.metrics.slice(-this.maxHistorySize);
		}
	}
	
	getAverageFilterTime(): number {
		if (this.metrics.length === 0) return 0;
		const total = this.metrics.reduce((sum, metric) => sum + metric.filterTime, 0);
		return total / this.metrics.length;
	}
	
	getCacheHitRate(): number {
		if (this.metrics.length === 0) return 0;
		const cacheHits = this.metrics.filter(m => m.cacheHit).length;
		return cacheHits / this.metrics.length;
	}
	
	getFilterEfficiency(): number {
		if (this.metrics.length === 0) return 0;
		const totalReduction = this.metrics.reduce((sum, metric) => {
			return sum + (metric.totalTasks - metric.filteredTasks);
		}, 0);
		const totalTasks = this.metrics.reduce((sum, metric) => sum + metric.totalTasks, 0);
		return totalTasks > 0 ? totalReduction / totalTasks : 0;
	}
	
	getPerformanceReport(): {
		averageFilterTime: number;
		cacheHitRate: number;
		filterEfficiency: number;
		totalOperations: number;
	} {
		return {
			averageFilterTime: this.getAverageFilterTime(),
			cacheHitRate: this.getCacheHitRate(),
			filterEfficiency: this.getFilterEfficiency(),
			totalOperations: this.metrics.length
		};
	}
	
	clear(): void {
		this.metrics = [];
	}
}

// Global performance monitor instance
export const performanceMonitor = new FilterPerformanceMonitor();
