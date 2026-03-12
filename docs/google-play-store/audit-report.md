# Play Store Readiness Audit

**Date:** March 5, 2026  
**App:** BitTasker (`com.bittasker.app`)  
**Version:** 1.0.4 (versionCode 4)

---

## 1. Summary

The project is **partially ready** for Play Store submission. The Android build infrastructure, signing setup, SDK targeting, and app identity are solid. However, two **critical blockers** exist that would cause immediate rejection: `webContentsDebuggingEnabled: true` and `allowMixedContent: true` are hardcoded in `capacitor.config.ts` with no production override mechanism. Additionally, several permissions in the manifest (`BLUETOOTH_*`, `SCHEDULE_EXACT_ALARM`) have no corresponding usage in the codebase, which is a policy violation risk. A network security config file is also entirely absent.

**Estimated readiness: ~60%** — fixable within a day, but must not be submitted in current state.

---

## 2. What Is Already Correct

- **`applicationId`** is `com.bittasker.app` — unique, reverse-domain format, consistent across `build.gradle`, `strings.xml`, and `capacitor.config.ts`
- **`targetSdkVersion = 36`** (`variables.gradle`) — exceeds the Aug 31, 2025 minimum of 35; compliant
- **`minSdkVersion = 23`** — covers ~99% of active Android devices; appropriate
- **`compileSdkVersion = 36`** — up to date
- **`versionCode = 4` / `versionName = "1.0.4"`** — properly set and non-zero
- **Signing is configured** via `keystore.properties` with conditional loading in `build.gradle` (lines 4–8, 33–42); keystore file is gitignored (`android/*.jks`)
- **`keystore.properties` is gitignored** — credentials not committed to source control
- **64-bit ABI support** — `abiFilters 'arm64-v8a', 'armeabi-v7a'` declared in `build.gradle` (line 28); universal APK also enabled
- **Adaptive icons configured** — `mipmap-anydpi-v26/ic_launcher.xml` exists with foreground/background layers
- **`android:exported="true"`** on `MainActivity` — required for Android 12+; correctly set
- **Deep link intent filter** with `android:autoVerify="true"` and HTTPS scheme — properly structured for App Links
- **Custom URL scheme** (`bittasker://`) — correctly declared
- **FCM integration** — `google-services.json` present, Firebase messaging meta-data declared, `firebase-messaging:23.4.0` dependency included
- **`FileProvider`** declared with `android:exported="false"` and `android:grantUriPermissions="true"` — correct
- **`android.useAndroidX=true`** in `gradle.properties` — required
- **All API calls use relative paths** (`/api/v1/...`) — no hardcoded HTTP URLs in production code
- **`capacitor.config.ts` `server` block is conditional** — only applied when `VITE_CLIENT_URL` is set; production builds correctly omit the dev server URL
- **`webDir: 'build'`** — matches SvelteKit static adapter output directory
- **`zoomEnabled: false`** — appropriate for a native-feel app
- **Push notification channel** created programmatically with proper importance level and channel ID matching the manifest meta-data

---

## 3. Issues That Must Be Fixed

### 🔴 BLOCKER 1 — `webContentsDebuggingEnabled: true` in production

**File:** `capacitor.config.ts`, line 33

```typescript
android: {
  allowMixedContent: true,
  webContentsDebuggingEnabled: true  // ← MUST be false for production
}
```

- Enables remote debugging of the WebView via Chrome DevTools
- Google Play **will reject** apps with WebView debugging enabled in release builds
- This is a direct security policy violation

**Fix:** Set to `false`, or make it environment-conditional:

```typescript
android: {
  allowMixedContent: false,
  webContentsDebuggingEnabled: false
}
```

---

### 🔴 BLOCKER 2 — `allowMixedContent: true` in production

**File:** `capacitor.config.ts`, line 32

- Allows HTTP content to load inside an HTTPS WebView context
- Violates Android security policy and Google Play's security requirements
- Since all API calls use relative paths (confirmed in `endpoints.ts`), there is no reason for this to be `true` in production

**Fix:** Set to `false` (see above)

---

### 🔴 BLOCKER 3 — No `network_security_config.xml` file

**Expected location:** `android/app/src/main/res/xml/network_security_config.xml`  
**Status:** File does not exist; `AndroidManifest.xml` does not reference `android:networkSecurityConfig`

- Without this, the app relies on Android's default policy, which is permissive for some API levels
- Google Play flags apps that do not explicitly restrict cleartext traffic
- Required for apps targeting API 28+

**Fix:** Create the file and reference it in the manifest:

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

Then add to `<application>` in `AndroidManifest.xml`:

```xml
android:networkSecurityConfig="@xml/network_security_config"
```

---

### 🟠 HIGH — `minifyEnabled false` in release build

**File:** `android/app/build.gradle`, line 47

```groovy
buildTypes {
  release {
    minifyEnabled false   // ← should be true
    proguardFiles ...
  }
}
```

