# Google Play Store Release Pipeline — Implementation Plan

## Executive Summary

BitTasker currently publishes Android updates to Google Play **manually**. This plan automates the full pipeline — web build → Capacitor sync → Android AAB build → Play Store upload — using **fastlane** on the existing GitLab CI infrastructure.

### Why fastlane

| Factor          | fastlane                                        | Gradle Play Publisher                             |
| --------------- | ----------------------------------------------- | ------------------------------------------------- |
| Maintenance     | Actively maintained by Google + community       | Maintenance mode ("issues ignored, PRs accepted") |
| CI footprint    | Adds Ruby (~1 line in before_script)            | No new runtime                                    |
| iOS support     | Built-in (future-proof)                         | Android only                                      |
| Community       | 40K+ stars, extensive docs, Slack/StackOverflow | 850 stars, single maintainer                      |
| Track promotion | Via re-upload or API script                     | Built-in `promoteArtifact` task                   |

fastlane adds Ruby to the CI runner — a trivial `apt-get install ruby-full` on the self-hosted runner — in exchange for a battle-tested toolchain that handles metadata, staged rollouts, release notes, and future iOS publishing. Gradle Play Publisher is a viable lighter-weight alternative (see Appendix), but its maintenance-mode status makes it a riskier choice for a production pipeline.

---

## Current State

### What exists today

| Asset                   | Location                                              | Status                                        |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------- |
| GitLab CI pipeline      | `.gitlab-ci.yml`                                      | Web-only (Cloudflare Workers deploy)          |
| Android build chain     | `npm run android:bundleRelease`                       | Manual, local only                            |
| Zapstore publish script | `scripts/publish-to-zapstore.sh`                      | Partially commented out                       |
| Google Play listing     | Google Play Console                                   | Published, manual updates                     |
| Upload keystore         | `android/upload-keystore.jks`                         | On disk, not in git                           |
| Upload key credentials  | `android/keystore.properties` (commented-out section) | Plaintext on local disk                       |
| versionCode             | `android/app/build.gradle:17`                         | 15 (current in Play Store)                   |
| versionName             | `android/app/build.gradle:18`                         | "1.1.7" (current in Play Store)              |
| Self-hosted runner      | GitLab tags: `self-hosted`                            | Docker executor, runs `node:22-bookworm-slim` |

### Security issues to fix

1. **Plaintext keystore passwords** in `android/keystore.properties` — move to GitLab CI Variables
2. **`.jks` files in git history** — both `upload-keystore.jks` and `bittasker-release-key.jks` were committed before `.gitignore` rules were added; should be purged from history
3. **`google-services.json` tracked in git** — acceptable (Firebase API keys are bundle-ID-restricted), but worth noting

---

## Architecture Decision

### Pipeline trigger design

**Every release — internal testing, closed testing, and production — is triggered by a git tag on `master`.** Nothing runs on branch pushes or merge requests. Tags give you full control: you decide when to build, what to call it, and which track it goes to.

| Trigger                                     | Track               | Gate      | Notes                                                    |
| ------------------------------------------- | --------------------| --------- | -------------------------------------------------------- |
| Git tag `v*alpha*` or `v*beta*` on `master` | Internal testing    | Auto      | Fast, no review. Push a pre-release tag when ready for internal testing |
| Git tag `v*rc*` on `master`                 | Closed testing      | Auto      | Release candidate for broader tester group               |
| Git tag `vX.Y.Z` (no suffix) on `master`    | Production          | Manual    | **The only production trigger.** Tag must be on `master` (enforced in CI) |

**What does NOT trigger a release:**
- Push to `dev` branch (dev gets too many commits — building AABs on every push is wasteful)
- Push to `master` without a tag
- Merge requests (any branch)
- Tags not on `master` (pipeline fails with an explicit error)

**Why tags, not branch pushes?** Tags are immutable and explicit. Pushing a tag says "I intend to release this exact commit." Branch-triggered releases couple deployment to commit frequency — you'd release on every push or have to maintain complex rules about which commits trigger deployment. Tags give you a clean, auditable release history: `git tag --sort=-creatordate` shows every release ever made.

**Why internal testing on master too?** `dev` is the integration branch — it gets merged into tens of times per day. Running a 10–20 minute AAB build on every push to `dev` would be noisy and wasteful. Instead, internal testing uses pre-release tags (`v*-alpha*`, `v*-beta*`) on `master`, just like production. When you're ready for internal testing, you merge dev to master and tag. This keeps the pipeline intentional rather than automated noise.

### Google Play testing tracks

| Track               | Review delay    | Max testers | User-visible?    | Purpose                                          |
| ------------------- | --------------- | ------------| -----------------| ------------------------------------------------ |
| **Internal testing** | None (instant) | 100         | No               | CI builds, daily dev testing, core team dogfooding |
| **Closed testing**   | Hours          | 100K+       | No               | Pre-release validation with trusted external testers |
| **Open testing**     | Hours          | Unlimited   | Yes (Play Store) | Soft launch, large-scale beta                    |
| **Production**       | Hours–days     | Unlimited   | Yes (Play Store) | Public release                                   |

