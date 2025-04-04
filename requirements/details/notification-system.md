# Notification System

This document outlines the requirements for implementing the notification system in BitTasker.

## Description

The notification system keeps users informed about important events related to their tasks, bids, messages, and payments. It supports both in-app notifications and external notifications via email and push notifications.

## 1. Screens

### Notification Center Screen
- **Notification List**:
  - Chronological list of notifications
  - Unread/read status indicators
  - Category-based grouping (tasks, bids, messages, payments)
  - Mark as read/unread options
  - Delete notification option
  
- **Notification Settings Screen**:
  - Toggle for each notification type
  - Email notification preferences
  - Push notification preferences
  - Notification frequency settings

### Notification Components
- **Notification Badge**:
  - Unread count indicator on navigation elements
  - Red dot for new notifications
  
- **Notification Toast/Pop-up**:
  - Brief overlay for real-time notifications
  - Actionable buttons where relevant
  - Auto-dismiss with option to keep open

## 2. Schema

### Notification Type
```typescript
interface Notification {
  id: string;
  userId: string;
  type: 'task_update' | 'new_bid' | 'bid_accepted' | 'new_message' | 'payment' | 'review' | 'system';
  title: string;
  content: string;
  read: boolean;
  actionUrl?: string; // Deep link to relevant page
  relatedId?: string; // ID of related entity (task, bid, etc.)
  metadata?: {
    taskId?: string;
    bidId?: string;
    messageId?: string;
    paymentId?: string;
    reviewId?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### NotificationSettings Type
```typescript
interface NotificationSettings {
  userId: string;
  email: {
    enabled: boolean;
    taskUpdates: boolean;
    newBids: boolean;
    bidResponses: boolean;
    messages: boolean;
    payments: boolean;
    reviews: boolean;
    marketingUpdates: boolean;
  };
  push: {
    enabled: boolean;
    taskUpdates: boolean;
    newBids: boolean;
    bidResponses: boolean;
    messages: boolean;
    payments: boolean;
    reviews: boolean;
  };
  inApp: {
    taskUpdates: boolean;
    newBids: boolean;
    bidResponses: boolean;
    messages: boolean;
    payments: boolean;
    reviews: boolean;
  };
}
```

## 3. APIs

### Notification Management
- `GET /api/notifications` - Get user notifications
  - Query params: Pagination, filters (type, read status)
  - Returns: Array of Notification objects

- `GET /api/notifications/unread-count` - Get count of unread notifications
  - Returns: `{ count: number }`

- `PUT /api/notifications/{notificationId}/read` - Mark notification as read
  - Returns: Updated Notification object

- `PUT /api/notifications/read-all` - Mark all notifications as read
  - Query params: Optional type filter
  - Returns: Success message

- `DELETE /api/notifications/{notificationId}` - Delete a notification
  - Returns: Success message

### Notification Settings
- `GET /api/notification-settings` - Get user's notification settings
  - Returns: NotificationSettings object

- `PUT /api/notification-settings` - Update notification settings
  - Body: Settings fields to update
  - Returns: Updated NotificationSettings object

### Push Notification
- `POST /api/push-token` - Register device for push notifications
  - Body: `{ token, deviceType }`
  - Returns: Success message

## 4. Dependencies

- Push notification service (e.g., Firebase Cloud Messaging, OneSignal)
- Email delivery service (e.g., SendGrid, Mailgun)
- WebSocket library for real-time notifications (e.g., Socket.io)
- Service worker support for web push notifications

## 5. Services

### Frontend Services
- `NotificationService`:
  - Methods for fetching and managing notifications
  - Real-time notification handling
  - Badge count updates
  
- `PushNotificationService`:
  - Device registration
  - Permission handling
  - Token management

### Backend Services
- `NotificationManagementService`:
  - Create and store notifications
  - Track read/unread status
  - Handle notification settings
  
- `NotificationDispatchService`:
  - Send notifications via appropriate channels (in-app, email, push)
  - Batch notifications when appropriate
  - Handle delivery failures
  
- `EventListenerService`:
  - Listen for system events that trigger notifications
  - Format notification content based on event type
  - Apply user notification preferences

## 6. Edge Cases

- **Notification Overload**: Implement throttling to prevent overwhelming users with too many notifications
  
- **Failed Delivery**: Handle retry logic for failed push/email notifications

- **Device Changes**: Support for users switching devices or using multiple devices

- **Time Sensitivity**: Prioritize time-sensitive notifications (e.g., bid about to expire)

- **Notification Grouping**: Consolidate similar notifications to reduce clutter

- **Offline Handling**: Queue notifications when users are offline

- **Silent Updates**: Allow certain notifications to update silently without creating new entries

- **Deep Linking**: Ensure notifications can direct users to the exact relevant screen

- **User Timezone**: Send notifications at appropriate times based on user's timezone

- **Language Support**: Localize notification content for international users 