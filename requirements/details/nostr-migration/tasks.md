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
      kind: 31000, // TASK_UPDATE
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

## Recurring Tasks Implementation

### Overview
Recurring tasks in Nostr can be implemented using a hybrid approach that combines Nostr events for task templates and a backend service for scheduling. Here's how it works:

1. **Task Template Storage (Nostr)**
   - Store recurring task templates as Nostr events (kind: 31006)
   - Include all task details and recurrence pattern in the event
   - Use tags to mark frequency and interval
   - Allow template updates through event references

2. **Instance Generation (Backend)**
   - Backend service monitors recurring task templates
   - Generates task instances based on schedule
   - Creates new Nostr events (kind: 31007) for each instance
   - Links instances to template using event references
   - Handles timezone considerations and schedule adjustments

3. **Schedule Management**
   ```typescript
   interface RecurringTaskSchedule {
     frequency: 'daily' | 'weekly' | 'monthly';
     interval: number;
     daysOfWeek?: number[];    // For weekly recurrence
     dayOfMonth?: number;      // For monthly recurrence
     endDate?: string;         // Optional end date
     maxOccurrences?: number;  // Optional max instances
     timezone: string;         // User's timezone
   }
   ```

4. **Backend Service Responsibilities**
   - Maintain a queue of upcoming task instances
   - Handle schedule modifications
   - Process timezone-aware scheduling
   - Manage instance creation and publication
   - Track instance history and completion status
   - Handle schedule interruptions and resumptions

5. **Advantages of Hybrid Approach**
   - Templates stored immutably on Nostr
   - Reliable scheduling through backend service
   - Timezone-aware scheduling
   - Scalable instance generation
   - Maintains decentralized task data
   - Allows template modifications

6. **Implementation Details**
   ```typescript
   // Backend scheduler service
   class RecurringTaskScheduler {
     async scheduleNextInstance(templateId: string): Promise<void> {
       const template = await this.getTemplate(templateId);
       const nextDate = this.calculateNextOccurrence(template.schedule);
       
       if (this.shouldCreateInstance(template, nextDate)) {
         await this.createTaskInstance(template, nextDate);
       }
     }

     private calculateNextOccurrence(schedule: RecurringTaskSchedule): Date {
       // Calculate next occurrence based on frequency and interval
       // Handle timezone conversions
       // Consider schedule constraints
     }

     private async createTaskInstance(template: NostrEvent, date: Date): Promise<void> {
       const instanceData = this.prepareInstanceData(template, date);
       await createTask(instanceData); // Creates Nostr event
     }
   }
   ```

7. **Synchronization Strategy**
   - Backend maintains index of recurring templates
   - Periodically syncs with Nostr network
   - Handles template updates and deletions
   - Manages instance generation queue
   - Provides API for template management

8. **Error Handling and Recovery**
   - Handle missed schedules due to downtime
   - Recover from scheduling failures
   - Manage conflicting template updates
   - Handle timezone changes
   - Process schedule modifications

9. **Monitoring and Maintenance**
   - Track instance generation status
   - Monitor schedule adherence
   - Handle schedule conflicts
   - Manage resource utilization
   - Provide status and health metrics

### Conclusion
This hybrid approach provides the best of both worlds:
- Decentralized storage of task templates through Nostr
- Reliable scheduling through backend service
- Scalable instance generation
- Flexible schedule management
- Robust error handling and recovery

The backend service acts as a facilitator for the recurring task system while keeping the core task data decentralized through Nostr. This approach ensures reliable scheduling while maintaining the benefits of decentralized task management.

## Recurring Tasks Implementation Challenge & Solutions

### The Fundamental Challenge

After researching current Nostr implementations and protocols, it's clear that implementing truly automated recurring tasks in Nostr faces a **fundamental architectural constraint**: **every Nostr event must be cryptographically signed by the user's private key**. This means that unlike traditional systems where a server can create tasks on behalf of users, Nostr requires explicit user authorization for each event.

### Why Traditional Automation Doesn't Work in Nostr

1. **Cryptographic Integrity**: Nostr's security model depends on events being signed by the actual key holder
2. **Decentralized Trust**: There's no central authority that can create events on behalf of users
3. **Private Key Security**: Private keys should never be exposed to automation systems
4. **Event Authenticity**: The signature proves the event came from the actual user, not an automated system

### Current Solutions and Approaches

Based on my research, there are several approaches the Nostr community has explored for handling automation and delegation:

#### 1. NIP-26 (Delegated Event Signing) - **Deprecated/Unrecommended**

