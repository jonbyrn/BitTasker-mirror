# Deploy BitTasker to Google Play Store — Step-by-Step Guide

**Date:** March 11, 2026  
**App:** BitTasker (`com.bittasker.app`)  
**Stack:** SvelteKit (static adapter) + Capacitor 8 + Android

This guide walks through every step from a clean codebase to a live production app on Google Play Store. Complete all steps in order.

---

## Prerequisites

Before starting, ensure you have:

- [ ] Node.js 22+ installed
- [ ] Android Studio Otter 2025.2.1 or newer installed
- [ ] Java 17+ installed (required by Android Gradle Plugin 9)
- [ ] A Google account for Play Console
- [ ] The BitTasker upload keystore file (`.jks`) and its passwords
- [ ] Access to the `app.bittasker.com` server (to host `assetlinks.json`)

---

## Phase 1: Fix All Blockers

**Do not skip this phase.** Submitting with any of these issues will result in immediate rejection.

### Step 1.1 — Fix `capacitor.config.ts`

Open `capacitor.config.ts` and update the Android section:

```typescript
android: {
  allowMixedContent: false,          // was: true
  webContentsDebuggingEnabled: false // was: true
},
```

### Step 1.2 — Update `android/variables.gradle`

```groovy
ext {
    minSdkVersion = 24              // was: 23 (Capacitor 8 requires 24)
    compileSdkVersion = 36
    targetSdkVersion = 36
    androidxActivityVersion = '1.11.0'   // was: 1.9.2
    androidxAppCompatVersion = '1.7.1'   // was: 1.7.0
    androidxCoreVersion = '1.17.0'       // was: 1.15.0
    androidxFragmentVersion = '1.8.4'
    coreSplashScreenVersion = '1.0.1'
    androidxWebkitVersion = '1.12.1'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.2.1'
    androidxEspressoCoreVersion = '3.6.1'
    cordovaAndroidVersion = '10.1.1'
}
```

### Step 1.3 — Update `android/app/build.gradle`

Change the release build type and ProGuard file reference:

```groovy
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true                                              // was: false
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        // was: proguard-android.txt
    }
}
```

Also update the namespace syntax for AGP 9 compatibility:

```groovy
android {
    namespace = "com.bittasker.app"   // add the = sign
    compileSdk = rootProject.ext.compileSdkVersion
```

### Step 1.4 — Update `android/app/src/main/AndroidManifest.xml`

Make the following changes:

**a) Add `density` to configChanges:**

```xml
android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
```

**b) Add network security config and fix allowBackup:**

```xml
<application
    android:allowBackup="false"
    android:networkSecurityConfig="@xml/network_security_config"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"
    android:theme="@style/AppTheme">
```

**c) Fix permissions — remove these:**

```xml
<!-- REMOVE all of these: -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

**d) Add these permissions:**

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

**e) Fix GPS feature declaration:**

```xml
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

**Final permissions section should look like:**

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

### Step 1.5 — Create `network_security_config.xml`

Create the file at `android/app/src/main/res/xml/network_security_config.xml`:

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

### Step 1.6 — Create the notification icon

Create `android/app/src/main/res/drawable/ic_stat_notify.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM13,17h-2v-2h2v2zM13,13h-2L11,7h2v6z"/>
</vector>
```

> Alternatively, use Android Studio's **Image Asset** tool (right-click `res/` → New → Image Asset → Icon Type: Notification Icons) to generate a proper icon from the BitTasker logo.

### Step 1.7 — Update `proguard-rules.pro`

Add the following rules to `android/app/proguard-rules.pro`:

```proguard
# Keep line numbers for Sentry crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Firebase / Google Play Services
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Capacitor
-keep class com.getcapacitor.** { *; }
-keep class com.bittasker.** { *; }

# WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
```

---

## Phase 2: Generate App Assets

### Step 2.1 — Prepare source images

Create the `assets/` folder in the project root and place:

- `assets/icon-only.png` — 1024×1024 PNG, the BitTasker logo on a transparent or solid background
- `assets/splash.png` — 2732×2732 PNG, splash screen image (centered content, safe zone 1200×1200 center)
- `assets/icon-foreground.png` — 1024×1024 PNG, foreground layer for adaptive icon (transparent background)
- `assets/icon-background.png` — 1024×1024 PNG, background layer for adaptive icon (solid color or pattern)

### Step 2.2 — Generate all icon and splash densities

