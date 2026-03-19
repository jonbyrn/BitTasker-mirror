# Google Play Store Compliance Action Plan

**App:** BitTasker (`com.bittasker.app`)  
**Date:** March 15, 2026  
**Stack:** SvelteKit (static adapter) + Capacitor 8 + Android  
**Audit basis:** Full codebase analysis + Google Play Developer Program Policy (effective March 4, 2026)

> This document supersedes all previous audit reports. It reflects the **current state of the codebase** as of March 15, 2026 and identifies only what still needs to be done.

---

## Summary

Most of the critical technical blockers identified in the earlier audits have been resolved. The Android configuration is correct. The remaining work is concentrated in one area:

1. **Play Console declarations** — Financial Features, Data Safety, Content Rating, and Target Audience (with "Restrict Minor Access" enabled) forms must be completed in Play Console.

> **Corrections (March 19, 2026):** Previous versions of this document incorrectly flagged: namespace Groovy DSL syntax, `ic_stat_notify` drawable coverage, splash screen assets, `assetlinks.json` hosting, privacy policy in-app link, and age verification checkbox — all were either already implemented or not required by policy. The UGC moderation SLA and Sentry Android source maps have now been fixed.

**Estimated readiness: ~90%** — the remaining items are Play Console configuration only.

---

## Legend

| Symbol | Meaning                                            |
| ------ | -------------------------------------------------- |
| 🔴     | Blocker — will cause rejection or policy violation |
| 🟠     | High — strongly recommended before submission      |
| 🟡     | Low — optional improvement                         |
| ✅     | Already implemented — confirmed in codebase        |

---

## Section 1: What Is Already Implemented

The following items from previous audit reports have been **confirmed as implemented** in the current codebase. No action needed.

### Android Configuration

| Item                                                                           | Status | Evidence                                                                                                           |
| ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `webContentsDebuggingEnabled` is environment-conditional (false in production) | ✅     | `capacitor.config.ts`: `enableDebugWebView = process.env.CAPACITOR_DEBUG_WEBVIEW === 'true'`                       |
| `allowMixedContent` is environment-conditional (false in production)           | ✅     | Same conditional as above                                                                                          |
| `network_security_config.xml` created and referenced in manifest               | ✅     | File exists at `android/app/src/main/res/xml/network_security_config.xml` with `cleartextTrafficPermitted="false"` |
| `android:allowBackup="false"`                                                  | ✅     | `AndroidManifest.xml` line 4                                                                                       |
| `android:networkSecurityConfig="@xml/network_security_config"`                 | ✅     | `AndroidManifest.xml` line 5                                                                                       |
| `POST_NOTIFICATIONS` permission declared                                       | ✅     | `AndroidManifest.xml`                                                                                              |
| `ACCESS_NETWORK_STATE` permission declared                                     | ✅     | `AndroidManifest.xml`                                                                                              |
| Bluetooth permissions removed                                                  | ✅     | Not present in `AndroidManifest.xml`                                                                               |
| `SCHEDULE_EXACT_ALARM` removed                                                 | ✅     | Not present in `AndroidManifest.xml`                                                                               |
| `USE_FINGERPRINT` removed                                                      | ✅     | Not present in `AndroidManifest.xml`                                                                               |
| `android.hardware.location.gps` has `android:required="false"`                 | ✅     | `AndroidManifest.xml`                                                                                              |
| `density` added to `configChanges`                                             | ✅     | `AndroidManifest.xml`                                                                                              |
| `minSdkVersion = 24`                                                           | ✅     | `android/variables.gradle`                                                                                         |
| `compileSdkVersion = 36`, `targetSdkVersion = 36`                              | ✅     | `android/variables.gradle`                                                                                         |
| AndroidX versions meet Capacitor 8 minimums                                    | ✅     | `androidxActivityVersion = '1.11.0'`, `androidxCoreVersion = '1.17.0'`, `androidxAppCompatVersion = '1.7.1'`       |
| `minifyEnabled true` in release build                                          | ✅     | `android/app/build.gradle`                                                                                         |
| `proguard-android-optimize.txt` used                                           | ✅     | `android/app/build.gradle`                                                                                         |
| ProGuard rules for Sentry, Firebase, Capacitor                                 | ✅     | `android/app/proguard-rules.pro`                                                                                   |
| `FileProvider` scoped to specific directories                                  | ✅     | `file_paths.xml` uses `Pictures/`, `external_files`, `image_cache/`                                                |
| Launcher icon PNGs in all `mipmap-*` density folders                           | ✅     | `mipmap-hdpi/`, `mipmap-mdpi/`, `mipmap-xhdpi/`, `mipmap-xxhdpi/`, `mipmap-xxxhdpi/` all contain `ic_launcher.png` |
| Signing configured via `keystore.properties`                                   | ✅     | `build.gradle` lines 4–8, 33–42                                                                                    |
| `applicationId = "com.bittasker.app"`                                          | ✅     | Consistent across all config files                                                                                 |
| 64-bit ABI support                                                             | ✅     | `abiFilters 'arm64-v8a', 'armeabi-v7a'`                                                                            |
| Adaptive icons configured                                                      | ✅     | `mipmap-anydpi-v26/ic_launcher.xml`                                                                                |