- **Status**: Marked as "unrecommended" in the official NIPs
- **Purpose**: Allowed creating delegation tokens for other keys to sign on behalf of a master key
- **Problems**: 
  - Added unnecessary complexity to the protocol
  - Made key management more difficult
  - Required significant changes to client implementations
  - Potentially broke Nostr's core simplicity principles

#### 2. NIP-46 (Nostr Remote Signing) - **Current Best Practice**

This is the most promising approach for solving the automation challenge:

- **How it works**: A remote signer (bunker) holds the private keys and signs events upon request
- **User Control**: Users can grant specific permissions to applications/automation systems
- **Security**: Private keys remain secure in the bunker, not exposed to client applications
- **Flexibility**: Supports granular permissions and time-limited access

**For Recurring Tasks**, this could work as follows:
1. User sets up nsecBunker with their private key
2. User creates a recurring task template and grants permission to an automation service
3. The automation service sends signing requests to the bunker for each task instance
4. User can revoke permissions at any time

#### 3. Hybrid Approach (Template + Manual Approval)

Several implementations suggest a middle-ground approach:

1. **Template Storage**: Store recurring task templates as Nostr events
2. **Notification System**: Send push notifications to users when tasks are due
3. **One-Click Approval**: Users can approve task instances with minimal friction
4. **Batch Operations**: Allow users to pre-approve multiple instances

### Recommended Implementation Strategy

Based on the research and Nostr's design principles, here's the recommended approach for recurring tasks:

#### Phase 1: Template-Based System with Notifications
```typescript
// 1. User creates a recurring task template
const recurringTemplate = {
  kind: 31006, // RECURRING_TASK
  content: JSON.stringify({
    taskTemplate: { /* task details */ },
    schedule: { frequency: 'weekly', dayOfWeek: 1 },
    autoApprove: false // User must approve each instance
  }),
  tags: [
    ['d', templateId], // Unique identifier
    ['frequency', 'weekly'],
    ['auto-approve', 'false']
  ]
}

// 2. Backend monitors templates and sends notifications
// 3. User receives notification and creates actual task with one click
```

#### Phase 2: NIP-46 Integration for Semi-Automation
```typescript
// 1. User grants limited permissions to automation service via NIP-46
const permissions = [
  'sign_event:31000', // Can create tasks
  'nip44_encrypt',    // Can encrypt content
  // Time-limited: expires after 30 days
]

// 2. Automation service requests signatures for scheduled tasks
// 3. User can batch-approve or set auto-approval for specific patterns
```

#### Phase 3: Advanced Delegation (Future)
- Implement time-limited, scope-restricted delegation
- Allow users to set "business rules" for auto-approval
- Support for team/organizational task management

### Technical Implementation

#### Backend Service Requirements
```typescript
class RecurringTaskService {
  // Monitor recurring task templates
  async monitorTemplates() {
    // Check for due tasks
    // Send notifications to users
    // Handle user responses
  }

  // NIP-46 integration
  async requestTaskCreation(template: RecurringTemplate, bunkerUrl: string) {
    // Send signing request to user's bunker
    // Handle approval/rejection
    // Create task instance
  }

  // Notification system
  async sendTaskNotification(userId: string, template: RecurringTemplate) {
    // Push notification
    // In-app notification
    // Email reminder (optional)
  }
}
```

#### User Experience Flow
1. **Setup**: User creates recurring task template with preferred approval method
2. **Scheduling**: Backend tracks schedule and determines when tasks are due
3. **Notification**: User receives notification about due task
4. **Approval**: User approves task creation (one-click if using NIP-46)
5. **Execution**: Actual task event is created and published to Nostr

### Conclusion

**True automation is impossible in Nostr by design**, and this is actually a feature, not a bug. It ensures user sovereignty and prevents unauthorized events. The solution is to embrace this constraint and create user-friendly approval mechanisms:

1. **Use NIP-46 for streamlined signing** - reduces friction while maintaining security
2. **Implement smart notifications** - ensure users never miss important recurring tasks
3. **Provide one-click approval** - minimize the effort required from users
4. **Support batch operations** - allow users to approve multiple instances at once
5. **Enable time-limited permissions** - balance automation with security

This approach maintains Nostr's core principles while providing a practical solution for recurring tasks that's both secure and user-friendly.

### Key Resources

- **NIP-46 Specification**: https://nips.nostr.com/46
- **nsecBunker**: Remote signing service that implements NIP-46
- **Remote Signers List**: Multiple implementations of NIP-46 available
- **Client Support**: Growing list of Nostr clients supporting remote signing

The future of recurring tasks in Nostr lies not in full automation, but in intelligent user assistance that respects the protocol's security model while minimizing user friction.
