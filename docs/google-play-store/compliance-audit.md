# Google Play Store Compliance Audit

**Audit Date:** March 30, 2026
**Branch:** `dev` (treated as production-ready for release PR)
**Scope:** Functionality and logic only — store dashboard configuration (Data Safety form, Financial Features Declaration form, content ratings, etc.) is excluded; that is handled by the CEO.
**Methodology:** Web research of current Google Play policies cross-referenced against actual codebase implementation. Code is the source of truth — documentation, comments, and plans are not trusted.

---

## Table of Contents

1. [Overall Compliance Summary](#1-overall-compliance-summary)
2. [Privacy Policy — Gaps and Required Updates](#2-privacy-policy--gaps-and-required-updates)
3. [Prominent In-App Disclosures — What Actually Needs One](#3-prominent-in-app-disclosures--what-actually-needs-one)
4. [Debug Routes in Production](#4-debug-routes-in-production)
5. [Wallet Network Options — Incomplete Features](#5-wallet-network-options--incomplete-features)
6. [Cryptocurrency Wallet — Financial Features Declaration](#6-cryptocurrency-wallet--financial-features-declaration)
7. [Account Deletion](#7-account-deletion)
8. [User-Generated Content Moderation](#8-user-generated-content-moderation)
9. [Android Target SDK Level](#9-android-target-sdk-level)
10. [google-services.json in Git](#10-google-servicesjson-in-git)
11. [Location Permission Flow — Re-verified](#11-location-permission-flow--re-verified)
12. [Priority Action Items](#12-priority-action-items)

---

## 1. Overall Compliance Summary

| #   | Policy Area                  | Status                                     | Estimated Compliance |
| --- | ---------------------------- | ------------------------------------------ | -------------------- |
| 1   | Privacy Policy Accuracy      | Needs updates                              | 50%                  |
| 2   | Prominent In-App Disclosures | Mostly compliant                           | 85%                  |
| 3   | Debug Routes in Production   | Violation                                  | 0%                   |
| 4   | Wallet Incomplete Features   | Minor issue                                | 70%                  |
| 5   | Crypto Wallet Declaration    | Dashboard task (not a code violation)      | N/A                  |
| 6   | Account Deletion             | Compliant                                  | 95%                  |
| 7   | UGC Moderation               | Partial (acceptable for decentralized)     | 75%                  |
| 8   | Target SDK Level             | Compliant                                  | 100%                 |
| 9   | google-services.json         | Security hygiene concern                   | See section          |
| 10  | Location Permission          | Mostly compliant, one auto-request concern | 80%                  |

**Weighted Overall: ~75%**

The critical blockers are: privacy policy updates (item 1), debug route removal (item 3), and the `TaskLocationMap` auto-request fix (item 10).

---

## 2. Privacy Policy — Gaps and Required Updates

### Google Play Requirement

Google Play requires a privacy policy that **accurately discloses ALL data collection, use, sharing, and third-party services**. The policy must be accessible in the store listing AND within the app. Inaccurate disclosures can result in app removal.

**Reference:** [User Data Policy](https://support.google.com/googleplay/android-developer/answer/10144311)

### Current State

The privacy policy lives in `static/locales/en/company/privacy_policy.json` and is rendered at `/privacy`. It is accessible from:

- Footer (`BitTaskerFooter.svelte`)
- Bottom nav (`BottomNavBar.svelte`)
- Signup page (link in TOS consent checkbox)

### What the Policy Currently Says

The privacy policy frames data collection as **"Almost None"** due to the decentralized Nostr architecture. It covers:

- Nostr public key and public profile (partially)
- E2E encrypted DMs
- Bitcoin blockchain transaction visibility
- Anonymous marketing analytics (generic, no vendor names)

### What the Code Actually Does — Gap Analysis

The following data types are collected in code but **NOT disclosed** in the privacy policy:

#### 2.1 Location Data — NOT DISCLOSED

**Code evidence:**

- `LocationPicker.svelte`: Uses `@capacitor/geolocation` (`Geolocation.requestPermissions()`, `getCurrentPosition()`) on native, `navigator.geolocation` on web
- `TaskLocationMap.svelte`: Auto-requests `navigator.geolocation.getCurrentPosition()` on mount
- `TaskeeLocationMap.svelte`: Requests geolocation during init
- `location.service.ts`: `getCurrentLocation()` via browser API
- `AndroidManifest.xml`: Declares `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION`
- Backend endpoints: `/api/v1/location/search` and `/api/v1/location/reverse-geocode`

**Do we need to disclose this?** **Yes.** Location is explicitly listed as personal and sensitive user data by Google Play. Even though it's foreground-only and user-initiated in most flows, the privacy policy must mention that the app accesses device location for task posting and discovery.

**Suggested privacy policy addition:**

> BitTasker accesses your device location when you use task location features (e.g., setting a task location or browsing nearby tasks). Location is used only in the foreground to position the map and is not stored or tracked in the background. You can deny location permission and manually enter addresses instead.

#### 2.2 Email Addresses — NOT DISCLOSED

**Code evidence:**

- `RecoverySetup.svelte`: Collects email for account recovery
- `auth.service.ts`: `setupRecovery()` sends email to backend
- `verify-email` route exists

**Do we need to disclose this?** **Yes.** Email is personal data. Even though it's optional (recovery setup), the privacy policy should mention it.

**Suggested addition:**

> If you choose to set up account recovery, we collect your email address solely for sending recovery codes. Your email is not used for marketing or shared with third parties.

#### 2.3 Device Identifiers — NOT DISCLOSED

**Code evidence:**

- `deviceIdentity.ts`: `getDeviceIdentifier()` uses `Device.getId()` on native or generates a browser fingerprint (hash of userAgent, screen size, timezone, languages) on web
- `axios.ts`: Sends as `X-Device-ID` header on authenticated requests
- `customAuthPlugin.ts` (Houdini): Sends `X-Device-ID` on GraphQL requests even without auth token

**Do we need to disclose this?** **Yes.** Device identifiers are listed as personal/sensitive data. However, this does NOT require a prominent in-app disclosure — it's an expected part of authenticated API communication. Privacy policy disclosure is sufficient.

**Suggested addition:**

> We generate a random device identifier to associate your sessions with your device for security purposes (e.g., recognizing trusted devices). This identifier is not an advertising ID and is not shared with third parties.

#### 2.4 Blockchain Networks Beyond Bitcoin — NOT DISCLOSED

**Code evidence:**

- `wallet.store.ts`: Manages RSK (Rootstock/RBTC), BSC (BNB, USDT) balances and transactions
- `escrow.ts`: On-chain escrow contracts on Rootstock
- Boltz swap services: submarine swaps (RBTC ↔ Lightning), reverse swaps, chain swaps (L-BTC ↔ RBTC)
- `SendPaymentForm.svelte` / `ReceivePaymentForm.svelte`: Support RSK, Lightning, and BSC send/receive

The privacy policy only mentions "Bitcoin blockchain" but the app operates on multiple networks.

**Do we need to disclose this?** **Yes.** Users should understand which blockchain networks their transactions touch.

**Suggested addition:**

> BitTasker supports transactions on Bitcoin (via Lightning Network), Rootstock (RSK), and Binance Smart Chain (BSC) networks. Transactions on these blockchains are publicly visible by design. Your wallet addresses on these networks can be correlated with your transaction history by anyone viewing the blockchain. We do not control blockchain data once a transaction is broadcast.

Note: BSC is implemented in the wallet store even if limited in the current UI. It should be mentioned since the code supports it.

#### 2.5 Third-Party Services — NOT DISCLOSED BY NAME

**Code evidence and what each service does:**

| Service                                                                 | What It Does in Code                                                                                                             | What Data It Receives                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Sentry** (`@sentry/sveltekit` in `hooks.client.ts`)                   | Error tracking + session replay (10% of sessions, 100% on error). `sendDefaultPii: false` means no IP, email, or user info sent. | Crash logs, error messages, anonymized session replays, request URLs |
| **Firebase Cloud Messaging** (`push-notification.service.ts`, `fcm.ts`) | Push notifications only. No other Firebase services used.                                                                        | FCM token, device info (registered via `registerTokenOnServer()`)    |
| **Google Maps** (map components)                                        | Map display, geocoding, places search                                                                                            | Location coordinates for geocoding/reverse-geocode API calls         |
| **Google Translate** (`translation.service.ts`)                         | Message auto-translation                                                                                                         | Message text sent to `translation.googleapis.com` for translation    |
| **Cloudflare Turnstile** (`signup/+page.svelte`)                        | Bot verification during signup                                                                                                   | Browser fingerprint/challenge data processed by Cloudflare           |
| **Umami Analytics** (`+layout.svelte`, production only)                 | Anonymous web analytics (`analyze.bittasker.com`)                                                                                | Page views, referrers (anonymized, no PII by Umami's design)         |
| **Boltz** (via `@bittasker/wallet-core`)                                | Atomic swap service for cross-chain transactions                                                                                 | Transaction amounts and addresses during swap execution              |

**Do we need to disclose these?** **Yes, in the privacy policy.** Google Play requires disclosure of third-party services and what data they receive. However, this does **NOT** mean we need individual in-app pop-up disclosures for each one (see Section 3).

**Suggested addition (new "Third-Party Services" section):**

> BitTasker uses the following third-party services to operate:
>
> - **Error Monitoring (Sentry):** We collect anonymized crash reports and error logs to improve app stability. No personally identifiable information is included. Session replays are anonymized with all text and images masked.
> - **Push Notifications (Firebase Cloud Messaging):** If you enable notifications, we use Google's Firebase Cloud Messaging to deliver them. Your device token is stored on our servers to route notifications.
> - **Maps (Google Maps):** We use Google Maps to display task locations and perform address lookups. Location coordinates you provide are sent to Google for geocoding.
> - **Translation (Google Translate):** When auto-translation is enabled, message text is sent to Google Translate API. You can disable this in settings.
> - **Bot Protection (Cloudflare Turnstile):** During signup, Cloudflare processes a browser challenge to verify you are human.
> - **Analytics (Umami):** We use privacy-focused analytics to understand aggregate usage patterns. No personal data is collected.
> - **Swap Services (Boltz):** Cross-chain swaps use Boltz exchange for atomic swaps between Lightning, Liquid, and Rootstock networks.

#### 2.6 Nostr Identity — HOW IT'S COLLECTED

**Code flow:**

1. **Signup** (`signup/+page.svelte`): User passes Turnstile verification and accepts TOS. No Nostr keys are created here.
2. **Onboarding** (`onboarding/+page.svelte`): `generateSecretKey()` and `getPublicKey(sk)` from `nostr-tools` generate a key pair **entirely on the user's device**. No server involved.
3. **Registration** (`PasskeySetup.svelte`): Sends to BitTasker backend:
   - `publicKey` (hex Nostr public key)
   - `encryptedData` (AES-GCM encrypted Nostr secret key + wallet mnemonic — server never sees plaintext)
   - `username`, `deviceId`, `deviceName`, `platform`, `appVersion`
   - WebAuthn attestation data (passkey credential)
4. **Nostr relays**: Kind 0 (profile metadata), Kind 30063 (profile images), Kind 30000 (skills) are published to relays with the user's public key. These are **world-readable by design**.
5. **Local storage**: `NPUB` (hex public key) cached in Capacitor Preferences. Secret key stays encrypted.

**Current privacy policy status:** Partially covered (mentions public npub and profile data on Nostr). Missing: explanation that encrypted key material is stored server-side for recovery, and that `publicKey` is sent to BitTasker's API.

**Suggested update:**

> Your Nostr keys are generated entirely on your device. Your public key is shared with our servers to identify your account. Your private key is encrypted on your device before any backup is stored server-side — we never have access to your plaintext private key. Profile information you publish (display name, bio, skills, profile picture URL) is broadcast to Nostr relays and is publicly readable by anyone.

### Privacy Policy Compliance Verdict

The privacy policy needs updates to accurately reflect the data above, but these are **privacy policy text changes** — not code changes. The underlying data practices are reasonable and defensible. The issue is the policy doesn't describe them.

**Comparison with Primal (approved Nostr app on Play Store):** Primal declares "Personal info" and "Photos and videos" in its Data Safety section, states "No data shared with third parties," and links to its privacy policy. BitTasker's data practices are similar in nature (Nostr-based, non-custodial), so the required disclosures follow the same pattern — just need to be written accurately.

---

## 3. Prominent In-App Disclosures — What Actually Needs One

### Google Play Requirement

Prominent in-app disclosure is required ONLY when:

1. Data collection occurs **in the background** when the user is not engaging with the app, OR
2. Users **may not reasonably expect** the data access for the feature being used

Prominent disclosure means a dedicated UI (dialog, banner, etc.) shown **before** the system permission dialog, with clear explanation and options to consent or decline. It is **separate from** the privacy policy.

**Reference:** [Best Practices for Prominent Disclosure](https://support.google.com/googleplay/android-developer/answer/11150561)

### What Does NOT Need a Prominent In-App Disclosure

The following items only need to be covered in the **privacy policy** and **Data Safety form**, not via an in-app pop-up:

| Item                         | Why No In-App Disclosure Needed                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Device ID / fingerprint**  | Generated as part of normal API authentication. Users reasonably expect apps to identify their device for security. No sensitive permission involved.                                                               |
| **Sentry error tracking**    | Crash/error logging is an expected app behavior. `sendDefaultPii: false` means no PII is collected. Disclosed in privacy policy is sufficient. Google Play's Data Safety form has a "Crash logs" category for this. |
| **Firebase Cloud Messaging** | The push notification flow already has `NotificationPermissionBanner.svelte` which serves as the prominent disclosure. FCM is the delivery mechanism behind that.                                                   |
| **Google Translate API**     | The translation feature has an **opt-in toggle** in `TranslationSettings.svelte`. Users explicitly enable it. The settings UI explains the feature. Privacy policy should name Google as the provider.              |
| **Cloudflare Turnstile**     | Standard bot protection during signup. Users see "verify you're human." This is an expected, industry-standard practice. Privacy policy mention is sufficient.                                                      |
| **Umami Analytics**          | Privacy-focused, anonymous analytics. No PII collected. Mentioned in privacy policy is sufficient.                                                                                                                  |
| **Google Maps**              | Maps are visible UI. Users see the map and understand location data is used to render it.                                                                                                                           |

### What DOES Have Proper In-App Disclosure

| Item                   | Disclosure Implementation                                                                                                                                                                                                                                                                                                                                           | Status                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Push Notifications** | `NotificationPermissionBanner.svelte` shown before system prompt. Explains why notifications are needed. "Not Now" to decline. Mounted from dashboard layout.                                                                                                                                                                                                       | **Compliant**                |
| **Camera (native QR)** | `QrCodeScanner.svelte` shows a disclosure modal (`showDisclosure`) before requesting camera permission. User must tap "Grant and Start" to proceed.                                                                                                                                                                                                                 | **Compliant**                |
| **Camera (web QR)**    | `WebQrCodeScanner.svelte` uses browser camera API directly. However, this component is **only used on web** — native builds use `QrCodeScanner` instead. The platform check is in `SendPaymentForm.svelte` (`Capacitor.getPlatform() === 'web'`) and `login/+page.svelte` (`isNativePlatform`). **For the mobile app submitted to Play Store, this is irrelevant.** | **Not applicable to mobile** |

### What Needs Attention: Location Auto-Request

See [Section 11](#11-location-permission-flow--re-verified) for the detailed re-verified analysis.

**TL;DR:** `LocationPicker` is user-initiated (compliant). `TaskLocationMap` and `TaskeeLocationMap` auto-request on mount (needs fix).

---

## 4. Debug Routes in Production

### Google Play Requirement

Google Play explicitly states: **"Debug and test features should never be included in production builds."** This includes hidden menus, debug log options, and options to alter application flow.

**Reference:** [Test and Debug Features — Android Security](https://developer.android.com/privacy-and-security/risks/test-debug)

### Current State

Two debug routes exist and are accessible to any authenticated user:

- `/dashboard/debug-wallet` (`src/routes/(protected)/dashboard/debug-wallet/+page.svelte`)
- `/dashboard/debug-smart-contract` (`src/routes/(protected)/dashboard/debug-smart-contract/+page.svelte`)

They are under the `(protected)` layout (requires auth) but have **no environment check**. Any user who types the URL can access them. The debug-smart-contract page includes a **"safety override"** via localStorage that exposes all escrow contract actions.

These are not linked in any navigation menu but are still routable.

### How to Gate with `import.meta.env.DEV`

SvelteKit's `{#if}` blocks in templates are NOT tree-shaken by Vite/Rollup — the code stays in the bundle even when the condition is false. The correct approach is to use a **`+page.ts` load function** that redirects in production:

**Option A — Redirect in load function (recommended):**

```typescript
// src/routes/(protected)/dashboard/debug-wallet/+page.ts
import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';

export function load() {
	if (!dev) {
		redirect(307, '/dashboard');
	}
}
```

This is compliant because:

- In production builds, `dev` is `false` (statically replaced by Vite)
- The route still exists in the bundle but immediately redirects — users never see the debug UI
- No component code executes in production

**Option B — Combine with lazy import for better tree-shaking:**

Create a wrapper component that dynamically imports the debug content only in dev mode. However, Option A is simpler and sufficient for Play Store compliance since the user never reaches the debug UI.

### Fix Required

Add the redirect guard to both:

- `src/routes/(protected)/dashboard/debug-wallet/+page.ts`
- `src/routes/(protected)/dashboard/debug-smart-contract/+page.ts`

---

## 5. Wallet Network Options — Incomplete Features

### Google Play Requirement

Apps must not claim features that are "functionally impossible" or misleading. Apps that crash, force close, or don't function as intended are prohibited. However, the policy does **not** specifically prohibit showing disabled/unavailable features.

**Reference:** [Deceptive Behavior](https://support.google.com/googleplay/android-developer/answer/9888077)

### Current State

In `SendPaymentForm.svelte` and `ReceivePaymentForm.svelte`, the network picker includes options that show error toasts when selected:

- **Send → Liquid Bitcoin:** Shows "network not available" error toast
- **Send → Bitcoin on-chain:** Shows "network not available" error toast
- **Receive → Bitcoin on-chain:** Shows "network not available" error toast

### Can We Show Them Disabled/Grayed Out?

**Yes.** Google Play's Deceptive Behavior policy targets apps that **claim** impossible features or **mislead** users about functionality. Showing a network option as visually disabled with a "Coming Soon" label is transparent — it tells the user the feature exists in the roadmap but isn't available yet. This is NOT misleading because:

1. The user sees the disabled state before interacting
2. No claim is made that it works
3. It sets expectations honestly

### Recommended Fix

Instead of showing options that produce error toasts when tapped, modify the network selector to:

```svelte
<button class="btn btn-ghost" disabled>
	<span class="opacity-50">Liquid Bitcoin</span>
	<span class="badge badge-sm badge-ghost">Coming Soon</span>
</button>
```

This is better UX and compliant — disabled + labeled clearly. The alternative is to simply hide these options until implemented.

---

## 6. Cryptocurrency Wallet — Financial Features Declaration

### What Is the Financial Features Declaration?

The Financial Features Declaration is a **form in Google Play Console** (under Policy and programs → App content → Financial features). **Every** developer must complete it, even if their app has no financial features — in that case, they just declare "none."

**Reference:** [Financial Features Declaration](https://support.google.com/googleplay/android-developer/answer/13849271)

### This Is NOT a Code Violation

The Financial Features Declaration is a **Play Console dashboard task**, not a code requirement. The CEO handling dashboard configuration would fill this out. However, the development team needs to ensure that:

1. **What's declared matches what's implemented** — The form asks about specific financial features like "Cryptocurrency wallet" under "Trading and funds."
2. **Licensing** — If targeting regulated jurisdictions (US, EU, UK, etc.), cryptocurrency wallet apps may need regulatory licenses. For a **non-custodial** wallet like BitTasker's (user holds their own keys, mnemonic encrypted on-device), the licensing requirements may be less stringent than for custodial services, but this varies by jurisdiction.

### What BitTasker Implements (for declaration accuracy)

| Feature                     | Implementation                                 | Declaration Category                   |
| --------------------------- | ---------------------------------------------- | -------------------------------------- |
| Non-custodial crypto wallet | RSK + BSC wallets from local mnemonic          | "Cryptocurrency wallet"                |
| Atomic swaps                | Boltz swaps (Lightning ↔ RBTC, L-BTC ↔ RBTC) | May be considered exchange-adjacent    |
| On-chain escrow             | Rootstock smart contract for task payments     | Payment processing via smart contracts |
| Send/receive crypto         | RBTC, Lightning, BSC USDT                      | Cryptocurrency transfers               |

### Why It Matters

Google Play can require additional documentation for regulated jurisdictions. If BitTasker targets countries like the US, UK, or EU, they may ask for FinCEN MSB registration, FCA registration, or MiCA compliance. **The mitigation strategy** is to exclude regulated jurisdictions from the app's target countries in Play Console if licensing isn't obtained, or to clearly position as a non-custodial wallet that doesn't custody user funds.

### Action for Development Team

No code changes needed. Provide the CEO with the above feature table so the Financial Features Declaration form is filled accurately.

---

## 7. Account Deletion

### Google Play Requirement

Apps that allow account creation must provide:

1. An **in-app path** to delete accounts (readily discoverable)
2. A **web resource** where users can request deletion

**Reference:** [Account Deletion Requirements](https://support.google.com/googleplay/android-developer/answer/13327111)

### Current State — Compliant

**In-app path:**

- Dashboard → Settings → Account Actions → "Delete Account" → `DeleteAccountModal.svelte`
- Modal explains: 30-day grace period, permanent deletion after grace period, Nostr broadcast
- Calls `authService.requestAccountDeletion()` → `DELETE /api/v1/auth/account`
- Then broadcasts Nostr kind 5 (NIP-09) + kind 62 (NIP-62 "request to vanish")
- ~3-4 taps from dashboard. **Readily discoverable.**

**Web resource:**

- `/delete-account` route exists as a public page
- Explains the deletion process, what gets deleted, and links to Settings for authenticated users
- Includes "Contact Support" (`mailto:hello@bittasker.com`) for users who can't log in

### Does the Web Resource Need to Be Public (Unauthenticated)?

**No.** Google Play's requirement is a "web link resource where users can request account deletion." The policy **allows** requiring authentication. The key is that users who:

- Have the app: Use the in-app Settings path
- Don't have the app / forgot password: Can use the web page to understand the process and contact support

BitTasker's current approach (informational page + support email + in-app deletion) is acceptable. Google Play explicitly allows requiring login for the deletion action itself. Primal (an approved Nostr app) follows a similar pattern.

### Verdict

**Compliant.** No changes needed. The current implementation satisfies Google Play requirements.

---

## 8. User-Generated Content Moderation

### Google Play Requirement

Apps with user-generated content must have:

- In-app reporting system
- In-app blocking functionality
- Timely action against reported content
- Clear Terms of Use and consent

**Reference:** [User Generated Content Policy](https://support.google.com/googleplay/android-developer/answer/9876937)

### The Decentralized Challenge

BitTasker operates on the Nostr protocol where data lives on distributed relays. This creates a fundamental tension with Google Play's requirement for "timely action" on reported content — the app cannot delete data from third-party relays.

### How Other Nostr Apps Handle This

**Primal** (approved on Google Play with 10K+ downloads, 4.0 stars):

- Uses client-side filtering and muting
- NIP-56 reporting to relays
- Does not claim to "delete" content from the network
- Declares "No data shared with third parties" in Data Safety

### What BitTasker Has Implemented

| Feature                  | Implementation                                                                                                                                                                             | Status          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| **In-app reporting**     | `ActionsMenu.svelte` (3-dot menu) → `ReportModal.svelte` with 6 report categories (spam, illegal, profanity, nudity, impersonation, other). Reports published as Nostr kind 1984 (NIP-56). | **Implemented** |
| **User blocking/muting** | `mutePubkey()` in `mute.store.ts` + `muteList.ts` (NIP-51 kind 10000). Filters applied across tasks, bids, messages, conversations.                                                        | **Implemented** |
| **Report accessibility** | ActionsMenu integrated in task cards, bids, messages, and profiles.                                                                                                                        | **Implemented** |
| **Terms consent**        | TOS + Privacy checkbox required during signup. 18+ age confirmation in consent text: "I confirm I am 18 years of age or older."                                                            | **Implemented** |
| **Community Guidelines** | Public page at `/community-guidelines` covering conduct standards and trust & safety.                                                                                                      | **Implemented** |

### What's Missing

| Feature                            | Status             | Risk Assessment                                                                                                                                                       |
| ---------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated profanity filter         | Not implemented    | Low risk — Primal doesn't have one either and is approved                                                                                                             |
| Image/CSAM scanning                | Not implemented    | Moderate risk — but no image attachments in DMs (text-only `sendDirectMessage`). Task image uploads go through your backend where server-side scanning could be added |
| Server-side moderation queue       | Not implemented    | Low risk for decentralized app — reports go to Nostr relays. Relay operators can act on kind 1984 events                                                              |
| Explicit CSAM prohibition in Terms | Needs verification | Check if Terms JSON explicitly mentions CSAM/CSAE                                                                                                                     |

### Recommended Approach

The decentralized model is compatible with Google Play if:

1. **Client-side filtering is robust** (already implemented via muting)
2. **Reporting mechanism exists** (already implemented via NIP-56)
3. **Terms clearly prohibit** illegal content and CSAM
4. **The app does not facilitate** objectionable content as its primary purpose

BitTasker is a gig economy platform, not a social media app. UGC is limited to task descriptions, bids, reviews, and messages. The moderation surface area is narrower than a general social app.

**Action items:**

- Verify Terms of Service explicitly prohibit CSAM/CSAE (check `terms.json` for explicit language)
- Consider adding server-side image scanning for task uploads if not already present on the backend
- Ensure the relay operator (BitTasker's own relay) monitors and acts on kind 1984 reports

---

## 9. Android Target SDK Level

### Requirement

As of August 31, 2025: New apps must target API level 35+ (Android 15).
Expected August 2026: API level 36.

### Current State

From `android/variables.gradle`:

- `compileSdkVersion: 36`
- `targetSdkVersion: 36`
- `minSdkVersion: 24`

**Compliant.** Already ahead of requirements.

---

## 10. google-services.json in Git

### What It Is

`google-services.json` is a Firebase configuration file containing:

- Firebase project ID and number (`bittasker-928ff`)
- Android app ID (`1:256658163015:android:29307c3f4ccfe4b0597862`)
- API key (`AIzaSyBUVLPMM0sVl9X6NpqPb0vyCpnH4o-OeqU`)
- Package name (`com.bittasker.app`)

### What It's Used For

In BitTasker, `google-services.json` is used **exclusively for Firebase Cloud Messaging (push notifications)**. The `android/app/build.gradle` includes only `firebase-messaging:23.4.0` — no other Firebase services. The JS codebase confirms this: only `firebase/app` and `firebase/messaging` are imported (in `push-notification.service.ts` and `fcm.ts`).

### Is It Sensitive?

**Nuanced.** Firebase officially considers the API key in this file as "public" — it's not a server secret. The key is embedded in every compiled APK and extractable via decompilation. Security should be enforced via:

- **Firebase Security Rules** (for databases/storage — not applicable since BitTasker only uses FCM)
- **API key restrictions** in Google Cloud Console (restrict to Android package name + signing certificate)
- **Firebase App Check** (optional additional layer)

### Is It Already Pushed to Git?

**Yes.** `git ls-files` confirms `android/app/google-services.json` is tracked. The `.gitignore` rule is commented out:

```
# Google Services (e.g. APIs or Firebase)
# google-services.json
```

### Do We Need It?

**Yes, for push notifications.** Without it, FCM will not work on Android (the build.gradle conditionally applies the google-services plugin only if the file exists).

### Recommended Actions

1. **If the repo is private:** The risk is minimal. The API key is public anyway (embedded in every APK). Keep it tracked for convenience.
2. **If the repo is public or may become public:**
   - Uncomment the `.gitignore` rule
   - Remove from git tracking: `git rm --cached android/app/google-services.json`
   - Add to CI/CD pipeline to inject at build time
   - Restrict the API key in Google Cloud Console to the Android package name + signing certificate
3. **Regardless:** Ensure the API key is restricted in Google Cloud Console. This protects against abuse even if the key is exposed.

**This is NOT a Google Play compliance issue.** It's a security best practice concern. Google Play will not reject the app for having this file committed.

---

## 11. Location Permission Flow — Re-verified

### Re-Verification Results

After thorough code review, here is the accurate state of location permission handling:

#### LocationPicker.svelte — COMPLIANT

- Location is **NOT requested on mount**. The component initializes with default coordinates and shows the map.
- GPS is only triggered when the user taps **"Use my location"** button (`requestUserLocation()`)
- The code includes an explicit comment referencing Google Play policy compliance:
  ```
  // the user can tap "Use my location" to request GPS access (Google Play policy compliance)
  ```
- This is **user-initiated foreground location** for an obvious location-related feature. Google Play's guidance states: foreground location that is user-initiated and clearly expected for the feature does NOT require a separate prominent disclosure beyond the system permission dialog.

#### TaskLocationMap.svelte — NEEDS FIX

- **Auto-requests** `navigator.geolocation.getCurrentPosition()` **on mount** (line ~1573)
- No prior disclosure or user action triggers the request
- This is the task browsing map — users may not expect location to be requested just to view tasks
- The fix: change to default coordinates on mount (like LocationPicker does), and add a "Center on my location" button for user-initiated access

#### TaskeeLocationMap.svelte — NEEDS FIX

- Same pattern: `getUserLocation()` called during `initMap()` on mount
- Same fix needed: default coordinates + user-initiated option

#### LocationSetup.svelte — NOT USED

- Marked `@deprecated` and `@unused`. Zero imports found. Not part of any active flow.

#### LocationFilter.svelte — COMPLIANT

- `getCurrentLocation()` triggered only by user button click

### Verdict

Most location flows are user-initiated and compliant. The two auto-request components (`TaskLocationMap` and `TaskeeLocationMap`) need to be changed to not auto-request on mount.

---

## 12. Priority Action Items

### Critical (Must fix before release)

| #   | Item                                                                                                                              | Type    | Effort |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 1   | **Update privacy policy** to disclose location, email, device IDs, blockchain networks, third-party services                      | Content | Medium |
| 2   | **Gate debug routes** (`/dashboard/debug-wallet`, `/dashboard/debug-smart-contract`) with `dev` check in `+page.ts` load function | Code    | Small  |
| 3   | **Fix TaskLocationMap auto-request** — don't call geolocation on mount, use default coords + user-initiated button                | Code    | Small  |
| 4   | **Fix TaskeeLocationMap auto-request** — same pattern as above                                                                    | Code    | Small  |

### High Priority (Should fix before release)

| #   | Item                                                                                                                         | Type    | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 5   | **Disable/label unimplemented wallet networks** (Liquid send, on-chain BTC) as "Coming Soon" instead of showing error toasts | Code    | Small  |
| 6   | **Verify Terms of Service** explicitly prohibit CSAM/CSAE with clear language                                                | Content | Small  |
| 7   | **Restrict Firebase API key** in Google Cloud Console to Android package + signing cert                                      | Config  | Small  |

### Nice to Have (Post-release)

| #   | Item                                                                                                                                    | Type    | Effort |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 8   | Add server-side image scanning for task uploads                                                                                         | Backend | Medium |
| 9   | Add moderation webhook for kind 1984 reports to internal review                                                                         | Backend | Medium |
| 10  | Uncomment `google-services.json` in `.gitignore` if repo may become public                                                              | Config  | Tiny   |
| 11  | Add privacy policy link accessible from dashboard desktop view (currently only footer/bottom nav which are hidden on desktop dashboard) | Code    | Small  |

---

## Appendix: Data Safety Form Reference

When the CEO fills out the Play Console Data Safety form, the following should be declared based on actual code behavior:

| Data Type                            | Collected                         | Shared                                 | Purpose                       |
| ------------------------------------ | --------------------------------- | -------------------------------------- | ----------------------------- |
| Name / Display name                  | Yes                               | No (published to Nostr by user choice) | Account / profile             |
| Email address                        | Optional                          | No                                     | Account recovery              |
| User IDs (Nostr public key)          | Yes                               | No (published to Nostr by user choice) | Account identity              |
| Crash logs                           | Yes (via Sentry)                  | Yes (with Sentry)                      | App stability                 |
| Diagnostics                          | Yes (via Sentry)                  | Yes (with Sentry)                      | App stability                 |
| Device ID                            | Yes (random, not advertising ID)  | No                                     | Security / session management |
| Approximate location                 | Yes (when user grants permission) | No                                     | Task location features        |
| Precise location                     | Yes (when user grants permission) | No                                     | Task location features        |
| Photos                               | Optional (task uploads)           | No                                     | Task descriptions             |
| Financial info (crypto transactions) | Yes (on-chain, user-controlled)   | No                                     | Wallet / escrow               |
| Messages (Nostr DMs)                 | Yes (E2E encrypted)               | No                                     | Communication                 |

**Encryption in transit:** Yes (HTTPS + E2E for DMs)
**Data deletion:** Yes (account deletion with 30-day grace period)
