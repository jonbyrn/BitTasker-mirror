# Find Tasks Page - Nostr Migration Documentation

## Overview

This document outlines the migration plan for the Find Tasks page from GraphQL/Houdini to Nostr. The migration will maintain all existing functionality while leveraging Nostr's decentralized architecture.

## Nostr Implementation Details

### NIPs (Nostr Implementation Possibilities)

#### NIP-45: Event Counting
- Allows efficient counting of events matching a filter
- Useful for pagination and total result counts
- Relays respond with a count of events matching the filter
- Example usage:
  ```javascript
  const countResult = await pool.count([relay], [filter]);
  const totalTasks = countResult[relay];
  ```
- Benefits:
  - Efficient pagination
  - Accurate total counts without fetching all events
  - Better UX with progress indicators

#### NIP-50: Search Capability
- Provides full-text search functionality
- Supports searching through event content and tags
- Features:
  - Case-insensitive search
  - Multiple term search
  - Prefix matching
  - Tag-specific search
- Example filter:
  ```javascript
  const filter = {
    kinds: [taskKind],
    search: "web development",
    tags: [["s", "javascript"], ["c", "programming"]]
  };
  ```
- Benefits:
  - Improved search accuracy
  - Better relevance ranking
  - Faster search results
  - Reduced client-side filtering

## Core Features Migration

import { TASKS_KINDS } from '$lib/nostr/task.ts'

### 1. Task Data Structure

```json
{
	"kind": 31000, // Nostr event kind for tasks
	"content": {
		"title": "string",
		"description": "string",
		"budget": {
			"amount": "number",
			"currency": "BTC",
			"type": BudgetTypeEnum,
            "estiamtedHours"? : number
		},
		"status": TaskStatusEnum,
		"taskType": TaskTypeEnum,
		"pickupLocation": Location,
		"dropOffLocation": Location,
		"skills": ["string"],
		"category": "string",
		"deadlineDate": "ISO string",
		"dateRange": {
			"start": "ISO string",
			"end": "ISO string"
		}
	},
	"tags": [
		["d", "task-{uniqueTaskId}"], // Task identifier always starts with 'task-'
		["c", "category1", "category2"], // Categories list - Max 3 for each task
		["s", "skill1", "skill2"], // Skills tags
		["l", "location"], // Pickup Location tag - Could be set to 'remote' 
		["b", "budget"] // Task budget {amount+currency}
        ["dateRange", "start", "end"] // Task date range start and end - will be undefined if deadline is set
        ["deadline", "deadline"] // Task deadline - will be undefined if dateRange is set
	]
}
```

### 2. Task Retrieval Implementation

#### Basic Task Fetching

```typescript
// Subscribe to task events
const taskSubscription = pool.sub([
	{
		kinds: [31000],
		'#d': ['task']
	}
]);

// Process incoming tasks
taskSubscription.on('event', (event) => {
	// Parse and validate task data
	const task = parseTaskEvent(event);
	// Update UI with new task
	updateTaskList(task);
});
```

### 3. Infinite Scroll Pagination

- Implement using Nostr's timestamp-based pagination
- Store `until` timestamp for next page fetch
- Batch size: 20 tasks per load

```typescript
const BATCH_SIZE = 20;

async function loadMoreTasks(until: number) {
	const events = await pool.list([
		{
			kinds: [31000],
			'#d': ['task'],
			until,
			limit: BATCH_SIZE
		}
	]);

	return events.map(parseTaskEvent);
}
```

### 4. Search and Filtering System

#### Filter Implementation

```typescript
interface TaskFilter {
	searchTerm?: string;
	taskType?: TaskTypeEnum;
	status?: string;
	budgetRange?: {
		min: number;
		max: number;
	};
	location?: {
        displayName: string;
		latitude: number;
		longitude: number;
		radius: number; // in km
	};
	categories?: string[];
	skills?: string[];
	sortBy?: 'date' | 'budget';
	sortOrder?: 'asc' | 'desc';
}

// Filter chain implementation
const filterChain = [
	searchTermFilter,
	taskTypeFilter,
	statusFilter,
	budgetRangeFilter,
	locationFilter,
	categoryFilter,
	skillsFilter
];
```