### In-App Features

| Item                                                                       | Status | Evidence                                                                                    |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| In-app UGC reporting (NIP-56 kind 1984)                                    | ✅     | `src/lib/nostr/report.ts`, `ReportModal.svelte`                                             |
| In-app user blocking/muting (NIP-51 kind 10000)                            | ✅     | `src/lib/stores/mute.store.ts`, `src/lib/nostr/muteList.ts`                                 |
| `ActionsMenu` on task cards, bid cards, messages, profiles                 | ✅     | Confirmed in `TaskCard.svelte`, `ChatMessage.svelte`, `npub/[npub]/+page.svelte`, bids page |
| Muted users management in settings                                         | ✅     | `MutedUsers.svelte` in settings page                                                        |
| Account deletion flow (in-app)                                             | ✅     | `DeleteAccountModal.svelte`, `AccActions.svelte`                                            |
| Account deletion web page                                                  | ✅     | `src/routes/(company)/delete-account/+page.svelte`                                          |
| Privacy policy page                                                        | ✅     | `src/routes/(company)/privacy/+page.svelte`                                                 |
| Terms of service page                                                      | ✅     | `src/routes/(company)/terms/+page.svelte`                                                   |
| Notification permission banner with rationale                              | ✅     | `NotificationPermissionBanner.svelte`                                                       |
| Location permission request with rationale                                 | ✅     | `LocationSetup.svelte` (onboarding), `EnhancedLocationPicker.svelte`                        |
| Camera permission check before request                                     | ✅     | `LoginQrCodeScannerModal.svelte`, `QrCodeScanner.svelte`                                    |
| End-to-end encrypted messaging (Nostr NIP-44)                              | ✅     | Confirmed in policy compliance doc                                                          |
| Moderation translations (EN + ES)                                          | ✅     | `static/locales/en/moderation.json`, `static/locales/es/moderation.json`                    |
| No Google Play Billing used                                                | ✅     | No `BillingClient` or in-app purchase code found                                            |
| Bitcoin payments for real-world services (exempt from Google Play Billing) | ✅     | Core business model                                                                         |

---

## Section 2: Issues That Must Be Fixed

### ~~🔴 BLOCKER 1 — `namespace` syntax in `build.gradle` (AGP 9 compatibility)~~ ✅ NOT AN ISSUE

**Verified:** The project uses AGP **8.9.1** (Groovy DSL), not AGP 9. In Groovy DSL, `namespace "com.bittasker.app"` (without `=`) is the **correct and standard syntax**. The `=` sign is only required in Kotlin DSL (`.kts` files). This is confirmed by the official Android Gradle Plugin documentation and AGP 8.x release notes.

The current `android/app/build.gradle` line 11 is correct as-is:

```groovy
namespace "com.bittasker.app"
```

No action needed.

---

### ~~🔴 BLOCKER 2 — `ic_stat_notify` not in density-specific drawable folders~~ ✅ NOT AN ISSUE

**Verified by codebase scan:** The compliance doc was incorrect. `ic_stat_notify` assets exist in **all required density folders**:

- `drawable-anydpi-v24/ic_stat_notify.xml` — vector XML for API 24+ (generated by Android Studio Image Asset tool)
- `drawable-hdpi/ic_stat_notify.png` ✅
- `drawable-mdpi/ic_stat_notify.png` ✅
- `drawable-xhdpi/ic_stat_notify.png` ✅
- `drawable-xxhdpi/ic_stat_notify.png` ✅

