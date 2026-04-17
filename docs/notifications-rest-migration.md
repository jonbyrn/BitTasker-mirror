# Notifications — GraphQL to REST Migration Guide

The backend has removed its GraphQL layer entirely. All notification-related operations that were previously accessed through GraphQL mutations/queries are now available as standard REST endpoints under `/api/v1/notifications`.

All endpoints follow the existing API conventions:

- **Base URL**: `/api/v1/notifications`
- **Authentication**: Bearer token in `Authorization` header (same JWT as other REST endpoints)
- **Content-Type**: `application/json`

---

## Authentication

All endpoints require a valid JWT passed as a Bearer token:

```
Authorization: Bearer <your_jwt_token>
```

The server resolves the current user's identity from the JWT — **you never need to pass a `userId` in the request body or URL**. The guard extracts the authenticated user automatically.

> Every request must also include the `X-Device-ID` header (the same device ID you registered), as the JWT guard validates that the calling device has not been revoked.

---

## Queries (GET)

### `myDevices` → `GET /api/v1/notifications/devices`

Returns all registered devices for the authenticated user.

**Before (GraphQL):**

```graphql
query {
	myDevices {
		id
		userId
		deviceId
		deviceName
		platform
		fcmToken
		appVersion
		isActive
		createdAt
		updatedAt
		lastUsedAt
		revokedAt
		pushToken
		credentialId
		lastTokenRefresh
	}
}
```

**After (REST):**

```http
GET /api/v1/notifications/devices
Authorization: Bearer <token>
```

**Response:** Array of device objects with the same fields.

---

### `myNotificationPreferences` → `GET /api/v1/notifications/preferences`

Returns notification preferences for the authenticated user (currently returns `null` — not yet implemented).

**Before (GraphQL):**

```graphql
query {
	myNotificationPreferences {
		id
		userId
		email
		inApp
		push
		pushTaskMatches
		pushBidUpdates
		pushMessages
		pushPayments
		pushSystemUpdates
		createdAt
		updatedAt
	}
}
```

**After (REST):**

```http
GET /api/v1/notifications/preferences
Authorization: Bearer <token>
```

---

## Mutations (POST / PATCH / DELETE)

### `registerDevice` → `POST /api/v1/notifications/devices`

Register or update a device for push notifications.

**Before (GraphQL):**

```graphql
mutation RegisterDevice($input: RegisterDeviceInput!) {
	registerDevice(input: $input) {
		id
		deviceId
		fcmToken
		platform
		isActive
	}
}
```

```json
{
	"input": {
		"fcmToken": "FCM_TOKEN_HERE",
		"platform": "ANDROID",
		"deviceId": "unique-device-id",
		"deviceName": "My Phone",
		"appVersion": "1.0.0"
	}
}
```

**After (REST):**

```http
POST /api/v1/notifications/devices
Authorization: Bearer <token>
Content-Type: application/json

{
  "fcmToken": "FCM_TOKEN_HERE",
  "platform": "android",
  "deviceId": "unique-device-id",
  "deviceName": "My Phone",
  "appVersion": "1.0.0"
}
```

> **Note:** `platform` must be one of: `"ios"` | `"android"` | `"web"` (lowercase strings).

**Response:** The registered/updated device object.

---

### `updateDevice` → `PATCH /api/v1/notifications/devices/:deviceId`

Update device information.

**Before (GraphQL):**

```graphql
mutation UpdateDevice($deviceId: String!, $input: UpdateDeviceInput!) {
	updateDevice(deviceId: $deviceId, input: $input) {
		id
		deviceId
		fcmToken
		isActive
	}
}
```

**After (REST):**

```http
PATCH /api/v1/notifications/devices/unique-device-id
Authorization: Bearer <token>
Content-Type: application/json

{
  "fcmToken": "NEW_FCM_TOKEN",
  "isActive": true,
  "deviceName": "My Updated Phone",
  "appVersion": "1.1.0"
}
```

All fields are optional. Only include the ones you want to update.

**Response:** The updated device object.

---

### `updateDeviceActivity` → `PATCH /api/v1/notifications/devices/:deviceId/activity`

Update the last-active timestamp of a device (heartbeat).

**Before (GraphQL):**

```graphql
mutation UpdateDeviceActivity($deviceId: String!) {
	updateDeviceActivity(deviceId: $deviceId) {
		success
		message
	}
}
```

**After (REST):**

```http
PATCH /api/v1/notifications/devices/unique-device-id/activity
Authorization: Bearer <token>
```

**Response:**

