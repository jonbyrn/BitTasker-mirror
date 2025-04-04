# BitTasker Bidding System Implementation Plan

## 1. Overview

This document outlines the comprehensive implementation plan for BitTasker's bidding system, following all BitTasker technical specifications and development rules. The bidding system will enable task doers to create custom pricing proposals for tasks, while providing task hirers with powerful bid comparison tools and negotiation capabilities.

## 2. Core Requirements

### 2.1 Functional Requirements

- **Bid Creation**: Task doers can submit detailed bids with custom pricing
- **Negotiation System**: Support for counter-offers between task hirers and doers
- **Bid Comparison**: Tools for task hirers to compare different bids
- **Provider Showcase**: Highlighting provider credentials and previous work
- **Market-Based Suggestions**: Automated bid suggestions based on market rates
- **Withdrawal Mechanism**: Allow providers to withdraw bids before acceptance
- **Counter-Offer System**: Enable negotiation between parties
- **Status Tracking**: Monitor bid status throughout the bidding lifecycle

### 2.2 Technical Requirements

- **Client-Side Implementation**: All functionality implemented client-side (static adapter)
- **Responsive Design**: Mobile-first UI compatible with multiple platforms
- **E2EE Security**: End-to-end encryption for sensitive bid information
- **Bitcoin Integration**: Support for Bitcoin pricing and payment mechanisms
- **Performance Optimization**: Efficient bid loading and comparison
- **Offline Capabilities**: Basic functionality without constant internet connection

## 3. Data Model

### 3.1 Bid Schema

```typescript
export interface Bid {
  // Basic Information
  id: string;                  // Unique identifier for the bid
  taskId: string;              // Associated task ID
  bidderId: string;            // Nostr public key of bidder
  
  // Pricing Details
  price: {
    amount: number;            // Bid amount
    currency: string;          // Currency code (BTC, L-BTC, USDt, LN)
    type: 'fixed' | 'hourly';  // Fixed price or hourly rate
    estimatedHours?: number;   // Required for hourly bids
  };
  
  // Bid Details
  proposal: string;            // Detailed approach and proposal
  timeFrame: {
    estimatedCompletion: string;  // ISO 8601 date format
    availableStartDate: string;   // ISO 8601 date format
  };
  
  // Provider Information
  providerHighlights: {
    skills: string[];          // Key skills relevant to this task
    certifications: string[];  // Relevant certifications
    portfolioItems: string[];  // IDs of portfolio items to showcase
  };
  
  // Negotiation Tracking
  counterOffers: CounterOffer[];  // History of counter-offers
  
  // Status Information
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'countered';
  createdAt: string;           // ISO 8601 timestamp
  updatedAt: string;           // ISO 8601 timestamp
}

export interface CounterOffer {
  id: string;                  // Unique identifier
  price: {
    amount: number;
    currency: string;
  };
  timeFrame?: {               // Optional updated timeframe
    estimatedCompletion: string;
  };
  message: string;            // Explanation for counter-offer
  proposedBy: string;         // Nostr public key of proposer
  createdAt: string;          // ISO 8601 timestamp
  status: 'pending' | 'accepted' | 'rejected';
}
```

## 4. Implementation Steps