This is the **correct and recommended structure** when using Android Studio's "Notification Icons" generator. The PNG files serve as density-specific raster fallbacks, and the `anydpi-v24` XML vector is used on API 24+. With `minSdkVersion = 24`, the PNG files in density folders are technically redundant but harmless and provide extra compatibility insurance.

No action needed.

---

### 🔴 BLOCKER 3 — Financial Features Declaration not completed in Play Console

**Location:** Play Console → Policy → App content → Financial features

This form **must be completed before any app update can be published**. As of October 30, 2025, failure to complete it blocks all future updates.

**What to declare for BitTasker:**

- **Payments and transfers:** Yes — Bitcoin payment facilitation between Taskers and Taskees
- **Trading and funds:** Depends on implementation — if users hold Bitcoin in a BitTasker-managed wallet, declare Yes; if non-custodial (users control their own keys), this may be No

**Critical clarification (confirmed by Google Play policy, January 28, 2026):**

> Non-custodial wallets are explicitly out of scope of the Cryptocurrency Exchanges and Software Wallets policy.

If BitTasker uses a non-custodial model (users control their Nostr keys and Bitcoin keys directly), state this clearly in the declaration. No financial licensing is required for non-custodial wallets.

**Action:** Complete this form in Play Console before first submission.

---

### 🔴 BLOCKER 4 — Data Safety Form not completed in Play Console

**Location:** Play Console → Policy → App content → Data safety

Inaccurate or incomplete declarations are an enforceable policy violation and can result in app removal after publication.

**Declare the following data types:**

| Category                 | Data Type            | Collected | Shared                         | Purpose               |
| ------------------------ | -------------------- | --------- | ------------------------------ | --------------------- |
| Location                 | Precise location     | Yes       | Yes (server for task matching) | App functionality     |
| Location                 | Approximate location | Yes       | Yes                            | App functionality     |
| Personal info            | Name                 | Yes       | No                             | App functionality     |
| Personal info            | Email address        | Yes       | No                             | App functionality     |
| Identifiers              | Device or other IDs  | Yes       | Yes (FCM registration)         | Push notifications    |
| App activity             | App interactions     | Yes       | Yes (Firebase)                 | Push notifications    |
| App info and performance | Crash logs           | Yes       | Yes (Sentry)                   | Crash reporting       |
| Financial info           | Other financial info | Yes       | No                             | App functionality     |
| Messages                 | In-app messages      | Yes       | No                             | App functionality     |
| Photos and videos        | Photos               | Yes       | No                             | Task evidence/profile |

**Third-party SDKs that collect data automatically (must be declared):**

- **Firebase / FCM** — device identifiers, app diagnostics
- **Sentry** (`@sentry/sveltekit`) — crash reports, stack traces, device info
- **Google MLKit** (barcode scanning) — camera data processed on-device only (no transmission needed to declare)

**Action:** Complete this form in Play Console. Every data type must be declared with its purpose, whether it's encrypted in transit (Yes — HTTPS), and whether users can request deletion (Yes — account deletion flow exists).

---

### 🔴 BLOCKER 5 — Content Rating (IARC) questionnaire not completed

**Location:** Play Console → Policy → App content → App content rating

The IARC questionnaire must be completed before production submission. Without it, the app cannot be submitted.

**Expected answers for BitTasker:**

| Question                        | Answer |
| ------------------------------- | ------ |
| Violence                        | No     |
| Sexual content                  | No     |
| Profanity                       | No     |
| Controlled substances           | No     |
| Financial transactions (in-app) | Yes    |
| Location sharing                | Yes    |
| User-generated content          | Yes    |

**Expected rating:** Teen (T) or Mature 17+ (M) — the financial transaction and UGC aspects push it above "Everyone."

**Action:** Complete the questionnaire in Play Console.

---

### 🔴 BLOCKER 6 — Target Audience not set in Play Console

**Location:** Play Console → Policy → App content → Target audience and content

BitTasker involves real-money Bitcoin transactions. Per Google Play's Age-Restricted Content policy (effective October 30, 2025), apps with real-money features must block minors.

**Action:** Set Target Audience to **Adults only (18+)** in Play Console. This is a declaration, not a technical enforcement mechanism — but it is required.