```json
{ "success": true, "message": "Device activity updated" }
```

---

### `revokeDevice` → `DELETE /api/v1/notifications/devices/:deviceId`

Revoke (unregister) a specific device.

**Before (GraphQL):**

```graphql
mutation RevokeDevice($deviceId: String!) {
	revokeDevice(deviceId: $deviceId) {
		success
		message
	}
}
```

**After (REST):**

```http
DELETE /api/v1/notifications/devices/unique-device-id
Authorization: Bearer <token>
```

**Response:**

```json
{ "success": true, "message": "Device revoked successfully" }
```

---

### `revokeAllDevices` → `DELETE /api/v1/notifications/devices`

Revoke all devices for the current user (logout from all devices).

**Before (GraphQL):**

```graphql
mutation {
	revokeAllDevices {
		success
		message
	}
}
```

**After (REST):**

```http
DELETE /api/v1/notifications/devices
Authorization: Bearer <token>
```

**Response:**

```json
{ "success": true, "message": "3 devices revoked successfully" }
```

---

### `sendNotification` → `POST /api/v1/notifications/send`

Send a push notification to the current user's device(s).

**Before (GraphQL):**

```graphql
mutation SendNotification($input: SendNotificationInput!) {
	sendNotification(input: $input) {
		success
		message
	}
}
```

```json
{
	"input": {
		"title": "Hello",
		"body": "You have a new message",
		"deviceId": "optional-specific-device-id",
		"type": "message"
	}
}
```

**After (REST):**

```http
POST /api/v1/notifications/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Hello",
  "body": "You have a new message",
  "deviceId": "optional-specific-device-id",
  "type": "message"
}
```

**Response:**

```json
{ "success": true, "message": "Notification sent successfully" }
```

---

### `subscribeToTopic` → `POST /api/v1/notifications/topics/subscribe`

Subscribe the current user's devices to a Firebase topic.

**Before (GraphQL):**

```graphql
mutation SubscribeToTopic($input: SubscribeToTopicInput!) {
	subscribeToTopic(input: $input) {
		success
		message
	}
}
```

```json
{ "input": { "topic": "announcements" } }
```

**After (REST):**

```http
POST /api/v1/notifications/topics/subscribe
Authorization: Bearer <token>
Content-Type: application/json

{ "topic": "announcements" }
```

**Response:**

```json
{ "success": true, "message": "Subscribed to topic \"announcements\" successfully" }
```

---

### `unsubscribeFromTopic` → `POST /api/v1/notifications/topics/unsubscribe`

Unsubscribe the current user's devices from a Firebase topic.

**Before (GraphQL):**

```graphql
mutation UnsubscribeFromTopic($input: SubscribeToTopicInput!) {
	unsubscribeFromTopic(input: $input) {
		success
		message
	}
}
```

**After (REST):**

```http
POST /api/v1/notifications/topics/unsubscribe
Authorization: Bearer <token>
Content-Type: application/json

{ "topic": "announcements" }
```

---

### `sendNotificationToNpubs` → `POST /api/v1/notifications/send/npubs`

Send push notifications to users identified by their Nostr public keys.

**Before (GraphQL):**

```graphql
mutation SendNotificationToNpubs($input: SendNotificationToNpubsInput!) {
	sendNotificationToNpubs(input: $input) {
		overallSuccess
		message
		totalTargets
		successfulTargets
		totalDevices
		successfulDevices
		results {
			npub
			success
			error
			deviceCount
			successfulDevices
		}
	}
}
```

```json
{
	"input": {
		"title": "New Task Available",
		"body": "A task matching your skills was posted",
		"npubs": ["npub1abc...", "npub1def..."],
		"type": "task_match",
		"icon": "https://example.com/icon.png",
		"clickAction": "/tasks/123"
	}
}
```

**After (REST):**

```http
POST /api/v1/notifications/send/npubs
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New Task Available",
  "body": "A task matching your skills was posted",
  "npubs": ["npub1abc...", "npub1def..."],
  "type": "task_match",
  "icon": "https://example.com/icon.png",
  "clickAction": "/tasks/123"
}
```

**Response:**

```json
{
	"overallSuccess": true,
	"message": "Sent notifications to 2/2 targets (3/3 devices)",
	"totalTargets": 2,
	"successfulTargets": 2,
	"totalDevices": 3,
	"successfulDevices": 3,
	"results": [
		{
			"npub": "npub1abc...",
			"success": true,
			"error": null,
			"deviceCount": 2,
			"successfulDevices": 2
		}
	]
}
```

