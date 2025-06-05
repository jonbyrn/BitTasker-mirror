# Task System Migration to Nostr

## Overview
This document outlines the migration plan for moving our task management system from GraphQL/Houdini to Nostr, with a focus on security, privacy, and performance. We'll leverage existing code structures while adapting them to Nostr's event-based system.

## NIPs and Task Management
As of now, there is no official NIP (Nostr Implementation Possibility) specifically dedicated to task management in the core Nostr protocol specifications. While there are NIPs for various functionalities like basic event kinds (NIP-01), metadata (NIP-01), and even game-related events (NIP-133 Gamestr), task management remains an application-specific implementation.

Our implementation uses custom event kinds in the 31000 range, which is reserved for application-specific events as per NIP-01. This approach allows us to maintain compatibility with the Nostr protocol while implementing task-specific functionality. The event kinds and structures defined below represent our application's custom implementation rather than a standardized NIP.

## Event Types and Kinds

### Core Task Events
```typescript
// Task-related event kinds
const TASK_KINDS = {
  TASK_CREATION: 31000,      // New task creation
  TASK_BID: 31001,          // Bid on a task
  TASK_CONTRACT: 31002,     // Task contract formation
  TASK_COMPLETION: 31003,   // Task completion confirmation
  TASK_REVIEW: 31004,       // Task review
  TASK_UPDATE: 31005,       // Task updates/edits
  RECURRING_TASK: 31006,    // Recurring task template
  TASK_INSTANCE: 31007,     // Instance of recurring task
  SAVED_SEARCH: 31008,      // Saved task search criteria
  TASK_RECOMMENDATION: 31009 // Task recommendations
}
```

## Data Structures

### Task Creation Event
```typescript
interface TaskCreationEvent {
  kind: 31000;
  content: {
    title: string;
    description: string;
    budget: {
      amount: number;
      currency: string;
    };
    deadline: string;
    location?: {
      type: 'remote' | 'onsite' | 'hybrid';
      coordinates?: [number, number];
      address?: string;
    };
    skills: string[];
    attachments?: Array<{
      url: string;
      type: string;
      name: string;
    }>;
    category: string;
    subcategory?: string;
  };
  tags: [
    ['c', string],          // Category
    ['s', ...string[]],     // Skills
    ['l', string],          // Location
    ['d', string],          // Deadline
    ['b', string],          // Budget
    ['pow', string, string] // Proof of work hash and nonce
  ];
}
```

### Task Bid Event
```typescript
interface TaskBidEvent {
  kind: 31001;
  content: {
    amount: number;
    currency: string;
    proposal: string;
    timeline: {
      start: string;
      end: string;
    };
    milestones?: Array<{
      description: string;
      deadline: string;
      amount: number;
    }>;
  };
  tags: [
    ['e', string],          // Reference to task event
    ['p', string],          // Task creator's pubkey
    ['pow', string, string] // Proof of work
  ];
}
```

### Recurring Task Event
```typescript
interface RecurringTaskEvent {
  kind: 31006;
  content: {
    template: TaskCreationEvent['content'];
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
      interval: number;
      endDate?: string;
      customPattern?: string;
    };
  };
  tags: [
    ['t', 'recurring'],
    ['f', string],          // Frequency
    ['pow', string, string] // Proof of work
  ];
}
```

## Implementation Plan

### 1. Task Creation Module
```typescript
class TaskCreationService {
  async createTask(taskData: TaskCreationEvent['content']): Promise<string> {
    // Calculate POW based on task value
    const pow = await this.calculatePOW(taskData.budget.amount);
    
    // Create and sign event
    const event = {
      kind: 31000,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify(taskData),
      tags: this.generateTags(taskData, pow)
    };

    const signedEvent = await getSignedEvent(event);
    
    // Publish to relays
    await this.publishToRelays(signedEvent);
    
    return signedEvent.id;
  }

  private generateTags(taskData: TaskCreationEvent['content'], pow: string): string[][] {
    return [
      ['c', taskData.category],
      ['s', ...taskData.skills],
      ['l', taskData.location?.type || 'remote'],
      ['d', taskData.deadline],
      ['b', `${taskData.budget.amount}${taskData.budget.currency}`],
      ['pow', pow]
    ];
  }
}
```

