# Bidding and Assignment System

This document outlines the requirements for implementing the bidding and assignment system in BitTasker.

## Description

The bidding system allows task workers to place bids on tasks created by task posters. Task posters can review bids, communicate with potential workers, and select the most appropriate worker for their task. Once a bid is accepted, the task is assigned to the selected worker.

## 1. Screens

### Task Poster Screens

- **Bid Review Screen**:
  - List of all bids received for a specific task
  - Sort/filter options for bids (price, worker rating, etc.)
  - Each bid entry shows:
    - Bid amount (in Bitcoin)
    - Worker profile summary (name, photo, rating)
    - Brief proposal text
    - "View Details" button
- **Bid Details Modal/Screen**:
  - Full bid proposal text
  - Worker profile details with past reviews
  - Worker portfolio/past work if available
  - Accept bid button
  - Message worker button
  - Decline bid button (optional)

### Worker Screens

- **Bid Creation Form**:
  - Bid amount input (with Bitcoin conversion display)
  - Proposal text area
  - Estimated completion time input
  - Submit bid button
- **My Bids Screen**:
  - List of all active bids placed by the worker
  - Status indicators (pending, accepted, declined)
  - Ability to modify or withdraw pending bids

## 2. Schema

### Bid Type

```typescript
interface Bid {
	id: string;
	taskId: string;
	workerId: string;
	amount: number; // in satoshis
	proposal: string;
	estimatedCompletionTime: {
		value: number;
		unit: 'hours' | 'days' | 'weeks';
	};
	status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
	createdAt: Date;
	updatedAt: Date;
}
```

### Task Type Extension

```typescript
// Add to existing Task interface
interface Task {
	// existing fields
	assignedWorkerId?: string;
	acceptedBidId?: string;
	status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
}
```

## 3. APIs

### Bid Management

- `POST /api/bids` - Create a new bid

  - Body: `{ taskId, amount, proposal, estimatedCompletionTime }`
  - Returns: Created Bid object

- `GET /api/tasks/{taskId}/bids` - Get all bids for a task

  - Query params: Optional sorting/filtering
  - Returns: Array of Bid objects

- `GET /api/users/{userId}/bids` - Get all bids by a user

  - Query params: Optional status filter
  - Returns: Array of Bid objects

- `PUT /api/bids/{bidId}` - Update a bid (only if pending)

  - Body: Fields to update
  - Returns: Updated Bid object

- `DELETE /api/bids/{bidId}` - Withdraw a bid
  - Returns: Success message

### Bid Assignment

- `POST /api/tasks/{taskId}/accept-bid/{bidId}` - Accept a bid

  - Body: Optional message to worker
  - Returns: Updated Task with assignedWorkerId set

- `POST /api/tasks/{taskId}/decline-bid/{bidId}` - Decline a bid (optional)
  - Body: Optional reason
  - Returns: Updated Bid status

## 4. Dependencies

- No additional npm packages are required beyond what's already in the project
- May use Bitcoin conversion libraries already included in the wallet integration

## 5. Services

### Frontend Services

- `BidService`:
  - Methods for creating, updating, withdrawing bids
  - Fetching bids for tasks or by user
- `TaskAssignmentService`:
  - Methods for accepting bids and updating task status

### Backend Services

- `BidManagementService`:
  - Business logic for bid creation and validation
  - Ensures users can't bid on their own tasks
  - Validates bid amounts against task budget constraints
- `TaskAssignmentService`:
  - Handles the task assignment process
  - May initiate escrow process (linked with Payment service)
  - Updates relevant task status

## 6. Edge Cases

- **Simultaneous Bid Acceptance**: If multiple task posters try to accept the same worker's bid (if worker has multiple bids), ensure worker isn't overcommitted
- **Bid Withdrawal**: Handle cases where a worker withdraws a bid that is being reviewed/accepted

- **Task Cancellation**: Handle what happens to bids if a task is cancelled

- **Bid Modification**: Decide policies on bid modifications (time limits, notification requirements)

- **Worker Availability**: Consider implementing a status to prevent workers from overbooking themselves

- **Minimum/Maximum Bid Amounts**: Set reasonable limits to prevent spam or unrealistic bids

- **Bitcoin Price Volatility**: Consider how to handle exchange rate fluctuations between bid placement and acceptance

- **Communication During Bidding**: Implement a system for task posters to request clarification before accepting bids

- **Bid Expiry**: Consider if bids should expire after a certain time

## 7. Test Plan

### Unit Tests

#### BidService Tests

- Test creating a new bid with valid data
- Test validation of bid amounts (minimum, maximum constraints)
- Test that bids can't be placed on user's own tasks
- Test bid updates for pending bids
- Test preventing updates to accepted/declined bids
- Test bid withdrawal functionality
- Test conversion between BTC and satoshis

#### TaskAssignmentService Tests

- Test accepting a bid updates task status correctly
- Test accepting a bid assigns the correct worker
- Test declining a bid updates bid status correctly
- Test error handling when accepting withdrawn bids

### Component Tests

#### BidCreationForm Component Tests

- Test form validation (required fields, amount constraints)
- Test form submission process
- Test error message display
- Test Bitcoin amount conversion display

#### BidReviewScreen Component Tests

- Test sorting and filtering of bids
- Test display of bid information
- Test accept/decline button functionality
- Test navigation to bid details

### Integration Tests

- Test full bid creation flow from worker perspective
- Test bid review and acceptance flow from task poster perspective
- Test the entire workflow from bid creation to task assignment
- Test integration with notification system for bid status updates
- Test integration with escrow system when accepting bids

### E2E Tests

- Test entire bid-to-assignment workflow in a realistic environment
- Test with multiple concurrent users placing bids
- Test task poster reviewing and accepting bids

### API Tests

- Test all API endpoints with valid inputs
- Test API error responses with invalid inputs
- Test authorization rules (only task poster can accept bids, etc.)
- Test API performance with large numbers of bids

### Edge Case Tests

- Test simultaneous bid acceptances
- Test bid withdrawal during review
- Test placing bids on tasks with different statuses
- Test bid modification timing constraints
