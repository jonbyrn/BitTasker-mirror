# Scheduling System Documentation

## Overview

The BitTasker scheduling system enables taskers and taskees to coordinate task timing through a privacy-preserving, decentralized system built on Nostr. The system handles time slot requests, availability management, conflict resolution, and escrow integration.

## Architecture

### Core Components

1. **Message Types** - Encrypted Nostr DMs (NIP-44) for all scheduling communications
2. **Request Queue** - Client-side queue management for incoming scheduling requests
3. **Availability Calculator** - Client-side calculation of available time slots
4. **Conflict Detection** - Automatic detection and resolution of scheduling conflicts
5. **Escrow Integration** - Links escrow funding to slot confirmation
6. **Notification System** - Batched, prioritized notifications for scheduling events

### Data Flow

```
Tasker → Time Slot Request (DM) → Taskee Queue
Taskee → Request Acceptance (DM) → Tasker
Tasker → Escrow Funding → Escrow Funded Notification (DM) → Taskee
Taskee → Slot Confirmation (DM) → Tasker
```

## Message Types

All scheduling messages are encrypted DMs sent via Nostr (kind 4).

### Time Slot Request

**Type**: `time-slot-request`

**From**: Tasker  
**To**: Taskee

**Purpose**: Request a specific time slot for a task.

**Fields**:
- `requestId`: Unique identifier for the request
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `requestedStartTime`: Requested start time (Unix timestamp)
- `requestedEndTime`: Requested end time (Unix timestamp)
- `expiresAt`: Request expiry time (Unix timestamp, default 15 minutes)
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

### Soonest Available Request

**Type**: `soonest-available-request`

**From**: Tasker  
**To**: Taskee

**Purpose**: Request the soonest available time slot.

**Fields**:
- `requestId`: Unique identifier for the request
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `preferredTimeRanges`: Optional array of preferred time ranges
- `expiresAt`: Request expiry time (Unix timestamp, default 15 minutes)
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

### Request Acceptance

**Type**: `request-acceptance`

**From**: Taskee  
**To**: Tasker

**Purpose**: Accept a scheduling request and propose a time slot.

**Fields**:
- `requestId`: ID of the accepted request
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `acceptedStartTime`: Accepted start time (Unix timestamp)
- `acceptedEndTime`: Accepted end time (Unix timestamp)
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

### Escrow Funded Notification

**Type**: `escrow-funded-notification`

**From**: Tasker  
**To**: Taskee

**Purpose**: Notify taskee that escrow has been funded.

**Fields**:
- `requestId`: ID of the request
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `escrowId`: Escrow contract ID
- `escrowAmount`: Amount funded
- `transactionHash`: Transaction hash
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

### Slot Confirmation

**Type**: `slot-confirmation`

**From**: Taskee  
**To**: Tasker

**Purpose**: Confirm the time slot after escrow verification.

**Fields**:
- `requestId`: ID of the request
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `escrowId`: Escrow contract ID
- `confirmedStartTime`: Confirmed start time (Unix timestamp)
- `confirmedEndTime`: Confirmed end time (Unix timestamp)
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

### Availability Response

**Type**: `availability-response`

**From**: Taskee  
**To**: Tasker

**Purpose**: Send availability data for a specific task window.

**Fields**:
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `taskWindow`: Time window for the task (start/end timestamps)
- `profileAvailability`: Taskee's profile availability settings
- `blockedTimes`: Array of blocked time ranges
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

### Request Cancellation

**Type**: `request-cancellation`

**From**: Tasker  
**To**: Taskee

**Purpose**: Cancel a pending scheduling request.

**Fields**:
- `requestId`: ID of the request to cancel
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `reason`: Optional cancellation reason
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

### Availability Update

**Type**: `availability-update`

**From**: Taskee  
**To**: Tasker

**Purpose**: Update availability data for an open bid.

**Fields**:
- `bidId`: Associated bid ID
- `taskId`: Associated task ID
- `blockedTimes`: Updated array of blocked time ranges
- `timestamp`: Message timestamp
- `nonce`: Unique nonce for replay attack prevention

## Request Lifecycle

### States

1. **Pending** - Request received, awaiting taskee response
2. **Accepted** - Taskee accepted, awaiting escrow funding
3. **Confirmed** - Escrow funded and slot confirmed
4. **Expired** - Request expired without response
5. **Cancelled** - Request cancelled by tasker

