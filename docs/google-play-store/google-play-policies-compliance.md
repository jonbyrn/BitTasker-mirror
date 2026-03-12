# Google Play Store Policies — BitTasker Compliance Reference

**Source:** [Google Play Developer Policy Center](https://play.google/developer-content-policy/)  
**Policy effective date:** March 4, 2026  
**App:** BitTasker (`com.bittasker.app`)  
**Last updated:** March 12, 2026

> This document lists every Google Play Developer Program Policy and notes how BitTasker complies with each one. Use this as a living checklist before each release.

---

## Table of Contents

1. [Restricted Content](#1-restricted-content)
2. [Impersonation](#2-impersonation)
3. [Intellectual Property](#3-intellectual-property)
4. [Privacy, Deception & Device Abuse](#4-privacy-deception--device-abuse)
5. [SDK Requirements](#5-sdk-requirements)
6. [Monetization & Ads](#6-monetization--ads)
7. [Store Listing & Promotion](#7-store-listing--promotion)
8. [Spam, Functionality & User Experience](#8-spam-functionality--user-experience)
9. [Malware](#9-malware)
10. [Mobile Unwanted Software (MUwS)](#10-mobile-unwanted-software-muws)
11. [Families Policies](#11-families-policies)
12. [Enforcement & Account Standing](#12-enforcement--account-standing)
13. [Recent 2026 Policy Updates](#13-recent-2026-policy-updates)

---

## Legend

| Symbol | Meaning                                 |
| ------ | --------------------------------------- |
| ✅     | Compliant                               |
| ⚠️     | Requires attention / partial compliance |
| ❌     | Non-compliant — action required         |
| N/A    | Policy does not apply to BitTasker      |

---

## 1. Restricted Content

### 1.1 Child Endangerment

**Policy:** Apps must prohibit users from creating, uploading, or distributing content that facilitates the exploitation or abuse of children (CSAM). Apps must not promote trafficking, sextortion, sexualization of minors, grooming, or inappropriate interactions with children. Apps that appeal to children but contain adult themes are not allowed.

**Child Safety Standards (Social & Dating apps):** Must designate a Child Safety Point of Contact, self-certify compliance with child safety laws, address CSAM, provide an in-app reporting mechanism, and publish standards prohibiting CSAE.

| Status | BitTasker Compliance                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅     | BitTasker is a gig economy / task marketplace for adults. The platform does not target children and contains no child-directed content.                                                          |
| ✅     | BitTasker is not a social or dating app, so the Child Safety Standards sub-policy does not apply.                                                                                                |
| ⚠️     | BitTasker has messaging features between Taskers and Taskees. Terms of Service and Community Guidelines must explicitly prohibit CSAE content. Verify this language exists in the published ToS. |
| ⚠️     | An in-app reporting mechanism for offensive/abusive content must be available in the messaging section.                                                                                          |

---

### 1.2 Inappropriate Content

**Policy:** Apps must not contain or promote:

- **Sexual content / profanity** — pornography, sexually gratifying content, non-consensual imagery, escort/sugar dating services.
- **Hate speech** — content promoting violence or hatred based on race, religion, disability, age, nationality, sexual orientation, gender, caste, immigration status, etc.
- **Violence** — gratuitous violence, self-harm promotion, graphic realistic violence.
- **Violent extremism** — content from terrorist organizations, glorifying attacks on civilians.
- **Sensitive events** — capitalizing on disasters, deaths, or tragedies insensitively.
- **Bullying & harassment** — threats, extortion, public humiliation.
- **Dangerous products** — facilitating sale of explosives, firearms, restricted accessories.
- **Marijuana** — facilitating sale of marijuana or THC products regardless of legality.
- **Tobacco & alcohol** — facilitating sale of tobacco/nicotine, encouraging underage use, glamorizing excessive drinking.

| Status | BitTasker Compliance                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker is a task marketplace. No sexual, pornographic, or adult content is featured or allowed on the platform.                                                |
| ✅     | No hate speech content is produced or promoted by the platform.                                                                                                   |
| ✅     | No gratuitous violence. Task categories are service-oriented (home services, digital work, personal assistance, creative services).                               |
| ✅     | No extremist content. BitTasker has no political or ideological content.                                                                                          |
| ✅     | No firearms, explosives, or dangerous product sales facilitated.                                                                                                  |
| ✅     | No marijuana or tobacco product sales facilitated.                                                                                                                |
| ⚠️     | User-generated task descriptions and messages could potentially contain prohibited content. A content moderation policy and reporting mechanism must be in place. |

---

### 1.3 Age-Restricted Content and Functionality

**Policy (effective October 30, 2025):** Apps with matchmaking, dating, or real-money gambling features must block minors from accessing those features.

| Status | BitTasker Compliance                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅     | BitTasker does not include dating or matchmaking features.                                                                                       |
| ⚠️     | BitTasker involves real-money transactions (Bitcoin payments). Age verification or a clear 18+ requirement must be enforced at account creation. |

---

### 1.4 Financial Services

**Policy:** Apps containing financial features must not expose users to deceptive or harmful financial products. All apps with any financial features must complete the **Financial Features Declaration** in Play Console. Specific rules apply to:

- **Personal loans** — must disclose APR, repayment period, total cost, privacy policy. No loans repayable in 60 days or less. US apps: max APR 36%.
- **Earned Wage Access** — must disclose all fees, repayment terms.
- **Binary options** — not allowed.
- **Country-specific** — additional licensing requirements for India, Indonesia, Philippines, Nigeria, Kenya, Pakistan, Thailand.

| Status | BitTasker Compliance                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does not offer personal loans, binary options, or earned wage access products.                                                            |
| ✅     | BitTasker is a payment facilitation platform (Bitcoin/Lightning/Liquid/Rootstock), not a lending service.                                           |
| ⚠️     | BitTasker handles financial transactions (Bitcoin payments, escrow). The **Financial Features Declaration** form must be completed in Play Console. |
| ✅     | BitTasker does not operate in regulated lending jurisdictions requiring special licenses.                                                           |

---

### 1.5 Real-Money Gambling, Games, and Contests

**Policy:** Real-money gambling apps require a valid gambling license per country, must be rated AO (Adults Only), must be free to download, must not use Google Play In-app Billing, must display responsible gambling information, and must prevent underage access. Apps without a gambling license may not accept real money wagers. Gamified loyalty programs are allowed under specific conditions.

| Status | BitTasker Compliance                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker is not a gambling app. No wagering, casino games, sports betting, or lotteries are offered.             |
| ✅     | Bitcoin payments on BitTasker are for legitimate service transactions (paying for completed tasks), not gambling. |
| N/A    | Gambling-specific requirements do not apply.                                                                      |

---

### 1.6 Illegal Activities

**Policy:** Apps must not facilitate or promote illegal activities including drug sales, human trafficking, illegal weapons, counterfeit goods, fraud, or any activity that violates applicable laws.

| Status | BitTasker Compliance                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker facilitates legal service transactions only.                                                                                                                     |
| ⚠️     | Task categories must be reviewed to ensure no task type could facilitate illegal services. The platform's Terms of Service must explicitly prohibit illegal task postings. |

---

### 1.7 User-Generated Content (UGC)

**Policy:** Apps that allow UGC must: provide in-app reporting/flagging tools, take action on reported content, moderate content proactively, clearly define prohibited content in Terms of Service, and have a process for handling violations.

| Status | BitTasker Compliance                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️     | BitTasker allows UGC in the form of task descriptions, bids, messages, and reviews. An in-app reporting mechanism must be implemented for all UGC areas. |
| ⚠️     | Terms of Service must clearly define prohibited UGC.                                                                                                     |
| ⚠️     | A content moderation process (automated or manual) must be documented and operational.                                                                   |

---

### 1.8 Health Content and Services

**Policy:** Apps providing health-related content or services must not provide false or misleading health information that could cause harm. Medical apps must comply with applicable regulations.

| Status | BitTasker Compliance                                           |
| ------ | -------------------------------------------------------------- |
| ✅     | BitTasker does not provide health content or medical services. |
| N/A    | Health content policy does not apply.                          |

---

### 1.9 Blockchain-based Content

**Policy:** Apps with blockchain content must:

- Conduct cryptocurrency exchange/wallet services through certified services in regulated jurisdictions.
- Not mine cryptocurrency on devices (remote management is allowed).
- Declare tokenized digital asset sales via the Financial Features Declaration in Play Console.
- Indicate in product details when an in-app product represents a Tokenized Digital Asset.
- Not promote or glamorize potential earnings from playing or trading.
- Not accept real money in exchange for NFTs of unknown value (gambling-style NFT mechanics are prohibited).

| Status | BitTasker Compliance                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker integrates Bitcoin wallets (Lightning, Liquid, Rootstock) for legitimate payment purposes.                                                              |
| ✅     | BitTasker does not mine cryptocurrency on user devices.                                                                                                           |
| ⚠️     | If BitTasker involves any tokenized digital assets or NFTs in the future, the Financial Features Declaration must be updated in Play Console.                     |
| ✅     | BitTasker does not glamorize crypto earnings or operate NFT gambling mechanics.                                                                                   |
| ⚠️     | Cryptocurrency wallet/exchange features must comply with applicable regulations in each target country. Country-specific licensing requirements must be reviewed. |

---

### 1.10 AI-Generated Content

**Policy:** Apps using generative AI must comply with all Restricted Content policies, must not generate CSAM or enable deceptive behavior, and must include in-app user reporting/flagging features for offensive AI-generated content.

| Status | BitTasker Compliance                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does not currently use generative AI to produce content.                                                                       |
| ⚠️     | If AI-powered task matching, recommendations, or chat features are added, in-app reporting for offensive AI content must be implemented. |

---

## 2. Impersonation

**Policy:** Apps must not mislead users by impersonating another developer, company, entity, or app. App icons, descriptions, titles, and in-app elements must not falsely imply a relationship with another entity. Apps cannot claim to be "official" apps of an entity without proper authorization.

| Status | BitTasker Compliance                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅     | BitTasker uses its own branding (Bitcoin orange, unique logo, original name).                                                                                                        |
| ✅     | The developer account is registered under the legitimate BitTasker entity.                                                                                                           |
| ✅     | BitTasker does not impersonate any other app, brand, or government entity.                                                                                                           |
| ⚠️     | Ensure the developer name in Play Console matches the registered business entity and does not imply affiliation with Google, Bitcoin Foundation, or other established organizations. |

---

## 3. Intellectual Property

### 3.1 Copyright

**Policy:** Apps must not infringe copyright. Unauthorized reproduction of books, music, artwork, logos, sports team logos, movie/TV imagery, or other copyrighted content is prohibited. Apps must not encourage users to download copyrighted content without authorization.

| Status | BitTasker Compliance                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| ✅     | BitTasker uses original UI assets, icons, and branding.                                                                              |
| ✅     | No copyrighted third-party content (music, artwork, logos) is reproduced without license.                                            |
| ⚠️     | Any third-party icons, fonts, or libraries used must have appropriate open-source or commercial licenses. Verify all asset licenses. |

---

### 3.2 Trademark

**Policy:** Apps must not use another party's trademarks in a way likely to cause confusion about the source of the product.

| Status | BitTasker Compliance                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| ✅     | "BitTasker" is the app's own brand. The Bitcoin "₿" symbol is used generically, not as a trademark of another entity. |
| ⚠️     | Verify that "BitTasker" does not infringe on any registered trademarks in target markets.                             |

---

### 3.3 Counterfeit

**Policy:** Apps must not sell or promote counterfeit goods.

| Status | BitTasker Compliance                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker is a service marketplace, not a goods marketplace. No counterfeit products are sold or promoted. |

---

## 4. Privacy, Deception & Device Abuse

### 4.1 User Data

**Policy:** Developers must be transparent about data collection, use, and sharing. Key requirements:

- **Personal & Sensitive Data** — Limit collection to app functionality. Do not sell user data. Provide prominent disclosure and obtain consent for unexpected data collection.
- **Privacy Policy** — Must be posted in Play Console and within the app. Must disclose all data types collected, retention/deletion policy, secure handling procedures, developer contact info.
- **Data Safety Section** — Must be completed accurately in Play Console for every app. Must disclose data types collected, whether collection is optional, and security practices (e.g., encryption).
- **Account Deletion** — If users can create accounts, they must be able to request account deletion from within the app and from a web URL. All associated data must be deleted upon request.
- **EU Data Privacy Frameworks** — Apps processing EU personal data must comply with GDPR and the EU-U.S. Data Privacy Framework.

| Status | BitTasker Compliance                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker uses client-side encryption (Web Crypto API) for sensitive data. Keys are stored securely using NativeBiometric where available.                                |
| ✅     | BitTasker uses Nostr for decentralized identity — user data is not centrally stored in a traditional server database.                                                     |
| ⚠️     | A comprehensive Privacy Policy must be published at a publicly accessible, non-geofenced URL and linked in Play Console.                                                  |
| ⚠️     | The Data Safety section in Play Console must be completed, disclosing all data types collected (e.g., Bitcoin wallet addresses, task data, messages, device identifiers). |
| ⚠️     | An account deletion flow must be implemented: accessible from within the app AND via a web URL entered in Play Console.                                                   |
| ⚠️     | If BitTasker serves EU users, GDPR compliance must be verified, including lawful basis for processing and data subject rights.                                            |
| ✅     | BitTasker does not sell personal data to third parties.                                                                                                                   |

---

### 4.2 Permissions

**Policy:** Apps may only request permissions necessary for current features. Permissions must not be requested solely for advertising. Sensitive permissions (location, camera, microphone, contacts, etc.) require prominent disclosure before the runtime permission request.

| Status | BitTasker Compliance                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker requests permissions relevant to its features (camera for profile photos, notifications for task updates).                                                                                                                  |
| ⚠️     | Each permission must be accompanied by an in-app explanation shown before the system permission dialog.                                                                                                                               |
| ⚠️     | Review `AndroidManifest.xml` to confirm no unnecessary permissions are declared (e.g., `READ_CONTACTS`, `READ_PHONE_NUMBERS` are prohibited for loan apps — BitTasker is not a loan app but should still audit declared permissions). |
| ✅     | Location permission is not required for core BitTasker functionality and should not be requested unless a location-based task feature is implemented with proper disclosure.                                                          |

---

### 4.3 Device and Network Abuse

**Policy:** Apps must not interfere with device functionality, other apps, or network operations. Apps must not send unsolicited messages, use device resources excessively, or transmit data without user knowledge.

| Status | BitTasker Compliance                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does not interfere with other apps or device functionality.                                 |
| ✅     | Push notifications are opt-in and relevant to task activity (bids, messages, status updates).         |
| ✅     | No excessive background network usage. BitTasker uses standard API calls and Nostr relay connections. |

---

### 4.4 Deceptive Behavior

**Policy:** Apps must not deceive users. This includes:

- **Misleading claims** — App title, icon, description, and screenshots must accurately reflect functionality. No impossible feature claims.
- **Deceptive device settings changes** — No unauthorized changes to device settings. All changes must be reversible.
- **Enabling dishonest behavior** — No fake ID generation, fake documents, or tools to deceive others.
- **Manipulated media** — No apps that create or promote false/misleading imagery, video, or audio about sensitive events or public figures without clear watermarks/disclaimers.
- **Behavior transparency** — No hidden features. App must behave identically for users and reviewers. No techniques to evade app review.

| Status | BitTasker Compliance                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker's store listing accurately describes the app as a Bitcoin-powered gig economy platform.                                                     |
| ✅     | Screenshots and promotional images reflect actual app UI.                                                                                             |
| ✅     | No device settings are modified without user consent.                                                                                                 |
| ✅     | BitTasker does not generate fake documents or enable dishonest behavior.                                                                              |
| ✅     | No hidden features or review-evasion techniques.                                                                                                      |
| ⚠️     | Ensure all feature claims in the store listing (e.g., "Lightning Network payments," "Nostr identity") are fully functional at the time of submission. |

---

### 4.5 Misrepresentation

**Policy:** Apps must not misrepresent their developer identity, origin, or primary purpose. Apps must not use deceptive tactics to gain installs or ratings.

| Status | BitTasker Compliance                                                      |
| ------ | ------------------------------------------------------------------------- |
| ✅     | BitTasker's developer identity is accurately represented in Play Console. |
| ✅     | No deceptive install or rating tactics are used.                          |

---

### 4.6 Target API Level

**Policy:** Apps must target a recent Android API level as required by Google Play. New apps and updates must meet the minimum target API level requirement (currently Android 14 / API 34 for new apps; API 35 for updates after a specific deadline).

| Status | BitTasker Compliance                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️     | BitTasker currently targets API 34. Verify this meets the current requirement for new submissions. Monitor Google's annual API level update deadlines. |
| ⚠️     | As noted in `audit-report-v2.md`, `minSdkVersion` must be set to 26 for Capacitor 8 compatibility.                                                     |

---

## 5. SDK Requirements

**Policy:** Developers are responsible for ensuring all third-party SDKs integrated in their app comply with Google Play policies. This includes verifying that SDK providers do not collect or sell personal data without proper disclosure. If Google Play requests evidence of compliance, developers must respond within 2 weeks.

| Status | BitTasker Compliance                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker uses well-known SDKs: Capacitor (Ionic), Firebase (FCM for push notifications), and standard crypto libraries.                                 |
| ⚠️     | Audit all SDKs for data collection practices. Specifically review: Firebase SDK data collection settings, any analytics SDKs, and Nostr relay libraries. |
| ⚠️     | Firebase Analytics should be configured to respect user consent preferences. If not needed, it can be disabled to reduce data collection.                |
| ⚠️     | Maintain a documented list of all third-party SDKs and their data practices for compliance evidence.                                                     |

---

## 6. Monetization & Ads

### 6.1 Payments

**Policy:** Apps distributed on Google Play that charge for in-app features or digital content must use **Google Play's billing system**. This applies to:

- Cloud software/services
- App functionality or content (e.g., ad-free version, new features)
- Subscription services
- Virtual items (currencies, characters, etc.)

**Exceptions** (Google Play Billing NOT required):

- Physical goods and services (groceries, transportation, cleaning, gym memberships, food delivery, event tickets)
- Credit card / utility bill payments
- Products prohibited under Google's Payments Center Content Policies

Developers in eligible countries may offer an alternative billing system if enrolled in Google's applicable program.

| Status | BitTasker Compliance                                                                                                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker's core payment model is Bitcoin-based payments for real-world services (task completion). These are payments for physical/real-world services, which are **exempt** from Google Play Billing requirements.        |
| ⚠️     | If BitTasker introduces any premium in-app features, subscriptions, or digital goods (e.g., a "Pro" account upgrade, boosted task listings), these **must** use Google Play's billing system.                               |
| ⚠️     | Virtual currencies or premium features sold within the app must go through Google Play Billing. Bitcoin payments for task services are exempt, but any "BitTasker Credits" or similar digital in-app currency would not be. |
| ✅     | BitTasker does not use loot boxes or randomized virtual item mechanics.                                                                                                                                                     |

---

### 6.2 Subscriptions

**Policy:** Subscription terms must be clearly disclosed before purchase. Free trials must clearly state when billing begins. Cancellation must be easy.

| Status | BitTasker Compliance                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️     | If premium subscriptions are introduced, subscription terms, pricing, and cancellation instructions must be clearly displayed before the user subscribes. |
| N/A    | No subscriptions currently exist in BitTasker.                                                                                                            |

---

### 6.3 Ads

**Policy:** Ads must comply with all Restricted Content policies and must be:

- Appropriate for the app's content rating.
- Not deceptive (must not mimic OS notifications or app UI elements).
- Not disruptive (must not take over the full screen unexpectedly, must be dismissible, must not appear during gameplay at level start).
- Not placed on the lockscreen (unless the app's exclusive purpose is a lockscreen).
- Not fraudulent (no fake clicks, impression fraud).
- Location data used for ads requires explicit disclosure and consent.
- Android Advertising ID must not be linked to personally identifiable information without explicit user consent.

| Status | BitTasker Compliance                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does not currently display third-party ads.                                                                                           |
| ⚠️     | If ads are introduced in the future (e.g., sponsored task listings), they must comply with all ad content, format, and disclosure requirements. |
| N/A    | Families Ads Program requirements do not apply as BitTasker does not target children.                                                           |

---

## 7. Store Listing & Promotion

### 7.1 App Promotion

**Policy:** Apps must not use deceptive promotion practices. No fake reviews, no incentivized ratings without disclosure, no misleading promotional content.

| Status | BitTasker Compliance                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅     | BitTasker does not use fake reviews or deceptive promotion.                                                                                |
| ⚠️     | Any promotional campaigns (e.g., "leave a review and get a discount") must be disclosed and must not pressure users into positive reviews. |

---

### 7.2 Metadata

**Policy:** App title, icon, description, screenshots, and promotional images must:

- Accurately describe the app's functionality.
- Not contain emojis, emoticons, or repeated special characters in the title, icon, or developer name.
- Not use ALL CAPS unless part of the brand name.
- Not include misleading symbols in icons (e.g., fake notification dots, fake download arrows).
- Title must be **30 characters or less**.
- Not reference store rankings, pricing, or promotional information (e.g., "#1 app," "Free for limited time").
- Not reference Google Play programs (e.g., "Editor's Choice").
- Not include unattributed user testimonials.
- Not include inappropriate imagery (drugs, graphic violence, sexual content, profanity).

| Status | BitTasker Compliance                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker's app title is within the 30-character limit.                                                        |
| ✅     | The app icon uses the BitTasker logo without misleading symbols.                                               |
| ⚠️     | Review the store listing description for ALL CAPS usage, emoji usage, or any ranking/pricing claims.           |
| ⚠️     | Screenshots must show actual in-app UI, not mockups or marketing renders that differ from the real experience. |
| ⚠️     | Promotional images must not contain sexual, violent, or drug-related imagery.                                  |

---

### 7.3 User Ratings, Reviews, and Installs

**Policy:** Developers must not manipulate ratings, reviews, or install counts. No fake reviews, no incentivized reviews without disclosure, no review swapping with other developers.

| Status | BitTasker Compliance                                |
| ------ | --------------------------------------------------- |
| ✅     | BitTasker does not engage in rating manipulation.   |
| ✅     | No review-swapping or artificial install inflation. |

---

### 7.4 Content Ratings

**Policy:** All apps must complete the IARC content rating questionnaire in Play Console. The assigned rating must accurately reflect the app's content. Apps with inaccurate ratings may be removed.

| Status | BitTasker Compliance                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️     | BitTasker must complete the IARC content rating questionnaire in Play Console. Given the financial transaction nature and adult service marketplace, the appropriate rating is likely **Teen (T)** or **Mature 17+ (M)**. |
| ⚠️     | The content rating must reflect that BitTasker involves financial transactions and may include user-generated content.                                                                                                    |

---

### 7.5 News and Magazines

**Policy:** Apps in the News & Magazines category must be primarily dedicated to news content and must not aggregate content from other sources without permission.

| Status | BitTasker Compliance                     |
| ------ | ---------------------------------------- |
| N/A    | BitTasker is not a news or magazine app. |

---

## 8. Spam, Functionality & User Experience

### 8.1 Message Spam

**Policy:** Apps must not send SMS, email, or other messages on behalf of the user without allowing the user to confirm the content and intended recipients.

| Status | BitTasker Compliance                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| ✅     | BitTasker's messaging system is user-initiated. Messages are sent only when the user explicitly composes and sends them. |
| ✅     | Push notifications are sent by the platform (not on behalf of the user) and are relevant to task activity.               |

---

### 8.2 Webview and Affiliate Spam

**Policy:** Apps whose primary purpose is to drive affiliate traffic to a website or provide a webview of a website without permission are not allowed.

| Status | BitTasker Compliance                                                             |
| ------ | -------------------------------------------------------------------------------- |
| ✅     | BitTasker is a full-featured application, not a webview wrapper of another site. |
| ✅     | No affiliate traffic schemes.                                                    |

---

### 8.3 Repetitive Content

**Policy:** Apps must provide unique value. Apps that merely duplicate other apps without adding original content or services are not allowed.

| Status | BitTasker Compliance                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker is a unique Bitcoin-native gig economy platform. The combination of Nostr identity, Lightning/Liquid/Rootstock payments, and task marketplace is a novel offering. |

---

### 8.4 Functionality and User Experience

**Policy:** Apps must provide a stable, responsive experience. Apps that crash, freeze, fail to load, or have no meaningful functionality are not allowed.

| Status | BitTasker Compliance                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅     | BitTasker is a full-featured application with comprehensive task management, messaging, and payment functionality.                                           |
| ⚠️     | As noted in `audit-report-v2.md`, the app must be tested for crashes and stability before submission. All Capacitor 8 compatibility issues must be resolved. |
| ⚠️     | The missing notification icon (`ic_stat_notify`) must be resolved to prevent notification-related crashes.                                                   |

---

## 9. Malware

### 9.1 General Malware Policy

**Policy:** Apps must not contain any code that could put users, their data, or their devices at risk. This applies to all third-party SDKs integrated into the app.

| Status | BitTasker Compliance                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does not contain malicious code.                                                                                      |
| ⚠️     | All third-party dependencies must be audited for known vulnerabilities. Run `npm audit` and review Android Gradle dependencies. |

---

### 9.2 Backdoors

**Policy:** No code that allows unwanted remote-controlled operations on a device.

| Status | BitTasker Compliance                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does not contain backdoors.                                                               |
| ✅     | Remote configuration (if any) is limited to legitimate feature flags, not arbitrary code execution. |

---

### 9.3 Billing Fraud

**Policy:** No code that automatically charges users without consent (SMS fraud, call fraud, toll fraud).

| Status | BitTasker Compliance                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| ✅     | All Bitcoin transactions in BitTasker require explicit user confirmation before execution. |
| ✅     | No premium SMS, premium calls, or WAP billing is used.                                     |

---

### 9.4 Stalkerware

**Policy:** Apps that monitor another individual by collecting and transmitting personal data are prohibited unless exclusively designed for parental monitoring or enterprise device management, with full disclosure, persistent notification, and the `IsMonitoringTool` flag.

| Status | BitTasker Compliance                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does not monitor users covertly.                                                                                      |
| ✅     | No stalkerware functionality. Task location data (if collected) is for matching purposes only, disclosed in the Privacy Policy. |

---

### 9.5 Denial of Service (DoS)

**Policy:** No code that executes DoS attacks or generates excessive network load without user knowledge.

| Status | BitTasker Compliance                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| ✅     | BitTasker makes standard API calls and Nostr relay connections. No DoS capabilities. |

---

### 9.6 Phishing

**Policy:** No code that impersonates trusted sources to steal credentials or billing information.

| Status | BitTasker Compliance                                                                               |
| ------ | -------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker uses Nostr-based authentication (public/private key cryptography). No password phishing. |
| ✅     | Login screens are clearly branded as BitTasker and do not impersonate other services.              |

---

### 9.7 Elevated Privilege Abuse

**Policy:** No code that breaks the app sandbox, gains elevated privileges, or disables security features.

| Status | BitTasker Compliance                                                |
| ------ | ------------------------------------------------------------------- |
| ✅     | BitTasker operates within standard Android app sandbox permissions. |
| ✅     | No root access or privilege escalation.                             |

---

### 9.8 Ransomware

**Policy:** No code that locks users out of their device or data and demands payment.

| Status | BitTasker Compliance                                              |
| ------ | ----------------------------------------------------------------- |
| ✅     | BitTasker does not lock devices or encrypt user data maliciously. |

---

### 9.9 Spyware

**Policy:** No malicious collection or sharing of user data unrelated to policy-compliant functionality.

| Status | BitTasker Compliance                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker collects only data necessary for app functionality (task data, wallet addresses, messages). |
| ✅     | All data collection is disclosed in the Privacy Policy.                                               |
| ✅     | End-to-end encryption is used for messages (Nostr NIP-44).                                            |

---

### 9.10 Trojans / Riskware

**Policy:** No hidden malicious functionality disguised as a legitimate app. No obfuscation to hide policy-violating behavior from reviewers.

| Status | BitTasker Compliance                                                                |
| ------ | ----------------------------------------------------------------------------------- |
| ✅     | BitTasker's functionality is transparent and matches its store listing description. |
| ✅     | No obfuscation beyond standard Android release build minification.                  |

---

## 10. Mobile Unwanted Software (MUwS)

### 10.1 Ad Fraud

**Policy:** No fake ad clicks, impression fraud, or any manipulation of ad metrics.

| Status | BitTasker Compliance                                            |
| ------ | --------------------------------------------------------------- |
| ✅     | BitTasker does not display ads and does not engage in ad fraud. |

---

### 10.2 Unauthorized Use or Imitation of System Functionality

**Policy:** Apps must not impersonate system UI, OS notifications, or other apps' interfaces.

| Status | BitTasker Compliance                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker uses standard Android UI components and DaisyUI/Tailwind for its web layer. No system UI impersonation. |

---

### 10.3 Social Engineering

**Policy:** Apps must not trick users into granting permissions, installing software, or taking actions they would not otherwise take.

| Status | BitTasker Compliance                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| ✅     | BitTasker permission requests are straightforward and accompanied by clear explanations. |
| ✅     | No dark patterns in the permission request flow.                                         |

---

### 10.4 Hostile Downloaders

**Policy:** Apps must not download other potentially harmful applications. If ≥5% of downloads from an app are PHAs, it is classified as a hostile downloader.

| Status | BitTasker Compliance                                       |
| ------ | ---------------------------------------------------------- |
| ✅     | BitTasker does not download or install other applications. |

---

## 11. Families Policies

**Policy:** Apps targeting children must comply with COPPA, GDPR-K, and other applicable child privacy laws. They must use only Families Self-Certified Ads SDKs, not transmit advertising IDs, not include APIs prohibited for child-directed services, and display safety warnings for AR features. Social features for children require adult action before enabling.

| Status | BitTasker Compliance                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | BitTasker does **not** target children. The target audience is adults (18+) engaging in financial transactions and service work.    |
| ✅     | The Target Audience and Content section in Play Console must be set to **Adults only (18+)**.                                       |
| ✅     | No child-directed advertising SDKs are required.                                                                                    |
| ⚠️     | Ensure the Play Console Target Audience declaration is set to Adults only and does not inadvertently include children's age groups. |

---

## 12. Enforcement & Account Standing

### 12.1 Enforcement Actions

Google Play may take the following actions for policy violations:

| Action                      | Impact                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **Rejection**               | App not published; no account standing impact                                               |
| **Removal**                 | App removed from store; in-app purchases disabled; multiple removals may lead to suspension |
| **Suspension**              | App removed; counts as a strike; multiple strikes lead to account termination               |
| **Limited Visibility**      | App remains available but not discoverable; accessible via direct link only                 |
| **Limited Regions**         | App restricted to certain countries                                                         |
| **Restricted Account**      | All apps removed; cannot publish new apps                                                   |
| **Account Termination**     | Permanent; all apps removed; related accounts also terminated                               |
| **Dormant Account Closure** | Inactive accounts are closed; registration fee forfeited                                    |

### 12.2 BitTasker Account Health Checklist

| Status | Item                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| ⚠️     | Complete the Financial Features Declaration in Play Console                       |
| ⚠️     | Complete the Data Safety section in Play Console                                  |
| ⚠️     | Complete the IARC content rating questionnaire                                    |
| ⚠️     | Set Target Audience to Adults (18+)                                               |
| ⚠️     | Publish Privacy Policy at a publicly accessible URL                               |
| ⚠️     | Implement account deletion flow (in-app + web URL)                                |
| ⚠️     | Implement in-app content reporting for UGC (messages, task descriptions, reviews) |
| ⚠️     | Resolve all issues from `audit-report.md` and `audit-report-v2.md`                |
| ✅     | App uses original branding with no impersonation                                  |
| ✅     | Bitcoin payments for real-world services are exempt from Google Play Billing      |
| ✅     | End-to-end encryption implemented for messages                                    |
| ✅     | No malware, backdoors, or spyware                                                 |

---

## 13. Recent 2026 Policy Updates

The following policy changes are effective in 2026 and are relevant to BitTasker:

| Effective Date       | Change                                                                                                                                                                                                                    | BitTasker Impact                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **March 4, 2026**    | Developer Program Policy updated                                                                                                                                                                                          | Review all sections of this document                                                                            |
| **March 2026**       | All apps on certified Android devices must come from verified developers. Requires $25 fee, Google payment profile, government-issued ID. Enforcement begins in Brazil, Indonesia, Singapore, Thailand by September 2026. | ⚠️ Ensure developer account verification is complete before targeting these markets.                            |
| **January 1, 2026**  | Age Signals API restricted to only provide age-appropriate experiences within the receiving app                                                                                                                           | N/A — BitTasker does not use the Age Signals API                                                                |
| **October 30, 2025** | New Age-Restricted Content and Functionality policy: apps with matchmaking, dating, or real-money gambling must block minors                                                                                              | ⚠️ BitTasker involves real-money Bitcoin transactions — age verification at account creation must be enforced   |
| **December 9, 2025** | Clarified payments policy and expanded alternative billing programs for U.S. developers                                                                                                                                   | ✅ BitTasker's Bitcoin service payments are exempt from Google Play Billing; no action needed for current model |
| **January 28, 2026** | Personal loan apps targeting Thailand must display loan provider info, max interest rates, and fees                                                                                                                       | N/A — BitTasker is not a loan app                                                                               |

---

## Quick Compliance Summary

### ✅ Already Compliant

- Original branding, no impersonation
- Bitcoin payments for real-world services (exempt from Google Play Billing)
- End-to-end encrypted messaging (Nostr NIP-44)
- Client-side encryption using Web Crypto API
- Secure key storage with NativeBiometric
- No malware, backdoors, spyware, or stalkerware
- No gambling, lending, or adult content
- No child-directed features
- No ad fraud or deceptive ads

### ⚠️ Action Required Before Submission

1. **Financial Features Declaration** — Complete in Play Console (Bitcoin wallet/payment features require this)
2. **Data Safety Section** — Complete in Play Console with accurate disclosure of all data collected
3. **Privacy Policy** — Publish at a public URL; link in Play Console and within the app
4. **Account Deletion** — Implement in-app deletion flow + web URL for Play Console
5. **Content Rating** — Complete IARC questionnaire; set to Teen or Mature 17+
6. **Target Audience** — Set to Adults (18+) in Play Console
7. **UGC Reporting** — Add in-app reporting/flagging for messages, task descriptions, and reviews
8. **Age Verification** — Enforce 18+ requirement at account creation (real-money transactions)
9. **Terms of Service** — Explicitly prohibit illegal tasks, CSAE content, and abusive behavior
10. **SDK Audit** — Document all third-party SDKs and their data practices
11. **Permission Audit** — Review `AndroidManifest.xml` for any unnecessary permissions
12. **Notification Icon** — Resolve missing `ic_stat_notify` asset (see `audit-report-v2.md`)
13. **Developer Verification** — Ensure account verification is complete for target markets

---

_Sources: [Google Play Developer Policy Center](https://play.google/developer-content-policy/) — All policies verified March 12, 2026_
