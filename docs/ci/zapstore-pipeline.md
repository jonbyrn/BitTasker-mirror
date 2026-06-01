# Zapstore Release Pipeline — Implementation Plan

## Executive Summary

Fully automate the BitTasker → Zapstore release process via a GitLab CI child pipeline. The pipeline is triggered by pushing a version tag (`vX.Y.Z`) to master, builds a signed APK, auto-generates release notes from conventional commits via git-cliff, creates a GitLab Release, and publishes to Zapstore using a **self-hosted NIP-46 bunker** (`nak bunker`) for remote signing — your nsec never touches CI.

---

## Current State Assessment

### What exists

| Asset | Location | State |
|---|---|---|
| `scripts/publish-to-zapstore.sh` | Main repo | Builds APK, bumps version in `build.gradle`. GitLab release + Zapstore publish steps (lines 241–361) are **commented out**. |
| `.gitlab-ci.yml` | Main repo | Cloudflare Workers (validate + deploy) + **Play Store pipeline** (tag-triggered, build-android + deploy-android stages). |
| Play Store pipeline | `.gitlab-ci.yml` lines 288–413 + `fastlane/Fastfile` | **Tag-based triggering** on master. Uses `reactnativecommunity/react-native-android` image. fastlane handles build + upload. Manual gate for production. |
| `zapstore/` repo | `../zapstore` | Contains `zapstore.yaml`, `CHANGELOG.md`, `dist/glab.sh` (hardcoded version), and assets. |
| `zsp` CLI | `/Users/doma/go/bin/zsp` | v0.4.6. Supports bunker URLs (`bunker://...`), `--quiet`, `--json`, `--offline`. |
| Keystore | `android/app/bittasker-release-key.jks` | Release signing key (gitignored). |
| `keystore.properties` | `android/keystore.properties` | Contains store password and key alias (gitignored). |

### Existing server infrastructure