**Note on in-app age verification:** Setting "Adults only (18+)" in Play Console is a store-level declaration. Google Play's policy does NOT require you to add a separate in-app age verification mechanism if you declare adults-only in the console. The Age Signals API (live in Texas since Jan 1, 2026) is an optional enhancement — it is not currently mandatory unless you are specifically targeting US states with active enforcement. The minimum viable approach (self-declaration checkbox at signup) described in HIGH 2 below remains a best practice but is not a hard blocker for Play Store submission.

---

### ~~🟠 HIGH 1 — Privacy policy not linked inside the authenticated app~~ ✅ NOT AN ISSUE

**Verified by codebase scan (March 19, 2026):** Privacy Policy and Terms of Service links ARE accessible from within the authenticated app. They exist in `BottomNavBar.svelte` (lines 334, 340, 653, 659) which is rendered in the authenticated dashboard. The hamburger/side menu in the bottom navigation bar contains direct links to `/privacy` and `/terms`.

Google Play's requirement is that the privacy policy be accessible "within the app" — it does not mandate that it be specifically on the settings page. The BottomNavBar is present throughout the authenticated experience and satisfies this requirement.

No action needed.

---

### ~~🟠 HIGH 2 — Age verification not enforced at account creation~~ ✅ NOT REQUIRED BY POLICY

**Verified by Google Play policy research (March 19, 2026):**

Google Play's "Age-Restricted Content and Functionality" policy (at `support.google.com/googleplay/android-developer/answer/16302250`) only **mandates** the "Restrict Minor Access" feature for:

1. Apps that facilitate **matchmaking or dating**
2. Apps that facilitate **real-money gambling, games, and contests**

BitTasker is a **gig economy / task marketplace** with Bitcoin payments for real-world services. It is NOT a gambling app. The "Restrict Minor Access" feature is a **Play Console setting**, not an in-app checkbox.

**What is actually required:**

- Set "Target Audience: Ages 18 and over" in Play Console → this is a store-level declaration
- Check the "Restrict Minor Access" box in Play Console → this prevents Google-identified minors from downloading the app

**No in-app age verification checkbox is required by Google Play policy for this type of app.**

The Terms of Service already states: _"BitTasker only permits individuals over 18 years of age to become Users"_ (section 2, point 2). This is sufficient as a ToS commitment.

**Note on Age Signals API:** The Texas enforcement was paused by a federal court injunction as of early 2026. Utah enforcement begins May 7, 2026 and Louisiana on July 1, 2026. This API is not currently mandatory.

No code change needed. Play Console action required.

---

### ~~🟠 HIGH 3 — Relay operator SLA for UGC moderation not documented~~ ✅ FIXED (March 19, 2026)

**What was done:** The Terms of Service (`static/locales/en/company/terms.json` and `static/locales/es/company/terms.json`) have been updated with specific review timeframe commitments in section 3a:

- Illegal content / nudity: **reviewed within 24 hours**
- Spam / profanity / hate speech: **reviewed within 72 hours**
- Impersonation / harassment: **reviewed within 48 hours**
- All other reports: **reviewed within 7 days**

The `src/routes/(company)/terms/+page.svelte` component was also updated to render the new SLA section.

**What "SLA" means:** Service Level Agreement — a commitment in your Terms of Service about how quickly you will review and act on reports. Google Play requires "timely action" on UGC reports. You do NOT need to control the relay infrastructure — the in-app reporting tools (NIP-56 kind 1984) already implemented are sufficient as the technical layer.

---

### ~~🟠 HIGH 4 — `assetlinks.json` not hosted for App Links verification~~ ⚠️ PARTIALLY RESOLVED — NEEDS FINGERPRINT VERIFICATION

**Verified by codebase scan:** `assetlinks.json` exists in **two locations** in the codebase:

- `src/routes/.well-known/assetlinks.json` (SvelteKit route — served at `/.well-known/assetlinks.json`)
- `static/.well-known/assetlinks.json` (static file — also served at `/.well-known/assetlinks.json`)

The file already contains a SHA256 fingerprint:

```
15:14:39:BE:1B:16:7D:C7:48:C8:DD:1C:4D:AB:6A:0E:0C:80:C8:8C:81:4C:C4:C1:17:A1:38:18:D1:74:FB:8A
```

