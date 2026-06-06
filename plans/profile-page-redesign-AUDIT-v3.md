# Profile Page Redesign Plan v3 — Final Audit Report

**Auditor:** Code Reviewer (Implementation)  
**Date:** 2026-06-04  
**Plan:** `plans/profile-page-redesign-v3.md`  
**Previous Audit:** `plans/profile-page-redesign-AUDIT.md`  
**Round:** 2 (First round found 6 critical issues, now fixed)

---

## Review Summary

**Verdict:** REQUEST CHANGES

**Overview:** Plan v3 successfully resolves all 6 first-round critical issues (wrong kind numbers, duplicate functions, wrong file paths, SSR references, race conditions, lazy loading). Three Important issues remain that will cause TypeScript compilation errors or a non-functional subscription at implementation time.

---

### Verification Results

#### ✅ Verified Items (All Pass)

| #   | Item                            | Status   | Evidence                                                                              |
| --- | ------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| 5   | No message buttons              | ✅ Pass  | Lines 35, 415, 499, 551 — zero chat/message references                                |
| 6   | No unavailable data             | ✅ Pass  | Lines 37-40, 471, 497 — no online indicator, response time, completion %, recommend % |
| 7   | General location only           | ✅ Pass  | Lines 36, 413 — city/country only, no coordinates in code samples                     |
| 8   | SSR removed                     | ✅ Pass  | Lines 32, 51 — explicitly states no `+page.server.ts`                                 |
| 10  | Unique ID collision             | ✅ Pass  | Line 509 — `` `general-inquiry-${Date.now()}` `` dynamic timestamp                    |
| —   | Wrong kind numbers              | ✅ Fixed | Uses `KINDS.TASK_CREATION` (31000) throughout                                         |
| —   | Duplicate functions             | ✅ Fixed | Task 1.1 reuses `findProfileServicesByAuthor`                                         |
| —   | Broken ARIA patterns            | ✅ Pass  | Proper `aria-label`, `aria-labelledby`, `role="meter"` patterns                       |
| —   | XSS vectors                     | ✅ Pass  | Line 475: plain text `{comment}`, never `{@html}`                                     |
| —   | IntersectionObserver flickering | ✅ Pass  | Lines 431-453: scroll-lock + scrollend + 600ms timeout fallback                       |
| —   | Race conditions                 | ✅ Fixed | Line 556: `Promise.allSettled`                                                        |
| —   | Lazy loading                    | ✅ Fixed | Line 543: only profile + reviews on mount                                             |

---

### Critical Issues

_None found._

---

### Important Issues

#### IMPORTANT-01: `sub.start()` Missing in Code Sample

**Location:** Plan lines 350-366 (Task 1.2 code sample)  
**Severity:** 🟡 Important — subscription will hang, tasks section will timeout

**Problem:** The plan's text at line 303 correctly states:

> "Must call `sub.start()` after attaching event handlers (defensive consistency with reviews/queries.ts pattern)"

But the code sample at lines 350-366 **does not include `sub.start()`**:

```typescript
// Lines 350-366 — sub.start() is ABSENT
const sub = ndk.subscribe(filter, { closeOnEose: true });
sub.on('event', (event) => {
	/* ... */
});
sub.on('eose', () => resolve(tasks));
setTimeout(() => resolve(tasks), 10000);
// ← Missing: sub.start();
```

**Reference pattern** (`reviews/queries.ts` line 288-345):

```typescript
const sub = ndk.subscribe(filter, { closeOnEose: true });
sub.on('event', (event) => {
	/* ... */
});
sub.on('eose', async () => {
	/* ... */
});
sub.start(); // ← Explicit start required
```

**Impact:** Without `sub.start()`, the subscription may never fire events. The function will only resolve via the 10-second timeout, making the tasks section appear empty or very slow.

**Fix:** Add `sub.start();` after the `sub.on('eose', ...)` handler:

```typescript
sub.on('eose', () => resolve(tasks));
sub.start(); // ← Add this line
setTimeout(() => resolve(tasks), 10000);
```

---

#### IMPORTANT-02: `DisplayProfile` Type Does Not Exist

**Location:** Plan line 253 (Task 0.1 code sample)  
**Severity:** 🟡 Important — TypeScript compilation error

**Problem:** The extracted translation function imports:

```typescript
import type { DisplayProfile } from '$lib/types/profile.d';

export function getTranslatedProfileContent(
	profile: DisplayProfile | null,  // ← Type doesn't exist
	field: string,
	locale: string
): string {
```