BitTasker uses **Internal Testing** for pre-release CI builds and **Production** for public releases. Closed and Open testing can be added later if needed.

### VersionCode vs VersionName

Google Play uses **two** version fields — it's critical to understand the difference:

| Field          | Type    | Users see it?       | Must increase? | Example      | Source of truth     |
|---------------|---------|----------------------|----------------|-------------|---------------------|
| **versionCode** | Integer | **Never** — Google Play internal only. Used to determine which build is "newer." | Yes — each upload must be strictly higher than the last | `16` | `android/app/build.gradle` (auto-incremented by fastlane, committed back) |
| **versionName** | String  | **Yes** — displayed on Play Store listing, in-app About screen, Settings → Apps | No — purely cosmetic | `"1.1.8"` | Git tag (e.g., `v1.1.8` → `"1.1.8"`) |

Users see `versionName "1.1.8"` on the Play Store. They never see `versionCode 16`. Google Play uses `versionCode` only to determine update eligibility — a device with `versionCode 15` will receive an update to `versionCode 16` regardless of what `versionName` says.

### Version management

**You tag the version you WANT to release — the tag IS the version.**

Example: the app currently has `"1.1.7"` on the Play Store. You want to release a patch bump.
- **Tag `v1.1.8`** (the NEW version, not the current one)
- Push the tag → pipeline picks it up
- Pipeline reads the tag, strips the `v` prefix → `versionName = "1.1.8"`
- Pipeline bumps `versionCode` from 15 → 16 (auto-increment by fastlane)
- Build and upload happen with these values
- Fastlane commits the versionCode bump back to the repo: `"ci: bump versionCode to 16 [skip ci]"`

**You never tag the current version and expect the pipeline to bump both.** The tag defines `versionName` ("what users see"). The pipeline increments `versionCode` automatically ("is this newer than the last build") and commits it back. Both are fully automated — no CI prompts for patch/minor/major, no manual versionCode management.

#### How versionCode is handled

**Production releases:** fastlane's `increment_version_code` reads the current value from `build.gradle`, adds 1, then `commit_version_bump` + `push_to_git_remote` commits it back. Each release gets the next sequential integer: 16, 17, 18, …

**Internal testing / pre-release tags:** Uses `$CI_PIPELINE_ID` as versionCode (always unique, always increasing). No commit-back needed for pre-release builds.

| Release type         | versionCode source           | Committed back? | Example versionCode |
|---------------------|------------------------------|-----------------|---------------------|
| Production (`vX.Y.Z`) | `increment_version_code` (sequential) | Yes (auto-commit) | 16 → 17 → 18 |
| Pre-release (`v*-alpha*`) | `$CI_PIPELINE_ID` (unique, always up) | No | 50231 → 50298 → 50362 |

#### How versionName flows

```
git tag v1.1.8  ──→  CI strips "v"  ──→  VERSION_NAME="1.1.8"  ──→  Gradle property  ──→  Play Store listing
```

#### Step-by-step: what happens when you push a production tag

1. **You** decide to release patch `1.1.8` from current `1.1.7`:
   ```bash
   git checkout master && git pull
   git tag v1.1.8
   git push origin v1.1.8
   ```

2. **Pipeline** triggers, does:
   - Verifies tag is on `master` ← guard
   - `VERSION_NAME="1.1.8"` ← from tag
   - fastlane reads `versionCode 15` from `build.gradle`, bumps to 16
   - Builds AAB: versionName="1.1.8", versionCode=16
   - Uploads to Play Store Production
   - Commits versionCode bump: `git commit -m "ci: bump versionCode to 16 [skip ci]"` and pushes

3. **Result:** Play Store has versionCode=16, versionName="1.1.8". Repo has versionCode=16 in `build.gradle`. Tag `v1.1.8` is permanent in git history.

#### Source of truth

| Value        | Source of truth          | Updated by                         |
|-------------|--------------------------|------------------------------------|
| versionName  | Git tag                  | Developer (when creating the tag)  |
| versionCode  | `android/app/build.gradle` | fastlane (auto-incremented and committed back) |
| app version  | Git tag                  | `package.json` version is unrelated (web layer) |

### Signing strategy

- Google Play uses **Play App Signing** — the upload key (`upload-keystore.jks`) signs the AAB, Google re-signs with the app signing key before distribution
- The app signing key (`bittasker-release-key.jks`) is used for Zapstore APK distribution only
- In CI, `keystore.properties` is **generated at runtime** from GitLab CI Variables (never checked in)

### CI runner image

**Option A (immediate): Install Ruby in `before_script`**

Use `reactnativecommunity/react-native-android` Docker image on the self-hosted runner (includes Node.js 22, JDK 17, Android SDK 36 — everything needed for Capacitor Android builds). Install Ruby in `before_script` for fastlane.

```yaml
image: reactnativecommunity/react-native-android:latest
before_script:
  - apt-get update && apt-get install -y --no-install-recommends ruby-full ruby-dev build-essential
  - gem install bundler -v '~>2.5'
  - bundle install
```