### 4.1 Directory Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── bidding/
│   │   │   ├── BidCard.svelte             # Bid display component
│   │   │   ├── BidComparisonTable.svelte  # Comparison tool
│   │   │   ├── BidCreationForm.svelte     # Bid creation form
│   │   │   ├── BidDetailsView.svelte      # Detailed bid view
│   │   │   ├── CounterOfferForm.svelte    # Counter-offer form
│   │   │   ├── ProviderShowcase.svelte    # Provider credentials display
│   │   │   └── BidSuggestion.svelte       # Market-based suggestion component
│   ├── api/
│   │   ├── services/
│   │   │   ├── bid.service.ts             # Bid API service
│   │   │   └── bidSuggestion.service.ts  # Market rate calculation service
│   ├── services/
│   │   └── bidSecurity.service.ts        # Encryption for sensitive bid data
│   ├── stores/
│   │   ├── bid.store.ts                   # Bid state management
│   │   └── counterOffer.store.ts         # Counter-offer state management
│   ├── types/
│   │   └── bid.ts                         # Bid and related type definitions
│   └── utils/
│       ├── helpers/
│       │   └── bidFormatter.ts           # Formatting helpers for bids
│       ├── constants/
│       │   └── bidStatus.ts              # Status constants and metadata
│       └── enums/
│           └── bidEnums.ts               # Enumerations for bid properties
├── routes/
│   ├── (protected)/
│   │   ├── tasks/
│   │   │   ├── [id]/
│   │   │   │   ├── bids/
│   │   │   │   │   ├── +page.svelte       # Bid listing page
│   │   │   │   │   ├── create/
│   │   │   │   │   │   └── +page.svelte   # Bid creation page
│   │   │   │   │   └── [bidId]/
│   │   │   │   │       ├── +page.svelte   # Bid details page
│   │   │   │   │       └── counter/
│   │   │   │   │           └── +page.svelte # Counter-offer creation
```

### 4.2 Implementation Sequence

#### Phase 1: Core Components and Services

1. **Create Type Definitions**
   - Define `Bid` and `CounterOffer` interfaces
   - Create enum types for bid status and related properties

2. **Implement API Services**
   - Develop `bid.service.ts` for CRUD operations
   - Create `bidSuggestion.service.ts` for market rate calculations
   - Implement `bidSecurity.service.ts` for E2E encryption

3. **Build State Management**
   - Create bid and counter-offer stores using Svelte 5 runes
   - Implement reactive derived states for filtered and sorted bids

#### Phase 2: UI Components

4. **Develop Basic UI Components**
   - Create `BidCard.svelte` for bid summary display
   - Implement `BidCreationForm.svelte` for submitting bids
   - Build `BidDetailsView.svelte` for expanded bid information

5. **Implement Advanced Features**
   - Develop `BidComparisonTable.svelte` for side-by-side comparison
   - Create `CounterOfferForm.svelte` for negotiation
   - Build `ProviderShowcase.svelte` for credential highlights
   - Implement `BidSuggestion.svelte` for market-based recommendations

#### Phase 3: Pages and Routes

6. **Create Bid Pages**
   - Implement bid listing page for task hirers
   - Create bid creation page for task doers
   - Develop bid details and negotiation pages

7. **Add Search and Filters**
   - Implement filter and sort mechanisms for bids
   - Add search functionality for finding specific bids

#### Phase 4: Integration and Enhancement

8. **Bitcoin Integration**
   - Add support for multiple currency options
   - Implement conversion utilities for bid price display

9. **Mobile Optimization**
   - Ensure responsive design for all bid components
   - Optimize interactions for touch interfaces

10. **Security Implementation**
    - Apply E2E encryption for sensitive bid data
    - Implement secure storage for bid drafts

## 5. Component Specifications

### 5.1 Bid Creation Form

The bid creation form will allow providers to submit detailed bids with the following features:

- **Price Input**: Support for Bitcoin and other supported currencies
- **Time Frame Selection**: Estimated completion and availability dates
- **Proposal Editor**: Rich text editor for detailed approach description
- **Credential Selection**: Choose relevant skills and certifications to highlight
- **Portfolio Showcase**: Select previous work examples to include

**Implementation Notes:**
- Use Tailwind CSS and Daisy UI for responsive design
- Implement client-side validation with clear error messages
- Include autosave functionality for bid drafts
- Add real-time market rate suggestion based on task category

### 5.2 Bid Comparison Tool

Task hirers need an effective way to compare multiple bids:

- **Side-by-Side Comparison**: View multiple bids in a comparison table
- **Highlight Differences**: Visually highlight key differences
- **Provider Verification**: Show verification status and ratings
- **Sort and Filter**: Arrange by price, completion time, provider rating
- **Quick Actions**: Accept, reject, or counter-offer directly from comparison view

**Implementation Notes:**
- Implement responsive table design that works on mobile
- Create collapsible sections for detailed information
- Use color coding and visual indicators for key metrics
- Implement keyboard navigation for accessibility

### 5.3 Counter-Offer System

The negotiation system allows both parties to propose adjusted terms:

- **Price Adjustment**: Modify bid amount
- **Timeframe Adjustment**: Suggest alternative completion dates
- **Message Exchange**: Include explanations for counter-offers
- **Status Tracking**: Monitor negotiation progress
- **History View**: See full negotiation history

**Implementation Notes:**
- Implement real-time updates when possible
- Create clear visual indicators of counter-offer status
- Use intuitive UI for price and date adjustments
- Maintain complete audit trail of all negotiations

## 6. Security Considerations

### 6.1 Data Protection

- Encrypt sensitive bid details using Web Crypto API
- Implement proper key derivation from user credentials
- Store encrypted bid data using secure storage mechanisms
- Apply proper sanitization for all user inputs

### 6.2 Privacy Features

- Allow anonymous bidding option with revealed identity only upon acceptance
- Implement selective information disclosure
- Control visibility of provider details based on user preferences
- Secure messaging for bid clarifications

### 6.3 Anti-Fraud Measures

- Implement bid verification mechanisms
- Create detection systems for unrealistic bids
- Add reporting tools for suspicious activity
- Develop protection against shill bidding

## 7. Testing Strategy

### 7.1 Unit Testing

- Test all bid calculation functions
- Verify bid validation logic
- Test counter-offer state transitions
- Validate encryption/decryption processes

### 7.2 Component Testing

- Test all form submissions and validations
- Verify responsive behavior of bid components
- Test accessibility features of all components
- Validate proper state management

### 7.3 Integration Testing

- Test full bid lifecycle from creation to acceptance
- Verify counter-offer negotiation flow
- Test concurrent bidding scenarios
- Validate proper error handling

## 8. Performance Optimization

- Implement lazy loading for bid details
- Optimize bid comparison for large numbers of bids
- Create efficient filtering and sorting algorithms
- Use virtual scrolling for long bid lists
- Optimize assets and dependencies

## 9. Future Enhancements

- **Automated Bidding**: Allow providers to set up automated bidding rules
- **Bid Templates**: Save and reuse common bid structures
- **AI Recommendations**: Machine learning for optimal bid suggestions
- **Enhanced Analytics**: Detailed statistics on bidding success rates
- **Reputation System**: Enhanced credential verification system

## 10. Implementation Timeline

1. **Week 1**: Data model implementation and service structure
2. **Week 2**: Basic UI components and forms
3. **Week 3**: Advanced features (comparison, negotiation)
4. **Week 4**: Integration, testing, and optimization
5. **Week 5**: Security implementation and final polish

## 11. Bid Service Implementation

### 11.1 API Service

Updating the existing bid service to include all required functionality:

```typescript
import type { Bid, CounterOffer } from '$lib/types/bid';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

