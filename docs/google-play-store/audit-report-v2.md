# Play Store Readiness Audit — v2

**Date:** March 11, 2026  
**App:** BitTasker (`com.bittasker.app`)  
**Version:** 1.0.4 (versionCode 4)  
**Stack:** SvelteKit (static adapter) + Capacitor 8 + Android

> This audit covers issues **not already addressed in audit-report.md**. It focuses on Capacitor 8 compatibility, build system correctness, store listing requirements, runtime behavior, and policy compliance areas that were not covered in the first audit.

---

## Summary

The first audit identified the critical security blockers (`webContentsDebuggingEnabled`, `allowMixedContent`, missing `network_security_config.xml`) and permission violations. This second audit reveals **additional issues** across four new categories:

1. **Capacitor 8 compatibility** — `minSdkVersion` mismatch, missing `configChanges`, deprecated Gradle syntax
2. **Build system** — AGP 9 breaking change with `proguard-android.txt`, missing `density` in configChanges
3. **Store listing & policy** — Financial Features declaration, Data Safety completeness, content rating
4. **Runtime behavior** — Missing notification icon asset, deep link verification, splash screen config

**Estimated new issues found: 12 additional items** beyond the first audit.

---

## 1. Capacitor 8 Compatibility Issues

### 🔴 BLOCKER — `minSdkVersion = 23` violates Capacitor 8 requirement

**File:** `android/variables.gradle`, line 2

```groovy
minSdkVersion = 23
```

Capacitor 8 dropped support for Android API 23 (Android 6.0). The minimum supported `minSdkVersion` for Capacitor 8 is **24** (Android 7.0).

With `minSdkVersion = 23`, the app may:

- Fail to build with certain Capacitor 8 plugin dependencies
- Exhibit undefined behavior on Android 6 devices
- Be flagged during Play Console upload if Capacitor 8 native code uses API 24+ calls

**Fix:**

```groovy
minSdkVersion = 24
```

This reduces the theoretical install base by approximately 0.1% (Android 6 devices are effectively negligible in 2026).

---

### 🟠 HIGH — Missing `density` in `configChanges`

**File:** `android/app/src/main/AndroidManifest.xml`, line 10

```xml
android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation"
```

Capacitor 8 requires `density` to be included in `configChanges` to prevent the WebView from reloading when the device display density changes (e.g., when connecting to an external display, changing font size, or on foldable devices).

Without `density`, the WebView reloads the entire SvelteKit app on display density changes, causing:

- Loss of in-progress form data
- Visible flash/reload on foldable devices
- Poor user experience on Chromebooks running Android apps

**Fix:**

```xml
android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
```

---

### 🟠 HIGH — Gradle property syntax uses spaces instead of `=`

**File:** `android/variables.gradle`

```groovy
// Current (old syntax)
minSdkVersion = 23
compileSdkVersion = 36
```

AGP 9 (used by Capacitor 8) requires the `=` assignment syntax in `ext {}` blocks. While the current file already uses `=`, verify that `android/app/build.gradle` uses the updated namespace syntax:

**File:** `android/app/build.gradle`, line 11

```groovy
// Current
android {
    namespace "com.bittasker.app"
```

AGP 9 requires:

```groovy
android {
    namespace = "com.bittasker.app"
```

Without the `=`, AGP 9 may emit deprecation warnings or fail in future versions.

---

### 🟠 HIGH — `androidxActivityVersion` and `androidxCoreVersion` below Capacitor 8 minimums

**File:** `android/variables.gradle`

```groovy
androidxActivityVersion = '1.9.2'   // Capacitor 8 requires 1.11.0
androidxCoreVersion = '1.15.0'      // Capacitor 8 requires 1.17.0
androidxAppCompatVersion = '1.7.0'  // Capacitor 8 requires 1.7.1
```

Capacitor 8 minimum requirements:

