# Zapstore Release Pipeline — Implementation Plan

## Executive Summary

Fully automate the BitTasker → Zapstore release process via a GitLab CI child pipeline. The pipeline is triggered manually from the GitLab UI with a version bump choice (patch/minor/major), builds a signed APK, auto-generates release notes from conventional commits via git-cliff, creates a GitLab Release, and publishes to Zapstore using NIP-46 bunker URL remote signing (no nsec in CI).

---

## Current State Assessment

### What exists

| Asset                            | Location                                | State                                                                                                                       |
| -------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `scripts/publish-to-zapstore.sh` | Main repo                               | Builds APK, bumps version in `build.gradle`. GitLab release + Zapstore publish steps (lines 241–361) are **commented out**. |
| `.gitlab-ci.yml`                 | Main repo                               | Cloudflare Workers only (validate + deploy stages). No Android/release stage.                                               |
| `zapstore/` repo                 | `../zapstore`                           | Contains `zapstore.yaml`, `CHANGELOG.md`, `dist/glab.sh` (hardcoded version), and assets.                                   |
| `zsp` CLI                        | `/Users/doma/go/bin/zsp`                | v0.4.6. Supports bunker URLs, `--quiet`, `--json`, `--offline`.                                                             |
| Keystore                         | `android/app/bittasker-release-key.jks` | Release signing key (gitignored).                                                                                           |
| `keystore.properties`            | `android/keystore.properties`           | Contains store password and key alias (gitignored).                                                                         |

### What's missing

| Gap                                  | Impact                                                          |
| ------------------------------------ | --------------------------------------------------------------- |
| No git tags exist                    | No way to diff releases for changelogs                          |
| `package.json` version = `0.0.1`     | Disconnected from real version (`1.1.6` in `build.gradle`)      |
| No `CHANGELOG.md` in main repo       | Release history only in zapstore repo                           |
| No conventional commit enforcement   | ~67% of commits use conventional format; rest are unstructured  |
| `.env` file in zapstore repo         | **Plaintext `NOSTR_NSEC` and `GITLAB_TOKEN`** — must be removed |
| No Docker image with Android SDK     | Self-hosted runner needs JDK 21 + Node.js 22 + Android SDK 36   |
| Zapstore publish steps commented out | Script stops after APK build                                    |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ TRIGGER: GitLab UI → Pipelines → Run pipeline                │
│ User selects branch (master) + variable BUMP_TYPE            │
│ BUMP_TYPE ∈ {patch, minor, major}                           │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ PARENT PIPELINE (.gitlab-ci.yml)                             │
│ Stage: release (manual)                                      │
│ trigger-release job → triggers child pipeline                │
│   strategy: depend                                           │
│   include: .gitlab/ci/release.yml                            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ CHILD PIPELINE (.gitlab/ci/release.yml)                      │
│                                                              │
│  Stage 1: preflight                                          │
│  ├─ validate-bump-type    — fail fast on bad BUMP_TYPE       │
│  ├─ validate-keystore     — verify JKS password              │
│  └─ check-already-released — skip if tag exists (idempotent) │
│                                                              │
│  Stage 2: build                                              │
│  ├─ install-deps           — npm ci                          │
│  ├─ bump-version           — update build.gradle + pkg.json  │
│  ├─ build-webapp           — npm run build                   │
│  ├─ sync-capacitor         — npx cap sync                    │
│  └─ assemble-apk           — ./gradlew assembleRelease       │
│                                                              │
│  Stage 3: changelog                                          │
│  └─ generate-changelog — git-cliff → release-notes.md        │
│                                                              │
│  Stage 4: tag (destructive — no retry)                       │
│  └─ create-tag — git tag + git push                          │
│                                                              │
│  Stage 5: gitlab-release (destructive — no retry)             │
│  └─ create-release — GitLab Release API + APK asset link     │
│                                                              │
│  Stage 6: publish-zapstore (destructive — no retry)          │
│  └─ publish — SIGN_WITH=$BUNKER_URL zsp publish --quiet      │
│                                                              │
│  Stage 7: rollback (manual only, never automatic)            │
│  └─ rollback-to-previous — re-publish previous APK           │
└─────────────────────────────────────────────────────────────┘
```

---

## Pipeline Stages — Detailed Design

### Stage 1: Preflight (`retry: 0`)

Fast-fail before spending ~10 minutes on a build.

**validate-bump-type:**

```yaml
validate-bump-type:
  stage: preflight
  image: alpine:latest
  script:
    - |
      case "$BUMP_TYPE" in
        patch|minor|major)
          echo "Valid bump type: $BUMP_TYPE" ;;
        [0-9]*.[0-9]*.[0-9]*)
          echo "Explicit version: $BUMP_TYPE" ;;
        *)
          echo "ERROR: BUMP_TYPE must be patch, minor, major, or X.Y.Z"
          exit 1 ;;
      esac
