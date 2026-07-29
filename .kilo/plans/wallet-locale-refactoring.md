# Wallet Locale Files Refactoring Plan

**Date**: 2026-07-07
**Status**: Planning — no changes yet
**Scope**: Deduplicate and restructure `wallet.json` locale files

---

## Current State

| File | Lines | Duplicate Keys | Key Issue |
|------|-------|---------------|-----------|
| `en/dashboard/wallet.json` | 2,226 | 152 | Missing `common` section (just added), toast.error was string |
| `es/dashboard/wallet.json` | 2,136 | 148 | toast.error was string, had common section |
| `en/common.json` | 978 | N/A | Clean |
| `es/common.json` | 977 | N/A | Clean |

### Root Cause
Multiple AI agents independently added i18n keys to the locale files. Each agent added new sections instead of merging into existing ones, creating duplicate keys at the same nesting level. JSON.parse only keeps the **last** value for duplicate keys, so earlier instances are silently overwritten.

### Impact
- **300 duplicate key pairs** across both files
- Inconsistent behavior when different duplicate instances have different values
- Confusing for developers — can't tell which instance the runtime uses
- Difficult to maintain — adding a new key may create yet another duplicate

---

## Duplicate Key Inventory

### EN locale (152 duplicates) — Most Critical

| Key Pattern | Copies | Lines | Risk |
|-------------|--------|-------|------|
| `"bitcoin_rbtc"` | 6 | 754, 814, 1034, 1169, 2115, 2194 | HIGH — different values per section |
| `"error"` | 5 | 239, 1353, 1392, 2030, 2076 | HIGH — deeply nested |
| `"title"` | 15 | 270, 296, 464, 510, 668, 718, 765, 910, 1363, 1389, 1454, 1474, 1585, 2043, 2069 | HIGH — most duplicated key |
| `"retry"` | 3 | 261, 388, 2142 | MEDIUM |
| `"status"` | 5+ | Multiple sections | MEDIUM |
| `"amount"` | 3+ | Multiple sections | MEDIUM |
| `"close"` | 3 | 28, 819, 1590 | MEDIUM |
| Root-level `"wallet"` | 2 | 2, 2165 | HIGH — entire section duplicated at end of file |
| `"pending_swaps"` | 2 | 2161, 2162 | HIGH — at same depth, one overwrites other |

### ES locale (148 duplicates) — Similar patterns

Mirrors the EN structure with the same duplicate keys.

---

## Refactoring Strategy

### Step 1: Build a canonical key-value map

For each unique key path (e.g., `wallet.title`, `wallet.balance.rbtc`, `wallet.toast.error.generic`):
1. Find ALL instances in the JSON
2. Compare values — if identical, keep one and delete the rest
3. If values differ, determine which is correct based on what the code actually uses (grep the `$t()` calls)
4. Keep the correct one, delete the rest

### Step 2: Rebuild the JSON file from the canonical map

Instead of trying to surgically remove individual duplicates (error-prone with 152 instances), rebuild the file:
1. Parse the current JSON (which keeps only the last value for each key)
2. Walk the resulting tree and write it out clean — no duplicates by definition

This is safe because `json.load()` already resolves duplicates by keeping the last value. The rebuild just writes a clean version of what the runtime was already using.

### Step 3: Verify against code

For every top-level section in the rebuilt file, verify it's actually referenced by code:
```bash
grep -roh "wallet\.\w+\.\w+" src/lib/ | sort -u
```

Any key in the JSON that's not referenced by code is dead — flag it for removal.

### Step 4: Sync EN and ES

After rebuilding each file independently, cross-reference the key structures. Any key in EN but not ES (or vice versa) should be flagged.

---

## Implementation Approach

### Phase 1: EN rebuild (estimated ~200 lines changed)
1. Parse current EN `wallet.json` via `json.load()` — this resolves all 152 duplicates by keeping last values
2. Rebuild the file with clean formatting
3. Verify no keys are lost by comparing parsed key count before/after

### Phase 2: ES rebuild (estimated ~200 lines changed)
Same process for ES.

### Phase 3: Cross-reference and sync
1. Extract all key paths from EN
2. Extract all key paths from ES
3. Report any keys present in one but not the other

### Phase 4: Code verification
Grep all `$t()` calls in wallet components and verify every key exists in the JSON.

---

## Common.json Assessment

`en/common.json` (978 lines) and `es/common.json` (977 lines) are clean — no duplicate key issues found. The wallet components use several `common.*` keys:
- `common.close`, `common.cancel`, `common.confirm`, `common.max`, `common.processing`
- `common.buttons.retry`
- `common.accessibility.help`

These all exist and are properly structured. **No refactoring needed for common.json.**

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Rebuild drops a key that code references | Verify all `$t()` keys exist in rebuilt JSON |
| Different duplicate values — wrong one kept | `json.load()` keeps last value (same as runtime) |
| ES translation quality degrades | Don't change values, only structure |
| New keys added during refactor | Complete refactor first, then add new keys |

---

## Expected Outcome

- EN: ~2,226 lines → ~1,400 lines (35% reduction from removing duplicates)
- ES: ~2,136 lines → ~1,350 lines (37% reduction)
- Zero duplicate keys
- Zero structural inconsistencies between EN and ES
- All `$t()` keys verified against code