| Variable                   | Current  | Required |
| -------------------------- | -------- | -------- |
| `androidxActivityVersion`  | `1.9.2`  | `1.11.0` |
| `androidxCoreVersion`      | `1.15.0` | `1.17.0` |
| `androidxAppCompatVersion` | `1.7.0`  | `1.7.1`  |

Outdated AndroidX versions can cause runtime crashes on newer Android versions and may conflict with Capacitor 8 plugin dependencies.

**Fix in `android/variables.gradle`:**

```groovy
androidxActivityVersion = '1.11.0'
androidxAppCompatVersion = '1.7.1'
androidxCoreVersion = '1.17.0'
```

---

## 2. Build System Issues

### 🔴 BLOCKER — `proguard-android.txt` incompatible with AGP 9

**File:** `android/app/build.gradle`, line 48

```groovy
proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
```

As of Android Gradle Plugin 9 (used by Capacitor 8), `proguard-android.txt` has been **removed from the AGP distribution**. Referencing it will cause a build failure:

```
ERROR: Could not resolve 'proguard-android.txt'
```

This is a build-time failure that will prevent generating the release AAB entirely.

**Fix:**

```groovy
proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
```

`proguard-android-optimize.txt` is bundled with AGP and does not need to be created manually. It is resolved from inside the AGP JAR by Gradle at build time.

---

### 🟠 HIGH — `minifyEnabled false` prevents R8 code shrinking

**File:** `android/app/build.gradle`, line 47

```groovy
minifyEnabled false
```

With minification disabled:

- The release AAB contains full unobfuscated class names and method names
- Internal business logic, API endpoint paths, and data structures are fully readable by decompiling the AAB
- The AAB is significantly larger than necessary
- Google Play may flag the app as having poor code quality

For a Capacitor WebView app, R8 minification is safe because the web assets (HTML/JS/CSS) are not processed by R8 — only the native Android wrapper code is minified. The risk of R8 breaking anything in a pure Capacitor app is extremely low.

**Fix:**

```groovy
buildTypes {
  release {
    signingConfig signingConfigs.release
    minifyEnabled true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
  }
}
```

---

### 🟡 LOW — `proguard-rules.pro` has no rules for Sentry or Firebase

**File:** `android/app/proguard-rules.pro`

The file is essentially empty (only comments). The app uses:

- `@sentry/sveltekit` — Sentry captures stack traces; without keeping source file attributes, crash reports will show obfuscated class names
- Firebase Messaging — Firebase classes may be stripped if R8 is enabled without keep rules

**Recommended additions:**

```proguard
# Keep line numbers for Sentry crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Capacitor core
-keep class com.getcapacitor.** { *; }
-keep class com.bittasker.** { *; }

# WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
```

---

## 3. Store Listing & Policy Compliance

### 🔴 BLOCKER — Financial Features declaration not confirmed completed

**Location:** Play Console → Policy → App content → Financial features

As of October 30, 2025, **all apps must complete the Financial Features declaration** in Play Console. Failure to complete it blocks all future app updates, even updates unrelated to financial features.

BitTasker facilitates Bitcoin payments between Taskers and Taskees. The following must be declared:

- **Payments and transfers** — Bitcoin payment facilitation
- **Trading and funds** — Bitcoin wallet functionality

If BitTasker uses a non-custodial model (users control their own keys), this must be explicitly stated in the declaration. Non-custodial wallets are exempt from licensing requirements but must still complete the declaration form.

**Action required:** Complete this form in Play Console before first submission.

---

### 🔴 BLOCKER — Data Safety form completeness

**Location:** Play Console → Policy → App content → Data safety

The app collects data through multiple channels that must all be declared. The following were identified from code analysis but may be incomplete in the Data Safety form:

| Data Type                                        | Source                                                                                | Must Declare |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------ |
| Precise location                                 | `location.service.ts`, `EnhancedLocationPicker.svelte`                                | Yes          |
| Approximate location                             | `ACCESS_COARSE_LOCATION`                                                              | Yes          |
| Device identifiers                               | `getDeviceIdentifier()` in push notification service                                  | Yes          |
| Push notification tokens (FCM)                   | `push-notification.service.ts`                                                        | Yes          |
| Authentication credentials                       | `StorageKeys.ACCESS_TOKEN`, `StorageKeys.NPUB`, `StorageKeys.WEB_AUTHN_CREDENTIAL_ID` | Yes          |
| Financial info                                   | Bitcoin wallet operations                                                             | Yes          |
| Crash logs / diagnostics                         | `@sentry/sveltekit`                                                                   | Yes          |
| App interactions                                 | Firebase SDK                                                                          | Yes          |
| User-generated content (task descriptions, bids) | Task creation/bidding flows                                                           | Yes          |
| Photos/videos                                    | Camera usage for task evidence                                                        | Yes          |

**Inaccurate declarations are an enforceable policy violation** and can result in app removal after publication.

---

### 🟠 HIGH — Privacy policy not linked inside the app

**Current state:** A privacy policy page exists at `/privacy` in the SvelteKit routes. However, Google Play requires the privacy policy to be linked **inside the app** (not just in the Play Console store listing).

**Requirement:** The privacy policy link must be accessible from within the app without requiring a login. Acceptable locations:

- Settings screen
- App footer
- Login/signup screen
- About screen

**Check:** Verify that the privacy policy link is accessible from the settings page at `src/routes/(protected)/settings/+page.svelte` or another pre-login screen.

---

### 🟠 HIGH — Content rating questionnaire not confirmed

**Location:** Play Console → Policy → App content → App content rating

The IARC content rating questionnaire must be completed before production submission. For BitTasker:

- **Violence:** No
- **Sexual content:** No
- **Profanity:** No
- **Controlled substances:** No
- **Financial transactions:** Yes (in-app payments/Bitcoin)
- **Location sharing:** Yes

Expected rating: **Everyone** or **Teen**. If the rating is not completed, the app will be blocked from submission.

---

### 🟡 LOW — App description and screenshots not verified

The Play Console store listing requires:

- App name: "BitTasker" (9 chars — within 30 char limit ✓)
- Short description (≤80 chars)
- Full description (≤4000 chars) — must not contain keyword stuffing
- At least 2 phone screenshots showing **actual app UI** (not mockups or marketing graphics)
- Feature graphic (1024×500)

Screenshots must accurately represent the current app UI. Submitting screenshots that don't match the actual app is a rejection reason.

---

## 4. Runtime Behavior Issues

### 🔴 BLOCKER — `ic_stat_notify` drawable missing

**Referenced in:** `AndroidManifest.xml` line 51, `push-notification.service.ts` line 310

```xml
<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_notify" />
```

The drawable `ic_stat_notify` is referenced but **does not exist** in the `drawable/` or `drawable-*/` directories. The only file in `drawable/` is `ic_launcher_background.xml`.

**Impact:** When a push notification is received:

- On Android 5.0+: The app will crash or display a broken notification icon
- FCM will fall back to the app icon, which may not render correctly as a notification icon (notification icons must be white/transparent on Android 5+)
- This is a runtime crash risk that will cause app rejection if Google's review team tests push notifications

**Fix:** Create a proper notification icon:

1. Create a white/transparent 24dp vector drawable named `ic_stat_notify`
2. Place it in `android/app/src/main/res/drawable/ic_stat_notify.xml`

Example minimal notification icon:

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FFFFFF"
      android:pathData="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2z"/>
