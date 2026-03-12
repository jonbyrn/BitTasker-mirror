# Android Play Store Readiness Guide (Capacitor Apps)

## Overview

This guide covers everything required to prepare an existing Capacitor Android app for Google Play Store approval. Assumes the app builds successfully and an AAB is already generated.

---

## Play Store Account and Signing

### Developer Account

- Register at [play.google.com/console](https://play.google.com/console) — one-time $25 fee
- **New personal accounts** (created after Nov 13, 2023) must complete closed testing before production access is granted
- Closed testing requirement: **12 opted-in testers for 14 consecutive days**
- Timer starts only after all 12 testers have installed the app — app updates reset the countdown
- After meeting the requirement, apply for production access through Play Console

### App Signing

- Use **Play App Signing** (mandatory for new apps) — Google stores the distribution signing key
- You sign the AAB with an **upload key** before uploading; Google re-signs for distribution
- Generate upload keystore:
  ```bash
  keytool -genkey -v -keystore upload-key.keystore \
    -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
  ```
- Configure signing in `android/app/build.gradle`:
  ```groovy
  android {
    signingConfigs {
      release {
        storeFile file("upload-key.keystore")
        storePassword "..."
        keyAlias "my-key-alias"
        keyPassword "..."
      }
    }
    buildTypes {
      release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
      }
    }
  }
  ```
- **Back up the upload keystore** — losing it requires a Google support request to reset

### AAB Format

- Upload `.aab` (Android App Bundle), not `.apk`
- Generate: `./gradlew bundleRelease` in `android/`
- Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## Required Store Assets

All assets are uploaded in Play Console under **Store presence → Store listing**.

| Asset              | Dimensions                                 | Format                 | Notes                                              |
| ------------------ | ------------------------------------------ | ---------------------- | -------------------------------------------------- |
| App icon           | 512 × 512 px                               | PNG (32-bit)           | Must not have rounded corners — Play applies shape |
| Feature graphic    | 1024 × 500 px                              | JPEG or PNG (no alpha) | Required                                           |
| Phone screenshots  | Min 320px short side, max 3840px long side | JPEG or PNG (≤8 MB)    | Min 2, max 8                                       |
| Tablet screenshots | 1080×1920 or 1200×1920 px                  | JPEG or PNG            | Optional but recommended                           |

### Text Fields (all required)

- **App name**: max 30 characters
- **Short description**: max 80 characters
- **Full description**: max 4000 characters — no keyword stuffing
- **Category**: select the most accurate category
- **Contact email**: must be valid and monitored
- **Privacy policy URL**: publicly accessible, must be live before submission

---

## Android App Configuration

### `android/app/build.gradle`

```groovy
android {
  compileSdkVersion 35
  defaultConfig {
    applicationId "com.yourcompany.yourapp"   // unique, reverse-domain format
    minSdkVersion 23                           // covers ~99% of active devices
    targetSdkVersion 35                        // required as of Aug 31, 2025
    versionCode 1                              // increment on every upload
    versionName "1.0.0"
  }
}
```

- `targetSdkVersion` must be **35** (Android 15) for new apps/updates as of Aug 31, 2025
- `versionCode` must be strictly incremented on every Play Console upload — never reuse
- `applicationId` cannot be changed after first publish

### `AndroidManifest.xml`

```xml
<manifest ...>
  <!-- Declare only permissions your app actually uses -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

  <application
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:allowBackup="false"
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
  </application>
</manifest>
```

- Remove `android:debuggable="true"` — must not be present in release builds
- Remove `android:usesCleartextTraffic="true"` unless strictly required (see Network Security below)
- `allowBackup="false"` prevents sensitive data leakage via ADB backups

### Network Security Config

Create `android/app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
```

- All API calls must use **HTTPS** in production
- Cleartext HTTP is blocked by default on Android 9+ — do not re-enable for production

### App Icons (Adaptive Icons)

Generate all required densities using `@capacitor/assets`:

```bash
npm install @capacitor/assets --save-dev
# Place 1024×1024 source in assets/icon-only.png
npx capacitor-assets generate
```

This populates `android/app/src/main/res/mipmap-*/` with all required densities and generates adaptive icon XML.

---

## Capacitor / WebView Considerations

### Local Asset Loading

- Capacitor serves local web assets via `capacitor://localhost` (or `https://localhost` on some configs)
- This is treated as HTTPS — no cleartext exceptions needed for local assets
- Do not change `server.url` to an HTTP address in production builds

### `capacitor.config.ts` — Production Settings

```typescript
const config: CapacitorConfig = {
	appId: 'com.yourcompany.yourapp', // must match applicationId in build.gradle
	appName: 'YourApp',
	webDir: 'build', // or 'dist' depending on SvelteKit adapter
	android: {
		allowMixedContent: false, // must be false for production
		captureInput: true,
		webContentsDebuggingEnabled: false // must be false for production
	}
};
```

- `webContentsDebuggingEnabled: true` in production is a policy violation
- `allowMixedContent: true` will trigger security warnings and potential rejection

### External Navigation

- External URLs opened via `window.open()` or `<a target="_blank">` open inside the WebView by default
- Use `@capacitor/browser` plugin or configure intent filters to open in the system browser if needed

### Permissions from Plugins

Each Capacitor plugin that requires Android permissions must have those permissions declared in `AndroidManifest.xml`:

| Plugin                           | Required Permission                                            |
| -------------------------------- | -------------------------------------------------------------- |
| `@capacitor/camera`              | `CAMERA`, `READ_MEDIA_IMAGES`                                  |
| `@capacitor/geolocation`         | `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`             |
| `@capacitor/push-notifications`  | `POST_NOTIFICATIONS` (Android 13+)                             |
| `@capacitor/local-notifications` | `POST_NOTIFICATIONS` (Android 13+)                             |
| `@capacitor/filesystem`          | `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (pre-API 29) |

- Only declare permissions your app actively uses — unused permissions trigger rejection
- Runtime-sensitive permissions (camera, location, microphone) require in-app rationale before requesting

---

## Privacy and Policy Compliance

### Privacy Policy

- Must be publicly hosted (not behind a login)
- Must accurately describe all data collected, including via third-party SDKs
- Link must be added to both Play Console store listing and inside the app

### Data Safety Form (Play Console)

- Required for all published apps — found under **Policy → App content → Data safety**
- Declare every data type collected, shared, or processed (including analytics SDKs, crash reporters)
- Inaccurate declarations are an enforceable policy violation
- If using Firebase, AdMob, or any analytics SDK — those data types must be declared

### Sensitive Permissions Disclosure

For permissions considered sensitive (camera, microphone, location, contacts, SMS, call logs):

- Provide a **prominent in-app disclosure** before the permission prompt explaining why it's needed
- Must not request permissions in the background or on first launch without context

### Advertising ID

- If using any advertising SDK, declare it in the Data Safety form
- Apps targeting children (COPPA) must not use advertising ID

### Financial Features Declaration

- As of October 30, 2025, all apps must complete the **Financial Features declaration** in Play Console
- Failure to complete it blocks future app updates

---

## Common Rejection Reasons

- **Missing or broken privacy policy link** — most common; must be live before submission
- `**debuggable` or `webContentsDebuggingEnabled` enabled\*\* in release build
- **App crashes on launch** — test on a physical device and emulator before submitting
- **Incomplete Data Safety form** — undeclared data collection detected by Google
- **Excessive or undeclared permissions** — requesting permissions not justified by app functionality
- **Misleading metadata** — screenshots not matching actual app UI, keyword stuffing in description
- **Unfinished app** — placeholder content, lorem ipsum, broken flows, login walls blocking review
- **targetSdkVersion below 35** — rejected for new apps/updates since Aug 31, 2025
- **Closed testing not completed** — new accounts blocked from production without 12 testers × 14 days
- **Mixed content / cleartext HTTP** — `allowMixedContent: true` or HTTP API calls in production
- **Copyright/trademark violations** — app name, icon, or description infringing third-party IP

---

## Pre-Submission Checklist

### Account and Legal

- Google Play developer account registered and verified
- Closed testing completed (12 testers × 14 days) if account is new
- Privacy policy is publicly hosted and linked in Play Console
- Data Safety form fully completed in Play Console
- Financial Features declaration completed
- App content rating questionnaire completed (IARC)

### App Configuration

- `applicationId` is unique and in reverse-domain format
- `targetSdkVersion 35` (or higher)
- `minSdkVersion` set appropriately (23 recommended)
- `versionCode` incremented from any previous upload
- `versionName` updated to reflect the release
- `android:debuggable` is NOT in the release manifest
- `webContentsDebuggingEnabled: false` in `capacitor.config.ts`
- `allowMixedContent: false` in `capacitor.config.ts`
- Network security config blocks cleartext traffic
- Only necessary permissions declared in `AndroidManifest.xml`

### Signing and Build

- Release AAB signed with upload keystore
- Upload keystore backed up securely
- Play App Signing enrolled in Play Console
- ProGuard/R8 enabled for release build

### Store Assets

- App icon: 512 × 512 px PNG
- Feature graphic: 1024 × 500 px JPEG/PNG
- At least 2 phone screenshots (accurate to actual app UI)
- App name (≤30 chars), short description (≤80 chars), full description (≤4000 chars)
- Category selected
- Contact email set

### Testing

- App tested on physical Android device (not just emulator)
- All core user flows work without crashes
- No console errors or ANRs during normal use
- All declared permissions are actually used and prompted with rationale
- External links open correctly
- App functions correctly with network connectivity changes