/**
 * Bid Service
 * Handles bid creation, updates, and management for tasks
 */
export class BidService extends BaseApiService {
  /**
   * Create a new bid for a task
   * @param bid The bid information to create
   * @returns Promise containing the created bid data
   * @throws Error if bid creation fails
   */
  async createBid(bid: Bid): Promise<Bid> {
    const response = await this.post<Bid>(ENDPOINTS.BIDS.CREATE, bid);
    return response.data;
  }

  /**
   * Update an existing bid
   * @param bid The updated bid information
   * @returns Promise containing the updated bid data
   * @throws Error if bid update fails
   */
  async updateBid(bid: Bid): Promise<Bid> {
    const response = await this.put<Bid>(ENDPOINTS.BIDS.UPDATE, bid);
    return response.data;
  }

  /**
   * Withdraw a bid from a task
   * @param bidId The ID of the bid to withdraw
   * @returns Promise that resolves when withdrawal is successful
   * @throws Error if bid withdrawal fails
   */
  async withdrawBid(bidId: string): Promise<void> {
    const response = await this.post(ENDPOINTS.BIDS.WITHDRAW(bidId));
    if (!response.data) {
      throw new Error('Failed to withdraw bid');
    }
  }

  /**
   * Get all bids for a specific task
   * @param taskId The ID of the task
   * @returns Promise containing array of bids
   */
  async getBidsForTask(taskId: string): Promise<Bid[]> {
    const response = await this.get<Bid[]>(ENDPOINTS.BIDS.GET_BY_TASK(taskId));
    return response.data;
  }

  /**
   * Get bids submitted by a specific user
   * @param userId The Nostr public key of the user
   * @returns Promise containing array of bids
   */
  async getUserBids(userId: string): Promise<Bid[]> {
    const response = await this.get<Bid[]>(ENDPOINTS.BIDS.GET_BY_USER(userId));
    return response.data;
  }
  