```

**validate-keystore:**

```yaml
validate-keystore:
  stage: preflight
  script:
    - echo "$KEYSTORE_BASE64" | base64 -d > android/app/bittasker-release-key.jks
    - keytool -list -keystore android/app/bittasker-release-key.jks
      -storepass "$KEYSTORE_PASSWORD" -alias bittasker-release
      && echo "Keystore valid"
```

**check-already-released (idempotency guard):**

```yaml
check-already-released:
  stage: preflight
  script:
    - |
      NEW_VERSION=$(calculate_new_version "$BUMP_TYPE")
      if git ls-remote --tags origin | grep -q "refs/tags/v${NEW_VERSION}$"; then
        echo "Tag v${NEW_VERSION} already exists. Nothing to do."
        exit 0  # success — skip the rest of the pipeline
      fi
```

### Stage 2: Build

**bump-version** — updates both `build.gradle` AND `package.json` atomically:

```bash
# Read current version from build.gradle
CURRENT_VERSION=$(perl -ne 'print $1 if /versionName\s+"([^"]+)"/' android/app/build.gradle)
CURRENT_VERSION_CODE=$(perl -ne 'print $1 if /versionCode\s+(\d+)/' android/app/build.gradle)

# Calculate new version
case $BUMP_TYPE in
  patch) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{print $1"."$2"."$3+1}') ;;
  minor) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{print $1"."$2+1".0"}') ;;
  major) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{print $1+1".0.0"}') ;;
  *)     NEW_VERSION="$BUMP_TYPE" ;;  # explicit version
esac
NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))

# Update build.gradle
sed -i "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" android/app/build.gradle
sed -i "s/versionName \".*\"/versionName \"$NEW_VERSION_NAME\"/" android/app/build.gradle

# Update package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json

# Export for downstream jobs
echo "NEW_VERSION=$NEW_VERSION" >> build.env
echo "NEW_VERSION_CODE=$NEW_VERSION_CODE" >> build.env
```

**assemble-apk** — needs Android SDK Docker image:

```yaml
assemble-apk:
  stage: build
  image: registry.gitlab.com/bittasker/bitasker/android-builder:latest
  needs: [bump-version, install-deps, build-webapp]
  before_script:
    # Restore keystore from CI variable
    - echo "$KEYSTORE_BASE64" | base64 -d > android/app/bittasker-release-key.jks
    # Generate keystore.properties
    - |
      cat > android/keystore.properties << EOF
      storeFile=bittasker-release-key.jks
      storePassword=$KEYSTORE_PASSWORD
      keyAlias=bittasker-release
      keyPassword=$KEY_PASSWORD
      EOF
  script:
    - cd android && ./gradlew assembleRelease
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
    # Generate release notes for this version only
    - git-cliff --latest --strip all -o release-notes.md
    # Prepend to CHANGELOG.md
    - git-cliff --unreleased --tag "v${NEW_VERSION}" --prepend CHANGELOG.md
  artifacts:
    paths:
      - release-notes.md
      - CHANGELOG.md
```

### Stage 4: Tag (`retry: 0`)

Tag is created BEFORE publish — if it fails, nothing reaches Zapstore.

```yaml
create-tag:
  stage: tag
  retry: 0
  needs: [generate-changelog]
  script:
    - |
      if git ls-remote --tags origin | grep -q "refs/tags/v${NEW_VERSION}$"; then
        echo "Tag already exists. Skipping."
      else
        git config user.email "ci@bittasker.com"
        git config user.name "GitLab CI"
        git add android/app/build.gradle package.json CHANGELOG.md
        git commit -m "chore: bump version to v${NEW_VERSION} [skip ci]"
        git tag "v${NEW_VERSION}"
        git push origin HEAD:$CI_COMMIT_BRANCH
        git push origin "v${NEW_VERSION}"
      fi