- Disabling minification means the APK/AAB contains full class names and unobfuscated code
- Not a direct rejection reason, but increases APK size, exposes internal logic, and is considered poor practice
- `proguard-rules.pro` is essentially empty — no custom rules needed for a pure WebView/Capacitor app

**Fix:** Set `minifyEnabled true` and verify the app still works (Capacitor apps rarely break with R8)

---

### 🟠 HIGH — `android:allowBackup="true"` without encryption

**File:** `AndroidManifest.xml`, line 4

- Allows ADB backup of app data, including `Preferences` storage which may contain auth tokens (`StorageKeys.ACCESS_TOKEN`, `StorageKeys.NPUB`)
- For an app handling financial transactions and cryptographic keys, this is a significant security risk

**Fix:** Set `android:allowBackup="false"` unless you have a specific backup strategy with `android:fullBackupContent` rules that exclude sensitive data

---

## 4. Missing Requirements

### Missing: `POST_NOTIFICATIONS` permission

**File:** `AndroidManifest.xml`

- The app uses `@capacitor/push-notifications` and `@capacitor/local-notifications` (confirmed in `push-notification.service.ts`)
- Android 13+ (API 33+) requires explicit `POST_NOTIFICATIONS` permission declaration
- Without it, push notifications will silently fail on Android 13+ devices

**Fix:** Add to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

---

### Missing: `ACCESS_NETWORK_STATE` permission

- Capacitor and Firebase commonly require this; its absence may cause intermittent issues
- Low risk but worth adding:

```xml
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

### Missing: Launcher icon PNG files in `mipmap-*` density folders

**Status:** Only `mipmap-anydpi-v26/` XML files exist; no PNG files found in `mipmap-hdpi/`, `mipmap-mdpi/`, `mipmap-xhdpi/`, `mipmap-xxhdpi/`, `mipmap-xxxhdpi/`

- The adaptive icon XML references `@mipmap/ic_launcher_background` and `@mipmap/ic_launcher_foreground`
- If the PNG bitmaps are missing, the app will crash on launch on devices below API 26 or show a blank icon
- Run `npx capacitor-assets generate` with a 1024×1024 source image to populate all densities

---

### Missing: `ic_stat_notify` drawable

**File:** `AndroidManifest.xml`, line 55 references `@drawable/ic_stat_notify`  
**File:** `push-notification.service.ts`, line 310 references `ic_stat_notify`

- This drawable is referenced but not confirmed to exist (no PNG found in `drawable-*/`)
- If missing, FCM notifications will crash or show a broken icon on Android

---

## 5. Risky or Questionable Configurations

### ⚠️ `SCHEDULE_EXACT_ALARM` permission — no usage found

**File:** `AndroidManifest.xml`, line 75

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

- No usage of `scheduleExactAlarm`, `AlarmManager`, or equivalent found anywhere in `src/`
- Google Play requires justification for this permission; it is classified as a **restricted permission** on Android 12+
- Declaring unused permissions is a **policy violation** and a common rejection reason

**Fix:** Remove this permission unless you can demonstrate active usage

---

### ⚠️ `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` — no usage found

**File:** `AndroidManifest.xml`, lines 78–81

- No Bluetooth usage found anywhere in `src/`
- `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` are runtime permissions on Android 12+ and require user consent
- Declaring unused Bluetooth permissions is a policy violation and will trigger reviewer scrutiny

**Fix:** Remove all four Bluetooth permissions unless a specific feature requires them

---

### ⚠️ `USE_FINGERPRINT` permission — deprecated

**File:** `AndroidManifest.xml`, line 76

```xml
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
```

- `USE_FINGERPRINT` was deprecated in API 28; `USE_BIOMETRIC` (line 77) is the correct replacement
- Having both is redundant; `USE_FINGERPRINT` may trigger a deprecation warning in Play Console

**Fix:** Remove `USE_FINGERPRINT`, keep only `USE_BIOMETRIC`

---

### ⚠️ `android.hardware.location.gps` feature declared as required

**File:** `AndroidManifest.xml`, line 73

```xml
<uses-feature android:name="android.hardware.location.gps" />
```

- Without `android:required="false"`, this marks GPS as **mandatory**, which excludes devices without GPS (tablets, some Chromebooks) from installing the app
- If GPS is optional (e.g., location can fall back to network), this restricts your install base unnecessarily

**Fix:** Add `android:required="false"` unless GPS is truly mandatory:

```xml
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

---

### ⚠️ `keystore.properties` contains plaintext passwords

**File:** `android/keystore.properties`

- The file is gitignored (confirmed in `.gitignore`, line 56), so it won't be committed
- However, the file currently exists on disk with real credentials — ensure it is never accidentally committed or included in CI artifact archives
- Consider using environment variables in CI instead of a file

---

### ⚠️ `proguard-android.txt` used instead of `proguard-android-optimize.txt`

