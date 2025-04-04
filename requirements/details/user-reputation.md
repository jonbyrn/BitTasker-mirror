# User Reputation System

This document outlines the requirements for implementing the user reputation system in BitTasker.

## Description

The user reputation system tracks and displays user reliability, skill levels, and trustworthiness based on their platform activities and interactions. This system helps users make informed decisions when selecting task providers or accepting bids from task seekers.

## 1. Screens

### Profile Reputation Display

- **Reputation Summary**:
  - Overall reputation score/rating
  - Visual indicators (stars, badges, levels)
  - Verification status badges
  - Experience level indicators
- **Detailed Reputation View**:
  - Category-specific ratings
  - Historical rating progression
  - Activity statistics (tasks completed, etc.)
  - Client/provider specific metrics

### Reputation Components

- **Review Collection Component**:
  - Star/numerical rating input
  - Category-specific rating options
  - Written review submission
  - Photo/evidence upload option
- **Reputation Badge Component**:
  - Achievement badges display
  - Badge details and criteria
  - Progress towards next badge

## 2. Schema

### UserReputation Type

```typescript
interface UserReputation {
	userId: string;
	overallScore: number; // 0-5 scale with decimals
	metrics: {
		reliability: number;
		quality: number;
		communication: number;
		professionalism: number;
		value: number;
	};
	categoryScores: {
		[category: string]: number; // Category-specific scores
	};
	activityMetrics: {
		tasksCompleted: number;
		tasksPosted: number;
		completionRate: number;
		responseRate: number;
		averageResponseTime: number; // In minutes
	};
	verifications: {
		identityVerified: boolean;
		phoneVerified: boolean;
		emailVerified: boolean;
		paymentMethodVerified: boolean;
		addressVerified: boolean;
		governmentIdVerified: boolean;
	};
	badges: {
		id: string;
		name: string;
		description: string;
		dateEarned: Date;
		category: string;
		level: 'bronze' | 'silver' | 'gold' | 'platinum';
	}[];
	level: {
		current: number;
		pointsToNextLevel: number;
		title: string;
	};
	ratingCount: number;
	updatedAt: Date;
}
```

### Review Type

```typescript
interface Review {
	id: string;
	taskId: string;
	reviewerId: string; // User giving the review
	revieweeId: string; // User receiving the review
	role: 'provider' | 'client'; // Role of the reviewee
	overallRating: number; // 0-5 scale
	metrics: {
		reliability: number;
		quality: number;
		communication: number;
		professionalism: number;
		value: number;
	};
	comment: string;
	reply?: string;
	images?: string[]; // URLs to uploaded images
	isPublic: boolean;
	helpful: {
		count: number;
		userIds: string[];
	};
	reported: {
		count: number;
		reasons: {
			userId: string;
			reason: string;
			timestamp: Date;
		}[];
	};
	createdAt: Date;
	updatedAt: Date;
}
```

### ReputationEvent Type

```typescript
interface ReputationEvent {
	id: string;
	userId: string;
	type:
		| 'review_received'
		| 'task_completed'
		| 'verification'
		| 'dispute_resolved'
		| 'badge_earned'
		| 'level_up'
		| 'milestone_reached'
		| 'manual_adjustment';
	impact: number; // Positive or negative impact on reputation
	details: {
		[key: string]: any; // Event-specific details
	};
	adminId?: string; // For manual adjustments
	reason?: string; // For manual adjustments
	createdAt: Date;
}
```

## 3. APIs

### Reputation Management

- `GET /api/users/{userId}/reputation` - Get user reputation

  - Returns: UserReputation object

- `GET /api/users/{userId}/reviews` - Get reviews for a user

  - Query params: Pagination, filters (rating, as provider/client)
  - Returns: Array of Review objects

- `POST /api/tasks/{taskId}/reviews` - Submit a review
  - Body: Review details
  - Returns: Created Review object

### Review Management

- `PUT /api/reviews/{reviewId}` - Update a review (only within time window)

  - Body: Updated review fields
  - Returns: Updated Review object

- `POST /api/reviews/{reviewId}/reply` - Reply to a review

  - Body: Reply text
  - Returns: Updated Review object

- `POST /api/reviews/{reviewId}/helpful` - Mark review as helpful

  - Returns: Updated helpful count

- `POST /api/reviews/{reviewId}/report` - Report a review
  - Body: Reason for reporting
  - Returns: Acknowledgement

### Admin APIs

- `POST /api/admin/users/{userId}/reputation/adjust` - Manual adjustment (admin only)

  - Body: Adjustment details and reason
  - Returns: Updated UserReputation object