**The file is present in the codebase and will be served when the app is deployed.** The compliance doc was wrong to say it was not hosted.

**What still needs verification:**

1. Confirm the SHA256 fingerprint in the file matches your **Play App Signing certificate** (not the upload key). If you enrolled in Play App Signing, Google re-signs the AAB — you must use the fingerprint from Play Console → Release → Setup → App signing.
2. Confirm the file is accessible at `https://app.bittasker.com/.well-known/assetlinks.json` after deployment.

**Note on having it in both `routes/` and `static/`:** This is redundant but not a problem. SvelteKit's static adapter will serve the file from `static/` as a static asset. The route in `src/routes/.well-known/` may conflict or be overridden by the static file — this is harmless but you can remove the route version if desired. The static file is what matters.

---

### ~~🟠 HIGH 5 — Splash screen asset not confirmed~~ ✅ NOT AN ISSUE

**Verified by codebase scan:** Splash screen assets exist in a comprehensive set of density and orientation folders. The compliance doc was incorrect.

Confirmed splash.png exists in:

- `drawable/splash.png` (base fallback)
- `drawable-port-hdpi/splash.png`, `drawable-port-mdpi/splash.png`, `drawable-port-xhdpi/splash.png`, `drawable-port-xxhdpi/splash.png`, `drawable-port-xxxhdpi/splash.png` (portrait densities)
- `drawable-land-hdpi/splash.png`, `drawable-land-mdpi/splash.png`, `drawable-land-xhdpi/splash.png`, `drawable-land-xxhdpi/splash.png`, `drawable-land-xxxhdpi/splash.png` (landscape densities)
- Night mode variants in `drawable-port-night-*/` and `drawable-land-night-*/` folders

This is the full density-specific structure generated by `@capacitor/assets`. No action needed.

**Note on Android 12+:** On Android 12 and above, the OS uses the new Splash Screen API (icon + background color) and ignores the full-screen `splash.png` drawable. This is expected behavior — the `androidx.core:core-splashscreen` library (already a dependency) handles backward compatibility.

---

### ~~🟡 LOW 1 — `namespace` syntax in `build.gradle`~~ ✅ NOT AN ISSUE

See the corrected Blocker 1 section above. No action needed.

---

### ~~🟡 LOW 2 — Sentry source maps for Android/Capacitor~~ ✅ FIXED (March 19, 2026)

**What was done:**

1. **`vite.config.ts`**: Changed `sourcemap: false` → `sourcemap: 'hidden'`. This generates `.map` files during the build (required for Sentry to work) but does not embed `sourceMappingURL` references in the output JS files (so source maps are not publicly accessible). The `sentrySvelteKit` plugin then uploads them to Sentry and deletes them via `filesToDeleteAfterUpload: ['./build/**/*.map']`.

2. **`package.json`**: Added two new scripts:
   - `"sentry:android"` — runs `sentry-cli sourcemaps inject` then `sentry-cli sourcemaps upload` on the Android assets folder
   - `"android:build:release"` — now chains `sentry:android` between `android:build` and `gradlew assembleRelease`

**Why the warnings appeared:** Running `sentry-cli sourcemaps inject` with `sourcemap: false` produced "could not determine a source map reference" warnings for every JS file because no `.map` files existed. With `sourcemap: 'hidden'`, the `.map` files are generated, the web plugin uploads and deletes them, and the Android `sentry:android` script handles the Capacitor assets.

**`sentry-cli` must be installed globally** (`npm install -g @sentry/cli`) or available in the CI environment. The `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` env vars must be set.

---

### 🟡 LOW 3 — JavaScript interface security (WebView policy)

**Google Play policy:** Apps with WebView must not allow JavaScript loaded at runtime to violate Play policies through the `addJavascriptInterface` method. Sensitive functionality (permissions, user data, accessibility, SMS) must not be exposed through JavaScript interfaces to untrusted content.

**Current state:** Capacitor uses `addJavascriptInterface` internally to bridge JS to native. This is standard and expected. The risk is if BitTasker loads **untrusted external URLs** in the WebView and those pages can access the Capacitor bridge.

**Check:** Verify that the app does not load external, untrusted URLs inside the Capacitor WebView. External links should open in the system browser (`@capacitor/browser` plugin or `window.open`), not inside the app's WebView.