#### Location-Based Search

- Implement geohashing for efficient location search
- Use NIP-64 for location data
- Store location data in task tags

```typescript
function calculateTaskDistance(taskLocation, userLocation) {
	return haversineDistance(
		taskLocation.latitude,
		taskLocation.longitude,
		userLocation.latitude,
		userLocation.longitude
	);
}
```

### 5. Recommendation System

#### Implementation Strategy

1. Local scoring system based on:
   - User's skill matches
   - Location proximity
   - Previous interactions
   - Task freshness

```typescript
interface RecommendationScore {
	taskId: string;
	score: number;
	factors: {
		skillMatch: number;
		locationScore: number;
		interactionScore: number;
		freshness: number;
	};
}

function calculateRecommendationScore(task, userProfile): RecommendationScore {
	// Implementation details
}
```

### 6. Saved Searches

#### Data Structure

```json
{
	"kind": 31000,
	"content": {
		"type": "saved_search",
		"name": "string",
		"filters": {
			// Filter parameters
		}
	},
	"tags": [
		["d", "saved_search"],
		["u", "user_pubkey"]
	]
}
```

## Migration Strategy

### Phase 1: Infrastructure Setup

1. Set up Nostr client integration
2. Implement basic task event handling
3. Create data transformation layer

### Phase 2: Core Features

1. Basic task listing
2. Implement filtering system
3. Set up infinite scroll

### Phase 3: Advanced Features

1. Location-based search
2. Recommendation system
3. Saved searches
4. Advanced filtering

### Phase 4: Testing & Optimization

1. Performance testing
2. Edge case handling
3. Error recovery
4. UI optimization

## Technical Considerations

### Performance Optimization

#### 1. Local Caching Strategy

##### Recently Viewed Tasks
- Implement a Least Recently Used (LRU) cache with a maximum of 100 tasks
- Cache structure will include:
  - Task event data
  - Parsed content
  - Timestamp of last view
- Cache invalidation triggers:
  - Task updates (detected via Nostr event replacements)
  - Cache size limit reached
  - Task status changes
- Use IndexedDB for persistent storage with a TTL of 24 hours

##### Filter Results
- Implement a two-layer caching system:
  - Memory cache (short-term):
    - Store last 5 filter combinations
    - Include result sets and total counts
    - Invalidate after 5 minutes
  - IndexedDB cache (long-term):
    - Store frequently used filter combinations
    - Keep track of filter usage frequency
    - Maintain filter results for up to 1 hour
- Cache key generation:
  - Hash filter parameters for consistent cache keys
  - Include timestamp ranges in cache key
  - Consider user location for location-based filters

##### User Preferences
- Store in IndexedDB with real-time sync
- Cache structure:
  - Default filters
  - Saved searches
  - Recent locations
  - Preferred categories
  - Skill preferences
- Implement periodic sync with Nostr for preference updates
- Use optimistic updates for immediate UI feedback

#### 2. WebSocket Connection Pooling

##### Connection Management
- Maintain a pool of 3-5 concurrent WebSocket connections
- Implementation details:
  - Connection health monitoring
  - Load balancing across relays
  - Automatic connection rotation
  - Backup relay selection

##### Connection Strategy
- Primary connection: Main task feed and filters
- Secondary connection: Real-time updates and notifications
- Tertiary connection: Location-based searches
- Additional connections for high-load operations

##### Relay Selection
- Implement relay scoring based on:
  - Response time
  - Success rate
  - Geographic proximity
  - Available bandwidth
- Automatic relay fallback system
- Regular relay performance assessment

#### 3. Lazy Loading Implementation

##### Content Loading Strategy
- Initial load: Essential task data only
  - Title
  - Budget
  - Location
  - Basic metadata
- On-demand loading:
  - Full description
  - Detailed location data
  - Skills and categories
  - User profile information

##### Image and Media Handling
- Implement progressive image loading
- Defer non-critical media content
- Use placeholder content during loading
- Implement media caching strategy