</vector>
```

Or use Android Studio's **Image Asset** tool to generate a proper notification icon from the BitTasker logo.

---

### 🟠 HIGH — Launcher icon PNG assets missing from all density folders

**Current state:** Only `mipmap-anydpi-v26/` exists with adaptive icon XML. No PNG/WebP bitmap files exist in:

- `mipmap-mdpi/`
- `mipmap-hdpi/`
- `mipmap-xhdpi/`
- `mipmap-xxhdpi/`
- `mipmap-xxxhdpi/`

**Impact:**

- Devices running Android below API 26 (Android 8.0) cannot render adaptive icons and require bitmap fallbacks
- While Android 8+ market share is very high (~99%), the Play Store still validates that all required icon densities are present
- The adaptive icon XML references `@mipmap/ic_launcher_background` and `@mipmap/ic_launcher_foreground` — these are currently resolved from vector drawables, which works on API 26+ but may not work correctly on all launchers

**Current launcher icons** use the default Android Studio teal grid background and robot foreground — these are placeholder assets that must be replaced with BitTasker branding.

**Fix:**

```bash
# Place your 1024×1024 branded icon at assets/icon-only.png
npx capacitor-assets generate
```

This generates all required density PNG files and updates the adaptive icon XML.

---

### 🟠 HIGH — Deep link App Links verification not set up

**File:** `AndroidManifest.xml`, lines 26–31

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="@string/app_domain" />
</intent-filter>
```

`android:autoVerify="true"` means Android will attempt to verify App Links by fetching:

```
https://app.bittasker.com/.well-known/assetlinks.json
```

If this file does not exist or is not correctly configured, Android will **fall back to showing a disambiguation dialog** instead of opening the app directly. This is not a rejection reason, but it means deep links from notifications and external sources won't work as intended.

**Required `assetlinks.json` content:**

```json
[
	{
		"relation": ["delegate_permission/common.handle_all_urls"],
		"target": {
			"namespace": "android_app",
			"package_name": "com.bittasker.app",
			"sha256_cert_fingerprints": ["YOUR_SIGNING_CERT_SHA256_FINGERPRINT"]
		}
	}
]
```

**Get your SHA256 fingerprint:**

```bash
keytool -list -v -keystore your-keystore.jks -alias your-alias
```

**Action:** Host this file at `https://app.bittasker.com/.well-known/assetlinks.json` before submission.

---

### 🟡 LOW — Splash screen configuration references non-existent resource

**File:** `capacitor.config.ts`, lines 40–50

```typescript
SplashScreen: {
    launchAutoHide: false,
    launchShowDuration: 0,
    backgroundColor: '#FF9315',
    showSpinner: true,
    spinnerColor: '#FFFFFF',
    androidSplashResourceName: 'splash',
    ...
}
```

`androidSplashResourceName: 'splash'` references a drawable named `splash`. This file is not confirmed to exist in `android/app/src/main/res/drawable/`. If missing:

- The splash screen will show a blank/white screen instead of the branded splash
- On some devices, this may cause a brief visual glitch on app launch

**Fix:** Generate splash screen assets using `@capacitor/assets`:

```bash
# Place a 2732×2732 PNG at assets/splash.png
npx capacitor-assets generate
```

---

### 🟡 LOW — `REFRESH_TOKEN` stored in Preferences but not mentioned in first audit

**File:** `src/lib/utils/constants/storage.ts`

```typescript
REFRESH_TOKEN: 'refresh_token',
```

The first audit mentioned `ACCESS_TOKEN` and `NPUB` as sensitive data at risk from `allowBackup="true"`. The `REFRESH_TOKEN` is equally sensitive — a stolen refresh token allows indefinite session extension without the user's password.

Additionally, `WEB_AUTHN_CREDENTIAL_ID` and `AUTH_METHOD` are stored in Preferences. While less directly exploitable, they reveal authentication method details.

**All sensitive `StorageKeys` values at risk from backup:**

- `ACCESS_TOKEN`
- `REFRESH_TOKEN`
- `NPUB`
- `WEB_AUTHN_CREDENTIAL_ID`
- `AUTH_METHOD`

This reinforces the recommendation to set `android:allowBackup="false"`.

---

## 5. Sentry Integration Considerations

### 🟡 LOW — Sentry source maps not configured for Android

**Package:** `@sentry/sveltekit` (present in `package.json`)

Sentry is integrated for error tracking. For Android/Capacitor apps, Sentry source maps must be uploaded to Sentry during the build process to get readable stack traces in crash reports.

Without source maps:

