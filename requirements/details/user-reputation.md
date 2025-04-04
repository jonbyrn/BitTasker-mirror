# User Reputation System

This document outlines the requirements for implementing the user reputation system in BitTasker.

## Description

The user reputation system establishes trust within the platform by allowing users to rate and review each other after completing tasks. It displays aggregate metrics and detailed feedback to help users make informed decisions when hiring workers or accepting bids.

## 1. Screens

### Profile Screens

- **Public Profile Reputation Section**:
  - Overall star rating
  - Number of reviews
  - Rating breakdown by category (quality, communication, timeliness)
  - Recent reviews with comments
  - Work history summary
  - Verification badges
- **Detailed Reputation View**:
  - Complete review history
  - Filterable reviews (as worker, as poster)
  - Graphical representation of ratings over time
  - Response rate and acceptance rate metrics

### Dashboard Screens

- **Reputation Overview Widget**:
  - Quick summary of current reputation
  - Recent rating changes
  - Suggestions for improvement
  - Comparative metrics with platform averages

## 2. Schema

### UserReputation Type

```typescript
interface UserReputation {
	userId: string;
	asWorker: {
		overallRating: number; // Average of all received ratings
		totalReviews: number;
		categoryRatings: {
			communication: number;
			quality: number;
			timeliness: number;
		};
		completionRate: number; // % of accepted tasks completed
		responseRate: number; // % of inquiries responded to
		disputeRate: number; // % of tasks with disputes
	};
	asPoster: {
		overallRating: number;
		totalReviews: number;
		categoryRatings: {
			communication: number;
			clarity: number;
			payment: number;
		};
		paymentRate: number; // % of tasks paid without issues
	};
	verifications: {
		emailVerified: boolean;
		phoneVerified: boolean;
		identityVerified: boolean;
		paymentMethodVerified: boolean;
		addressVerified: boolean;
	};
	badges: {
		name: string;
		description: string;
		earnedAt: Date;
	}[];
	updatedAt: Date;
}
```

### User Extension

```typescript
// Add to existing User interface
interface User {
	// existing fields
	reputationId: string; // Reference to UserReputation
	level: 'beginner' | 'intermediate' | 'experienced' | 'expert'; // Based on activity and ratings
	joinedDate: Date;
	tasksCompleted: number;
	tasksPosted: number;
}
```

## 3. APIs

### Reputation Management

- `GET /api/users/{userId}/reputation` - Get user reputation data

  - Returns: UserReputation object

- `GET /api/users/{userId}/reviews` - Get user reviews

  - Query params: Pagination, filters (as poster/worker, rating)
  - Returns: Array of Review objects

- `GET /api/users/{userId}/statistics` - Get user activity statistics
  - Returns: User statistics object

### Verification

- `POST /api/verification/request/{verificationType}` - Request verification

  - Body: Verification specific data
  - Returns: Verification request status

- `GET /api/verification/status` - Check verification status
  - Returns: Status of all verification types

## 4. Dependencies

- Chart library for reputation visualizations (e.g., Chart.js)
- ID verification service (optional, for identity verification)

## 5. Services

### Frontend Services

- `ReputationDisplayService`:
  - Methods for calculating and displaying reputation metrics
  - Visualization components for ratings
  - Badge display handling
- `VerificationService`:
  - Methods for requesting and tracking verifications
  - Display verification status

### Backend Services

- `ReputationCalculationService`:
  - Calculate aggregate reputation metrics
  - Update user levels based on activity and ratings
  - Handle rating anomaly detection
- `VerificationManagementService`:
  - Process verification requests
  - Verify user information
  - Assign verification badges
- `BadgeManagementService`:
  - Award badges based on achievements
  - Track user progress toward badges

## 6. Edge Cases

- **New Users**: Handle the "cold start" problem for users with no reviews
- **Rating Manipulation**: Implement safeguards against fake or manipulated ratings

- **Review Bombing**: Detect and handle malicious attempts to damage reputation

- **Inactive Users**: Define how reputation changes after periods of inactivity

- **Improving Bad Reputation**: Create a fair path for users to improve after negative reviews

- **Weighting System**: Consider weighting reviews by task value or reviewer reputation

- **Review Disputes**: Process for disputing unfair or retaliatory reviews

- **Privacy Concerns**: Balance transparency with privacy in reputation displays

- **User Name Changes**: Ensure reputation follows users even if they change their name/profile

- **Impact Threshold**: Define minimum number of reviews before showing certain metrics
