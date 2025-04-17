# Task Completion and Review System

This document outlines the requirements for implementing the task completion and review system in BitTasker.

## Description

The task completion and review system manages the final stages of the task lifecycle, including work submission, approval processes, rating and reviewing of task participants, and handling of any disputes that may arise during these processes.

## 1. Screens

### Task Completion Screens

- **Work Submission Screen**:
  - Photo/file upload for proof of completion
  - Text description field
  - Additional notes/comments section
  - Submit button with confirmation
- **Work Verification Screen**:
  - Display of submitted completion evidence
  - Approval/rejection options
  - Request for changes/clarification option
  - Final approval confirmation

### Review Screens

- **Review Submission Form**:
  - Star rating system
  - Category-specific ratings (quality, communication, etc.)
  - Text review field
  - Photo upload option
  - Submit button
- **Review Management Screen**:
  - List of pending reviews to give
  - History of given and received reviews
  - Reply to reviews option
  - Report inappropriate review option

### Dispute Resolution Screens

- **Dispute Filing Screen**:
  - Issue description field
  - Evidence upload option
  - Desired resolution field
  - Submit button
- **Dispute Resolution Center**:
  - Case details and evidence
  - Communication thread between parties
  - Mediator comments section
  - Resolution options and status tracking

## 2. Schema

### TaskCompletion Type

```typescript
interface TaskCompletion {
	id: string;
	taskId: string;
	providerId: string;
	submissionType: 'photo' | 'file' | 'text' | 'combination';
	evidence: {
		photos?: string[]; // URLs to uploaded photos
		files?: {
			name: string;
			url: string;
			type: string;
			size: number;
		}[];
		description: string;
	};
	status: 'submitted' | 'changes_requested' | 'approved' | 'rejected' | 'disputed';
	clientFeedback?: {
		message: string;
		requestedChanges?: string;
		timestamp: Date;
	};
	providerResponse?: {
		message: string;
		timestamp: Date;
	};
	completionDate?: Date; // Set when approved
	submissionDate: Date;
	lastUpdated: Date;
}
```

### Review Type

```typescript
interface Review {
	id: string;
	taskId: string;
	reviewerId: string; // User giving the review
	revieweeId: string; // User receiving the review
	revieweeType: 'provider' | 'client'; // Role of the person being reviewed
	overallRating: number; // 1-5 scale
	categoryRatings: {
		quality?: number;
		communication?: number;
		timeliness?: number;
		value?: number;
		accuracy?: number;
		professionalism?: number;
	};
	comment: string;
	photos?: string[]; // URLs to uploaded photos
	reply?: {
		text: string;
		timestamp: Date;
	};
	isPublic: boolean;
	status: 'published' | 'reported' | 'removed';
	helpfulCount: number;
	createdAt: Date;
	updatedAt: Date;
}
```

### Dispute Type

```typescript
interface Dispute {
	id: string;
	taskId: string;
	completionId?: string;
	initiatorId: string;
	respondentId: string;
	reason:
		| 'incomplete_work'
		| 'quality_issues'
		| 'payment_dispute'
		| 'communication_issues'
		| 'other';
	description: string;
	evidence: {
		photos?: string[];
		files?: {
			name: string;
			url: string;
			type: string;
			size: number;
		}[];
		messages?: string[]; // References to relevant messages
	};
	desiredResolution: string;
	status: 'opened' | 'in_mediation' | 'resolved' | 'closed_without_resolution';
	mediatorId?: string;
	resolution?: {
		outcome: 'refund' | 'partial_payment' | 'full_payment' | 'rework' | 'no_action';
		description: string;
		acceptedBy: {
			initiator: boolean;
			respondent: boolean;
		};
		amount?: number; // For partial payments
	};
	messages: {
		senderId: string;
		text: string;
		attachments?: string[];
		isFromMediator: boolean;
		timestamp: Date;
	}[];
	createdAt: Date;
	updatedAt: Date;
	resolvedAt?: Date;
}
```

## 3. APIs

### Task Completion

- `POST /api/tasks/{taskId}/completion` - Submit task completion

  - Body: Completion evidence
  - Returns: Created TaskCompletion object

- `GET /api/tasks/{taskId}/completion` - Get completion details

  - Returns: TaskCompletion object

- `PUT /api/tasks/{taskId}/completion/{completionId}` - Update completion submission

  - Body: Updated fields
  - Returns: Updated TaskCompletion object

- `POST /api/tasks/{taskId}/completion/{completionId}/approve` - Approve completion

  - Returns: Updated TaskCompletion object

- `POST /api/tasks/{taskId}/completion/{completionId}/reject` - Reject completion
  - Body: Rejection reason
  - Returns: Updated TaskCompletion object

### Reviews

- `POST /api/tasks/{taskId}/reviews` - Submit a review

  - Body: Review details
  - Returns: Created Review object

- `GET /api/tasks/{taskId}/reviews` - Get task reviews

  - Returns: Array of Review objects

- `GET /api/users/{userId}/reviews` - Get user's reviews

  - Query params: type (given/received), role (provider/client)
  - Returns: Array of Review objects

- `PUT /api/reviews/{reviewId}` - Update a review

  - Body: Updated fields
  - Returns: Updated Review object

- `POST /api/reviews/{reviewId}/reply` - Reply to a review

  - Body: Reply text
  - Returns: Updated Review object

- `POST /api/reviews/{reviewId}/report` - Report a review
  - Body: Report reason
  - Returns: Success message

### Disputes

- `POST /api/tasks/{taskId}/disputes` - Create a dispute

  - Body: Dispute details
  - Returns: Created Dispute object