```

### Stage 5: GitLab Release (`retry: 0`)

```yaml
create-gitlab-release:
  stage: gitlab-release
  retry: 0
  image: registry.gitlab.com/gitlab-org/cli:latest
  needs: [create-tag]
  script:
    - |
      glab release create "v${NEW_VERSION}" \
        --repo bittasker/zapstore \
        --name "BitTasker v${NEW_VERSION}" \
        --notes-file release-notes.md \
        --assets-link "android/app/build/outputs/apk/release/app-universal-release.apk
          --name "bittasker-v${NEW_VERSION}-universal.apk"
```

### Stage 6: Zapstore Publish (`retry: 0`)

```yaml
publish-zapstore:
  stage: publish-zapstore
  retry: 0
  image: registry.gitlab.com/bittasker/bitasker/zsp-runner:latest
  needs: [create-gitlab-release]
  variables:
    SIGN_WITH: '$BUNKER_URL'
  script:
    - |
      # Copy APK to zapstore repo
      cp android/app/build/outputs/apk/release/app-universal-release.apk \
         ../zapstore/dist/release/bittasker-v${NEW_VERSION}-universal.apk
      # Publish
      cd ../zapstore
      zsp publish --quiet zapstore.yaml
```

### Stage 7: Rollback (manual, never auto)

```yaml
rollback:
  stage: rollback
  when: manual
  allow_failure: true
  script:
    - |
      # Fetch previous release tag
      PREVIOUS_TAG=$(git tag --sort=-v:refname | head -2 | tail -1)
      echo "Rolling back to $PREVIOUS_TAG"
      git checkout "$PREVIOUS_TAG"
      cd ../zapstore
      zsp publish --quiet --overwrite-release zapstore.yaml
```

---

## Files to Create

### 1. `.gitlab/ci/release.yml` — Child pipeline (NEW)

Full child pipeline definition as described above. ~200 lines.

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

Bootstrap by copying the zapstore repo's `CHANGELOG.md` and running:

```bash
git tag v1.1.6 <current-head-commit>
```

This gives git-cliff a baseline for future diffs.

### 4. `Dockerfile.android` — Android CI builder image (NEW)

```dockerfile
FROM eclipse-temurin:21-jdk

# Node.js 22 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Android SDK cmdline-tools
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
RUN mkdir -p $ANDROID_HOME \
    && cd $ANDROID_HOME \
    && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
       -o cmdline-tools.zip \
    && unzip -q cmdline-tools.zip -d cmdline-tools \
    && yes | cmdline-tools/cmdline-tools/bin/sdkmanager --sdk_root=$ANDROID_HOME \
       "platforms;android-36" "build-tools;36.0.0" "platform-tools"

ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/cmdline-tools/bin:$ANDROID_HOME/platform-tools
```

Build and push: `docker build -f Dockerfile.android -t registry.gitlab.com/bittasker/bitasker/android-builder:latest . && docker push ...`

### 5. `Dockerfile.zsp` — zsp runner image (NEW)

```dockerfile
FROM golang:1.22-alpine
RUN go install github.com/zapstore/zsp@latest
ENTRYPOINT ["/go/bin/zsp"]
```

---

## Files to Modify

### 1. `.gitlab-ci.yml` — Add trigger-release job

Add at the end of the `deploy` stage:

```yaml
# ============================================
# RELEASE — Manual trigger for Zapstore release
# ============================================
trigger-release:
  stage: deploy
  tags:
    - self-hosted
  variables:
    BUMP_TYPE: 'minor'
  trigger:
    include:
      - local: .gitlab/ci/release.yml
    strategy: depend
  environment:
    name: production
    deployment_tier: production
  rules:
    - if: $CI_COMMIT_BRANCH == "master"
      when: manual
      allow_failure: true
