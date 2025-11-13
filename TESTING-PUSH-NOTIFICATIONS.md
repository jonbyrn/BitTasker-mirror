# Testing Push Notifications Locally

## Setup for Testing Bid Notifications

### Step 1: Start Local Development Server

```bash
npm run dev
```

This will start the app on `http://localhost:3000`

### Step 2: Use Two Browser Windows/Profiles

You need two separate browser sessions to test as both bidder and task creator:

#### Option A: Two Browser Windows (Same Browser)
1. Open Chrome/Edge in **normal mode** - This will be your **Task Creator** account
2. Open Chrome/Edge in **Incognito/Private mode** - This will be your **Bidder** account
3. Navigate both to `http://localhost:3000`

#### Option B: Two Different Browsers
1. Use Chrome for **Task Creator** account
2. Use Firefox/Edge for **Bidder** account
3. Navigate both to `http://localhost:3000`

#### Option C: Two Chrome Profiles
1. Create a separate Chrome profile for testing
2. Use Profile 1 for **Task Creator**
3. Use Profile 2 for **Bidder**

### Step 3: Enable Push Notification Monitoring

In **both browser windows**, open DevTools:

1. Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
2. Go to **Application** tab → **Service Workers**
3. Go to **Application** tab → **Push Messaging** (Chrome) to see push notification logs
4. Keep **Console** tab open to see logs

### Step 4: Test the Flow

1. **In Task Creator Window:**
   - Log in as the task creator
   - Create a task (or use an existing task)
   - Note the `taskId`
   - Keep the window open and watch for notifications

2. **In Bidder Window:**
   - Log in as the bidder
   - Navigate to the task created above
   - Open **Console** tab in DevTools
   - Place a bid on the task
   - Watch the console for the log: `📤 Sending bid_created notification to backend:`
   - Check if you receive a notification (you shouldn't - this is the bug)

3. **Check Network Tab (Bidder Window):**
   - Go to **Network** tab in DevTools
   - Filter by "GraphQL" or "sendNotification"
   - Find the `sendNotification` mutation request
   - Click on it and check the **Payload** tab to see what was sent to backend

### Step 5: What to Look For

#### In Bidder Window Console:
```
📤 Sending bid_created notification to backend: {
  deviceId: 'bidder-device-id',
  type: 'bid_created',
  body: '... | taskId:xxx | taskCreatorPubkey:yyy | bidderDeviceId:zzz',
  note: 'deviceId is the BIDDER - backend should send to TASK CREATOR instead'
}
```

#### In Network Tab (Bidder Window):
Check the GraphQL request payload:
```json
{
  "input": {
    "title": "New Bid Received",
    "body": "... | taskId:xxx | taskCreatorPubkey:yyy | bidderDeviceId:zzz",
    "deviceId": "bidder-device-id",
    "type": "bid_created"
  }
}
```

#### In Task Creator Window:
- **Should receive** a push notification saying "New Bid Received"
- **Should NOT** receive a notification if backend is broken

#### In Bidder Window:
- **Should NOT** receive a push notification (this is the bug - bidder is receiving it)
- Check **Application** → **Push Messaging** to see if notification was received

### Step 6: Check Service Worker Logs

In **both windows**, check:
- **Application** tab → **Service Workers** → Click on your service worker
- Look for console logs from `firebase-messaging-sw.js`
- You should see logs like:
  ```
  📨 SW: Received background message: {...}
  ✅ SW: Background notification displayed
  ```

## Expected Behavior

### ✅ Correct Behavior (After Backend Fix):
- **Bidder**: Does NOT receive notification
- **Task Creator**: Receives notification "New Bid Received"

### ❌ Current Bug:
- **Bidder**: Receives notification (WRONG)
- **Task Creator**: May or may not receive notification

## Debugging Tips

1. **Check Console Logs**: Look for the `📤 Sending bid_created notification` log to verify what's being sent
2. **Check Network Requests**: Verify the GraphQL mutation payload
3. **Check Service Worker**: Look at service worker logs for push message handling
4. **Check Push Messaging Logs**: In Chrome DevTools → Application → Push Messaging
5. **Check Notification Permission**: Both windows need notification permission granted

## Important Notes

⚠️ **Backend is on Dev Server**: Even though you're testing locally, the backend GraphQL API is still on the dev server. The frontend changes are local, but the backend behavior won't change until the backend code is updated.

✅ **Frontend Changes Are Local**: Your local code changes (adding `taskCreatorPubkey` to body, console logs) will be active in your local test.

## Next Steps After Testing

1. Document what you see in both windows
2. Take screenshots of console logs and network requests
3. Share findings with backend team to fix the notification routing logic

