# Zapstore Release Pipeline

## Executive Summary

Automate BitTasker → Zapstore releases via a **GitLab CI child pipeline** on the same production git tags (`vX.Y.Z`) as Google Play. The pipeline builds a signed APK, generates release notes with **git-cliff**, creates a GitLab Release on `gitlab.com/bittasker/zapstore`, and publishes to Zapstore with **`zsp`** using a **masked `ZAPSTORE_PUBLISHER_NSEC`** in GitLab CI.

**Signing choice:** masked publisher nsec in GitLab (no NIP-46 bunker, no extra server). Acceptable on your **self-hosted** runner; use a dedicated Zapstore publisher key, not your personal identity.

**Version choice:** **`android-release-prepare`** auto-increments `versionCode` and sets `versionName` from the tag. **Both** Play Store and Zapstore receive the same `VERSION_NAME` / `VERSION_CODE` via dotenv. **Separate full builds** per store (different JKS files).

---

## Current State

| Asset | Location | Status |
| --- | --- | --- |
| Parent CI | `.gitlab-ci.yml` | `android-release-prepare` + manual Play + `trigger-zapstore-release` on `vX.Y.Z` |
| Child CI | `.gitlab/ci/release-zapstore.yml` | Preflight → build APK → changelog → GitLab release → manual `zsp publish` |
| Version prepare | `.gitlab/ci/android-release.yml` `android-release-prepare` | GitLab Release metadata + dotenv |
| Shared web build | `android-release-web` | One `npm run build` + `cap sync` per tag |
| Version guard | `.gitlab-ci.yml` `.android-release-env-guard` | Fails if `VERSION_*` missing before build |
| Play fastlane | `fastlane/Fastfile` `production` | Uses `VERSION_CODE` / `VERSION_NAME` from prepare (no fastlane increment) |
| Zapstore config | `gitlab.com/bittasker/zapstore` | `zapstore.yaml`, assets, `CHANGELOG.md` |
| Local script | `scripts/publish-to-zapstore.sh` | Local builds; publish steps still optional / commented |
| Changelog config | `cliff.toml` | git-cliff grouping for release notes |

### Infrastructure (no NestJS / relay code changes)

| Project | URL | Role |
| --- | --- | --- |
| **bittasker-nestjs** | `api.bittasker.com` | REST API (Railway) — unrelated to Zapstore CI |
| **bittasker-nostr-rs-relay** | `wss://relay1.bittasker.com` | General Nostr relay (Railway) |
| **nostr-relay-nestjs** | `relay2.bittasker.com` | Task relay (Railway) — separate from NestJS |

Zapstore publishing does **not** require changes in NestJS or relay repos. Only BitTasker CI variables and the `bittasker/zapstore` release repo.

---

## Two Kinds of “Signing”

| Layer | Purpose | Key | Tool |
| --- | --- | --- | --- |
| **Android APK** | Installable app | `bittasker-release-key.jks` | Gradle `assembleRelease` |
| **Zapstore catalog** | Nostr release events | Publisher npub/nsec | `zsp publish` + `SIGN_WITH` |

Play Store uses a **third** key: `upload-keystore.jks` for AAB upload (Play App Signing).

---

## Zapstore Signing: Masked `ZAPSTORE_PUBLISHER_NSEC`

### What `zsp` does with the nsec

`zsp publish` builds Nostr events (app metadata, release pointers, Blossom uploads). It signs those events with the key in `SIGN_WITH`.

In CI:

```yaml
variables:
  SIGN_WITH: $ZAPSTORE_PUBLISHER_NSEC
script:
  - zsp publish -y --quiet zapstore.yaml
```

GitLab variable:

| Key | Type | Protected | Masked |
| --- | --- | --- | --- |
| `ZAPSTORE_PUBLISHER_NSEC` | Variable | Yes | **Yes** |

Use a **dedicated** publisher identity (not the NestJS backend `NSEC`, not a personal daily-driver key).

### Security notes (self-hosted runner)

| Risk | Mitigation |
| --- | --- |
| nsec in job env | Masked variable; runner you control; dedicated publisher key |
| Logs | GitLab masks `ZAPSTORE_PUBLISHER_NSEC` in job logs when configured correctly |
| Runner compromise | Rotate publisher nsec; re-link APK cert in Zapstore if needed |
| vs bunker | Bunker avoids nsec in CI but needs extra infra; masked nsec is the chosen tradeoff |

### Deferred: NIP-46 bunker

A bunker URL (`bunker://…?relay=…&secret=…`) lets CI sign via a remote process that holds the nsec. Not used in this pipeline. Can be adopted later without changing the APK build flow.

---

## Version Model: android-release-prepare (Shared with Google Play)