  /**
   * Create a counter-offer for a bid
   * @param bidId The ID of the original bid
   * @param counterOffer The counter-offer details
   * @returns Promise containing updated bid with counter-offer
   */
  async createCounterOffer(bidId: string, counterOffer: CounterOffer): Promise<Bid> {
    const response = await this.post<Bid>(
      ENDPOINTS.BIDS.COUNTER_OFFER(bidId),
      counterOffer
    );
    return response.data;
  }
  
  /**
   * Accept a bid for a task
   * @param bidId The ID of the bid to accept
   * @returns Promise containing the accepted bid
   */
  async acceptBid(bidId: string): Promise<Bid> {
    const response = await this.post<Bid>(ENDPOINTS.BIDS.ACCEPT(bidId));
    return response.data;
  }
  
  /**
   * Reject a bid for a task
   * @param bidId The ID of the bid to reject
   * @returns Promise containing the rejected bid
   */
  async rejectBid(bidId: string): Promise<Bid> {
    const response = await this.post<Bid>(ENDPOINTS.BIDS.REJECT(bidId));
    return response.data;
  }
}

// Create singleton instance
const bidService = new BidService();
export default bidService;
```

### 11.2 Store Implementation

```typescript
// src/lib/stores/bid.store.ts
import { $state, $derived } from 'svelte';
import type { Bid } from '$lib/types/bid';
import bidService from '$lib/api/services/bid.service';