This adds ~1.5–2.5 minutes per pipeline run for Ruby + gem installation. Acceptable for infrequent releases (a few per week).

**Option B (future optimization): Custom Docker image**

When release frequency increases, build a custom image once and push to GitLab Container Registry. This eliminates the per-run Ruby install entirely.

Create a `Dockerfile.ci` at project root:

```dockerfile
FROM reactnativecommunity/react-native-android:latest

RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends ruby-full ruby-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN gem install bundler -v '~>2.5' --no-document

# Pre-install fastlane gems so bundle install is instant in CI
COPY Gemfile Gemfile.lock* ./
RUN bundle install --quiet
```

Build and push to GitLab Container Registry:

```bash
docker build -f Dockerfile.ci -t registry.gitlab.com/bittasker/bittasker/android-ci:latest .
docker push registry.gitlab.com/bittasker/bittasker/android-ci:latest
```

Then in `.gitlab-ci.yml`:

```yaml
image: registry.gitlab.com/bittasker/bittasker/android-ci:latest
# No Ruby install needed — already in the image
before_script:
  - bundle install --quiet  # Only installs new gems if Gemfile changed
```

**When to switch:** Option A is fine for the current release cadence. Switch to Option B when:
- You cut releases more than 2-3 times per week
- The 2-minute Ruby install becomes noticeable in the pipeline duration
- You want faster feedback on internal testing builds

A CI job can be added to rebuild this image automatically when `Gemfile` changes:

```yaml
build-android-ci-image:
  image: docker:latest
  stage: build-android
  script:
    - docker build -f Dockerfile.ci -t $CI_REGISTRY_IMAGE/android-ci:$CI_COMMIT_SHORT_SHA .
    - docker push $CI_REGISTRY_IMAGE/android-ci:$CI_COMMIT_SHORT_SHA
  rules:
    - if: $CI_COMMIT_BRANCH == "master"
      changes:
        - Gemfile
        - Gemfile.lock
        - Dockerfile.ci
```

---

## Prerequisites (Manual Setup — Done Once)

### 1. Google Cloud Service Account

