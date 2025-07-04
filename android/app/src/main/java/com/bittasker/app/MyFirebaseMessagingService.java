package com.bittasker.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MyFirebaseMsgService";
    private static final String CHANNEL_ID = "bittasker_notifications";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "From: " + remoteMessage.getFrom());

        // Check if message contains a data payload
        if (remoteMessage.getData().size() > 0) {
            Log.d(TAG, "Message data payload: " + remoteMessage.getData());
        }

        // Check if message contains a notification payload
        if (remoteMessage.getNotification() != null) {
            Log.d(TAG, "Message Notification Body: " + remoteMessage.getNotification().getBody());
        }

        // Handle the message here
        showNotification(remoteMessage);
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Refreshed token: " + token);
        // Send token to server if needed
        sendRegistrationToServer(token);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "BitTasker Notifications";
            String description = "Notifications from BitTasker app";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.enableVibration(true);
            channel.enableLights(true);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private void showNotification(RemoteMessage remoteMessage) {
        try {
            Map<String, String> data = remoteMessage.getData();
            RemoteMessage.Notification notification = remoteMessage.getNotification();

            String title = notification != null ? notification.getTitle() : "BitTasker";
            String body = notification != null ? notification.getBody() : "You have a new notification";

            // Create intent for notification tap
            Intent intent = createNotificationIntent(data);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 
                0, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Build the notification
            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getNotificationIcon())
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setDefaults(NotificationCompat.DEFAULT_ALL);

            // Show the notification
            NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            notificationManager.notify(0, builder.build());

        } catch (Exception e) {
            Log.e(TAG, "Error showing notification", e);
        }
    }

    private Intent createNotificationIntent(Map<String, String> data) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        // Determine the target URL from notification data
        String targetUrl = determineTargetUrl(data);
        
        if (targetUrl != null && !targetUrl.isEmpty()) {
            // Add the target URL as data to the intent
            intent.putExtra("notification_url", targetUrl);
            
            // Also try to create a deep link intent
            try {
                Uri deepLinkUri = Uri.parse("https://bittasker.com" + targetUrl);
                Intent deepLinkIntent = new Intent(Intent.ACTION_VIEW, deepLinkUri);
                deepLinkIntent.setPackage(getPackageName());
                deepLinkIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                
                // Check if our app can handle this intent
                PackageManager pm = getPackageManager();
                if (deepLinkIntent.resolveActivity(pm) != null) {
                    return deepLinkIntent;
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not create deep link intent", e);
            }
        }

        return intent;
    }

    private String determineTargetUrl(Map<String, String> data) {
        if (data == null) return "/dashboard";

        // Check for click_action first (Android-specific)
        if (data.containsKey("click_action")) {
            return data.get("click_action");
        }

        // Check for clickAction
        if (data.containsKey("clickAction")) {
            return data.get("clickAction");
        }

        // Check notification type and build URL accordingly
        String type = data.get("type");
        if ("task_match".equals(type)) {
            return "/dashboard/find-tasks";
        } else if ("new_bid".equals(type) && data.containsKey("taskId")) {
            return "/dashboard/task/" + data.get("taskId");
        } else if ("message".equals(type) && data.containsKey("conversationId")) {
            return "/dashboard/messages/to/" + data.get("conversationId");
        } else if ("task_update".equals(type) && data.containsKey("taskId")) {
            return "/dashboard/task/" + data.get("taskId");
        }

        // Fallback to dashboard
        return "/dashboard";
    }

    private int getNotificationIcon() {
        // Try to get custom push icon first
        try {
            return getResources().getIdentifier("push_icon_name", "mipmap", getPackageName());
        } catch (Exception e) {
            // Fallback to app icon
            return getApplicationInfo().icon;
        }
    }

    private void sendRegistrationToServer(String token) {
        // Implement token registration with your server here if needed
        Log.d(TAG, "Token should be sent to server: " + token);
    }
} 