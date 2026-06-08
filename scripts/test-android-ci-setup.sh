#!/usr/bin/env bash
# Validates Android CI keystore paths, versionCode math, and bundler constraints.
set -euo pipefail

assert_eq() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL: $label" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    exit 1
  fi
  echo "OK: $label"
}

ANDROID_PIPELINE_OFFSET=2400000000

# Reproduces v1.1.8-alpha.4 pipeline from GitLab logs
pipeline_id=2579797005
version_code=$((pipeline_id - ANDROID_PIPELINE_OFFSET))
assert_eq "alpha.4 versionCode" "179797005" "$version_code"

# Reproduces v1.1.8-alpha.5 pipeline from GitLab logs
pipeline_id=2579907715
version_code=$((pipeline_id - ANDROID_PIPELINE_OFFSET))
assert_eq "alpha.5 versionCode" "179907715" "$version_code"

if ! grep -q 'keytool -list -storetype' .gitlab/ci/android-release.yml; then
  echo "FAIL: Play Store CI must validate keystore with keytool before Gradle" >&2
  exit 1
fi
echo "OK: Play Store CI validates keystore inline"

if ! grep -q 'load_ci_var' .gitlab/ci/android-release.yml; then
  echo "FAIL: android-release.yml must load secrets via load_ci_var" >&2
  exit 1
fi
echo "OK: android-release.yml loads secrets via API fallback"

if ! grep -q 'GOOGLE_APPLICATION_CREDENTIALS' .gitlab/ci/android-release.yml; then
  echo "FAIL: android-release.yml must export GOOGLE_APPLICATION_CREDENTIALS" >&2
  exit 1
fi
echo "OK: android-release.yml exports GOOGLE_APPLICATION_CREDENTIALS"

if ! grep -q 'def play_store_args' fastlane/Fastfile; then
  echo "FAIL: Fastfile must define play_store_args with json_key and package_name" >&2
  exit 1
fi
echo "OK: Fastfile defines play_store_args"

if ! grep -q 'package_name: PACKAGE_NAME' fastlane/Fastfile; then
  echo "FAIL: Fastfile must pass package_name to upload_to_play_store" >&2
  exit 1
fi
echo "OK: Fastfile passes package_name to upload_to_play_store"

if ! grep -q 'def validate_play_creds' fastlane/Fastfile; then
  echo "FAIL: Fastfile preflight must validate Play credentials via validate_play_creds" >&2
  exit 1
fi
echo "OK: Fastfile defines validate_play_creds for preflight"

if grep -q 'validate_only: true' fastlane/Fastfile; then
  echo "FAIL: Fastfile must not use supply validate_only in preflight (no artifacts to validate)" >&2
  exit 1
fi
echo "OK: Fastfile preflight does not use supply validate_only"

if ! grep -q 'PACKAGE_NAME = "com.bittasker.app"' fastlane/Fastfile; then
  echo "FAIL: Fastfile must define PACKAGE_NAME matching applicationId" >&2
  exit 1
fi
echo "OK: Fastfile defines PACKAGE_NAME"

if ! grep -q 'package_name("com.bittasker.app")' fastlane/Appfile; then
  echo "FAIL: Appfile must set package_name" >&2
  exit 1
fi
echo "OK: Appfile sets package_name"

if ! grep -q 'SUPPLY_PACKAGE_NAME' .gitlab/ci/android-release.yml; then
  echo "FAIL: android-release.yml must export SUPPLY_PACKAGE_NAME" >&2
  exit 1
fi
echo "OK: android-release.yml exports SUPPLY_PACKAGE_NAME"

if ! grep -q 'fastlane android preflight' .gitlab/ci/android-release.yml; then
  echo "FAIL: android-release.yml must run fastlane preflight before release lanes" >&2
  exit 1
fi
echo "OK: android-release.yml runs fastlane preflight"

if ! grep -q 'test:android:gitlab' package.json; then
  echo "FAIL: package.json must define test:android:gitlab for local pipeline runs" >&2
  exit 1
fi
echo "OK: package.json defines test:android:gitlab"

