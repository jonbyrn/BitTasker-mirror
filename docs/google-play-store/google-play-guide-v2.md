# Google Play Store Guide v2 — BitTasker (Capacitor + SvelteKit)

**Date:** March 11, 2026  
**App:** BitTasker (`com.bittasker.app`)  
**Stack:** SvelteKit (static adapter) + Capacitor 8 + Android

This document consolidates research from multiple sources into a comprehensive reference for preparing and maintaining a Capacitor-based SvelteKit app on Google Play Store.

---

## Table of Contents

1. [Answers to Common Questions](#1-answers-to-common-questions)
2. [Google Play Store Review Process](#2-google-play-store-review-process)
3. [Capacitor Android Compatibility & Best Practices](#3-capacitor-android-compatibility--best-practices)
4. [Android Security Configuration Reference](#4-android-security-configuration-reference)
5. [Permissions Reference](#5-permissions-reference)
6. [ProGuard / R8 Reference](#6-proguard--r8-reference)
7. [Data Safety & Privacy Policy Requirements](#7-data-safety--privacy-policy-requirements)
8. [Financial Features Declaration (Crypto Apps)](#8-financial-features-declaration-crypto-apps)
9. [Store Assets Requirements](#9-store-assets-requirements)
10. [Common Rejection Reasons](#10-common-rejection-reasons)
11. [Pre-Submission Checklist](#11-pre-submission-checklist)

---

## 1. Answers to Common Questions

### What is `webContentsDebuggingEnabled`?

`webContentsDebuggingEnabled: true` in `capacitor.config.ts` enables **remote debugging of the Android WebView** via Chrome DevTools (`chrome://inspect`) or Edge DevTools (`edge://inspect`). When enabled, anyone with physical or USB access to the device can connect to the WebView and inspect JavaScript, read DOM state, intercept network requests, and execute arbitrary JS.

**Why it causes rejection:** Google Play's security policy prohibits shipping apps with WebView debugging enabled in release builds. It is treated as a direct security vulnerability. The Play Store automated scanner detects this flag and will reject the app.

**Fix:** Set `webContentsDebuggingEnabled: false` in `capacitor.config.ts` for production. You can conditionally enable it only in development:

```typescript
android: {
	webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production';
}
```

Since `capacitor.config.ts` is evaluated at build time, the simplest and safest approach is to hardcode `false`.

---

### What is `allowMixedContent`?

`allowMixedContent: true` allows **HTTP (unencrypted) resources to load inside an HTTPS WebView context**. This is the Android equivalent of a browser's mixed content warning. When enabled:

- Sensitive data (tokens, credentials) can be intercepted via man-in-the-middle attacks
- The WebView bypasses Android's default HTTPS enforcement
- Google Play's security scanner flags this as a policy violation

**Why it matters for BitTasker:** All API calls in `endpoints.ts` use relative paths (`/api/v1/...`), which are served over the same origin as the app. There is no legitimate reason for this to be `true` in production.

**Fix:** Set `allowMixedContent: false`. If you need to load any third-party HTTP resources, migrate them to HTTPS instead.

---

### What does `network_security_config.xml` do?

`network_security_config.xml` is an Android XML file that **declaratively defines your app's network security policy**. It replaces the need to write Java/Kotlin code for network security and is referenced from `AndroidManifest.xml` via `android:networkSecurityConfig="@xml/network_security_config"`.

Capabilities:

- **Block cleartext (HTTP) traffic** — prevents accidental HTTP calls
- **Certificate pinning** — restrict which SSL certificates are trusted for specific domains
- **Custom trust anchors** — trust specific CAs or user-installed certificates (useful for enterprise/dev)
- **Debug-only overrides** — allow HTTP only in debug builds without affecting release

**Why Google Play requires it:** Apps targeting API 28+ (Android 9) without this file rely on the platform default, which Google considers insufficient for apps handling sensitive data. Absence of this file is flagged as a "cleartext policy undefined" risk.

**Minimal production config for BitTasker:**

```xml
<!-- android/app/src/main/res/xml/network_security_config.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
```

Then reference it in `AndroidManifest.xml`:

```xml
<application
  android:networkSecurityConfig="@xml/network_security_config"
  ...>
```

---

### What does `allowBackup` do?

`android:allowBackup="true"` (the default) enables **Android's automatic backup system**, which backs up app data to Google Drive (Auto Backup) and allows `adb backup` extraction via USB. This includes:

- `SharedPreferences` files (where Capacitor's `Preferences` plugin stores data)
- SQLite databases
- Internal files

**For BitTasker specifically:** The `StorageKeys` constants show that `access_token`, `refresh_token`, `npub`, `webAuthnCredentialId`, and `auth_method` are all stored in Capacitor `Preferences` (which maps to Android `SharedPreferences`). With `allowBackup="true"`, these credentials can be:

1. Backed up to Google Drive and restored to a different device, potentially bypassing authentication
2. Extracted via `adb backup` by anyone with USB access to the device

**Fix:** Set `android:allowBackup="false"` in `AndroidManifest.xml`. Since you redirect to login when `access_token` and `npub` are empty, disabling backup simply means users will need to log in again after reinstalling — which is the correct and secure behavior for an app handling financial transactions and cryptographic keys.

If you want to allow non-sensitive data to be backed up (e.g., theme preference, language), use Android 12+'s `dataExtractionRules`:

```xml
<application
  android:allowBackup="false"
  android:dataExtractionRules="@xml/data_extraction_rules"
  ...>
```

```xml
<!-- android/app/src/main/res/xml/data_extraction_rules.xml -->
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="sharedpref" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="sharedpref" path="." />
  </device-transfer>
</data-extraction-rules>
```

---

### What is the `POST_NOTIFICATIONS` permission?

`POST_NOTIFICATIONS` is an **Android 13 (API 33) runtime permission** that apps must declare and request before they can display notifications. Prior to Android 13, notification permission was granted automatically.

**Why it's required for BitTasker:** The app uses `@capacitor/push-notifications` and `@capacitor/local-notifications`. Without this permission declaration:

- Push notifications will silently fail on Android 13+ devices (approximately 50%+ of active Android devices as of 2026)
- FCM tokens may still be registered, but notifications will not appear
- No error is thrown — the failure is silent

**Declaration in `AndroidManifest.xml`:**

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

This permission is backward-compatible — it is safely ignored on devices below Android 13.

**Runtime request:** Capacitor's `PushNotifications.requestPermissions()` handles the runtime dialog. The permission must be declared in the manifest first, or the runtime request will fail.

---

### What is `proguard-android.txt` and how do I use `proguard-android-optimize.txt`?

**`proguard-android.txt`** is the legacy default ProGuard rules file bundled with the Android Gradle Plugin. It includes `-dontoptimize`, which **disables R8 code optimization**. It was the safe default when ProGuard optimization had known issues with certain code patterns.

**`proguard-android-optimize.txt`** is the modern replacement. It enables R8 optimizations including:

- Method inlining
- Class merging
- Dead code elimination
- Obfuscation
- Faster startup times and reduced APK/AAB size

**Critical update (AGP 9):** As of Android Gradle Plugin 9, `proguard-android.txt` is **no longer supported** and will cause build failures. Since Capacitor 8 targets AGP 9+, you should switch now.

**Is it safe to create manually?** You do **not** need to create `proguard-android-optimize.txt` manually. It is a **built-in file provided by the Android Gradle Plugin** itself — it lives inside the AGP JAR, not in your project. You reference it via `getDefaultProguardFile('proguard-android-optimize.txt')` in `build.gradle`, and Gradle resolves it from the SDK.

**Your custom rules** go in `android/app/proguard-rules.pro` (which already exists in your project). Capacitor WebView apps rarely need custom ProGuard rules, but if you add native Java/Kotlin code or use reflection-heavy libraries, you would add keep rules there.

**Fix in `build.gradle`:**

```groovy
buildTypes {
  release {
    minifyEnabled true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
  }
}
```

This change will not be overridden by Capacitor — `build.gradle` is your file to manage.

---

## 2. Google Play Store Review Process

### How Review Works

Google Play uses a combination of **automated scanning** and **human review**:

1. **Automated pre-checks** — APK/AAB is scanned for known policy violations (debuggable flag, dangerous permissions, malware signatures, cleartext traffic)
2. **Policy compliance review** — Metadata, screenshots, description, and privacy policy are reviewed
3. **Human review** — Triggered for sensitive permission categories, financial apps, apps targeting children, or flagged automated results
4. **Ongoing monitoring** — Published apps are continuously re-scanned; violations can cause post-publish removal

### Review Timeline

- **Initial review:** 1–3 days for most apps; up to 7 days for apps with sensitive permissions or financial features
- **Updates:** Usually 1–2 days
- **Appeals:** 5–10 business days

### New Developer Account Requirements (Post November 13, 2023)

Personal developer accounts created after November 13, 2023 must complete **closed testing** before production access:

- **12 opted-in testers** (real people, not bots or emulators)
- **14 consecutive days** of active testing
- The 14-day timer starts only after all 12 testers have installed and opted into the test
- App updates during the 14-day period do **not** reset the timer, but removing testers does
- Organization/company accounts are **exempt** from this requirement

After meeting the requirement, apply for production access via the Play Console Dashboard. Google will ask questions about the app, testing process, and production readiness.

**Finding testers:** Use personal networks, Reddit communities (r/androiddev, r/betatesting), or professional testing services. Some services specialize in meeting this specific requirement.

### Enforcement Statistics (2025)

- Google blocked **1.75 million** policy-violating apps in 2025
- Banned **80,000+** developer accounts
- Automated scanning catches the majority of technical violations before human review

---

## 3. Capacitor Android Compatibility & Best Practices

### Capacitor 8 Requirements

| Requirement                | Minimum Version                         |
| -------------------------- | --------------------------------------- |
| Node.js                    | 22+                                     |
| Android Studio             | Otter 2025.2.1+                         |
| `minSdkVersion`            | 24 (Capacitor 8 dropped support for 23) |
| `compileSdkVersion`        | 36                                      |
| `targetSdkVersion`         | 36                                      |
| `androidxActivityVersion`  | 1.11.0                                  |
| `androidxAppCompatVersion` | 1.7.1                                   |
| `androidxCoreVersion`      | 1.17.0                                  |

> **Note:** BitTasker currently uses `minSdkVersion = 23`. Capacitor 8 requires `minSdkVersion = 24`. This should be updated.

### How Capacitor Serves Web Assets

Capacitor serves local web assets (your SvelteKit `build/` output) via the `capacitor://localhost` scheme on Android. This is treated as HTTPS by the WebView — no cleartext exceptions are needed for local assets. The scheme is:

```
capacitor://localhost/index.html
```

This means:

- All relative API calls (`/api/v1/...`) resolve against the actual server URL configured in the app
- No HTTP exceptions are needed for local asset loading
- `allowMixedContent: false` is safe to set

### `capacitor.config.ts` Production Template

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.bittasker.app',
	appName: 'BitTasker',
	webDir: 'build',
	android: {
		allowMixedContent: false, // MUST be false for production
		webContentsDebuggingEnabled: false // MUST be false for production
	},
	ios: {
		scheme: 'BitTasker'
	}
};

export default config;
```

### Capacitor Plugin Permission Requirements

Each plugin that accesses sensitive device features requires the corresponding Android permission in `AndroidManifest.xml`:

| Plugin                              | Required Permissions                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `@capacitor/push-notifications`     | `POST_NOTIFICATIONS` (Android 13+)                             |
| `@capacitor/local-notifications`    | `POST_NOTIFICATIONS` (Android 13+)                             |
| `@capacitor/geolocation`            | `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`             |
| `@capacitor/camera`                 | `CAMERA`, `READ_MEDIA_IMAGES` (API 33+)                        |
| `@capacitor/filesystem`             | `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (pre-API 29) |
| `capacitor-native-biometric`        | `USE_BIOMETRIC`                                                |
| `@capacitor-mlkit/barcode-scanning` | `CAMERA`                                                       |

**Rule:** Only declare permissions your app actively uses. Unused permissions are a policy violation and a common rejection reason.

### Generating App Icons

Use `@capacitor/assets` to generate all required icon densities from a single source image:

```bash
# Place a 1024×1024 PNG at assets/icon-only.png
# Place a 2732×2732 PNG at assets/splash.png (optional)
npx capacitor-assets generate
```

This generates:

- `mipmap-mdpi/`, `mipmap-hdpi/`, `mipmap-xhdpi/`, `mipmap-xxhdpi/`, `mipmap-xxxhdpi/` PNG files
- `mipmap-anydpi-v26/` adaptive icon XML
- Splash screen resources

### Capacitor and AGP 9

Capacitor 8 uses Android Gradle Plugin 9. Key breaking changes:

- `proguard-android.txt` is no longer supported — use `proguard-android-optimize.txt`
- Gradle syntax changes: use `=` assignment in `build.gradle`
- `density` must be added to `configChanges` in `AndroidManifest.xml`

---

## 4. Android Security Configuration Reference

### Network Security Config

**File:** `android/app/src/main/res/xml/network_security_config.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Block all cleartext (HTTP) traffic -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
```

**Reference in `AndroidManifest.xml`:**

```xml
<application
  android:networkSecurityConfig="@xml/network_security_config"
  ...>
```

### FileProvider Scoping

The current `file_paths.xml` uses `path="."` which exposes the entire external storage root. Scope it to specific directories:

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <external-path name="images" path="Pictures/" />
  <cache-path name="cache_images" path="image_cache/" />
</paths>
```

### Backup Configuration

For apps handling sensitive credentials, disable backup entirely:

```xml
<application
  android:allowBackup="false"
  ...>
```

Or use selective exclusion (Android 12+):

```xml
<application
  android:allowBackup="false"
  android:dataExtractionRules="@xml/data_extraction_rules"
  ...>
```

---

## 5. Permissions Reference

### Permissions to Keep (BitTasker)

| Permission               | Reason                             |
| ------------------------ | ---------------------------------- |
| `INTERNET`               | All network communication          |
| `ACCESS_FINE_LOCATION`   | Location picker, task geo-matching |
| `ACCESS_COARSE_LOCATION` | Fallback location                  |
| `ACCESS_NETWORK_STATE`   | Capacitor/Firebase network checks  |
| `CAMERA`                 | QR/barcode scanning (MLKit)        |
| `USE_BIOMETRIC`          | Native biometric authentication    |
| `POST_NOTIFICATIONS`     | Push notifications (Android 13+)   |

### Permissions to Remove (BitTasker)

| Permission             | Reason to Remove                                                          |
| ---------------------- | ------------------------------------------------------------------------- |
| `SCHEDULE_EXACT_ALARM` | No usage found in codebase; restricted permission on Android 12+          |
| `BLUETOOTH`            | No usage found; legacy permission                                         |
| `BLUETOOTH_ADMIN`      | No usage found; legacy permission                                         |
| `BLUETOOTH_SCAN`       | No usage found; runtime permission on Android 12+, requires justification |
| `BLUETOOTH_CONNECT`    | No usage found; runtime permission on Android 12+, requires justification |
| `USE_FINGERPRINT`      | Deprecated since API 28; `USE_BIOMETRIC` is the replacement               |

### Feature Declarations

```xml
<!-- Add required="false" unless GPS is truly mandatory -->
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

---

## 6. ProGuard / R8 Reference

### Recommended `build.gradle` Configuration

```groovy
buildTypes {
  release {
    signingConfig signingConfigs.release
    minifyEnabled true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
  }
}
```

### Recommended `proguard-rules.pro` for Capacitor WebView Apps

```proguard
# Keep WebView JavaScript interface classes
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep line numbers for crash reporting (Sentry)
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Capacitor
-keep class com.getcapacitor.** { *; }
-keep class com.bittasker.** { *; }
```

### Why `proguard-android-optimize.txt` is Better

| Feature               | `proguard-android.txt` | `proguard-android-optimize.txt` |
| --------------------- | ---------------------- | ------------------------------- |
| Code shrinking        | Yes                    | Yes                             |
| Obfuscation           | Yes                    | Yes                             |
| Method inlining       | No (`-dontoptimize`)   | Yes                             |
| Class merging         | No                     | Yes                             |
| Dead code elimination | Basic                  | Advanced                        |
| AGP 9 support         | **No (breaks build)**  | Yes                             |
| APK/AAB size          | Larger                 | Smaller                         |

---

## 7. Data Safety & Privacy Policy Requirements

### Privacy Policy Requirements

- Must be **publicly accessible** (no login required)
- Must describe **all data collected**, including data collected by third-party SDKs (Firebase, Sentry)
- Must be linked in both Play Console store listing and **inside the app**
- BitTasker already has a privacy policy page at `/privacy` — ensure it is publicly accessible and comprehensive

### Data Safety Form (Play Console)

Navigate to: **Policy → App content → Data safety**

BitTasker must declare the following data types:

| Data Type                       | Collected | Shared                         | Purpose            |
| ------------------------------- | --------- | ------------------------------ | ------------------ |
| Location (precise)              | Yes       | Yes (server for task matching) | App functionality  |
| Location (approximate)          | Yes       | Yes                            | App functionality  |
| Device identifiers              | Yes       | Yes (FCM registration)         | Push notifications |
| Push notification tokens        | Yes       | Yes (server)                   | Push notifications |
| Authentication credentials      | Yes       | No (local only)                | Authentication     |
| Financial info (Bitcoin wallet) | Yes       | No                             | App functionality  |
| App diagnostics (Sentry)        | Yes       | Yes (Sentry)                   | Crash reporting    |
| App interactions (Firebase)     | Yes       | Yes (Google)                   | Push notifications |

### Third-Party SDK Data Collection

These SDKs collect data that must be declared even if your code doesn't explicitly collect it:

- **Firebase / FCM** — device identifiers, app diagnostics
- **Sentry** (`@sentry/sveltekit`) — crash reports, stack traces, device info
- **Google MLKit** (barcode scanning) — camera data processed on-device (no transmission)

---

## 8. Financial Features Declaration (Crypto Apps)

As of October 30, 2025, all apps must complete the **Financial Features declaration** in Play Console. Failure to complete it blocks future app updates.

Navigate to: **Policy → App content → Financial features**

### BitTasker Classification

BitTasker facilitates Bitcoin payments and operates as a marketplace. Relevant categories to declare:

- **Payments and transfers** — Bitcoin payment facilitation between Taskers and Taskees
- **Trading and funds** — Bitcoin wallet functionality (if custodial)

### Custodial vs. Non-Custodial

- **Non-custodial wallets** (user holds their own keys) are **exempt** from licensing requirements
- **Custodial wallets** (platform holds keys) require financial licenses in target jurisdictions

If BitTasker uses a non-custodial model (users control their Nostr keys and Bitcoin keys), declare this clearly in the Financial Features form and privacy policy.

### Jurisdiction Compliance

For custodial features, licensing may be required in:

- **US:** FinCEN registration + state Money Transmitter Licenses
- **EU:** MiCA compliance
- **UK:** FCA registration
- **Canada, Switzerland, Japan, Hong Kong:** Jurisdiction-specific requirements

---

## 9. Store Assets Requirements

| Asset              | Dimensions             | Format                          | Notes                   |
| ------------------ | ---------------------- | ------------------------------- | ----------------------- |
| App icon           | 512 × 512 px           | PNG (32-bit, no alpha rounding) | Play applies shape mask |
| Feature graphic    | 1024 × 500 px          | JPEG or PNG (no alpha)          | Required                |
| Phone screenshots  | Min 320px short side   | JPEG or PNG ≤8 MB               | Min 2, max 8            |
| Tablet screenshots | 1080×1920 or 1200×1920 | JPEG or PNG                     | Recommended             |

### Text Fields

| Field             | Limit           | Notes                                    |
| ----------------- | --------------- | ---------------------------------------- |
| App name          | 30 characters   | "BitTasker" = 9 chars ✓                  |
| Short description | 80 characters   | No keyword stuffing                      |
| Full description  | 4000 characters | No keyword stuffing                      |
| Category          | —               | "Business" or "Productivity" recommended |
| Contact email     | —               | Must be monitored                        |

### Content Rating (IARC)

Complete the IARC questionnaire in Play Console. For BitTasker:

- Select "No" for violence, sexual content, drugs
- Select "Yes" for in-app purchases / financial transactions
- Expected rating: **Everyone** or **Teen**

---

## 10. Common Rejection Reasons

### Technical Violations (Automated)

| Violation                           | Description                                    |
| ----------------------------------- | ---------------------------------------------- |
| `webContentsDebuggingEnabled: true` | WebView debugging in release build             |
| `allowMixedContent: true`           | HTTP content in HTTPS WebView                  |
| `android:debuggable="true"`         | Debug flag in release manifest                 |
| `targetSdkVersion < 35`             | Below minimum requirement (as of Aug 31, 2025) |
| App crashes on launch               | Tested on emulator/device before submission    |
| Missing 64-bit support              | Must include `arm64-v8a`                       |

### Policy Violations (Human Review)

| Violation                          | Description                                       |
| ---------------------------------- | ------------------------------------------------- |
| Unused permissions                 | Declaring permissions with no corresponding usage |
| Missing privacy policy             | Must be live before submission                    |
| Incomplete Data Safety form        | Undeclared data collection                        |
| Incomplete Financial Features form | Required for all apps since Oct 30, 2025          |
| Misleading screenshots             | Screenshots must match actual app UI              |
| Placeholder content                | Lorem ipsum, broken flows, login walls            |
| Copyright/trademark infringement   | App name, icon, or assets                         |

### Distribution Restrictions

| Issue                                                               | Impact                                 |
| ------------------------------------------------------------------- | -------------------------------------- |
| `<uses-feature android:required="true">` without `required="false"` | Excludes devices without that hardware |
| `minSdkVersion` too high                                            | Reduces install eligibility            |
| Missing closed testing (new accounts)                               | Blocks production access entirely      |

---

## 11. Pre-Submission Checklist

### Account & Legal

- [ ] Google Play developer account registered and verified ($25 fee)
- [ ] Closed testing completed: 12 testers × 14 consecutive days (new personal accounts only)
- [ ] Privacy policy publicly hosted and linked in Play Console
- [ ] Data Safety form fully completed
- [ ] Financial Features declaration completed
- [ ] IARC content rating questionnaire completed

### Android Configuration

- [ ] `webContentsDebuggingEnabled: false` in `capacitor.config.ts`
- [ ] `allowMixedContent: false` in `capacitor.config.ts`
- [ ] `network_security_config.xml` created and referenced in manifest
- [ ] `android:allowBackup="false"` in `AndroidManifest.xml`
- [ ] `POST_NOTIFICATIONS` permission declared
- [ ] `ACCESS_NETWORK_STATE` permission declared
- [ ] Unused permissions removed (Bluetooth ×4, `SCHEDULE_EXACT_ALARM`, `USE_FINGERPRINT`)
- [ ] `android.hardware.location.gps` feature has `android:required="false"`
- [ ] `minSdkVersion` updated to 24 (Capacitor 8 requirement)
- [ ] `minifyEnabled true` in release build type
- [ ] `proguard-android-optimize.txt` used instead of `proguard-android.txt`
- [ ] `density` added to `configChanges` in `AndroidManifest.xml`

### Assets & Icons

- [ ] Launcher icon PNGs generated in all `mipmap-*` density folders
- [ ] `ic_stat_notify` drawable exists in `drawable-*/` folders
- [ ] 512×512 app icon for Play Console
- [ ] 1024×500 feature graphic
- [ ] At least 2 phone screenshots

### Build & Signing

- [ ] Release AAB generated (`./gradlew bundleRelease`)
- [ ] AAB signed with upload keystore
- [ ] Upload keystore backed up securely (not in Git)
- [ ] Play App Signing enrolled in Play Console
- [ ] `versionCode` incremented from any previous upload

### Testing

- [ ] App tested on physical Android device
- [ ] All core user flows work without crashes
- [ ] Push notifications work on Android 13+ device
- [ ] Location permission prompt works correctly
- [ ] Camera/QR scanning works
- [ ] Biometric authentication works
- [ ] Deep links work (`bittasker://` and `https://app.bittasker.com`)
- [ ] App works with no internet connection (graceful degradation)
