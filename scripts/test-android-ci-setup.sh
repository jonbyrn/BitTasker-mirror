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

# storeFile in keystore.properties is resolved from android/app/ (see app/build.gradle)
if ! grep -q 'base64 -d > android/app/upload-keystore.jks' .gitlab/ci/android-release.yml; then
  echo "FAIL: Play Store CI must decode keystore into android/app/upload-keystore.jks" >&2
  exit 1
fi
echo "OK: CI writes upload keystore under android/app/"

if grep -q 'base64 -d > android/upload-keystore.jks' .gitlab/ci/android-release.yml; then
  echo "FAIL: CI must not write keystore to android/ root (Gradle expects android/app/)" >&2
  exit 1
fi
echo "OK: CI does not use stale android/ root keystore path"

if ! grep -q 'storeFile=upload-keystore.jks' .gitlab/ci/android-release.yml; then
  echo "FAIL: keystore.properties must use app-module-relative storeFile" >&2
  exit 1
fi
echo "OK: storeFile is app-module-relative filename"

if ! grep -q 'base64 -d > android/app/bittasker-release-key.jks' .gitlab/ci/release-zapstore.yml; then
  echo "FAIL: Zapstore keystore path regression" >&2
  exit 1
fi
echo "OK: Zapstore keystore path unchanged"

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

echo ""
echo "All Android CI setup tests passed."