##### Performance Metrics
- Track and optimize:
  - Time to first meaningful paint
  - Task list rendering time
  - Filter application speed
  - Cache hit rates

#### 4. Search Optimization

- Utilize NIP-50 for efficient server-side search
- Implement client-side filtering for quick refinements
- Use NIP-45 for accurate result counts

#### 5. Real-time Updates

- Subscribe to task events
- Update cache on new events
- Maintain consistency with server state

### Error Handling

#### 1. Network Disconnection Recovery

##### Detection Mechanism
- Implement heartbeat system
- Monitor WebSocket connection state
- Track failed event publications
- Measure relay response times

##### Recovery Protocol
- Automatic reconnection strategy:
  1. Immediate retry (0s delay)
  2. Short delay retry (2s delay)
  3. Medium delay retry (5s delay)
  4. Long delay retry (15s delay)
  5. Exponential backoff after 4 attempts

##### State Management During Disconnection
- Maintain local operation queue
- Cache pending changes
- Implement offline mode capabilities
- Sync strategy upon reconnection

#### 2. Invalid Event Handling

##### Validation Layers
- Event structure validation
- Content schema validation
- Tag format verification
- Relationship verification

##### Error Categories and Responses
1. Structural Errors:
   - Missing required fields
   - Invalid data types
   - Malformed content
2. Business Logic Errors:
   - Invalid state transitions
   - Unauthorized modifications
   - Conflicting data
3. Temporal Errors:
   - Expired events
   - Future-dated content
   - Order sequence violations

##### Recovery Actions
- Automatic correction where possible
- User notification for critical errors
- Logging and monitoring
- Error aggregation and reporting

#### 3. Rate Limiting Consideration

##### Implementation Strategy
- Client-side rate limiting:
  - Event publication limits
  - Subscription request throttling
  - Filter application frequency
  - Search query limits

##### Throttling Mechanisms
- Token bucket algorithm implementation
- Request queuing system
- Priority-based processing
- Adaptive rate limiting

##### User Experience During Rate Limiting
- Clear feedback mechanisms
- Graceful degradation of functionality
- Alternative action suggestions
- Progress indicators

#### 4. Fallback Strategies

##### Relay Fallback System
- Primary relay failure handling
- Automatic relay switching
- Load balancing across available relays
- Geographic relay distribution

##### Content Delivery Fallback
1. Primary Strategy:
   - Direct Nostr event retrieval
   - Real-time updates
   - Full feature set
2. Secondary Strategy:
   - Cached content delivery
   - Limited real-time features
   - Essential functionality only
3. Minimal Strategy:
   - Static content only
   - No real-time updates
   - Basic search and filter

##### Data Consistency
- Version conflict resolution
- Event ordering management
- State reconciliation
- Data integrity verification

### Security Considerations

1. Event verification
2. User authentication
3. Content validation
4. Rate limiting

## UI/UX Improvements

### Loading States

1. Skeleton loading for tasks
2. Progressive loading indicators
3. Optimistic updates

### Filter UI

1. Dynamic filter updates
2. Location autocomplete
3. Skills suggestion system
4. Price range slider

## Testing Strategy

### Unit Tests

1. Event parsing
2. Filter logic
3. Score calculation
4. Data transformation

### Integration Tests

1. Nostr connection
2. Event handling
3. Filter chain
4. Pagination

### E2E Tests

1. Task discovery flow
2. Search functionality
3. Filter application
4. Saved searches

## Monitoring and Analytics

### Metrics to Track

1. Task discovery time
2. Filter usage patterns
3. Search effectiveness
4. Recommendation accuracy

### Performance Monitoring

1. Event processing time
2. Filter application time
3. UI render performance
4. Network latency

## Future Considerations

### Scalability

1. Event caching strategies
2. Filter optimization
3. Location index improvements

### Feature Expansion

1. Advanced search operators
2. Custom filter combinations
3. Collaborative filtering
4. Machine learning recommendations

## Dependencies

- NostrTools
- Geohashing library
- Date-fns
- Local storage wrapper

## Migration Rollback Plan

1. Maintain GraphQL endpoints
2. Implement feature flags
3. Data consistency checks
4. Rollback triggers
