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
| versionCode             | `android/app/build.gradle:17`                         | 14                                            |
| versionName             | `android/app/build.gradle:18`                         | "1.1.6"                                       |
| Self-hosted runner      | GitLab tags: `self-hosted`                            | Docker executor, runs `node:22-bookworm-slim` |

### Security issues to fix

1. **Plaintext keystore passwords** in `android/keystore.properties` — move to GitLab CI Variables
2. **`.jks` files in git history** — both `upload-keystore.jks` and `bittasker-release-key.jks` were committed before `.gitignore` rules were added; should be purged from history
3. **`google-services.json` tracked in git** — acceptable (Firebase API keys are bundle-ID-restricted), but worth noting

---

## Architecture Decision

### Pipeline trigger design

| Trigger                             | Track                | Stage                             |
| ----------------------------------- | -------------------- | --------------------------------- |
| Push to `dev` branch                | Internal testing     | `deploy-android`                  |
| Git tag `v*alpha*`                  | Alpha (closed track) | `deploy-android`                  |
| Git tag `vX.Y.Z` (no alpha/beta/rc) | Production           | `deploy-play-store` (manual gate) |

### Version management

- **versionName**: derived from git tag (e.g., tag `v1.2.0` → versionName `"1.2.0"`)
- **versionCode**: auto-incremented by fastlane's `increment_version_code` action (reads current from `build.gradle`, adds 1, writes back)
- Source of truth: git tags for versionName; `build.gradle` for versionCode
- `package.json` version is unrelated and remains `"0.0.1"` (web layer versioning is separate)

### Signing strategy

- Google Play uses **Play App Signing** — the upload key (`upload-keystore.jks`) signs the AAB, Google re-signs with the app signing key before distribution
- The app signing key (`bittasker-release-key.jks`) is used for Zapstore APK distribution only
- In CI, `keystore.properties` is **generated at runtime** from GitLab CI Variables (never checked in)

### CI runner image

Use `reactnativecommunity/react-native-android` Docker image on the self-hosted runner (includes Node.js 22, JDK 17, Android SDK 36 — everything needed for Capacitor Android builds). Install Ruby in `before_script` for fastlane.

```yaml
image: reactnativecommunity/react-native-android:latest
before_script:
  - apt-get update && apt-get install -y --no-install-recommends ruby-full ruby-dev build-essential
  - gem install bundler -v '~>2.5'
  - bundle install
```

Alternatively, build a custom image once and push to GitLab Container Registry to avoid the Ruby install on every pipeline run.

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

| Variable                          | Type     | Protected | Masked          | Value                                         |
| --------------------------------- | -------- | --------- | --------------- | --------------------------------------------- |
| `ANDROID_KEYSTORE_STORE_FILE`     | Variable | Yes       | No              | `upload-keystore.jks`                         |
| `ANDROID_KEYSTORE_STORE_PASSWORD` | Variable | Yes       | Yes             | Upload keystore password                      |
| `ANDROID_KEYSTORE_KEY_ALIAS`      | Variable | Yes       | Yes             | `upload`                                      |
| `ANDROID_KEYSTORE_KEY_PASSWORD`   | Variable | Yes       | Yes             | Upload keystore password                      |
| `PLAY_STORE_CREDENTIALS_JSON`     | Variable | Yes       | No (multi-line) | Full content of `play-store-credentials.json` |

### 3. Upload Keystore on CI Runner

