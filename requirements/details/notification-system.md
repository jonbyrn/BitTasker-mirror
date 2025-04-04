# Notification System

This document outlines the requirements for implementing the notification system in BitTasker.

## Description

The notification system is responsible for keeping users informed about relevant events and activities on the platform. Notifications include task updates, bid responses, payment confirmations, messages, and system alerts. The system supports multiple delivery channels including in-app notifications, push notifications, email, and SMS.

## 1. Screens

### Notification Center

- **Notification List View**:
  - All notifications with timestamps
  - Read/unread status indicators
  - Category filtering options
  - Clear/mark as read functionality
- **Notification Detail View**:
  - Full notification content
  - Related action buttons
  - Navigation to relevant section

### Notification Settings

- **Channel Preferences**:
  - Toggle settings for each notification channel
  - Time-based delivery rules (quiet hours)
- **Category Preferences**:
  - Granular settings for each notification type
  - Importance level selection

### Real-time Notification Components

- **Toast Notifications**:
  - Brief pop-up notifications
  - Action buttons
  - Auto-dismiss behavior
- **Badge Indicators**:
  - Unread count badges on navigation items
  - Status indicators on relevant UI elements

## 2. Schema

### Notification Type

```typescript
interface Notification {
	id: string;
	userId: string;
	type: 'task_update' | 'bid_response' | 'payment' | 'message' | 'system' | 'security';
	title: string;
	body: string;
	image?: string;
	data?: {
		[key: string]: any; // Additional data relevant to the notification
	};
	action?: {
		type: 'navigation' | 'external_link' | 'function_call';
		payload: string; // URL or function name
	};
	priority: 'low' | 'normal' | 'high' | 'urgent';
	read: boolean;
	delivered: {
		inApp: boolean;
		push?: boolean;
		email?: boolean;
		sms?: boolean;
	};
	createdAt: Date;
	expiresAt?: Date;
}
```

### NotificationPreference Type

```typescript
interface NotificationPreference {
	userId: string;
	channels: {
		inApp: boolean;
		push: boolean;
		email: boolean;
		sms: boolean;
	};
	categories: {
		[category: string]: {
			enabled: boolean;
			channels?: {
				inApp?: boolean;
				push?: boolean;
				email?: boolean;
				sms?: boolean;
			};
			quietHours?: {
				enabled: boolean;
				start: string; // HH:mm format
				end: string; // HH:mm format
				timezone: string;
			};
		};
	};
	quietHours: {
		enabled: boolean;
		start: string; // HH:mm format
		end: string; // HH:mm format
		timezone: string;
	};
	updatedAt: Date;
}
```

### NotificationTemplate Type

```typescript
interface NotificationTemplate {
	id: string;
	type: string;
	title: string;
	body: string;
	defaultChannels: {
		inApp: boolean;
		push: boolean;
		email: boolean;
		sms: boolean;
	};
	emailTemplate?: {
		subject: string;
		html: string;
		text: string;
	};
	smsTemplate?: string;
	variables: string[]; // Variables that can be inserted into the template
	defaultPriority: 'low' | 'normal' | 'high' | 'urgent';
	createdAt: Date;
	updatedAt: Date;
}
```

## 3. APIs

### Notification Management

- `GET /api/notifications` - Get user notifications

  - Query params: Pagination, filters (read/unread, type)
  - Returns: Array of notifications

- `PATCH /api/notifications/{notificationId}` - Update notification status

  - Body: Updated fields (e.g., read status)
  - Returns: Updated notification

- `DELETE /api/notifications/{notificationId}` - Delete a notification

  - Returns: Success status

- `POST /api/notifications/read-all` - Mark all as read
  - Body: Optional filters (type)
  - Returns: Success status and count

### Notification Preferences

- `GET /api/notification-preferences` - Get user preferences

  - Returns: NotificationPreference object

- `PUT /api/notification-preferences` - Update preferences
  - Body: Updated preference settings
  - Returns: Updated preferences

### Admin APIs

- `GET /api/admin/notification-templates` - Get templates (admin only)

  - Query params: Pagination, search
  - Returns: Array of templates

- `POST /api/admin/notification-templates` - Create template (admin only)

  - Body: Template details
  - Returns: Created template

- `PUT /api/admin/notification-templates/{templateId}` - Update template (admin only)
  - Body: Updated template
  - Returns: Updated template