---

## Section 3: New 2026 Policy Requirements

### 3.1 Developer Identity Verification (March 2026)

Google's mandatory developer verification policy launches in March 2026 and will be enforced starting September 2026 in Brazil, Indonesia, Singapore, and Thailand.

**Requirements:**

- Pay the one-time $25 registration fee (already done if account exists)
- Create a Google payment profile
- Provide government-issued ID
- Declare app identifiers

**Action:** Ensure the developer account has completed identity verification in Play Console before targeting these markets.

### 3.2 Cryptocurrency Wallet Policy (January 28, 2026)

Google Play's cryptocurrency wallet policy is now in effect. Key clarification:

> **Non-custodial wallets are explicitly out of scope** of the Cryptocurrency Exchanges and Software Wallets policy.

If BitTasker uses a non-custodial model (users control their own Bitcoin/Lightning/Liquid keys), no financial licensing is required for the wallet features. However, you must still:

1. Complete the Financial Features Declaration in Play Console (see Blocker 3)
2. Clearly state the non-custodial nature of the wallet in the declaration
3. If targeting regulated jurisdictions (US, EU, UK, etc.) with custodial features, obtain appropriate licenses

### 3.3 Age Signals API (January 1, 2026)

Google's Age Signals API is now live in Texas, USA (with Utah on May 7, Louisiana on July 1, 2026). This API provides age verification from the Play Store account.

**Current requirement:** Apps with real-money features must block minors. The minimum viable approach is self-declaration at signup (see High 2 above).

**Future consideration:** If BitTasker targets US states with active Age Signals API enforcement, integrating the API provides stronger compliance. This is not required immediately but should be planned for.

### 3.4 Target SDK Requirement (August 31, 2025 — Already Compliant)

BitTasker targets `targetSdkVersion = 36`, which exceeds the current requirement of API 35. ✅ No action needed.

---

## Section 4: Play Console Checklist

These items must be completed in Play Console before submission. They are not code changes.

| Item                                              | Status                              | Location in Play Console                         |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Financial Features Declaration                    | ⚠️ Must complete                    | Policy → App content → Financial features        |
| Data Safety Form                                  | ⚠️ Must complete                    | Policy → App content → Data safety               |
| IARC Content Rating                               | ⚠️ Must complete                    | Policy → App content → App content rating        |
| Target Audience (18+)                             | ⚠️ Must set                         | Policy → App content → Target audience           |
| Privacy Policy URL                                | ⚠️ Must add                         | Store presence → Store listing → Contact details |
| App Access (demo credentials or "all accessible") | ⚠️ Must complete                    | Policy → App content → App access                |
| Ads declaration                                   | ⚠️ Must complete                    | Policy → App content → Ads                       |
| Play App Signing enrollment                       | ⚠️ Must enroll                      | Release → Setup → App signing                    |
| Closed testing (12 testers × 14 days)             | ⚠️ Required if new personal account | Release → Testing → Closed testing               |

---

## Section 5: Store Assets Checklist

These assets must be prepared and uploaded to Play Console.

| Asset                     | Dimensions               | Format                          | Status     |
| ------------------------- | ------------------------ | ------------------------------- | ---------- |
| App icon (Play Console)   | 512 × 512 px             | PNG (32-bit, no alpha rounding) | ⚠️ Prepare |
| Feature graphic           | 1024 × 500 px            | JPEG or PNG (no alpha)          | ⚠️ Prepare |
| Phone screenshots (min 2) | Min 320px short side     | JPEG or PNG ≤8 MB               | ⚠️ Prepare |
| App name                  | "BitTasker" (9 chars ✓)  | —                               | ✅         |
| Short description         | ≤80 chars                | No keyword stuffing             | ⚠️ Write   |
| Full description          | ≤4000 chars              | No keyword stuffing             | ⚠️ Write   |
| Category                  | Business or Productivity | —                               | ⚠️ Select  |
| Contact email             | Monitored email          | —                               | ⚠️ Add     |

**Screenshot requirements:**

- Must show **actual app UI**, not mockups or marketing renders
- Must accurately represent the current version of the app
- Recommended resolution: 1080×1920 or 1440×2960

---

## Section 6: Code Changes Required — Summary