### 2. Task Discovery and Search
```typescript
class TaskDiscoveryService {
  async findTasks(filters: TaskFilters): Promise<NostrEvent[]> {
    const filterSet: Filter[] = [{
      kinds: [31000],
      // Add time range for active tasks
      since: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // Last 30 days
      until: Math.floor(Date.now() / 1000),
      limit: 50
    }];

    // Add tag filters
    if (filters.category) {
      filterSet[0]['#c'] = [filters.category];
    }
    if (filters.skills?.length) {
      filterSet[0]['#s'] = filters.skills;
    }
    // ... other filters

    return await this.queryRelays(filterSet);
  }

  async getTaskRecommendations(userProfile: NostrProfile): Promise<NostrEvent[]> {
    // Match tasks based on user's skills and preferences
    const userSkills = userProfile.skills.map(s => s.name);
    return this.findTasks({
      skills: userSkills,
      // ... other matching criteria
    });
  }
}
```

### 3. Task Subscription System
```typescript
class TaskSubscriptionService {
  private subscriptions = new Map<string, NostrSubscription>();

  async subscribeTasks(filters: TaskFilters, callback: (event: NostrEvent) => void): Promise<() => void> {
    const sub = pool.sub([PUBLIC_NOSTR_RELAY_URL], {
      kinds: [31000, 31001, 31002, 31003],
      // ... apply filters
    });

    sub.on('event', callback);
    
    // Store subscription
    const subId = crypto.randomUUID();
    this.subscriptions.set(subId, sub);

    // Return cleanup function
    return () => {
      sub.unsub();
      this.subscriptions.delete(subId);
    };
  }
}
```

### 4. Saved Searches
```typescript
class SavedSearchService {
  async saveSearch(criteria: TaskFilters): Promise<string> {
    const event = {
      kind: 31008,
      content: JSON.stringify(criteria),
      tags: [
        ['t', 'saved-search'],
        ['name', criteria.name || 'Unnamed Search']
      ]
    };

    const signedEvent = await getSignedEvent(event);
    await this.publishToRelays(signedEvent);
    return signedEvent.id;
  }

  async getSavedSearches(): Promise<SavedSearch[]> {
    const filter: Filter = {
      kinds: [31008],
      authors: [await getNpub()],
      '#t': ['saved-search']
    };

    return await this.queryRelays(filter);
  }
}
```

### 5. Recurring Tasks
```typescript
class RecurringTaskService {
  async createRecurringTask(template: TaskTemplate, schedule: Schedule): Promise<string> {
    const event = {
      kind: 31006,
      content: JSON.stringify({
        template,
        schedule
      }),
      tags: [
        ['t', 'recurring'],
        ['f', schedule.frequency],
        ['i', schedule.interval.toString()]
      ]
    };

    const signedEvent = await getSignedEvent(event);
    await this.publishToRelays(signedEvent);
    return signedEvent.id;
  }

  async generateTaskInstances(recurringTaskId: string): Promise<void> {
    // Create task instances based on schedule
    const template = await this.getRecurringTask(recurringTaskId);
    const instances = this.calculateNextInstances(template);
    
    for (const instance of instances) {
      await this.createTaskInstance(instance, recurringTaskId);
    }
  }
}
```

### 6. Task Bidding System
```typescript
class TaskBiddingService {
  async submitBid(taskId: string, bidData: BidData): Promise<string> {
    // Verify task exists and is open
    const task = await this.getTask(taskId);
    if (!task || !this.isTaskOpen(task)) {
      throw new Error('Task not available for bidding');
    }

    const event = {
      kind: 31001,
      content: JSON.stringify(bidData),
      tags: [
        ['e', taskId],
        ['p', task.pubkey],
        ['pow', await this.calculateBidPOW(task)]
      ]
    };

    const signedEvent = await getSignedEvent(event);
    await this.publishToRelays(signedEvent);
    return signedEvent.id;
  }

  async getBids(taskId: string): Promise<NostrEvent[]> {
    return await this.queryRelays({
      kinds: [31001],
      '#e': [taskId]
    });
  }
}
```

