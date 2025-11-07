# Scheduling System Implementation Plan

## Overview

This plan implements a privacy-preserving, efficient scheduling system that enables taskers and taskees to coordinate time slots for task execution. The system prioritizes user control, market efficiency, and win-win outcomes while maintaining privacy and preventing race conditions.

## Core Requirements

### Privacy Requirements
- Only reveal availability scoped to task window (not full schedule)
- Encrypted communication via Nostr DMs
- Progressive disclosure (reveal only what's needed)
- No exposure of other taskers' bids or identities

### Efficiency Requirements
- Fast booking for "soonest available" requests
- Batch operations for taskee
- Smart suggestions to reduce decision time
- Performance optimization for large request queues

### User Experience Requirements
- Clear status updates for taskers
- Visual notifications for taskees
- Mobile-optimized interface
- Decision support tools

### Safety Requirements
- 15-minute request expiry
- Escrow-first confirmation (no gap between acceptance and funding)
- Gaming prevention mechanisms
- Race condition elimination

## System Architecture

### Core Flow

```
1. Taskee sends availability (scoped to task window) + recommended time
   ↓
2. Tasker views availability and requests time slot (or "soonest available")
   ↓
3. Request appears in taskee's queue (15-minute expiry)
   ↓
4. Taskee accepts request → "Fund escrow" message sent
   ↓
5. Tasker funds escrow (blockchain)
   ↓
6. Tasker sends "Escrow funded" DM to taskee
   ↓
7. Taskee confirms → "Time slot confirmed" DM sent
   ↓
8. Slot officially reserved, availability updated
```

### Key Components

1. **Availability Service** - Collects and sends scoped availability data
2. **Request Queue** - Manages time slot requests with expiry
3. **Notification System** - Batched, prioritized notifications
4. **Escrow Integration** - Links escrow funding to confirmation
5. **Conflict Resolution** - Handles multiple requests for same slot
6. **Mobile UI** - Optimized mobile experience

## Implementation Phases

### Testing Workflow
**IMPORTANT**: For each phase, follow this workflow:
1. Write tests first (TDD approach) OR write code then immediately write tests
2. Run tests: `npm run test:unit`
3. Fix any failing tests
4. Ensure all tests pass before proceeding to next phase
5. Run type checking: `npm run check`
6. Run linting: `npm run lint`

**Test Requirements**:
- Each new function/service must have corresponding unit tests
- Test coverage should be >80% for new code
- All edge cases must be tested
- Integration tests for message flows
- Component tests for UI components

### Phase 1: Core Data Structures & Types
**Goal**: Define all message types and data structures

**Tasks**:
- [ ] Define `TimeSlotRequest` interface
- [ ] Define `SoonestAvailableRequest` interface
- [ ] Define `RequestAcceptance` interface
- [ ] Define `EscrowFundedNotification` interface
- [ ] Define `SlotConfirmation` interface
- [ ] Define `AvailabilityResponse` interface
- [ ] Add timestamp fields to all requests
- [ ] Add expiry calculation logic
- [ ] **Write tests for expiry calculation logic**
- [ ] **Write tests for timestamp validation**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create/Modify**:
- `src/lib/types/bid.d.ts` - Add new message types
- `src/lib/types/scheduling.d.ts` - New file for scheduling types
- `tests/unit/scheduling/types.test.ts` - Tests for type validation

### Phase 2: Availability Service
**Goal**: Implement service to collect and send scoped availability

**Tasks**:
- [ ] Create `availability-calculation.service.ts`
- [ ] Implement `collectTaskeeAvailabilityData()` - Scoped to task window
- [ ] Implement `getBlockedTimesWithinWindow()` - Only within task window
- [ ] Implement `calculateAvailableSlots()` - Client-side calculation
- [ ] Add timestamp to availability data
- [ ] Limit availability to 30 days max
- [ ] Filter out past blocked times
- [ ] **Proactive Availability Updates**: Taskee can send updated availability if schedule changes, auto-update availability when escrow is created/cancelled, notify taskers of availability changes for their requests, show "availability updated" indicator in UI
- [ ] **Write unit tests for `collectTaskeeAvailabilityData()`**
- [ ] **Write unit tests for `getBlockedTimesWithinWindow()`**
- [ ] **Write unit tests for `calculateAvailableSlots()`**
- [ ] **Write tests for 30-day limit enforcement**
- [ ] **Write tests for past time filtering**
- [ ] **Write tests for availability update notifications**
- [ ] **Write tests for edge cases (empty availability, overlapping slots, etc.)**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create**:
- `src/lib/services/availability-calculation.service.ts`
- `src/lib/utils/availability-calculator.ts`
- `src/lib/utils/availability-updates.ts` - New file for availability update handling
- `tests/unit/scheduling/availability-calculation.service.test.ts`
- `tests/unit/scheduling/availability-calculator.test.ts`
- `tests/unit/scheduling/availability-updates.test.ts`

### Phase 3: Request Queue System
**Goal**: Implement request queue with expiry and status tracking

**Tasks**:
- [ ] Create `request-queue.store.ts` - Manage request queue
- [ ] Implement configurable expiry timer (default 15 minutes, but tasker can set longer)
- [ ] Implement auto-expiry logic
- [ ] Implement request status tracking (pending/accepted/expired/cancelled/etc)
- [ ] Add request filtering and sorting
- [ ] Implement virtual scrolling for performance
- [ ] Add pagination for large queues
- [ ] Implement caching strategy
- [ ] **Handle 15-minute expiry concerns**: Make expiry configurable per task, extend expiry when escrow funding starts, add "funding in progress" status that pauses expiry
- [ ] **Write unit tests for expiry timer (configurable expiry)**
- [ ] **Write unit tests for auto-expiry logic**
- [ ] **Write unit tests for status transitions**
- [ ] **Write unit tests for filtering and sorting**
- [ ] **Write unit tests for pagination**
- [ ] **Write unit tests for caching strategy**
- [ ] **Write tests for edge cases (concurrent expiry, status conflicts, etc.)**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create**:
- `src/lib/stores/request-queue.store.ts`
- `src/lib/utils/request-expiry.ts`
- `tests/unit/scheduling/request-queue.store.test.ts`
- `tests/unit/scheduling/request-expiry.test.ts`

### Phase 4: Message Types & Handlers
**Goal**: Implement all scheduling message types and handlers

**Tasks**:
- [ ] Implement `sendTimeSlotRequest()` - Tasker requests specific time
- [ ] Implement `sendSoonestAvailableRequest()` - Tasker requests ASAP
- [ ] Implement `handleTimeSlotRequest()` - Taskee receives request
- [ ] Implement `sendRequestAcceptance()` - Taskee accepts, requests escrow
- [ ] Implement `handleEscrowFunded()` - Detect escrow funding
- [ ] Implement `sendEscrowFundedNotification()` - Notify taskee
- [ ] Implement `sendSlotConfirmation()` - Taskee confirms after escrow
- [ ] Implement `handleRequestExpiry()` - Auto-expire old requests
- [ ] **Request Cancellation**: Implement `sendRequestCancellation()` - Tasker cancels request, implement `handleRequestCancellation()` - Taskee receives cancellation, add "cancel all pending requests" option for taskers, notify taskee when request is cancelled, update request status to cancelled
- [ ] Add message type constants to `kinds.ts`
- [ ] **Message replay attack prevention**: Add nonce/timestamp validation to all scheduling messages, reject messages with timestamps too far in past (>1 hour), reject messages with timestamps in future, track processed message IDs to prevent duplicates, validate message signatures
- [ ] **Write unit tests for `sendTimeSlotRequest()`**
- [ ] **Write unit tests for `sendSoonestAvailableRequest()`**
- [ ] **Write unit tests for `handleTimeSlotRequest()`**
- [ ] **Write unit tests for `sendRequestAcceptance()`**
- [ ] **Write unit tests for `handleEscrowFunded()`**
- [ ] **Write unit tests for `sendEscrowFundedNotification()`**
- [ ] **Write unit tests for `sendSlotConfirmation()`**
- [ ] **Write unit tests for `handleRequestExpiry()`**
- [ ] **Write unit tests for `sendRequestCancellation()`**
- [ ] **Write unit tests for `handleRequestCancellation()`**
- [ ] **Write unit tests for replay attack prevention**
- [ ] **Write integration tests for complete message flow**
- [ ] **Write tests for error handling (invalid messages, decryption failures, etc.)**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create/Modify**:
- `src/lib/utils/nostr-scheduling.ts` - New scheduling message utilities
- `src/lib/utils/constants/kinds.ts` - Add scheduling message kinds
- `tests/unit/scheduling/nostr-scheduling.test.ts`
- `tests/integration/scheduling/message-flow.test.ts`

### Phase 5: Notification System
**Goal**: Implement batched, prioritized notifications

**Tasks**:
- [ ] Implement notification batching logic
- [ ] Implement priority system (escrow-funded > conflict > best-offer > new)
- [ ] Create batched notification UI component
- [ ] Implement notification grouping by time slot
- [ ] Add notification preferences (quiet hours, frequency)
- [ ] Implement push notification integration
- [ ] Add notification deduplication
- [ ] **Write unit tests for batching logic**
- [ ] **Write unit tests for priority system**
- [ ] **Write unit tests for notification grouping**
- [ ] **Write unit tests for deduplication**
- [ ] **Write component tests for `NotificationBanner.svelte`**
- [ ] **Write tests for quiet hours and preferences**
- [ ] **Write tests for edge cases (empty batches, priority ties, etc.)**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create/Modify**:
- `src/lib/services/notification-batching.service.ts`
- `src/lib/components/scheduling/NotificationBanner.svelte`
- `src/lib/stores/notification.store.ts` - Enhance with scheduling notifications
- `tests/unit/scheduling/notification-batching.service.test.ts`
- `tests/unit/components/scheduling/NotificationBanner.test.ts`

### Phase 6: Taskee UI Components
**Goal**: Build taskee's request queue interface

**Tasks**:
- [ ] Create `RequestQueuePanel.svelte` - Main queue view
- [ ] Create `RequestCard.svelte` - Individual request display
- [ ] Create `ConflictResolutionView.svelte` - Compare multiple requests
- [ ] Create `SoonestAvailableHandler.svelte` - Handle ASAP requests
- [ ] Implement batch selection UI
- [ ] Implement batch actions (accept/reject/reschedule)
- [ ] Add filtering and sorting UI
- [ ] Add search functionality
- [ ] Implement virtual scrolling
- [ ] Add mobile swipe actions
- [ ] Add "availability updated" indicator for requests affected by availability changes
- [ ] Show cancelled request status in queue
- [ ] **Write component tests for `RequestQueuePanel.svelte`**
- [ ] **Write component tests for `RequestCard.svelte`**
- [ ] **Write component tests for `ConflictResolutionView.svelte`**
- [ ] **Write component tests for `SoonestAvailableHandler.svelte`**
- [ ] **Write component tests for `BatchActionsBar.svelte`**
- [ ] **Write tests for user interactions (click, swipe, select)**
- [ ] **Write tests for filtering and sorting functionality**
- [ ] **Write tests for batch actions**
- [ ] **Run component tests and ensure all pass**
- [ ] **Run type checking and linting**
- [ ] **Test in browser (visual verification)**

**Files to Create**:
- `src/lib/components/scheduling/RequestQueuePanel.svelte`
- `src/lib/components/scheduling/RequestCard.svelte`
- `src/lib/components/scheduling/ConflictResolutionView.svelte`
- `src/lib/components/scheduling/SoonestAvailableHandler.svelte`
- `src/lib/components/scheduling/BatchActionsBar.svelte`
- `tests/unit/components/scheduling/RequestQueuePanel.test.ts`
- `tests/unit/components/scheduling/RequestCard.test.ts`
- `tests/unit/components/scheduling/ConflictResolutionView.test.ts`
- `tests/unit/components/scheduling/SoonestAvailableHandler.test.ts`
- `tests/unit/components/scheduling/BatchActionsBar.test.ts`

### Phase 7: Tasker UI Components
**Goal**: Build tasker's time selection and status interface

**Tasks**:
- [ ] Create `AvailabilitySlotSelector.svelte` - Show available slots
- [ ] Create `TimeSlotRequestForm.svelte` - Request specific time
- [ ] Create `SoonestAvailableForm.svelte` - Request ASAP
- [ ] Create `RequestStatusTracker.svelte` - Show request status
- [ ] Create `EscrowFundingPrompt.svelte` - Prompt to fund escrow
- [ ] Implement countdown timer for expiry (with configurable expiry support)
- [ ] Add status update messages
- [ ] Implement "Accept Recommended Time" quick action
- [ ] Add request cancellation UI (cancel button, cancel all option)
- [ ] Show "availability updated" notifications for active requests
- [ ] **Write component tests for `AvailabilitySlotSelector.svelte`**
- [ ] **Write component tests for `TimeSlotRequestForm.svelte`**
- [ ] **Write component tests for `SoonestAvailableForm.svelte`**
- [ ] **Write component tests for `RequestStatusTracker.svelte`**
- [ ] **Write component tests for `EscrowFundingPrompt.svelte`**
- [ ] **Write tests for countdown timer accuracy**
- [ ] **Write tests for form validation**
- [ ] **Write tests for user interactions**
- [ ] **Write tests for cancellation flow**
- [ ] **Run component tests and ensure all pass**
- [ ] **Run type checking and linting**
- [ ] **Test in browser (visual verification)**

**Files to Create**:
- `src/lib/components/scheduling/AvailabilitySlotSelector.svelte`
- `src/lib/components/scheduling/TimeSlotRequestForm.svelte`
- `src/lib/components/scheduling/SoonestAvailableForm.svelte`
- `src/lib/components/scheduling/RequestStatusTracker.svelte`
- `src/lib/components/scheduling/EscrowFundingPrompt.svelte`
- `src/lib/components/scheduling/RequestCancellation.svelte` - New component for cancellation
- `tests/unit/components/scheduling/AvailabilitySlotSelector.test.ts`
- `tests/unit/components/scheduling/TimeSlotRequestForm.test.ts`
- `tests/unit/components/scheduling/SoonestAvailableForm.test.ts`
- `tests/unit/components/scheduling/RequestStatusTracker.test.ts`
- `tests/unit/components/scheduling/EscrowFundingPrompt.test.ts`
- `tests/unit/components/scheduling/RequestCancellation.test.ts`

### Phase 8: Escrow Integration
**Goal**: Link escrow funding to slot confirmation

**Tasks**:
- [ ] Modify `acceptBidAndCreateEscrow()` to send "Escrow funded" DM
- [ ] Create `handleEscrowCreatedForScheduling()` - Detect escrow creation
- [ ] Implement escrow-funded notification to taskee
- [ ] Modify confirmation flow to require escrow ID
- [ ] **Escrow verification gap fixes**: Verify escrow status before allowing confirmation (must be Funded, not Cancelled/Disputed), verify escrow parties match request (tasker and taskee), verify escrow amount matches bid amount, verify escrow time matches requested slot, add escrow status polling/verification before confirmation
- [ ] Update `BidAcceptanceForm.svelte` to show escrow funding status
- [ ] Add escrow funding timeout handling
- [ ] **Write unit tests for escrow-funded DM sending**
- [ ] **Write unit tests for `handleEscrowCreatedForScheduling()`**
- [ ] **Write unit tests for escrow verification (status, parties, amount, time)**
- [ ] **Write unit tests for timeout handling**
- [ ] **Write integration tests for escrow → confirmation flow**
- [ ] **Update existing escrow tests to include scheduling flow**
- [ ] **Write tests for edge cases (escrow creation failure, timeout, cancelled escrow, etc.)**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Modify**:
- `src/lib/utils/wallet/escrowBid.ts`
- `src/lib/utils/wallet/escrowEvents.ts`
- `src/lib/components/bidding/BidAcceptanceForm.svelte`
- `tests/unit/wallet/escrow-scheduling.test.ts` (new)
- `tests/integration/scheduling/escrow-confirmation-flow.test.ts` (new)

### Phase 9: Conflict Resolution
**Goal**: Handle multiple requests for same slot

**Tasks**:
- [ ] Implement conflict detection (multiple requests for same slot)
- [ ] Create conflict notification system
- [ ] Implement taskee selection UI for conflicts
- [ ] Implement automatic alternatives for non-selected requests
- [ ] Add "Accept Best Offer" quick action
- [ ] Implement batch comparison view
- [ ] **Write unit tests for conflict detection**
- [ ] **Write unit tests for conflict notification**
- [ ] **Write unit tests for automatic alternatives**
- [ ] **Write unit tests for "best offer" calculation**
- [ ] **Write component tests for conflict resolution UI**
- [ ] **Write integration tests for conflict resolution flow**
- [ ] **Write tests for edge cases (3+ conflicts, overlapping times, etc.)**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create/Modify**:
- `src/lib/utils/conflict-detection.ts`
- `src/lib/components/scheduling/ConflictResolutionView.svelte` (from Phase 6)
- `tests/unit/scheduling/conflict-detection.test.ts`
- `tests/integration/scheduling/conflict-resolution-flow.test.ts`

### Phase 10: Smart Suggestions & Decision Support
**Goal**: Help users make faster decisions

**Tasks**:
- [ ] Implement suggestion engine
- [ ] Add "Best Offer" highlighting
- [ ] Implement comparison scoring (bid × rating)
- [ ] Add "Accept Best" quick action
- [ ] Implement progressive disclosure
- [ ] Add recommendation badges
- [ ] **Write unit tests for suggestion engine**
- [ ] **Write unit tests for scoring algorithm**
- [ ] **Write unit tests for "best offer" calculation**
- [ ] **Write tests for recommendation logic**
- [ ] **Write component tests for UI highlighting**
- [ ] **Write tests for edge cases (tied scores, missing data, etc.)**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create**:
- `src/lib/services/suggestion-engine.ts`
- `src/lib/utils/request-scoring.ts`
- `tests/unit/scheduling/suggestion-engine.test.ts`
- `tests/unit/scheduling/request-scoring.test.ts`

### Phase 11: Performance Optimization
**Goal**: Handle large queues efficiently

**Tasks**:
- [ ] Implement virtual scrolling for request list
- [ ] Add request pagination
- [ ] Implement lazy loading for request details
- [ ] Add request caching (IndexedDB)
- [ ] **IndexedDB cache invalidation**: Implement TTL-based cache expiration, add cache versioning for schema changes, implement cache invalidation on escrow events, add manual cache clear option for debugging, handle cache corruption gracefully
- [ ] Implement request archiving (>24 hours)
- [ ] Optimize availability calculation
- [ ] Add debouncing for availability updates
- [ ] **Write performance tests for virtual scrolling (100+ items)**
- [ ] **Write performance tests for pagination**
- [ ] **Write unit tests for caching logic**
- [ ] **Write unit tests for cache invalidation strategies**
- [ ] **Write unit tests for archiving logic**
- [ ] **Write unit tests for debouncing**
- [ ] **Write performance benchmarks (target: <500ms for 100 items)**
- [ ] **Run performance tests and verify targets**
- [ ] **Run tests and ensure all pass**
- [ ] **Run type checking and linting**

**Files to Create/Modify**:
- `src/lib/utils/queue-performance.ts`
- `src/lib/stores/request-queue.store.ts` - Add caching
- `src/lib/utils/cache-invalidation.ts` - New file for cache management
- `tests/performance/scheduling/queue-performance.test.ts`
- `tests/unit/scheduling/queue-performance.test.ts`
- `tests/unit/scheduling/cache-invalidation.test.ts`

### Phase 12: Mobile Optimization
**Goal**: Optimize for mobile devices

**Tasks**:
- [ ] Create mobile-optimized request queue UI
- [ ] Implement swipe actions (swipe to accept/reject)
- [ ] Optimize notification display for mobile
- [ ] Add mobile-specific batch actions
- [ ] Implement pull-to-refresh
- [ ] Optimize touch targets
- [ ] Add mobile notification grouping
- [ ] **Write component tests for mobile UI**
- [ ] **Write tests for swipe gesture handlers**
- [ ] **Write tests for pull-to-refresh**
- [ ] **Write tests for touch target sizes (min 44px)**
- [ ] **Test on actual mobile devices (iOS/Android)**
- [ ] **Run component tests and ensure all pass**
- [ ] **Run type checking and linting**
- [ ] **Visual testing on mobile browsers**

**Files to Create/Modify**:
- `src/lib/components/scheduling/MobileRequestQueue.svelte`
- `src/lib/components/scheduling/RequestCard.svelte` - Add swipe handlers
- `tests/unit/components/scheduling/MobileRequestQueue.test.ts`
- `tests/e2e/mobile/scheduling-flow.test.ts`

### Phase 13: Integration & E2E Testing
**Goal**: Comprehensive integration and end-to-end testing

**Tasks**:
- [ ] **Review all unit tests from previous phases (ensure coverage >80%)**
- [ ] **Write integration tests for complete booking flow**
- [ ] **Write E2E tests for complete user journey (tasker + taskee)**
- [ ] **Write E2E tests for conflict resolution flow**
- [ ] **Write E2E tests for "soonest available" flow**
- [ ] **Write E2E tests for escrow funding → confirmation flow**
- [ ] **Write tests for offline scenarios**
- [ ] **Write tests for network delay scenarios**
- [ ] **Write tests for Nostr propagation delays**
- [ ] **Write tests for concurrent requests**
- [ ] **Run full test suite and ensure all pass**
- [ ] **Verify test coverage meets requirements**
- [ ] **Run type checking and linting**
- [ ] **Manual testing checklist completion**

**Files to Create**:
- `tests/integration/scheduling/complete-booking-flow.test.ts`
- `tests/e2e/scheduling/tasker-journey.test.ts`
- `tests/e2e/scheduling/taskee-journey.test.ts`
- `tests/e2e/scheduling/conflict-resolution.test.ts`
- `tests/e2e/scheduling/soonest-available.test.ts`
- `tests/e2e/scheduling/offline-scenarios.test.ts`
- `tests/e2e/scheduling/network-delays.test.ts`

### Phase 16: Documentation & Translations
**Goal**: Complete documentation and i18n

**Tasks**:
- [x] Add scheduling message types to API docs
- [x] Create user guide for scheduling
- [x] Add translation keys for all scheduling UI
- [x] Document privacy-preserving aspects
- [x] Add developer documentation
- [x] Create troubleshooting guide

**Files Created**:
- `static/locales/en/dashboard/scheduling.json` ✅
- `static/locales/es/dashboard/scheduling.json` ✅
- `docs/scheduling-system.md` ✅

## Technical Considerations

### Nostr Limitations
- Message size limit: ~64KB (chunk if needed)
- Propagation delay: 1-5 seconds (handle gracefully)
- No atomic operations: Use sequential processing
- Eventual consistency: Accept slight delays

### Non-Custodial Constraints
- All data stored locally or in Nostr
- No central server for coordination
- Client-side conflict resolution
- Local state management

### Performance Targets
- Request queue load: <500ms for 100 requests
- Availability calculation: <200ms
- Notification batching: <100ms
- Mobile UI: 60fps scrolling

## Success Metrics

### User Experience
- Average time-to-booking: <2 hours
- Taskee response rate: >80%
- Tasker satisfaction: >4.5/5
- Mobile usage: >50% of bookings

### Technical
- Request expiry accuracy: 100%
- Zero double-bookings
- Notification delivery: >95%
- Queue performance: <500ms for 100 items

## Risk Mitigation

### High Risk Items
1. **Race Conditions** - Mitigated by sequential processing and escrow-first confirmation
2. **Notification Overload** - Mitigated by batching and prioritization
3. **Performance Issues** - Mitigated by virtual scrolling and caching
4. **Gaming** - Mitigated by escrow verification

### Contingency Plans
- Fallback to manual selection if automation fails
- Graceful degradation for offline scenarios
- Manual conflict resolution if automatic fails
- Rate limiting to prevent abuse

## Timeline Estimate

- **Phase 1-4** (Core): 2-3 weeks
- **Phase 5-7** (UI): 2-3 weeks
- **Phase 8-9** (Integration): 1-2 weeks
- **Phase 10-13** (Enhancements): 2-3 weeks
- **Phase 14-16** (Polish): 1-2 weeks

**Total Estimate**: 8-13 weeks

## Dependencies

- Nostr messaging system (existing)
- Escrow system (existing)
- Notification system (existing, needs enhancement)
- Wallet integration (existing)

## Testing Standards

### Test Coverage Requirements
- **Unit Tests**: >80% code coverage for all new code
- **Integration Tests**: All message flows must be tested
- **E2E Tests**: Complete user journeys must be tested
- **Component Tests**: All UI components must have interaction tests

### Test Execution Requirements
- **Before Each Phase**: Run `npm run test:unit` and ensure all pass
- **After Each Phase**: Run full test suite, type checking, and linting
- **Before Moving Forward**: All tests must pass, no TypeScript errors, no lint errors

### Test Types
1. **Unit Tests**: Test individual functions/services in isolation
2. **Integration Tests**: Test component interactions and message flows
3. **Component Tests**: Test UI components and user interactions
4. **E2E Tests**: Test complete user journeys end-to-end
5. **Performance Tests**: Verify performance targets are met

### Test Commands
```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run all tests
npm run test

# Check TypeScript
npm run check

# Run linting
npm run lint
```

## Notes

- All scheduling messages use encrypted DMs (NIP-44)
- Availability data is scoped to task window for privacy
- Escrow funding is required before confirmation
- 15-minute expiry prevents stale requests
- Batch operations improve efficiency for taskees
- Mobile optimization is critical for adoption
- **Tests must be written and passing before proceeding to next phase**
- **Each new function/service must have corresponding tests**
- **Visual testing in browser is required for UI components**