### Fields

| Field | Users see? | Source for production `vX.Y.Z` |
| --- | --- | --- |
| **versionName** | Yes (stores, in-app) | Git tag: `v1.2.0` → `"1.2.0"` |
| **versionCode** | No (internal integer) | `android-release-prepare` (max from prepare commits on master + 1) |

Gradle **requires** `VERSION_CODE` and `VERSION_NAME` for release builds — no silent fallbacks:

```gradle
// Release: throws if VERSION_CODE / VERSION_NAME env vars are missing
// Debug/local: uses 1 / "0.0.0-dev" when env unset
versionCode resolveAndroidVersionCode()
versionName resolveAndroidVersionName()
```

**`android-release-prepare`** (inline in `.gitlab-ci.yml`):

- `VERSION_NAME` = tag without `v`
- `VERSION_CODE` = `ANDROID_RELEASE_VERSION_CODE` + 1 (first time) or read from existing GitLab Release for this tag
- Writes `release.env`; Play + Zapstore consume via dotenv / parent artifacts
- Updates **`ANDROID_RELEASE_VERSION_CODE`** via GitLab API (requires **`CI_API_TOKEN`**, `api` scope)

### Why separate builds (Play vs Zapstore)

| Store | Artifact | Keystore | CI job |
| --- | --- | --- | --- |
| Google Play | AAB | `upload-keystore.jks` | `android-release-production` |
| Zapstore | APK | `bittasker-release-key.jks` | `assemble-zapstore-apk` (child) |

Same versions, different signing keys — **two full builds**, not one shared artifact.

### Release workflow (developer)

**No manual version bump.** Merge to `master` via MR, then tag:

```bash
git checkout master && git pull origin master
git tag v1.2.0
git push origin v1.2.0
```

**In GitLab** — one pipeline for `v1.2.0`:

1. **android-release-prepare** runs automatically (versions + optional master commit)
2. Manual **android-release-production** → Play Store AAB
3. Manual **trigger-zapstore-release** → child pipeline → build APK → GitLab release → manual **publish-zapstore**

Order of steps 2 and 3 does not matter. Re-run prepare or manual jobs for the **same tag** without shipping — same `versionCode` (no double bump).

### Pre-release tags (Play only today)

`v*-alpha*` / `v*-beta*` still use `$CI_PIPELINE_ID` as `versionCode` for Play internal testing. Zapstore production uses plain `vX.Y.Z` only.

### Internal testing vs production

| Tag | Play | Zapstore |
| --- | --- | --- |
| `v1.2.0-alpha.1` | Internal track, `CI_PIPELINE_ID` | Not triggered |
| `v1.2.0` | Production (manual) | Child pipeline (manual trigger + manual publish) |

---

## Architecture