### State Transitions

```
Pending → Accepted (taskee accepts)
Accepted → Confirmed (escrow funded + taskee confirms)
Pending → Expired (timeout)
Pending → Cancelled (tasker cancels)
```

## Security Features

### Replay Attack Prevention

- **Nonce Validation**: Each message includes a unique nonce
- **Timestamp Validation**: Messages must be recent (within 1 hour)
- **Message Tracking**: Processed message IDs are tracked to prevent duplicates

### Rate Limiting

- **Per-User Limits**: Maximum requests per time window
- **Abuse Detection**: Detects rapid requests, duplicates, and spam patterns
- **Blocking**: Users exceeding limits are temporarily blocked

### Escrow Verification

Before slot confirmation, the system verifies:
- Escrow status (must be Funded)
- Escrow parties (must match tasker/taskee)
- Escrow amount (must match bid amount)
- Escrow time (must match accepted time slot)

## Conflict Resolution

### Conflict Detection

The system automatically detects when multiple requests overlap in time:
- Same time slot requests
- Overlapping time ranges
- Configurable tolerance (default 15 minutes)

### Resolution Strategies

1. **Best Offer Selection**: Taskee can accept the highest-scoring request
2. **Alternative Slots**: System suggests non-conflicting alternatives
3. **Automatic Rejection**: Conflicting requests are automatically rejected when one is accepted

### Request Scoring

Requests are scored based on:
- Bid amount
- Tasker rating
- Urgency (expiry proximity)
- Time slot specificity
- Combined value (amount × rating)

## Performance Optimization

### Caching

- **IndexedDB**: Client-side caching of availability data
- **TTL-based Expiration**: Automatic cache invalidation
- **Version-based Invalidation**: Cache versioning for updates

### Queue Performance

- **Virtual Scrolling**: Efficient rendering of large queues
- **Pagination**: Load requests in batches
- **Debouncing**: Debounce filter/sort operations
- **Lazy Loading**: Load data on demand

### Mobile Optimization

- **Swipe Gestures**: Swipe left/right for quick actions
- **Pull-to-Refresh**: Refresh queue with pull gesture
- **Touch Targets**: Minimum 44px touch targets
- **Safe Area Insets**: Respect device safe areas

## Staleness Handling

### Detection

- **Timestamp Validation**: Check message timestamps
- **Age Thresholds**: Configurable thresholds for stale/aging data
- **UI Indicators**: Visual badges for stale data

### Handling

- **Filtering**: Option to filter out stale availability
- **Sorting**: Sort by freshness (freshest first)
- **Auto-Refresh**: Trigger refresh for stale data

## Privacy Considerations

### Data Minimization

- **Scoped Availability**: Only send availability for task window (max 30 days)
- **Blocked Times Only**: Send only blocked times, calculate available slots client-side
- **No Profile Data**: Don't send full profile availability, only what's needed

### Encryption

- **End-to-End Encryption**: All scheduling messages are encrypted (NIP-44)
- **Private DMs**: Messages only visible to sender and recipient
- **No Public Events**: All scheduling data is private

## User Experience Features

### Smart Suggestions

- **Best Offer Highlighting**: Automatically highlight highest-scoring requests
- **Urgency Indicators**: Show requests expiring soon
- **Conflict Warnings**: Visual indicators for conflicts
- **Recommendation Badges**: Badges for highly recommended requests

### Notification Batching

- **Grouping**: Group related notifications together
- **Prioritization**: Prioritize urgent notifications
- **Deduplication**: Remove duplicate notifications
- **Quiet Hours**: Respect user quiet hours

### Batch Operations

- **Select Multiple**: Select multiple requests for batch actions
- **Accept All**: Accept all selected requests
- **Reject All**: Reject all selected requests
- **Reschedule All**: Reschedule all selected requests

## Troubleshooting

### Common Issues

#### Request Not Appearing

- **Check Message Delivery**: Verify Nostr relay connectivity
- **Check Expiry**: Request may have expired
- **Check Filters**: Ensure filters aren't hiding the request

#### Escrow Verification Failing