1. Open [Google Cloud Console](https://console.cloud.google.com) — ensure the project linked to your Play Console is selected
   - To verify: Play Console → Settings → Developer account → Account details → "Google Cloud Project ID"
2. Enable the [Google Play Android Developer API](https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/)
3. Go to [IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. Create a new service account named `fastlane-supply`, assign the **Editor** role
5. Create a JSON key for the service account → download as `play-store-credentials.json`
6. In Google Play Console → Users and Permissions → Invite the service account email with these permissions:
   - **View app information**
   - **Manage production releases**
   - **Manage testing tracks** (internal, alpha)

### 2. GitLab CI Variables

In GitLab → Settings → CI/CD → Variables, add:

| Variable                          | Type     | Protected | Masked          | Value                                                        |
| --------------------------------- | -------- | --------- | --------------- | ------------------------------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`         | Variable | Yes       | Yes             | Base64-encoded `upload-keystore.jks` (see below)             |
| `ANDROID_KEYSTORE_STORE_PASSWORD` | Variable | Yes       | Yes             | Upload keystore password                                     |
| `ANDROID_KEYSTORE_KEY_ALIAS`      | Variable | Yes       | Yes             | `upload`                                                     |
| `ANDROID_KEYSTORE_KEY_PASSWORD`   | Variable | Yes       | Yes             | Upload keystore password                                     |
| `PLAY_STORE_CREDENTIALS_JSON`     | Variable | Yes       | No (multi-line) | Full content of `play-store-credentials.json`                |

**Why base64?** GitLab "File" type variables aren't available in all setups. The `.jks` keystore is a binary file — it can't be pasted as a raw string variable. Base64 encoding converts it to a text string that fits in a regular "Variable" type entry. Decoded back to binary in CI:

```bash
# On your machine (one-time):
base64 -i android/upload-keystore.jks | pbcopy  # macOS
base64 android/upload-keystore.jks | xclip       # Linux
# Paste into GitLab CI Variable ANDROID_KEYSTORE_BASE64

# In CI before_script (automatic):
echo "${ANDROID_KEYSTORE_BASE64}" | base64 -d > android/upload-keystore.jks
rm -f android/upload-keystore.jks  # cleaned up in after_script
```

A `.jks` file is ~2-3KB → ~3-4KB base64, well within GitLab's 10,000-character variable limit.

### 3. Upload Keystore as Base64 Variable

Since GitLab "File" type CI variables may not be available, the keystore binary is stored as a base64-encoded string variable:

```bash
# On your machine (one-time):
base64 -i android/upload-keystore.jks | pbcopy  # macOS (copies to clipboard)
# Paste into GitLab CI Variable ANDROID_KEYSTORE_BASE64
```

The CI job decodes it back at runtime and cleans up afterwards — the decoded file never leaves the job container.

### 4. Self-Hosted Runner Readiness

The runner must be able to pull `reactnativecommunity/react-native-android` from Docker Hub. Verify:

```bash
docker pull reactnativecommunity/react-native-android:latest
```

---

## Security Hardening

### Immediate actions (before pipeline goes live)

1. **Purge `.jks` files from git history**:

   ```bash
   git filter-repo --path android/upload-keystore.jks \
                   --path android/app/bittasker-release-key.jks \
                   --invert-paths
   ```

   Coordinate this with all contributors (requires re-cloning after rewrite).

2. **Move keystore passwords out of `keystore.properties`**:
   Replace the local `android/keystore.properties` with a template:

   ```properties
   storeFile=upload-keystore.jks
   storePassword=REPLACE_WITH_CI_VARIABLE
   keyAlias=upload
   keyPassword=REPLACE_WITH_CI_VARIABLE
   ```

   The real values only live in GitLab CI Variables (already `.gitignore`d).

3. **Consider rotating the upload key** if the plaintext password exposure is a concern.
   Google Play allows resetting the upload key: Play Console → Setup → App integrity → App signing → Request upload key reset.

---

## Implementation Steps

### Step 1: Add fastlane to the project

Create these files at project root:

**`Gemfile`**:

```ruby
source "https://rubygems.org"
gem "fastlane", "~> 2.228"
```

**`fastlane/Appfile`**:

```ruby
json_key_file("fastlane/play-store-credentials.json")
package_name("com.bittasker.app")
```

**`fastlane/Fastfile`**:

```ruby
default_platform(:android)

platform :android do
  # Builds signed AAB and uploads to Internal Testing track
  # Trigger: v*-alpha* or v*-beta* tag on master
  # versionCode = $CI_PIPELINE_ID (always unique, always increasing — no commit-back needed)
  # versionName = from tag (e.g., v1.1.8-alpha.1 → "1.1.8-alpha.1")
  desc "Build and upload to Internal Testing"
  lane :internal do
    ensure_git_status_clean unless is_ci?

    # Build web + sync + build AAB
    sh("npm", "ci") if is_ci?
    sh("npm", "run", "build")
    sh("npx", "cap", "sync", "android")

    gradle(
      task: "bundle",
      build_type: "Release",
      project_dir: "android/",
      print_command: true
    )

    # Upload to Internal Testing
    upload_to_play_store(
      track: "internal",
      release_status: "completed",
      skip_upload_apk: true,
      skip_upload_metadata: true,
      skip_upload_screenshots: true,
      skip_upload_images: true
    )
  end

  # Builds signed AAB and uploads to Production
  # Trigger: vX.Y.Z tag on master (manual gate in CI)
  # versionName = from tag (e.g., v1.1.8 → "1.1.8")
  # versionCode = auto-incremented from build.gradle and committed back
  desc "Build and upload to Production"
  lane :production do
    ensure_git_status_clean unless is_ci?

    # Bump versionCode in build.gradle (reads current value, adds 1)
    increment_version_code(
      gradle_file_path: "android/app/build.gradle"
    )

    sh("npm", "ci") if is_ci?
    sh("npm", "run", "build")
    sh("npx", "cap", "sync", "android")

    gradle(
      task: "bundle",
      build_type: "Release",
      project_dir: "android/",
      print_command: true
    )

    upload_to_play_store(
      track: "production",
      release_status: "completed",
      skip_upload_apk: true,
      skip_upload_metadata: true,
      skip_upload_screenshots: true,
      skip_upload_images: true
    )

    # Commit the versionCode bump back to the repo so the next release
    # reads the correct value. [skip ci] prevents a recursive pipeline.
    commit_version_bump(
      message: "ci: bump versionCode to #{lane_context[SharedValues::VERSION_CODE]} [skip ci]",
      force: true
    )
    push_to_git_remote
  end

  # Builds signed AAB and uploads to Closed Testing track
  # Trigger: v*-rc* tag on master
  desc "Build and upload to Closed Testing"
  lane :closed_testing do
    ensure_git_status_clean unless is_ci?

    sh("npm", "ci") if is_ci?
    sh("npm", "run", "build")
    sh("npx", "cap", "sync", "android")

    gradle(
      task: "bundle",
      build_type: "Release",
      project_dir: "android/",
      print_command: true
    )

    upload_to_play_store(
      track: "internal",
      release_status: "completed",
      skip_upload_apk: true,
      skip_upload_metadata: true,
      skip_upload_screenshots: true,
      skip_upload_images: true
    )
  end

  # Promote internal release to closed testing
  desc "Promote internal to closed testing"
  lane :promote_to_closed do
    upload_to_play_store(
      track: "internal",
      track_promote_to: "closed",
      track_promote_release_status: "completed"
    )
  end

  # Promote closed testing to production (no rebuild)
  desc "Promote closed testing to production"
  lane :promote_to_production do
    upload_to_play_store(
      track: "closed",
      track_promote_to: "production",
      track_promote_release_status: "completed"
    )
  end

  # Metadata-only update
  desc "Update store listing metadata only"
  lane :update_metadata do
    upload_to_play_store(
      track: "internal",
      skip_upload_aab: true,
      skip_upload_apk: true,
      metadata_path: "fastlane/metadata/android"
    )
  end
end
```

**`fastlane/.gitignore`**:

```
play-store-credentials.json
```

**`.gitignore` additions** (at project root):

```
fastlane/play-store-credentials.json
```

### Step 2: Modify `android/app/build.gradle` for CI version injection

Replace hardcoded versionCode/versionName with environment-variable fallbacks:

```groovy
defaultConfig {
    applicationId "com.bittasker.app"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode System.getenv("VERSION_CODE")?.toInteger() ?: 15
    versionName System.getenv("VERSION_NAME") ?: "1.1.7"
    // ... rest unchanged
}
```

**How this works:**

| Scenario                                        | versionCode source                                    | versionName source              |
| ------------------------------------------------| ------------------------------------------------------| ------------------------------- |
| **Local build** (dev machine)                   | Fallback value in `build.gradle`                      | Fallback value in `build.gradle` |
| **CI internal testing** (`v*-alpha*` tag)       | `$CI_PIPELINE_ID` (env var)                           | From git tag                    |
| **CI production** (`vX.Y.Z` tag)               | `increment_version_code` reads from file, bumps +1    | From git tag                    |

- **Local builds**: env vars are not set → fallbacks used. `versionCode 15`, `versionName "1.1.7"` for local testing.
- **CI internal testing**: `VERSION_CODE=$CI_PIPELINE_ID` and `VERSION_NAME` from tag. No repo modifications.
- **CI production**: fastlane's `increment_version_code` reads from `build.gradle`, bumps it, and `commit_version_bump` commits it back. The fallback values are automatically updated by the commit-back.

The fallback values in build.gradle are updated by fastlane's auto-commit after each production release — no manual updates needed.

### Step 3: Add Gradle caching to `.gitlab-ci.yml`

```yaml
cache:
  - key:
      files:
        - android/build.gradle
        - android/app/build.gradle
        - android/variables.gradle
    paths:
      - .gradle/caches/
    policy: pull-push
  - key:
      files:
        - android/gradle/wrapper/gradle-wrapper.properties
    paths:
      - .gradle/wrapper/
    policy: pull-push
```

### Step 4: Add Android build and deploy stages to `.gitlab-ci.yml`

Add these to the existing stages:

```yaml
stages:
  - validate
  - build-android # new
  - deploy
  - deploy-android # new
```

Add these jobs:

```yaml
# ─── Android: Internal Testing (v*-alpha* or v*-beta* tag on master) ────────
# Uses $CI_PIPELINE_ID as versionCode (always unique, always increasing).
# versionName from tag (auto, no manual gate).
android-build-internal:
  stage: build-android
  image: reactnativecommunity/react-native-android:latest
  tags:
    - self-hosted
  variables:
    VERSION_CODE: $CI_PIPELINE_ID
  before_script:
    - export VERSION_NAME="${CI_COMMIT_TAG#v}"
    - echo "Internal testing build: versionName=$VERSION_NAME versionCode=$VERSION_CODE"
    - apt-get update -qq && apt-get install -y -qq --no-install-recommends ruby-full ruby-dev build-essential
    - gem install bundler -v '~>2.5' --no-document
    - bundle install --quiet
    # Generate keystore.properties from CI variables
    - |
      cat > android/keystore.properties << EOF
      storeFile=${ANDROID_KEYSTORE_STORE_FILE}
      storePassword=${ANDROID_KEYSTORE_STORE_PASSWORD}
      keyAlias=${ANDROID_KEYSTORE_KEY_ALIAS}
      keyPassword=${ANDROID_KEYSTORE_KEY_PASSWORD}
      EOF
    # Write service account credentials from CI variable
    - echo "${PLAY_STORE_CREDENTIALS_JSON}" > fastlane/play-store-credentials.json
  script:
    - bundle exec fastlane android internal
  artifacts:
    paths:
      - android/app/build/outputs/bundle/release/
    expire_in: 7 days
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+-(alpha|beta)/
  environment:
    name: internal-testing

# ─── Android: Production release (manual gate, tag vX.Y.Z on master only) ──
# versionCode is auto-incremented by fastlane (increment_version_code) and
# committed back to the repo. versionName comes from the git tag.
# Enforces that the tag is an ancestor of master before building.
android-release-production:
  stage: deploy-android
  image: reactnativecommunity/react-native-android:latest
  tags:
    - self-hosted
  before_script:
    # ── Guard: tag must be on master ───────────────────────────────────────
    - |
      if ! git merge-base --is-ancestor "$CI_COMMIT_TAG" origin/master; then
        echo "ERROR: Tag $CI_COMMIT_TAG is not on master. Production releases must be tagged from master."
        exit 1
      fi
    # ── versionName from tag ────────────────────────────────────────────────
    - export VERSION_NAME="${CI_COMMIT_TAG#v}"
    - echo "Production release: versionName=$VERSION_NAME (versionCode auto-incremented by fastlane)"
    # ── Install Ruby + fastlane ─────────────────────────────────────────────
    - apt-get update -qq && apt-get install -y -qq --no-install-recommends ruby-full ruby-dev build-essential
    - gem install bundler -v '~>2.5' --no-document
    - bundle install --quiet
    # ── Generate signing config from CI variables ───────────────────────────
    - |
      cat > android/keystore.properties << EOF
      storeFile=${ANDROID_KEYSTORE_STORE_FILE}
      storePassword=${ANDROID_KEYSTORE_STORE_PASSWORD}
      keyAlias=${ANDROID_KEYSTORE_KEY_ALIAS}
      keyPassword=${ANDROID_KEYSTORE_KEY_PASSWORD}
      EOF
    # ── Write Play Store credentials ────────────────────────────────────────
    - echo "${PLAY_STORE_CREDENTIALS_JSON}" > fastlane/play-store-credentials.json
  script:
    - bundle exec fastlane android production
  artifacts:
    paths:
      - android/app/build/outputs/bundle/release/
    expire_in: 30 days
  when: manual
  allow_failure: false
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
  environment:
    name: production
    url: https://play.google.com/store/apps/details?id=com.bittasker.app
```

### Step 5: Pull store metadata (one-time)

On a developer machine with fastlane installed:

```bash
bundle exec fastlane supply init
```

This downloads existing Play Store metadata into `fastlane/metadata/android/`. Commit the metadata directory (but NOT the credentials file).

---

## Release Process (How to Cut a Release)

### Quick reference

| What you want to do                | Command                                          | Track           | Gate   |
| ---------------------------------- | ------------------------------------------------ | --------------- | ------ |
| Internal testing build             | `git tag v1.2.0-alpha.1 && git push origin v1.2.0-alpha.1` | Internal testing | Auto   |
| Release candidate for wider test   | `git tag v1.2.0-rc.1 && git push origin v1.2.0-rc.1`     | Closed testing   | Auto   |
| Production release                 | `git tag v1.2.0 && git push origin v1.2.0`               | Production       | Manual |

**All tags must be on `master`**. The pipeline automatically rejects tags on any other branch.

### Tag naming convention

| Tag pattern           | Example            | Track             | versionCode source     |
|-----------------------|--------------------|--------------------|------------------------|
| `vX.Y.Z-alpha.N`      | `v1.2.0-alpha.1`   | Internal testing   | `$CI_PIPELINE_ID`     |
| `vX.Y.Z-beta.N`       | `v1.2.0-beta.1`    | Internal testing   | `$CI_PIPELINE_ID`     |
| `vX.Y.Z-rc.N`         | `v1.2.0-rc.1`      | Closed testing     | `$CI_PIPELINE_ID`     |
| `vX.Y.Z` (no suffix)  | `v1.2.0`           | Production         | `increment_version_code` (sequential, committed back) |

**You tag the version you WANT to release, not the current version.** If the app is currently at `1.1.7` on the Play Store:
- **Tag `v1.1.8`** ← correct (the new version)
- ~~Tag `v1.1.7`~~ ← wrong (already released)

The tag IS the versionName declaration. The pipeline DOES NOT ask you for a bump type (patch/minor/major) — you decide the version before tagging. If you want patch 1.1.7 → 1.1.8, tag `v1.1.8`. If you want minor bump, tag `v1.2.0`. If you want major, tag `v2.0.0`. The tag is the decision.

### Internal testing (auto, pre-release tag on master)

For quick validation before wider testing:

```bash
git checkout master
git pull origin master
git tag v1.2.0-alpha.1
git push origin v1.2.0-alpha.1
```

The pipeline uploads to Internal Testing automatically (no manual gate). versionCode uses `$CI_PIPELINE_ID`. versionName = `"1.2.0-alpha.1"`.

### Production release (manual gate, tag on master)

**Worked example: releasing v1.2.0 when current Play Store version is 1.1.7**

1. Ensure the release-ready commit is on `master`:
   ```bash
   git checkout master
   git pull origin master
   git merge dev --ff-only   # or via MR
   git push origin master
   ```

2. Create and push a production tag **on master**:
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

3. What happens automatically:
   - CI verifies the tag is an ancestor of `master` → passes
   - CI sets `VERSION_NAME="1.2.0"` from the tag
   - `android-release-production` job appears with **manual gate** (play button icon)
   - Nothing is built or uploaded until you approve

4. When ready, click the **play button** on `android-release-production` in GitLab CI → Pipelines.

5. The job runs:
   - fastlane's `increment_version_code` bumps versionCode 15 → 16
   - `npm ci` → `npm run build` → `npx cap sync android` → Gradle AAB build
   - AAB is uploaded to Production track: versionName=`"1.2.0"`, versionCode=`16`
   - fastlane commits versionCode bump back: `"ci: bump versionCode to 16 [skip ci]"` and pushes

6. Google Play processes the release (typically 1-2 hours for established apps).

7. **End state:** Play Store has versionCode=`16`, versionName=`"1.2.0"`. Repo's `build.gradle` has `versionCode 16` (committed back by fastlane). Tag `v1.2.0` is permanent.

**The `[skip ci]` in the commit message prevents the version bump from triggering another pipeline.**

### What happens with unexpected tags

**Tag not on master?** Pipeline fails immediately:
```
ERROR: Tag v1.2.0 is not on master. Production releases must be tagged from master.
```
Fix: delete the tag, ensure master is up to date, re-tag from master.

**Wrong version tagged?** Delete the tag immediately:
```bash
git push origin --delete v1.2.0   # remove from remote
git tag -d v1.2.0                  # remove locally
```
The pipeline fires but the manual gate means nothing happens unless approved.

### Pre-release flow (alpha/beta/rc)

For pre-release validation before production:

```bash
# Internal testing (quick team dogfooding)
git checkout master
git tag v1.2.0-alpha.1
git push origin v1.2.0-alpha.1

# Fix issues, push another alpha
git tag v1.2.0-alpha.2
git push origin v1.2.0-alpha.2

# Ready for wider testing? Create release candidate
git tag v1.2.0-rc.1
git push origin v1.2.0-rc.1

# All good? Production release
git tag v1.2.0
git push origin v1.2.0
```

### Rollback

fastlane cannot "roll back" a published Play Store release. Options:
1. **Hotfix**: tag a new higher version (e.g., `v1.2.1`) with the fix — the higher `versionCode` (17) replaces the bad release (versionCode 16)
2. **Google Play Console**: manually promote a previous release in the Play Console UI
3. **For internal testing**: just push another pre-release tag — the previous internal build is automatically superseded by the higher `$CI_PIPELINE_ID`

---

## Testing & Validation

### Before going live

1. **Test the Docker image locally**:

   ```bash
   docker run -it reactnativecommunity/react-native-android:latest bash
   # Inside container: verify java -version, node -v, echo $ANDROID_HOME
   ```

2. **Test fastlane credentials locally**:

   ```bash
   bundle exec fastlane run validate_play_store_json_key json_key:"fastlane/play-store-credentials.json"
   ```

3. **Dry-run the pipeline**:

   - Push a pre-release tag to `master` (e.g., `v1.1.8-alpha.1`) and verify `android-build-internal` job succeeds
   - Check the Internal Testing track in Play Console for the uploaded AAB
   - Verify versionCode used `$CI_PIPELINE_ID` (not the increment pattern — that's only for production)

4. **Test the production tag flow**:
   - Push a non-semver production tag (e.g., `v1.1.7-test`) — it won't match the regex, so the pipeline won't fire
   - Push a semver tag (e.g., `v1.1.8`) and verify the manual gate appears
   - Verify the tag-on-master guard (try tagging from a branch)
   - Delete the test tags **without** clicking approve

5. **Test production with a real tag**:
   - Push a production tag → approve → verify the AAB appears in Play Console Production track
   - Verify `commit_version_bump` pushed a commit with `[skip ci]` to master

### Validation checklist

- [ ] Internal testing: push `v*-alpha*` tag → `android-build-internal` auto-deploys → AAB appears in Internal Testing track
- [ ] Production: push `vX.Y.Z` tag → manual gate appears → approve → AAB appears in Production track
- [ ] Tag-on-master guard: tag not on master → pipeline fails with clear error
- [ ] `increment_version_code` bumps versionCode correctly in `build.gradle`
- [ ] `commit_version_bump` commits and pushes back to repo with `[skip ci]`
- [ ] AAB is signed and accepted by Play Console
- [ ] `keystore.properties` is NOT committed to git
- [ ] `.jks` files are NOT committed to git
- [ ] `fastlane/play-store-credentials.json` is NOT committed

---

## Rollout Plan

### Phase 1: Setup (one developer, ~1 hour)

- [ ] Create GCP service account, download JSON key
- [ ] Add service account to Play Console permissions
- [ ] Add CI variables to GitLab
- [ ] Transfer upload keystore to CI runner or GitLab Secure Files
- [ ] Purge `.jks` files from git history (coordinate with team)

### Phase 2: Implementation (~2 hours)

- [ ] Add `Gemfile`, `fastlane/Appfile`, `fastlane/Fastfile`
- [ ] Modify `android/app/build.gradle` for CI version injection
- [ ] Update `.gitlab-ci.yml` with Android stages and jobs
- [ ] Run `fastlane supply init` and commit metadata

### Phase 3: Testing (~1 hour)

- [ ] Test internal testing pipeline by pushing a pre-release tag (`v1.1.8-alpha.1`) to `master`
- [ ] Verify upload appears in Play Console Internal Testing track
- [ ] Test production pipeline with a proper semver tag (`v1.1.8`) to `master`
- [ ] Verify manual gate appears, do NOT approve
- [ ] Verify tag-not-on-master guard (tag from a branch → should fail)
- [ ] Delete all test tags

### Phase 4: Production Go-Live (~30 minutes)

- [ ] Ensure release-ready code is on `master`
- [ ] Tag the first production release: `git tag v1.1.8 && git push origin v1.1.8`
- [ ] In GitLab CI, approve the `android-release-production` manual job
- [ ] Verify the release appears in Play Console Production track
- [ ] Verify `commit_version_bump` committed back to `master` with `[skip ci]`

---

## Appendix: Gradle Play Publisher Alternative

For teams that want to avoid the Ruby dependency entirely, the Gradle Play Publisher plugin is a simpler (though less maintained) option.

### Setup summary

**`android/build.gradle`** (root) — add to `buildscript.dependencies`:

```groovy
classpath 'com.github.triplet.play:com.github.triplet.play.gradle.plugin:3.13.0'
```

**`android/app/build.gradle`** — add plugin and config:

```groovy
plugins {
    id 'com.android.application'
    id 'com.github.triplet.play'
}

android {
    // ... existing config ...

    play {
        serviceAccountCredentials.set(file("play-service-account.json"))
        track.set("internal")
        defaultToAppBundles.set(true)
    }
}
```

**CI job** (no Ruby, no fastlane):

```yaml
android-publish:
  stage: deploy-android
  image: reactnativecommunity/react-native-android:latest
  script:
    - echo "${PLAY_STORE_CREDENTIALS_JSON}" > android/app/play-service-account.json
    - npm ci && npm run build && npx cap sync android
    - cd android && ./gradlew publishBundleRelease
    - rm -f app/play-service-account.json
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
```

### Trade-offs vs fastlane

| Factor          | GPP                                       | fastlane                         |
| --------------- | ----------------------------------------- | -------------------------------- |
| CI dependencies | JDK + Android SDK only                    | JDK + Android SDK + Ruby         |
| CI command      | One Gradle task                           | Two commands (gradle + fastlane) |
| Track promotion | Built-in `promoteArtifact`                | Re-upload or API script          |
| iOS support     | None                                      | Full                             |
| Maintenance     | Mode: "issues ignored, PRs accepted"      | Active (Google-maintained)       |
| Risk            | If abandoned, fork is viable (stable API) | Near-zero                        |

GPP is a solid choice for Android-only teams who prioritize CI simplicity. The maintenance-mode status is mitigated by the fact that it wraps a stable API (Google Play Developer API v3) and the 4.0.0 release (Jan 2026) demonstrates ongoing community contributions. For BitTasker specifically, if iOS automation is not planned within 6-12 months, GPP is a defensible choice.

---

## Maintenance & Troubleshooting

### Common failure modes

| Symptom                                 | Likely cause                          | Fix                                                                          |
| --------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| `versionCode X already exists`          | `increment_version_code` couldn't push back | Check CI push permissions; verify `build.gradle` versionCode matches last release; manually bump if needed |
| `ERROR: Tag vX.Y.Z is not on master`    | Tag created on wrong branch           | Move tag to master: `git checkout master && git pull && git tag vX.Y.Z && git push origin vX.Y.Z` |
| Pipeline not triggering for tag         | Tag doesn't match pattern             | Production: `v1.2.0` (three numbers, `v` prefix, no suffix). Internal: `v1.2.0-alpha.1` |
| `fastlane: command not found`           | Ruby/bundler not installed            | Verify `before_script` installs ruby-full and gem install bundler            |
| `Invalid JSON key`                      | Service account JSON is malformed     | Re-download JSON from GCP; verify CI variable isn't truncated                |
| `Keystore was tampered with`            | Wrong keystore or password            | Verify `keystore.properties` is generated correctly in CI                    |
| `Bundle was not signed`                 | Signing config not applied            | Check Gradle `signingConfigs.release` is assigned to `buildTypes.release`    |
| `ANDROID_HOME not set`                  | Android SDK not in Docker image       | Use `reactnativecommunity/react-native-android` image                        |
| `Google Play API quota exceeded`        | Too many API calls in short period    | Add retry with backoff; default quota is 200K queries/day                    |
| `push_to_git_remote` fails              | CI lacks push access to repo          | Ensure `CI_JOB_TOKEN` has write permissions or configure a deploy token      |
| versionCode in `build.gradle` is stale  | `commit_version_bump` didn't push     | Check if the pipeline had push access; manually update fallback value        |
| `base64: invalid input`                 | `ANDROID_KEYSTORE_BASE64` is corrupted or truncated | Re-encode: `base64 -i android/upload-keystore.jks` and verify no newlines were added |
| `Keystore was tampered with or password incorrect` | Base64 decoded incorrectly or wrong password | Verify base64 string is exactly as generated (no extra whitespace); verify password variables |

### Keeping the pipeline healthy

1. **Check fastlane version** every 3 months: `bundle outdated` — update the Gemfile pin if needed
2. **Check AGP compatibility** before upgrading Android Gradle Plugin: `fastlane supply` uses the Play Developer API directly and is independent of AGP version
3. **Test on dev first** — always let the `internal` track pipeline run on `dev` push before tagging for production
4. **Monitor CI runner disk** — Gradle caches grow over time. Periodically clear `~/.gradle/caches/` on the self-hosted runner (older than 30 days)