- `GET /api/tasks/{taskId}/disputes` - Get task disputes

  - Returns: Array of Dispute objects

- `GET /api/disputes/{disputeId}` - Get dispute details

  - Returns: Dispute object

- `POST /api/disputes/{disputeId}/messages` - Send dispute message

  - Body: Message text and attachments
  - Returns: Updated Dispute object

- `PUT /api/disputes/{disputeId}/resolution` - Propose resolution

  - Body: Resolution details
  - Returns: Updated Dispute object

- `POST /api/disputes/{disputeId}/accept` - Accept proposed resolution
  - Returns: Updated Dispute object

## 4. Dependencies

- File/image upload service
- Notification service
- Rating and review components
- Chat/messaging service for disputes
- Payment service for dispute resolutions

## 5. Services

### Frontend Services

- `TaskCompletionService`:
  - Methods for submitting and managing completion evidence
  - Approval/rejection handling
  - Status tracking
- `ReviewSubmissionService`:
  - Submission form handling
  - Rating calculation
  - Photo upload for reviews
- `DisputeManagementService`:
  - Dispute filing interface
  - Evidence collection
  - Communication thread management
  - Resolution workflow

### Backend Services

- `CompletionVerificationService`:
  - Process completion submissions
  - Validate evidence
  - Handle approval workflow
- `ReviewProcessingService`:
  - Store and retrieve reviews
  - Calculate aggregate ratings
  - Handle review moderation
- `DisputeResolutionService`:
  - Dispute case management
  - Mediation process handling
  - Resolution implementation
  - Escrow release decisions

## 6. Edge Cases

- **Partial Completion**: Handle cases where work is partially complete

- **Revision Requests**: Support multiple rounds of revisions before final approval

- **Delayed Reviews**: Handle cases where users delay leaving reviews

- **Review Editing**: Time window and rules for editing submitted reviews

- **Retaliatory Reviews**: Detect and handle potentially retaliatory negative reviews

- **Evidence Disputes**: Process for when parties disagree about submitted evidence

- **Unresponsive Parties**: Handle cases where one party is unresponsive during disputes

- **Complex Resolutions**: Support for complex dispute resolutions (partial payments, rework, etc.)

- **Escalation Path**: Process for escalating disputes that cannot be resolved between parties

- **Review Fairness**: Mechanisms to ensure reviews are fair and not influenced by external factors

## 7. Test Plan

### Unit Tests

#### TaskCompletionService Tests

- Test submission validation with various evidence types
- Test status transitions (submitted → approved/rejected/changes requested)
- Test evidence validation rules
- Test completion timestamp management
- Test client feedback and provider response handling
- Test completion history tracking

#### ReviewProcessingService Tests

- Test review creation with different rating combinations
- Test review validation rules
- Test public/private review handling
- Test review editing within allowed timeframe
- Test review reply functionality
- Test helpful vote counting
- Test reporting mechanism

#### DisputeResolutionService Tests

- Test dispute creation with different reasons
- Test evidence handling in disputes
- Test dispute status transitions
- Test mediation assignment
- Test message threading in disputes
- Test resolution proposal validations
- Test resolution acceptance flows

### Integration Tests

#### Task Completion Flow Tests

- Test end-to-end completion submission and approval
- Test completion rejection and resubmission flow
- Test changes requested and response flow
- Test integration with payment release
- Test notification generation at each stage
- Test completion status reflection in task status

#### Review Flow Tests

- Test review submission after task completion
- Test bilateral review process (both parties reviewing)
- Test review impact on reputation scores
- Test review visibility based on settings
- Test review reply notification and display
- Test review moderation workflow

#### Dispute Resolution Flow Tests

- Test dispute creation from different entry points
- Test evidence submission during active dispute
- Test mediator assignment and communication
- Test resolution proposal and acceptance
- Test payment adjustments from dispute outcomes
- Test dispute impact on user reputation

### Component Tests

#### Work Submission UI Tests

- Test photo/file upload component
- Test description field validation
- Test submission button states (disabled until valid)
- Test confirmation dialog
- Test progress indication during upload
- Test error handling for failed uploads

#### Completion Verification UI Tests

- Test evidence display components
- Test approval/rejection button states
- Test feedback form functionality
- Test request changes workflow
- Test mobile vs desktop display of evidence

#### Review Form UI Tests

- Test star rating component
- Test category rating inputs
- Test character limiting for review text
- Test photo attachment functionality
- Test form validation and submission
- Test preview functionality

#### Dispute Management UI Tests

- Test dispute creation form
- Test evidence upload components
- Test message thread display
- Test resolution proposal form
- Test status indication throughout process
- Test acceptance/rejection UI

### Security Tests

- Test authorization for submission approvals
- Test evidence access controls
- Test review submission authentication
- Test dispute access restrictions
- Test file upload security
- Test sensitive information handling in disputes

### Performance Tests

- Test system with large evidence uploads
- Test review loading performance with pagination
- Test dispute resolution system under load
- Test simultaneous completion submissions
- Test media processing for completion evidence

### Concurrency Tests

- Test simultaneous approval/rejection attempts
- Test concurrent review submissions
- Test dispute message ordering with concurrent users
- Test resolution acceptance from multiple parties

### Edge Case Tests

- Test handling of incomplete evidence
- Test partial completion scenarios
- Test review submission after deadlines
- Test dispute creation after extended periods
- Test resolution of complex multi-factor disputes
- Test handling of repeated rejection/resubmission cycles

### Migration Tests

- Test importing historical completion data
- Test handling of legacy review formats
- Test transition of ongoing disputes to new system
- Test backward compatibility with old client versions