- Sentry crash reports will show minified/obfuscated JavaScript (once `minifyEnabled true` is set)
- Debugging production crashes becomes significantly harder

**Action:** Configure Sentry source map upload in your build pipeline. See [Sentry SvelteKit + Capacitor documentation](https://docs.sentry.io/platforms/javascript/guides/sveltekit/sourcemaps/uploading/ionic-capacitor/).

---

## 6. Summary of New Issues

| #   | Issue                                                   | Severity   | Category      |
| --- | ------------------------------------------------------- | ---------- | ------------- |
| 1   | `minSdkVersion = 23` violates Capacitor 8 requirement   | 🔴 Blocker | Capacitor 8   |
| 2   | `proguard-android.txt` incompatible with AGP 9          | 🔴 Blocker | Build system  |
| 3   | Financial Features declaration not completed            | 🔴 Blocker | Policy        |
| 4   | Data Safety form incomplete                             | 🔴 Blocker | Policy        |
| 5   | `ic_stat_notify` drawable missing                       | 🔴 Blocker | Runtime       |
| 6   | Missing `density` in `configChanges`                    | 🟠 High    | Capacitor 8   |
| 7   | AndroidX dependency versions below Capacitor 8 minimums | 🟠 High    | Capacitor 8   |
| 8   | AGP 9 namespace syntax not updated                      | 🟠 High    | Build system  |
| 9   | `minifyEnabled false` in release build                  | 🟠 High    | Build system  |
| 10  | Privacy policy not linked inside the app                | 🟠 High    | Policy        |
| 11  | Content rating questionnaire not confirmed              | 🟠 High    | Policy        |
| 12  | Launcher icon PNG assets missing                        | 🟠 High    | Runtime       |
| 13  | App Links `assetlinks.json` not configured              | 🟠 High    | Runtime       |
| 14  | `REFRESH_TOKEN` also at risk from backup                | 🟡 Low     | Security      |
| 15  | Splash screen resource may be missing                   | 🟡 Low     | Runtime       |
| 16  | Sentry source maps not configured                       | 🟡 Low     | Observability |
| 17  | Empty `proguard-rules.pro` (no Sentry/Firebase rules)   | 🟡 Low     | Build system  |

---

## 7. Combined Priority Fix List (Both Audits)

### Must fix before submission (blockers from both audits):

1. `webContentsDebuggingEnabled: false` in `capacitor.config.ts`
2. `allowMixedContent: false` in `capacitor.config.ts`
3. Create `network_security_config.xml` and reference in manifest
4. Add `POST_NOTIFICATIONS` permission to manifest
5. Remove `SCHEDULE_EXACT_ALARM` permission
6. Remove Bluetooth permissions (×4)
7. Verify `ic_stat_notify` drawable exists (create if missing)
8. Generate launcher icon PNG files in all `mipmap-*` density folders
9. Update `minSdkVersion` to 24
10. Switch to `proguard-android-optimize.txt` in `build.gradle`
11. Complete Financial Features declaration in Play Console
12. Complete Data Safety form in Play Console

### Strongly recommended before submission:

13. `android:allowBackup="false"` in `AndroidManifest.xml`
14. `minifyEnabled true` in release build type
15. Add `density` to `configChanges` in manifest
16. Update AndroidX dependency versions to Capacitor 8 minimums
17. Add `android:required="false"` to GPS feature declaration
18. Remove `USE_FINGERPRINT` permission
19. Add `ACCESS_NETWORK_STATE` permission
20. Link privacy policy inside the app
21. Complete IARC content rating questionnaire
22. Host `assetlinks.json` at `https://app.bittasker.com/.well-known/assetlinks.json`
23. Add ProGuard rules for Sentry and Firebase to `proguard-rules.pro`
24. Update namespace syntax in `build.gradle` for AGP 9

### Optional improvements:

25. Scope `file_paths.xml` external path to specific directory
26. Configure Sentry source map upload in build pipeline
27. Replace keystore credentials with CI environment variables
28. Generate splash screen assets with `@capacitor/assets`
