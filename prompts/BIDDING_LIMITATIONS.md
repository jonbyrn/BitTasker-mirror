# BitTasker Bidding System API Limitations

This document outlines the current limitations in the API that affect the full implementation of the bidding system for BitTasker. These issues need to be addressed by the backend team to enable complete bidding functionality.

## 1. Missing API Endpoints

The following API endpoints are currently missing but required for complete bidding functionality:

| Endpoint | Purpose | Current Workaround |
|----------|---------|-------------------|
| `GET /api/v1/bid/task/{taskId}` | Retrieve all bids for a specific task | Client-side storage and filtering using the bid store |
| `GET /api/v1/bid/user` | Retrieve bids submitted by the current user | Client-side storage and filtering based on user ID |
| `POST /api/v1/bid/{bidId}/accept` | Accept a bid for a task | Using task status update to `IN_PROGRESS` and client-side bid status tracking |
| `POST /api/v1/bid/{bidId}/reject` | Reject a bid | Client-side bid status tracking with no backend synchronization |
| `POST /api/v1/bid/{bidId}/counter` | Create counter-offer | Extended bid update with additional metadata and client-side state management |
| `GET /api/v1/bid/{bidId}/counteroffers` | Get counter-offers for a bid | Client-side storage and filtering for counter offers |

## 2. Data Model Limitations

### 2.1 Missing Bid Model Fields

The current bid data model lacks several fields required for comprehensive bidding:

- **Status Tracking**: The bid model needs a `status` field to track bid states (pending, accepted, rejected, withdrawn, countered)
- **Bid ID**: Unique identifier for each bid
- **Bidder Information**: Fields for bidder's ID and name
- **Provider Highlights**: Structure to showcase provider skills, certifications, and portfolio items
- **Timestamps**: Creation and update timestamps for tracking bid history
- **Counter-Offer Support**: Structure to track negotiation history between task poster and bidder

### 2.2 Missing Counter-Offer Model

There is no dedicated model for counter-offers, which should include:

- Reference to the original bid
- New price proposal
- Message explaining the counter terms
- Status of the counter-offer
- Proposer information (bidder or task owner)
- Timestamp

## 3. Synchronization Issues

Due to the above limitations, several synchronization issues arise:

1. **Bid State Persistence**: Bid statuses are only tracked client-side, risking data loss on browser refresh
2. **Incomplete Bid Retrieval**: Without proper task-bid retrieval endpoints, users may see incomplete bid lists
3. **Counter-Offer Visibility**: Counter-offers are only visible to the current user session that created them
4. **No Real-time Updates**: Users don't receive notifications about bid status changes, counter-offers, or new bids
5. **Bid-Task Status Coupling**: Accepting a bid requires manually updating the task status without a direct connection

## 4. Recommended API Enhancements

The backend team should prioritize:

1. Implementing the missing bid endpoints with proper filtering and pagination
2. Extending the bid data model to include status tracking and counter-offer support
3. Adding real-time notification capabilities for bid events
4. Creating a proper link between bid acceptance and task assignment

## 5. Current Frontend Workarounds

The current implementation uses several workarounds:

1. **Client-side State Management**: Using Svelte stores to manage bid and counter-offer state
2. **Local Storage Persistence**: Using Capacitor Preferences for offline and cross-session state persistence
3. **Task Status Update**: Using the existing task status endpoint to simulate bid acceptance
4. **Bi-directional Status Tracking**: Manually updating bid statuses when task statuses change and vice versa

These workarounds will need to be refactored once the proper API endpoints are available.