```
Developer: tag v1.2.0 on master → push tag
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Parent pipeline (.gitlab-ci.yml) — tag vX.Y.Z on master     │
│  • android-release-prepare         (auto) → VERSION_* dotenv │
│  • android-release-production      (manual) → Play AAB       │
│  • trigger-zapstore-release        (manual) → child below  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Child: .gitlab/ci/release-zapstore.yml                      │
│  preflight → build APK (Zapstore JKS) → changelog → release  │
│            → publish-zapstore (manual, zsp + masked nsec)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Child Pipeline Stages

| Stage | Job | Purpose |
| --- | --- | --- |
| preflight | `validate-tag` | Tag on master; require `VERSION_*` from parent |
| preflight | `validate-zapstore-keystore` | Decode `ZAPSTORE_KEYSTORE_*`, keytool |
| preflight | `check-zapstore-release-exists` | Skip duplicate `glab release create` |
| build | `assemble-zapstore-apk` | `npm ci`, build, cap sync, `assembleRelease` |
| changelog | `generate-changelog` | git-cliff → `release-notes.md` |
| gitlab-release | `create-zapstore-gitlab-release` | `glab release create` on `bittasker/zapstore` |
| publish-zapstore | `publish-zapstore` | **Manual** — clone zapstore repo, `zsp publish` |

---

## GitLab CI Variables

### Zapstore (required before first run)

| Key | Description | Protected | Masked |
| --- | --- | --- | --- |
| `ZAPSTORE_KEYSTORE_BASE64` | Base64 of `android/app/bittasker-release-key.jks` | Yes | Yes |
| `ZAPSTORE_KEYSTORE_PASSWORD` | Keystore store password | Yes | Yes |
| `ZAPSTORE_KEY_ALIAS` | `bittasker-release` | Yes | No |
| `ZAPSTORE_KEY_PASSWORD` | Key password | Yes | Yes |
| `ZAPSTORE_PUBLISHER_NSEC` | Publisher nsec for `zsp` | Yes | Yes |
| `ZAPSTORE_GITLAB_TOKEN` | Token with `api` scope for `bittasker/zapstore` releases | Yes | Yes |

Encode keystore:

```bash
base64 -i android/app/bittasker-release-key.jks | tr -d '\n' | pbcopy   # macOS
```

### Google Play (parent pipeline — not shared with Zapstore keystore)

| Key | Keystore |
| --- | --- |
| `ANDROID_KEYSTORE_*` | `upload-keystore.jks` |
| `PLAY_STORE_CREDENTIALS_JSON` | Play API |
| `CI_PUSH_TOKEN` | Project access token (`write_repository`) for prepare job |

**Do not** reuse Play upload keystore variables for Zapstore. Different files, different purposes.

---

## git-cliff

Config: `cliff.toml` at repo root.

Child job runs:

- `git-cliff --latest --strip all -o release-notes.md` — notes for this release
- Prepend to `CHANGELOG.md` when the file exists

Requires `GIT_DEPTH: 0` and at least two tags for meaningful diffs. Bootstrap: tag current production state before first automated release.

---

## First-Time Bootstrap (Manual Checklist)

1. **Tag current production** (example if store is at 1.1.7 / versionCode 15):

   ```bash
   git tag v1.1.7 <commit-on-master>
   git push origin v1.1.7
   ```

2. **Copy changelog** (optional):

   ```bash
   cp ../zapstore/CHANGELOG.md ./CHANGELOG.md
   git add CHANGELOG.md cliff.toml && git commit -m "chore: add changelog tooling"
   ```

3. **Configure GitLab variables** (table above).

4. **Ensure `bittasker/zapstore`** has `zapstore.yaml` with `pubkey` / whitelist (see [Zapstore publish docs](https://zapstore.dev/docs/publish)).

5. **One-time `zsp` certificate link** — run locally with publisher nsec and release keystore when prompted.

6. **Dry run** — tag `v1.1.8`, wait for prepare, run child pipeline, manual publish only when APK looks correct.

---

## Local Development

```bash
export NOSTR_NSEC='nsec1...'   # or SIGN_WITH=...
npm run release:zapstore patch publish   # still uses local bump logic in script
```

CI uses tag + prepare job; local script can keep semver bump helpers for ad-hoc builds.

Install `zsp`:

```bash
go install github.com/zapstore/zsp@latest
```

---

## Error Handling

| Scenario | Behavior |
| --- | --- |
| Tag not on master | `validate-tag` fails |
| Wrong tag format | `android-release-prepare` fails |
| Missing VERSION_* | `.android-release-env-guard` / child `validate-tag` fails before Gradle |
| Keystore invalid | `validate-zapstore-keystore` fails |
| GitLab release already exists | Skip `glab release create`; can still run `publish-zapstore` |
| `zsp` fails | Retry **publish-zapstore** only; APK + GitLab release remain |
| Missing `ZAPSTORE_PUBLISHER_NSEC` | Publish job fails at start |

---

## Patterns Shared with Play Store

| Pattern | Play | Zapstore |
| --- | --- | --- |
| Production tag | `^v\d+\.\d+\.\d+$` | Same |
| Tag on master guard | Yes | Yes |
| `VERSION_NAME` / `VERSION_CODE` | `android-release-prepare` dotenv | Forwarded from parent |
| Separate build | AAB + upload keystore | APK + Zapstore keystore |
| Manual production gate | `android-release-production` | `trigger-zapstore-release` + `publish-zapstore` |
| Auto version bump | `android-release-prepare` | Same prepare job (shared) |

See also [play-store-pipeline.md](./play-store-pipeline.md).

---

## Implementation Status

| Item | Status |
| --- | --- |
| `.gitlab/ci/release-zapstore.yml` | Implemented |
| `android-release-prepare` (inline in `.gitlab-ci.yml`) | Implemented |
| `.android-release-env-guard` | Implemented |
| `trigger-zapstore-release` in `.gitlab-ci.yml` | Implemented |
| `cliff.toml` | Implemented |
| Play `production` (no fastlane increment) | Implemented |
| GitLab variables (`CI_PUSH_TOKEN`, Zapstore, Play) | **Manual** |
| Initial git tags / CHANGELOG bootstrap | **Manual** |
| First `zsp` cert link | **Manual** |

---

## Related Docs

- [play-store-pipeline.md](./play-store-pipeline.md) — Google Play fastlane
- [environment-variables.md](./environment-variables.md) — Workers / VITE scoping
- [requirements/zapstore-publishing-guide.md](../../requirements/zapstore-publishing-guide.md) — historical local publish guide