### 6. Task Update System
```typescript
class TaskUpdateService {
  async updateTask(taskId: string, updates: Partial<TaskCreationEvent['content']>): Promise<string> {
    // Get the original task event
    const originalTask = await this.getTask(taskId);
    if (!originalTask) {
      throw new Error('Task not found');
    }

    // Create update event that references the original task
    const event = {
      kind: 31005, // TASK_UPDATE
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify(updates),
      tags: [
        ['e', taskId], // Reference to original task
        ['p', originalTask.pubkey], // Original task creator
        ['status', 'update'],
        ...this.generateUpdateTags(updates)
      ]
    };

    const signedEvent = await getSignedEvent(event);
    await this.publishToRelays(signedEvent);
    return signedEvent.id;
  }

  private generateUpdateTags(updates: Partial<TaskCreationEvent['content']>): string[][] {
    const tags: string[][] = [];
    
    // Add relevant tags based on what was updated
    if (updates.category) tags.push(['c', updates.category]);
    if (updates.skills) tags.push(['s', ...updates.skills]);
    if (updates.deadline) tags.push(['d', updates.deadline]);
    if (updates.budget) {
      tags.push(['b', `${updates.budget.amount}${updates.budget.currency}`]);
    }

    return tags;
  }

  async getTaskWithUpdates(taskId: string): Promise<TaskWithUpdates> {
    // Fetch original task and all its updates
    const events = await this.queryRelays({
      kinds: [31000, 31005], // Task creation and updates
      '#e': [taskId],
      limit: 50
    });

    // Sort by timestamp to get latest state
    events.sort((a, b) => a.created_at - b.created_at);

    // Merge updates into original task
    return this.mergeTaskUpdates(events);
  }
}
```

### 7. Pagination System
```typescript
class TaskPaginationService {
  async getTaskPage(options: {
    limit?: number;
    since?: number;
    until?: number;
    filters?: TaskFilters;
  }): Promise<{
    tasks: NostrEvent[];
    hasMore: boolean;
    nextTimestamp?: number;
  }> {
    const {
      limit = 20,
      until = Math.floor(Date.now() / 1000),
      since,
      filters
    } = options;

    // Create filter set with pagination parameters
    const filterSet: Filter[] = [{
      kinds: [31000],
      until,
      limit: limit + 1, // Request one extra to check if there are more
      ...this.buildFilterTags(filters)
    }];

    if (since) {
      filterSet[0].since = since;
    }

    // Query relays
    const events = await this.queryRelays(filterSet);

    // Sort by timestamp descending
    events.sort((a, b) => b.created_at - a.created_at);

    // Check if we have more results
    const hasMore = events.length > limit;
    if (hasMore) {
      events.pop(); // Remove the extra event
    }

    // Get the timestamp for the next page
    const nextTimestamp = hasMore ? events[events.length - 1].created_at - 1 : undefined;

    return {
      tasks: events,
      hasMore,
      nextTimestamp
    };
  }

  private buildFilterTags(filters?: TaskFilters): Record<string, string[]> {
    const tags: Record<string, string[]> = {};
    
    if (!filters) return tags;

    if (filters.category) tags['#c'] = [filters.category];
    if (filters.skills?.length) tags['#s'] = filters.skills;
    if (filters.location) tags['#l'] = [filters.location];
    
    return tags;
  }
}

// Example usage:
```typescript
// Initial page load
const page1 = await taskPagination.getTaskPage({
  limit: 20,
  filters: { category: 'development' }
});