Transfer `android/upload-keystore.jks` to the self-hosted runner at a fixed path (e.g., `/opt/secrets/bittasker/upload-keystore.jks`), or upload it as a [GitLab Secure File](https://docs.gitlab.com/ee/ci/secure_files/) and download it in `before_script`:

```yaml
before_script:
  - glab securefile download $UPLOAD_KEYSTORE_FILE_ID --path="android/upload-keystore.jks"
```

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
  desc "Build and upload to Internal Testing"
  lane :internal do
    ensure_git_status_clean unless is_ci?

    # Increment versionCode
    increment_version_code(
      gradle_file_path: "android/app/build.gradle"
    )

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
  desc "Build and upload to Production"
  lane :production do
    ensure_git_status_clean unless is_ci?

    version_name = ENV["VERSION_NAME"] || lane_context[SharedValues::VERSION_NAME]

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
      properties: {
        "versionName" => version_name
      },
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
  end

  # Promote internal release to alpha
  desc "Promote internal to alpha"
  lane :promote_to_alpha do
    upload_to_play_store(
      track: "internal",
      track_promote_to: "alpha",
      track_promote_release_status: "completed"
    )
  end

  # Promote alpha to production (no rebuild)
  desc "Promote alpha to production"
  lane :promote_to_production do
    upload_to_play_store(
      track: "alpha",
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
    versionCode System.getenv("VERSION_CODE")?.toInteger() ?: 14
    versionName System.getenv("VERSION_NAME") ?: "1.1.6"
    // ... rest unchanged
}
```

This lets fastlane's `increment_version_code` modify the file as the source of truth, while also allowing CI to override both values via environment variables.

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
# ─── Android: Build AAB for internal testing ───────────────────────────────
android-build-internal:
  stage: build-android
  image: reactnativecommunity/react-native-android:latest
  tags:
    - self-hosted
  before_script:
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
    - if: $CI_COMMIT_BRANCH == "dev"
  environment:
    name: internal-testing

# ─── Android: Production release (manual gate, tag-triggered) ──────────────
android-release-production:
  stage: deploy-android
  image: reactnativecommunity/react-native-android:latest
  tags:
    - self-hosted
  before_script:
    - apt-get update -qq && apt-get install -y -qq --no-install-recommends ruby-full ruby-dev build-essential
    - gem install bundler -v '~>2.5' --no-document
    - bundle install --quiet
    - |
      cat > android/keystore.properties << EOF
      storeFile=${ANDROID_KEYSTORE_STORE_FILE}
      storePassword=${ANDROID_KEYSTORE_STORE_PASSWORD}
      keyAlias=${ANDROID_KEYSTORE_KEY_ALIAS}
      keyPassword=${ANDROID_KEYSTORE_KEY_PASSWORD}
      EOF
    - echo "${PLAY_STORE_CREDENTIALS_JSON}" > fastlane/play-store-credentials.json
  script:
    - export VERSION_NAME="${CI_COMMIT_TAG#v}"
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

### Internal testing (automatic)

Push to `dev` → pipeline builds AAB and uploads to Internal Testing track automatically.

### Production release (manual gate)

1. Ensure `dev` branch is ready for release
2. Merge to `master` (or wherever production tags are cut from)
3. Create and push a git tag:
   ```bash
   git tag v1.1.7
   git push origin v1.1.7
   ```
4. In GitLab CI → Pipelines, the `android-release-production` job waits for **manual approval**
5. Click the play button to approve → AAB is built, signed with upload key, and uploaded to Production track
6. Google Play processes the release (typically 1-2 hours for review on established apps; new apps can take days)

### Rollback

If a bad release goes out, fastlane cannot "roll back" a published release. Instead, upload a new AAB with a higher versionCode (a hotfix). Google Play also allows promoting a previous version as a "replacement."

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

   - Push to `dev` branch and verify `android-build-internal` job succeeds
   - Check the Internal Testing track in Play Console for the uploaded AAB
   - Verify versionCode was incremented

4. **Test the production tag flow**:
   - Push a test tag (e.g., `v1.1.7-test1`) and verify the manual gate appears
   - Delete the test tag **without** clicking approve

### Validation checklist

- [ ] Internal testing upload works from `dev` push
- [ ] versionCode auto-increments correctly
- [ ] AAB is signed and accepted by Play Console
- [ ] Release notes appear in Play Console
- [ ] Manual gate appears for production tags
- [ ] Production upload works when approved
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

- [ ] Test internal testing pipeline by pushing to `dev`
- [ ] Verify upload appears in Play Console Internal Testing track
- [ ] Test production pipeline with a non-semver tag (e.g., `v1.1.7-test2`)
- [ ] Verify manual gate works, delete test tag

### Phase 4: Production Go-Live (~30 minutes)

- [ ] Merge implementation branch to `master`
- [ ] Tag the first production release: `git tag v1.1.7 && git push origin v1.1.7`
- [ ] Approve the `android-release-production` manual job in GitLab CI
- [ ] Verify the release appears in Play Console Production track

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

| Symptom                          | Likely cause                       | Fix                                                                          |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `versionCode 14 already exists`  | versionCode wasn't incremented     | Check `increment_version_code` ran; verify no other build uploaded same code |
| `Invalid JSON key`               | Service account JSON is malformed  | Re-download JSON from GCP; verify CI variable isn't truncated                |
| `Keystore was tampered with`     | Wrong keystore or password         | Verify `keystore.properties` is generated correctly in CI                    |
| `Bundle was not signed`          | Signing config not applied         | Check Gradle `signingConfigs.release` is assigned to `buildTypes.release`    |
| `fastlane: command not found`    | Ruby/bundler not installed         | Verify `before_script` installs ruby-full and gem install bundler            |
| `ANDROID_HOME not set`           | Android SDK not in Docker image    | Use `reactnativecommunity/react-native-android` image                        |
| `Google Play API quota exceeded` | Too many API calls in short period | Add retry with backoff; default quota is 200K queries/day                    |

### Keeping the pipeline healthy

1. **Check fastlane version** every 3 months: `bundle outdated` — update the Gemfile pin if needed
2. **Check AGP compatibility** before upgrading Android Gradle Plugin: `fastlane supply` uses the Play Developer API directly and is independent of AGP version
3. **Test on dev first** — always let the `internal` track pipeline run on `dev` push before tagging for production
4. **Monitor CI runner disk** — Gradle caches grow over time. Periodically clear `~/.gradle/caches/` on the self-hosted runner (older than 30 days)