```

### 2. `scripts/publish-to-zapstore.sh` — Modernize

- Add `--ci` flag for non-interactive mode (sets `--quiet` on zsp, skips prompts)
- Uncomment and fix steps 8–9 (lines 241–361)
- Accept `SIGN_WITH` env var instead of `NOSTR_NSEC`
- Add `--skip-tag` flag (CI handles tagging separately)

### 3. `package.json` — Sync version + add scripts

```json
{
	"version": "1.1.6",
	"scripts": {
		"release:zapstore": "bash scripts/publish-to-zapstore.sh",
		"release:changelog": "git-cliff --latest --strip all",
		"release:check": "zsp publish --check zapstore.yaml"
	}
}
```

### 4. `android/app/build.gradle` — Add env var fallback for keystore

Add environment variable fallback so CI doesn't need a file write:

```groovy
// After existing keystoreProperties loading...
signingConfigs {
    release {
        storeFile file(
            System.getenv("STORE_FILE") ?: keystoreProperties['storeFile']
        )
        storePassword System.getenv("STORE_PASSWORD") ?: keystoreProperties['storePassword']
        keyAlias System.getenv("KEY_ALIAS") ?: keystoreProperties['keyAlias']
        keyPassword System.getenv("KEY_PASSWORD") ?: keystoreProperties['keyPassword']
    }
}
```

### 5. Zapstore repo `.env` — **DELETE or gitignore + rotate keys**

**The `.env` file at `../zapstore/.env` contains plaintext `NOSTR_NSEC` and `GITLAB_TOKEN`.** This is a security risk. Steps:

1. Ensure `.env` is in `.gitignore` (check if it's already committed — if so, rotate the keys)
2. Rotate the GitLab token
3. Move nsec to a bunker (nsec.app or self-hosted nsecbunker)
4. Delete `.env` from the zapstore repo

---

## GitLab CI Variables to Configure

Go to **Settings → CI/CD → Variables** and add:

| Key                 | Type     | Value                                            | Protected | Masked |
| ------------------- | -------- | ------------------------------------------------ | --------- | ------ |
| `BUNKER_URL`        | Variable | `bunker://pubkey?relay=wss://relay&secret=...`   | Yes       | Yes    |
| `KEYSTORE_BASE64`   | Variable | `base64 < android/app/bittasker-release-key.jks` | Yes       | Yes    |
| `KEYSTORE_PASSWORD` | Variable | From `keystore.properties` → `storePassword`     | Yes       | Yes    |
| `KEY_ALIAS`         | Variable | `bittasker-release`                              | Yes       | No     |
| `KEY_PASSWORD`      | Variable | From `keystore.properties` → `keyPassword`       | Yes       | Yes    |
| `GITLAB_TOKEN`      | Variable | GitLab PAT with `api`, `write_repository` scopes | Yes       | Yes    |

**How to base64-encode the keystore:**

```bash
base64 -w0 < android/app/bittasker-release-key.jks
# Copy the output into the KEYSTORE_BASE64 variable
```

---

## Bunker URL Setup

### Option A: nsec.app (recommended — easiest)

1. Go to https://nsec.app
2. Import your Nostr nsec (the one currently in `../zapstore/.env`)
3. Navigate to "Remote Signing" / "Bunker"
4. Generate a new connection token — you'll get a `bunker://` URL
5. Store this URL in GitLab CI Variable `BUNKER_URL`

**Important:** nsec.app must be reachable when CI runs. Test connectivity from your self-hosted runner first.

### Option B: Self-hosted nsecbunker

