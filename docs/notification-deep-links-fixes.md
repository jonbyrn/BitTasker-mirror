# Notification Deep Links & Native Notifications - Fixes

## Issues Fixed

### 1. Deep Link Navigation Not Working
**Problem**: When users tapped notifications on Android, the notification disappeared but the app didn't open or navigate to the correct screen.

**Solution**: 
- Updated notification data handling to use SvelteKit's `goto()` function instead of `window.location.href`
- Added proper deep link listener using Capacitor's App plugin
- Updated FCM service worker navigation handler to use SvelteKit navigation
- Added Android intent filters for deep link handling

### 2. Native Notifications Not Properly Handled
**Problem**: In-app notifications were only showing as toasts instead of proper native notifications in the notification bar.

**Solution**:
- Improved foreground notification handling to let the system show native notifications
- Enhanced notification action handling with proper async methods
- Added better logging for debugging notification flow

## Code Changes

### Push Notification Service Updates

1. **Added proper imports**:
   ```typescript
   import { App } from '@capacitor/app';
   import { LocalNotifications } from '@capacitor/local-notifications';
   import { goto } from '$app/navigation';
   import { browser } from '$app/environment';
   import { triggerNotificationNavigation } from '$lib/stores/navigation.store';
   ```

2. **Improved navigation handling**:
   - Uses navigation store system for reliable native navigation
   - `triggerNotificationNavigation()` stores navigation request
   - Main layout listens to store and executes navigation from proper context
   - Backup direct navigation with timeout as fallback

3. **Added deep link listener**:
   - Listens for `appUrlOpen` events from Capacitor App plugin
   - Parses URLs and navigates to the correct internal routes
   - Handles both custom schemes and HTTPS URLs

4. **Enhanced notification handlers**:
   - Better logging for debugging
   - Proper async/await patterns
   - Improved error handling

5. **Local Notifications for Foreground**:
   - Added `@capacitor/local-notifications` plugin
   - Creates native notifications in foreground on Android
   - Android notification channel creation
   - Safe notification ID generation (Java int compatible)
   - Proper permission handling

6. **Navigation Store System**:
   - Created notification navigation store for reliable context switching
   - Main layout handles navigation from proper SvelteKit context
   - Prevents navigation issues in notification callback contexts

### Android Configuration

1. **Added intent filters in AndroidManifest.xml**:
   ```xml
   <!-- Intent filter for deep links from notifications -->
   <intent-filter android:autoVerify="true">
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="https" 
             android:host="@string/app_domain" />
   </intent-filter>

   <!-- Intent filter for custom URL scheme -->
   <intent-filter>
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="bittasker" />
   </intent-filter>
   ```

2. **Added app domain in strings.xml**:
   ```xml
   <string name="app_domain">app.bittasker.com</string>
   ```

### FCM Helper Updates

- Updated service worker navigation handler to use SvelteKit `goto()`
- Added proper error handling and fallback to `window.location.href`
- Improved logging for debugging

## Notification Data Format

Your backend should send notifications with proper data structure:

```json
{
  "notification": {
    "title": "New Bid Received",
    "body": "You have a new bid on your task"
  },
  "data": {
    "type": "new_bid",
    "taskId": "123",
    "clickAction": "/dashboard/task/123"
  }
}
```

Supported notification types:
- `task_match` - navigates to `/dashboard/find-tasks`
- `new_bid` - navigates to `/dashboard/task/{taskId}`
- `message` - navigates to `/dashboard/messages/to/{conversationId}`
- `task_update` - navigates to `/dashboard/task/{taskId}`
- Custom URL via `url` field

## Testing Instructions

### 1. Install and Sync
```bash
npm install @capacitor/local-notifications
npx cap sync
npm run build
npx cap run android
```

> **Note**: Android 13+ requires explicit notification permission. The app will automatically request this permission when needed.

### 2. Test Background Notifications
1. Send a push notification to the device
2. Ensure the app is in the background or closed
3. Tap the notification
4. The app should open and navigate to the correct screen

### 3. Test Foreground Notifications
1. Keep the app open and in the foreground
2. Send a push notification
3. You should see both:
   - A toast message in the app
   - The notification in the Android notification bar
4. Tap the notification in the notification bar
5. The app should navigate to the correct screen

### 4. Test Deep Links Directly
You can test deep links directly using ADB:

```bash
# Test custom scheme
adb shell am start -W -a android.intent.action.VIEW -d "bittasker://dashboard/task/123" com.bittasker.app

# Test HTTPS scheme
adb shell am start -W -a android.intent.action.VIEW -d "https://app.bittasker.com/dashboard/task/123" com.bittasker.app
```

### 5. Debug Logging
Check the console logs for these key messages:
- `📱 Handling notification data:` - Shows notification data processing
- `🎯 Navigating to:` - Shows target navigation URL
- `🔗 App opened with URL:` - Shows deep link handling
- `📍 Navigating to deep link path:` - Shows parsed path navigation

## Troubleshooting

### Notifications not opening app
1. Check that notifications include proper `data` field
2. Verify Android intent filters are correctly configured
3. Ensure the app is properly signed and installed

### App opens but doesn't navigate
1. Check console logs for navigation errors
2. Verify the target route exists in your SvelteKit app
3. Check that the notification data format matches expected structure

### Foreground notifications not showing in notification bar
1. Verify notification permissions are granted
2. Check that the notification service is properly configured
3. Ensure the app is not preventing default notification behavior

### "The identifier should be a Java int" error
1. This occurs when notification IDs exceed Java's maximum integer value
2. Fixed by using safe ID generation within the 2,147,483,647 limit
3. The app now uses a counter + random approach for unique IDs

### Local notifications not working
1. Ensure `@capacitor/local-notifications` plugin is installed
2. Check that notification permissions are granted on Android 13+
3. Verify notification channel is properly created on Android

## Next Steps

1. **iOS Configuration**: Add similar intent filters for iOS in `Info.plist` if needed
2. **Universal Links**: Consider implementing Universal Links for better deep link handling
3. **Analytics**: Add tracking for notification clicks and deep link navigation
4. **Testing**: Implement automated tests for notification handling

## Notes

- The `app_domain` should match your production domain
- Custom URL scheme `bittasker://` can be customized
- Make sure to test on different Android versions
- Consider adding notification icons and sounds for better UX 