- `DELETE /api/admin/reviews/{reviewId}` - Remove inappropriate review (admin only)
  - Returns: Success message

## 4. Dependencies

- Rating and review components
- Badge and achievement framework
- User verification services
- Data analytics for reputation calculation
- Notification service for reputation updates

## 5. Services

### Frontend Services

- `ReputationDisplayService`:
  - Format and display reputation data
  - Handle badge and level visuals
  - Reputation history charts
- `ReviewSubmissionService`:
  - Review form handling
  - Image upload for reviews
  - Validation and submission

### Backend Services

- `ReputationCalculationService`:
  - Calculate overall and category reputation
  - Process new reviews and events
  - Update reputation metrics
- `BadgeManagementService`:
  - Track progress towards badges
  - Award badges when criteria met
  - Handle badge levels and upgrades
- `ReviewManagementService`:
  - Store and retrieve reviews
  - Handle review updates and replies
  - Process review reports

## 6. Edge Cases

- **New Users**: Special handling for users with no reputation history

- **Disputed Reviews**: Process for handling contested or disputed reviews

- **Fraudulent Reviews**: Detection and handling of fake or manipulated reviews

- **Reputation Recovery**: Mechanisms for users to recover from negative reputation

- **Inactive Users**: How reputation ages for users inactive for extended periods

- **Category Migration**: Handling when users switch to new service categories

- **Review Bombing**: Protection against coordinated negative review campaigns

- **Cultural Differences**: Adjustments for different cultural expectations in ratings

- **Privacy Concerns**: Balance between transparency and user privacy

- **Incentivized Reviews**: Detection and handling of incentivized positive reviews

## 7. Test Plan

### Unit Tests

#### ReputationCalculationService Tests

- Test overall reputation score calculation accuracy
- Test category-specific score calculations
- Test reputation impact of different event types
- Test level progression calculations
- Test badge awarding criteria
- Test reputation decay algorithms
- Test weighted average calculations for different metrics

#### ReviewManagementService Tests

- Test review creation with valid parameters
- Test review validation rules
- Test review update restrictions
- Test review reply functionality
- Test helpful vote counting
- Test report handling mechanism
- Test review filtering and sorting

#### BadgeManagementService Tests

- Test badge awarding logic for all badge types
- Test progress tracking towards badges
- Test badge level progression
- Test notification generation for badge awards
- Test badge display priority algorithms
- Test badge data serialization

### Integration Tests

#### Reputation Flow Tests

- Test end-to-end reputation updates after completed task
- Test reputation changes from multiple review sources
- Test verification impact on overall reputation
- Test dispute resolution impact on reputation
- Test milestone achievement impact on reputation
- Test reputation synchronization across services

#### Review Flow Tests

- Test complete review submission flow
- Test review editing time window enforcement
- Test review response workflow
- Test helpful/not helpful voting flow
- Test review reporting and moderation
- Test review visibility based on privacy settings

#### Badge and Level Tests

- Test badge earning through various user activities
- Test level progression with accumulated reputation
- Test benefits unlocking at different reputation levels
- Test reputation events triggering appropriate badges
- Test multi-requirement badge award logic

### Component Tests

#### Reputation UI Tests

- Test reputation summary component display
- Test detailed reputation metrics visualization
- Test badge display component
- Test level progression indicators
- Test reputation history charts
- Test category comparison visualizations

#### Review UI Tests

- Test review form submission
- Test star rating component
- Test review display component
- Test helpful/report buttons functionality
- Test review filtering and sorting UI
- Test review reply interface

### Security Tests

- Test review submission authentication
- Test reputation data access controls
- Test admin reputation adjustment audit trail
- Test prevention of self-reviews
- Test prevention of duplicate reviews
- Test rate limiting for review submissions

### Performance Tests

- Test reputation calculation with large user history
- Test review loading performance with pagination
- Test badge processing with many simultaneous users
- Test reputation update speed under load
- Test review search and filtering performance

### Analytics Tests

- Test accuracy of reputation trend analysis
- Test category performance insights
- Test reputation comparison algorithms
- Test anomaly detection in review patterns
- Test effectiveness of reputation as quality predictor

### Regression Tests

- Test reputation consistency after system updates
- Test backwards compatibility with historical data
- Test resilience against edge case user behaviors
- Test handling of legacy reputation calculations
- Test cross-service reputation integrity

### A/B Testing Framework

- Test different reputation display formats
- Test alternative review collection methods
- Test varied badge earning thresholds
- Test alternative level progression speeds
- Test impact of different reputation weighting algorithms