```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate
```

This generates:

- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` (48×48)
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` (72×72)
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` (96×96)
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` (144×144)
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` (192×192)
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` (adaptive icon)
- Splash screen drawables

### Step 2.3 — Prepare Play Console assets

Create the following images separately (not generated by `@capacitor/assets`):

- **App icon for Play Console:** 512×512 PNG, no rounded corners (Play applies shape)
- **Feature graphic:** 1024×500 JPEG or PNG, no alpha channel
- **Phone screenshots:** At least 2, maximum 8. Must show actual app UI. Recommended: 1080×1920 or 1440×2960

---

## Phase 3: Configure App Signing

### Step 3.1 — Verify keystore exists

Check that `android/keystore.properties` exists and contains:

```properties
storeFile=../your-keystore.jks
storePassword=your-store-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

If the keystore does not exist, generate one:

```bash
keytool -genkey -v \
  -keystore android/bittasker-upload.jks \
  -alias bittasker-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### Step 3.2 — Back up the keystore

**Critical:** Back up the keystore file and its passwords to a secure location (password manager, encrypted cloud storage). Losing the upload keystore requires a Google support request to reset, which can take weeks.

- Store the `.jks` file in a secure backup location
- Store the passwords in a password manager
- Never commit the keystore or `keystore.properties` to Git (already gitignored)

### Step 3.3 — Get your signing certificate SHA256 fingerprint

You'll need this for App Links verification:

```bash
keytool -list -v \
  -keystore android/bittasker-upload.jks \
  -alias bittasker-key
```

Copy the `SHA256` fingerprint from the output. You'll use it in Step 5.2.

---

## Phase 4: Build the Release AAB

### Step 4.1 — Build the SvelteKit web app

```bash
npm run build
```

Verify the `build/` directory is populated with the SvelteKit static output.

### Step 4.2 — Sync Capacitor

```bash
npx cap sync android
```

This copies the `build/` output into the Android project and updates Capacitor plugins.

### Step 4.3 — Increment version code

Open `android/app/build.gradle` and increment `versionCode`:

```groovy
versionCode 5           // increment from 4
versionName "1.0.5"     // update as appropriate
```

> **Rule:** `versionCode` must be strictly incremented on every Play Console upload. Never reuse a version code.

### Step 4.4 — Build the release AAB

```bash
cd android
./gradlew bundleRelease
```

The output AAB will be at:

```
android/app/build/outputs/bundle/release/app-release.aab
```

### Step 4.5 — Verify the AAB

```bash
# Check the AAB is valid and properly signed
cd android
./gradlew :app:bundleRelease --info
```

Optionally, use `bundletool` to test the AAB locally:

```bash
# Install bundletool
# https://github.com/google/bundletool/releases

java -jar bundletool.jar build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=test.apks \
  --ks=bittasker-upload.jks \
  --ks-key-alias=bittasker-key

java -jar bundletool.jar install-apks --apks=test.apks
```

---

## Phase 5: Configure App Links (Deep Links)

### Step 5.1 — Create the `assetlinks.json` file

Create the following JSON file and host it at `https://app.bittasker.com/.well-known/assetlinks.json`:

```json
[
	{
		"relation": ["delegate_permission/common.handle_all_urls"],
		"target": {
			"namespace": "android_app",
			"package_name": "com.bittasker.app",
			"sha256_cert_fingerprints": ["AA:BB:CC:DD:..."]
		}
	}
]
```

Replace `AA:BB:CC:DD:...` with the SHA256 fingerprint from Step 3.3.

### Step 5.2 — Verify App Links