| Server | URL | Role |
|---|---|---|
| NestJS API | `api.bittasker.com` / `relay2.bittasker.com` | Authentication, notifications, REST API, task-specific Nostr relay |
| Relay 1 | `relay1.bittasker.com` (wss://) | Primary Nostr relay — stores all events |
| Relay 2 | `relay2.bittasker.com` (wss://) | Task-specific Nostr relay — indexing for filtering |
| Cloudflare Workers | `bittasker.com` | Frontend serving, Stream video handling |

### What's missing

| Gap | Impact |
|---|---|
| No git tags exist | No way to diff releases for changelogs |
| `package.json` version = `0.0.1` | Disconnected from real version (`1.1.6` in `build.gradle`) |
| No `CHANGELOG.md` in main repo | Release history only in zapstore repo |
| No conventional commit enforcement | ~67% of commits use conventional format; rest are unstructured |
| No bunker/signer running on servers | Currently signing is manual with raw nsec |
| Zapstore publish steps commented out | Script stops after APK build |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ TRIGGER: Developer pushes a version tag to master            │
│   git tag v1.2.0                                            │
│   git push origin v1.2.0                                    │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ PARENT PIPELINE (.gitlab-ci.yml)                             │
│ Stage: deploy-android (manual gate for production)            │
│                                                              │
│ Rules: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/ on master       │
│ Guard: git merge-base --is-ancestor origin/master            │
│                                                              │
│ trigger-zapstore-release job → triggers child pipeline       │
│   strategy: depend                                           │
│   include: .gitlab/ci/release-zapstore.yml                   │
│   variables:                                                 │
│     VERSION: $CI_COMMIT_TAG (stripped of 'v' prefix)        │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ CHILD PIPELINE (.gitlab/ci/release-zapstore.yml)              │
│                                                              │
│  Stage 1: preflight                                          │
│  ├─ validate-tag             — verify semver format          │
│  ├─ validate-keystore        — verify JKS password           │
│  └─ check-already-released   — skip if tag exists (idempotent)│
│                                                              │
│  Stage 2: build                                              │
│  ├─ install-deps             — npm ci                        │
│  ├─ sync-versions            — sync VERSION to build.gradle   │
│  ├─ build-webapp             — npm run build                 │
│  ├─ sync-capacitor           — npx cap sync                  │
│  └─ assemble-apk             — ./gradlew assembleRelease     │
│                                                              │
│  Stage 3: changelog                                          │
│  └─ generate-changelog — git-cliff → release-notes.md        │
│                                                              │
│  Stage 4: gitlab-release (destructive — no retry)             │
│  └─ create-release — GitLab Release API + APK asset link     │
│                                                              │
│  Stage 5: publish-zapstore (manual gate — no retry)          │
│  └─ publish — SIGN_WITH=$BUNKER_URL zsp publish --quiet      │
│                                                              │
│  Stage 6: rollback (manual only, never automatic)            │
│  └─ rollback-to-previous — re-publish previous APK           │
└─────────────────────────────────────────────────────────────┘
```

### Signing architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   GitLab CI Job  │     │  Your Relay(s)   │     │   API Server     │
│                  │     │                  │     │                  │
│ SIGN_WITH=       │     │ wss://relay1...  │     │  nak bunker      │
│ bunker://pubkey  │────►│                  │────►│  (systemd)       │
│ ?relay=wss://... │     │ kind 24133 (NIP- │     │                  │
│ &secret=<token>  │     │  44 encrypted)   │     │  holds nsec      │
│                  │     │                  │     │  in memory only  │
│      ↓           │     │                  │     │       ↓          │
│  APK uploaded    │     │                  │     │  signs events    │
│  to Blossom CDN  │     │                  │     │  returns signed  │
│                  │     │                  │     │  event via relay │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**Key security property**: The nsec never leaves the API server. CI only has a revocable connection token (the bunker URL). The relay transports NIP-44 encrypted messages — it can't read the signing requests.

---

## Bunker URL — Self-Hosted Setup

### Why a bunker instead of nsec in CI

| Scenario | nsec stolen from CI | Bunker URL stolen from CI |
|---|---|---|
| **What attacker gets** | Your private key, permanently | A one-time connection token |
| **What they can do** | Sign anything, impersonate you, steal funds | Sign events until revoked |
| **Recovery** | Generate new identity, re-register everywhere | Click "revoke" on bunker. Generate new secret. |
| **Blast radius** | Complete identity loss | Temporary, contained, revocable |
| **Secret lifetime** | Forever (key is the identity) | Single-use — consumed on first successful CI run |

The bunker URL's `secret` parameter is a single-use token. Once CI connects successfully, the secret is consumed. A stolen URL after CI ran is worthless. A stolen URL before CI runs is revocable.

### `nak bunker` — the recommended approach

`nak` (by fiatjaf) is a single Go binary (`v0.19.10`). Its `bunker` subcommand runs a NIP-46 remote signer daemon. It needs:
- Your nsec (passed via `--sec` flag or `NOSTR_SECRET_KEY` env var)
- One or more relay URLs for communication (your existing relays work)
- No inbound ports, no database, no Docker required

**Resource footprint**: ~10MB RAM, near-zero CPU when idle, negligible disk.

### Deployment on the API server

The bunker should run on the **NestJS API server** (`api.bittasker.com` / relay2). It already has outbound WebSocket access to both relays, is regularly maintained, and is secured.

#### Step 1: Install nak

```bash
# Via Go (if Go is installed):
go install github.com/fiatjaf/nak@latest

# Or download pre-built binary:
curl -sSL https://raw.githubusercontent.com/fiatjaf/nak/master/install.sh | sh

# Verify:
nak --version  # should show v0.19.10+
```

#### Step 2: Create dedicated user and data directory

```bash
sudo useradd --system --create-home --home-dir /var/lib/nak --shell /usr/sbin/nologin nak
sudo mkdir -p /var/lib/nak/.config/nak/bunker
sudo chown -R nak:nak /var/lib/nak
```

#### Step 3: First run — generate bunker URL

```bash
# The --persist flag saves authorized clients across restarts
# Use your existing relay1 as the communication relay
# -s flag creates a pre-authorized secret (one-time token) for CI

sudo -u nak nak bunker --persist \
  --sec nsec1... \
  -s ci-secret-token-here \
  wss://relay1.bittasker.com

# Output:
# 🔐 bunker daemon started
# Connection string: bunker://<hex-pubkey>?relay=wss://relay1.bittasker.com&secret=ci-secret-token-here
```

**Copy the bunker URL.** This is what goes in the `BUNKER_URL` GitLab CI variable.

#### Step 4: Create systemd service

```ini
# /etc/systemd/system/nak-bunker.service
[Unit]
Description=Nostr NIP-46 Bunker (nak)
Documentation=https://github.com/fiatjaf/nak
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nak
Group=nak
Environment=HOME=/var/lib/nak
ExecStart=/usr/local/bin/nak bunker --persist --profile production
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/nak
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
```

**Note on key storage**: With `--persist` and a plain `nsec`, the key is written to `/var/lib/nak/.config/nak/bunker/production` (JSON, permissions 0600). The file contains the nsec in plaintext. For stronger at-rest security, use an `ncryptsec1...` (NIP-49 encrypted) key instead — nak will prompt for the decryption password on startup, and the config file stores only the encrypted form. For unattended CI use with ncryptsec, inject the password via systemd `LoadCredential`.

#### Step 5: Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nak-bunker
sudo journalctl -u nak-bunker -f  # verify it's running
```

### Relay choice

Use **relay1.bittasker.com** (your general-purpose relay) as the bunker relay. Since you control this relay:
- No rate limits on kind 24133 events
- Guaranteed p-tag filtering
- Lowest latency (same infrastructure)

Optionally add a public relay as fallback:
```bash
nak bunker --persist wss://relay1.bittasker.com wss://nos.lol
```

### CI variable configuration

After setup, add to GitLab **Settings → CI/CD → Variables**:

| Key | Type | Value | Protected | Masked |
|---|---|---|---|---|
| `BUNKER_URL` | Variable | `bunker://<pubkey>?relay=wss://relay1.bittasker.com&secret=<token>` | Yes | Yes |

---

## git-cliff — Automated Changelog Generation

### What it is

git-cliff is a single Rust binary (Docker image: `orhunp/git-cliff:latest`) that reads your git history and turns structured commit messages into a formatted changelog.

### How it works

1. Scans commits between git tags (e.g., `v1.1.6..v1.2.0`)
2. Parses commit messages using Conventional Commits format (`feat:`, `fix:`, `chore:`, etc.)
3. Groups commits by type (Features, Bug Fixes, Maintenance, etc.)
4. Renders output via a customizable Tera template

### Concrete example

**Input commits** (between `v1.1.6` and `v1.2.0`):
```
feat: add video upload to tasks
fix: resolve date picker timezone offset
chore: upgrade NDK to v3.1.0
refactor: extract contract signing
docs: update API docs
```

**Output:**
```markdown
## [1.2.0] - 2026-06-01

### Features
- Add video upload to tasks

### Bug Fixes
- Resolve date picker timezone offset

### Documentation
- Update API docs

### Refactor
- Extract contract signing

### Maintenance
- Upgrade NDK to v3.1.0
```

### Key commands

| Command | Use case |
|---|---|
| `git cliff --latest --strip all` | Release notes for the latest version only (CI) |
| `git cliff --unreleased --tag 1.2.0 --prepend CHANGELOG.md` | Add new version to existing changelog |
| `git cliff -o CHANGELOG.md` | Regenerate full changelog from all tags |

### Configuration

A `cliff.toml` at the repo root controls grouping, formatting, and template. See the `cliff.toml` section under "Files to Create" below.

### CI integration

```yaml
generate-changelog:
  image: orhunp/git-cliff:latest
  stage: changelog
  variables:
    GIT_STRATEGY: clone
    GIT_DEPTH: 0  # full history needed for tag diffing
  script:
    - git-cliff --latest --strip all -o release-notes.md
    - git-cliff --unreleased --tag "v${VERSION}" --prepend CHANGELOG.md
  artifacts:
    paths:
      - release-notes.md
      - CHANGELOG.md
```

---

## Pipeline Stages — Detailed Design

### Trigger: Git Tag on Master

The pipeline triggers when a semver tag is pushed to master:

```yaml
trigger-zapstore-release:
  stage: deploy-android
  tags:
    - self-hosted
  variables:
    VERSION: $CI_COMMIT_TAG
  trigger:
    include:
      - local: .gitlab/ci/release-zapstore.yml
    strategy: depend
  environment:
    name: production
    deployment_tier: production
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
      when: manual
      allow_failure: true
```

The developer workflow:
```bash
# 1. Decide the version (patch, minor, or major)
# 2. Tag and push:
git tag v1.2.0
git push origin v1.2.0

# 3. Go to GitLab → Pipelines → click "play" on the release job
```

### Stage 1: Preflight (`retry: 0`)

Fast-fail before spending ~10 minutes on a build.

**validate-tag:**
```yaml
validate-tag:
  stage: preflight
  image: alpine:latest
  script:
    - |
      TAG="$CI_COMMIT_TAG"
      VERSION="${TAG#v}"
      if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        echo "ERROR: Tag must be vX.Y.Z format"
        exit 1
      fi
      echo "Valid version: $VERSION"
```

**validate-keystore:**
```yaml
validate-keystore:
  stage: preflight
  image: reactnativecommunity/react-native-android:latest
  script:
    - echo "$KEYSTORE_BASE64" | base64 -d > android/app/bittasker-release-key.jks
    - keytool -list -keystore android/app/bittasker-release-key.jks
      -storepass "$KEYSTORE_PASSWORD" -alias bittasker-release
      && echo "Keystore valid"
  after_script:
    - rm -f android/app/bittasker-release-key.jks
```

**check-already-released (idempotency guard):**
```yaml
check-already-released:
  stage: preflight
  image: alpine:latest
  script:
    - |
      if git ls-remote --tags origin | grep -q "refs/tags/${CI_COMMIT_TAG}$"; then
        echo "Tag ${CI_COMMIT_TAG} already released. Nothing to do."
        exit 0
      fi
```

### Stage 2: Build

Uses the same Docker image as the Play Store pipeline (`reactnativecommunity/react-native-android:latest`), which already has JDK + Node.js + Android SDK.

**sync-versions — writes tag version to build.gradle:**
```yaml
sync-versions:
  stage: build
  image: alpine:latest
  script:
    - |
      VERSION="${CI_COMMIT_TAG#v}"
      # Update build.gradle versionName (keep versionCode increment)
      CURRENT_VERSION_CODE=$(grep 'versionCode' android/app/build.gradle | grep -o '[0-9]*')
      NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))
      sed -i "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" android/app/build.gradle
      sed -i "s/versionName \".*\"/versionName \"$VERSION\"/" android/app/build.gradle
      # Sync package.json
      sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
      echo "VERSION=$VERSION" >> build.env
      echo "VERSION_CODE=$NEW_VERSION_CODE" >> build.env
  artifacts:
    reports:
      dotenv: build.env
```

**assemble-apk:**
```yaml
assemble-apk:
  stage: build
  image: reactnativecommunity/react-native-android:latest
  needs: [sync-versions, install-deps, build-webapp]
  before_script:
    - echo "$KEYSTORE_BASE64" | base64 -d > android/app/bittasker-release-key.jks
    - |
      cat > android/keystore.properties << EOF
      storeFile=bittasker-release-key.jks
      storePassword=$KEYSTORE_PASSWORD
      keyAlias=bittasker-release
      keyPassword=$KEY_PASSWORD
      EOF
    - echo "sdk.dir=$ANDROID_HOME" > android/local.properties
  script:
    - npm run build
    - npx cap sync android
    - cd android && ./gradlew assembleRelease
  after_script:
    - rm -f android/app/bittasker-release-key.jks android/keystore.properties android/local.properties
  artifacts:
    paths:
      - android/app/build/outputs/apk/release/app-universal-release.apk
```

### Stage 3: Changelog

```yaml
generate-changelog:
  stage: changelog
  image: orhunp/git-cliff:latest
  variables:
    GIT_STRATEGY: clone
    GIT_DEPTH: 0
  needs: [assemble-apk]
  script:
    - VERSION="${CI_COMMIT_TAG#v}"
    - git-cliff --latest --strip all -o release-notes.md
    - git-cliff --unreleased --tag "v${VERSION}" --prepend CHANGELOG.md
  artifacts:
    paths:
      - release-notes.md
      - CHANGELOG.md
```

### Stage 4: GitLab Release (`retry: 0`)

```yaml
create-gitlab-release:
  stage: gitlab-release
  retry: 0
  image: registry.gitlab.com/gitlab-org/cli:latest
  needs: [generate-changelog]
  script:
    - |
      VERSION="${CI_COMMIT_TAG#v}"
      glab release create "${CI_COMMIT_TAG}" \
        --repo bittasker/zapstore \
        --name "BitTasker v${VERSION}" \
        --notes-file release-notes.md \
        --assets-link "android/app/build/outputs/apk/release/app-universal-release.apk
          --name "bittasker-v${VERSION}-universal.apk"
```

### Stage 5: Zapstore Publish (`retry: 0`, manual gate)

```yaml
publish-zapstore:
  stage: publish-zapstore
  retry: 0
  when: manual
  image: reactnativecommunity/react-native-android:latest
  needs: [create-gitlab-release]
  variables:
    SIGN_WITH: "$BUNKER_URL"
  script:
    - |
      VERSION="${CI_COMMIT_TAG#v}"
      # Copy APK to zapstore repo
      cp android/app/build/outputs/apk/release/app-universal-release.apk \
         ../zapstore/dist/release/bittasker-v${VERSION}-universal.apk
      # Publish to Zapstore via bunker
      cd ../zapstore
      zsp publish --quiet zapstore.yaml
```

### Stage 6: Rollback (manual, never auto)

```yaml
rollback:
  stage: rollback
  when: manual
  allow_failure: true
  script:
    - |
      PREVIOUS_TAG=$(git tag --sort=-v:refname | grep -v "$CI_COMMIT_TAG" | head -1)
      echo "Rolling back to $PREVIOUS_TAG"
      git checkout "$PREVIOUS_TAG"
      cd ../zapstore
      zsp publish --quiet --overwrite-release zapstore.yaml
```

---

## Files to Create

### 1. `.gitlab/ci/release-zapstore.yml` — Child pipeline (NEW)

Full child pipeline definition as described in "Pipeline Stages" above. ~200 lines.

### 2. `cliff.toml` — git-cliff configuration (NEW)

```toml
[changelog]
header = """# Changelog\n
All notable changes to BitTasker are documented in this file.\n
---
"""
body = """
{% for group, commits in commits | group_by(attribute="group") %}
### {{ group | upper_first }}
{% for commit in commits %}
- {{ commit.message | upper_first }}
{%- endfor %}
{% endfor %}
"""
trim = true
footer = """
---
"""
[git]
conventional_commits = true
filter_unconventional = false
split_commits = false
protect_breaking_commits = true
commit_parsers = [
    { message = "^feat", group = "<!-- 0 -->Features" },
    { message = "^fix", group = "<!-- 1 -->Bug Fixes" },
    { message = "^doc", group = "<!-- 2 -->Documentation" },
    { message = "^perf", group = "<!-- 3 -->Performance" },
    { message = "^refactor", group = "<!-- 4 -->Refactor" },
    { message = "^style", group = "<!-- 5 -->Styling" },
    { message = "^test", group = "<!-- 6 -->Testing" },
    { message = "^chore|^ci", group = "<!-- 7 -->Maintenance" },
    { message = ".*", group = "<!-- 8 -->Other" },
]
filter_commits = false
tag_pattern = "v[0-9].*"
topo_order = false
sort_commits = "oldest"
```

### 3. `CHANGELOG.md` — Initial changelog (NEW, bootstrapped)

Bootstrap by copying the zapstore repo's `CHANGELOG.md` and tagging the current HEAD:
```bash
cp ../zapstore/CHANGELOG.md ./CHANGELOG.md
git tag v1.1.6 <current-head-commit>
git push origin v1.1.6
```

### 4. `/etc/systemd/system/nak-bunker.service` — Bunker service (on API server, NEW)

See "Bunker URL — Self-Hosted Setup" section above for the full unit file.

---

## Files to Modify

### 1. `.gitlab-ci.yml` — Add trigger-zapstore-release job

Add to the `deploy-android` stage (alongside the existing Play Store release job):

```yaml
# ============================================
# ZAPSTORE RELEASE — Tag-triggered, manual gate
# ============================================
trigger-zapstore-release:
  stage: deploy-android
  tags:
    - self-hosted
  variables:
    VERSION: $CI_COMMIT_TAG
  trigger:
    include:
      - local: .gitlab/ci/release-zapstore.yml
    strategy: depend
  environment:
    name: production
    deployment_tier: production
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
      when: manual
      allow_failure: true
```

### 2. `scripts/publish-to-zapstore.sh` — Modernize for CI

- Accept `--ci` flag for non-interactive mode
- Accept `SIGN_WITH` env var instead of `NOSTR_NSEC`
- Accept `--version <X.Y.Z>` flag to skip version calculation (version comes from tag in CI)
- Keep local development workflow intact (for manual runs without CI)

### 3. `package.json` — Sync version + add scripts

```json
{
  "version": "1.1.6",
  "scripts": {
    "release:zapstore": "bash scripts/publish-to-zapstore.sh",
    "release:changelog": "git cliff --latest --strip all",
    "release:check": "zsp publish --check zapstore.yaml"
  }
}
```

### 4. `../zapstore/dist/glab.sh` — Deprecate

After the pipeline is live, this script is no longer needed — the CI pipeline creates GitLab releases automatically via `glab release create`. Keep as fallback for manual releases.

---

## GitLab CI Variables to Configure

Go to **Settings → CI/CD → Variables** and add:

| Key | Type | Value | Protected | Masked |
|---|---|---|---|---|
| `BUNKER_URL` | Variable | `bunker://<pubkey>?relay=wss://relay1.bittasker.com&secret=<token>` | Yes | Yes |
| `KEYSTORE_BASE64` | Variable | `base64 -w0 < android/app/bittasker-release-key.jks` | Yes | Yes |
| `KEYSTORE_PASSWORD` | Variable | From `keystore.properties` → `storePassword` | Yes | Yes |
| `KEY_ALIAS` | Variable | `bittasker-release` | Yes | No |
| `KEY_PASSWORD` | Variable | From `keystore.properties` → `keyPassword` | Yes | Yes |

These are the same keystore variables already configured for the Play Store pipeline — just with the Zapstore keystore values instead of the Play upload keystore.

---

## How the Pipeline is Triggered

The trigger model aligns with the existing Play Store pipeline (tag-based):

```
Developer workflow:
  1. Decide the version bump (patch/minor/major)
  2. Tag locally:    git tag v1.2.0
  3. Push the tag:    git push origin v1.2.0
  4. Open GitLab → Pipelines → click "play" on trigger-zapstore-release
  5. Review the auto-generated changelog in the release notes
  6. Click "play" on publish-zapstore to push to Zapstore
```

The tag IS the version. No `BUMP_TYPE` variable, no version calculation in CI. The version is explicit, reviewed, and part of git history before the pipeline even starts. This matches how the Play Store pipeline works.

---

## Commit Convention

Adopt [Conventional Commits](https://www.conventionalcommits.org/) going forward:

```
feat: add video upload support
fix: resolve date picker timezone offset  
chore: upgrade NDK to v3.1.0
refactor: extract contract signing logic
test: add e2e coverage for review flow
```

The project already uses this format for ~67% of commits. git-cliff handles both conventional and non-conventional commits (non-conventional ones fall into an "Other" group). Optional enforcement via `commitlint` + husky can be added later.

---

## First-Time Bootstrap

Before the pipeline works the first time:

1. **Create initial git tag:**
   ```bash
   git tag v1.1.6 <current-head-commit>
   git push origin v1.1.6
   ```

2. **Bootstrap CHANGELOG.md:**
   ```bash
   cp ../zapstore/CHANGELOG.md ./CHANGELOG.md
   ```

3. **Sync `package.json` version:**
   ```bash
   # Update to match build.gradle: "version": "1.1.6"
   ```

4. **Deploy `nak bunker` on the API server** (see "Bunker URL — Self-Hosted Setup" above).

5. **Configure GitLab CI variables** (see table above).

6. **Test with a pre-release tag first:**
   ```bash
   git tag v1.1.7-beta
   git push origin v1.1.7-beta
   ```

7. **First real release:**
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

---

## Security Considerations

| Risk | Mitigation |
|---|---|
| nsec in CI | Self-hosted `nak bunker` on API server — nsec never touches CI |
| Bunker URL leaked from CI | Single-use secret consumed on first successful run; revocable |
| Bunker URL stolen before CI runs | Revoke the secret on the bunker, generate a new one — identity unaffected |
| Keystore in CI | GitLab masked variable + `after_script` cleanup on runner |
| Keystore on disk at rest (bunker) | Use `ncryptsec1...` (NIP-49 encrypted) key format; file permissions 0600 |
| Accidental double-publish | Pre-flight `check-already-released` + idempotent tag check |
| CI job logs leaking secrets | All sensitive vars marked **Masked** in GitLab |
| Runner compromise | Self-hosted runner on trusted infrastructure; bunker limits blast radius to temporary token |
| Relay attack surface | Relay only sees NIP-44 encrypted blobs; cannot read signing requests |

### nsec vs bunker URL — security comparison

```
nsec in CI:
  Attacker steals nsec → permanent identity loss → must regenerate everything

bunker URL in CI:
  Attacker steals URL → gets one-time connection token → you revoke it → done
  (After CI runs once, the secret is consumed and the URL is worthless)
```

---

## Error Handling Summary

| Scenario | Behavior |
|---|---|
| Bad tag format (not vX.Y.Z) | Preflight fails immediately, no build wasted |
| Tag not on master | Guard rejects: `git merge-base --is-ancestor origin/master` |
| Keystore password wrong | Preflight fails immediately |
| Tag already exists | Pipeline exits 0 (success, nothing to do) |
| npm ci network failure | Retry up to 2x on `script_failure` |
| Gradle OOM | `GRADLE_OPTS` sets `-Xmx2048m`; retry 1x on `runner_system_failure` |
| Bunker unreachable | Zapstore publish fails with clear error; retry job from UI once bunker is back |
| GitLab release creation fails | APK artifacts still available; retry job from UI |
| Zapstore publish fails | Tag + release already created; re-run publish job |
| Accidental re-run | All destructive jobs are idempotent (check-before-create) |

---

## Patterns Reused from Play Store Pipeline

| Pattern | Play Pipeline | Zapstore Adoption |
|---|---|---|
| **Tag-based triggering** | `$CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/` | Same — version from tag |
| **Tag-on-master guard** | `git merge-base --is-ancestor` | Same |
| **Docker image** | `reactnativecommunity/react-native-android:latest` | Same image reused |
| **Keystore as base64** | `KEYSTORE_BASE64` CI variable, decode in `before_script` | Same pattern |
| **`after_script` cleanup** | Delete secrets from runner filesystem | Same |
| **`[skip ci]` commits** | Prevent recursive pipeline triggers | Same |
| **Manual production gate** | `when: manual` | Two gates: GitLab release + Zapstore publish |
| **Semver tag format** | `vX.Y.Z` (no suffix) for production | Same |

---

## Implementation Order

1. **Bootstrap** — git tags, CHANGELOG.md, package.json sync
2. **Deploy bunker** — install `nak` on API server, create systemd service, generate bunker URL
3. **CI variables** — configure all GitLab CI/CD variables including `BUNKER_URL`
4. **Configuration files** — create `cliff.toml`
5. **Child pipeline** — create `.gitlab/ci/release-zapstore.yml`
6. **Parent pipeline** — add `trigger-zapstore-release` job to `.gitlab-ci.yml`
7. **Test** — push a beta tag, verify full pipeline works end-to-end
8. **Go live** — first production release via `git tag v1.2.0 && git push origin v1.2.0`
