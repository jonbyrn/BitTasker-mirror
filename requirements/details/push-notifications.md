# Push Notifications Implementation Plan

This document outlines the architecture and implementation steps for adding push notifications to BitTasker using Firebase Cloud Messaging (FCM) and Capacitor with GraphQL integration.

## 1. Architecture: Backend-Driven Notifications

We will implement a **backend-driven architecture** for sending push notifications using GraphQL.

### Rationale:

-   **Reliability**: The backend can send notifications even when the user's app is not running. This is essential for timely alerts about new tasks.
-   **Centralized Logic**: All rules for who gets a notification and when are managed in one place, making the system easier to maintain and scale.
-   **Scalability**: The backend can efficiently manage sending notifications to thousands of users.
-   **Security**: Sensitive logic about matching tasks to users remains on the server.
-   **GraphQL Integration**: Leverages our existing GraphQL API for consistent data access patterns.

### Data Flow:

1.  **Device Registration**: The client app gets a unique Push Notification token from FCM upon login.
2.  **Token Storage**: The client sends this token to our backend via GraphQL mutation, which associates it with the user's account.
3.  **Event Trigger**: An event (e.g., new task creation) triggers the notification logic on the backend.
4.  **Notification Logic**: The backend determines if a notification should be sent (e.g., by checking a new task against saved searches).
5.  **Push Notification**: The backend sends a push notification to the relevant user's registered devices via FCM.

## 2. Database Schema

The following tables and fields have been implemented:

**UserDevice table:**
- `id` - Unique device identifier
- `deviceId` - Platform-specific device identifier
- `fcmToken` - Firebase Cloud Messaging token
- `platform` - Device platform (ios, android, web)
- `appVersion` - App version for targeting
- `isActive` - Whether device should receive notifications
- `lastTokenRefresh` - Track when FCM token was last updated
- `lastActiveTime` - Track when device was last active
- `userId` - Foreign key to User table

**UserNotificationPreferences table:**
- `userId` - Foreign key to User table
- `pushTaskMatches` - New task matches saved searches
- `pushBidUpdates` - Bid status changes  
- `pushMessages` - New chat messages
- `pushPayments` - Payment notifications
- `pushSystemUpdates` - System announcements

## 3. Implementation Phases

### Phase 1: Firebase & Capacitor Configuration

1.  **Firebase Project Setup**:
    -   Create a Firebase project if one doesn't exist.
    -   Add **Android**, **iOS**, and **Web** apps to the project.
2.  **Android Configuration**:
    -   Download the `google-services.json` file from Firebase.
    -   Place it in the `android/app/` directory.
3.  **iOS Configuration**:
    -   Download the `GoogleService-Info.plist` file from Firebase.
    -   Add it to the Xcode project in `ios/App/App/`.
4.  **Web Configuration**:
    -   Get the Firebase web app configuration object. This will be used in the SvelteKit client.
5.  **Capacitor Setup**:
    -   Install the Capacitor Push Notifications plugin:
        ```bash
        npm install @capacitor/push-notifications
        ```
    -   Sync the project:
        ```bash
        npx cap sync
        ```

### Phase 2: Client-Side Implementation (SvelteKit)

We will create a dedicated service to handle push notification logic at `src/lib/services/push.service.ts`.

1.  **Create `push.service.ts`**:
    -   **`init()`**: Initialize Firebase (for web) and add listeners for the Capacitor Push Notifications plugin.
    -   **`requestPermissions()`**: Prompt the user to grant permission for notifications.
    -   **`registerDevice()`**: This function will:
        -   Get the FCM registration token.
        -   Use GraphQL mutation to register the device with our backend.
    -   **Event Listeners**:
        -   Handle incoming notifications (`pushNotificationReceived`).
        -   Handle notification taps (`pushNotificationActionPerformed`).
        -   Handle token refresh events.

2.  **GraphQL Integration**:
    -   Create GraphQL operations for device management.
    -   Integrate with Houdini for GraphQL client functionality.