The following code changes are needed. All other items are Play Console configuration or asset preparation.

> **Note:** After re-verification of the codebase (March 19, 2026), Blockers 1 and 2 from the previous version of this document were found to be **non-issues**. The namespace syntax is correct for Groovy DSL, and `ic_stat_notify` already has density-specific PNG files. The splash screen and `assetlinks.json` were also already present. The actual remaining code changes are:

### Priority 1 — Blockers (must fix before submission)

1. **Play Console declarations** — Financial Features, Data Safety, Content Rating, and Target Audience forms must be completed. These are Play Console configuration tasks, not code changes.

### Priority 1 — Play Console (must complete before submission)

2. **Financial Features Declaration** — Play Console → Policy → App content → Financial features
3. **Data Safety Form** — Play Console → Policy → App content → Data safety
4. **IARC Content Rating** — Play Console → Policy → App content → App content rating
5. **Target Audience: Ages 18 and over + enable "Restrict Minor Access"** — Play Console → Policy → App content → Target audience

### Priority 2 — Verify (no code change needed)

6. **Verify `assetlinks.json` fingerprint** — The file exists at `static/.well-known/assetlinks.json`. Confirm the SHA256 fingerprint matches the **Play App Signing certificate** (from Play Console → Release → Setup → App signing), not the upload key.

### Already Fixed (March 19, 2026)

- ✅ UGC moderation SLA added to Terms of Service (EN + ES)
- ✅ Sentry source maps: `sourcemap: 'hidden'` set in `vite.config.ts`, `sentry:android` script added to `package.json`, `android:build:release` now chains sentry upload automatically

---

## Section 7: Compliance Status by Google Play Policy Category

| Policy Category                                          | Status | Notes                                                               |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Restricted Content (child safety, inappropriate content) | ✅     | Not applicable; adult platform                                      |
| User-Generated Content                                   | ⚠️     | Reporting/blocking implemented; relay SLA missing                   |
| Financial Services                                       | ⚠️     | Financial Features Declaration must be completed                    |
| Blockchain Content                                       | ⚠️     | Non-custodial status must be declared                               |
| Age-Restricted Content                                   | ⚠️     | Age verification at signup missing                                  |
| Privacy / User Data                                      | ⚠️     | Data Safety form + in-app privacy link needed                       |
| Account Deletion                                         | ✅     | In-app flow + web page both implemented                             |
| Permissions                                              | ✅     | All permissions justified; unused ones removed                      |
| Network Security                                         | ✅     | `network_security_config.xml` in place                              |
| WebView Security                                         | ✅     | Debug flags conditional on env var                                  |
| Backup Security                                          | ✅     | `allowBackup="false"`                                               |
| Intellectual Property                                    | ✅     | Original branding; no impersonation                                 |
| Malware / Security                                       | ✅     | No backdoors, spyware, or malicious code                            |
| Store Listing Metadata                                   | ⚠️     | Assets and descriptions not yet prepared                            |
| Content Rating                                           | ⚠️     | IARC questionnaire not completed                                    |
| Target Audience                                          | ⚠️     | Must be set to Adults (18+)                                         |
| Google Play Billing                                      | ✅     | Not applicable; Bitcoin payments for real-world services are exempt |
| SDK Compliance                                           | ✅     | Firebase, Sentry, Capacitor — all policy-compliant SDKs             |

---

## Section 8: Estimated Approval Likelihood

### Current state: **Medium-High**

The major technical blockers from earlier audits have been resolved. The remaining items are primarily Play Console configuration and minor code additions.

### After completing all items in this document: **High**

The app has a solid technical foundation:

- SDK targeting is compliant and ahead of requirements (API 36)
- 64-bit support is properly configured
- Signing infrastructure is in place
- Security configuration is correct
- Moderation system is implemented
- Account deletion is implemented

The remaining risk factors are the Play Console declarations (Financial Features, Data Safety, Content Rating) and the age verification requirement — both of which are straightforward to resolve.

---

_Sources: Google Play Developer Program Policy (effective March 4, 2026) · Cryptocurrency Exchanges and Software Wallets Policy (January 28, 2026) · Age Signals API documentation (January 2026) · Android Gradle Plugin 8.9 release notes · Sentry SvelteKit + Capacitor source maps documentation · Full codebase re-verification (March 19, 2026)_