---

### `sendNotificationToDevice` → `POST /api/v1/notifications/send/device`

Send a push notification directly to a specific device by its `deviceId`.

**Before (GraphQL):**

```graphql
mutation SendNotificationToDevice($input: SendNotificationToDeviceInput!) {
	sendNotificationToDevice(input: $input) {
		deviceId
		success
		error
		npub
	}
}
```

```json
{
	"input": {
		"title": "Test",
		"body": "Direct device notification",
		"deviceId": "unique-device-id",
		"type": "test",
		"icon": "https://example.com/icon.png",
		"clickAction": "/dashboard"
	}
}
```

**After (REST):**

```http
POST /api/v1/notifications/send/device
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Test",
  "body": "Direct device notification",
  "deviceId": "unique-device-id",
  "type": "test",
  "icon": "https://example.com/icon.png",
  "clickAction": "/dashboard"
}
```

**Response:**

```json
{
	"deviceId": "unique-device-id",
	"success": true,
	"error": null,
	"npub": "npub1abc..."
}
```

---

## Complete Endpoint Reference

| Old GraphQL Operation               | HTTP Method | New REST Endpoint                                  |
| ----------------------------------- | ----------- | -------------------------------------------------- |
| `query myDevices`                   | `GET`       | `/api/v1/notifications/devices`                    |
| `query myNotificationPreferences`   | `GET`       | `/api/v1/notifications/preferences`                |
| `mutation registerDevice`           | `POST`      | `/api/v1/notifications/devices`                    |
| `mutation updateDevice`             | `PATCH`     | `/api/v1/notifications/devices/:deviceId`          |
| `mutation updateDeviceActivity`     | `PATCH`     | `/api/v1/notifications/devices/:deviceId/activity` |
| `mutation revokeDevice`             | `DELETE`    | `/api/v1/notifications/devices/:deviceId`          |
| `mutation revokeAllDevices`         | `DELETE`    | `/api/v1/notifications/devices`                    |
| `mutation sendNotification`         | `POST`      | `/api/v1/notifications/send`                       |
| `mutation subscribeToTopic`         | `POST`      | `/api/v1/notifications/topics/subscribe`           |
| `mutation unsubscribeFromTopic`     | `POST`      | `/api/v1/notifications/topics/unsubscribe`         |
| `mutation sendNotificationToNpubs`  | `POST`      | `/api/v1/notifications/send/npubs`                 |
| `mutation sendNotificationToDevice` | `POST`      | `/api/v1/notifications/send/device`                |

---

## Removing the Apollo/GraphQL Client

Since the GraphQL endpoint (`/graph`) no longer exists, you should remove the Apollo client setup from the frontend.

### Steps

1. **Remove Apollo client packages** (if not used elsewhere):

   ```bash
   npm uninstall @apollo/client graphql
   # or
   yarn remove @apollo/client graphql
   ```

2. **Delete `.gql` operation files** — the mutation/query `.gql` files shown in the screenshot can be deleted:

   - `mutation/notifications/RegisterDevice.gql`
   - `mutation/notifications/RevokeAllDevices.gql`
   - `mutation/notifications/RevokeDevice.gql`
   - `mutation/notifications/SendNotification.gql`
   - `mutation/notifications/SendNotificationToDevice.gql`
   - `mutation/notifications/SendNotificationToNpubs.gql`
   - `mutation/notifications/SubscribeToTopic.gql`
   - `mutation/notifications/UnsubscribeFromTopic.gql`
   - `mutation/notifications/UpdateDevice.gql`
   - `mutation/notifications/UpdateDeviceActivity.gql`
   - `query/notifications/MyDevices.gql`
   - `query/notifications/MyNotificationPreferences.gql`

3. **Replace Apollo hooks** with standard `fetch` / `axios` calls, for example:

   **Before:**

   ```typescript
   import { useMutation } from '@apollo/client';
   import REGISTER_DEVICE from './mutation/notifications/RegisterDevice.gql';

   const [registerDevice] = useMutation(REGISTER_DEVICE);
   await registerDevice({ variables: { input: { fcmToken, platform, deviceId } } });
   ```

   **After:**

   ```typescript
   await fetch('/api/v1/notifications/devices', {
   	method: 'POST',
   	headers: {
   		Authorization: `Bearer ${token}`,
   		'Content-Type': 'application/json'
   	},
   	body: JSON.stringify({ fcmToken, platform, deviceId })
   });
   ```

4. **Remove the Apollo Provider wrapper** from your app root if no other queries/mutations remain.
