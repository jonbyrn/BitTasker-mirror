#!/bin/bash

# Create GitLab release for BitTasker v1.0.0

RELEASE_NOTES="## BitTasker v1.0.0

### Download
- Universal APK (arm64-v8a + armeabi-v7a): 24M

### Installation
1. Download the APK
2. Enable \"Install from unknown sources\" in Android settings
3. Install the APK
4. Or install via Zapstore for automatic updates

### Verification
- Package: com.bittasker.app
- Version: 1.0.0
- Signed with BitTasker release key

### Changes
See CHANGELOG.md for full details."

glab release create "v1.0.0" \
  --repo "bittasker/zapstore" \
  --name "BitTasker v1.0.0" \
  --notes "$RELEASE_NOTES" \
  dist/release/bittasker-v1.0.0-universal.apk