**No `DisplayProfile` type exists in the codebase.** The existing local functions use `$profileStore.data` which is `NostrProfile`:

- `profile.d.ts` exports: `NostrProfile`, `NostrProfileImage`, `ProfileTranslations`, `NostrProfileData`
- `NostrProfile` has `translations?: ProfileTranslations` (line 46)

**Impact:** TypeScript will error on import. Developer must stop and research the correct type.

**Fix:** Replace `DisplayProfile` with `NostrProfile`:

```typescript
import type { NostrProfile } from '$lib/types/profile.d';

export function getTranslatedProfileContent(
	profile: NostrProfile | null,
	field: string,
	locale: string
): string {
```

---

#### IMPORTANT-03: Missing Required `currency` Field in Virtual Service Pricing

**Location:** Plan line 516 (Task 3.9 code sample)  
**Severity:** 🟡 Important — undefined field at runtime

**Problem:** The `ServicePricing` interface requires `currency`:

```typescript
// service.d.ts line 173-175
export interface ServicePricing {
	type: ServicePricingTypeEnum;
	currency: string; // 'BTC' | 'USDt' — REQUIRED
```

But the virtual service pricing omits it:

```typescript
// Plan line 516
pricing: { type: ServicePricingTypeEnum.INQUIRY_REQUIRED } as ServicePricing,
// ← Missing: currency: 'USDt'
```

The `as ServicePricing` cast suppresses the TypeScript error, but `currency` will be `undefined` at runtime.

**Impact:** If `publishServiceQuoteRequest()` or downstream code accesses `pricing.currency` (e.g., for display, event tags, or protocol validation), it will read `undefined`. The protocol layer at `protocol.ts` may reject the event or produce malformed Nostr event tags.

**Fix:** Add the required field:

```typescript
pricing: {
	type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
	currency: 'USDt'
} as ServicePricing,
```

---

### Suggestions

#### SUGGESTION-01: Translation Function Signature Mismatches Existing Behavior

**Location:** Plan lines 252-260 (Task 0.1)  
**Severity:** 🟢 Suggestion

**Problem:** The extracted `getTranslatedProfileContent` returns empty string on null profile:

```typescript
// Plan line 258
if (!profile?.translations) return '';
```

But the existing local function returns the original field value:

```typescript
// ProfileInfoSection.svelte line 11-16
const originalText = $profileStore.data?.[field] || '';
if (!$profileStore.data?.translations) return originalText;
```

**Impact:** New components will show blank text when no translations exist, while existing components show the untranslated original. Visually inconsistent.

**Fix:** Return original text as fallback:

```typescript
export function getTranslatedProfileContent(
	profile: NostrProfile | null,
	field: 'professionalTitle' | 'about',
	locale: string
): string {
	const originalText = profile?.[field] || '';
	if (!profile?.translations) return originalText;
	const currentLang = locale || 'en';
	if (profile.translations.sourceLanguage === currentLang) return originalText;
	const translation = profile.translations.translations[currentLang];
	if (translation) return translation[field] || originalText;
	return originalText;
}
```

Note: Also narrows `field` to `'professionalTitle' | 'about'` to match existing usage and `ProfileTranslations` type.

---

#### SUGGESTION-02: `getTranslatedSkillName` Loses Object Signature

**Location:** Plan lines 262-269 (Task 0.1)  
**Severity:** 🟢 Suggestion

**Problem:** Existing `getTranslatedSkillName` accepts both `string` and object with translations:

```typescript
// ProfileInfoSection.svelte lines 34-43
function getTranslatedSkillName(
	skill: string | {
		name: string;
		translations?: { sourceLanguage?: string; translations?: Record<string, { name?: string }> };
	}
): string {
```

But the extracted version only accepts `string`:

```typescript
// Plan line 263
export function getTranslatedSkillName(skill: string, locale: string): string {
	return skill; // fallback
}
```

**Impact:** If new components pass skill objects (which the existing codebase does), TypeScript will error or translations won't work.

**Fix:** Match the existing signature:

```typescript
export function getTranslatedSkillName(
	skill:
		| string
		| {
				name: string;
				translations?: {
					sourceLanguage?: string;
					translations?: Record<string, { name?: string }>;
				};
		  },
	locale: string
): string {
	if (typeof skill === 'string') return skill;
	const originalName = skill.name || '';
	if (!skill.translations) return originalName;
	const currentLang = locale || 'en';
	if (skill.translations.sourceLanguage === currentLang) return originalName;
	const translation = skill.translations.translations[currentLang];
	return translation?.name || originalName;
}
```