3.  **Integrate into the App**:
    -   In the main layout for authenticated users (`src/routes/(protected)/+layout.svelte`), call the `push.service.ts` to initialize and register the device when a user is logged in.
    -   Provide user feedback (e.g., UI indicators) about notification status.

## 4. GraphQL Operations

### Device Registration

```graphql
mutation RegisterDevice($input: RegisterDeviceInput!) {
  registerDevice(input: $input) {
    id
    deviceId
    platform
    isActive
    fcmToken
  }
}

input RegisterDeviceInput {
  deviceId: String!
  fcmToken: String!
  platform: Platform!
  appVersion: String!
}
```

### Device Management

```graphql
# Get user's devices
query MyDevices {
  myDevices {
    id
    deviceId
    platform
    isActive
    lastActiveTime
  }
}

# Update device information
mutation UpdateDevice($input: UpdateDeviceInput!) {
  updateDevice(input: $input) {
    id
    isActive
  }
}

# Revoke device
mutation RevokeDevice($deviceId: String!) {
  revokeDevice(deviceId: $deviceId) {
    success
    message
  }
}

# Revoke all devices
mutation RevokeAllDevices {
  revokeAllDevices {
    success
    message
  }
}
```

### Testing & Topic Management

```graphql
# Send test notification
mutation SendTestNotification($input: SendTestNotificationInput!) {
  sendTestNotification(input: $input) {
    success
    message
  }
}

# Subscribe to topic
mutation SubscribeToTopic($input: SubscribeToTopicInput!) {
  subscribeToTopic(input: $input) {
    success
    message
  }
}

# Unsubscribe from topic
mutation UnsubscribeFromTopic($input: UnsubscribeFromTopicInput!) {
  unsubscribeFromTopic(input: $input) {
    success
    message
  }
}
```

### Notification Preferences

```graphql
# Get notification preferences
query MyNotificationPreferences {
  myNotificationPreferences {
    pushTaskMatches
    pushBidUpdates
    pushMessages
    pushPayments
    pushSystemUpdates
  }
}

# Update notification preferences
mutation UpdateNotificationPreferences($input: NotificationPreferencesInput!) {
  updateNotificationPreferences(input: $input) {
    pushTaskMatches
    pushBidUpdates
    pushMessages
    pushPayments
    pushSystemUpdates
  }
}
```

## 5. Backend Integration Points

The push notification system is automatically integrated with:

- **Saved Searches**: Instant notifications for matching tasks
- **Bid Updates**: Notifications when bid status changes
- **Chat Messages**: Real-time message notifications  
- **Payment Updates**: Transaction and payment notifications
- **System Updates**: Important announcements

### Server-Side Usage Examples

```typescript
// Send notification to specific user
await this.firebasePushService.sendToUser({
  userId: 123,
  payload: {
    title: 'New Task Match!',
    body: 'A task matching your search criteria is available',
    data: { taskId: '456', type: 'task_match' },
    clickAction: '/tasks/456',
  }
});

// Send to topic
await this.firebasePushService.sendToTopic('task-updates', {
  title: 'New Tasks Available',
  body: 'Check out the latest tasks in your area',
  data: { type: 'topic_notification' }
});
```

## 6. Security Features

- **Automatic Token Cleanup**: Invalid/expired FCM tokens are automatically removed
- **User Ownership Validation**: Devices are tied to specific users
- **Granular Preferences**: Users control what notifications they receive
- **Topic Management**: Secure subscription/unsubscription from topics
- **GraphQL Authentication**: All operations require valid user authentication

## 7. Production Deployment

1. Set `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable
2. Ensure Firebase project has Cloud Messaging enabled
3. Configure app credentials for iOS/Android apps
4. Set up HTTPS for web notifications
5. Monitor notification delivery rates in Firebase Console

## 8. Additional Resources

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [FCM HTTP v1 API Reference](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)
- [Capacitor Push Notifications Plugin](https://capacitorjs.com/docs/apis/push-notifications)

---

✅ **Status**: Backend implementation completed with GraphQL support  
🔧 **Next Steps**: Client-side implementation in SvelteKit  
📱 **Platforms**: iOS, Android, Web PWA ready