export class BidStore {
  bids = $state<Bid[]>([]);
  currentTaskId = $state<string | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);
  
  // Derived states
  pendingBids = $derived(
    this.bids.filter(bid => bid.status === 'pending')
  );
  
  acceptedBids = $derived(
    this.bids.filter(bid => bid.status === 'accepted')
  );
  
  // Load bids for a specific task
  async loadBidsForTask(taskId: string): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.currentTaskId = taskId;
    
    try {
      this.bids = await bidService.getBidsForTask(taskId);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load bids';
      console.error('Error loading bids:', err);
    } finally {
      this.isLoading = false;
    }
  }
  
  // Create a new bid
  async createBid(bid: Omit<Bid, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Bid | null> {
    this.isLoading = true;
    this.error = null;
    
    try {
      const newBid: Bid = {
        ...bid,
        id: crypto.randomUUID(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        counterOffers: []
      };
      
      const createdBid = await bidService.createBid(newBid);
      this.bids = [...this.bids, createdBid];
      return createdBid;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to create bid';
      console.error('Error creating bid:', err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }
  
  // Update a local bid in the store
  private updateLocalBid(updatedBid: Bid): void {
    this.bids = this.bids.map(bid => 
      bid.id === updatedBid.id ? updatedBid : bid
    );
  }
  
  // Withdraw a bid
  async withdrawBid(bidId: string): Promise<boolean> {
    this.isLoading = true;
    this.error = null;
    
    try {
      await bidService.withdrawBid(bidId);
      
      // Update local state
      const bidToUpdate = this.bids.find(bid => bid.id === bidId);
      if (bidToUpdate) {
        const updatedBid = {
          ...bidToUpdate,
          status: 'withdrawn' as const,
          updatedAt: new Date().toISOString()
        };
        this.updateLocalBid(updatedBid);
      }
      
      return true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to withdraw bid';
      console.error('Error withdrawing bid:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }
}

// Create singleton instance
export const bidStore = new BidStore();
export default bidStore;
```

## 12. Task Management Integration

### 12.1 Task-Bidding Relationship

The bidding system is intrinsically connected to the task management system. This section outlines how these systems will interact to provide a seamless user experience.

#### Task Status Workflow with Bidding

```typescript
// Task status enum extension with bidding-related states
export enum TaskStatusEnum {
  DRAFT = 'DRAFT',               // Task creation in progress
  OPEN = 'OPEN',                 // Task published, accepting bids
  ASSIGNED = 'ASSIGNED',         // Bid accepted, task assigned to provider
  IN_PROGRESS = 'IN_PROGRESS',   // Task being worked on
  UNDER_REVIEW = 'UNDER_REVIEW', // Work submitted for review
  COMPLETED = 'COMPLETED',       // Task completed successfully
  CANCELLED = 'CANCELLED',       // Task cancelled by hirer
  DISPUTED = 'DISPUTED'          // Issue raised, under dispute resolution
}
```

#### State Transitions

Bidding directly impacts task state transitions:

1. **When a bid is accepted**:
   - Task status transitions from `OPEN` to `ASSIGNED`
   - Task is assigned to the selected bidder
   - All other bids are automatically rejected
   - Task details are locked to prevent changes
   - Contract/agreement is generated between parties

2. **When a task with bids is cancelled**:
   - All pending bids are automatically marked as rejected
   - Notifications are sent to all bidders
   - Task status transitions to `CANCELLED`

3. **When a provider withdraws from an assigned task**:
   - Task can return to `OPEN` state
   - Previous bids remain rejected
   - New bidding period starts

### 12.2 Task Component Modifications

To support bidding, the following task components need modifications:

#### TaskDetails.svelte

```svelte
<!-- Add bidding status indicator to task details -->
<div class="mt-4">
  <h3 class="text-lg font-medium">Bidding Status</h3>
  <div class="stats shadow mt-2">
    <div class="stat">
      <div class="stat-title">Total Bids</div>
      <div class="stat-value">{bidCount}</div>
    </div>
    <div class="stat">
      <div class="stat-title">Avg. Bid</div>
      <div class="stat-value text-primary">{formatCurrency(avgBidAmount, task.currency)}</div>
    </div>
    <div class="stat">
      <div class="stat-title">Status</div>
      <div class="stat-value text-accent">{task.status === 'OPEN' ? 'Accepting Bids' : task.status}</div>
    </div>
  </div>
</div>

<!-- Add bid-specific actions to task actions section -->
{#if task.status === 'OPEN'}
  <div class="card-actions mt-4">
    <button class="btn btn-primary" onclick={() => navigate(`/tasks/${task.id}/bids`)}>View All Bids</button>
    {#if isTaskDoer}
      <button class="btn btn-accent" onclick={() => navigate(`/tasks/${task.id}/bids/create`)}>Submit a Bid</button>
    {/if}
  </div>
{/if}
```

#### TasksListItem.svelte

```svelte
<!-- Add bid indicators to task list items -->
<div class="flex items-center gap-2 mt-2">
  <div class="badge badge-outline">{task.bidCount || 0} bids</div>
  {#if task.lowestBid}
    <div class="badge badge-primary">
      From {formatCurrency(task.lowestBid, task.currency)}
    </div>
  {/if}
</div>
```

### 12.3 Store Implementation for Task-Bid Integration

Following BitTasker's store pattern, we'll implement the integration between tasks and bids:

```typescript
// src/lib/stores/task-bid.store.ts
import { writable } from 'svelte/store';
import type { Task } from '$lib/types/task.d';
import type { Bid } from '$lib/types/bid';
import { taskService } from '$lib/api/services/task.service';
import { bidStore } from '$lib/stores/bid.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';

const TASK_BID_STORAGE_KEY = StorageKeys.TASK_BID_MAPPING;

function createTaskBidStore() {
  // Initial state
  const initialState = {
    taskBidMap: {} as Record<string, string[]>, // Maps taskId to bidIds
    assignedTasks: {} as Record<string, string>, // Maps taskId to assigned bidId
    isLoading: false,
    error: null as string | null
  };

  // Create the store
  const store = writable(initialState);

  // Load task-bid mappings from storage
  const loadMappings = async () => {
    try {
      const stored = await Preferences.get({ key: TASK_BID_STORAGE_KEY });
      if (stored.value) {
        const mappings = JSON.parse(stored.value);
        store.update(state => ({
          ...state,
          taskBidMap: mappings.taskBidMap || {},
          assignedTasks: mappings.assignedTasks || {}
        }));
      }
    } catch (error) {
      console.error('Failed to load task-bid mappings:', error);
    }
  };

  // Save mappings to storage
  const saveMappings = async () => {
    let currentState = { taskBidMap: {}, assignedTasks: {} };
    store.subscribe(state => {
      currentState = {
        taskBidMap: state.taskBidMap,
        assignedTasks: state.assignedTasks
      };
    })();

    try {
      await Preferences.set({
        key: TASK_BID_STORAGE_KEY,
        value: JSON.stringify(currentState)
      });
    } catch (error) {
      console.error('Failed to save task-bid mappings:', error);
    }
  };

  // Map a bid to a task
  const mapBidToTask = (taskId: string, bidId: string) => {
    store.update(state => {
      const currentBids = state.taskBidMap[taskId] || [];
      if (!currentBids.includes(bidId)) {
        return {
          ...state,
          taskBidMap: {
            ...state.taskBidMap,
            [taskId]: [...currentBids, bidId]
          }
        };
      }
      return state;
    });
    saveMappings();
  };

  // Assign a bid to a task
  const assignBidToTask = async (taskId: string, bidId: string) => {
    store.update(state => ({
      ...state,
      isLoading: true,
      error: null
    }));

    try {
      // Update task status to ASSIGNED via API
      await taskService.updateTaskStatus(taskId, 'ASSIGNED');

      // Update store
      store.update(state => ({
        ...state,
        assignedTasks: {
          ...state.assignedTasks,
          [taskId]: bidId
        },
        isLoading: false
      }));

      saveMappings();
      return true;
    } catch (error) {
      store.update(state => ({
        ...state,
        error: 'Failed to assign bid to task',
        isLoading: false
      }));
      console.error('Error assigning bid to task:', error);
      return false;
    }
  };

  // Get all bids for a task
  const getBidsForTask = (taskId: string) => {
    let bids: Bid[] = [];
    let bidIds: string[] = [];
    
    // Get mapped bid IDs from store
    store.subscribe(state => {
      bidIds = state.taskBidMap[taskId] || [];
    })();
    
    // Get actual bids from bid store
    if (bidIds.length > 0) {
      bidStore.subscribe(state => {
        bids = state.bids.filter(bid => bidIds.includes(bid.id));
      })();
    }
    
    return bids;
  };

  // Get the assigned bid for a task
  const getAssignedBid = (taskId: string) => {
    let assignedBidId: string | null = null;
    let assignedBid: Bid | null = null;
    
    // Get assigned bid ID
    store.subscribe(state => {
      assignedBidId = state.assignedTasks[taskId] || null;
    })();
    
    // Get actual bid from bid store
    if (assignedBidId) {
      bidStore.subscribe(state => {
        assignedBid = state.bids.find(bid => bid.id === assignedBidId) || null;
      })();
    }
    
    return assignedBid;
  };

  // Return store methods
  return {
    subscribe: store.subscribe,
    loadMappings,
    mapBidToTask,
    assignBidToTask,
    getBidsForTask,
    getAssignedBid
  };
}

// Create singleton instance
export const taskBidStore = createTaskBidStore();
```

### 12.4 Data Synchronization

To maintain data consistency between tasks and bids, implement these synchronization mechanisms:

#### Task Loading with Bids

```typescript
// In task details page
async function loadTaskWithBids(taskId: string) {
  // Load the task
  const task = await taskService.getTaskById(taskId);
  
  // Load associated bids
  await bidStore.loadPersistedData();
  await taskBidStore.loadMappings();
  
  const bids = taskBidStore.getBidsForTask(taskId);
  
  // Calculate bidding statistics
  task.bidCount = bids.length;
  task.avgBidAmount = bids.length > 0
    ? bids.reduce((sum, bid) => sum + bid.amount, 0) / bids.length
    : 0;
  task.lowestBid = bids.length > 0
    ? Math.min(...bids.map(bid => bid.amount))
    : null;
  
  return { task, bids };
}
```

### 12.5 Notification Integration

Implement a notification system for bid-related events using Capacitor Push Notifications:

```typescript
// src/lib/services/notification.service.ts
import { PushNotifications } from '@capacitor/push-notifications';
import { isPlatform } from '@ionic/vue';

export async function setupBidNotifications() {
  if (isPlatform('capacitor')) {
    await PushNotifications.requestPermissions();
    
    PushNotifications.addListener('registration', token => {
      // Send token to backend
      console.log('Push registration success:', token.value);
    });
    
    PushNotifications.addListener('pushNotificationReceived', notification => {
      console.log('Push notification received:', notification);
    });
  }
}

export async function sendLocalBidNotification(title: string, body: string) {
  if (isPlatform('capacitor')) {
    await PushNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Date.now(),
          sound: 'default',
          attachments: null,
          actionTypeId: '',
          extra: null
        }
      ]
    });
  } else {
    // Fallback for web
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
}
```

## 13. Conclusion

This implementation plan provides a comprehensive roadmap for building the BitTasker bidding system according to all technical specifications. By following the SvelteKit 5 with Runes architecture, mobile-first design philosophy, and implementing all required features, the bidding system will deliver a competitive, transparent, and user-friendly experience for both task hirers and doers.

With the additional task management integration, the bidding system becomes a fully integrated part of the BitTasker platform, providing a seamless experience for users throughout the entire task lifecycle from creation to completion.