---

#### SUGGESTION-03: Portfolio Translation Functions Have Simpler Type Than Existing

**Location:** Plan lines 271-283 (Task 0.1)  
**Severity:** 🟢 Suggestion

**Problem:** Existing functions use nested `translations` with `sourceLanguage` check:

```typescript
// ProfileInfoSection.svelte lines 75-103
function getTranslatedPortfolioTitle(item: {
	title: string;
	translations?: { sourceLanguage?: string; translations?: Record<string, { title?: string }> };
}): string {
	if (item.translations.sourceLanguage === currentLang) return originalTitle;
```

But extracted version uses flat structure:

```typescript
// Plan lines 271-276
export function getTranslatedPortfolioTitle(
	item: { title?: string; translations?: Record<string, { title?: string }> },
	locale: string
): string {
	return item.translations?.[locale]?.title ?? item.title ?? '';
```

**Impact:** Different translation structure. If real portfolio items have nested `translations.translations[lang].title` (as existing code expects), the extracted version will not find translations.

**Fix:** Match existing nested structure with `sourceLanguage` check.

---

### What's Done Well

- **First-round fixes are thorough.** All 6 critical issues from round 1 are cleanly resolved with correct kind numbers, proper file paths, `Promise.allSettled`, and true lazy loading.

- **Scroll-lock implementation is solid.** The combination of `scrollend` event + 600ms timeout fallback at lines 431-445 handles both modern browsers and iOS Safari gracefully.

- **Virtual service approach is clever.** Reusing `RequestQuoteModal` with a virtual service object avoids protocol changes and new UI components. The `serviceEventId: ''` workaround at line 531 is well-thought-out.

- **Lazy loading architecture is correct.** Each section manages its own fetch state, and only profile + reviews load on mount (line 543). This prevents the N+1 relay query problem.

- **Accessibility is comprehensive.** `aria-label`, `aria-labelledby`, `role="meter"`, `aria-current`, and arrow key navigation are all specified.

---

### Verification Story

- **Types verified:** ✅ Checked `service.d.ts` (Service, ServicePricing, ServiceStatus), `profile.d.ts` (NostrProfile, NostrProfileData, ProfileTranslations), `review.d.ts` references
- **NDK pattern verified:** ✅ Compared `reviews/queries.ts` lines 271-346 (fetchAttestations) against plan's findProfileTasksByAuthor
- **buildServiceAddress verified:** ✅ Confirmed requires `Pick<Service, 'npub' | 'uniqueId' | 'status' | 'eventKind'>` — virtual service has all
- **Translation functions verified:** ✅ Compared plan signatures against `ProfileInfoSection.svelte` local functions (lines 9-130)
- **metadata-wire.ts verified:** ✅ Confirmed `PROFILE_METADATA_WIRE_ENRICHMENT_KEYS` does NOT include `languages` — Task 1.4 correctly identifies this
- **KINDS constant verified:** ✅ `TASK_CREATION: 31000` at `kinds.ts`
- **No message/chat references verified:** ✅ Grep of plan confirms zero occurrences
- **No unavailable data verified:** ✅ Online indicator, response time, completion %, recommend % all explicitly excluded

---

## Summary

| ID            | Severity | Issue                                    | Location      | Status    |
| ------------- | -------- | ---------------------------------------- | ------------- | --------- |
| IMPORTANT-01  | 🟡       | Missing `sub.start()` in code sample     | Lines 350-366 | Needs fix |
| IMPORTANT-02  | 🟡       | `DisplayProfile` type doesn't exist      | Line 253      | Needs fix |
| IMPORTANT-03  | 🟡       | Missing `currency` in virtual pricing    | Line 516      | Needs fix |
| SUGGESTION-01 | 🟢       | Translation returns '' vs original text  | Lines 258     | Consider  |
| SUGGESTION-02 | 🟢       | Skill translation loses object signature | Lines 262-269 | Consider  |
| SUGGESTION-03 | 🟢       | Portfolio translation structure mismatch | Lines 271-283 | Consider  |

**First-round issues:** 6/6 resolved ✅  
**New critical issues:** 0  
**New important issues:** 3  
**New suggestions:** 3