1. Deploy [nsecbunker](https://github.com/nostrband/nsecbunker) on a server you control
2. Import your nsec into the bunker
3. Generate a connection token → `bunker://` URL
4. Store in GitLab CI Variable `BUNKER_URL`

### Option C: Offline mode (zero-trust, manual step)

CI runs zsp with `--offline` and `SIGN_WITH=npub1...`, which outputs unsigned events. You sign them later with `nak`:

```bash
# In CI (no key needed):
zsp publish --offline --quiet zapstore.yaml > unsigned-events.json

# On your machine:
nak event --sec nsec1... < unsigned-events.json | nak event wss://relay.zapstore.dev
```

This is the most secure option — CI never has access to signing capability. Trade-off: extra manual step per release.

---

## Version Bump Selection — UX Options

### Option A: Single job with variable (simpler)

Developer clicks **Run pipeline** → adds variable `BUMP_TYPE=minor` → clicks Run.

### Option B: `parallel:matrix` — three buttons (recommended)

```yaml
trigger-release:
  stage: deploy
  parallel:
    matrix:
      - BUMP_TYPE: ['patch', 'minor', 'major']
  trigger:
    include:
      - local: .gitlab/ci/release.yml
    strategy: depend
  rules:
    - if: $CI_COMMIT_BRANCH == "master"
      when: manual
      allow_failure: true
```

This shows **three separate play buttons** in the pipeline UI labeled:

- `trigger-release: [patch]`
- `trigger-release: [minor]`
- `trigger-release: [major]`

The developer clicks the one they want. No typing required.

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

Optional enforcement: `commitlint` + husky `commit-msg` hook (future follow-up).

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
   # Manually or via: npm version 1.1.6 --no-git-tag-version
   ```

4. **Build and push Docker images:**

   ```bash
   docker build -f Dockerfile.android -t registry.gitlab.com/bittasker/android-builder:latest .
   docker push registry.gitlab.com/bittasker/android-builder:latest
   ```

5. **Configure GitLab CI variables** (see table above).

6. **Set up bunker URL** (see section above).

7. **Rotate exposed credentials:**
   - Revoke the GitLab token in `../zapstore/.env`
   - Move nsec to bunker (nsec.app)
   - Delete `.env` or add to `.gitignore`

---

## Security Considerations

| Risk                        | Mitigation                                                      |
| --------------------------- | --------------------------------------------------------------- |
| nsec in CI                  | Bunker URL remote signing — nsec never touches CI               |
| Keystore in CI              | GitLab masked variable + file never committed                   |
| Plaintext `.env`            | Rotate keys, move to bunker, delete `.env`                      |
| Accidental double-publish   | Pre-flight `check-already-released` + idempotent tag creation   |
| CI job logs leaking secrets | All sensitive vars marked **Masked** in GitLab                  |
| Runner compromise           | Self-hosted runner on trusted infra; bunker limits blast radius |

---

## Error Handling Summary

| Scenario                             | Behavior                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| Bad `BUMP_TYPE` value                | Preflight fails immediately, no build wasted                        |
| Keystore password wrong              | Preflight fails immediately                                         |
| Tag already exists                   | Pipeline exits 0 (success, nothing to do)                           |
| npm ci network failure               | Retry up to 2x on `script_failure`                                  |
| Gradle OOM                           | `GRADLE_OPTS` sets `-Xmx2048m`; retry 1x on `runner_system_failure` |
| Tag push fails                       | Pipeline stops — Zapstore publish never runs                        |
| GitLab release creation fails        | APK artifacts still available; retry job from UI                    |
| Zapstore publish succeeds, tag fails | Tag created first in earlier stage                                  |
| Zapstore publish fails               | Tag + release already created; re-run publish job                   |
| Accidental re-run                    | All destructive jobs are idempotent (check-before-create)           |

---

## Testing Strategy

1. **Test the child pipeline in isolation:**

   ```bash
   glab ci run --branch master .gitlab/ci/release.yml
   ```

2. **Dry-run Zapstore publish:**

   ```bash
   zsp publish --check zapstore.yaml
   ```

3. **Verify git-cliff output locally:**

   ```bash
   git cliff --latest --strip all
   ```

4. **Test Docker image locally:**

   ```bash
   docker run --rm registry.gitlab.com/bittasker/android-builder:latest \
     bash -c "java -version && node -version && sdkmanager --list"
   ```

5. **First real run:** Do a `patch` bump from a feature branch first (temporarily change the `rules:` to allow it). Verify the full pipeline. Then switch to `master`-only for production.

---

## Implementation Order

1. **Bootstrap** — git tags, CHANGELOG.md, package.json sync, secret rotation
2. **Docker images** — build + push `android-builder` and `zsp-runner` images
3. **CI variables** — configure all GitLab CI/CD variables
4. **Configuration files** — create `cliff.toml`, modify `build.gradle`, modify `package.json`
5. **Child pipeline** — create `.gitlab/ci/release.yml`
6. **Parent pipeline** — add `trigger-release` job to `.gitlab-ci.yml`
7. **Test** — dry runs, patch bump test from feature branch
8. **Go live** — enable on master branch