After hosting the file, verify it using Google's Digital Asset Links API:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.bittasker.com&relation=delegate_permission/common.handle_all_urls
```

The response should include your app's package name and certificate fingerprint.

---

## Phase 6: Set Up Google Play Console

### Step 6.1 — Create developer account (if new)

1. Go to [play.google.com/console](https://play.google.com/console)
2. Sign in with your Google account
3. Complete the developer profile
4. Pay the one-time $25 registration fee
5. Accept the Developer Distribution Agreement

> **Important:** If this is a new personal account created after November 13, 2023, you must complete closed testing (12 testers × 14 days) before production access. See Phase 7.

### Step 6.2 — Create the app

1. In Play Console, click **Create app**
2. Fill in:
   - **App name:** BitTasker
   - **Default language:** English (United States)
   - **App or game:** App
   - **Free or paid:** Free (or Paid, depending on your model)
3. Accept the Developer Program Policies
4. Click **Create app**

### Step 6.3 — Complete the Store Listing

Navigate to **Grow → Store presence → Main store listing**:

**App details:**

- **App name:** BitTasker
- **Short description:** (≤80 chars) e.g., "Hire local service providers and pay with Bitcoin"
- **Full description:** (≤4000 chars) — describe the app's features, no keyword stuffing

**Graphics:**

- Upload the 512×512 app icon
- Upload the 1024×500 feature graphic
- Upload at least 2 phone screenshots

**Categorization:**

- **App category:** Business (or Productivity)
- **Tags:** Add relevant tags

**Contact details:**

- **Email:** your monitored support email
- **Website:** https://bittasker.com (or your website)
- **Privacy policy:** https://app.bittasker.com/privacy (or wherever it's hosted)

### Step 6.4 — Complete App Content requirements

Navigate to **Policy → App content** and complete all sections:

**a) Privacy policy**

- Enter the URL of your publicly hosted privacy policy
- Must be accessible without login

**b) App access**

- Select "All or most functionality is accessible without special access"
- OR provide demo account credentials if the reviewer needs to log in

**c) Ads**

- Select whether the app contains ads

**d) Content rating**

- Click **Start questionnaire**
- Answer all questions about content (violence, sexual content, etc.)
- For BitTasker: answer Yes to financial transactions, Yes to location sharing
- Submit and receive your rating

**e) Target audience**

- Select the intended age group (likely 18+ due to financial features)

**f) News apps**

- Select "No" (BitTasker is not a news app)

**g) COVID-19 contact tracing**

- Select "No"

**h) Data safety**

- Complete the Data Safety form (see Step 6.5)

**i) Financial features**

- Complete the Financial Features declaration (see Step 6.6)

### Step 6.5 — Complete the Data Safety Form

Navigate to **Policy → App content → Data safety**:

Declare the following data types:

| Category                 | Data Type            | Collected | Shared         | Optional |
| ------------------------ | -------------------- | --------- | -------------- | -------- |
| Location                 | Precise location     | Yes       | Yes (server)   | No       |
| Location                 | Approximate location | Yes       | Yes (server)   | No       |
| Personal info            | Name                 | Yes       | No             | No       |
| Personal info            | Email address        | Yes       | No             | No       |
| Identifiers              | Device or other IDs  | Yes       | Yes (FCM)      | No       |
| App activity             | App interactions     | Yes       | Yes (Firebase) | No       |
| App info and performance | Crash logs           | Yes       | Yes (Sentry)   | No       |
| Financial info           | Other financial info | Yes       | No             | No       |

For each data type, specify:

- **Why it's collected:** App functionality, Analytics, Developer communications, etc.
- **Is it encrypted in transit:** Yes (HTTPS)
- **Can users request deletion:** Yes (if you provide this feature)

### Step 6.6 — Complete the Financial Features Declaration

Navigate to **Policy → App content → Financial features**:

1. Click **Start declaration**
2. Select the financial features your app offers:
   - **Payments and transfers:** Yes (Bitcoin payments between users)
   - **Trading and funds:** Yes (Bitcoin wallet functionality)
3. If using a non-custodial model, indicate this clearly
4. Provide any required licensing documentation
5. Submit the declaration

> **Deadline:** This must be completed before any app update can be published. Complete it immediately.

### Step 6.7 — Set up Play App Signing

Navigate to **Release → Setup → App signing**:

1. Select **Use Google-managed key** (recommended) or **Export and upload a key from Java keystore**
2. If using Google-managed key:
   - Google will generate the distribution signing key
   - You upload your AAB signed with the upload key
   - Google re-signs the AAB with the distribution key for distribution
3. Download the **upload certificate** (you'll need its SHA256 for App Links)

> **Note:** Once enrolled in Play App Signing, you cannot opt out. The distribution key is managed by Google and cannot be exported.

---

## Phase 7: Closed Testing (New Accounts Only)

> Skip this phase if your developer account was created before November 13, 2023, or if it is an organization account.

### Step 7.1 — Create a closed test track

Navigate to **Release → Testing → Closed testing**:

1. Click **Create track** → name it "Alpha" or "Closed Beta"
2. Click **Create new release**
3. Upload your AAB
4. Add release notes
5. Click **Save and publish**

### Step 7.2 — Add 12 testers

1. Navigate to **Testers** tab in the closed testing track
2. Create a tester list with at least 12 email addresses
3. Share the opt-in URL with your testers
4. Each tester must:
   - Click the opt-in URL
   - Accept the tester invitation
   - Install the app from Play Store

### Step 7.3 — Wait 14 consecutive days

- The 14-day timer starts when all 12 testers have opted in and installed the app
- Monitor the **Testers** tab to ensure all 12 remain opted in
- Removing a tester resets the requirement (you need 12 at all times)
- App updates do NOT reset the timer

### Step 7.4 — Apply for production access

After 14 days:

1. Navigate to the Play Console Dashboard
2. Look for the "Apply for production access" prompt
3. Answer Google's questions about your app and testing process
4. Submit the application
5. Wait for Google's review (typically 1–3 business days)

---

## Phase 8: Production Release

### Step 8.1 — Create a production release

Navigate to **Release → Production**:

1. Click **Create new release**
2. Upload your signed AAB (`app-release.aab`)
3. Add release notes (what's new in this version)
4. Review the release

### Step 8.2 — Review the release

Play Console will show a pre-launch report. Check for:

- No policy warnings
- No crashes detected
- All required sections completed (green checkmarks)

### Step 8.3 — Roll out to production

1. Click **Start rollout to Production**
2. Choose rollout percentage:
   - **100%** — full release to all users immediately
   - **Staged rollout (e.g., 10%)** — gradual rollout to catch issues before full release
3. Confirm the rollout

> **Recommendation for first release:** Start with a staged rollout (10–20%) to catch any issues before reaching all users.

### Step 8.4 — Monitor the release

After publishing, monitor:

- **Android vitals** — crash rate, ANR rate
- **Reviews** — user feedback
- **Sentry** — crash reports
- **Play Console pre-launch report** — automated testing results

---

## Phase 9: Post-Launch Maintenance

### Updating the App

For every update:

1. Increment `versionCode` in `build.gradle` (must be strictly increasing)
2. Update `versionName` to reflect the new version
3. Build the release AAB: `./gradlew bundleRelease`
4. Upload to Play Console → Production → Create new release
5. Add release notes describing what changed

### Responding to Policy Violations

If Google sends a policy violation notice:

1. Read the violation notice carefully
2. Fix the issue in the codebase
3. Build and upload a new AAB
4. Submit an appeal if you believe the violation was incorrect

### Keeping Dependencies Updated

Regularly update:

- Capacitor and all Capacitor plugins
- Firebase SDK
- AndroidX dependencies
- `targetSdkVersion` (Google requires updating within 1 year of a new Android release)

---

## Quick Reference: Key Commands

```bash
# Build web app
npm run build

