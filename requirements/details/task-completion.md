# Task Completion and Review

This document outlines the requirements for implementing the task completion and review system in BitTasker.

## Description

The task completion and review system allows workers to mark tasks as complete, task posters to verify completion, and both parties to leave reviews. This system is essential for building trust within the platform and releasing payments from escrow.

## 1. Screens

### Worker Screens

- **Task Progress Screen**:
  - Current task status indicator
  - Progress update input/form
  - Upload completion evidence (photos, files, links)
  - Mark as complete button
  - Communication with task poster
- **Task Submission Screen**:
  - Summary of work completed
  - Evidence upload/attachment
  - Notes for task poster
  - Final submission button

### Task Poster Screens

- **Review Completion Screen**:
  - Task details summary
  - Evidence provided by worker
  - Accept completion button
  - Request changes/clarification button
  - Reject completion button (with reason)
- **Leave Review Screen**:
  - Star rating input
  - Written review text area
  - Specific rating categories (communication, quality, timeliness)
  - Submit review button

### Shared Screens

- **Task Timeline/History View**:
  - Chronological display of task events
  - Status changes
  - Messages exchanged
  - Evidence uploaded
  - Payment milestones

## 2. Schema

### TaskSubmission Type

```typescript
interface TaskSubmission {
	id: string;
	taskId: string;
	workerId: string;
	status: 'submitted' | 'changes_requested' | 'accepted' | 'rejected';
	submissionText: string;
	evidenceUrls: string[]; // URLs to uploaded files/images
	submittedAt: Date;
	updatedAt: Date;
	responseText?: string; // Poster's response if changes requested/rejected
}
```

### Review Type

```typescript
interface Review {
	id: string;
	taskId: string;
	reviewerId: string; // User giving the review
	revieweeId: string; // User receiving the review
	reviewerType: 'poster' | 'worker';
	overallRating: number; // 1-5
	specificRatings: {
		communication: number;
		quality: number;
		timeliness: number;
		value?: number; // for worker -> poster reviews
		clarity?: number; // for worker -> poster reviews
	};
	comment: string;
	createdAt: Date;
	updatedAt: Date;
}
```

### Task Status Extension

```typescript
// Add to existing Task interface
interface Task {
	// existing fields
	completionDate?: Date;
	reviewPosterToWorker?: string; // Review ID
	reviewWorkerToPoster?: string; // Review ID
}
```

## 3. APIs

### Task Completion

- `POST /api/tasks/{taskId}/submit` - Submit task for review

  - Body: `{ submissionText, evidenceUrls }`
  - Returns: Created TaskSubmission object

- `GET /api/tasks/{taskId}/submission` - Get submission details

  - Returns: TaskSubmission object

- `POST /api/tasks/{taskId}/submission/respond` - Respond to submission

  - Body: `{ status, responseText? }`
  - Returns: Updated TaskSubmission object

- `POST /api/tasks/{taskId}/complete` - Mark task as fully completed
  - Returns: Updated Task object with completionDate set

### Reviews

- `POST /api/tasks/{taskId}/reviews` - Create a review

  - Body: `{ revieweeId, reviewerType, overallRating, specificRatings, comment }`
  - Returns: Created Review object

- `GET /api/tasks/{taskId}/reviews` - Get reviews for a task

  - Returns: Array of Review objects

- `GET /api/users/{userId}/reviews` - Get reviews for a user
  - Query params: Pagination, filters (as poster/worker)
  - Returns: Array of Review objects

## 4. Dependencies

- File upload library (if not already implemented)
- Image compression library for photo evidence
- PDF viewer for documentation evidence

## 5. Services

### Frontend Services

- `TaskCompletionService`:
  - Methods for submitting completion evidence
  - Handling task status updates
  - Displaying task timeline
- `ReviewService`:
  - Methods for submitting and displaying reviews
  - Calculating average ratings

### Backend Services

- `TaskCompletionService`:
  - Validation of task completion submissions
  - Processing task status changes
  - Integration with escrow system for payment release
- `ReviewManagementService`:

  - Processing and storing reviews
  - Calculating and updating user reputation scores
  - Preventing review abuse/spam

- `EvidenceStorageService`:
  - Secure storage of completion evidence
  - Access control for uploaded files
  - Clean-up of old/temporary files

## 6. Edge Cases

- **Disputed Completion**: Clear process for resolving disagreements about task completion
- **Evidence Requirements**: Define minimum acceptable evidence for different task types

- **Completion Verification**: Consider implementing verification steps for certain high-value tasks

- **Review Window**: Set time limits for leaving reviews after task completion

- **Review Editing**: Decide if/when reviews can be edited or deleted

- **Missing Reviews**: Handle payment release if task poster doesn't review within reasonable time

- **Review Quality**: Implement mechanisms to prevent fake/spam reviews

- **Partial Completion**: Handle cases where tasks are partially completed but can't be finished

- **Evidence Privacy**: Ensure sensitive uploaded evidence is properly secured

- **Complex Tasks**: Support multiple submission/verification steps for complex tasks with milestones