- **Check Escrow Status**: Ensure escrow is in Funded state
- **Check Parties**: Verify escrow parties match tasker/taskee
- **Check Amount**: Verify escrow amount matches bid amount
- **Check Time**: Verify escrow time matches accepted time slot

#### Availability Not Calculating

- **Check Profile Availability**: Ensure profile has time slots configured
- **Check Task Window**: Verify task window is within availability range
- **Check Blocked Times**: Review blocked times for conflicts
- **Check Notice Hours**: Ensure sufficient notice time

### Error Messages

- **"Request expired"**: Request expired before response
- **"Escrow verification failed"**: Escrow doesn't meet requirements
- **"No available slots"**: No slots match the request criteria
- **"Conflict detected"**: Multiple requests for same time slot

## API Reference

### Request Queue Store

```typescript
import { requestQueueStore } from '$lib/stores/request-queue.store';

// Subscribe to queue updates
requestQueueStore.subscribe((queue) => {
  console.log('Queue updated:', queue);
});

// Get all requests
const requests = requestQueueStore.getAllRequests();

// Get specific request
const request = requestQueueStore.getRequest(requestId);

// Add request
requestQueueStore.addRequest(request);

// Update request status
requestQueueStore.updateRequestStatus(requestId, 'accepted', {
  acceptedTime: { startTime, endTime }
});

// Clear queue
requestQueueStore.clear();
```

### Scheduling Messages

```typescript
import {
  sendTimeSlotRequest,
  sendSoonestAvailableRequest,
  sendRequestAcceptance,
  sendEscrowFundedNotification,
  sendSlotConfirmation,
  sendRequestCancellation
} from '$lib/utils/nostr-scheduling';

// Send time slot request
await sendTimeSlotRequest({
  bidId: 'bid-123',
  taskId: 'task-123',
  taskeePubkey: 'taskee-pubkey',
  requestedStartTime: Date.now() + 24 * 60 * 60 * 1000,
  requestedEndTime: Date.now() + 25 * 60 * 60 * 1000,
  expiresAt: Date.now() + 15 * 60 * 1000
});

// Send request acceptance
await sendRequestAcceptance({
  requestId: 'request-123',
  bidId: 'bid-123',
  taskId: 'task-123',
  taskerPubkey: 'tasker-pubkey',
  acceptedStartTime: Date.now() + 24 * 60 * 60 * 1000,
  acceptedEndTime: Date.now() + 25 * 60 * 60 * 1000
});
```

### Availability Calculation

```typescript
import { calculateAvailableSlots } from '$lib/utils/availability-calculator';

const availableSlots = calculateAvailableSlots(
  availabilityResponse,
  taskDurationMinutes
);
```

### Conflict Detection

```typescript
import { detectConflicts, findBestOffer, findAlternativeSlots } from '$lib/utils/conflict-detection';

// Detect conflicts
const { conflicts, totalConflicts } = detectConflicts(requests);

// Find best offer
const bestOffer = findBestOffer(conflictingRequests);

// Find alternative slots
const alternatives = findAlternativeSlots(
  request,
  allRequests,
  availableSlots,
  toleranceMinutes
);
```

## Best Practices

### For Taskers

1. **Be Specific**: Request specific time slots when possible
2. **Set Reasonable Expiry**: Use 15-30 minute expiry windows
3. **Fund Escrow Promptly**: Fund escrow quickly after acceptance
4. **Monitor Status**: Track request status regularly

### For Taskees

1. **Respond Promptly**: Respond to requests within expiry window
2. **Update Availability**: Keep availability data current
3. **Review Conflicts**: Carefully review conflicting requests
4. **Use Batch Actions**: Use batch operations for efficiency

### For Developers

1. **Handle Errors Gracefully**: Always handle errors and provide user feedback
2. **Validate Input**: Validate all user input before sending
3. **Test Edge Cases**: Test expiry, conflicts, and edge cases
4. **Monitor Performance**: Monitor queue performance and optimize as needed

## Future Enhancements

- **Calendar Integration**: Sync with external calendars
- **Recurring Tasks**: Support for recurring task scheduling
- **Time Zone Handling**: Better time zone support and conversion
- **Advanced Filtering**: More sophisticated filtering options
- **Analytics**: Scheduling analytics and insights

## Support

For issues or questions:
- Check this documentation
- Review troubleshooting section
- Contact support team