## 4. Dependencies

- Push notification service (e.g., Firebase Cloud Messaging)
- Email service provider
- SMS gateway service
- Real-time messaging service (WebSockets/Socket.io)
- Template rendering engine
- Message queue service

## 5. Services

### Frontend Services

- `NotificationService`:
  - Methods for fetching and managing notifications
  - Notification status updates
  - Real-time notification handling
- `PushNotificationService`:
  - Device registration management
  - Push notification permission handling
  - Push notification display

### Backend Services

- `NotificationManagerService`:
  - Create and store notifications
  - Dispatch to appropriate delivery services
  - Handle notification expiration
- `NotificationDeliveryService`:
  - Channel-specific delivery handling
  - Delivery status tracking
  - Retry mechanisms
- `NotificationTemplateService`:
  - Template management and rendering
  - Variable substitution
  - Localization support

## 6. Edge Cases

- **Notification Overload**: Handle situation when users receive too many notifications in short period

- **Offline Handling**: Store notifications for delivery when user comes back online

- **Failed Delivery**: Retry logic for failed push/email/SMS deliveries

- **Notification Expiry**: Automatically remove or archive outdated notifications

- **Cross-Device Sync**: Ensure read status syncs across user's devices

- **Rate Limiting**: Prevent notification spam, especially for system notifications

- **Delivery Timing**: Respect user's timezone and quiet hours for non-urgent notifications

- **Deep Linking**: Handle navigation to the right screen when notification is tapped

- **Template Updates**: Version control for notification templates to avoid breaking changes

- **Large Scale Events**: Handle mass notifications for system-wide announcements efficiently

## 7. Test Plan

### Unit Tests

#### NotificationService Tests

- Test notification creation with valid parameters
- Test notification validation for all required fields
- Test notification priority assignment
- Test notification expiration logic
- Test notification type classification
- Test notification template rendering
- Test variable substitution in notification templates

#### NotificationDeliveryService Tests

- Test channel selection based on user preferences
- Test delivery status tracking
- Test retry logic for failed deliveries
- Test quiet hours enforcement
- Test rate limiting implementation
- Test channel-specific formatting
- Test handling of delivery failures

#### NotificationPreferenceService Tests

- Test preference creation and retrieval
- Test default preference assignment
- Test preference updating
- Test preference validation
- Test category-specific override handling
- Test quiet hours configuration

### Integration Tests

#### Push Notification Tests

- Test FCM/APNS integration
- Test device token management
- Test notification delivery to multiple device types
- Test deep linking functionality
- Test notification interaction tracking
- Test handling of expired device tokens

#### Email Notification Tests

- Test email delivery through provider
- Test email template rendering
- Test email tracking (opens, clicks)
- Test email throttling
- Test handling of bounced emails
- Test unsubscribe functionality

#### SMS Notification Tests

- Test SMS delivery through gateway
- Test SMS character limit handling
- Test international number formatting
- Test SMS delivery status tracking
- Test opt-out functionality

#### Real-time Notification Tests

- Test WebSocket delivery
- Test reconnection handling
- Test notification queue management
- Test notification ordering
- Test real-time status synchronization

### Component Tests

#### Notification UI Tests

- Test notification list rendering
- Test notification filtering
- Test read/unread status toggling
- Test notification grouping
- Test notification actions
- Test badge count accuracy
- Test toast notification display and dismissal

#### Notification Settings UI Tests

- Test preference toggles functionality
- Test category preference UI
- Test quiet hours selection
- Test channel preference changes
- Test preference saving and application

### End-to-End Tests

- Test complete notification flow from trigger to delivery
- Test notification interaction and resulting actions
- Test cross-device notification synchronization
- Test notification preference changes affecting delivery
- Test notification delivery across all channels

### Performance Tests

- Test notification system under high load
- Test batch notification processing
- Test real-time delivery latency
- Test database scaling with large notification volumes
- Test notification retrieval with pagination
- Test template rendering performance

### Security Tests

- Test notification access control
- Test notification data sanitization
- Test prevention of notification spoofing
- Test channel verification (email, SMS)
- Test notification data encryption

### Stress Tests

- Test system behavior when queue is backed up
- Test recovery from service outages
- Test handling of notification storms
- Test graceful degradation under extreme load