# Sync Capacitor
npx cap sync android

# Build release AAB
cd android && ./gradlew bundleRelease

# Generate app icons and splash screens
npx capacitor-assets generate

# Get keystore SHA256 fingerprint
keytool -list -v -keystore android/bittasker-upload.jks -alias bittasker-key

# Open Android Studio
npx cap open android
```

## Quick Reference: Key File Locations

| File                                                       | Purpose                              |
| ---------------------------------------------------------- | ------------------------------------ |
| `capacitor.config.ts`                                      | Capacitor configuration              |
| `android/app/build.gradle`                                 | Android build configuration          |
| `android/variables.gradle`                                 | SDK versions and dependency versions |
| `android/app/src/main/AndroidManifest.xml`                 | App permissions and components       |
| `android/app/src/main/res/xml/network_security_config.xml` | Network security policy              |
| `android/app/src/main/res/xml/file_paths.xml`              | FileProvider paths                   |
| `android/app/proguard-rules.pro`                           | ProGuard/R8 keep rules               |
| `android/keystore.properties`                              | Keystore credentials (gitignored)    |
| `android/app/build/outputs/bundle/release/app-release.aab` | Release AAB output                   |

## Quick Reference: Play Console Navigation

| Task               | Path                                       |
| ------------------ | ------------------------------------------ |
| Store listing      | Grow → Store presence → Main store listing |
| Data Safety form   | Policy → App content → Data safety         |
| Financial Features | Policy → App content → Financial features  |
| Content rating     | Policy → App content → App content rating  |
| App signing        | Release → Setup → App signing              |
| Closed testing     | Release → Testing → Closed testing         |
| Production release | Release → Production                       |
| Android vitals     | Android vitals → Overview                  |