// Load next page using the nextTimestamp
if (page1.hasMore) {
  const page2 = await taskPagination.getTaskPage({
    limit: 20,
    until: page1.nextTimestamp,
    filters: { category: 'development' }
  });
}
```

## Migration Steps

1. **Phase 1: Basic Task Creation and Listing**
   - Implement TaskCreationService
   - Create basic task listing UI
   - Test POW implementation
   - Verify event chain integrity

2. **Phase 2: Search and Discovery**
   - Implement TaskDiscoveryService
   - Add filter functionality
   - Create search UI
   - Test relay query performance

3. **Phase 3: Bidding System**
   - Implement TaskBiddingService
   - Create bid submission UI
   - Add bid listing and management
   - Test bid verification chain

4. **Phase 4: Recurring Tasks**
   - Implement RecurringTaskService
   - Create recurring task UI
   - Test schedule generation
   - Verify instance creation

5. **Phase 5: Advanced Features**
   - Implement saved searches
   - Add task recommendations
   - Create notification system
   - Test full system integration

## Security Considerations

1. **Event Chain Verification**
   - Implement strict verification of event references
   - Validate all signatures in the chain
   - Check POW requirements
   - Verify task creator authorization

2. **Proof of Work**
   - Scale POW difficulty with task value
   - Implement client-side POW calculation
   - Add POW verification for all task-related events
   - Monitor relay performance impact

3. **Data Integrity**
   - Validate all event data formats
   - Implement proper error handling
   - Add data consistency checks
   - Monitor relay synchronization

## UI Components Required

1. **Task Creation**
   - TaskCreationForm
   - POWProgressIndicator
   - AttachmentUploader
   - LocationSelector

2. **Task Discovery**
   - TaskSearchFilters
   - TaskList
   - TaskCard
   - SavedSearchManager

3. **Bidding**
   - BidSubmissionForm
   - BidList
   - BidDetailsView
   - ContractFormation

4. **Recurring Tasks**
   - RecurringTaskForm
   - ScheduleSelector
   - InstanceManager
   - RecurrencePreview

## Testing Strategy

1. **Unit Tests**
   - Event creation and validation
   - POW calculation
   - Data structure integrity
   - Filter logic

2. **Integration Tests**
   - Relay communication
   - Event chain verification
   - Subscription handling
   - Data persistence

3. **End-to-End Tests**
   - Complete task lifecycle
   - Bidding process
   - Recurring task generation
   - Search and filter functionality

## Performance Optimization

1. **Client-Side**
   - Implement efficient POW calculation
   - Optimize event processing
   - Cache frequently accessed data
   - Minimize relay queries

2. **Relay Strategy**
   - Use multiple relays for redundancy
   - Implement smart relay selection
   - Monitor relay performance
   - Handle relay failures gracefully

## Future Enhancements

1. **Advanced Features**
   - Task delegation system
   - Reputation-based task matching
   - Advanced scheduling options
   - Task template system

2. **Security Improvements**
   - Zero-knowledge proofs for private tasks
   - Enhanced POW algorithms
   - Advanced verification methods
   - Improved spam prevention

3. **User Experience**
   - Real-time notifications
   - Advanced search capabilities
   - Task analytics
   - Mobile optimization

## Implementation Notes

### Task Updates
- Updates in Nostr are handled by creating new events that reference the original event
- Each update event contains only the changed fields, not the entire task state
- To get the current state of a task, we need to:
  1. Fetch the original task event
  2. Fetch all update events referencing the original task
  3. Apply updates in chronological order
- Update events use tags to maintain referential integrity and enable efficient filtering
- The system maintains an audit trail of all changes through the chain of events

### Pagination Strategy
- Nostr's event-based system is best suited for time-based pagination
- We use the `since` and `until` parameters along with `limit` to implement pagination
- The strategy involves:
  1. Setting an initial `until` timestamp (usually current time)
  2. Fetching `limit + 1` events to determine if more pages exist
  3. Using the oldest event's timestamp - 1 as the `until` parameter for the next page
- Benefits of this approach:
  - Works well with Nostr's event-based nature
  - Handles real-time updates naturally
  - Efficient for relay queries
  - Prevents duplicate events across pages
- Considerations:
  - Events with the same timestamp require special handling
  - Real-time updates may affect page boundaries
  - Some relays may return events in different orders