if ! grep -q 'CI_COMMIT_REF_PROTECTED' .gitlab/ci/fetch-ci-vars.yml; then
  echo "FAIL: fetch-ci-vars.yml must diagnose protected ref issues" >&2
  exit 1
fi
echo "OK: fetch-ci-vars.yml diagnoses protected ref issues"

json='{"key":"ANDROID_KEYSTORE_BASE64","value":"dGVzdA=="}'
parsed=$(printf '%s' "$json" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(d.value)")
assert_eq "GitLab variable JSON parse" "dGVzdA==" "$parsed"

if grep -q 'setup-android-keystore.sh' .gitlab/ci/android-release.yml; then
  echo "FAIL: android-release.yml must not call setup-android-keystore.sh" >&2
  exit 1
fi
echo "OK: Play Store CI has no external keystore script"

if grep -q 'cat > android/keystore.properties << EOF' .gitlab/ci/android-release.yml; then
  echo "FAIL: android-release.yml must not use indented heredoc for keystore.properties" >&2
  exit 1
fi
echo "OK: android-release.yml avoids heredoc keystore.properties"

if ! grep -q 'storeType' android/app/build.gradle; then
  echo "FAIL: build.gradle must read storeType from keystore.properties" >&2
  exit 1
fi
echo "OK: build.gradle supports storeType"

# Indented heredoc produces property keys Gradle cannot read (empty keyAlias in signReleaseBundle)
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
cat > "$tmpdir/bad.properties" << EOF
      storeFile=upload-keystore.jks
      keyAlias=upload
EOF
if grep -q '^storeFile=' "$tmpdir/bad.properties"; then
  echo "FAIL: heredoc indentation test setup is wrong" >&2
  exit 1
fi
echo "OK: indented heredoc breaks property keys (regression guard)"

printf '%s\n' \
  "storeFile=upload-keystore.jks" \
  "storeType=pkcs12" \
  "storePassword=secret" \
  "keyAlias=upload" \
  "keyPassword=secret" \
  > "$tmpdir/good.properties"
for key in storeFile storeType storePassword keyAlias keyPassword; do
  if ! grep -q "^${key}=" "$tmpdir/good.properties"; then
    echo "FAIL: printf keystore.properties missing key ${key}" >&2
    exit 1
  fi
done
echo "OK: printf keystore.properties format"

if ! grep -q 'keytool -list -storetype' .gitlab/ci/release-zapstore.yml; then
  echo "FAIL: Zapstore CI must validate keystore with keytool" >&2
  exit 1
fi
echo "OK: Zapstore CI validates keystore inline"

if ! grep -q 'pick_jdk21_home' android/gradlew; then
  echo "FAIL: gradlew must prefer JDK 21 on macOS" >&2
  exit 1
fi
echo "OK: gradlew prefers JDK 21 when JAVA_HOME unset or >23"

if ! grep -q 'Library/Android/sdk' android/gradlew; then
  echo "FAIL: gradlew must default ANDROID_HOME on macOS" >&2
  exit 1
fi
echo "OK: gradlew defaults ANDROID_HOME when unset"

if ! grep -q 'keystorePropertiesFile.exists()' android/app/build.gradle; then
  echo "FAIL: release signing must be conditional on keystore.properties" >&2
  exit 1
fi
echo "OK: release signing conditional on keystore.properties"

# Ephemeral PKCS12 keystore: same storeType path CI uses for non-JKS uploads
sign_tmp="$(mktemp -d)"
trap 'rm -rf "$tmpdir" "$sign_tmp"' EXIT
keytool -genkeypair -alias upload -keyalg RSA -keysize 2048 -validity 1 \
  -storetype PKCS12 -keystore "$sign_tmp/upload-keystore.jks" \
  -storepass testpass -keypass testpass \
  -dname "CN=BitTasker Test" >/dev/null 2>&1
magic=$(head -c 4 "$sign_tmp/upload-keystore.jks" | od -An -tx1 | tr -d ' \n')
if [ "$magic" = "feedfeed" ]; then store_type=jks; else store_type=pkcs12; fi
assert_eq "detected store type" "pkcs12" "$store_type"
keytool -list -storetype "$store_type" -keystore "$sign_tmp/upload-keystore.jks" \
  -storepass testpass -alias upload >/dev/null
echo "OK: ephemeral PKCS12 keystore validates with keytool"

if ! grep -q 'isCiBuild' android/app/build.gradle; then
  echo "FAIL: build.gradle must gate VERSION_* on CI" >&2
  exit 1
fi
echo "OK: VERSION_* required only in CI"

unset ANDROID_HOME
cd android
if ! ./gradlew bundleRelease -q >/dev/null 2>&1; then
  echo "FAIL: local bundleRelease must work without VERSION_* env" >&2
  exit 1
fi
echo "OK: local bundleRelease without VERSION_*"

if CI=true ./gradlew bundleRelease -q >/dev/null 2>&1; then
  echo "FAIL: CI bundleRelease must require VERSION_CODE" >&2
  exit 1
fi
echo "OK: CI bundleRelease rejects missing VERSION_CODE"

if ! ./gradlew assembleDebug -q >/dev/null 2>&1; then
  echo "FAIL: local assembleDebug must succeed" >&2
  exit 1
fi
echo "OK: local assembleDebug"
cd ..

# Bundler pin must stay on 2.x for Ruby 3.0 CI image
if [ -f .bundler-version ]; then
  bundler_pin="$(tr -d '[:space:]' < .bundler-version)"
  case "$bundler_pin" in
    2.*) echo "OK: .bundler-version is 2.x ($bundler_pin)" ;;
    *)
      echo "FAIL: .bundler-version must be 2.x for CI Ruby 3.0 (got $bundler_pin)" >&2
      exit 1
      ;;
  esac