**File:** `android/app/build.gradle`, line 48

```groovy
proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
```

- `proguard-android-optimize.txt` includes additional optimizations; the non-optimized version is the older default
- Not a rejection risk, but a missed optimization opportunity

---

### ⚠️ `external-path name="my_images" path="."` in `file_paths.xml`

**File:** `android/app/src/main/res/xml/file_paths.xml`

```xml
<external-path name="my_images" path="." />
```

- `path="."` exposes the entire external storage root via `FileProvider`
- This is overly broad; should be scoped to a specific subdirectory (e.g., `path="Pictures/"`)
- Not a direct rejection reason but is a security concern that reviewers may flag

---

## 6. Security and Policy Compliance

| Item                                                    | Status                                   | Risk                 |
| ------------------------------------------------------- | ---------------------------------------- | -------------------- |
| WebView debugging enabled in release                    | `webContentsDebuggingEnabled: true`      | 🔴 Policy violation  |
| Mixed content allowed                                   | `allowMixedContent: true`                | 🔴 Policy violation  |
| Unused `SCHEDULE_EXACT_ALARM` permission                | Declared, no usage                       | 🟠 Policy violation  |
| Unused Bluetooth permissions (×4)                       | Declared, no usage                       | 🟠 Policy violation  |
| `allowBackup="true"` with sensitive data in Preferences | Auth tokens may be backed up             | 🟠 Security risk     |
| No network security config                              | Cleartext policy undefined               | 🟠 Policy gap        |
| `POST_NOTIFICATIONS` missing                            | Push notifications broken on Android 13+ | 🟠 Functional issue  |
| GPS feature marked required                             | Reduces install eligibility              | 🟡 Distribution risk |
| `USE_FINGERPRINT` deprecated                            | Redundant with `USE_BIOMETRIC`           | 🟡 Minor             |
| FileProvider exposes full external storage              | `path="."` too broad                     | 🟡 Security concern  |

### Data Safety Form Implications

The app collects or processes the following data types that **must be declared** in the Play Console Data Safety form:

- **Location data** — `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` used; `location.service.ts` and `EnhancedLocationPicker.svelte` confirm active usage
- **Device identifiers** — `getDeviceIdentifier()` used in push notification registration
- **Push notification tokens** — FCM tokens sent to server
- **Authentication credentials** — Passkey/WebAuthn credentials, Nostr keys stored in `Preferences`
- **Financial data** — Bitcoin wallet operations (implied by app purpose)
- **Firebase/FCM** — Google's SDK collects diagnostic data; must be declared

A **privacy policy** must be hosted at a public URL and linked in the store listing.

---

## 7. Recommendations

**Before submission (blockers):**

1. Set `webContentsDebuggingEnabled: false` and `allowMixedContent: false` in `capacitor.config.ts`
2. Create `android/app/src/main/res/xml/network_security_config.xml` and reference it in the manifest
3. Add `POST_NOTIFICATIONS` permission to `AndroidManifest.xml`
4. Remove `SCHEDULE_EXACT_ALARM` permission (no usage found)
5. Remove `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` permissions (no usage found)
6. Verify `ic_stat_notify` drawable exists in `drawable-*/` folders
7. Verify launcher icon PNG files exist in all `mipmap-*` density folders

**Strongly recommended before submission:**

8. Set `android:allowBackup="false"` in `AndroidManifest.xml` to protect auth tokens
9. Set `minifyEnabled true` in release build type
10. Add `android:required="false"` to the `android.hardware.location.gps` feature declaration
11. Remove `USE_FINGERPRINT` permission (keep only `USE_BIOMETRIC`)
12. Complete the Data Safety form in Play Console covering location, device IDs, FCM tokens, and financial data
13. Host a privacy policy at a public URL and add it to the store listing

**Optional improvements:**

14. Scope `file_paths.xml` external path to a specific directory instead of `path="."`
15. Switch to `proguard-android-optimize.txt` in `build.gradle`
16. Replace plaintext keystore credentials in `keystore.properties` with CI environment variables

---

## 8. Approval Likelihood

### Current state: **Low likelihood**

Two hardcoded production security violations (`webContentsDebuggingEnabled: true` and `allowMixedContent: true`) are near-certain automatic rejection triggers. The unused permissions (`SCHEDULE_EXACT_ALARM`, Bluetooth ×4) add additional policy violation risk.

### After fixing blockers (items 1–7): **Medium-High likelihood**

Once the blockers are resolved, the app has a solid foundation:

- SDK targeting is compliant and ahead of requirements
- 64-bit support is properly configured
- Signing infrastructure is in place
- App identity is consistent across all config files
- Deep links and push notifications are properly structured

The remaining risk factors after fixing blockers are the `allowBackup` setting (security concern), the Data Safety form completeness, and the store listing assets (screenshots, feature graphic, privacy policy URL) which must be prepared separately in Play Console.

### After all recommendations applied: **High likelihood**