fi

if ! grep -q "gem install bundler -v '~>2.5'" .gitlab/ci/android-release.yml; then
  echo "FAIL: .android-ci-setup must install bundler ~>2.5" >&2
  exit 1
fi
echo "OK: CI installs bundler ~>2.5"

if [ -f Gemfile.lock ] && ! awk '/^BUNDLED WITH/{getline; if ($1 ~ /^2\.5\./) found=1} END{exit !found}' Gemfile.lock; then
  echo "FAIL: Gemfile.lock must be bundled with 2.5.x" >&2
  exit 1
fi
echo "OK: Gemfile.lock bundled with 2.5.x (if present)"

if command -v npx >/dev/null 2>&1; then
  gcl_list="$(mktemp)"
  if npx gitlab-ci-local --variable CI_COMMIT_TAG=v9.9.9-alpha.0 --list >"$gcl_list" 2>&1 \
    && grep -q 'android-build-internal' "$gcl_list"; then
    echo "OK: gitlab-ci-local resolves android-build-internal with alpha tag"
  else
    echo "FAIL: gitlab-ci-local must list android-build-internal when CI_COMMIT_TAG matches v*-alpha*" >&2
    rm -f "$gcl_list"
    exit 1
  fi
  rm -f "$gcl_list"
else
  echo "SKIP: gitlab-ci-local (npx not available)"
fi

if command -v bundle >/dev/null 2>&1 && bundle exec fastlane --version >/dev/null 2>&1; then
  if ANDROID_SKIP_PLAY_UPLOAD=1 bundle exec fastlane android preflight 2>&1 | grep -q 'Play Store preflight OK'; then
    echo "OK: fastlane preflight lane (upload skipped)"
  else
    echo "FAIL: fastlane android preflight must succeed with ANDROID_SKIP_PLAY_UPLOAD=1" >&2
    exit 1
  fi
else
  echo "SKIP: fastlane preflight (bundle/fastlane not available)"
fi

echo ""
echo "All Android CI setup tests passed."
echo ""
echo "Local GitLab pipeline (same Docker image as CI):"
echo "  1. Create .gitlab-ci-local-variables.yml with ANDROID_KEYSTORE_* and PLAY_STORE_CREDENTIALS_JSON"
echo "  2. npm install"
echo "  3. npm run test:android:gitlab"
echo "Full upload test: omit ANDROID_SKIP_PLAY_UPLOAD in .gitlab-ci-local-variables.yml"
